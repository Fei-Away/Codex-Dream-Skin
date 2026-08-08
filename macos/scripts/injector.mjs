import fs from "node:fs/promises";
import { constants as fsConstants, watch as watchFs } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { readImageMetadata } from "./image-metadata.mjs";
import {
  normalizeThemeColor,
  normalizeThemeText,
} from "../assets/theme-package-validator.mjs";
import { decodeAndValidateSafeCss } from "../assets/safe-css-validator.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const here = path.dirname(scriptPath);
const root = path.resolve(here, "..");
const SELECTOR_CONTRACT = JSON.parse(await fs.readFile(
  path.join(root, "assets", "selectors.json"), "utf8",
));
if (SELECTOR_CONTRACT.schema !== "codex-dream-skin-selectors/1" ||
  !Array.isArray(SELECTOR_CONTRACT.selectors)) {
  throw new Error("assets/selectors.json has an unsupported schema");
}
const SELECTOR_MAP = new Map();
for (const entry of SELECTOR_CONTRACT.selectors) {
  if (!entry?.key || !entry.selector || SELECTOR_MAP.has(entry.key)) {
    throw new Error(`assets/selectors.json has an invalid selector key: ${entry?.key || "<missing>"}`);
  }
  SELECTOR_MAP.set(entry.key, entry.selector);
}
const selectorFor = (key) => {
  const selector = SELECTOR_MAP.get(key);
  if (!selector) throw new Error(`Selector contract is missing ${key}`);
  return selector;
};
const selectorLiteral = (key) => JSON.stringify(selectorFor(key));
const stableTestidLiteral = (testid) => {
  if (!SELECTOR_CONTRACT.stableTestids?.includes(testid)) {
    throw new Error(`Selector contract is missing stable testid ${testid}`);
  }
  return JSON.stringify(`[data-testid="${testid}"]`);
};
const SKIN_VERSION = "1.5.11";
// .github/workflows/ci.yml's version-consistency check greps this file for a
// literal `const SKIN_VERSION = "...";` line, so the export stays a separate
// statement rather than an inline `export const`.
export { SKIN_VERSION };
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CDP_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const MAX_ART_BYTES = 10 * 1024 * 1024;
const MAX_SAFE_CSS_BYTES = 256 * 1024;
const OPERATION_UI_HOST_ID = "chatgpt-dream-skin-operation";
const OPERATION_UI_REGISTRY_KEY = "__CHATGPT_DREAM_SKIN_OPERATION_UI__";
const OPERATION_KINDS = new Set(["apply", "pause", "switch"]);
const OPERATION_UI_STATES = new Set(["success", "error", "cancelled"]);
const MIN_RENDERER_WIDTH = 320;
const MIN_RENDERER_HEIGHT = 240;
const MAX_RENDERER_DIMENSION = 65536;
const OPERATION_UI_CSS = `
  :host {
    all: initial;
    position: fixed;
    top: var(--dream-skin-operation-top, 0px);
    left: var(--dream-skin-operation-left, 0px);
    width: var(--dream-skin-operation-width, 100vw);
    height: var(--dream-skin-operation-height, 100vh);
    z-index: 2147483647;
    pointer-events: none;
    opacity: 0;
    display: grid;
    place-items: center;
    transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  :host([data-visible="true"]) {
    opacity: 1;
  }
  .status {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: min(220px, calc(100% - 32px));
    min-height: 112px;
    padding: 18px 20px;
    border: 1px solid rgba(238, 239, 244, 0.16);
    border-radius: 8px;
    background: rgba(32, 33, 38, 0.94);
    color: #f3f3f6;
    box-shadow: 0 8px 24px rgba(12, 14, 19, 0.22);
    font-size: 13px;
    font-weight: 550;
    line-height: 1.35;
    letter-spacing: 0;
    text-align: center;
    transform: translateY(-4px) scale(0.98);
    transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  :host([data-visible="true"]) .status {
    transform: translateY(0) scale(1);
  }
  :host([data-tone="light"]) .status {
    border-color: #d9dbe3;
    background: rgba(248, 248, 251, 0.96);
    color: #25262c;
    box-shadow: 0 8px 24px rgba(31, 35, 48, 0.14);
  }
  .indicator {
    box-sizing: border-box;
    flex: 0 0 22px;
    width: 22px;
    height: 22px;
    color: #78a8f5;
  }
  :host([data-state="loading"]) .indicator {
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: dream-skin-operation-spin 720ms linear infinite;
  }
  :host([data-state="success"]) .indicator,
  :host([data-state="error"]) .indicator,
  :host([data-state="cancelled"]) .indicator {
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 16px;
    font-weight: 750;
  }
  :host([data-state="success"]) .indicator {
    color: #53b77b;
  }
  :host([data-state="success"]) .indicator::before {
    content: "✓";
  }
  :host([data-state="error"]) .indicator {
    color: #e26d7e;
  }
  :host([data-state="error"]) .indicator::before {
    content: "!";
  }
  :host([data-state="cancelled"]) .indicator {
    color: #a5a7b0;
  }
  :host([data-state="cancelled"]) .indicator::before {
    content: "×";
  }
  .message {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  @keyframes dream-skin-operation-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    :host, .status { transition: none; }
    :host([data-state="loading"]) .indicator {
      animation: none;
      border-top-color: currentColor;
      opacity: 0.65;
    }
  }
`;
let staticPayloadAssets = null;
let operationSequence = 0;

function hasReasonableDimensions(width, height) {
  return Number.isFinite(width) && Number.isFinite(height)
    && width >= MIN_RENDERER_WIDTH && height >= MIN_RENDERER_HEIGHT
    && width <= MAX_RENDERER_DIMENSION && height <= MAX_RENDERER_DIMENSION;
}

export function classifyNativeWindowResponse(response) {
  const windowId = Number(response?.windowId);
  const bounds = response?.bounds && typeof response.bounds === "object"
    ? {
        width: Number(response.bounds.width),
        height: Number(response.bounds.height),
        windowState: typeof response.bounds.windowState === "string"
          ? response.bounds.windowState : null,
      }
    : null;
  const stateReady = bounds
    && ["normal", "maximized", "fullscreen"].includes(bounds.windowState);
  const ready = Number.isSafeInteger(windowId) && windowId > 0 && stateReady
    && hasReasonableDimensions(bounds.width, bounds.height);
  return {
    status: ready ? "ready" : "not-ready",
    windowId: Number.isSafeInteger(windowId) && windowId > 0 ? windowId : null,
    bounds,
    reason: ready ? null : "native-window-not-visible",
  };
}

