import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(windowsRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(windowsRoot, "assets", "dream-skin.css"), "utf8");
const buildPayload = (config = {}) => template
  .replace("__DREAM_CSS_JSON__", JSON.stringify(".fixture { color: blue; }"))
  .replace("__DREAM_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
  .replace("__DREAM_THEME_JSON__", JSON.stringify(config));
const payload = buildPayload();

assert.doesNotMatch(
  css,
  /main\.main-surface\s*>\s*header\.app-header-tint\s*\{[^}]*\b(?:position|z-index)\s*:/,
  "The skin must preserve Codex's native fixed header so the side-panel toggle remains reachable.",
);
const threadLayerStart = css.indexOf("/* Keep long-form text legible");
const threadLayerEnd = css.indexOf("\n}", threadLayerStart);
const threadLayerCss = css.slice(threadLayerStart, threadLayerEnd);
assert.match(threadLayerCss, /background:\s*transparent/);
assert.match(threadLayerCss, /backdrop-filter:\s*none/);
assert.doesNotMatch(threadLayerCss, /blur\(|0 18px 60px|backdrop-filter var\(--dream-focus-transition\)/);
const threadFadeStart = css.indexOf("::before {", threadLayerEnd);
const threadFadeEnd = css.indexOf("\n}", threadFadeStart);
const threadFadeCss = css.slice(threadFadeStart, threadFadeEnd);
assert.match(threadFadeCss, /background:\s*color-mix\(in oklab, var\(--dream-surface\) 72%, transparent\)/);
assert.match(threadFadeCss, /opacity:\s*var\(--dream-thread-focus\)/);
assert.match(threadFadeCss, /backdrop-filter:\s*none/);
assert.doesNotMatch(threadFadeCss, /blur\(|0 18px 60px|backdrop-filter var\(--dream-focus-transition\)/);
assert.match(
  css,
  /\.dream-route-entering\s*\{[^}]*--dream-thread-focus:\s*0\s*!important/,
  "The task-entry reset must win over the higher-specificity active-task selector.",
);
const composerLayerStart = css.indexOf("html.codex-dream-skin .composer-surface-chrome {");
const composerLayerEnd = css.indexOf("\n}", composerLayerStart);
const composerLayerCss = css.slice(composerLayerStart, composerLayerEnd);
assert.match(
  composerLayerCss,
  /overflow:\s*hidden\s*!important/,
  "The composer shell must not scroll its action buttons with the editor.",
);
assert.match(
  css,
  /\[class~="max-h-\[25dvh\]"\]\[class~="overflow-y-auto"\]\s*\{[^}]*max-height:\s*min\(38dvh,\s*420px\)[^}]*overflow-y:\s*auto/,
  "Only the growing editor should scroll after reaching its enlarged height cap.",
);

function createFixture({
  shellPresent,
  staleSkin = false,
  homePresent = false,
  utilityPresent = false,
  shellAppearance = "dark",
  computedColorScheme = "",
  osAppearance = "light",
  analysisFixture = null,
}) {
  const nodes = new Map();
  const rootClasses = new Set(staleSkin ? ["codex-dream-skin"] : []);
  const rootStyles = new Map(staleSkin ? [["--dream-art", "url(\"blob:stale\")"]] : []);
  const revokedUrls = [];
  const observers = [];
  const animationFrames = new Map();
  const timers = new Map();
  let objectUrlCount = 0;
  let nextAnimationFrame = 1;
  let nextTimer = 1;
  let hasShell = shellPresent;
  let hasHome = homePresent;
  let threadContentNode = {};
  let computedStyleReads = 0;
  let root;

  const queueRootClassMutation = () => {
    for (const observer of observers) {
      if (observer.target !== root || !observer.options?.attributes) continue;
      if (observer.options.attributeFilter && !observer.options.attributeFilter.includes("class")) continue;
      observer.records.push({ type: "attributes", attributeName: "class", target: root });
    }
  };
  const makeClassList = (classes = new Set(), onMutation = () => {}) => ({
    add(...values) {
      let changed = false;
      for (const value of values) {
        if (!classes.has(value)) { classes.add(value); changed = true; }
      }
      if (changed) onMutation();
    },
    remove(...values) {
      let changed = false;
      for (const value of values) changed = classes.delete(value) || changed;
      if (changed) onMutation();
    },
    toggle(value, enabled) {
      const changed = enabled ? !classes.has(value) : classes.has(value);
      if (enabled) classes.add(value);
      else classes.delete(value);
      if (changed) onMutation();
    },
    contains(value) { return classes.has(value); },
  });

  root = {
    className: shellAppearance,
    classList: makeClassList(rootClasses, queueRootClassMutation),
    getAttribute() { return null; },
    style: {
      getPropertyValue(key) { return rootStyles.get(key) ?? ""; },
      setProperty(key, value) { rootStyles.set(key, value); },
      removeProperty(key) { rootStyles.delete(key); },
    },
    appendChild(node) {
      node.parentElement = root;
      nodes.set(node.id, node);
    },
  };
  const body = {
    className: "",
    getAttribute() { return null; },
    appendChild(node) {
      node.parentElement = body;
      nodes.set(node.id, node);
    },
  };
  const shellMainClasses = new Set();
  const shellMain = {
    classList: makeClassList(shellMainClasses),
    getBoundingClientRect() {
      return { left: 290, top: 36, width: 990, height: 784 };
    },
  };
  const shellSidebar = {};
  const routeClasses = new Set();
  const utilityClasses = new Set();
  const utilityNode = { classList: makeClassList(utilityClasses) };
  const routeMain = {
    classList: makeClassList(routeClasses),
    querySelectorAll(selector) {
      if (selector === '[class*="_homeUtilityBar_"]' && utilityPresent) return [utilityNode];
      return [];
    },
  };
  const staleHome = { classList: makeClassList(new Set(["dream-home"])) };
  const staleShell = { classList: makeClassList(new Set(["dream-home-shell"])) };

  const createElement = (tagName) => {
    if (tagName === "canvas" && analysisFixture) {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {},
            getImageData() { return { data: analysisFixture.pixels }; },
          };
        },
      };
    }
    return {
      id: "",
      dataset: {},
      style: {},
      classList: makeClassList(),
      parentElement: null,
      textContent: "",
      innerHTML: "",
      setAttribute() {},
      remove() { nodes.delete(this.id); },
    };
  };
  if (staleSkin) {
    const style = createElement();
    style.id = "codex-dream-skin-style";
    nodes.set(style.id, style);
    const chrome = createElement();
    chrome.id = "codex-dream-skin-chrome";
    nodes.set(chrome.id, chrome);
  }

  const document = {
    documentElement: root,
    head: root,
    body,
    createElement,
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector === "main.main-surface") return hasShell ? shellMain : null;
      if (selector === "aside.app-shell-left-panel") return hasShell ? shellSidebar : null;
      if (selector === '[role="main"]:has([data-testid="home-icon"])') {
        return hasShell && hasHome ? routeMain : null;
      }
      if (selector === '.thread-scroll-container > div:first-child > div[class~="mx-auto"][class*="max-w-(--thread-content-max-width)"]') {
        return hasShell && !hasHome ? threadContentNode : null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[role="main"]') return hasShell ? [routeMain] : [];
      if (selector === ".dream-task") return routeClasses.has("dream-task") ? [routeMain] : [];
      if (selector === ".dream-home-utility") {
        return utilityClasses.has("dream-home-utility") ? [utilityNode] : [];
      }
      if (!staleSkin) return [];
      if (selector === ".dream-home") return [staleHome];
      if (selector === ".dream-home-shell") return [staleShell];
      return [];
    },
  };
  const context = {
    window: {
      matchMedia() { return { matches: osAppearance === "dark" }; },
    },
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.records = [];
        this.target = null;
        this.options = null;
        observers.push(this);
      }
      observe(target, options = {}) {
        this.target = target;
        this.options = options;
      }
      disconnect() {
        this.target = null;
        this.records = [];
      }
      takeRecords() {
        const records = this.records;
        this.records = [];
        return records;
      }
    },
    URL: {
      createObjectURL() { objectUrlCount += 1; return `blob:fixture-${objectUrlCount}`; },
      revokeObjectURL(value) { revokedUrls.push(value); },
    },
    Blob,
    Uint8Array,
    atob,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout(callback) {
      const timer = nextTimer++;
      timers.set(timer, callback);
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); },
    requestAnimationFrame(callback) {
      const frame = nextAnimationFrame++;
      animationFrames.set(frame, callback);
      return frame;
    },
    cancelAnimationFrame(frame) { animationFrames.delete(frame); },
    getComputedStyle() {
      computedStyleReads += 1;
      return {
        colorScheme: computedColorScheme,
        getPropertyValue() { return ""; },
      };
    },
  };
  if (analysisFixture) {
    context.Image = class {
      naturalWidth = analysisFixture.naturalWidth;
      naturalHeight = analysisFixture.naturalHeight;
      set src(_) { this.onload(); }
    };
  }

  return {
    context,
    nodes,
    observers,
    rootClasses,
    rootStyles,
    revokedUrls,
    routeClasses,
    utilityClasses,
    shellMainClasses,
    getComputedStyleReads() { return computedStyleReads; },
    setShellPresent(value) { hasShell = value; },
    setHomePresent(value) { hasHome = value; },
    replaceThreadContent() { threadContentNode = {}; },
    flushAnimationFrames() {
      const pending = [...animationFrames.values()];
      animationFrames.clear();
      for (const callback of pending) callback(0);
    },
    flushTimers() {
      const pending = [...timers.values()];
      timers.clear();
      for (const callback of pending) callback();
    },
  };
}

