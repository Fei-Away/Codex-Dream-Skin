import fs from "node:fs/promises";
import { constants as fsConstants, watch as watchFs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "./image-metadata.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const here = path.dirname(scriptPath);
const root = path.resolve(here, "..");
const SKIN_VERSION = "1.2.0";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CDP_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const MAX_ART_BYTES = 16 * 1024 * 1024;
let staticPayloadAssets = null;

function parseArgs(argv) {
  const options = {
    port: 9341,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    reload: false,
    themeDir: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--check-payload") options.mode = "check";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 120000) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  return options;
}

function validatedDebuggerUrl(target, port) {
  const url = new URL(target.webSocketDebuggerUrl);
  const pathIsValid = /^\/devtools\/page\/[A-Za-z0-9._-]{1,200}$/.test(url.pathname);
  if (
    url.protocol !== "ws:" || !LOOPBACK_HOSTS.has(url.hostname) || Number(url.port) !== port
    || url.username || url.password || url.search || url.hash || !pathIsValid
  ) {
    throw new Error("Rejected a CDP WebSocket URL outside the allowed loopback page endpoint shape");
  }
  return url.href;
}

function isValidCdpPageTarget(item, port) {
  if (
    item?.type !== "page" || !item.url?.startsWith("app://")
    || typeof item.id !== "string" || !CDP_ID_PATTERN.test(item.id)
    || !item.webSocketDebuggerUrl
  ) return false;
  try {
    const debuggerUrl = new URL(validatedDebuggerUrl(item, port));
    return debuggerUrl.pathname === `/devtools/page/${item.id}`;
  } catch {
    return false;
  }
}

class CdpSession {
  constructor(target, port) {
    this.target = target;
    this.ws = new WebSocket(validatedDebuggerUrl(target, port));
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { this.ws.close(); } catch {}
        reject(new Error("CDP WebSocket open timed out"));
      }, 5000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP WebSocket open failed")); }, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("error", () => this.close());
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timeout);
        waiter.reject(new Error("CDP socket closed"));
      }
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  onMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      this.close();
      return;
    }
    if (!message || typeof message !== "object") {
      this.close();
      return;
    }
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) {
      try { listener(message.params ?? {}); } catch (error) {
        console.error(`[dream-skin] CDP listener failed: ${error.message}`);
      }
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}, timeoutMs = 10000) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
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
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("CDP session closed"));
    }
    this.pending.clear();
    if (!this.closed) {
      try { this.ws.close(); } catch {}
    }
    this.closed = true;
  }
}

async function listAppTargets(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const targets = await response.json();
    if (!Array.isArray(targets)) throw new Error("CDP target list was not an array");
    return targets.filter((item) => isValidCdpPageTarget(item, port));
  } finally {
    clearTimeout(timeout);
  }
}

async function probeSession(session) {
  return session.evaluate(`(() => {
    const markers = {
      shell: Boolean(document.querySelector('main.main-surface')),
      sidebar: Boolean(document.querySelector('aside.app-shell-left-panel')),
      composer: Boolean(document.querySelector('.composer-surface-chrome')),
      main: Boolean(document.querySelector('[role="main"]')),
    };
    return {
      title: document.title,
      href: location.href,
      markers,
      codex: markers.shell && markers.sidebar,
    };
  })()`);
}