export function classifyNativeWindowError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const cdpCode = Number(error?.cdpCode);
  const withoutCode = message.replace(/\s*\(-?\d+\)\s*$/, "").trim();
  const domainUnsupported = cdpCode === -32601
    || /\(-32601\)\s*$/.test(message)
    || /^method(?: ['"]Browser\.getWindowForTarget['"])? not found$/i.test(withoutCode)
    || /^['"]?Browser\.getWindowForTarget['"]? (?:wasn't|was not) found$/i.test(withoutCode);
  // Codex 26.721.x (Chrome/150) returns "Browser window not found" (-32000)
  // for the app's real, focused, on-screen window -- verified live via CDP:
  // the error stays identical before and after actually activating the
  // window, while documentVisibility correctly flips hidden -> visible. The
  // domain is implemented but this build never resolves a window for our
  // target, so -32000 is exactly as uninformative here as -32601 elsewhere;
  // treat it the same way and lean on documentVisible (still required by
  // windowPass) as the real visibility signal. See #256.
  const windowNotFound = cdpCode === -32000
    || /\(-32000\)\s*$/.test(message)
    || /^browser window not found$/i.test(withoutCode);
  const unsupported = domainUnsupported || windowNotFound;
  return {
    status: unsupported ? "unsupported" : "not-ready",
    windowId: null,
    bounds: null,
    reason: domainUnsupported ? "browser-window-domain-unsupported"
      : windowNotFound ? "browser-window-not-found"
      : "native-window-unavailable",
  };
}

export function assessRendererVerification(renderer, nativeWindow, expected) {
  const result = renderer && typeof renderer === "object" ? { ...renderer } : {};
  const viewportWidth = Number(result.viewport?.width);
  const viewportHeight = Number(result.viewport?.height);
  const viewportPass = hasReasonableDimensions(viewportWidth, viewportHeight);
  const documentVisible = result.documentVisibility === "visible";
  const settingsRoute = result.scope?.baseState === "settings";
  const homeRoute = result.scope?.baseState === "home" || result.homeRoute || result.homePresent;
  const l1ScopePass = result.scope?.level === "L1" &&
    Array.isArray(result.scope?.missingL1) && result.scope.missingL1.length === 0;
  const genericStructurePass = l1ScopePass && Boolean(result.genericMain?.visible) &&
    (Boolean(result.genericInput?.visible) || Boolean(homeRoute && result.homePresent));
  const l0StructurePass = result.scope?.level === "L0" &&
    settingsRoute && Boolean(result.settings?.visible);
  const structurePass = l0StructurePass || (l1ScopePass && (
    (Boolean(result.shell?.visible) && Boolean(result.sidebar?.visible)) || genericStructurePass
  ));
  const nativeWindowPass = nativeWindow?.status === "ready";
  const fallbackWindowPass = nativeWindow?.status === "unsupported";
  const windowPass = documentVisible && viewportPass
    && (nativeWindowPass || fallbackWindowPass);
  const basePass = result.installed && result.version === expected.skinVersion
    && result.stylePresent && result.businessClassPollution === 0
    && structurePass && windowPass && !result.documentOverflow?.x;
  const payloadPass = (!expected.expectedThemeId || result.themeId === expected.expectedThemeId)
    && (!expected.expectedRevision || result.revision === expected.expectedRevision);
  const visibleSuggestionLabels = Array.isArray(result.suggestionLabels)
    ? result.suggestionLabels.filter((item) => item?.visible) : [];
  const homeFallbackVisible = Boolean(homeRoute && result.homePresent && result.genericMain?.visible);
  const homePass = !homeRoute || (
    result.homePresent && ((result.hero?.visible && result.hero.width >= 280
      && result.hero.height >= 120) || homeFallbackVisible)
    && (result.visibleCardCount === 0 || (
      visibleSuggestionLabels.length >= result.visibleCardCount
      && result.suggestionLabelColorsMatch
    ))
  );

  result.nativeWindow = nativeWindow;
  result.checks = {
    documentVisible,
    fallbackWindowPass,
    nativeWindowPass,
    payloadPass,
    structurePass,
    viewportPass,
    windowPass,
  };
  result.pass = Boolean(basePass && homePass && payloadPass);
  result.expectedThemeId = expected.expectedThemeId;
  result.expectedRevision = expected.expectedRevision;
  result.softNotes = {
    projectButtonOptional: !result.projectButton?.visible,
    composerOptionalOnNonTaskRoutes: !result.composer?.visible,
    suggestionCardsOptional: homeRoute && result.visibleCardCount === 0,
  };
  return result;
}

function parseArgs(argv) {
  const options = {
    port: 9341,
    mode: "watch",
    timeoutMs: 30000,
    screenshot: null,
    reload: false,
    themeDir: null,
    operationState: null,
    operationAck: null,
    operationKind: null,
    operationUiState: null,
    operationMessage: null,
    operationToken: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--begin-operation") options.mode = "begin-operation";
    else if (arg === "--finish-operation") options.mode = "finish-operation";
    else if (arg === "--check-payload") options.mode = "check";
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--theme-dir") options.themeDir = path.resolve(argv[++i]);
    else if (arg === "--operation-state") options.operationState = path.resolve(argv[++i]);
    else if (arg === "--operation-ack") options.operationAck = path.resolve(argv[++i]);
    else if (arg === "--operation-kind") options.operationKind = argv[++i];
    else if (arg === "--operation-ui-state") options.operationUiState = argv[++i];
    else if (arg === "--operation-message") options.operationMessage = argv[++i];
    else if (arg === "--operation-token") options.operationToken = argv[++i];
    else if (arg === "--reload") options.reload = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 120000) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  if (options.operationToken !== null && !/^\d{1,12}:\d{13}:\d{1,8}$/.test(options.operationToken)) {
    throw new Error("Invalid operation token");
  }
  if (options.mode === "begin-operation" && !OPERATION_KINDS.has(options.operationKind)) {
    throw new Error("Begin operation requires --operation-kind apply, pause, or switch");
  }
  if (options.mode === "finish-operation") {
    if (!OPERATION_UI_STATES.has(options.operationUiState)) {
      throw new Error("Finish operation requires --operation-ui-state success, error, or cancelled");
    }
    if (!options.operationToken) throw new Error("Finish operation requires --operation-token");
    if (typeof options.operationMessage !== "string" || options.operationMessage.length > 240
      || /[\r\n]/.test(options.operationMessage)) {
      throw new Error("Finish operation requires a single-line --operation-message up to 240 characters");
    }
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
      if (message.error) {
        const error = new Error(`${message.error.message} (${message.error.code})`);
        error.cdpCode = message.error.code;
        waiter.reject(error);
      } else waiter.resolve(message.result);
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

  async evaluate(expression, timeoutMs = 10000) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    }, timeoutMs);
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
    const genericCodexSurface = () => {
      if (location.protocol !== 'app:') return false;
      const main = document.querySelector('main, [role="main"]');
      const input = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
      const branded = Boolean(document.querySelector(
        ${stableTestidLiteral("app-shell-header-context-menu-surface")},
      ));
      return Boolean(main && input && branded);
    };
    const markers = {
      shell: Boolean(document.querySelector(${selectorLiteral("shell-main")})),
      sidebar: Boolean(document.querySelector(${selectorLiteral("left-panel")})),
      composer: Boolean(document.querySelector(${selectorLiteral("composer-chrome")})),
      main: Boolean(document.querySelector(${selectorLiteral("home-route")})),
      generic: genericCodexSurface(),
    };
    const settings = Boolean(document.querySelector(${selectorLiteral("settings-panel")})) ||
      Boolean(document.querySelector(${selectorLiteral("appearance-radio")})) ||
      Boolean(document.querySelector(${stableTestidLiteral("theme-preview")}));
    return {
      markers,
      codex: location.protocol === 'app:' &&
        ((markers.shell && markers.sidebar) || settings || markers.main || markers.generic),
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
      lastError = new Error("No page matched the expected ChatGPT shell markers");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`No verified ChatGPT renderer on 127.0.0.1:${port}: ${lastError?.message ?? "timed out"}`);
}

function assertContainedPath(rootPath, candidatePath, label) {
  const relative = path.relative(rootPath, candidatePath);
  if (
    relative === ""
    || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  ) return;
  throw new Error(`${label} must stay inside its theme directory`);
}

function sameFileStat(left, right) {
  return left.isFile() && right.isFile()
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

async function loadSafeCss(assetsRoot) {
  const cssPath = path.join(assetsRoot, "theme.css");
  let handle;
  try {
    handle = await fs.open(cssPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error.code === "ELOOP") throw new Error("Theme Safe CSS must not be a symbolic link");
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > MAX_SAFE_CSS_BYTES) {
      throw new Error(`Theme Safe CSS must be a non-empty file no larger than ${MAX_SAFE_CSS_BYTES} bytes`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameFileStat(before, after) || bytes.length !== after.size) {
      throw new Error("Theme Safe CSS changed while being loaded");
    }
    const { source, runtimeSource, validation } = decodeAndValidateSafeCss(bytes);
    return { path: cssPath, runtimeSource, source, stat: after, validation };
  } finally {
    await handle.close();
  }
}

export async function loadTheme(themeDir) {
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
  if (raw.art !== undefined && (!raw.art || typeof raw.art !== "object" || Array.isArray(raw.art))) {
    throw new Error(`${configPath} has an invalid art field`);
  }
  const rawArt = raw.art || {};
  const art = {
    focusX: unit(rawArt.focusX, "art.focusX"),
    focusY: unit(rawArt.focusY, "art.focusY"),
    safeArea: choice(rawArt.safeArea, "art.safeArea", ["auto", "left", "right", "center", "none"]),
    taskMode: choice(rawArt.taskMode, "art.taskMode", ["auto", "ambient", "banner", "full", "off"]),
  };
  const theme = {
    schemaVersion: 1,
    id: normalizeThemeText(raw.id, "custom", 80, "id", configPath),
    name: normalizeThemeText(raw.name, "Codex Dream Skin", 80, "name", configPath),
    brandSubtitle: normalizeThemeText(raw.brandSubtitle, "CODEX DREAM SKIN", 120, "brandSubtitle", configPath),
    tagline: normalizeThemeText(raw.tagline, "Make something wonderful.", 120, "tagline", configPath),
    projectPrefix: normalizeThemeText(raw.projectPrefix, "选择项目 · ", 120, "projectPrefix", configPath),
    projectLabel: normalizeThemeText(raw.projectLabel, "◉  选择项目", 120, "projectLabel", configPath),
    statusText: normalizeThemeText(raw.statusText, "DREAM SKIN ONLINE", 120, "statusText", configPath),
    quote: normalizeThemeText(raw.quote, "MAKE SOMETHING WONDERFUL", 120, "quote", configPath),
    image: raw.image,
    colorMode: rawColors ? "explicit" : "auto",
    explicitColorKeys: rawColors ? colorKeys.filter((key) => Object.hasOwn(rawColors, key)) : [],
    colors: {
      background: normalizeThemeColor(rawColors?.background, "#071116"),
      panel: normalizeThemeColor(rawColors?.panel, "#0b1a20"),
      panelAlt: normalizeThemeColor(rawColors?.panelAlt, "#10272c"),
      accent: normalizeThemeColor(rawColors?.accent, "#7cff46"),
      accentAlt: normalizeThemeColor(rawColors?.accentAlt, "#b8ff3d"),
      secondary: normalizeThemeColor(rawColors?.secondary, "#36d7e8"),
      highlight: normalizeThemeColor(rawColors?.highlight, "#642a8c"),
      text: normalizeThemeColor(rawColors?.text, "#e9fff1"),
      muted: normalizeThemeColor(rawColors?.muted, "#9ebdb3"),
      line: normalizeThemeColor(rawColors?.line, "rgba(124, 255, 70, .28)"),
    },
  };
  if (appearance !== undefined) theme.appearance = appearance;
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
    const safeCss = await loadSafeCss(assetsRoot);
    return {
      art,
      assetsRoot,
      extension,
      imagePath,
      safeCss: safeCss?.source ?? "",
      safeCssRuntime: safeCss?.runtimeSource ?? "",
      safeCssPath: safeCss?.path ?? null,
      safeCssStatus: safeCss ? "validated" : "none",
      theme,
    };
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

export async function loadPayload(themeDir) {
  const startedAt = performance.now();
  const [staticAssets, loaded] = await Promise.all([
    loadStaticPayloadAssets(),
    loadTheme(themeDir),
  ]);
  const { css, template } = staticAssets;
  const { art, extension, safeCssRuntime, safeCssStatus, theme } = loaded;
  const combinedCss = safeCssRuntime ? `${css}\n${safeCssRuntime}\n` : css;
  const styleRevision = createHash("sha256").update(combinedCss).digest("hex").slice(0, 20);
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
  const revision = createHash("sha256")
    .update(SKIN_VERSION)
    .update(combinedCss)
    .update(template)
    .update(JSON.stringify(theme))
    .digest("hex")
    .slice(0, 20);
  // Every replacement value must be supplied as a function. A plain string
  // replacement would still interpret `$$`, `$&`, `` $` `` and `$'` inside the
  // JSON, so a theme name that legitimately contains `$` could silently corrupt
  // or truncate the payload. Function replacements are inserted verbatim.
  const payload = template
    .replace("__DREAM_SKIN_CSS_JSON__", () => JSON.stringify(combinedCss))
    .replace("__DREAM_SKIN_ART_JSON__", () => JSON.stringify(artDataUrl))
    .replace("__DREAM_SKIN_THEME_JSON__", () => JSON.stringify(theme))
    .replace("__DREAM_SKIN_VERSION_JSON__", () => JSON.stringify(SKIN_VERSION))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", () => JSON.stringify(styleRevision))
    .replace("__DREAM_SKIN_PAYLOAD_REVISION_JSON__", () => JSON.stringify(revision));
  assertPayloadIntegrity(payload);
  return {
    imageBytes: art.length,
    payload,
    revision,
    safeCssStatus,
    theme,
    timings: {
      buildMs: Number((performance.now() - startedAt).toFixed(3)),
      staticCacheHit: staticAssets.cacheHit,
    },
  };
}

// Fail closed before a payload can reach the renderer. Theme display fields are
// attacker-influenced text, so template substitution is verified structurally
// instead of trusting any single sanitiser:
//   1. no placeholder token may survive substitution;
//   2. the payload must still parse as the standalone expression that
//      Runtime.evaluate would receive.
// The second assertion is deliberately generic: it catches any corruption of
// the template, not only the `$` replacement patterns that motivated it.
// `new Script` compiles without running the payload, so nothing executes here.
export function assertPayloadIntegrity(payload) {
  if (/__DREAM_SKIN_[A-Z0-9_]+_JSON__/.test(payload)) {
    throw new Error("Payload placeholders were not fully replaced");
  }
  try {
    new Script(payload, { filename: "dream-skin-payload.js" });
  } catch (error) {
    throw new Error(`Payload is not a parsable renderer script: ${error.message}`);
  }
  return true;
}

async function applyToSession(session, payload) {
  return session.evaluate(payload);
}

function nextOperationToken() {
  operationSequence += 1;
  return `${process.pid}:${Date.now()}:${operationSequence}`;
}

function operationUiExpression(action, token, state = "loading", message = "") {
  const config = { action, token, state, message };
  return `(() => {
    const config = ${JSON.stringify(config)};
    const hostId = ${JSON.stringify(OPERATION_UI_HOST_ID)};
    const registryKey = ${JSON.stringify(OPERATION_UI_REGISTRY_KEY)};
    const css = ${JSON.stringify(OPERATION_UI_CSS)};
    const revealDelayMs = 16;
    const minimumLoadingMs = 700;
    const stateTtl = (value) => value === "loading" ? 180000
      : value === "success" ? 1800 : value === "cancelled" ? 2400 : 6000;
    const issuedAt = (value) => Number(String(value).split(":")[1]) || 0;
    const positionInMainArea = (host) => {
      const main = document.querySelector(${selectorLiteral("shell-main")}) ||
        document.querySelector('[role="main"]') || document.documentElement;
      const rect = main.getBoundingClientRect();
      const top = Math.max(0, rect.top);
      const left = Math.max(0, rect.left);
      const width = Math.max(1, Math.min(innerWidth - left, rect.width || innerWidth));
      const height = Math.max(1, Math.min(innerHeight - top, rect.height || innerHeight));
      host.style.setProperty("--dream-skin-operation-top", String(top) + "px");
      host.style.setProperty("--dream-skin-operation-left", String(left) + "px");
      host.style.setProperty("--dream-skin-operation-width", String(width) + "px");
      host.style.setProperty("--dream-skin-operation-height", String(height) + "px");
    };
    const clearTimer = (timer) => { if (timer) clearTimeout(timer); };
    const removeHost = (expectedToken, force = false) => {
      const host = document.getElementById(hostId);
      const registry = window[registryKey];
      if (!force && host?.dataset.operationToken !== expectedToken) return false;
      if (!force && registry?.token && registry.token !== expectedToken) return false;
      clearTimer(registry?.showTimer);
      clearTimer(registry?.expiryTimer);
      clearTimer(registry?.terminalTimer);
      host?.remove();
      if (force || registry?.token === expectedToken) delete window[registryKey];
      return true;
    };
    if (config.action === "clear") {
      removeHost("", true);
      return { visible: false, cleared: true };
    }
    if (config.action === "hide") {
      return { visible: false, removed: removeHost(config.token) };
    }
    let host = document.getElementById(hostId);
    if (config.action === "show") {
      const currentIssuedAt = Number(host?.dataset.operationIssuedAt || 0);
      if (host?.dataset.operationToken !== config.token && currentIssuedAt > issuedAt(config.token)) {
        return { visible: false, stale: true };
      }
      removeHost("", true);
      host = document.createElement("div");
      host.id = hostId;
      host.dataset.operationToken = config.token;
      host.dataset.operationIssuedAt = String(issuedAt(config.token));
      host.dataset.state = config.state;
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "true");
      const rgb = getComputedStyle(document.body || document.documentElement).backgroundColor.match(/\\d+(?:\\.\\d+)?/g)?.map(Number);
      const light = rgb?.length >= 3
        ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) > 150
        : matchMedia("(prefers-color-scheme: light)").matches;
      host.dataset.tone = light ? "light" : "dark";
      positionInMainArea(host);
      const shadow = host.attachShadow({ mode: "open" });
      const styleNode = document.createElement("style");
      styleNode.textContent = css;
      const statusNode = document.createElement("div");
      statusNode.className = "status";
      const indicator = document.createElement("span");
      indicator.className = "indicator";
      indicator.setAttribute("aria-hidden", "true");
      const messageNode = document.createElement("span");
      messageNode.className = "message";
      messageNode.textContent = config.message;
      statusNode.append(indicator, messageNode);
      shadow.append(styleNode, statusNode);
      document.documentElement.append(host);
      const registry = {
        token: config.token,
        startedAt: Date.now(),
        showTimer: null,
        expiryTimer: null,
        terminalTimer: null,
      };
      registry.showTimer = setTimeout(() => {
        const current = document.getElementById(hostId);
        if (current?.dataset.operationToken === config.token) current.dataset.visible = "true";
      }, revealDelayMs);
      registry.expiryTimer = setTimeout(() => removeHost(config.token), stateTtl(config.state));
      window[registryKey] = registry;
      return { visible: true, state: config.state };
    }
    if (!host || host.dataset.operationToken !== config.token) {
      return { visible: false, stale: true };
    }
    const registry = window[registryKey];
    clearTimer(registry?.terminalTimer);
    clearTimer(registry?.expiryTimer);
    positionInMainArea(host);
    const terminal = config.state === "success" || config.state === "error" || config.state === "cancelled";
    const remainingLoadingMs = terminal && host.dataset.state === "loading" && registry?.startedAt
      ? Math.max(0, registry.startedAt + minimumLoadingMs - Date.now())
      : 0;
    if (remainingLoadingMs > 0 && registry?.token === config.token) {
      registry.terminalTimer = setTimeout(() => {
        const current = document.getElementById(hostId);
        const currentRegistry = window[registryKey];
        if (current?.dataset.operationToken !== config.token || currentRegistry?.token !== config.token) return;
        current.dataset.state = config.state;
        current.dataset.visible = "true";
        const currentMessage = current.shadowRoot?.querySelector(".message");
        if (currentMessage) currentMessage.textContent = config.message;
        clearTimer(currentRegistry.expiryTimer);
        currentRegistry.expiryTimer = setTimeout(() => removeHost(config.token), stateTtl(config.state));
      }, remainingLoadingMs);
      return { visible: true, state: "loading", deferred: true };
    }
    host.dataset.state = config.state;
    host.dataset.visible = "true";
    const messageNode = host.shadowRoot?.querySelector(".message");
    if (messageNode) messageNode.textContent = config.message;
    if (registry?.token === config.token) {
      registry.expiryTimer = setTimeout(() => removeHost(config.token), stateTtl(config.state));
    }
    return { visible: true, state: config.state };
  })()`;
}

async function updateOperationUi(session, action, token, state, message, timeoutMs = 10000) {
  if (session.closed) return false;
  const result = await session.evaluate(
    operationUiExpression(action, token, state, message),
    timeoutMs,
  );
  return Boolean(result?.visible || result?.cleared || result?.removed);
}

async function bestEffortOperationUi(session, action, token, state, message, timeoutMs = 10000) {
  try {
    return await updateOperationUi(session, action, token, state, message, timeoutMs);
  } catch (error) {
    console.error(`[dream-skin] client status unavailable: ${error.message}`);
    return false;
  }
}

async function presentOperationUi(session, token, state, message, timeoutMs = 10000) {
  const updated = await bestEffortOperationUi(
    session, "update", token, state, message, timeoutMs,
  );
  if (updated) return true;
  return bestEffortOperationUi(session, "show", token, state, message, timeoutMs);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    let cleaned = false;
    try { cleaned = Boolean(state?.cleanup && state.cleanup()); } catch {}
    if (cleaned) return true;
    const root = document.documentElement;
    for (const attribute of [...(root?.attributes || [])]) {
      if (attribute.name.startsWith('data-dream-')) root.removeAttribute(attribute.name);
    }
    for (const property of [...(root?.style || [])]) {
      if (property.startsWith('--dream-') || property.startsWith('--ds-')) {
        root.style.removeProperty(property);
      }
    }
    for (const node of document.querySelectorAll('[data-ds-part]')) {
      node.removeAttribute('data-ds-part');
    }
    const sheets = window.__CODEX_DREAM_SKIN_STYLE_SHEETS__;
    if (sheets && 'adoptedStyleSheets' in document) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets]
        .filter((sheet) => !sheets.has(sheet));
    }
    delete window.__CODEX_DREAM_SKIN_STYLE_SHEETS__;
    try { if (state?.artUrl) URL.revokeObjectURL(state.artUrl); } catch {}
    document.getElementById('codex-dream-skin-style')?.remove();
    delete window.__CODEX_DREAM_SKIN_STATE__;
    return true;
  })()`);
}

async function verifyRemovedSession(session) {
  return session.evaluate(`(() => {
    const root = document.documentElement;
    const hasAttributes = [...root.attributes].some((attribute) =>
      attribute.name.startsWith('data-dream-'));
    const hasVariables = [...root.style].some((property) =>
      property.startsWith('--dream-') || property.startsWith('--ds-'));
    const hasParts = Boolean(document.querySelector('[data-ds-part]'));
    const sheets = window.__CODEX_DREAM_SKIN_STYLE_SHEETS__;
    const hasSheets = Boolean(sheets?.size && 'adoptedStyleSheets' in document &&
      [...document.adoptedStyleSheets].some((sheet) => sheets.has(sheet)));
    return !hasAttributes && !hasVariables && !hasParts && !hasSheets &&
      !document.getElementById('codex-dream-skin-style') &&
      !window.__CODEX_DREAM_SKIN_STATE__;
  })()`);
}

export async function inspectNativeWindow(session) {
  try {
    const response = await session.send(
      "Browser.getWindowForTarget",
      { targetId: session.target.id },
      1500,
    );
    return classifyNativeWindowResponse(response);
  } catch (error) {
    return classifyNativeWindowError(error);
  }
}

export async function verifySession(session, expectedThemeId = null, expectedRevision = null) {
  const renderer = await session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const opacity = Number.parseFloat(style.opacity);
      const right = Number.isFinite(r.right) ? r.right : r.x + r.width;
      const bottom = Number.isFinite(r.bottom) ? r.bottom : r.y + r.height;
      let cssVisible = r.width > 0 && r.height > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden' && style.visibility !== 'collapse' &&
        style.contentVisibility !== 'hidden' && (!Number.isFinite(opacity) || opacity > 0);
      try {
        if (typeof node.checkVisibility === 'function') {
          cssVisible = cssVisible && node.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          });
        }
      } catch {}
      const intersectsViewport = right > 0 && bottom > 0 && r.x < innerWidth && r.y < innerHeight;
      return {
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.width), height: Math.round(r.height),
        visible: Boolean(node.isConnected !== false && cssVisible && intersectsViewport),
      };
    };
    const homeIndicator = document.querySelector(${selectorLiteral("home-icon")});
    const homeSignal = homeIndicator ?? document.querySelector(${selectorLiteral("game-source")}) ??
      document.querySelector(${selectorLiteral("home-suggestions")});
    const homeRoute = homeSignal?.closest('[role="main"]') ?? null;
    // Codex 26.721.x can render the home content before home-icon. Reuse the
    // already-resolved semantic home container so a healthy home session is
    // not rejected solely because the stricter home-icon selector is late.
    const home = document.querySelector(${selectorLiteral("home-route")}) ?? homeRoute;
    const suggestions = home?.querySelector(${selectorLiteral("home-suggestions")}) ?? null;
    const cardButtons = suggestions ? [...suggestions.querySelectorAll('button')] : [];
    const cardBoxes = cardButtons.map(box);
    const visibleCards = cardBoxes.filter((item) => item?.visible);
    const suggestionLabels = cardButtons.flatMap((button) => {
      const expectedColor = getComputedStyle(button).color;
      return [...button.querySelectorAll('*')]
        .filter((node) => [...node.childNodes].some((child) =>
          child.nodeType === 3 && child.textContent.trim()))
        .map((node) => ({
          ...box(node),
          text: node.textContent.trim().slice(0, 80),
          color: getComputedStyle(node).color,
          expectedColor,
        }));
    });
    const visibleSuggestionLabels = suggestionLabels.filter((item) => item?.visible);
    const suggestionLabelColorsMatch = visibleSuggestionLabels.every((item) =>
      item.color === item.expectedColor);
    // Codex 26.721+ moved the real home content out of home.firstElementChild's
    // descendant chain: that wrapper now only holds the (usually empty) native
    // .home-banners slot, and the actual content became its sibling instead
    // (see #244). Prefer a sibling of the banner-holding wrapper when present;
    // fall back to the pre-26.721 first-child chain (deepest visible node)
    // otherwise, so older Codex builds keep working unchanged.
    const homeChildren = home?.children ? Array.from(home.children) : [];
    const bannerHolder = homeChildren.find((el) => el.querySelector(${selectorLiteral("home-banners")}));
    const siblingCandidates = homeChildren.filter((el) => el !== bannerHolder).map(box);
    const heroChain = [];
    for (let node = home?.firstElementChild ?? null; node && heroChain.length < 3;
      node = node.firstElementChild) heroChain.push(node);
    const boxableChain = heroChain.filter((node) => typeof node?.getBoundingClientRect === "function");
    const chainCandidates = boxableChain.map(box);
    const hero = siblingCandidates.find((item) => item?.visible && item.width >= 280 && item.height >= 120)
      ?? chainCandidates.findLast((item) => item?.visible)
      ?? siblingCandidates.find((item) => item?.visible)
      ?? box(boxableChain[boxableChain.length - 1]);
    const projectButton = box(home?.querySelector(${selectorLiteral("project-selector")} + " > button"));
    const shell = box(document.querySelector(${selectorLiteral("shell-main")}));
    const composer = box(document.querySelector(${selectorLiteral("composer-chrome")}));
    const sidebar = box(document.querySelector(${selectorLiteral("left-panel")}));
    const genericMain = box(document.querySelector('[data-ds-part="main"], [data-ds-part="home"]'));
    const genericInput = box(document.querySelector('[data-ds-part="composer"]'));
    const settingsBoxes = [
      box(document.querySelector(${selectorLiteral("settings-panel")})),
      box(document.querySelector(${selectorLiteral("appearance-radio")})),
      box(document.querySelector(${stableTestidLiteral("theme-preview")})),
    ];
    const settings = settingsBoxes.find((item) => item?.visible) ??
      settingsBoxes.find(Boolean) ?? null;
    const runtime = window.__CODEX_DREAM_SKIN_STATE__;
    const adopted = runtime?.styleMode === 'adopted' &&
      [...document.adoptedStyleSheets].includes(runtime.styleSheet);
    const fallback = runtime?.styleMode === 'style' &&
      document.getElementById('codex-dream-skin-style') === runtime.styleNode;
    const result = {
      installed: document.documentElement.getAttribute('data-dream-skin') === 'active',
      documentVisibility: document.visibilityState,
      version: runtime?.version ?? null,
      themeId: runtime?.themeId ?? null,
      revision: runtime?.revision ?? null,
      styleMode: runtime?.styleMode ?? null,
      stylePresent: Boolean(adopted || fallback),
      scope: runtime?.scope ?? null,
      businessClassPollution: [...document.querySelectorAll('[class]')].filter((node) =>
        [...node.classList].some((name) => /^(?:dream-|codex-dream-skin(?:-|$))/.test(name))
      ).length,
      homeRoute: Boolean(homeRoute),
      homePresent: Boolean(home),
      hero,
      cards: cardBoxes,
      visibleCardCount: visibleCards.length,
      suggestionLabels,
      suggestionLabelColorsMatch,
      projectButton,
      shell,
      composer,
      sidebar,
      genericMain,
      genericInput,
      settings,
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    return result;
  })()`);
  const nativeWindow = await inspectNativeWindow(session);
  return assessRendererVerification(renderer, nativeWindow, {
    skinVersion: SKIN_VERSION,
    expectedThemeId,
    expectedRevision,
  });
}