const main = createFixture({ shellPresent: true });
const mainResult = vm.runInNewContext(payload, main.context);
assert.equal(mainResult.installed, true);
assert.equal(main.rootClasses.has("codex-dream-skin"), true);
assert.equal(main.rootStyles.get("--dream-art"), 'url("blob:fixture-1")');
assert.equal(main.nodes.has("codex-dream-skin-style"), true);
assert.equal(main.nodes.has("codex-dream-skin-chrome"), true);
assert.equal(main.rootClasses.has("dream-theme-dark"), true);
assert.equal(main.rootClasses.has("dream-art-standard"), true);
assert.equal(main.rootClasses.has("dream-task-ambient"), true);
assert.equal(main.routeClasses.has("dream-task"), true);
assert.equal(main.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(main.rootClasses.has("codex-dream-skin"), false);
assert.equal(main.rootClasses.has("dream-theme-dark"), false);
assert.equal(main.nodes.has("codex-dream-skin-style"), false);
assert.equal(main.nodes.has("codex-dream-skin-chrome"), false);
assert.deepEqual(main.revokedUrls, ["blob:fixture-1"]);

const reinjected = createFixture({ shellPresent: true });
vm.runInNewContext(payload, reinjected.context);
const firstState = reinjected.context.window.__CODEX_DREAM_SKIN_STATE__;
vm.runInNewContext(payload, reinjected.context);
const secondState = reinjected.context.window.__CODEX_DREAM_SKIN_STATE__;
assert.notEqual(secondState.installToken, firstState.installToken);
assert.equal(secondState.artUrl, "blob:fixture-2");
assert.equal(reinjected.rootStyles.get("--dream-art"), 'url("blob:fixture-2")');
assert.deepEqual(reinjected.revokedUrls, ["blob:fixture-1"]);
assert.equal(firstState.cleanup(), false);
assert.equal(secondState.cleanup(), true);

const auxiliary = createFixture({ shellPresent: false, staleSkin: true });
const auxiliaryResult = vm.runInNewContext(payload, auxiliary.context);
assert.equal(auxiliaryResult.installed, true);
assert.equal(auxiliary.rootClasses.has("codex-dream-skin"), false);
assert.equal(auxiliary.rootStyles.has("--dream-art"), false);
assert.equal(auxiliary.nodes.has("codex-dream-skin-style"), false);
assert.equal(auxiliary.nodes.has("codex-dream-skin-chrome"), false);

auxiliary.setShellPresent(true);
auxiliary.context.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(auxiliary.rootClasses.has("codex-dream-skin"), true);
assert.equal(auxiliary.nodes.has("codex-dream-skin-style"), true);
assert.equal(auxiliary.nodes.has("codex-dream-skin-chrome"), true);

const configured = createFixture({
  shellPresent: true,
  homePresent: true,
  utilityPresent: true,
});
const configuredPayload = buildPayload({
  appearance: "light",
  palette: { accent: "#d45a70" },
  art: { focusX: .15, focusY: .8, safeArea: "right", taskMode: "off" },
});
const configuredResult = vm.runInNewContext(configuredPayload, configured.context);
assert.equal(configuredResult.adaptive, true);
assert.equal(configured.rootClasses.has("dream-theme-light"), true);
assert.equal(configured.rootClasses.has("dream-theme-dark"), false);
assert.equal(configured.rootClasses.has("dream-focus-left"), true);
assert.equal(configured.rootClasses.has("dream-safe-right"), true);
assert.equal(configured.rootClasses.has("dream-task-off"), true);
assert.equal(configured.rootStyles.get("--dream-art-position"), "15% 80%");
assert.equal(configured.rootStyles.get("--dream-accent"), "#d45a70");
assert.equal(configured.routeClasses.has("dream-home"), true);
assert.equal(configured.routeClasses.has("dream-task"), false);
assert.equal(configured.utilityClasses.has("dream-home-utility"), true);
assert.equal(configured.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(configured.utilityClasses.has("dream-home-utility"), false);

const analysisPixels = new Uint8ClampedArray(48 * 12 * 4);
for (let index = 0; index < 48 * 12; index += 1) {
  const offset = index * 4;
  const x = index % 48;
  const subject = x >= 34 && x <= 42;
  analysisPixels[offset] = subject ? 210 : 246;
  analysisPixels[offset + 1] = subject ? 84 : 239;
  analysisPixels[offset + 2] = subject ? 112 : 237;
  analysisPixels[offset + 3] = 255;
}
const analyzed = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 1200, naturalHeight: 400, pixels: analysisPixels },
});
vm.runInNewContext(payload, analyzed.context);
await Promise.resolve();
analyzed.flushTimers();
assert.equal(analyzed.rootClasses.has("dream-theme-dark"), true);
assert.equal(analyzed.rootClasses.has("dream-theme-light"), false);
assert.equal(analyzed.rootClasses.has("dream-art-wide"), true);
assert.equal(analyzed.rootClasses.has("dream-task-banner"), true);
assert.equal(analyzed.rootClasses.has("dream-safe-left"), true);
assert.notEqual(analyzed.rootStyles.get("--dream-accent"), "rgb(216 104 119)");

