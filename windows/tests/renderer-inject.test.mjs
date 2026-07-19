import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(windowsRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(windowsRoot, "assets", "dream-skin.css"), "utf8");
const buildPayload = (config = {}, subjectDataUrl = null) => template
  .replace("__DREAM_CSS_JSON__", () => JSON.stringify(".fixture { color: blue; }"))
  .replace("__DREAM_ART_JSON__", () => JSON.stringify("data:image/png;base64,AA=="))
  .replace("__DREAM_SUBJECT_JSON__", () => JSON.stringify(subjectDataUrl))
  .replace("__DREAM_THEME_JSON__", () => JSON.stringify(config))
  .replace("__DREAM_SELECTORS_JSON__", () => JSON.stringify({
    shell: ["main.main-surface", "main"],
    sidebar: ["aside.app-shell-left-panel", "aside"],
    composer: [".composer-surface-chrome", '[contenteditable="true"]', "textarea"],
    main: ['[role="main"]', "main"],
    home: ['[role="main"]:has([data-testid="home-icon"])'],
    utility: ['[class*="_homeUtilityBar_"]'],
  }));
const payload = buildPayload();

assert.doesNotMatch(
  css,
  /main\.main-surface\s*>\s*header\.app-header-tint\s*\{[^}]*\b(?:position|z-index)\s*:/,
  "The skin must preserve Codex's native fixed header so the side-panel toggle remains reachable.",
);