async function waitForCodexProbe(session, timeoutMs = 1800) {
  const deadline = Date.now() + timeoutMs;
  let probe = null;
  while (Date.now() < deadline) {
    probe = await probeSession(session);
    if (probe?.codex) return probe;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return probe;
}

async function connectTarget(target, port) {
  return new CdpSession(target, port).open();
}

async function connectCodexTargets(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await listAppTargets(port);
      const connected = [];
      for (const target of targets) {
        let session;
        try {
          session = await connectTarget(target, port);
          const probe = await probeSession(session);
          if (probe?.codex) connected.push({ target, session, probe });
          else session.close();
        } catch (error) {
          session?.close();
          lastError = error;
        }
      }
      if (connected.length) return connected;
      lastError = new Error("No page matched the expected Codex shell markers");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No verified Codex renderer on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
}

function assertContainedPath(rootPath, candidatePath, label) {
  const relative = path.relative(rootPath, candidatePath);
  if (
    relative === ""
    || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  ) return;
  throw new Error(`${label} must stay inside its theme directory`);
}

async function loadTheme(themeDir) {
  const requestedRoot = themeDir ?? path.join(root, "assets");
  const configPath = path.join(requestedRoot, "theme.json");
  let assetsRoot;
  let canonicalConfigPath;
  try {
    [assetsRoot, canonicalConfigPath] = await Promise.all([
      fs.realpath(requestedRoot),
      fs.realpath(configPath),
    ]);
  } catch (error) {
    if (themeDir && error.code === "ENOENT") {
      throw new Error(`Explicit theme directory is missing theme.json: ${configPath}`);
    }
    throw error;
  }
  assertContainedPath(assetsRoot, canonicalConfigPath, "Theme config");
  let config;
  try {
    config = await fs.readFile(canonicalConfigPath, "utf8");
  } catch (error) {
    if (themeDir && error.code === "ENOENT") {
      throw new Error(`Explicit theme directory is missing theme.json: ${configPath}`);
    }
    throw error;
  }
  const raw = JSON.parse(config);
  if (raw.schemaVersion !== 1 || typeof raw.image !== "string" || !raw.image) {
    throw new Error(`${configPath} has an unsupported schema or image field`);
  }
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(raw.image)) {
    throw new Error(`${configPath} has an invalid image field`);
  }
  if (path.basename(raw.image) !== raw.image) throw new Error("Theme image must stay inside its theme directory");
  const text = (value, fallback, max, name) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value.trim() ? Array.from(value.trim()).slice(0, max).join("") : fallback;
  };
  const color = (value, fallback) => {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return /^#[0-9a-f]{6}$/i.test(normalized) || /^rgba?\([0-9., %]+\)$/i.test(normalized)
      ? normalized
      : fallback;
  };
  const choice = (value, name, choices) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !choices.includes(value)) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value;
  };
  const unit = (value, name) => {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${configPath} has an invalid ${name} field`);
    }
    return value;
  };
  const rawColors = raw.colors && typeof raw.colors === "object" && !Array.isArray(raw.colors)
    ? raw.colors : null;
  const colorKeys = [
    "background", "panel", "panelAlt", "accent", "accentAlt", "secondary",
    "highlight", "text", "muted", "line",
  ];
  const appearance = choice(raw.appearance, "appearance", ["auto", "light", "dark"]);
  const layoutMode = choice(raw.layoutMode, "layoutMode", ["default", "qq2007"]);
  const prompts = (() => {
    if (raw.prompts === undefined) return undefined;
    if (!Array.isArray(raw.prompts)) throw new Error(`${configPath} has an invalid prompts field`);
    const ids = new Set();
    return raw.prompts.slice(0, 24).map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`${configPath} has an invalid prompts[${index}] field`);
      }
      const id = text(item.id, `prompt-${index + 1}`, 80, `prompts[${index}].id`);
      const label = text(item.label, `Prompt ${index + 1}`, 48, `prompts[${index}].label`);
      if (
        typeof item.text !== "string"
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u.test(item.text)
      ) {
        throw new Error(`${configPath} has an invalid prompts[${index}].text field`);
      }
      const promptText = Array.from(item.text.replace(/\r\n?/g, "\n").trim()).slice(0, 1400).join("");
      if (!promptText) throw new Error(`${configPath} has an empty prompts[${index}].text field`);
      if (ids.has(id)) throw new Error(`${configPath} has duplicate prompt id: ${id}`);
      ids.add(id);
      return { id, label, text: promptText };
    });
  })();
  if (raw.art !== undefined && (!raw.art || typeof raw.art !== "object" || Array.isArray(raw.art))) {
    throw new Error(`${configPath} has an invalid art field`);
  }
  const rawArt = raw.art || {};
  const art = {
    focusX: unit(rawArt.focusX, "art.focusX"),
    focusY: unit(rawArt.focusY, "art.focusY"),
    safeArea: choice(rawArt.safeArea, "art.safeArea", ["auto", "left", "right", "center", "none"]),
    taskMode: choice(rawArt.taskMode, "art.taskMode", ["auto", "ambient", "banner", "off"]),
  };
  const theme = {
    schemaVersion: 1,
    id: text(raw.id, "custom", 80, "id"),
    name: text(raw.name, "Codex Dream Skin", 80, "name"),
    brandSubtitle: text(raw.brandSubtitle, "CODEX DREAM SKIN", 80, "brandSubtitle"),
    tagline: text(raw.tagline, "Make something wonderful.", 160, "tagline"),
    projectPrefix: text(raw.projectPrefix, "选择项目 · ", 80, "projectPrefix"),
    projectLabel: text(raw.projectLabel, "◉  选择项目", 80, "projectLabel"),
    statusText: text(raw.statusText, "DREAM SKIN ONLINE", 80, "statusText"),
    quote: text(raw.quote, "MAKE SOMETHING WONDERFUL", 80, "quote"),
    image: raw.image,
    layoutMode: layoutMode ?? "default",
    colorMode: rawColors ? "explicit" : "auto",
    explicitColorKeys: rawColors ? colorKeys.filter((key) => Object.hasOwn(rawColors, key)) : [],
    colors: {
      background: color(rawColors?.background, "#071116"),
      panel: color(rawColors?.panel, "#0b1a20"),
      panelAlt: color(rawColors?.panelAlt, "#10272c"),
      accent: color(rawColors?.accent, "#7cff46"),
      accentAlt: color(rawColors?.accentAlt, "#b8ff3d"),
      secondary: color(rawColors?.secondary, "#36d7e8"),
      highlight: color(rawColors?.highlight, "#642a8c"),
      text: color(rawColors?.text, "#e9fff1"),
      muted: color(rawColors?.muted, "#9ebdb3"),
      line: color(rawColors?.line, "rgba(124, 255, 70, .28)"),
    },
  };
  if (appearance !== undefined) theme.appearance = appearance;
  if (prompts !== undefined) theme.prompts = prompts;
  if (Object.values(art).some((value) => value !== undefined)) {
    theme.art = Object.fromEntries(Object.entries(art).filter(([, value]) => value !== undefined));
  }
  const requestedImagePath = path.join(assetsRoot, theme.image);
  let imagePath;
  try {
    imagePath = await fs.realpath(requestedImagePath);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Theme image is missing: ${requestedImagePath}`);
    throw error;
  }
  assertContainedPath(assetsRoot, imagePath, "Theme image");
  const imageStat = await fs.stat(imagePath);
  const extension = path.extname(theme.image).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
    throw new Error(`Unsupported theme image format: ${extension || "missing"}`);
  }
  let imageHandle;
  try {
    imageHandle = await fs.open(imagePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error.code === "ELOOP") throw new Error("Theme image changed into a symbolic link while loading");
    throw error;
  }
  try {
    const openedStat = await imageHandle.stat();
    if (
      !imageStat.isFile()
      || !openedStat.isFile()
      || imageStat.dev !== openedStat.dev
      || imageStat.ino !== openedStat.ino
      || openedStat.size < 1
      || openedStat.size > MAX_ART_BYTES
    ) {
      throw new Error(`Theme image must be a stable non-empty file no larger than ${MAX_ART_BYTES} bytes`);
    }
    const art = await imageHandle.readFile();
    if (art.length < 1 || art.length > MAX_ART_BYTES) {
      throw new Error(`Theme image must be a non-empty file no larger than ${MAX_ART_BYTES} bytes`);
    }
    return { art, assetsRoot, extension, imagePath, theme };
  } finally {
    await imageHandle.close();
  }
}

