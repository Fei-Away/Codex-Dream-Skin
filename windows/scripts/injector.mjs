import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const assetsRoot = path.join(root, "assets");
const defaultThemePath = path.join(assetsRoot, "theme.json");
const stateRoot = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "CodexDreamSkin")
  : path.join(root, ".state");
const defaultThemeDir = path.join(stateRoot, "theme");
const imageTypes = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

function parseArgs(argv) {
  const options = {
    port: 9335,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    reload: false,
    themeDir: defaultThemeDir,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  return options;
}

function validateWebSocketUrl(value, port) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "ws:" &&
      Number(url.port) === port &&
      (host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1");
  } catch {
    return false;
  }
}

function cleanText(value, fallback, maxLength) {
  const next = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return next.length > maxLength ? next.slice(0, maxLength) : next;
}

function cleanHex(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function cleanCssColor(value, fallback) {
  return typeof value === "string" && value.length <= 80 ? value : fallback;
}

async function readJson(pathname) {
  return JSON.parse(await fs.readFile(pathname, "utf8"));
}

async function pathExists(pathname) {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

function mergeTheme(defaultTheme, userTheme = {}) {
  const defaultColors = defaultTheme.colors || {};
  const userColors = userTheme.colors || {};
  return {
    schemaVersion: 1,
    name: cleanText(userTheme.name, defaultTheme.name || "Codex Dream Skin", 80),
    brandSubtitle: cleanText(userTheme.brandSubtitle, defaultTheme.brandSubtitle || "CODEX DREAM SKIN", 80),
    tagline: cleanText(userTheme.tagline, defaultTheme.tagline || "Make something wonderful", 160),
    projectPrefix: cleanText(userTheme.projectPrefix, defaultTheme.projectPrefix || "选择项目 · ", 40),
    projectLabel: cleanText(userTheme.projectLabel, defaultTheme.projectLabel || "♡  选择项目", 40),
    statusText: cleanText(userTheme.statusText, defaultTheme.statusText || "DREAM SKIN ONLINE", 80),
    quote: cleanText(userTheme.quote, defaultTheme.quote || "Make something wonderful", 100),
    signature: cleanText(userTheme.signature, defaultTheme.signature || "Dream Skin ♡", 80),
    image: path.basename(cleanText(userTheme.image, defaultTheme.image || "dream-reference.png", 160)),
    colors: {
      background: cleanHex(userColors.background, cleanHex(defaultColors.background, "#fff3f9")),
      panel: cleanHex(userColors.panel, cleanHex(defaultColors.panel, "#ffffff")),
      panelAlt: cleanHex(userColors.panelAlt, cleanHex(defaultColors.panelAlt, "#fff7fb")),
      accent: cleanHex(userColors.accent, cleanHex(defaultColors.accent, "#b65cff")),
      accentAlt: cleanHex(userColors.accentAlt, cleanHex(defaultColors.accentAlt, "#cf61f0")),
      secondary: cleanHex(userColors.secondary, cleanHex(defaultColors.secondary, "#ff73bd")),
      highlight: cleanHex(userColors.highlight, cleanHex(defaultColors.highlight, "#8b3dce")),
      text: cleanHex(userColors.text, cleanHex(defaultColors.text, "#4c2364")),
      muted: cleanHex(userColors.muted, cleanHex(defaultColors.muted, "#9e58bd")),
      line: cleanCssColor(userColors.line, cleanCssColor(defaultColors.line, "rgba(221, 122, 184, .42)")),
    },
  };
}

async function loadTheme(themeDir) {
  const defaultTheme = await readJson(defaultThemePath);
  let theme = mergeTheme(defaultTheme);
  let imageBase = assetsRoot;
  const customThemePath = path.join(themeDir, "theme.json");

  if (await pathExists(customThemePath)) {
    theme = mergeTheme(defaultTheme, await readJson(customThemePath));
    imageBase = themeDir;
  }

  const extension = path.extname(theme.image).toLowerCase();
  if (!imageTypes.has(extension)) {
    throw new Error(`Unsupported theme image extension: ${extension || "(none)"}`);
  }

  let imagePath = path.join(imageBase, theme.image);
  if (!(await pathExists(imagePath))) {
    imagePath = path.join(assetsRoot, theme.image);
  }
  if (!(await pathExists(imagePath))) {
    imagePath = path.join(assetsRoot, defaultTheme.image || "dream-reference.png");
    theme.image = path.basename(imagePath);
  }

  const imageStat = await fs.stat(imagePath);
  if (!imageStat.isFile() || imageStat.size < 1 || imageStat.size > 16 * 1024 * 1024) {
    throw new Error("Theme image must be non-empty and no larger than 16 MB.");
  }

  return { theme, imagePath, mime: imageTypes.get(path.extname(imagePath).toLowerCase()) };
}

class CdpSession {
  constructor(target) {
    this.target = target;
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) waiter.reject(new Error("CDP socket closed"));
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
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value;
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
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const targets = await response.json();
      const pages = targets.filter((item) =>
        item.type === "page" &&
        typeof item.url === "string" &&
        item.url.startsWith("app://") &&
        validateWebSocketUrl(item.webSocketDebuggerUrl, port));
      if (pages.length) return pages;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No Codex renderer target on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
}

async function loadPayload(themeDir) {
  const [{ theme, imagePath, mime }, css, template] = await Promise.all([
    loadTheme(themeDir),
    fs.readFile(path.join(assetsRoot, "dream-skin.css"), "utf8"),
    fs.readFile(path.join(assetsRoot, "renderer-inject.js"), "utf8"),
  ]);
  const art = await fs.readFile(imagePath);
  const artDataUrl = `data:${mime};base64,${art.toString("base64")}`;
  return template
    .replace("__DREAM_CSS_JSON__", JSON.stringify(css))
    .replace("__DREAM_THEME_JSON__", JSON.stringify(theme))
    .replace("__DREAM_ART_JSON__", JSON.stringify(artDataUrl));
}

async function connectTarget(target, port) {
  if (!validateWebSocketUrl(target.webSocketDebuggerUrl, port)) {
    throw new Error(`Refusing non-loopback or mismatched CDP target: ${target.webSocketDebuggerUrl}`);
  }
  return new CdpSession(target).open();
}

async function probeCodexSession(session) {
  return session.evaluate(`(() => {
    const hasCodexShell = Boolean(
      document.querySelector('main.main-surface') ||
      document.querySelector('aside.app-shell-left-panel') ||
      document.querySelector('.composer-surface-chrome') ||
      document.querySelector('[role="main"]')
    );
    return {
      url: location.href,
      protocolOk: location.protocol === 'app:',
      hasCodexShell,
      title: document.title,
      ready: location.protocol === 'app:' && hasCodexShell,
    };
  })()`);
}

async function waitForCodexSession(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe;
  while (Date.now() < deadline) {
    lastProbe = await probeCodexSession(session);
    if (lastProbe.ready) return lastProbe;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Target is not a ready Codex renderer: ${JSON.stringify(lastProbe)}`);
}

async function applyToSession(session, payload) {
  return session.evaluate(payload);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    document.documentElement?.classList.remove('codex-dream-skin');
    document.documentElement?.style.removeProperty('--dream-art');
    for (const name of [
      '--dream-ink',
      '--dream-purple',
      '--dream-violet',
      '--dream-pink',
      '--dream-blush',
      '--dream-pearl',
      '--dream-line',
      '--dream-panel-alt',
      '--dream-accent-alt',
      '--dream-muted',
      '--dream-tagline-content',
      '--dream-project-prefix-content',
      '--dream-project-label-content',
    ]) document.documentElement?.style.removeProperty(name);
    document.getElementById('codex-dream-skin-style')?.remove();
    document.getElementById('codex-dream-skin-chrome')?.remove();
    return true;
  })()`);
}

async function verifySession(session) {
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const home = document.querySelector('.dream-home');
    const suggestions = home?.querySelector('.group\\\\/home-suggestions') ?? null;
    const cards = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const state = window.__CODEX_DREAM_SKIN_STATE__ ?? {};
    const result = {
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      version: state.version ?? null,
      themeName: state.themeName ?? null,
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      chromePresent: Boolean(document.getElementById('codex-dream-skin-chrome')),
      chromePointerEvents: getComputedStyle(document.getElementById('codex-dream-skin-chrome') || document.body).pointerEvents,
      homePresent: Boolean(home),
      suggestionsPresent: Boolean(suggestions),
      hero: box(home?.firstElementChild?.firstElementChild?.firstElementChild),
      cards,
      composer: box(document.querySelector('.composer-surface-chrome')),
      sidebar: box(document.querySelector('aside.app-shell-left-panel')),
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    result.pass = result.installed && result.stylePresent && result.chromePresent &&
      result.chromePointerEvents === 'none' && Boolean(result.composer) && Boolean(result.sidebar) &&
      (!result.homePresent || (Boolean(result.hero) &&
        (!result.suggestionsPresent || (result.cards.length >= 2 && result.cards.length <= 4))));
    return result;
  })()`);
}

async function waitForVerifiedSession(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  while (Date.now() < deadline) {
    lastResult = await verifySession(session);
    if (lastResult.pass) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastResult;
}

async function capture(session, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const viewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(viewport.width * 0.64),
    y: Math.round(viewport.height * 0.62),
    button: "none",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

async function runOneShot(options) {
  const targets = await waitForTargets(options.port, options.timeoutMs);
  const payload = (options.mode === "once" || options.reload) ? await loadPayload(options.themeDir) : null;
  const results = [];
  for (const target of targets) {
    const session = await connectTarget(target, options.port);
    try {
      await waitForCodexSession(session, Math.min(options.timeoutMs, 10000));
      if (options.mode === "remove") await removeFromSession(session);
      else if (options.mode === "once") await applyToSession(session, payload);
      if (options.mode === "once") {
        await new Promise((resolve) => setTimeout(resolve, 850));
      }
      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") await applyToSession(session, payload);
      }
      const verified = options.mode === "remove"
        ? await session.evaluate("!document.documentElement.classList.contains('codex-dream-skin')")
        : (options.reload || options.mode === "once")
          ? await waitForVerifiedSession(session, options.timeoutMs)
          : await verifySession(session);
      results.push({ targetId: target.id, title: target.title, url: target.url, result: verified });
      if (options.screenshot) await capture(session, options.screenshot);
    } finally {
      session.close();
    }
  }
  console.log(JSON.stringify({ mode: options.mode, port: options.port, targets: results }, null, 2));
  if (options.mode === "verify" && results.some((item) => !item.result.pass)) process.exitCode = 2;
}

async function runWatch(options) {
  const payload = await loadPayload(options.themeDir);
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
      console.error(`[dream-skin] ${new Date().toISOString()} ${error.message}`);
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
        const session = await connectTarget(target, options.port);
        await waitForCodexSession(session, 10000);
        session.on("Page.loadEventFired", () => {
          setTimeout(() => applyToSession(session, payload).catch((error) => {
            console.error(`[dream-skin] reinject failed: ${error.message}`);
          }), 250);
        });
        await applyToSession(session, payload);
        sessions.set(target.id, session);
        console.log(`[dream-skin] injected target ${target.id} (${target.title || target.url})`);
      } catch (error) {
        console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  for (const session of sessions.values()) session.close();
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "watch") await runWatch(options);
else await runOneShot(options);
