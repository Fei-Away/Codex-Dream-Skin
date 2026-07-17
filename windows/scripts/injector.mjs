import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const assetsRoot = path.join(root, "assets");
const manifestPath = path.join(assetsRoot, "miku-stage-theme.json");

function parseArgs(argv) {
  const options = {
    port: 9347,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    reload: false,
    tone: "dark",
    instanceToken: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--tone") options.tone = String(argv[++index]).toLowerCase();
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++index]);
    else if (arg === "--reload") options.reload = true;
    else if (arg === "--instance-token") options.instanceToken = String(argv[++index]);
    else throw new Error("Unknown argument: " + arg);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error("Invalid port: " + options.port);
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 120000) {
    throw new Error("Invalid timeout: " + options.timeoutMs + ". Expected 250-120000ms.");
  }
  if (!["dark", "light"].includes(options.tone)) {
    throw new Error("Invalid tone: " + options.tone + ". Expected dark or light.");
  }
  if (options.instanceToken && !/^[a-f0-9]{32}$/i.test(options.instanceToken)) {
    throw new Error("Invalid instance token.");
  }
  return options;
}

function resolveAsset(fileName) {
  if (typeof fileName !== "string" || !fileName.trim()) {
    throw new Error("Theme manifest contains an empty asset path.");
  }
  const resolved = path.resolve(assetsRoot, fileName);
  const prefix = assetsRoot.endsWith(path.sep) ? assetsRoot : assetsRoot + path.sep;
  if (!resolved.startsWith(prefix)) {
    throw new Error("Theme asset escapes the assets directory: " + fileName);
  }
  return resolved;
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) throw new Error("Unsupported theme manifest schema.");
  if (!Array.isArray(manifest.components) || manifest.components.length !== 14) {
    throw new Error("Miku Stage requires exactly 14 component contracts.");
  }
  const ids = new Set(manifest.components.map((item) => item.id));
  if (ids.size !== 14 || [...ids].some((id) => !/^\d{2}$/.test(id))) {
    throw new Error("Theme component IDs must be 14 unique two-digit values.");
  }
  if (!manifest.tokens?.dark || !manifest.tokens?.light) {
    throw new Error("Theme manifest must provide dark and light tokens.");
  }
}

class CdpSession {
  constructor(target, timeoutMs = 30000) {
    this.target = target;
    this.timeoutMs = timeoutMs;
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        this.ws.removeEventListener("open", onOpen);
        this.ws.removeEventListener("error", onError);
      };
      const onOpen = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = (event) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(event?.error ?? new Error("CDP socket failed to open"));
      };
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        try { this.ws.close(); } catch {}
        reject(new Error("CDP socket open timed out after " + this.timeoutMs + "ms"));
      }, this.timeoutMs);
      this.ws.addEventListener("open", onOpen, { once: true });
      this.ws.addEventListener("error", onError, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) {
        waiter.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  onMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) {
        waiter.reject(new Error(message.error.message + " (" + message.error.code + ")"));
      } else {
        waiter.resolve(message.result);
      }
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) {
      listener(message.params ?? {});
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}, timeoutMs = this.timeoutMs) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    const requestedTimeoutMs = Number.isFinite(timeoutMs) ? timeoutMs : this.timeoutMs;
    const commandTimeoutMs = Math.max(1, Math.min(this.timeoutMs, requestedTimeoutMs));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(new Error("CDP " + method + " timed out after " + commandTimeoutMs + "ms"));
      }, commandTimeoutMs);
      const settle = (callback) => (value) => {
        clearTimeout(timer);
        callback(value);
      };
      const waiter = {
        resolve: settle(resolve),
        reject: settle(reject)
      };
      this.pending.set(id, waiter);
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.delete(id);
        waiter.reject(error);
      }
    });
  }

  async evaluate(expression, timeoutMs = this.timeoutMs) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false
    }, timeoutMs);
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
      throw new Error("Renderer evaluation failed: " + detail);
    }
    return response.result?.value;
  }

  close() {
    if (!this.closed) this.ws.close();
    this.closed = true;
  }
}