async function loadStaticPayloadAssets() {
  const cacheHit = Boolean(staticPayloadAssets);
  if (!staticPayloadAssets) {
    staticPayloadAssets = Promise.all([
      fs.readFile(path.join(root, "assets", "dream-skin.css"), "utf8"),
      fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
    ]).catch((error) => {
      staticPayloadAssets = null;
      throw error;
    });
  }
  const [css, template] = await staticPayloadAssets;
  return { css, template, cacheHit };
}

function invalidateStaticPayloadAssets() {
  staticPayloadAssets = null;
}

async function loadPayload(themeDir) {
  const startedAt = performance.now();
  const [staticAssets, loaded] = await Promise.all([
    loadStaticPayloadAssets(),
    loadTheme(themeDir),
  ]);
  const { css, template } = staticAssets;
  const { art, extension, theme } = loaded;
  const styleRevision = createHash("sha256").update(css).digest("hex").slice(0, 20);
  const artMetadata = readImageMetadata(art, extension);
  if (!artMetadata) {
    throw new Error("Theme image metadata is invalid or exceeds the 16384px / 50MP safety limit");
  }
  const artKey = createHash("sha256").update(art).digest("hex").slice(0, 20);
  theme.artMetadata = artMetadata;
  theme.artKey = artKey;
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
    : extension === ".webp" ? "image/webp" : "image/png";
  const artDataUrl = `data:${mime};base64,${art.toString("base64")}`;
  const payload = template
    .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(css))
    .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify(artDataUrl))
    .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify(theme))
    .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify(SKIN_VERSION))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify(styleRevision));
  const revision = createHash("sha256")
    .update(SKIN_VERSION)
    .update(css)
    .update(template)
    .update(JSON.stringify(theme))
    .digest("hex")
    .slice(0, 20);
  return {
    imageBytes: art.length,
    payload,
    revision,
    theme,
    timings: {
      buildMs: Number((performance.now() - startedAt).toFixed(3)),
      staticCacheHit: staticAssets.cacheHit,
    },
  };
}

