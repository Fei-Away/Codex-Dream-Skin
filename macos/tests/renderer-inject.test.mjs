import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const template = await fs.readFile(path.join(macosRoot, "assets", "renderer-inject.js"), "utf8");
const css = await fs.readFile(path.join(macosRoot, "assets", "dream-skin.css"), "utf8");

assert.doesNotMatch(
  css,
  /main\.main-surface\s*>\s*header\.app-header-tint\s*\{[^}]*\b(?:position|z-index)\s*:/,
  "The skin must preserve Codex's native fixed header so the side-panel toggle remains reachable.",
);
assert.doesNotMatch(
  css,
  /main\.main-surface:not\(\.dream-skin-home-shell\)\s*>\s*\*\s*\{[^}]*\bposition\s*:/,
  "Task-route child layering must not overwrite the native header position.",
);

assert.doesNotMatch(
  css,
  /background-image:\s*var\(--dream-skin-art\),\s*var\(--dream-skin-art\)/,
  "The home hero must not stack duplicate copies of the selected image.",
);
assert.match(
  css,
  /data-dream-art-safe="left"[\s\S]{0,140}--ds-art-position:\s*100% var\(--ds-focus-y\);/,
  "A left text-safe image must preserve its right-side subject on narrower windows.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*auto 100% !important;/,
  "Wide home artwork must not leave an unpainted half-card by fitting only to height.",
);
assert.doesNotMatch(
  css,
  /background-size:\s*100% 100%,\s*100% 100%,\s*100% auto;/,
  "Wide task artwork must cover the full route instead of ending above the composer.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,500}body\s*\{[\s\S]{0,500}background-image:\s*var\(--dream-skin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide ambient task artwork should cover the full application window.",
);
assert.match(
  css,
  /data-dream-task-mode="banner"[\s\S]{0,900}body\s*\{[\s\S]{0,500}background-image:\s*var\(--dream-skin-art\) !important;[\s\S]{0,200}background-size:\s*cover !important;/,
  "Wide banner task artwork should use the same full-window wallpaper contract as ambient routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main\.main-surface\.dream-skin-home-shell\)[\s\S]{0,100}body\s*\{[\s\S]{0,300}background-image:\s*var\(--dream-skin-art\) !important;/,
  "Wide home artwork should use the same full-window image as utility routes.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]:has\(main\.main-surface\.dream-skin-home-shell\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide home artwork must honor the configured focal point instead of forcing a centered crop.",
);
assert.match(
  css,
  /data-dream-art-task-mode="ambient"[\s\S]{0,260}data-dream-art-wide="true"\]:has\(main\.main-surface:not\(\.dream-skin-home-shell\)\)[\s\S]{0,120}body\s*\{[\s\S]{0,260}background-position:\s*var\(--ds-art-position\) !important;/,
  "Wide task artwork must retain the same focal point as the home route.",
);
assert.match(
  css,
  /data-dream-art-wide="true"\]\s+\.composer-surface-chrome\s*\{[\s\S]{0,500}backdrop-filter:\s*none !important;/,
  "Wide artwork should use one uniform composer surface without a split blur layer.",
);
assert.match(
  css,
  /--ds-immersive-composer-solid:\s*rgb\(var\(--ds-panel-rgb\) \/ \.74\);/,
  "The light composer should retain enough transparency to reveal the selected artwork.",
);
assert.match(
  css,
  /data-dream-shell="light"\]\[data-dream-art-wide="true"\][\s\S]{0,100}\.composer-surface-chrome\s*\{[\s\S]{0,400}backdrop-filter:\s*blur\(8px\) saturate\(102%\) !important;/,
  "The translucent light composer should softly separate text from detailed artwork.",
);
assert.match(
  template,
  /\[class\*="_homeUtilityBar_"\][\s\S]{0,500}dream-skin-home-utility/,
  "The renderer should give the current native home utility bar a stable theme class.",
);
assert.match(
  template,
  /\[class~="group\/home-suggestions"\]/,
  "The renderer should select the slash-containing native class without fragile CSS escaping.",
);
assert.match(
  css,
  /data-dream-skin-question\]::before\s*\{[\s\S]{0,120}content:\s*attr\(data-dream-skin-question\);/,
  "The compact question should render from the localized DOM attribute instead of hard-coded visible markup.",
);
assert.match(
  css,
  /data-dream-skin-home-grid\]\s*\{[\s\S]{0,160}grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\) !important;/,
  "The marked suggestion grid should use two columns on desktop.",
);
assert.match(
  css,
  /\[class~="absolute"\]\[class~="top-full"\]:has\(> \[data-dream-skin-generated-home-suggestions\]\)[\s\S]{0,260}width:\s*calc\(100% - 52px\) !important;[\s\S]{0,160}transform:\s*translateX\(-50%\) !important;/,
  "Current-renderer fallback suggestions should align with the composer without changing legacy layout.",
);
assert.match(
  css,
  /group\\\/home-suggestions button\s*\{[\s\S]{0,160}min-height:\s*72px !important;/,
  "Desktop home suggestions should not expand into oversized feature cards.",
);
assert.match(
  css,
  /data-dream-skin-home-grid\]\s*>\s*\*\s*\{[\s\S]{0,80}display:\s*block !important;/,
  "All four native suggestions must remain visible despite Codex container-query hiding rules.",
);
assert.match(
  css,
  /data-dream-skin-native-home-card="hidden"\][\s\S]{0,80}display:\s*none !important;/,
  "Native suggestions outside the fixed four-card set should not displace the requested actions.",
);
assert.match(
  css,
  /@media \(max-width:\s*700px\)[\s\S]{0,1400}data-dream-skin-home-grid\]\s*\{[\s\S]{0,100}grid-template-columns:\s*minmax\(0,\s*1fr\) !important;/,
  "The four-action grid must collapse to one column on narrow windows.",
);
assert.match(
  css,
  /\.dream-skin-home:has\(\.dream-skin-home-utility\)[\s\S]{0,120}\.composer-surface-chrome\s*\{[\s\S]{0,180}border-radius:\s*0 0 16px 16px !important;/,
  "The home utility bar and composer should render as one continuous control.",
);
assert.match(
  css,
  /\.composer-surface-chrome button:not\(\[class~="bg-token-foreground"\]\)[\s\S]{0,100}color:\s*var\(--ds-muted\) !important;/,
  "Composer controls must remain readable when Codex native tokens lag behind a forced dark appearance.",
);
assert.match(
  css,
  /\.composer-surface-chrome button:not\(\[class~="bg-token-foreground"\]\) \*\s*\{[\s\S]{0,80}color:\s*currentColor !important;/,
  "Nested labels inside composer controls must inherit the corrected theme color.",
);
assert.match(
  css,
  /home-suggestions button \[class~="text-token-text-primary"\]\s*\{[\s\S]{0,80}color:\s*var\(--ds-text\) !important;/,
  "Home suggestion labels must override native light-shell text tokens with the selected theme color.",
);
assert.match(
  css,
  /\.composer-surface-chrome p\.placeholder::after\s*\{[\s\S]{0,120}color:\s*rgb\(var\(--ds-muted-rgb\) \/ \.82\) !important;[\s\S]{0,80}opacity:\s*1 !important;/,
  "Composer placeholder text must not inherit a stale native color with double opacity.",
);
assert.match(
  css,
  /header\.app-header-tint\s*\{[\s\S]{0,180}background:\s*transparent !important;/,
  "Wide artwork should not paint a separate opaque header band.",
);
assert.match(
  css,
  /\.thread-scroll-container \.bg-gradient-to-t\.from-token-main-surface-primary\s*\{[\s\S]{0,100}background:\s*transparent !important;/,
  "Wide artwork should remove the native opaque fade behind the sticky composer.",
);
assert.match(
  css,
  /div\.sticky:has\(input\[type="text"\]\)[\s\S]{0,100}background:\s*transparent !important;/,
  "Search routes should not retain the native opaque sticky band.",
);
assert.match(
  css,
  /\[class~="bg-token-main-surface-primary"\]\[class~="h-full"\]\[class~="w-full"\][\s\S]{0,100}background:\s*transparent !important;/,
  "Full-size utility route wrappers should not hide the selected artwork.",
);

function createStyleDeclaration() {
  const values = new Map();
  return {
    values,
    getPropertyValue(name) { return values.get(name) ?? ""; },
    setProperty(name, value) { values.set(name, value); },
    removeProperty(name) { values.delete(name); },
  };
}

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    values,
    add(...names) { for (const name of names) values.add(name); },
    remove(...names) { for (const name of names) values.delete(name); },
    contains(name) { return values.has(name); },
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
  };
}

function createFixture(theme, {
  nativeShell = "light",
  analysisFixture = null,
  analysisCache = null,
  homeQuestionText = null,
  nativeSuggestionLabels = [],
  homeMarkup = "legacy",
  currentSuggestionShell = "none",
} = {}) {
  let fixtureShell = nativeShell;
  const nodes = new Map();
  const attributes = new Map();
  const bodyAttributes = new Map();
  const observers = [];
  const resizeObservers = [];
  const timers = new Map();
  let nextTimer = 1;
  let nextBlob = 1;
  const rootStyle = createStyleDeclaration();
  const root = {
    className: nativeShell === "dark" ? "electron-dark" : "electron-light",
    classList: createClassList(),
    style: rootStyle,
    appendChild(node) {
      node.parentElement = root;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
  const body = {
    className: "",
    appendChild(node) {
      node.parentElement = body;
      if (node.id) nodes.set(node.id, node);
    },
    getAttribute(name) { return bodyAttributes.get(name) ?? null; },
    setAttribute(name, value) { bodyAttributes.set(name, String(value)); },
  };
  const shellBox = { left: 280, top: 36, width: 1000, height: 764 };
  const shellMain = {
    classList: createClassList(),
    getBoundingClientRect() {
      return { ...shellBox };
    },
  };
  const createBasicElement = (tagName) => {
    const childNodes = new Map();
    const elementAttributes = new Map();
    const listeners = new Map();
    const element = {
      tagName: String(tagName).toUpperCase(),
      id: "",
      dataset: {},
      style: createStyleDeclaration(),
      classList: createClassList(),
      parentElement: null,
      children: [],
      textContent: "",
      innerText: "",
      innerHTML: "",
      get nextElementSibling() {
        const siblings = element.parentElement?.children ?? [];
        const index = siblings.indexOf(element);
        return index >= 0 ? siblings[index + 1] ?? null : null;
      },
      setAttribute(name, value) { elementAttributes.set(name, String(value)); },
      getAttribute(name) { return elementAttributes.get(name) ?? null; },
      removeAttribute(name) { elementAttributes.delete(name); },
      appendChild(node) {
        node.parentElement = element;
        element.children.push(node);
        return node;
      },
      contains(node) {
        return node === element || element.children.some((child) => child.contains?.(node));
      },
      addEventListener(type, listener) { listeners.set(type, listener); },
      click() { listeners.get("click")?.({ preventDefault() {} }); },
      querySelector(selector) {
        if (/^\[[^\]]+\]$/.test(selector)) return element.querySelectorAll(selector)[0] ?? null;
        if (!childNodes.has(selector)) childNodes.set(selector, { textContent: "" });
        return childNodes.get(selector);
      },
      querySelectorAll(selector) {
        const attr = /^\[([^\]=]+)\]$/.exec(selector)?.[1] ?? null;
        const classToken = /^\[class~="([^"]+)"\]$/.exec(selector)?.[1] ?? null;
        const matches = (node) => selector === "button"
          ? node.tagName === "BUTTON"
          : attr !== null
            ? node.getAttribute?.(attr) !== null
            : classToken !== null && node.classList?.contains(classToken);
        const result = [];
        const visit = (node) => {
          if (matches(node)) result.push(node);
          for (const child of node.children ?? []) visit(child);
        };
        for (const child of element.children) visit(child);
        return result;
      },
      remove() {
        if (element.id) nodes.delete(element.id);
        if (element.parentElement?.children) {
          const index = element.parentElement.children.indexOf(element);
          if (index >= 0) element.parentElement.children.splice(index, 1);
        }
        element.parentElement = null;
      },
    };
    return element;
  };
  const homeQuestionAttributes = new Map();
  const homeQuestion = homeQuestionText === null ? null : createBasicElement("div");
  if (homeQuestion) {
    homeQuestion.textContent = homeQuestionText;
    homeQuestion.getAttribute = (name) => homeQuestionAttributes.get(name) ?? null;
    homeQuestion.setAttribute = (name, value) => homeQuestionAttributes.set(name, String(value));
    homeQuestion.removeAttribute = (name) => homeQuestionAttributes.delete(name);
    homeQuestion.cloneNode = () => ({
      textContent: homeQuestionText,
      querySelectorAll(selector) {
        return selector === "button" ? [{ remove() {} }] : [];
      },
    });
  }
  const suggestionGroup = createBasicElement("section");
  const suggestionContainer = createBasicElement("div");
  const suggestionGrid = createBasicElement("div");
  suggestionGroup.appendChild(suggestionContainer);
  suggestionContainer.appendChild(suggestionGrid);
  for (const label of nativeSuggestionLabels) {
    const wrapper = createBasicElement("div");
    const button = createBasicElement("button");
    button.textContent = label;
    button.innerText = label;
    wrapper.appendChild(button);
    suggestionGrid.appendChild(wrapper);
  }
  const currentHomeHero = createBasicElement("div");
  const currentSuggestionPortal = createBasicElement("div");
  currentSuggestionPortal.classList.add("absolute", "top-full");
  const currentNativeSuggestionGroup = createBasicElement("section");
  currentNativeSuggestionGroup.classList.add("group/home-suggestions");
  const currentNativeSuggestionHeader = createBasicElement("div");
  currentNativeSuggestionHeader.classList.add("group/home-suggestions-header");
  const currentNativeHeaderButton = createBasicElement("button");
  currentNativeHeaderButton.textContent = "Dismiss suggestions";
  currentNativeSuggestionHeader.appendChild(currentNativeHeaderButton);
  currentNativeSuggestionGroup.appendChild(currentNativeSuggestionHeader);
  const currentNativeSuggestionGrid = createBasicElement("div");
  currentNativeSuggestionGrid.classList.add("grid");
  if (currentSuggestionShell === "grid") {
    const motion = createBasicElement("div");
    motion.appendChild(currentNativeSuggestionGrid);
    currentNativeSuggestionGroup.appendChild(motion);
    for (const label of nativeSuggestionLabels) {
      const wrapper = createBasicElement("div");
      const button = createBasicElement("button");
      button.textContent = label;
      button.innerText = label;
      wrapper.appendChild(button);
      currentNativeSuggestionGrid.appendChild(wrapper);
    }
  }
  if (homeQuestion && homeMarkup === "current") {
    currentHomeHero.appendChild(homeQuestion);
    currentHomeHero.appendChild(currentSuggestionPortal);
    if (currentSuggestionShell !== "none") {
      currentSuggestionPortal.appendChild(currentNativeSuggestionGroup);
    }
  }
  const home = homeQuestion ? {
    classList: createClassList(),
    querySelector(selector) {
      if (selector === '[data-feature="game-source"]') return homeQuestion;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[class~="group/home-suggestions"]') {
        return homeMarkup === "legacy"
          ? [suggestionGroup]
          : currentSuggestionPortal.querySelectorAll(selector);
      }
      return [];
    },
  } : null;
  const homeIndicator = home && homeMarkup === "legacy" ? {
    closest(selector) { return selector === '[role="main"]' ? home : null; },
  } : null;

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
    return createBasicElement(tagName);
  };

  const composer = createBasicElement("div");
  composer.focusCount = 0;
  composer.focus = () => { composer.focusCount += 1; };
  const composerWrites = [];

  const document = {
    documentElement: root,
    head: root,
    body,
    createElement,
    getElementById(id) { return nodes.get(id) ?? null; },
    querySelector(selector) {
      if (selector === "main.main-surface" || selector === "main") return shellMain;
      if (selector === '[data-testid="home-icon"]') return homeIndicator;
      if (selector === '.ProseMirror[contenteditable="true"]') return composer;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[role="main"]') return home ? [home] : [];
      if (selector === '[role="main"].dream-skin-home' || selector === ".dream-skin-home") {
        return home?.classList.contains("dream-skin-home") ? [home] : [];
      }
      if (selector === "[data-dream-skin-question]") {
        return homeQuestionAttributes.has("data-dream-skin-question") ? [homeQuestion] : [];
      }
      if (selector === "[data-dream-skin-home-card]" ||
        selector === "[data-dream-skin-native-home-card]") {
        return homeMarkup === "legacy"
          ? suggestionGroup.querySelectorAll(selector)
          : currentSuggestionPortal.querySelectorAll(selector);
      }
      if (selector === "[data-dream-skin-home-suggestions]") {
        if (homeMarkup === "legacy") {
          return suggestionGroup.getAttribute("data-dream-skin-home-suggestions") !== null
            ? [suggestionGroup] : [];
        }
        return currentSuggestionPortal.querySelectorAll(selector);
      }
      if (selector === "[data-dream-skin-generated-home-suggestions]") {
        return currentSuggestionPortal.querySelectorAll(selector);
      }
      if (selector === "[data-dream-skin-empty-home-suggestions]") {
        return currentSuggestionPortal.querySelectorAll(selector);
      }
      if (selector === ".dream-skin-home-shell") {
        return shellMain.classList.contains("dream-skin-home-shell") ? [shellMain] : [];
      }
      return [];
    },
    execCommand(command, _showUi, value) {
      composerWrites.push({ command, value });
      if (command !== "insertText") return false;
      composer.textContent = value;
      composer.innerText = value;
      return true;
    },
  };
  const mediaQuery = {
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  };
  const revokedUrls = [];
  const window = {
    addEventListener() {},
    removeEventListener() {},
    matchMedia() {
      mediaQuery.matches = fixtureShell === "dark";
      return mediaQuery;
    },
  };
  if (analysisCache) window.__CODEX_DREAM_SKIN_ANALYSIS_CACHE__ = analysisCache;
  if (analysisFixture) {
    window.Image = class {
      naturalWidth = analysisFixture.naturalWidth;
      naturalHeight = analysisFixture.naturalHeight;
      set src(_) { this.onload(); }
    };
  }
  const context = {
    window,
    document,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.target = null;
        resizeObservers.push(this);
      }
      observe(target) { this.target = target; }
      disconnect() { this.target = null; }
    },
    URL: {
      createObjectURL() { return `blob:fixture-${nextBlob++}`; },
      revokeObjectURL(value) { revokedUrls.push(value); },
    },
    Blob,
    Uint8Array,
    atob,
    getComputedStyle() {
      const skinShell = root.classList.contains("codex-dream-skin")
        ? (attributes.get("data-dream-shell") || "dark") : fixtureShell;
      return {
        colorScheme: skinShell,
        backgroundColor: fixtureShell === "dark" ? "rgb(24, 24, 27)" : "rgb(250, 250, 250)",
      };
    },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    cancelAnimationFrame() {},
  };
  const payloadFor = (nextTheme, cssText = ".fixture { color: blue; }") => template
    .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(cssText))
    .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
    .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify(nextTheme))
    .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify("test"))
    .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify(cssText))
    .replace(
      "__DREAM_SKIN_PAYLOAD_REVISION_JSON__",
      JSON.stringify(`${nextTheme.id}:${cssText}`),
    );
  const flushTimers = (maximumDelay = Infinity) => {
    const pending = [...timers.entries()].filter(([, timer]) => timer.delay <= maximumDelay);
    for (const [id, timer] of pending) {
      timers.delete(id);
      timer.callback();
    }
  };

  return {
    attributes,
    body,
    composer,
    composerWrites,
    context,
    flushTimers,
    home,
    homeQuestionAttributes,
    nodes,
    observers,
    payload: payloadFor(theme),
    payloadFor,
    revokedUrls,
    resizeObservers,
    root,
    rootStyle,
    shellBox,
    suggestionGrid,
    suggestionGroup,
    currentSuggestionPortal,
    currentNativeHeaderButton,
    currentNativeSuggestionGrid,
    currentNativeSuggestionGroup,
    timers,
    window,
    setNativeShell(value) { fixtureShell = value; },
  };
}