const standardArt = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 800, naturalHeight: 800, pixels: analysisPixels },
});
vm.runInNewContext(payload, standardArt.context);
await Promise.resolve();
standardArt.flushTimers();
assert.equal(standardArt.rootClasses.has("dream-art-standard"), true);
assert.equal(standardArt.rootClasses.has("dream-task-ambient"), true);
assert.equal(standardArt.rootClasses.has("dream-task-banner"), false);

const mediumWide = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 2100, naturalHeight: 1000, pixels: analysisPixels },
});
vm.runInNewContext(payload, mediumWide.context);
await Promise.resolve();
mediumWide.flushTimers();
assert.equal(mediumWide.rootClasses.has("dream-art-wide"), true);
assert.equal(mediumWide.rootClasses.has("dream-task-ambient"), true);
assert.equal(mediumWide.rootClasses.has("dream-task-banner"), false);

const nativeLight = createFixture({ shellPresent: true, shellAppearance: "light" });
vm.runInNewContext(payload, nativeLight.context);
assert.equal(nativeLight.rootClasses.has("dream-theme-light"), true);
assert.equal(nativeLight.rootClasses.has("dream-theme-dark"), false);

const nativeComputedDark = createFixture({
  shellPresent: true,
  shellAppearance: "",
  computedColorScheme: "dark",
  osAppearance: "light",
});
vm.runInNewContext(payload, nativeComputedDark.context);
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-dark"), true);
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-light"), false);
nativeComputedDark.context.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(nativeComputedDark.rootClasses.has("dream-theme-dark"), true);
assert.equal(nativeComputedDark.getComputedStyleReads(), 1,
  "Repeated reconciliation must reuse the cached native appearance.");