async function applyToSession(session, payload) {
  return session.evaluate(payload);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    document.documentElement?.classList.remove('codex-dream-skin', 'dream-retro-2007', 'dream-retro-2007-layout');
    document.documentElement?.style.removeProperty('--dream-skin-art');
    document.getElementById('codex-dream-skin-style')?.remove();
    document.getElementById('codex-dream-skin-chrome')?.remove();
    delete window.__CODEX_DREAM_SKIN_STATE__;
    return true;
  })()`);
}

async function verifyRemovedSession(session) {
  return session.evaluate(`(() =>
    !document.documentElement.classList.contains('codex-dream-skin') &&
    !document.getElementById('codex-dream-skin-style') &&
    !document.getElementById('codex-dream-skin-chrome') &&
    !window.__CODEX_DREAM_SKIN_STATE__
  )()`);
}

async function verifySession(session) {
  return session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      };
    };
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const homeSignal = homeIndicator ?? document.querySelector('[data-feature="game-source"]') ??
      document.querySelector('.group\\\\/home-suggestions');
    const homeRoute = homeSignal?.closest('[role="main"]') ?? null;
    const home = document.querySelector('[role="main"].dream-skin-home');
    const suggestions = home?.querySelector('.group\\\\/home-suggestions') ?? null;
    const cardBoxes = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const visibleCards = cardBoxes.filter((item) => item?.visible);
    const hero = box(home?.firstElementChild?.firstElementChild?.firstElementChild);
    const projectButton = box(home?.querySelector('.group\\\\/project-selector > button'));
    const shell = box(document.querySelector('main.main-surface'));
    const composer = box(document.querySelector('.composer-surface-chrome'));
    const sidebar = box(document.querySelector('aside.app-shell-left-panel'));
    const chrome = document.getElementById('codex-dream-skin-chrome');
    const result = {
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      version: window.__CODEX_DREAM_SKIN_STATE__?.version ?? null,
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      chromePresent: Boolean(chrome),
      chromePointerEvents: getComputedStyle(chrome || document.body).pointerEvents,
      homeRoute: Boolean(homeRoute),
      homePresent: Boolean(home),
      hero,
      cards: cardBoxes,
      visibleCardCount: visibleCards.length,
      projectButton,
      shell,
      composer,
      sidebar,
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    const basePass = result.installed && result.version === ${JSON.stringify(SKIN_VERSION)} &&
      result.stylePresent && result.chromePresent && result.chromePointerEvents === 'none' &&
      Boolean(result.shell?.visible) && Boolean(result.sidebar?.visible) && !result.documentOverflow.x;
    // Project selector markup varies across Codex builds — soft requirement.
    const homePass = !result.homeRoute || (
      result.homePresent && result.hero?.visible && result.hero.width >= 280 && result.hero.height >= 120
    );
    result.pass = Boolean(basePass && homePass);
    result.softNotes = {
      projectButtonOptional: !result.projectButton?.visible,
      composerOptionalOnNonTaskRoutes: !result.composer?.visible,
      suggestionCardsOptional: result.homeRoute && result.visibleCardCount === 0,
    };
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
  const bestEffortInput = async (method, params) => {
    try {
      await session.send(method, params, 750);
    } catch {
      // Screenshot capture is still valid when a renderer omits the Input domain.
    }
  };
  await bestEffortInput("Input.dispatchKeyEvent", {
    type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
  });
  await bestEffortInput("Input.dispatchKeyEvent", {
    type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27,
  });
  const viewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
  await bestEffortInput("Input.dispatchMouseEvent", {
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
  const connected = await connectCodexTargets(options.port, options.timeoutMs);
  const loaded = (options.mode === "once" || options.reload) ? await loadPayload(options.themeDir) : null;
  const payload = loaded?.payload ?? null;
  const results = [];
  let screenshotCaptured = false;

  for (const { target, session, probe } of connected) {
    try {
      if (options.mode === "remove") await removeFromSession(session);
      else if (options.mode === "once") await applyToSession(session, payload);

      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") await applyToSession(session, payload);
      }

      const result = options.mode === "remove"
        ? await verifyRemovedSession(session)
        : await waitForVerifiedSession(session, options.timeoutMs);
      results.push({ targetId: target.id, title: target.title, url: target.url, probe, result });

      if (options.screenshot && !screenshotCaptured) {
        await capture(session, options.screenshot);
        screenshotCaptured = true;
      }
    } finally {
      session.close();
    }
  }

  console.log(JSON.stringify({ mode: options.mode, version: SKIN_VERSION, port: options.port, targets: results }, null, 2));
  const failed = results.length === 0 || results.some((item) => options.mode === "remove" ? item.result !== true : !item.result?.pass);
  if (failed) process.exitCode = 2;
}

export function earlyPayloadFor(payload, revision) {
  return `(() => {
    const generationKey = "__CODEX_DREAM_SKIN_EARLY_GENERATION__";
    const appliedKey = "__CODEX_DREAM_SKIN_EARLY_APPLIED__";
    const generation = ${JSON.stringify(revision)};
    window[generationKey] = generation;
    let observer = null;
    let timeout = null;
    const stop = () => {
      observer?.disconnect();
      observer = null;
      if (timeout) clearTimeout(timeout);
      timeout = null;
    };
    const install = () => {
      if (window[generationKey] !== generation) { stop(); return true; }
      if (!document.documentElement) return false;
      const shell = document.querySelector('main.main-surface');
      const sidebar = document.querySelector('aside.app-shell-left-panel');
      if (!shell || !sidebar) return false;
      stop();
      ${payload};
      window[appliedKey] = generation;
      return true;
    };
    if (install()) return;
    if (typeof MutationObserver === "function" && document.documentElement) {
      observer = new MutationObserver(install);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    timeout = setTimeout(stop, 10000);
  })()`;
}

function watchPayloadSources(themeDir, onDirty) {
  const assetsRoot = path.join(root, "assets");
  const themeRoot = themeDir ?? assetsRoot;
  const watchers = [];
  const add = (directory, kind) => {
    let watcher;
    try {
      watcher = watchFs(directory, { persistent: false }, (_event, filename) => {
        const name = filename ? String(filename) : "";
        const staticChanged = directory === assetsRoot &&
          (!name || name === "dream-skin.css" || name === "renderer-inject.js");
        if (kind === "static" && !staticChanged) return;
        onDirty({ staticChanged });
      });
      watcher.on("error", (error) => {
        console.error(`[dream-skin] file watch unavailable for ${directory}: ${error.message}`);
      });
      watchers.push(watcher);
    } catch (error) {
      console.error(`[dream-skin] file watch unavailable for ${directory}: ${error.message}`);
    }
  };
  add(themeRoot, "theme");
  if (themeRoot !== assetsRoot) add(assetsRoot, "static");
  return () => watchers.forEach((watcher) => watcher.close());
}

async function runWatch(options) {
  let current = await loadPayload(options.themeDir);
  const sessions = new Map();
  const rejected = new Set();
  let stopping = false;
  let reloadTimer = null;
  let reloadChain = Promise.resolve();
  let discoveryDelayMs = 100;
  let lastListErrorAt = 0;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const registerEarly = async (session, payload, revision) => {
    const result = await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: earlyPayloadFor(payload, revision),
    });
    return result.identifier ?? null;
  };

  const removeEarly = async (record) => {
    if (!record.earlyScriptId || record.session.closed) return;
    const identifier = record.earlyScriptId;
    record.earlyScriptId = null;
    await record.session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
  };

  const refreshPayload = async () => {
    const next = await loadPayload(options.themeDir);
    if (next.revision === current.revision) return;
    current = next;
    for (const record of sessions.values()) {
      const { session } = record;
      if (session.closed) continue;
      try {
        const nextIdentifier = await registerEarly(session, current.payload, current.revision);
        if (record.earlyScriptId) {
          await session.send("Page.removeScriptToEvaluateOnNewDocument", {
            identifier: record.earlyScriptId,
          }).catch(() => {});
        }
        record.earlyScriptId = nextIdentifier;
        record.needsLoadFallback = !nextIdentifier;
        await applyToSession(session, current.payload);
      } catch (error) {
        record.needsLoadFallback = true;
        console.error(`[dream-skin] theme refresh failed: ${error.message}`);
      }
    }
    console.log(`[dream-skin] refreshed theme ${current.theme.id} (${current.timings.buildMs}ms)`);
  };

  const queuePayloadRefresh = ({ staticChanged = false } = {}) => {
    if (staticChanged) invalidateStaticPayloadAssets();
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      reloadChain = reloadChain.then(refreshPayload).catch((error) => {
        console.error(`[dream-skin] theme reload failed: ${error.message}`);
      });
    }, 45);
  };
  const closePayloadWatchers = watchPayloadSources(options.themeDir, queuePayloadRefresh);

  try {
    while (!stopping) {
      let targets = [];
      try {
        targets = await listAppTargets(options.port);
        discoveryDelayMs = 100;
      } catch (error) {
        if (Date.now() - lastListErrorAt >= 2000) {
          console.error(`[dream-skin] ${new Date().toISOString()} ${error.message}`);
          lastListErrorAt = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, discoveryDelayMs));
        discoveryDelayMs = Math.min(500, Math.round(discoveryDelayMs * 1.6));
        continue;
      }

      const activeIds = new Set(targets.map((target) => target.id));
      for (const [id, record] of sessions) {
        if (!activeIds.has(id) || record.session.closed) {
          record.session.close();
          sessions.delete(id);
        }
      }

      for (const target of targets) {
        if (sessions.has(target.id)) continue;
        let session;
        let record;
        try {
          session = await connectTarget(target, options.port);
          record = { session, earlyScriptId: null, needsLoadFallback: false };
          try {
            record.earlyScriptId = await registerEarly(session, current.payload, current.revision);
            await session.evaluate(earlyPayloadFor(current.payload, current.revision));
          } catch (error) {
            record.needsLoadFallback = true;
            console.error(`[dream-skin] early injection unavailable: ${error.message}`);
          }
          const probe = await waitForCodexProbe(session);
          if (!probe?.codex) {
            await removeEarly(record);
            session.close();
            if (!rejected.has(target.id)) {
              console.error(`[dream-skin] rejected non-Codex app target ${target.id}`);
              rejected.add(target.id);
            }
            continue;
          }
          rejected.delete(target.id);
          session.on("Page.loadEventFired", () => {
            if (!record.needsLoadFallback) return;
            setTimeout(() => applyToSession(session, current.payload).catch((error) => {
              console.error(`[dream-skin] fallback reinject failed: ${error.message}`);
            }), 0);
          });
          const earlyApplied = await session.evaluate(
            `window.__CODEX_DREAM_SKIN_EARLY_APPLIED__ === ${JSON.stringify(current.revision)}`,
          );
          if (!earlyApplied) {
            await session.evaluate(
              `window.__CODEX_DREAM_SKIN_EARLY_GENERATION__ = ${JSON.stringify(`fallback:${current.revision}`)}`,
            );
            await applyToSession(session, current.payload);
          }
          sessions.set(target.id, record);
          console.log(`[dream-skin] injected verified Codex target ${target.id} (${target.title || target.url})`);
        } catch (error) {
          if (record) await removeEarly(record);
          session?.close();
          console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}`);
        }
      }
      const pollDelay = sessions.size ? 800 : (targets.length ? 250 : 100);
      await new Promise((resolve) => setTimeout(resolve, pollDelay));
    }
  } finally {
    if (reloadTimer) clearTimeout(reloadTimer);
    closePayloadWatchers();
    await reloadChain.catch(() => {});
    await Promise.all([...sessions.values()].map((record) => removeEarly(record)));
    for (const record of sessions.values()) record.session.close();
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.mode === "check") {
      const loaded = await loadPayload(options.themeDir);
      console.log(JSON.stringify({
        pass: true,
        version: SKIN_VERSION,
        themeId: loaded.theme.id,
        themeName: loaded.theme.name,
        imageBytes: loaded.imageBytes,
        payloadBytes: Buffer.byteLength(loaded.payload),
        artMetadata: loaded.theme.artMetadata ?? null,
        timings: loaded.timings,
      }, null, 2));
    } else if (options.mode === "watch") await runWatch(options);
    else await runOneShot(options);
  } catch (error) {
    console.error(`[dream-skin] ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}