export async function waitForVerifiedSession(
  session,
  timeoutMs,
  expectedThemeId = null,
  expectedRevision = null,
  retryDelayMs = 500,
) {
  const deadline = Date.now() + timeoutMs;
  const retryDelay = Number.isFinite(retryDelayMs) && retryDelayMs >= 0 ? retryDelayMs : 500;
  let lastResult;
  let lastError;
  while (Date.now() < deadline) {
    try {
      lastResult = await verifySession(session, expectedThemeId, expectedRevision);
      lastError = null;
      if (lastResult.pass) return lastResult;
    } catch (error) {
      // Renderer navigations can invalidate Runtime.evaluate while Codex is
      // swapping documents. Treat that as a transient sample until the same
      // bounded verification deadline expires, matching the Windows injector.
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
  if (!lastResult && lastError) throw lastError;
  return lastResult;
}

async function capture(session, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

function operationKindMessage(kind) {
  if (kind === "pause") return "正在暂停皮肤…";
  if (kind === "switch") return "正在切换主题…";
  return "正在应用皮肤…";
}

async function runBeginOperation(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs);
  const operationToken = options.operationToken ?? nextOperationToken();
  let shown = false;
  try {
    const results = await Promise.all(connected.map(({ session }) => presentOperationUi(
      session,
      operationToken,
      "loading",
      operationKindMessage(options.operationKind),
      Math.max(250, Math.floor(options.timeoutMs / 2)),
    )));
    shown = results.some(Boolean);
  } finally {
    for (const { session } of connected) session.close();
  }
  if (!shown) throw new Error("Could not show operation progress in the verified ChatGPT renderer");
  process.stdout.write(`${operationToken}\n`);
}

async function runFinishOperation(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs);
  let shown = false;
  try {
    const results = await Promise.all(connected.map(({ session }) => presentOperationUi(
      session,
      options.operationToken,
      options.operationUiState,
      options.operationMessage,
      Math.max(250, Math.floor(options.timeoutMs / 2)),
    )));
    shown = results.some(Boolean);
  } finally {
    for (const { session } of connected) session.close();
  }
  if (!shown) throw new Error("Could not show the completed operation state in the verified ChatGPT renderer");
}

async function runOneShot(options) {
  const connected = await connectCodexTargets(options.port, options.timeoutMs);
  const operationToken = options.mode === "once" || options.mode === "remove"
    ? options.operationToken ?? nextOperationToken()
    : null;
  if (operationToken) {
    const message = options.mode === "remove" ? "正在暂停皮肤…" : "正在准备皮肤…";
    const action = options.operationToken ? presentOperationUi : (session, token, state, text) =>
      bestEffortOperationUi(session, "show", token, state, text);
    await Promise.all(connected.map(({ session }) => action(
      session, operationToken, "loading", message,
    )));
  }
  let loaded = null;
  try {
    loaded = (options.mode === "once" || options.mode === "verify" || options.reload)
      ? await loadPayload(options.themeDir)
      : null;
  } catch (error) {
    if (operationToken) {
      await Promise.all(connected.map(({ session }) => presentOperationUi(
        session, operationToken, "error", "皮肤准备失败",
      )));
    }
    for (const { session } of connected) session.close();
    throw error;
  }
  const payload = loaded?.payload ?? null;
  const results = [];
  let screenshotCaptured = false;

  for (const { target, session, probe } of connected) {
    try {
      if (options.mode === "remove") await removeFromSession(session);
      else if (options.mode === "once") {
        await bestEffortOperationUi(
          session, "update", operationToken, "loading", `正在应用「${loaded.theme.name}」…`,
        );
        await applyToSession(session, payload);
      }

      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") {
          if (operationToken) {
            await presentOperationUi(
              session, operationToken, "loading", `正在应用「${loaded.theme.name}」…`,
            );
          }
          await applyToSession(session, payload);
        }
      }

      if (operationToken) {
        await presentOperationUi(
          session,
          operationToken,
          "loading",
          options.mode === "remove" ? "正在确认皮肤已暂停…" : "正在检查显示效果…",
        );
      }
      const result = options.mode === "remove"
        ? await verifyRemovedSession(session)
        : await waitForVerifiedSession(
          session,
          options.timeoutMs,
          loaded?.theme.id ?? null,
          loaded?.revision ?? null,
        );
      results.push({ targetId: target.id, markers: probe?.markers, result });
      if (operationToken) {
        const passed = options.mode === "remove" ? result === true : result?.pass;
        await presentOperationUi(
          session,
          operationToken,
          passed ? "success" : "error",
          passed
            ? options.mode === "remove" ? "皮肤已暂停" : `已应用「${loaded.theme.name}」`
            : options.mode === "remove" ? "暂停校验失败" : "显示校验失败",
        );
      }

      if (options.screenshot && !screenshotCaptured) {
        if (operationToken) {
          await bestEffortOperationUi(session, "hide", operationToken, "loading", "");
        }
        await capture(session, options.screenshot);
        screenshotCaptured = true;
      }
    } catch (error) {
      if (operationToken) {
        await presentOperationUi(
          session,
          operationToken,
          "error",
          options.mode === "remove" ? "暂停失败，请重试" : "应用失败，请重试",
        );
      }
      results.push({
        targetId: target.id,
        markers: probe?.markers,
        error: error.message,
        result: null,
      });
    } finally {
      session.close();
    }
  }

  console.log(JSON.stringify({ mode: options.mode, version: SKIN_VERSION, port: options.port, targets: results }, null, 2));
  const failed = results.length === 0 || results.some((item) =>
    item.error || (options.mode === "remove" ? item.result !== true : !item.result?.pass));
  if (failed) process.exitCode = 2;
}