const nativeObserver = nativeComputedDark.observers[0];
nativeObserver.takeRecords();
nativeComputedDark.context.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(nativeObserver.takeRecords().length, 0,
  "Sampling the native computed color-scheme must not queue a self-triggering root mutation pass.");

const metadataWide = createFixture({ shellPresent: true });
vm.runInNewContext(buildPayload({ artMetadata: { ratio: 16 / 9 } }), metadataWide.context);
assert.equal(metadataWide.rootClasses.has("dream-art-wide"), true);
assert.equal(metadataWide.rootClasses.has("dream-art-standard"), false);

const responsiveRoute = createFixture({ shellPresent: true, homePresent: true });
vm.runInNewContext(payload, responsiveRoute.context);
assert.equal(responsiveRoute.shellMainClasses.has("dream-home-shell"), true);
responsiveRoute.setHomePresent(false);
responsiveRoute.observers[0].callback([]);
assert.notEqual(
  responsiveRoute.context.window.__CODEX_DREAM_SKIN_STATE__.scheduler.timeout,
  null,
  "Route mutations should schedule one zero-delay leading task.",
);
responsiveRoute.flushTimers();
assert.equal(responsiveRoute.shellMainClasses.has("dream-home-shell"), false);
assert.equal(responsiveRoute.routeClasses.has("dream-task"), true);
assert.equal(
  responsiveRoute.context.window.__CODEX_DREAM_SKIN_STATE__.scheduler.running,
  false,
  "Route mutations should reconcile without a debounce or animation-frame wait.",
);
assert.equal(responsiveRoute.context.window.__CODEX_DREAM_SKIN_STATE__.scheduler.timeout, null);
await Promise.resolve();
responsiveRoute.flushTimers();
responsiveRoute.observers[0].callback([{ type: "childList", target: {} }]);
assert.equal(
  responsiveRoute.context.window.__CODEX_DREAM_SKIN_STATE__.scheduler.timeout,
  null,
  "Ordinary task-message mutations must not schedule a full skin reconciliation.",
);
assert.equal(
  responsiveRoute.context.window.__CODEX_DREAM_SKIN_STATE__.scheduler.ignored,
  1,
);