async function waitForTargets(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    const requestController = new AbortController();
    const requestTimeoutMs = Math.max(1, Math.min(1000, deadline - Date.now()));
    const requestTimer = setTimeout(() => requestController.abort(), requestTimeoutMs);
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/list", {
        signal: requestController.signal
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const targets = await response.json();
      const pages = targets.filter((item) => (
        item.type === "page" &&
        typeof item.url === "string" &&
        item.url.startsWith("app://") &&
        typeof item.webSocketDebuggerUrl === "string" &&
        item.webSocketDebuggerUrl.startsWith("ws://127.0.0.1:")
      ));
      const primaryPages = pages.filter((item) => (
        !item.url.includes("initialRoute=%2Fchatgpt%2Fquick-chat-prewarm") &&
        !item.url.includes("initialRoute=/chatgpt/quick-chat-prewarm")
      ));
      if (primaryPages.length) return primaryPages;
      if (pages.length) return pages;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(requestTimer);
    }
    const retryDelayMs = Math.min(350, Math.max(0, deadline - Date.now()));
    if (retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error(
    "No Codex renderer target on 127.0.0.1:" + port + ": " +
    (lastError?.message ?? "timed out")
  );
}

async function loadPayload(tone) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  validateManifest(manifest);
  const cssPath = resolveAsset(manifest.stylesheet);
  const artPath = resolveAsset(manifest.art);
  const [css, template, art] = await Promise.all([
    fs.readFile(cssPath, "utf8"),
    fs.readFile(path.join(assetsRoot, "renderer-inject.js"), "utf8"),
    fs.readFile(artPath)
  ]);
  const markers = [...css.matchAll(/\/\* \[(\d{2})\]/g)].map((match) => match[1]);
  if (new Set(markers).size !== 14) {
    throw new Error("Stylesheet must expose 14 unique component section markers.");
  }
  const artDataUrl = "data:image/png;base64," + art.toString("base64");
  const payload = template
    .replace("__MIKU_CSS_JSON__", JSON.stringify(css))
    .replace("__MIKU_ART_JSON__", JSON.stringify(artDataUrl))
    .replace("__MIKU_MANIFEST_JSON__", JSON.stringify(manifest))
    .replace("__MIKU_TONE_JSON__", JSON.stringify(tone));
  if (/__MIKU_[A-Z_]+__/.test(payload)) {
    throw new Error("Renderer payload still contains an unresolved placeholder.");
  }
  return payload;
}