export function earlyPayloadFor(payload, revision) {
  return `(() => {
    const generationKey = "__CODEX_DREAM_SKIN_EARLY_GENERATION__";
    const appliedKey = "__CODEX_DREAM_SKIN_EARLY_APPLIED__";
    const generation = ${JSON.stringify(revision)};
    window[generationKey] = generation;
    let bootstrapTimer = null;
    let timeout = null;
    const stop = () => {
      if (bootstrapTimer) clearInterval(bootstrapTimer);
      bootstrapTimer = null;
      if (timeout) clearTimeout(timeout);
      timeout = null;
    };
    const hasCodexSurface = () => {
      if (location.protocol !== "app:") return false;
      const shell = document.querySelector(${selectorLiteral("shell-main")});
      const sidebar = document.querySelector(${selectorLiteral("left-panel")});
      const main = document.querySelector(${selectorLiteral("home-route")});
      const settings = document.querySelector(${selectorLiteral("settings-panel")}) ||
        document.querySelector(${selectorLiteral("appearance-radio")}) ||
        document.querySelector(${stableTestidLiteral("theme-preview")});
      const genericMain = document.querySelector('main, [role="main"]');
      const genericInput = document.querySelector('textarea, [contenteditable="true"], [role="textbox"]');
      const branded = Boolean(document.querySelector(
        ${stableTestidLiteral("app-shell-header-context-menu-surface")},
      ));
      return Boolean((shell && sidebar) || settings || main ||
        (genericMain && genericInput && branded));
    };
    const install = () => {
      if (window[generationKey] !== generation) { stop(); return true; }
      if (!document.documentElement || !hasCodexSurface()) return false;
      stop();
      ${payload};
      window[appliedKey] = generation;
      return true;
    };
    if (install()) return;
    document.addEventListener?.("DOMContentLoaded", install, { once: true });
    bootstrapTimer = setInterval(install, 250);
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

async function readOperationState(statePath) {
  const { stdout } = await execFileAsync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", statePath],
    { encoding: "utf8", maxBuffer: 16 * 1024 },
  );
  const parsed = JSON.parse(stdout);
  return {
    token: String(parsed.operationToken || ""),
    status: String(parsed.status || ""),
    message: String(parsed.message || "").slice(0, 240),
    updatedAt: Number(parsed.updatedAt || 0),
  };
}

async function writeModeAck(ackPath, operationToken, mode) {
  if (!ackPath) return;
  if (mode !== "control" && mode !== "full") throw new Error("Invalid injector ACK mode");
  const temporary = `${ackPath}.${process.pid}.tmp`;
  const payload = `${JSON.stringify({
    operationToken,
    mode,
    injectorPid: process.pid,
    acknowledgedAt: new Date().toISOString(),
  }, null, 2)}\n`;
  try {
    await fs.writeFile(temporary, payload, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, ackPath);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function isFreshBusyOperation(operation) {
  if (operation.status !== "applying" && operation.status !== "pausing") return false;
  const ageSeconds = Date.now() / 1000 - operation.updatedAt;
  const maxAgeSeconds = operation.status === "applying" ? 180 : 90;
  return ageSeconds >= -5 && ageSeconds <= maxAgeSeconds;
}

async function watchOperationState(statePath, onState) {
  if (!statePath) return () => {};
  const directory = path.dirname(statePath);
  const basename = path.basename(statePath);
  let watcher = null;
  let readTimer = null;
  let readChain = Promise.resolve();
  let closed = false;
  let lastSnapshotKey = "";

  const readLatest = async () => {
    try {
      const operation = await readOperationState(statePath);
      if (!/^\d{1,12}:\d{13}:\d{1,8}$/.test(operation.token)) return;
      const snapshotKey = `${operation.token}:${operation.status}:${operation.updatedAt}`;
      if (snapshotKey === lastSnapshotKey) return;
      lastSnapshotKey = snapshotKey;
      await onState(operation);
    } catch (error) {
      if (!closed && error?.code !== "ENOENT") {
        console.error(`[dream-skin] operation state unavailable: ${error.message}`);
      }
    }
  };

  const scheduleRead = () => {
    if (closed) return;
    if (readTimer) clearTimeout(readTimer);
    readTimer = setTimeout(async () => {
      readTimer = null;
      readChain = readChain.then(readLatest);
      await readChain;
    }, 10);
  };

  try {
    watcher = watchFs(directory, { persistent: false }, (_event, filename) => {
      if (!filename || String(filename) === basename) scheduleRead();
    });
    watcher.on("error", (error) => {
      console.error(`[dream-skin] operation watch unavailable: ${error.message}`);
    });
  } catch (error) {
    console.error(`[dream-skin] operation watch unavailable: ${error.message}`);
  }

  readChain = readChain.then(readLatest);
  await readChain;

  return () => {
    closed = true;
    if (readTimer) clearTimeout(readTimer);
    watcher?.close();
  };
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
  let operationSignalChain = Promise.resolve();
  let activeOperation = null;
  let pauseRecovery = null;
  let controlOnly = false;
  let mutationEpoch = 0;
  let activeTargetSetups = 0;
  const targetSetupWaiters = new Set();
  let wakeControlWait = null;
  const wakeControlLoop = () => {
    const wake = wakeControlWait;
    wakeControlWait = null;
    wake?.();
  };
  const waitForControlOperation = () => new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (wakeControlWait === finish) wakeControlWait = null;
      resolve();
    };
    const timer = setTimeout(finish, 60000);
    wakeControlWait = finish;
  });
  const stop = () => {
    stopping = true;
    wakeControlLoop();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const beginTargetSetup = () => { activeTargetSetups += 1; };
  const finishTargetSetup = () => {
    activeTargetSetups = Math.max(0, activeTargetSetups - 1);
    if (activeTargetSetups !== 0) return;
    for (const resolve of targetSetupWaiters) resolve();
    targetSetupWaiters.clear();
  };
  const waitForTargetSetups = async (timeoutMs = 2500) => {
    if (activeTargetSetups === 0) return;
    let timeout;
    let release;
    const completed = new Promise((resolve) => {
      release = resolve;
      targetSetupWaiters.add(resolve);
    });
    try {
      await Promise.race([
        completed,
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Renderer setup did not quiesce for pause")), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      targetSetupWaiters.delete(release);
    }
  };

  const registerEarly = async (session, payload, revision) => {
    const result = await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: earlyPayloadFor(payload, revision),
    });
    return result.identifier ?? null;
  };

  const removeEarlyIdentifier = async (record, identifier, { strict = false } = {}) => {
    if (!identifier) return true;
    if (record.session.closed) {
      if (strict) throw new Error("Renderer session closed before early script removal");
      return false;
    }
    try {
      await record.session.send(
        "Page.removeScriptToEvaluateOnNewDocument",
        { identifier },
        strict ? 1500 : 10000,
      );
      record.earlyScriptIds.delete(identifier);
      if (record.earlyScriptId === identifier) record.earlyScriptId = null;
      return true;
    } catch (error) {
      if (strict) throw error;
      return false;
    }
  };

  const removeEarly = async (record, { strict = false } = {}) => {
    const identifiers = new Set(record.earlyScriptIds);
    if (record.earlyScriptId) identifiers.add(record.earlyScriptId);
    const results = await Promise.all([...identifiers].map((identifier) =>
      removeEarlyIdentifier(record, identifier, { strict })));
    return results.every(Boolean);
  };

  const registerEarlyForRecord = async (record, payload, revision) => {
    const identifier = await registerEarly(record.session, payload, revision);
    if (identifier) record.earlyScriptIds.add(identifier);
    return identifier;
  };

  const invalidateEarly = async (record, { strict = false } = {}) => {
    record.needsLoadFallback = false;
    if (record.session.closed) {
      if (strict) throw new Error("Renderer session closed before pause invalidation");
    } else {
      await record.session.evaluate(`(() => {
        window.__CODEX_DREAM_SKIN_EARLY_GENERATION__ = ${JSON.stringify(`disabled:${process.pid}`)};
        window.__CODEX_DREAM_SKIN_DISABLED__ = true;
        return true;
      })()`, strict ? 1500 : 10000).catch((error) => {
        if (strict) throw error;
      });
    }
    return removeEarly(record, { strict });
  };

  const releaseControlSessions = () => {
    for (const record of sessions.values()) record.session.close();
    sessions.clear();
  };

  const restoreAfterAbortedPause = async (operation) => {
    mutationEpoch += 1;
    controlOnly = false;
    pauseRecovery = {
      token: operation.token,
      message: operation.message || "暂停失败，原皮肤已恢复",
    };
    releaseControlSessions();
    wakeControlLoop();
  };

  const refreshPayload = async () => {
    const refreshEpoch = mutationEpoch;
    let next;
    try {
      next = await loadPayload(options.themeDir);
    } catch (error) {
      await Promise.all([...sessions.values()].map(async (record) => {
        if (record.session.closed) return;
        const externalOperation = activeOperation;
        const operationToken = externalOperation?.token ?? nextOperationToken();
        record.operationToken = operationToken;
        record.operationExternal = Boolean(externalOperation);
        await presentOperationUi(
          record.session,
          operationToken,
          externalOperation ? "loading" : "error",
          externalOperation ? "正在准备主题…" : "主题读取失败，当前皮肤未改变",
        );
      }));
      throw error;
    }
    if (next.revision === current.revision) return;
    current = next;
    if (controlOnly || mutationEpoch !== refreshEpoch) {
      console.log(`[dream-skin] staged theme ${current.theme.id} while skin is paused`);
      return;
    }
    for (const record of sessions.values()) {
      const { session } = record;
      if (session.closed) continue;
      const externalOperation = activeOperation;
      const operationToken = externalOperation?.token ?? nextOperationToken();
      record.operationToken = operationToken;
      record.operationExternal = Boolean(externalOperation);
      try {
        await presentOperationUi(
          session, operationToken, "loading", `正在应用「${current.theme.name}」…`,
        );
        if (controlOnly || mutationEpoch !== refreshEpoch) continue;
        const nextIdentifier = await registerEarlyForRecord(
          record, current.payload, current.revision,
        );
        if (controlOnly || mutationEpoch !== refreshEpoch) {
          await removeEarlyIdentifier(record, nextIdentifier);
          continue;
        }
        if (record.earlyScriptId) {
          await removeEarlyIdentifier(record, record.earlyScriptId);
        }
        record.earlyScriptId = nextIdentifier;
        record.needsLoadFallback = !nextIdentifier;
        await applyToSession(session, current.payload);
        if (controlOnly || mutationEpoch !== refreshEpoch) continue;
        const verification = await waitForVerifiedSession(
          session,
          Math.min(options.timeoutMs, 8000),
          current.theme.id,
          current.revision,
        );
        if (!verification?.pass) throw new Error("Theme refresh verification failed");
        if (!externalOperation) {
          await presentOperationUi(session, operationToken, "success", `已应用「${current.theme.name}」`);
        }
      } catch (error) {
        record.needsLoadFallback = true;
        if (!externalOperation) {
          await presentOperationUi(session, operationToken, "error", "主题切换失败，未确认应用");
        }
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
  const closeOperationWatcher = await watchOperationState(options.operationState, (operation) => {
    operationSignalChain = operationSignalChain.then(async () => {
      const previousOperation = activeOperation?.token === operation.token ? activeOperation : null;
      const busy = isFreshBusyOperation(operation);
      if (pauseRecovery && pauseRecovery.token !== operation.token) pauseRecovery = null;
      if (busy) {
        activeOperation = operation;
        wakeControlLoop();
      }
      else if (activeOperation?.token === operation.token) activeOperation = null;
      const abortedPause = !busy
        && (operation.status === "failed" || operation.status === "cancelled")
        && previousOperation?.status === "pausing";
      const pauseState = (busy && operation.status === "pausing") || operation.status === "paused";
      if (pauseState && !controlOnly) {
        controlOnly = true;
        mutationEpoch += 1;
      }
      await Promise.all([...sessions.values()].map(async (record) => {
        if (record.session.closed) return;
        if (busy) {
          const kind = operation.status === "pausing" ? "pause" : "apply";
          record.operationToken = operation.token;
          record.operationExternal = true;
          await presentOperationUi(
            record.session,
            operation.token,
            "loading",
            operationKindMessage(kind),
            1000,
          );
          return;
        }
        if (record.operationToken !== operation.token) return;
        const state = operation.status === "failed" ? "error"
          : operation.status === "cancelled" ? "cancelled"
            : operation.status === "success" || operation.status === "paused" ? "success" : null;
        if (!state) return;
        await presentOperationUi(
          record.session,
          operation.token,
          state,
          operation.message || (state === "error" ? "操作失败，请重试" : "操作已完成"),
        );
      }));
      if (busy && operation.status === "pausing") {
        await reloadChain.catch(() => {});
        await waitForTargetSetups();
        await Promise.all([...sessions.values()].map(async (record) => {
          await invalidateEarly(record, { strict: true });
        }));
        await writeModeAck(options.operationAck, operation.token, "control");
      } else if (abortedPause) await restoreAfterAbortedPause(operation);
      else if (operation.status === "paused") {
        await reloadChain.catch(() => {});
        await waitForTargetSetups().catch(() => {});
        await Promise.all([...sessions.values()].map((record) =>
          invalidateEarly(record, { strict: true }))).catch((error) => {
          console.error(`[dream-skin] final pause invalidation failed: ${error.message}`);
        });
        releaseControlSessions();
      }
    }).catch((error) => {
      console.error(`[dream-skin] operation progress failed: ${error.message}`);
    });
    return operationSignalChain;
  });

  try {
    while (!stopping) {
      if (activeOperation && !isFreshBusyOperation(activeOperation)) {
        const expiredOperation = activeOperation;
        activeOperation = null;
        await Promise.all([...sessions.values()].map(async (record) => {
          if (record.session.closed || record.operationToken !== expiredOperation.token) return;
          await presentOperationUi(
            record.session,
            expiredOperation.token,
            "error",
            "操作超时，请重试",
            1000,
          );
        }));
        if (expiredOperation.status === "pausing") {
          controlOnly = true;
          releaseControlSessions();
        }
      }
      if (controlOnly && !activeOperation) {
        releaseControlSessions();
        await waitForControlOperation();
        continue;
      }
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

      if (controlOnly && !activeOperation) {
        releaseControlSessions();
        continue;
      }

      const activeIds = new Set(targets.map((target) => target.id));
      for (const [id, record] of sessions) {
        if (!activeIds.has(id) || record.session.closed) {
          if (!record.session.closed && record.operationToken && !record.operationExternal) {
            await bestEffortOperationUi(
              record.session, "hide", record.operationToken, "loading", "",
            );
          }
          record.session.close();
          sessions.delete(id);
        }
      }

      const cycleRecovery = activeOperation ? null : pauseRecovery;
      let recoveredPauseThisCycle = false;
      let recoveryFailedThisCycle = false;
      for (const target of targets) {
        if (sessions.has(target.id)) continue;
        let session;
        let record;
        let connectionEpoch;
        let recoveryOperation = cycleRecovery;
        beginTargetSetup();
        try {
          session = await connectTarget(target, options.port);
          record = {
            session,
            earlyScriptId: null,
            earlyScriptIds: new Set(),
            needsLoadFallback: false,
            operationToken: null,
            operationExternal: false,
          };
          connectionEpoch = mutationEpoch;
          sessions.set(target.id, record);
          session.on("Page.loadEventFired", () => {
            if (!record.needsLoadFallback) return;
            const fallbackEpoch = mutationEpoch;
            setTimeout(() => {
              if (session.closed || controlOnly || mutationEpoch !== fallbackEpoch
                || !record.needsLoadFallback) return;
              applyToSession(session, current.payload).catch((error) => {
                console.error(`[dream-skin] fallback reinject failed: ${error.message}`);
              });
            }, 0);
          });
          const initialOperation = activeOperation;
          recoveryOperation = initialOperation ? null : cycleRecovery;
          const pausing = initialOperation?.status === "pausing";
          if (!controlOnly) {
            try {
              record.earlyScriptId = await registerEarlyForRecord(
                record, current.payload, current.revision,
              );
              await session.evaluate(earlyPayloadFor(current.payload, current.revision));
              if (controlOnly || mutationEpoch !== connectionEpoch) await invalidateEarly(record);
            } catch (error) {
              record.needsLoadFallback = true;
              console.error(`[dream-skin] early injection unavailable: ${error.message}`);
            }
          }
          const probe = await waitForCodexProbe(session);
          if (!probe?.codex) {
            await removeEarly(record);
            session.close();
            sessions.delete(target.id);
            if (!rejected.has(target.id)) {
              console.error(`[dream-skin] rejected non-ChatGPT app target ${target.id}`);
              rejected.add(target.id);
            }
            continue;
          }
          rejected.delete(target.id);
          if (controlOnly || pausing || mutationEpoch !== connectionEpoch) {
            await invalidateEarly(record);
          }
          if (controlOnly && !initialOperation) {
            console.log(`[dream-skin] connected control-only target ${target.id}`);
            continue;
          }
          record.operationToken = initialOperation?.token
            ?? recoveryOperation?.token
            ?? nextOperationToken();
          record.operationExternal = Boolean(initialOperation || recoveryOperation);
          await presentOperationUi(
            session,
            record.operationToken,
            "loading",
            initialOperation
              ? operationKindMessage(initialOperation.status === "pausing" ? "pause" : "apply")
              : recoveryOperation
                ? "暂停未完成，正在恢复原皮肤…"
              : `正在应用「${current.theme.name}」…`,
          );
          if (controlOnly || pausing) {
            continue;
          }
          const earlyApplied = await session.evaluate(
            `window.__CODEX_DREAM_SKIN_EARLY_APPLIED__ === ${JSON.stringify(current.revision)}`,
          );
          if (!earlyApplied) {
            if (controlOnly || mutationEpoch !== connectionEpoch) {
              await invalidateEarly(record);
              continue;
            }
            await session.evaluate(
              `window.__CODEX_DREAM_SKIN_EARLY_GENERATION__ = ${JSON.stringify(`fallback:${current.revision}`)}`,
            );
            await applyToSession(session, current.payload);
          }
          if (controlOnly || mutationEpoch !== connectionEpoch) {
            await invalidateEarly(record);
            continue;
          }
          const verification = await waitForVerifiedSession(
            session,
            Math.min(options.timeoutMs, 8000),
            current.theme.id,
            current.revision,
          );
          if (!verification?.pass) throw new Error("Initial theme verification failed");
          if (recoveryOperation && !activeOperation
            && pauseRecovery?.token === recoveryOperation.token) {
            await presentOperationUi(
              session,
              recoveryOperation.token,
              "error",
              "暂停失败，原皮肤已恢复",
              1000,
            );
            recoveredPauseThisCycle = true;
          } else if (!record.operationExternal) {
            await presentOperationUi(
              session, record.operationToken, "success", `已应用「${current.theme.name}」`,
            );
          }
          console.log(`[dream-skin] injected verified ChatGPT target ${target.id}`);
        } catch (error) {
          const recoveryStillCurrent = recoveryOperation && !activeOperation
            && pauseRecovery?.token === recoveryOperation.token;
          if (recoveryStillCurrent) recoveryFailedThisCycle = true;
          if (record?.operationToken && session && !session.closed) {
            if (recoveryStillCurrent) {
              await presentOperationUi(
                session,
                recoveryOperation.token,
                "error",
                "暂停失败，原皮肤恢复未确认",
                1000,
              );
            } else if (!record.operationExternal) {
              await presentOperationUi(
                session, record.operationToken, "error", "应用失败，未通过显示校验",
              );
            }
          }
          if (record) await removeEarly(record);
          session?.close();
          sessions.delete(target.id);
          console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}`);
        } finally {
          finishTargetSetup();
        }
      }
      if (recoveredPauseThisCycle && !recoveryFailedThisCycle && !activeOperation
        && cycleRecovery?.token === pauseRecovery?.token) {
        await writeModeAck(options.operationAck, cycleRecovery.token, "full");
        pauseRecovery = null;
      }
      const pollDelay = sessions.size ? 800 : (targets.length ? 250 : 100);
      await new Promise((resolve) => setTimeout(resolve, pollDelay));
    }
  } finally {
    if (reloadTimer) clearTimeout(reloadTimer);
    closePayloadWatchers();
    closeOperationWatcher();
    await reloadChain.catch(() => {});
    await operationSignalChain.catch(() => {});
    await Promise.all([...sessions.values()].map((record) =>
      record.operationToken && !record.operationExternal
        ? bestEffortOperationUi(record.session, "hide", record.operationToken, "loading", "")
        : Promise.resolve(false)));
    await Promise.all([...sessions.values()].map((record) => removeEarly(record)));
    for (const record of sessions.values()) record.session.close();
  }
}