const taskSwitch = createFixture({ shellPresent: true, homePresent: false });
vm.runInNewContext(payload, taskSwitch.context);
await Promise.resolve();
taskSwitch.flushTimers();
taskSwitch.replaceThreadContent();
taskSwitch.observers[0].callback([{ type: "childList", target: {} }]);
assert.equal(
  taskSwitch.rootClasses.has("dream-route-entering"),
  true,
  "A replacement task thread should reset its readability surface before paint.",
);
assert.notEqual(
  taskSwitch.context.window.__CODEX_DREAM_SKIN_STATE__.scheduler.routeTimeout,
  null,
  "The task-entry fade should begin with a zero-delay timer.",
);
assert.equal(
  taskSwitch.context.window.__CODEX_DREAM_SKIN_STATE__.scheduler.routePulses,
  1,
);
taskSwitch.flushTimers();
assert.equal(taskSwitch.rootClasses.has("dream-route-entering"), false);
assert.equal(taskSwitch.context.window.__CODEX_DREAM_SKIN_STATE__.scheduler.routeTimeout, null);

const appearanceRefresh = createFixture({
  shellPresent: true,
  shellAppearance: "",
  computedColorScheme: "dark",
});
vm.runInNewContext(payload, appearanceRefresh.context);
assert.equal(appearanceRefresh.getComputedStyleReads(), 1);
await Promise.resolve();
appearanceRefresh.flushTimers();
appearanceRefresh.observers[0].callback([{
  type: "attributes",
  attributeName: "class",
  target: appearanceRefresh.context.document.documentElement,
}]);
assert.notEqual(
  appearanceRefresh.context.window.__CODEX_DREAM_SKIN_STATE__.scheduler.timeout,
  null,
  "Native root appearance mutations must still reconcile immediately.",
);
appearanceRefresh.flushTimers();
assert.equal(appearanceRefresh.getComputedStyleReads(), 2);

console.log("PASS: renderer applies adaptive theme metadata and preserves transparent auxiliary windows.");