async function connectTarget(target, timeoutMs) {
  return new CdpSession(target, timeoutMs).open();
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_MIKU_SKIN_DISABLED__ = true;
    const state = window.__CODEX_MIKU_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    const root = document.documentElement;
    root?.classList.remove("codex-miku-skin");
    root?.removeAttribute("data-miku-tone");
    root?.style.removeProperty("--miku-art");
    document.getElementById("codex-miku-skin-style")?.remove();
    document.getElementById("codex-miku-skin-chrome")?.remove();
    return true;
  })()`);
}

async function verifySession(session, timeoutMs = session.timeoutMs) {
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    const isActuallyVisible = (node) => {
      if (!node?.isConnected || node.getClientRects().length === 0) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      for (let current = node; current instanceof Element; current = current.parentElement) {
        const computed = getComputedStyle(current);
        if (
          computed.display === "none" ||
          computed.visibility === "hidden" ||
          computed.visibility === "collapse" ||
          Number.parseFloat(computed.opacity) <= 0
        ) {
          return false;
        }
      }
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      if (centerX < 0 || centerY < 0 || centerX >= innerWidth || centerY >= innerHeight) {
        return false;
      }
      const centerOwner = document.elementFromPoint(centerX, centerY);
      return Boolean(centerOwner && (centerOwner === node || node.contains(centerOwner)));
    };
    const root = document.documentElement;
    const state = window.__CODEX_MIKU_SKIN_STATE__;
    const chrome = document.getElementById("codex-miku-skin-chrome");
    const style = document.getElementById("codex-miku-skin-style");
    const main = document.querySelector("main.main-surface") || document.querySelector("main");
    const nativeHome = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    const home = document.querySelector(".miku-home");
    const suggestions = home?.querySelector('[class~="group/home-suggestions"]') ?? null;
    const suggestionButtons = suggestions ? [...suggestions.querySelectorAll("button")] : [];
    const homeScenario = Boolean(nativeHome || home || suggestions);
    const visibleSuggestionCount = suggestionButtons.filter(isActuallyVisible).length;
    const sidebar = document.querySelector("aside.app-shell-left-panel") || document.querySelector("aside");
    const composer = main?.querySelector(".composer-surface-chrome") || null;
    const outputHost = document.querySelector('[data-pip-obstacle="thread-summary-panel"]');
    const changeSummary = document.querySelector('[class~="group/turn-diff-header"]');
    const diffPanel = document.querySelector(
      '[role="tabpanel"][data-app-shell-tab-panel-controller="right"][data-tab-id="diff"]'
    );
    const settingsSearch = sidebar?.querySelector('[role="searchbox"], input[type="search"]') || null;
    const quickChat = document.querySelector(
      '[role="dialog"][data-pip-obstacle="quick-chat"]'
    );
    const popover = document.querySelector('[role="menu"], [data-radix-popper-content-wrapper]');
    const terminal = document.querySelector('.xterm, [data-testid*="terminal" i]');
    const splitLauncher = document.querySelector('[data-testid*="launcher" i], [data-testid*="split" i]');
    const profile = main?.querySelector(
      '[role="img"][class*="--profile-usage-level"]'
    ) || null;
    const appearance = main?.querySelector('input[name="appearance-theme"]') || null;
    const pets = main?.querySelector('#pet-size, [data-testid*="pet" i]') || null;
    const stateControl = document.querySelector('[role="switch"], [role="tab"], [role="checkbox"]');
    const componentNodes = [...document.querySelectorAll('[data-miku-component]')];
    const matchedComponentIds = [...new Set(componentNodes.flatMap((node) => (
      node.getAttribute('data-miku-component') || ''
    ).split(' ').filter(Boolean)))].sort();
    const required = [];
    const requireComponent = (id, reason) => required.push({ id, reason });
    if (sidebar) requireComponent('01', 'native sidebar');
    if (composer) requireComponent('02', 'native composer');
    if (nativeHome) requireComponent('03', 'native home state');
    if (changeSummary || diffPanel) {
      requireComponent('04', 'native change summary or diff');
    }
    if (settingsSearch) requireComponent('05', 'settings shell');
    if (main?.querySelector('#plugins-page-search')) {
      requireComponent('06', 'plugins marketplace');
    }
    if (main?.querySelector('#scheduled-page-search')) {
      requireComponent('07', 'scheduled tasks');
    }
    if (quickChat) requireComponent('08', 'quick chat dialog');
    if (popover) requireComponent('09', 'native popover or menu');
    if (terminal || splitLauncher) requireComponent('10', 'terminal or split launcher');
    if (outputHost) requireComponent('11', 'thread summary output panel');
    if (profile) requireComponent('12', 'profile analytics');
    if (appearance || pets) requireComponent('13', 'appearance or pets');
    if (stateControl) requireComponent('14', 'native state controls');
    const requiredComponents = [...new Map(required.map((item) => [item.id, item])).values()];
    const missingRequiredComponents = requiredComponents.filter(
      (item) => !matchedComponentIds.includes(item.id)
    );
    const sidebarSeparatorMisclassified = Boolean(
      sidebar?.querySelector('[role="separator"][data-miku-component~="10"]')
    );
    const outputPanelMarked = !outputHost || Boolean(
      outputHost.matches('[data-miku-component~="11"]') ||
      outputHost.querySelector('[data-miku-component~="11"]')
    );
    const manifestComponentCount = state?.manifest?.components?.length ?? 0;
    const result = {
      installed: root.classList.contains("codex-miku-skin"),
      version: state?.version ?? null,
      tone: state?.tone ?? null,
      componentCount: manifestComponentCount,
      manifestComponentCount,
      matchedComponentCount: matchedComponentIds.length,
      matchedComponentIds,
      requiredComponents,
      missingRequiredComponents,
      sidebarSeparatorMisclassified,
      outputPanelMarked,
      stylePresent: Boolean(style),
      styleBytes: style?.textContent?.length ?? 0,
      chromePresent: Boolean(chrome),
      chromePointerEvents: chrome ? getComputedStyle(chrome).pointerEvents : null,
      artPresent: root.style.getPropertyValue("--miku-art").includes("blob:"),
      main: box(main),
      sidebar: box(sidebar),
      composer: box(composer),
      home: box(home),
      homeScenario,
      suggestionCount: suggestions ? suggestionButtons.length : null,
      visibleSuggestionCount: suggestions ? visibleSuggestionCount : null,
      diff: box(document.querySelector(".miku-diff-surface")),
      terminal: box(document.querySelector(".miku-terminal")),
      dialog: box(document.querySelector(".miku-dialog")),
      quickChat: box(quickChat),
      viewport: { width: innerWidth, height: innerHeight },
      horizontalOverflow: root.scrollWidth > root.clientWidth + 2
    };
    result.pass =
      result.installed &&
      result.manifestComponentCount === 14 &&
      result.missingRequiredComponents.length === 0 &&
      !result.sidebarSeparatorMisclassified &&
      result.outputPanelMarked &&
      result.stylePresent &&
      result.styleBytes > 5000 &&
      result.chromePresent &&
      result.chromePointerEvents === "none" &&
      result.artPresent &&
      Boolean(result.main) &&
      (!result.homeScenario || (
        result.suggestionCount === 4 &&
        result.visibleSuggestionCount === 4
      )) &&
      !result.horizontalOverflow;
    return result;
  })()`, timeoutMs);
}