async function runOneShotAndExit(options) {
  await runOneShot(options);
  await new Promise((resolve) => process.stdout.write("", resolve));
  process.exit(process.exitCode ?? 0);
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.mode === "check") {
      const loaded = await loadPayload(options.themeDir);
      // loadPayload already fails closed, but every installer, importer and
      // theme switch gates on this command, so the guard is re-asserted at the
      // CLI boundary rather than being an internal implementation detail.
      assertPayloadIntegrity(loaded.payload);
      console.log(JSON.stringify({
        pass: true,
        version: SKIN_VERSION,
        payloadIntegrity: "verified",
        themeId: loaded.theme.id,
        themeName: loaded.theme.name,
        imageBytes: loaded.imageBytes,
        payloadBytes: Buffer.byteLength(loaded.payload),
        safeCssStatus: loaded.safeCssStatus,
        artMetadata: loaded.theme.artMetadata ?? null,
        timings: loaded.timings,
      }, null, 2));
    } else if (options.mode === "begin-operation") {
      await runBeginOperation(options);
      await new Promise((resolve) => process.stdout.write("", resolve));
      process.exit(0);
    } else if (options.mode === "finish-operation") {
      await runFinishOperation(options);
      await new Promise((resolve) => process.stdout.write("", resolve));
      process.exit(0);
    } else if (options.mode === "watch") await runWatch(options);
    else await runOneShotAndExit(options);
  } catch (error) {
    console.error(`[dream-skin] ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}
