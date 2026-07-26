import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

function contrastRatio(firstHex, secondHex) {
  const luminance = (hex) => {
    const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
    const linear = channels.map((value) => (
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const first = luminance(firstHex);
  const second = luminance(secondHex);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function hexVariable(block, name) {
  const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `Expected ${name} to be a six-digit hex color.`);
  return match[1];
}

function styleDeclaration() {
  const values = new Map();
  return {
    values,
    getPropertyValue(name) { return values.get(name) || ""; },
    setProperty(name, value) { values.set(name, String(value)); },
    removeProperty(name) { values.delete(name); },
    [Symbol.iterator]() { return values.keys(); },
  };
}

function classList(initial) {
  const values = new Set(initial);
  const writes = [];
  return {
    values,
    writes,
    contains(value) { return values.has(value); },
    add(...names) { writes.push(["add", ...names]); names.forEach((name) => values.add(name)); },
    remove(...names) { writes.push(["remove", ...names]); names.forEach((name) => values.delete(name)); },
    toggle(name, enabled) { writes.push(["toggle", name, enabled]); if (enabled) values.add(name); else values.delete(name); },
  };
}

function makeFixture({ nativeAppearance = "dark", settings = false, adopted = true } = {}) {
  const attrs = new Map();
  const rootStyle = styleDeclaration();
  const rootClasses = classList([nativeAppearance === "dark" ? "electron-dark" : "electron-light"]);
  const nodes = new Map();
  const domNodes = new Set();
  const selectorNodes = new Map();
  const observers = [];
  const timers = new Map();
  const intervals = new Map();
  const listeners = new Map();
  const revoked = [];
  let nextId = 0;
  let nextBlob = 0;
  const attributesFor = (values) => [...values].map(([name, value]) => ({ name, value }));
  const makeDomNode = (name, parentElement = null, values = new Map()) => {
    const node = {
      name,
      parentElement,
      get attributes() { return attributesFor(values); },
      getAttribute(attribute) { return values.get(attribute) ?? null; },
      setAttribute(attribute, value) { values.set(attribute, String(value)); },
      removeAttribute(attribute) { values.delete(attribute); },
      appendChild(child) { child.parentElement = node; return child; },
    };
    domNodes.add(node);
    return node;
  };
  const root = makeDomNode("root", null, attrs);
  root.classList = rootClasses;
  root.style = rootStyle;
  root.appendChild = (node) => {
    node.parentElement = root;
    if (node.id) nodes.set(node.id, node);
    return node;
  };
  const body = makeDomNode("body", root);
  body.appendChild = (node) => {
    node.parentElement = body;
    if (node.id) nodes.set(node.id, node);
    return node;
  };
  const register = (selector, node) => {
    const current = selectorNodes.get(selector) || [];
    current.push(node);
    selectorNodes.set(selector, current);
  };
  const partFixtures = {};
  if (!settings) {
    partFixtures.sidebar = makeDomNode("sidebar", body);
    partFixtures.main = makeDomNode("main", body);
    partFixtures.header = makeDomNode("header", body);
    partFixtures.home = makeDomNode("home", partFixtures.main);
    partFixtures.homeHero = makeDomNode("home-hero", partFixtures.home);
    partFixtures.homeIcon = makeDomNode("home-icon", partFixtures.homeHero);
    partFixtures.projectList = makeDomNode("project-list", partFixtures.home);
    partFixtures.thread = makeDomNode("thread", partFixtures.main);
    partFixtures.message = makeDomNode("message", partFixtures.thread);
    partFixtures.composer = makeDomNode("composer", partFixtures.main);
    partFixtures.composerToolbar = makeDomNode("composer-toolbar", partFixtures.composer);
    register("aside.app-shell-left-panel", partFixtures.sidebar);
    register("main.main-surface", partFixtures.main);
    register("header.app-header-tint", partFixtures.header);
    register('[data-testid="home-icon"]', partFixtures.homeIcon);
    register('[role="main"]:has([data-testid="home-icon"])', partFixtures.home);
    register('[role="main"]', partFixtures.home);
    register(".group\\/project-selector", partFixtures.projectList);
    register(".thread-scroll-container", partFixtures.thread);
    register('[data-message-author-role]', partFixtures.message);
    register(".composer-surface-chrome", partFixtures.composer);
    register('.composer-surface-chrome [class*="_footer_"]', partFixtures.composerToolbar);
  }
  const makeStyleNode = () => {
    const node = {
      id: "",
      textContent: "",
      parentElement: null,
      dataset: {},
      remove() { if (node.id) nodes.delete(node.id); node.parentElement = null; },
    };
    return node;
  };
  const document = {
    documentElement: root,
    head: root,
    body,
    adoptedStyleSheets: adopted ? [] : undefined,
    createElement(tag) { return tag === "style" ? makeStyleNode() : { tagName: tag }; },
    getElementById(id) { return nodes.get(id) || null; },
    querySelector(selector) {
      if (settings && (selector.includes("appearance-theme") || selector.includes("theme-preview"))) {
        return makeDomNode(`settings:${selector}`, body);
      }
      return (selectorNodes.get(selector) || [])[0] || null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-ds-part]") {
        return [...domNodes].filter((node) => node.getAttribute?.("data-ds-part") !== null);
      }
      return [...(selectorNodes.get(selector) || [])];
    },
  };
  const navigation = {
    addEventListener(type, callback) { listeners.set(`navigation:${type}`, callback); },
    removeEventListener(type) { listeners.delete(`navigation:${type}`); },
  };
  class MockMutationObserver {
    constructor(callback) { this.callback = callback; this.options = null; this.observations = []; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; this.observations.push({ target, options }); }
    disconnect() { this.disconnected = true; }
  }
  class MockSheet {
    replaceSync(text) { this.text = text; }
  }
  const window = {
    navigation,
    matchMedia() {
      return {
        matches: nativeAppearance === "dark",
        addEventListener(type, callback) { listeners.set(`media:${type}`, callback); },
        removeEventListener(type) { listeners.delete(`media:${type}`); },
      };
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const context = {
    window,
    document,
    MutationObserver: MockMutationObserver,
    CSSStyleSheet: adopted ? MockSheet : undefined,
    Blob,
    Uint8Array,
    atob,
    URL: {
      createObjectURL() { nextBlob += 1; return `blob:fixture-${nextBlob}`; },
      revokeObjectURL(value) { revoked.push(value); },
    },
    performance: { now: () => 1 },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback, delay) { const id = ++nextId; intervals.set(id, { callback, delay }); return id; },
    clearInterval(id) { intervals.delete(id); },
    console,
  };
  const payloadFor = (theme = {}) => {
    const template = fixture.template;
    return template
      .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(".fixture { color: red; }"))
      .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
      .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify({ id: "fixture", appearance: "auto", ...theme }))
      .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify("test"))
      .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify("css-rev"))
      .replace("__DREAM_SKIN_PAYLOAD_REVISION_JSON__", JSON.stringify("payload-rev"));
  };
  const flushTimers = (maximumDelay = Infinity) => {
    for (const [id, timer] of [...timers]) {
      if (timer.delay <= maximumDelay) { timers.delete(id); timer.callback(); }
    }
  };
  const addDynamicMessage = () => {
    const node = makeDomNode(`message-${(selectorNodes.get('[data-message-author-role]') || []).length + 1}`, partFixtures.thread || body);
    register('[data-message-author-role]', node);
    return node;
  };
  return {
    addDynamicMessage, attrs, context, document, domNodes, flushTimers, intervals, listeners,
    nodes, observers, partFixtures, payloadFor, revoked, root, rootClasses, rootStyle, timers, window,
  };
}