function createFixture({
  shellPresent,
  modernMainPresent = false,
  entryPage = false,
  entryHref = null,
  staleSkin = false,
  homePresent = false,
  utilityPresent = false,
  shellAppearance = "dark",
  computedColorScheme = "",
  osAppearance = "light",
  analysisFixture = null,
  resolvedColors = {},
  motionFixture = null,
}) {
  const nodes = new Map();
  const rootClasses = new Set(staleSkin ? ["codex-dream-skin"] : []);
  const rootStyles = new Map(staleSkin ? [["--dream-art", "url(\"blob:stale\")"]] : []);
  const revokedUrls = [];
  const observers = [];
  let objectUrlCount = 0;
  let hasShell = shellPresent;
  let root;
  const motionFrames = [];
  if (motionFixture) {
    motionFixture.draws = [];
    motionFixture.rotations = [];
  }

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
  const shellMain = {
    classList: makeClassList(),
    getBoundingClientRect() {
      return { left: 290, top: 36, width: 990, height: 784 };
    },
  };
  const modernMainClasses = new Set();
  const modernMain = {
    classList: makeClassList(modernMainClasses),
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1280, height: 820 };
    },
  };
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
    if (tagName === "canvas" && motionFixture) {
      let rotation = 0;
      const rotationStack = [];
      const canvas = {
        id: "",
        width: 0,
        height: 0,
        style: {},
        parentElement: null,
        setAttribute() {},
        remove() { nodes.delete(this.id); },
      };
      const context = {
        setTransform() { rotation = 0; },
        clearRect() {},
        fillRect() {},
        beginPath() {},
        closePath() {},
        moveTo() {},
        lineTo() {},
        bezierCurveTo() {},
        arc() {},
        clip() {},
        stroke() {},
        fill() {},
        translate() {},
        scale() {},
        save() { rotationStack.push(rotation); },
        restore() { rotation = rotationStack.pop() ?? 0; },
        rotate(value) {
          rotation += value;
          motionFixture.rotations.push(value);
        },
        drawImage(...args) {
          motionFixture.draws.push({ args, rotation });
        },
        createLinearGradient() { return { addColorStop() {} }; },
        getImageData() {
          const pixels = new Uint8ClampedArray(Math.max(1, canvas.width * canvas.height) * 4);
          for (let offset = 0; offset < pixels.length; offset += 4) {
            pixels[offset] = 174;
            pixels[offset + 1] = 211;
            pixels[offset + 2] = 226;
            pixels[offset + 3] = 255;
          }
          return { data: pixels };
        },
      };
      canvas.getContext = () => context;
      return canvas;
    }
    if (tagName === "canvas" && Object.keys(resolvedColors).length) {
      const colors = new Map([
        ["#010203", [1, 2, 3, 255]],
        ["#040506", [4, 5, 6, 255]],
        ...Object.entries(resolvedColors),
      ]);
      let serialized = "#000000";
      let pixels = [0, 0, 0, 255];
      const context = {
        clearRect() { pixels = [0, 0, 0, 0]; },
        fillRect() {},
        getImageData() { return { data: Uint8ClampedArray.from(pixels) }; },
      };
      Object.defineProperty(context, "fillStyle", {
        get() { return serialized; },
        set(value) {
          const next = colors.get(String(value));
          if (!next) return;
          serialized = String(value);
          pixels = next;
        },
      });
      return { width: 0, height: 0, getContext() { return context; } };
    }
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
    const children = [];
    return {
      id: "",
      dataset: {},
      style: {},
      classList: makeClassList(),
      parentElement: null,
      textContent: "",
      innerHTML: "",
      children,
      setAttribute() {},
      appendChild(node) {
        node.parentElement = this;
        children.push(node);
        if (node.id) nodes.set(node.id, node);
      },
      remove() {
        nodes.delete(this.id);
        if (this.parentElement?.children) {
          const index = this.parentElement.children.indexOf(this);
          if (index >= 0) this.parentElement.children.splice(index, 1);
        }
      },
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
    title: entryPage || entryHref !== null ? "Codex" : "Auxiliary",
    hidden: false,
    createElement,
    addEventListener() {},
    removeEventListener() {},
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector === "main.main-surface") return hasShell ? shellMain : null;
      if (selector === "main") return modernMainPresent ? modernMain : null;
      if (selector === "aside.app-shell-left-panel") return hasShell ? {} : null;
      if (selector === '[role="main"]:has([data-testid="home-icon"])') {
        return hasShell && homePresent ? routeMain : null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "main.main-surface") return hasShell ? [shellMain] : [];
      if (selector === "main") return modernMainPresent ? [modernMain] : [];
      if (selector === '[role="main"]:has([data-testid="home-icon"])') {
        return hasShell && homePresent ? [routeMain] : [];
      }
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
      innerWidth: motionFixture ? 1920 : undefined,
      innerHeight: motionFixture ? 1080 : undefined,
      devicePixelRatio: 1,
      addEventListener() {},
      removeEventListener() {},
      requestAnimationFrame: motionFixture
        ? (callback) => { motionFrames.push(callback); return motionFrames.length; }
        : undefined,
      cancelAnimationFrame() {},
      matchMedia() { return { matches: osAppearance === "dark" }; },
    },
    document,
    location: {
      protocol: "app:",
      href: entryHref ?? (entryPage ? "app://-/index.html" : "app://-/auxiliary.html"),
    },
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
    setTimeout: () => 2,
    clearTimeout: () => {},
    getComputedStyle() { return { colorScheme: computedColorScheme }; },
  };
  if (analysisFixture || motionFixture) {
    context.Image = class {
      naturalWidth = analysisFixture?.naturalWidth ?? 1920;
      naturalHeight = analysisFixture?.naturalHeight ?? 1080;
      width = this.naturalWidth;
      height = this.naturalHeight;
      set src(_) { this.onload?.(); }
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
    modernMainClasses,
    utilityClasses,
    flushMotionFrame(timestamp) {
      const callback = motionFrames.shift();
      assert.equal(typeof callback, "function", "Expected a queued animation frame.");
      callback(timestamp);
    },
    setShellPresent(value) { hasShell = value; },
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

const modernMain = createFixture({ shellPresent: false, modernMainPresent: true, entryPage: true });
const modernMainResult = vm.runInNewContext(payload, modernMain.context);
assert.equal(modernMainResult.installed, true);
assert.equal(modernMain.rootClasses.has("codex-dream-skin"), true);
assert.equal(modernMain.modernMainClasses.has("dream-task"), true);

const routedCompact = createFixture({
  shellPresent: false,
  modernMainPresent: true,
  entryHref: "app://-/index.html?initialRoute=%2Favatar-overlay#compact",
});
vm.runInNewContext(payload, routedCompact.context);
assert.equal(routedCompact.rootClasses.has("codex-dream-skin"), true,
  "A routed compact Codex window must receive the wallpaper.");
assert.equal(routedCompact.nodes.has("codex-dream-skin-chrome"), true);

const entryLookalike = createFixture({
  shellPresent: false,
  modernMainPresent: true,
  entryHref: "app://-/index.html/auxiliary?initialRoute=%2Favatar-overlay",
});
vm.runInNewContext(payload, entryLookalike.context);
assert.equal(entryLookalike.rootClasses.has("codex-dream-skin"), false,
  "A lookalike auxiliary path must remain unskinned.");

const configured = createFixture({
  shellPresent: true,
  homePresent: true,
  utilityPresent: true,
  resolvedColors: { "#d45a70": [212, 90, 112, 255] },
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
assert.equal(configured.rootStyles.get("--dream-accent-ink"), "rgb(0 0 0)");
assert.equal(configured.routeClasses.has("dream-home"), true);
assert.equal(configured.routeClasses.has("dream-task"), false);
assert.equal(configured.utilityClasses.has("dream-home-utility"), true);
assert.equal(configured.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(configured.utilityClasses.has("dream-home-utility"), false);

const accentContrastCases = [
  { accent: "#fff", rgba: [255, 255, 255, 255], ink: "rgb(0 0 0)" },
  { accent: "#000", rgba: [0, 0, 0, 255], ink: "rgb(255 255 255)" },
  { accent: "rgb(128 128 128)", rgba: [128, 128, 128, 255], ink: "rgb(0 0 0)" },
  { accent: "hsl(240 100% 25%)", rgba: [0, 0, 128, 255], ink: "rgb(255 255 255)" },
  { accent: "oklch(0.9 0.1 100)", rgba: [244, 224, 166, 255], ink: "rgb(0 0 0)" },
];
for (const { accent, rgba, ink } of accentContrastCases) {
  const fixture = createFixture({ shellPresent: true, resolvedColors: { [accent]: rgba } });
  vm.runInNewContext(buildPayload({
    appearance: "light",
    palette: { accent },
  }), fixture.context);
  assert.equal(fixture.rootStyles.get("--dream-accent"), accent);
  assert.equal(fixture.rootStyles.get("--dream-accent-ink"), ink,
    `Accent ${accent} must select the higher-contrast WCAG black or white foreground.`);
}

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
assert.equal(standardArt.rootClasses.has("dream-art-standard"), true);
assert.equal(standardArt.rootClasses.has("dream-task-ambient"), true);
assert.equal(standardArt.rootClasses.has("dream-task-banner"), false);

const mediumWide = createFixture({
  shellPresent: true,
  analysisFixture: { naturalWidth: 2100, naturalHeight: 1000, pixels: analysisPixels },
});
vm.runInNewContext(payload, mediumWide.context);
await Promise.resolve();
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
const nativeObserver = nativeComputedDark.observers[0];
nativeObserver.takeRecords();
nativeComputedDark.context.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(nativeObserver.takeRecords().length, 0,
  "Sampling the native computed color-scheme must not queue a self-triggering root mutation pass.");

const metadataWide = createFixture({ shellPresent: true });
vm.runInNewContext(buildPayload({ artMetadata: { ratio: 16 / 9 } }), metadataWide.context);
assert.equal(metadataWide.rootClasses.has("dream-art-wide"), true);
assert.equal(metadataWide.rootClasses.has("dream-art-standard"), false);

const animated = createFixture({ shellPresent: true });
const animatedResult = vm.runInNewContext(buildPayload({
  motion: {
    enabled: true,
    preset: "concert",
    intensity: .72,
    speed: .52,
    parallax: .3,
    particles: true,
    waveform: true,
    pauseWhenHidden: true,
  },
}, "data:image/png;base64,AA=="), animated.context);
assert.equal(animatedResult.motion, true);
assert.equal(animated.rootClasses.has("dream-motion-active"), true);
assert.equal(animated.rootClasses.has("dream-motion-concert"), true);
assert.equal(animated.nodes.has("codex-dream-skin-motion"), true);
assert.equal(Boolean(animated.context.window.__CODEX_DREAM_SKIN_STATE__.motion), true);
assert.equal(animated.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.deepEqual(animated.revokedUrls, ["blob:fixture-1", "blob:fixture-2"]);

const texturedHairCanvas = {};
const texturedHair = createFixture({ shellPresent: true, motionFixture: texturedHairCanvas });
vm.runInNewContext(buildPayload({
  motion: {
    enabled: true,
    preset: "concert",
    intensity: .72,
    speed: .52,
    parallax: .3,
    particles: false,
    waveform: false,
    pauseWhenHidden: true,
  },
}, "data:image/png;base64,AA=="), texturedHair.context);
assert.equal(texturedHair.context.window.__CODEX_DREAM_SKIN_STATE__.motion.hairTextureReady, true);
assert.equal(texturedHair.context.window.__CODEX_DREAM_SKIN_STATE__.motion.hairTextureCount, 5);
texturedHairCanvas.draws.length = 0;
texturedHair.flushMotionFrame(1000);
const firstHairFrame = texturedHairCanvas.draws
  .filter(({ args }) => args.length === 9)
  .map(({ rotation }) => Number(rotation.toFixed(6)));
assert.equal(firstHairFrame.length, 5, "Every hair lock must draw real subject-image texture.");
texturedHairCanvas.draws.length = 0;
texturedHair.flushMotionFrame(1800);
const secondHairFrame = texturedHairCanvas.draws
  .filter(({ args }) => args.length === 9)
  .map(({ rotation }) => Number(rotation.toFixed(6)));
assert.equal(secondHairFrame.length, 5);
assert.notDeepEqual(secondHairFrame, firstHairFrame,
  "Hair texture transforms must change over time instead of remaining a static highlight.");
assert.equal(texturedHair.context.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);

console.log("PASS: renderer applies adaptive theme metadata and preserves transparent auxiliary windows.");