async function waitForVerifiedSession(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  while (true) {
    const remainingBeforeVerify = deadline - Date.now();
    if (remainingBeforeVerify <= 0) break;
    lastResult = await verifySession(session, remainingBeforeVerify);
    if (lastResult.pass) return lastResult;
    const retryDelayMs = Math.min(500, Math.max(0, deadline - Date.now()));
    if (retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  return lastResult;
}

async function capture(session, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const response = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });
  await fs.writeFile(outputPath, Buffer.from(response.data, "base64"));
}

async function runOneShot(options) {
  const targets = await waitForTargets(options.port, options.timeoutMs);
  const shouldLoadPayload = options.mode === "once" || options.reload;
  const payload = shouldLoadPayload ? await loadPayload(options.tone) : null;
  const results = [];
  for (const target of targets) {
    const session = await connectTarget(target, options.timeoutMs);
    try {
      if (options.mode === "remove") {
        await removeFromSession(session);
      } else if (options.mode === "once") {
        await session.evaluate(payload);
        await new Promise((resolve) => setTimeout(resolve, 850));
      }
      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") await session.evaluate(payload);
      }
      const verified = options.mode === "remove"
        ? await session.evaluate("!document.documentElement.classList.contains('codex-miku-skin')")
        : await waitForVerifiedSession(session, options.timeoutMs);
      results.push({
        targetId: target.id,
        renderer: "app://",
        result: verified
      });
      if (options.screenshot) await capture(session, options.screenshot);
    } finally {
      session.close();
    }
  }
  console.log(JSON.stringify({
    mode: options.mode,
    port: options.port,
    tone: options.tone,
    targets: results
  }, null, 2));
  if (options.mode === "verify" && results.some((item) => !item.result.pass)) {
    process.exitCode = 2;
  }
}

async function runWatch(options) {
  const payload = await loadPayload(options.tone);
  const sessions = new Map();
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    let targets = [];
    try {
      targets = await waitForTargets(options.port, 2000);
    } catch (error) {
      console.error("[miku-skin] " + new Date().toISOString() + " " + error.message);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    const activeIds = new Set(targets.map((target) => target.id));
    for (const [id, session] of sessions) {
      if (!activeIds.has(id) || session.closed) {
        session.close();
        sessions.delete(id);
      }
    }

    for (const target of targets) {
      if (sessions.has(target.id)) continue;
      try {
        const session = await connectTarget(target, options.timeoutMs);
        session.on("Page.loadEventFired", () => {
          setTimeout(() => session.evaluate(payload).catch((error) => {
            console.error("[miku-skin] reinject failed: " + error.message);
          }), 250);
        });
        await session.evaluate(payload);
        sessions.set(target.id, session);
        console.log("[miku-skin] injected Codex renderer target " + target.id);
      } catch (error) {
        console.error("[miku-skin] inject failed for " + target.id + ": " + error.message);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  for (const session of sessions.values()) session.close();
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "watch") await runWatch(options);
else await runOneShot(options);