function unscopedCssRules(css) {
  const rules = [];
  let start = 0;
  let quote = null;
  let index = 0;
  while (index < css.length) {
    if (!quote && css.startsWith("/*", index)) {
      const end = css.indexOf("*/", index + 2);
      index = end < 0 ? css.length : end + 2;
      continue;
    }
    const character = css[index];
    if (quote) {
      if (character === "\\") index += 2;
      else { if (character === quote) quote = null; index += 1; }
      continue;
    }
    if (character === "\"" || character === "'") { quote = character; index += 1; continue; }
    if (character === "{") {
      const prelude = css.slice(start, index).trim();
      if (prelude && !prelude.startsWith("@") &&
        !prelude.includes('html[data-dream-skin="active"]') &&
        !prelude.includes(':root[data-dream-skin="active"]')) {
        rules.push(prelude);
      }
      start = index + 1;
    } else if (character === "}") {
      start = index + 1;
    }
    index += 1;
  }
  return rules;
}

export async function runRendererRuntimeTest(assetRoot) {
  const template = await fs.readFile(path.join(assetRoot, "renderer-inject.js"), "utf8");
  const css = await fs.readFile(path.join(assetRoot, "dream-skin.css"), "utf8");
  fixture.template = template;
  const darkThemeBlock = css.match(/:root\[data-dream-skin="active"\]\s*\{([\s\S]*?)\n\}/)?.[1];
  const lightThemeBlock = css.match(/html\[data-dream-skin="active"\]\[data-dream-shell="light"\]\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(darkThemeBlock, "Expected the active dark-shell semantic token block.");
  assert.ok(lightThemeBlock, "Expected the active light-shell semantic token block.");
  for (const role of ["danger", "success", "warning", "info"]) {
    assert.ok(
      contrastRatio(
        hexVariable(darkThemeBlock, `--ds-${role}-foreground`),
        hexVariable(darkThemeBlock, `--ds-${role}-surface`),
      ) >= 4.5,
      `Dark-shell ${role} alerts must meet WCAG AA text contrast.`,
    );
    assert.ok(
      contrastRatio(
        hexVariable(lightThemeBlock, `--ds-${role}-foreground`),
        hexVariable(lightThemeBlock, `--ds-${role}-surface`),
      ) >= 4.5,
      `Light-shell ${role} alerts must meet WCAG AA text contrast.`,
    );
  }

  assert.match(template, /adoptedStyleSheets/);
  assert.match(template, /CSSStyleSheet/);
  assert.match(template, /window\.navigation/);
  assert.match(template, /electron-dark/);
  assert.doesNotMatch(template, /electron-opaque|home-suggestion-list-item/,
    "Runtime payload must not carry retired selector documentation/fossils.");
  assert.doesNotMatch(template, /classList\.(add|remove|toggle)/);
  assert.doesNotMatch(template, /getBoundingClientRect|ResizeObserver/);
  assert.match(template, /childList:\s*true/);
  assert.match(template, /subtree:\s*true/);
  // The new contract intentionally keeps the `data-dream-*` attribute names
  // and `--dream-*` custom properties.  Only the retired DOM marker classes
  // and the measured fossil selector must be absent from the canonical CSS.
  assert.doesNotMatch(css, /(?:^|[.#\s])(?:codex-dream-skin|dream-skin-home|dream-home|dream-task)(?:[\s.#:{>]|$)|home-suggestion-list-item/);
  assert.match(css, /html\[data-dream-skin="active"\]/);
  // Home gating must stay single-level: CSS forbids :has() inside :has(),
  // and Chromium drops any rule that nests it (the v1.3.1 regression).  The
  // canonical CSS therefore gates on the :has()-free home-route-css alias.
  assert.match(css, /main\.main-surface:has\(\[role="main"\]\)/);
  assert.match(css, /main\.main-surface:not\(:has\(\[role="main"\]\)\)/);
  assert.doesNotMatch(css, /:has\([^()]*:has\(/);
  assert.doesNotMatch(css,
    /\[aria-label="(?:隐藏边栏|Hide sidebar|返回|Back|前进|Forward)"\]/,
    "Theme CSS must not resize or reposition native titlebar controls.");
  assert.match(css,
    /header\.app-header-tint::before,[\s\S]*?header\.app-header-tint::after,[\s\S]*?main\.main-surface:has\(\[role="main"\]\)::after\s*\{[\s\S]*?content:\s*none\s*!important[\s\S]*?display:\s*none\s*!important/,
    "Task chrome and home composer areas must not carry positioned theme slogans.");
  assert.doesNotMatch(css,
    /content:\s*var\(--dream-skin-(?:chrome-mark|status|quote)/,
    "Retired theme slogans must not be painted into native chrome.");
  assert.match(css, /--ds-task-full-veil/);
  assert.match(css, /data-dream-task-mode="full"/);
  assert.match(css, /background-image:\s*var\(--ds-task-full-veil\),\s*var\(--dream-skin-art\)/);
  assert.match(css,
    /data-dream-shell="light"\]\s*\{[\s\S]*?--vscode-foreground:\s*var\(--ds-text\)[\s\S]*?--color-background-panel:\s*var\(--ds-panel\)[\s\S]*?--color-token-bg-fog:\s*var\(--ds-panel-2\)[\s\S]*?--color-token-main-surface-primary:\s*var\(--ds-panel\)[\s\S]*?--color-token-conversation-body:\s*var\(--ds-muted\)[\s\S]*?--color-token-conversation-summary-trailing:\s*var\(--ds-muted\)[\s\S]*?--color-token-input-background:\s*var\(--ds-input\)[\s\S]*?--color-token-input-foreground:\s*var\(--ds-text\)[\s\S]*?--color-token-input-placeholder-foreground:\s*var\(--ds-muted\)[\s\S]*?--color-token-border:\s*var\(--ds-border\)/,
    "A light skin must bridge native dark-shell text, panel, task-card, conversation, input and border tokens.");
  assert.match(css,
    /\[class~="bg-token-main-surface-primary"\]:has\(form\[id\^="automation-side-panel-form"\]\)\s*\{[\s\S]*?--color-background-panel:\s*var\(--ds-input\)[\s\S]*?--color-token-main-surface-primary:\s*var\(--ds-panel\)[\s\S]*?--color-token-foreground:\s*var\(--ds-text\)[\s\S]*?--color-token-input-foreground:\s*var\(--ds-text\)[\s\S]*?--color-token-input-placeholder-foreground:\s*var\(--ds-muted\)[\s\S]*?--color-token-border:\s*var\(--ds-border\)/,
    "Scheduled-task side panels must not retain electron-dark cards or pale input text under a light skin.");
  assert.match(css,
    /\.loading-shimmer-pure-text\s*\{[\s\S]*?color:\s*var\(--ds-muted\)\s*!important[\s\S]*?-webkit-text-fill-color:\s*var\(--ds-muted\)\s*!important[\s\S]*?\.loading-shimmer-pure-text\s+\*\s*\{[\s\S]*?color:\s*var\(--ds-accent\)\s*!important[\s\S]*?-webkit-text-fill-color:\s*var\(--ds-accent\)\s*!important/,
    "Active conversation summaries must keep readable theme-colored shimmer text.");
  assert.match(css,
    /\[aria-current="page"\]\s*\{[\s\S]*?background:\s*var\(--ds-selected\)[\s\S]*?border:\s*1px solid var\(--ds-accent\)[\s\S]*?box-shadow:[\s\S]*?inset 3px 0 rgb\(var\(--ds-accent-rgb\)/,
    "Selected sidebar rows must use a readable surface plus a solid accent indicator.");
  assert.match(css,
    /\[class~="bg-token-main-surface-primary\/70"\]\s*\{[\s\S]*?background:\s*var\(--ds-selected\)[\s\S]*?color:\s*var\(--ds-text\)/,
    "Native sidebar task cards must not retain the host dark surface under a light skin.");
  assert.doesNotMatch(css, /aside\.app-shell-left-panel\s+nav\s*>\s*div(?::first-child|:nth-child)/,
    "Primary navigation must keep native flow instead of brittle split-card geometry.");
  assert.match(css,
    /aside\.app-shell-left-panel[\s\S]*?nav section:has\(\[role="list"\]\)\s*\{[\s\S]*?margin-inline:\s*8px\s*!important[\s\S]*?border:\s*1px solid var\(--ds-zone-border\)[\s\S]*?background:\s*var\(--ds-zone-surface-raised\)/,
    "Semantic sidebar lists must own distinct raised section surfaces.");
  assert.match(css,
    /aside\.app-shell-left-panel > \[role="separator"\]::before\s*\{[\s\S]*?left:\s*8px\s*!important[\s\S]*?width:\s*1px\s*!important[\s\S]*?pointer-events:\s*none\s*!important/,
    "The native resize target must expose a clear non-interactive visual boundary.");
  assert.match(css,
    /--titlebar-safe-left:[\s\S]*?--titlebar-safe-right:[\s\S]*?--ambient-start:\s*52%[\s\S]*?--ambient-feather:\s*clamp\(240px,\s*24vw,\s*320px\)[\s\S]*?--ds-canvas:\s*var\(--ds-bg\)[\s\S]*?--ds-content-reading-plane:\s*rgb\(var\(--ds-panel-rgb\)\s*\/\s*\.975\)[\s\S]*?--reading-veil:\s*linear-gradient\([\s\S]*?--message-surface:\s*rgb\(var\(--ds-panel-rgb\)\s*\/\s*\.94\)[\s\S]*?--ds-popover:\s*rgb\(var\(--ds-panel-rgb\)\s*\/\s*\.988\)[\s\S]*?--ds-input:\s*rgb\(var\(--ds-panel-rgb\)\s*\/\s*\.985\)[\s\S]*?--composer-surface:\s*rgb\(var\(--ds-panel-rgb\)\s*\/\s*\.92\)[\s\S]*?--ds-selected:[\s\S]*?--ds-hover:[\s\S]*?--ds-pressed:[\s\S]*?--ds-focus:[\s\S]*?--ds-danger:[\s\S]*?--ds-danger-surface:[\s\S]*?--ds-danger-foreground:[\s\S]*?--ds-danger-border:[\s\S]*?--ds-success:[\s\S]*?--ds-success-surface:[\s\S]*?--ds-success-foreground:[\s\S]*?--ds-success-border:[\s\S]*?--ds-warning-surface:[\s\S]*?--ds-warning-foreground:[\s\S]*?--ds-warning-border:[\s\S]*?--ds-info-surface:[\s\S]*?--ds-info-foreground:[\s\S]*?--ds-info-border:[\s\S]*?--ds-zone-surface:[\s\S]*?--ds-zone-surface-raised:[\s\S]*?--ds-zone-border:[\s\S]*?--ds-zone-divider:/,
    "The renderer must expose a complete semantic token layer for surfaces, states and status colors.");
  assert.match(css,
    /--vscode-inputValidation-errorBackground:\s*var\(--ds-danger-surface\)[\s\S]*?--vscode-inputValidation-errorForeground:\s*var\(--ds-danger-foreground\)[\s\S]*?--vscode-inputValidation-errorBorder:\s*var\(--ds-danger-border\)[\s\S]*?--color-token-input-validation-error-background:\s*var\(--ds-danger-surface\)[\s\S]*?--color-token-input-validation-error-foreground:\s*var\(--ds-danger-foreground\)[\s\S]*?--color-token-input-validation-error-border:\s*var\(--ds-danger-border\)/,
    "Native validation tokens must resolve to the skin's semantic error palette.");
  assert.match(css,
    /\[role="alert"\]\.alert-root\[class~="bg-token-dropdown-background"\]\s*\{[\s\S]*?--ds-alert-surface:\s*var\(--ds-info-surface\)[\s\S]*?\[role="alert"\]\.alert-root\[class~="bg-token-input-validation-info-background"\]\s*\{[\s\S]*?--ds-alert-surface:\s*var\(--ds-success-surface\)[\s\S]*?\[role="alert"\]\.alert-root\[class~="bg-token-input-validation-warning-background"\]\s*\{[\s\S]*?--ds-alert-surface:\s*var\(--ds-warning-surface\)[\s\S]*?\[role="alert"\]\.alert-root\[class~="bg-token-input-validation-error-background"\]\s*\{[\s\S]*?--ds-alert-surface:\s*var\(--ds-danger-surface\)/,
    "Every native toast level must resolve to its own semantic alert palette.");
  assert.match(css,
    /\[role="alert"\]\.alert-root\s*\{[\s\S]*?background-color:\s*var\(--ds-alert-surface,\s*var\(--ds-popover\)\)\s*!important[\s\S]*?border-color:\s*var\(--ds-alert-border,\s*var\(--ds-border\)\)\s*!important[\s\S]*?color:\s*var\(--ds-alert-foreground,\s*var\(--ds-text\)\)\s*!important[\s\S]*?--color-token-text-secondary:\s*var\(--ds-alert-foreground,\s*var\(--ds-text\)\)/,
    "Native alerts must carry readable semantic surface, border and inherited foreground roles.");
  assert.match(css,
    /\[role="alert"\]\.alert-root > button\[aria-label\]\s*\{[\s\S]*?color:\s*var\(--ds-alert-foreground,\s*var\(--ds-text\)\)\s*!important[\s\S]*?opacity:\s*\.76\s*!important/,
    "Alert close controls must remain visibly distinct without changing their native hit target.");
  assert.doesNotMatch(css,
    /--ds-art-clear-rail|padding-inline-(?:start|end):\s*var\(--ds-art-clear-rail\)/,
    "Artwork must adapt to the application without reserving or shrinking native content geometry.");
  assert.doesNotMatch(css,
    /data-dream-art-safe(?:-area)?="(?:left|right)"[^{]*\{[^}]*--ds-art-position:/,
    "Safe-side atmosphere metadata must not override the theme's explicit artwork focus point.");
  assert.match(css,
    /@media \(max-width:\s*1120px\)[\s\S]*?--ambient-start:\s*52%/,
    "Narrow windows must preserve the same comfortable full-width reading transition.");
  assert.match(css,
    /main\.main-surface:not\(:has\(\[role="main"\]\)\)\s+article\s*\{[\s\S]*?background:\s*var\(--message-surface\)[\s\S]*?backdrop-filter:\s*blur\(14px\)\s+saturate\(108%\)/,
    "Task messages must remain legible glass surfaces instead of hiding the artwork.");
  assert.match(css,
    /body\s*\{[\s\S]*?background-image:\s*var\(--dream-skin-art\)\s*!important[\s\S]*?main\.main-surface:not\(:has\(\[role="main"\]\)\)\s*\{[\s\S]*?overflow:\s*visible\s*!important[\s\S]*?background:\s*var\(--reading-veil\)\s*!important[\s\S]*?\.thread-scroll-container\s*\{[\s\S]*?background:\s*transparent\s*!important/,
    "Wide ambient tasks must use one body artwork layer plus one main-canvas reading veil.");
  const threadSurfaceBlocks = [...css.matchAll(
    /([^{}]*\.thread-scroll-container[^{}]*)\{([^{}]*)\}/g,
  )];
  assert.ok(threadSurfaceBlocks.length > 0,
    "The renderer CSS fixture must include the native thread surface.");
  for (const [, selector, declarations] of threadSurfaceBlocks) {
    assert.doesNotMatch(
      declarations,
      /(?:^|\n)\s*(?:overflow(?:-[xy])?|clip-path|(?:-webkit-)?mask(?:-image)?)\s*:/,
      `The skin must not override native scrolling or clipping on ${selector.trim()}.`,
    );
  }
  assert.doesNotMatch(css, /calc\(100%\s*-\s*(?:420|240)px\)/,
    "Single-canvas atmosphere must not use viewport-specific right-column breakpoints.");
  assert.match(css,
    /main\.main-surface:not\(:has\(\[role="main"\]\)\)::after\s*\{[\s\S]*?content:\s*none\s*!important[\s\S]*?display:\s*none\s*!important/,
    "Wide ambient task routes must not create an independently bounded artwork window.");
  assert.doesNotMatch(css, /--ds-task-art-window|mask-image:(?!\s*none)/,
    "The task atmosphere must not rely on a second mask with its own edge.");
  assert.match(css,
    /header\.app-header-tint\s*\{[\s\S]*?background:\s*var\(--composer-surface\)\s*!important[\s\S]*?border:\s*0\s*!important[\s\S]*?box-shadow:\s*none\s*!important/,
    "Theme chrome must not draw a full-width divider below the native toolbar.");
  assert.match(css,
    /composer-surface-chrome::before\s*\{[\s\S]*?content:\s*""\s*!important[\s\S]*?border:\s*1px solid var\(--ds-border\)[\s\S]*?pointer-events:\s*none\s*!important[\s\S]*?composer-surface-chrome:focus-within\s*\{[\s\S]*?outline:\s*2px solid var\(--ds-focus\)[\s\S]*?outline-offset:\s*2px/,
    "The composer must expose a stable one-pixel boundary layer and a two-pixel focus ring.");
  assert.match(css,
    /composer-surface-chrome\s*\{[\s\S]{0,260}?isolation:\s*isolate\s*!important[\s\S]{0,120}?z-index:\s*4\s*!important[\s\S]{0,260}?overflow:\s*visible\s*!important[\s\S]{0,260}?clip-path:\s*none\s*!important[\s\S]{0,260}?mask-image:\s*none\s*!important[\s\S]{0,260}?background-clip:\s*padding-box\s*!important[\s\S]{0,260}?background:\s*var\(--composer-surface\)\s*!important[\s\S]{0,180}?backdrop-filter:\s*blur\(20px\)\s+saturate\(108%\)\s*!important/,
    "The composer must remain an independent, complete surface above atmospheric layers.");
  assert.doesNotMatch(css,
    /composer-surface-chrome\s*\{[\s\S]{0,240}?border:\s*0\s*!important/,
    "No composer variant may remove the input boundary.");
  assert.match(css,
    /data-dream-shell="light"\][\s\S]*?composer-surface-chrome p\.placeholder::after\s*\{[\s\S]*?color:\s*var\(--ds-text-secondary\)\s*!important[\s\S]*?opacity:\s*1\s*!important/,
    "Light-shell composer placeholders must keep opaque secondary-text contrast.");
  assert.match(css,
    /:is\(\[role="menu"\],\s*\[role="dialog"\]\)[\s\S]*?background:\s*var\(--ds-popover\)[\s\S]*?border:\s*1px solid var\(--ds-border\)/,
    "Menus and dialogs must use an independent elevated popover surface.");
  // Every home/project selector must stay behind the root skin gate.  A
  // marker-class-to-:has() conversion must never leave native layout rules
  // active after pause/restore.
  const unscoped = unscopedCssRules(css).join("\n");
  assert.doesNotMatch(unscoped, /\[role="main"\]:has\(\[data-testid="home-icon"\]\)/);
  assert.doesNotMatch(unscoped, /\.group\\\/project-selector/);

  const home = makeFixture({ nativeAppearance: "dark" });
  vm.runInNewContext(home.payloadFor({ art: { safeArea: "left", taskMode: "banner" } }), home.context);
  const state = home.window.__CODEX_DREAM_SKIN_STATE__;
  assert.equal(home.attrs.get("data-dream-skin"), "active");
  assert.equal(home.attrs.get("data-dream-shell"), "dark");
  assert.equal(home.attrs.get("data-ds-part"), "root");
  assert.equal(state.styleMode, "adopted");
  assert.equal(home.document.adoptedStyleSheets.length, 1);
  assert.equal(state.scope.baseState, "home");
  assert.equal(state.scope.level, "L1");
  assert.equal(home.rootStyle.values.get("--dream-skin-brand-subtitle"), undefined);
  assert.equal(home.rootStyle.values.get("--dream-skin-status"), undefined);
  assert.equal(home.rootStyle.values.get("--dream-skin-quote"), undefined);
  assert.equal(home.rootStyle.values.get("--ds-theme-surface-radius"), "12px");
  assert.equal(home.rootStyle.values.get("--ds-theme-surface-opacity"), "1");
  assert.equal(home.rootStyle.values.get("--ds-theme-surface-blur"), "0px");
  const publicDefaults = {
    "--ds-theme-font-family": "system",
    "--ds-theme-font-scale": "1",
    "--ds-theme-surface-border-alpha": "0.14",
    "--ds-theme-surface-shadow": "soft",
    "--ds-theme-image-zoom": "1",
    "--ds-theme-image-dim": "0",
    "--ds-theme-image-task-intensity": "0.35",
    "--ds-theme-density-scale": "standard",
    "--ds-theme-motion-level": "standard",
  };
  for (const [variable, expected] of Object.entries(publicDefaults)) {
    assert.equal(home.rootStyle.values.get(variable), expected);
  }
  assert.equal(home.rootStyle.values.get("--ds-theme-image-focus-x"), "0.72");
  assert.equal(home.rootStyle.values.get("--ds-theme-image-focus-y"), "0.5");
  assert.equal(state.metrics.routePasses, 1);
  assert.equal(state.metrics.partPasses, 1);
  assert.equal(state.metrics.layoutReads, 0, "Runtime must not perform layout reads");
  assert.equal(home.rootClasses.writes.length, 0, "Runtime must not write classes");
  const partObserver = home.observers.find((observer) => observer.options?.childList);
  const rootObserver = home.observers.find((observer) => observer.options?.attributes);
  assert.ok(partObserver?.options?.subtree, "Dynamic parts require one subtree child-list observer");
  assert.ok(rootObserver && !rootObserver.options?.childList && !rootObserver.options?.subtree);
  const expectedParts = {
    sidebar: "sidebar",
    main: "main",
    header: "header",
    home: "home",
    homeHero: "home-hero",
    projectList: "project-list",
    thread: "thread",
    message: "message",
    composer: "composer",
    composerToolbar: "composer-toolbar",
  };
  for (const [fixtureKey, part] of Object.entries(expectedParts)) {
    assert.equal(home.partFixtures[fixtureKey].getAttribute("data-ds-part"), part,
      `${part} must be exposed through the public Safe CSS bridge`);
  }
  const dynamicMessage = home.addDynamicMessage();
  partObserver.callback([{ type: "childList" }]);
  home.flushTimers(80);
  assert.equal(dynamicMessage.getAttribute("data-ds-part"), "message");

  const full = makeFixture({ nativeAppearance: "dark" });
  vm.runInNewContext(full.payloadFor({ art: { taskMode: "full" } }), full.context);
  assert.equal(full.attrs.get("data-dream-task-mode"), "full");
  assert.equal(full.attrs.get("data-dream-art-task-mode"), "full");

  const explicitColors = {
    background: "#abc",
    panel: "#abcd",
    panelAlt: "#11223344",
    accent: "#010203",
    accentAlt: "rgba(4, 5, 6, .5)",
    secondary: "rgb(999, 2, 3)",
    highlight: "#abcdef",
    text: "#000",
    muted: "#fff8",
    line: "rgba(7, 8, 9, .25)",
  };
  const explicitLight = makeFixture({ nativeAppearance: "light" });
  vm.runInNewContext(explicitLight.payloadFor({
    appearance: "auto",
    colorMode: "explicit",
    explicitColorKeys: Object.keys(explicitColors),
    colors: explicitColors,
  }), explicitLight.context);
  const renderedColors = {
    background: "--ds-bg",
    panel: "--ds-panel",
    panelAlt: "--ds-panel-2",
    accent: "--ds-green",
    accentAlt: "--ds-lime",
    secondary: "--ds-cyan",
    highlight: "--ds-purple",
    text: "--ds-text",
    muted: "--ds-muted",
    line: "--ds-line",
  };
  for (const [key, variable] of Object.entries(renderedColors)) {
    assert.equal(explicitLight.rootStyle.values.get(variable), explicitColors[key],
      `Light auto appearance must preserve explicit ${key}`);
  }
  const publicColorVariables = {
    "--ds-theme-color-background": "background",
    "--ds-theme-color-panel": "panel",
    "--ds-theme-color-panel-alt": "panelAlt",
    "--ds-theme-color-accent": "accent",
    "--ds-theme-color-accent-alt": "accentAlt",
    "--ds-theme-color-secondary": "secondary",
    "--ds-theme-color-highlight": "highlight",
    "--ds-theme-color-text": "text",
    "--ds-theme-color-muted": "muted",
    "--ds-theme-color-line": "line",
  };
  for (const [variable, colorKey] of Object.entries(publicColorVariables)) {
    assert.equal(explicitLight.rootStyle.values.get(variable), explicitColors[colorKey],
      `${variable} must expose the validated theme color`);
  }
  const renderedRgb = {
    "--ds-bg-rgb": "170 187 204",
    "--ds-panel-rgb": "170 187 204",
    "--ds-panel-2-rgb": "17 34 51",
    "--ds-accent-rgb": "1 2 3",
    "--ds-accent-alt-rgb": "4 5 6",
    "--ds-secondary-rgb": "255 2 3",
    "--ds-highlight-rgb": "171 205 239",
    "--ds-text-rgb": "0 0 0",
    "--ds-muted-rgb": "255 255 255",
    "--ds-line-rgb": "7 8 9",
  };
  for (const [variable, expected] of Object.entries(renderedRgb)) {
    assert.equal(explicitLight.rootStyle.values.get(variable), expected,
      `${variable} must support official hex forms and clamp RGB channels`);
  }

  rootObserver.callback([]);
  home.flushTimers(64);
  assert.equal(state.metrics.routePasses, 1, "Attribute safety pass must not be a route pass");
  const navigationHandler = home.listeners.get("navigation:navigate");
  assert.equal(typeof navigationHandler, "function");
  navigationHandler();
  home.flushTimers(180);
  assert.equal(state.metrics.navigationEvents, 1);
  assert.equal(state.metrics.routePasses, 2);

  const settings = makeFixture({ nativeAppearance: "light", settings: true });
  vm.runInNewContext(settings.payloadFor(), settings.context);
  assert.equal(settings.window.__CODEX_DREAM_SKIN_STATE__.scope.baseState, "settings");
  assert.equal(settings.window.__CODEX_DREAM_SKIN_STATE__.scope.level, "L0");
  assert.equal(settings.attrs.get("data-dream-skin"), "active");
  assert.equal(settings.document.adoptedStyleSheets.length, 1);

  const explicit = makeFixture({ nativeAppearance: "light" });
  const result = vm.runInNewContext(explicit.payloadFor({ appearance: "dark", quote: "TEST QUOTE" }), explicit.context);
  assert.equal(result.shell, "dark", "Explicit appearance must beat native appearance");
  assert.equal(explicit.attrs.get("data-dream-shell"), "dark");
  const oldState = explicit.window.__CODEX_DREAM_SKIN_STATE__;
  vm.runInNewContext(explicit.payloadFor({ appearance: "dark" }), explicit.context);
  assert.equal(oldState.cleanup(), false, "A stale cleanup must not remove the replacement");
  const replacement = explicit.window.__CODEX_DREAM_SKIN_STATE__;
  assert.equal(explicit.document.adoptedStyleSheets.length, 1);
  assert.equal(replacement.cleanup(), true);
  assert.equal(explicit.document.adoptedStyleSheets.length, 0);
  assert.equal(explicit.attrs.size, 0);
  assert.equal(explicit.rootStyle.values.size, 0);
  assert.equal(explicit.window.__CODEX_DREAM_SKIN_STATE__, undefined);
  assert.ok([...explicit.domNodes].every((node) => node.getAttribute?.("data-ds-part") === null));
  assert.deepEqual(explicit.revoked, ["blob:fixture-1", "blob:fixture-2"]);

  const fallback = makeFixture({ nativeAppearance: "dark", adopted: false });
  vm.runInNewContext(fallback.payloadFor(), fallback.context);
  const fallbackState = fallback.window.__CODEX_DREAM_SKIN_STATE__;
  assert.equal(fallbackState.styleMode, "style");
  assert.ok(fallback.nodes.has("codex-dream-skin-style"));
  assert.equal(fallbackState.cleanup(), true);
  assert.equal(fallback.nodes.has("codex-dream-skin-style"), false);

  console.log(`PASS: unified renderer runtime (${path.basename(assetRoot)})`);
}

const fixture = { template: "" };