const defaults = createFixture({
  id: "default-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
const defaultResult = vm.runInNewContext(defaults.payload, defaults.context);
assert.equal(defaultResult.installed, true);
assert.equal(defaults.attributes.get("data-dream-shell"), "light");
assert.equal(defaults.attributes.get("data-dream-art-safe-area"), "center");
assert.equal(defaults.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(defaults.attributes.get("data-dream-art-ready"), "false");
assert.equal(defaults.rootStyle.values.get("--dream-art-position"), "50.00% 50.00%");
const defaultMetrics = defaults.window.__CODEX_DREAM_SKIN_STATE__.metrics;
assert.equal(defaultMetrics.rootPasses, 1);
assert.equal(defaultMetrics.routePasses, 1);
assert.equal(defaultMetrics.layoutReads, 1);
for (let index = 0; index < 50; index += 1) defaults.observers[0].callback([]);
assert.equal(defaults.timers.size, 1, "Mutation bursts should coalesce into one scheduled ensure.");
defaults.flushTimers(64);
assert.equal(defaultMetrics.rootPasses, 1, "Subtree mutations must not recompute root theme tokens.");
assert.equal(defaultMetrics.routePasses, 2);
assert.equal(defaultMetrics.layoutReads, 1, "Subtree mutations must not force shell layout reads.");
assert.equal(defaults.resizeObservers.length, 1);
assert.ok(defaults.resizeObservers[0].target);
defaults.shellBox.left = 196;
defaults.shellBox.width = 1084;
defaults.resizeObservers[0].callback([]);
defaults.flushTimers(64);
assert.equal(defaultMetrics.layoutReads, 2, "Shell ResizeObserver changes must refresh chrome geometry.");
const defaultChrome = defaults.nodes.get("codex-dream-skin-chrome");
assert.equal(defaultChrome.style.values.get("left"), "196px");
assert.equal(defaultChrome.style.values.get("width"), "1084px");

const homeTheme = {
  id: "home-question-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
};
const chineseHome = createFixture(homeTheme, {
  homeQuestionText: "我们应该在 中构建什么？",
  nativeSuggestionLabels: ["探索并理解代码", "构建新功能、应用或工具", "审查代码并提出修改建议"],
});
vm.runInNewContext(chineseHome.payload, chineseHome.context);
assert.equal(
  chineseHome.homeQuestionAttributes.get("data-dream-skin-question"),
  "我们应该构建什么？",
  "The Chinese home question should be compacted after excluding the native project button.",
);
assert.equal(chineseHome.home.classList.contains("dream-skin-home"), true);
assert.equal(chineseHome.suggestionGroup.getAttribute("data-dream-skin-home-suggestions"), "zh");
assert.deepEqual(
  chineseHome.suggestionGrid.children.slice(0, 3)
    .map((wrapper) => wrapper.getAttribute("data-dream-skin-native-home-card")),
  ["explore", "build", "review"],
);
let syntheticCards = chineseHome.suggestionGroup.querySelectorAll("[data-dream-skin-home-card]");
assert.equal(syntheticCards.length, 1);
assert.equal(syntheticCards[0].getAttribute("data-dream-skin-home-card"), "fix");
chineseHome.window.__CODEX_DREAM_SKIN_STATE__.ensure({ root: false, route: true });
assert.equal(
  chineseHome.suggestionGroup.querySelectorAll("[data-dream-skin-home-card]").length,
  1,
  "Repeated synchronization must not duplicate the fallback fourth card.",
);
syntheticCards[0].remove();
chineseHome.window.__CODEX_DREAM_SKIN_STATE__.ensure({ root: false, route: true });
syntheticCards = chineseHome.suggestionGroup.querySelectorAll("[data-dream-skin-home-card]");
assert.equal(syntheticCards.length, 1, "A React rerender must not permanently remove the fourth card.");
syntheticCards[0].querySelectorAll("button")[0].click();
assert.equal(chineseHome.composer.focusCount, 1);
assert.deepEqual(chineseHome.composerWrites, [{
  command: "insertText",
  value: "定位并修复这个项目中的问题和失败。",
}]);

const currentChineseHome = createFixture(homeTheme, {
  homeMarkup: "current",
  homeQuestionText: "我们应该在 中做些什么？",
});
vm.runInNewContext(currentChineseHome.payload, currentChineseHome.context);
assert.equal(
  currentChineseHome.home.classList.contains("dream-skin-home"),
  true,
  "The current Codex home route must be recognized without the retired native suggestion group.",
);
assert.equal(
  currentChineseHome.homeQuestionAttributes.get("data-dream-skin-question"),
  "我们应该做些什么？",
  "The current Chinese home question should keep its native wording while moving the project selector.",
);
const currentChineseSuggestions = currentChineseHome.currentSuggestionPortal
  .querySelector("[data-dream-skin-home-suggestions]");
assert.ok(
  currentChineseSuggestions,
  "An empty current Codex suggestion portal should receive the Dream Skin fallback group.",
);
assert.equal(
  currentChineseSuggestions.querySelectorAll("[data-dream-skin-home-card]").length,
  4,
  "The current Codex home route should always receive the complete four-card set.",
);
currentChineseHome.window.__CODEX_DREAM_SKIN_STATE__.ensure({ root: false, route: true });
assert.equal(
  currentChineseHome.currentSuggestionPortal
    .querySelectorAll("[data-dream-skin-home-card]").length,
  4,
  "Repeated synchronization must not duplicate current-renderer fallback cards.",
);

const currentHeaderOnlyHome = createFixture(homeTheme, {
  homeMarkup: "current",
  homeQuestionText: "我们应该在 中做些什么？",
  currentSuggestionShell: "header-only",
});
vm.runInNewContext(currentHeaderOnlyHome.payload, currentHeaderOnlyHome.context);
const headerOnlyGeneratedGroup = currentHeaderOnlyHome.currentSuggestionPortal
  .querySelector("[data-dream-skin-generated-home-suggestions]");
assert.ok(
  headerOnlyGeneratedGroup,
  "A native header without a card grid must not replace the generated four-card group.",
);
assert.equal(
  currentHeaderOnlyHome.currentNativeSuggestionGroup
    .getAttribute("data-dream-skin-empty-home-suggestions"),
  "",
  "An unusable native shell must stay hidden while the fallback grid is active.",
);
assert.equal(
  headerOnlyGeneratedGroup.querySelectorAll("[data-dream-skin-home-card]").length,
  4,
);
assert.equal(
  currentHeaderOnlyHome.currentNativeHeaderButton
    .getAttribute("data-dream-skin-native-home-card"),
  null,
  "Native suggestion controls must never be classified as home cards.",
);

const currentNativeHome = createFixture(homeTheme, {
  homeMarkup: "current",
  homeQuestionText: "我们应该在 中做些什么？",
  currentSuggestionShell: "grid",
  nativeSuggestionLabels: ["探索并理解代码"],
});
vm.runInNewContext(currentNativeHome.payload, currentNativeHome.context);
assert.equal(
  currentNativeHome.currentNativeHeaderButton.getAttribute("data-dream-skin-native-home-card"),
  null,
);
assert.equal(
  currentNativeHome.currentNativeSuggestionGrid
    .querySelectorAll("[data-dream-skin-home-card]").length,
  3,
  "A current native grid should preserve matching React cards and fill only the missing actions.",
);
assert.equal(
  currentNativeHome.currentNativeSuggestionGrid.children[0]
    .getAttribute("data-dream-skin-native-home-card"),
  "explore",
);
assert.equal(
  currentNativeHome.currentSuggestionPortal
    .querySelector("[data-dream-skin-generated-home-suggestions]"),
  null,
  "A usable current native grid should supersede the generated group.",
);
assert.equal(
  currentNativeHome.currentNativeSuggestionGroup
    .getAttribute("data-dream-skin-empty-home-suggestions"),
  null,
);

const currentEnglishHome = createFixture(homeTheme, {
  homeMarkup: "current",
  homeQuestionText: "What should we work on in ",
});
vm.runInNewContext(currentEnglishHome.payload, currentEnglishHome.context);
assert.equal(
  currentEnglishHome.homeQuestionAttributes.get("data-dream-skin-question"),
  "What should we work on?",
  "The current English home question should retain the updated work-on wording.",
);
assert.equal(
  currentEnglishHome.currentSuggestionPortal
    .querySelectorAll("[data-dream-skin-home-card]").length,
  4,
);

const currentUnsupportedHome = createFixture(homeTheme, {
  homeMarkup: "current",
  homeQuestionText: "¿En qué deberíamos trabajar?",
});
vm.runInNewContext(currentUnsupportedHome.payload, currentUnsupportedHome.context);
assert.equal(currentUnsupportedHome.home.classList.contains("dream-skin-home"), true);
assert.equal(currentUnsupportedHome.homeQuestionAttributes.has("data-dream-skin-question"), false);
assert.equal(
  currentUnsupportedHome.currentSuggestionPortal
    .querySelector("[data-dream-skin-generated-home-suggestions]"),
  null,
  "Unknown current locales must preserve the native empty state without English fallback cards.",
);
assert.equal(currentChineseHome.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(
  currentChineseHome.currentSuggestionPortal
    .querySelector("[data-dream-skin-generated-home-suggestions]"),
  null,
  "Cleanup must remove the generated current-renderer suggestion group.",
);

const englishHome = createFixture(homeTheme, {
  homeQuestionText: "What should we build in ?",
  nativeSuggestionLabels: [
    "Explore and understand the code",
    "Build a new feature, app, or tool",
    "Review code and suggest improvements",
    "Fix issues and failures",
  ],
});
vm.runInNewContext(englishHome.payload, englishHome.context);
assert.equal(
  englishHome.homeQuestionAttributes.get("data-dream-skin-question"),
  "What should we build?",
  "The English home question should be compacted after excluding the native project button.",
);
assert.equal(
  englishHome.suggestionGroup.querySelectorAll("[data-dream-skin-home-card]").length,
  0,
  "Four matching native English suggestions should keep their original React click handlers.",
);

const unsupportedHome = createFixture(homeTheme, {
  homeQuestionText: "¿Qué deberíamos construir en ?",
  nativeSuggestionLabels: ["Explorar el código"],
});
vm.runInNewContext(unsupportedHome.payload, unsupportedHome.context);
assert.equal(
  unsupportedHome.homeQuestionAttributes.has("data-dream-skin-question"),
  false,
  "Unknown locales must keep the complete native question instead of rendering text with the project name removed.",
);
assert.equal(unsupportedHome.suggestionGroup.getAttribute("data-dream-skin-home-suggestions"), null);
assert.equal(
  unsupportedHome.suggestionGrid.children[0].getAttribute("data-dream-skin-native-home-card"),
  null,
  "Unknown locales must preserve native suggestions without filtering them.",
);
assert.equal(chineseHome.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(chineseHome.suggestionGroup.querySelectorAll("[data-dream-skin-home-card]").length, 0);
assert.equal(
  chineseHome.suggestionGrid.children[0].getAttribute("data-dream-skin-native-home-card"),
  null,
);

// Auto appearance must continue following the native shell after the skin is
// already installed. The fixture makes the injected root color-scheme win
// whenever our class remains on <html>, so a temporary native probe is needed
// for each light → dark → light transition.
const shellFollow = createFixture({
  id: "shell-follow",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
});
shellFollow.root.className = "";
vm.runInNewContext(shellFollow.payload, shellFollow.context);
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");
shellFollow.setNativeShell("dark");
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "dark");
shellFollow.setNativeShell("light");
shellFollow.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(shellFollow.attributes.get("data-dream-shell"), "light");

defaults.root.className = "";
defaults.body.setAttribute("data-theme", "dark");
defaults.observers[1].callback([{ type: "attributes", target: defaults.body }]);
defaults.flushTimers(64);
assert.equal(defaults.attributes.get("data-dream-shell"), "dark", "Body theme changes must apply without the fallback interval.");

const synchronousWide = createFixture({
  id: "synchronous-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
  artKey: "wide-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
});
vm.runInNewContext(synchronousWide.payload, synchronousWide.context);
assert.equal(synchronousWide.attributes.get("data-dream-art-wide"), "true");
assert.equal(synchronousWide.attributes.get("data-dream-art-aspect"), "wide");
assert.equal(synchronousWide.attributes.get("data-dream-art-task-mode"), "ambient");
assert.equal(synchronousWide.attributes.get("data-dream-art-ready"), "false");

const cachedAnalysis = {
  width: 2400,
  height: 1350,
  ratio: 2400 / 1350,
  wide: true,
  aspect: "wide",
  taskMode: "ambient",
  safeArea: "left",
  focusX: 0.72,
  focusY: 0.48,
  accentRgb: { r: 180, g: 90, b: 110 },
};
const cached = createFixture({
  id: "cached-wide",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
  artKey: "cached-art",
  artMetadata: synchronousWide.window.__CODEX_DREAM_SKIN_STATE__.artMetadata,
}, { analysisCache: new Map([["cached-art", cachedAnalysis]]) });
vm.runInNewContext(cached.payload, cached.context);
assert.equal(cached.attributes.get("data-dream-art-ready"), "true");
assert.equal(cached.attributes.get("data-dream-art-safe-area"), "left");
assert.equal(cached.window.__CODEX_DREAM_SKIN_STATE__.metrics.analysisCacheHits, 1);
assert.equal(cached.window.__CODEX_DREAM_SKIN_STATE__.metrics.analysisRuns, 0);

const previousWideState = synchronousWide.window.__CODEX_DREAM_SKIN_STATE__;
const stableStyle = synchronousWide.nodes.get("codex-dream-skin-style");
vm.runInNewContext(synchronousWide.payloadFor({
  id: "switched-wide",
  appearance: "dark",
  art: { safeArea: "right", taskMode: "ambient" },
  artKey: "switched-art",
  artMetadata: {
    width: 2400,
    height: 1350,
    ratio: 2400 / 1350,
    wide: true,
    aspect: "wide",
    taskMode: "ambient",
  },
}, ".fixture { color: red; }"), synchronousWide.context);
assert.equal(synchronousWide.nodes.get("codex-dream-skin-style"), stableStyle);
assert.equal(stableStyle.textContent, ".fixture { color: red; }");
assert.equal(stableStyle.dataset.dreamSkinVersion, "test");
assert.equal(synchronousWide.rootStyle.values.get("--dream-skin-art"), 'url("blob:fixture-2")');
assert.deepEqual(synchronousWide.revokedUrls, ["blob:fixture-1"]);
assert.equal(previousWideState.cleanup(), false, "An old async cleanup must not remove the new theme.");

const brightPixels = new Uint8ClampedArray(96 * 32 * 4);
for (let offset = 0; offset < brightPixels.length; offset += 4) {
  brightPixels[offset] = 245;
  brightPixels[offset + 1] = 224;
  brightPixels[offset + 2] = 224;
  brightPixels[offset + 3] = 255;
}
const nativeDark = createFixture({
  id: "native-dark-contract",
  appearance: "auto",
  art: { safeArea: "auto", taskMode: "auto" },
}, {
  nativeShell: "dark",
  analysisFixture: { naturalWidth: 2400, naturalHeight: 800, pixels: brightPixels },
});
vm.runInNewContext(nativeDark.payload, nativeDark.context);
await Promise.resolve();
await Promise.resolve();
nativeDark.window.__CODEX_DREAM_SKIN_STATE__.ensure();
assert.equal(nativeDark.window.__CODEX_DREAM_SKIN_STATE__.analysis.shell, "light");
assert.equal(nativeDark.attributes.get("data-dream-shell"), "dark");
assert.match(nativeDark.rootStyle.values.get("--ds-bg"), /^#[0-9a-f]{6}$/);
assert.ok(Number.parseInt(nativeDark.rootStyle.values.get("--ds-bg").slice(1), 16) < 0x303030);

const explicit = createFixture({
  id: "explicit-contract",
  appearance: "dark",
  art: { focusX: 0.15, focusY: 0.8, safeArea: "none", taskMode: "off" },
});
const explicitResult = vm.runInNewContext(explicit.payload, explicit.context);
assert.equal(explicitResult.shell, "dark");
assert.equal(explicit.attributes.get("data-dream-shell"), "dark");
assert.equal(explicit.attributes.get("data-dream-art-safe-area"), "none");
assert.equal(explicit.attributes.get("data-dream-art-safe"), "none");
assert.equal(explicit.attributes.get("data-dream-art-task-mode"), "off");
assert.equal(explicit.rootStyle.values.get("--dream-art-position"), "15.00% 80.00%");
assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__.analysis, null);

const banner = createFixture({
  id: "banner-contract",
  appearance: "auto",
  art: { safeArea: "left", taskMode: "banner" },
  artMetadata: {
    width: 2560,
    height: 1440,
    ratio: 2560 / 1440,
    wide: true,
    aspect: "ultrawide",
    taskMode: "banner",
    safeArea: "left",
    focusX: 0.72,
    focusY: 0.44,
  },
});
vm.runInNewContext(banner.payload, banner.context);
assert.equal(banner.attributes.get("data-dream-art-wide"), "true");
assert.equal(banner.attributes.get("data-dream-art-task-mode"), "banner");
assert.equal(banner.attributes.get("data-dream-task-mode"), "banner");

assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__.cleanup(), true);
assert.equal(explicit.root.classList.contains("codex-dream-skin"), false);
assert.equal(explicit.attributes.has("data-dream-shell"), false);
assert.equal(explicit.attributes.has("data-dream-art-safe-area"), false);
assert.equal(explicit.attributes.has("data-dream-art-task-mode"), false);
assert.equal(explicit.rootStyle.values.has("--dream-art-position"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-style"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-chrome"), false);
assert.deepEqual(explicit.revokedUrls, ["blob:fixture-1"]);
await Promise.resolve();
await Promise.resolve();
assert.equal(explicit.root.classList.contains("codex-dream-skin"), false);
assert.equal(explicit.nodes.has("codex-dream-skin-style"), false);
assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__, undefined);

console.log("PASS: renderer honors adaptive art metadata, fallback, and cleanup behavior.");
