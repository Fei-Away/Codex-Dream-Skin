import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

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

function makeFixture({ nativeAppearance = "dark", settings = false, adopted = true, autoMetadata = false } = {}) {
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
  const fetchCalls = [];
  let documentHidden = false;
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
  const shell = {
    children: [],
    prepend(node) { node.parentElement = shell; shell.children.unshift(node); if (node.id) nodes.set(node.id, node); return node; },
    appendChild(node) { node.parentElement = shell; shell.children.push(node); if (node.id) nodes.set(node.id, node); return node; },
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
  const makeMediaNode = (tagName) => {
    const node = {
      tagName,
      id: "",
      parentElement: null,
      dataset: {},
      style: styleDeclaration(),
      children: [],
      listeners: new Map(),
      eventListeners: new Map(),
      src: "",
      readyState: autoMetadata ? 1 : 0,
      loadCalls: 0,
      appendChild(child) { child.parentElement = node; node.children.push(child); if (child.id) nodes.set(child.id, child); return child; },
      replaceChildren(...children) {
        for (const child of node.children) child.parentElement = null;
        node.children = [];
        for (const child of children) node.appendChild(child);
      },
      setAttribute(name, value) { node[name] = String(value); },
      removeAttribute(name) { delete node[name]; },
      addEventListener(type, callback) {
        const callbacks = node.eventListeners.get(type) || new Set();
        callbacks.add(callback);
        node.eventListeners.set(type, callbacks);
        node.listeners.set(type, callback);
      },
      removeEventListener(type, callback) {
        const callbacks = node.eventListeners.get(type);
        if (!callbacks) return;
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          node.eventListeners.delete(type);
          node.listeners.delete(type);
        } else {
          node.listeners.set(type, [...callbacks].at(-1));
        }
      },
      pause() {},
      load() { node.loadCalls += 1; },
      play() { return Promise.resolve(); },
      remove() {
        if (node.id) nodes.delete(node.id);
        const parent = node.parentElement;
        if (Array.isArray(parent?.children)) {
          const index = parent.children.indexOf(node);
          if (index >= 0) parent.children.splice(index, 1);
        }
        node.parentElement = null;
      },
    };
    return node;
  };
  const document = {
    get hidden() { return documentHidden; },
    get visibilityState() { return documentHidden ? "hidden" : "visible"; },
    documentElement: root,
    head: root,
    body,
    adoptedStyleSheets: adopted ? [] : undefined,
    addEventListener(type, callback) { listeners.set(`document:${type}`, callback); },
    removeEventListener(type) { listeners.delete(`document:${type}`); },
    createElement(tag) { return tag === "style" ? makeStyleNode() : makeMediaNode(tag); },
    getElementById(id) { return nodes.get(id) || null; },
    querySelector(selector) {
      if (settings && (selector.includes("appearance-theme") || selector.includes("theme-preview"))) {
        return makeDomNode(`settings:${selector}`, body);
      }
      if (selector === "main.main-surface") return shell;
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
  const FixtureURL = class extends globalThis.URL {};
  FixtureURL.createObjectURL = () => { nextBlob += 1; return `blob:fixture-${nextBlob}`; };
  FixtureURL.revokeObjectURL = (value) => { revoked.push(value); };
  const context = {
    window,
    document,
    MutationObserver: MockMutationObserver,
    CSSStyleSheet: adopted ? MockSheet : undefined,
    Blob,
    Uint8Array,
    atob,
    URL: FixtureURL,
    performance: { now: () => 1 },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback, delay) { const id = ++nextId; intervals.set(id, { callback, delay }); return id; },
    clearInterval(id) { intervals.delete(id); },
    console,
    fetch: async (...args) => {
      fetchCalls.push(args);
      return {
        ok: true,
        blob: async () => new Blob(["fixture-video"], { type: "video/mp4" }),
      };
    },
  };
  const payloadFor = (theme = {}, videoUrl = null) => {
    const template = fixture.template;
    return template
      .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(".fixture { color: red; }"))
      .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify("data:image/png;base64,AA=="))
      .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify({ id: "fixture", appearance: "auto", ...theme }))
      .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify("test"))
      .replace("__DREAM_SKIN_STYLE_REVISION_JSON__", JSON.stringify("css-rev"))
      .replace("__DREAM_SKIN_PAYLOAD_REVISION_JSON__", JSON.stringify("payload-rev"))
      .replace("__DREAM_SKIN_VIDEO_JSON__", JSON.stringify(videoUrl));
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
  const setVisibility = (hidden) => {
    documentHidden = Boolean(hidden);
    listeners.get("document:visibilitychange")?.();
  };
  return {
    addDynamicMessage, attrs, context, document, domNodes, fetchCalls, flushTimers, intervals, listeners,
    nodes, observers, partFixtures, payloadFor, revoked, root, rootClasses, rootStyle, setVisibility,
    shell, timers, window,
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
  assert.match(css, /data-dream-media="video"[\s\S]*background-image: none !important/,
    "Video mode must explicitly disable the static-art background rules.");
  assert.match(template, /video-pending/,
    "Video themes must expose a pending state while the first frame is loading.");
  assert.match(template, /videoGeneration/,
    "Video event handlers must isolate stale media generations.");
  // Home gating must stay single-level: CSS forbids :has() inside :has(),
  // and Chromium drops any rule that nests it (the v1.3.1 regression).  The
  // canonical CSS therefore gates on the :has()-free home-route-css alias.
  assert.match(css, /main\.main-surface:has\(\[role="main"\]\)/);
  assert.match(css, /main\.main-surface:not\(:has\(\[role="main"\]\)\)/);
  assert.doesNotMatch(css, /:has\([^()]*:has\(/);
  assert.match(css, /content:\s*var\(--dream-skin-name[\s\S]{0,180}var\(--dream-skin-brand-subtitle/);
  assert.match(css, /content:\s*var\(--dream-skin-status/);
  assert.match(css, /content:\s*var\(--dream-skin-quote/);
  assert.match(css, /--ds-task-full-veil/);
  assert.match(css, /data-dream-task-mode="full"/);
  assert.match(css, /background-image:\s*var\(--ds-task-full-veil\),\s*var\(--dream-skin-art\)/);
  // Every home/project selector must stay behind the root skin gate.  A
  // marker-class-to-:has() conversion must never leave native layout rules
  // active after pause/restore.
  const unscoped = unscopedCssRules(css).join("\n");
  assert.doesNotMatch(unscoped, /\[role="main"\]:has\(\[data-testid="home-icon"\]\)/);
  assert.doesNotMatch(unscoped, /\.group\\\/project-selector/);
  assert.match(css, /html\[data-dream-skin="active"\][\s\S]*\[role="main"\]:has\(\[data-testid="home-icon"\]\)[^{}]*[\s\S]*\.group\\\/project-selector/,
    "Project-picker styling must remain scoped to the home route.");
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
  assert.equal(home.rootStyle.values.get("--dream-skin-brand-subtitle"), '"CODEX DREAM SKIN"');
  assert.equal(home.rootStyle.values.get("--dream-skin-status"), '"DREAM SKIN ONLINE"');
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

  const video = makeFixture({ nativeAppearance: "dark" });
  vm.runInNewContext(video.payloadFor({}, "http://127.0.0.1:1234/media/0123456789abcdef0123456789abcdef"), video.context);
  const videoState = video.window.__CODEX_DREAM_SKIN_STATE__;
  const stage = video.nodes.get("codex-dream-skin-background-stage");
  assert.equal(video.attrs.get("data-dream-media"), "video-pending");
  assert.equal(video.attrs.get("data-dream-video-ready"), "false");
  assert.ok(stage, "Video must mount a dedicated background stage");
  assert.equal(stage.children.length, 1, "Video mode must use one media element");
  assert.equal(stage.children[0].tagName, "video");
  assert.equal(stage.children[0].loop, true, "Video backgrounds must loop natively");
  for (let attempt = 0; attempt < 24 && !stage.children[0].src; attempt += 1) {
    await Promise.resolve();
  }
  assert.match(stage.children[0].src, /^blob:fixture-/);
  stage.children[0].listeners.get("loadedmetadata")();
  await Promise.resolve();
  stage.children[0].listeners.get("loadeddata")();
  assert.equal(video.attrs.get("data-dream-media"), "video");
  assert.equal(video.attrs.get("data-dream-video-ready"), "true");
  assert.equal("poster" in stage.children[0], false,
    "The poster must be removed after the first decoded frame.");
  assert.equal(stage.children[0].style.opacity, "",
    "The first ready video must clear its pending inline visibility guard.");
  assert.deepEqual(
    [...videoState.mediaTransitions].map((entry) => entry.state),
    ["video-pending", "video"],
    "Initial video load must expose one pending state followed by the ready state.",
  );
  const transientAbort = stage.children[0].listeners.get("abort");
  const loadCallsBeforeAbort = stage.children[0].loadCalls;
  transientAbort();
  assert.equal(video.attrs.get("data-dream-media"), "video",
    "A transient abort must not expose the image fallback.");
  video.flushTimers(500);
  await Promise.resolve();
  assert.equal(stage.children[0].loadCalls, loadCallsBeforeAbort,
    "A transient abort must resume playback without reloading the source and exposing its poster.");
  const endedHandler = stage.children[0].listeners.get("ended");
  assert.equal(typeof endedHandler, "function", "Video backgrounds must recover from an unexpected ended event");
  endedHandler();
  await Promise.resolve();
  assert.equal(video.attrs.get("data-dream-video-ready"), "true");
  assert.equal(video.attrs.get("data-dream-media"), "video");
  assert.equal(video.attrs.get("data-dream-video-ready"), "true");
  assert.match(stage.children[0].src, /^blob:fixture-/);
  assert.equal(video.fetchCalls[0][1].headers["X-Codex-Dream-Skin-Token"],
    "0123456789abcdef0123456789abcdef");
  const transientPlaybackError = Object.assign(new Error("background media was interrupted"), {
    name: "AbortError",
  });
  stage.children[0].listeners.get("error")(transientPlaybackError);
  assert.equal(videoState.videoFailed, false,
    "A recoverable playback error must not race its scheduled retry with image fallback.");
  video.flushTimers(500);
  await Promise.resolve();
  assert.equal(video.attrs.get("data-dream-media"), "video");
  video.setVisibility(true);
  for (let attempt = 0; attempt < 25; attempt += 1) transientAbort();
  video.flushTimers(500);
  await Promise.resolve();
  assert.equal(videoState.videoFailed, false,
    "A hidden renderer must not exhaust the finite playback retry budget.");
  assert.equal(videoState.videoReady, true,
    "Suspending a ready hidden video must preserve the last known good frame state.");
  assert.equal(video.timers.size, 0,
    "Hidden playback failures must wait for visibilitychange instead of polling.");
  video.setVisibility(false);
  await Promise.resolve();
  assert.equal(videoState.videoReady, true,
    "Visibility restoration must resume the existing video without image fallback.");
  const previousVideoState = videoState;
  const previousVideoStage = stage;
  const previousVideo = stage.children[0];
  const previousVideoError = stage.children[0].listeners.get("error");
  const staleVideo = video.document.createElement("video");
  staleVideo.poster = "blob:stale-poster";
  stage.appendChild(staleVideo);
  vm.runInNewContext(video.payloadFor({}, "http://127.0.0.1:1234/media/fedcba9876543210fedcba9876543210"), video.context);
  const replacementState = video.window.__CODEX_DREAM_SKIN_STATE__;
  const replacementStage = video.nodes.get("codex-dream-skin-background-stage");
  const replacementVideo = replacementStage.children.at(-1);
  assert.notEqual(replacementState, previousVideoState);
  assert.equal(replacementStage, previousVideoStage,
    "A replacement video must reuse the mounted stage rather than its parent shell.");
  assert.equal(previousVideo.parentElement, previousVideoStage,
    "The previous video must remain mounted until the replacement is ready.");
  assert.equal(staleVideo.parentElement, null,
    "A replacement must discard any video left by an older superseded handoff.");
  assert.equal(previousVideo.eventListeners.size, 0,
    "A handed-off video must not retain listeners from its superseded runtime.");
  assert.equal(video.attrs.get("data-dream-media"), "video",
    "A ready previous video must remain the displayed medium during replacement loading.");
  assert.equal(replacementVideo.style.opacity, "0",
    "A pending replacement must not expose its poster over the previous video.");
  assert.deepEqual(
    [...replacementState.mediaTransitions].map((entry) => entry.state),
    ["video"],
    "A ready handoff must never transition the replacement runtime through image or pending display.",
  );
  previousVideoError(new Error("detached old video error"));
  assert.equal(video.attrs.get("data-dream-media"), "video",
    "An old video's late error must not hide the ready handoff or fail the replacement generation.");
  assert.equal(video.window.__CODEX_DREAM_SKIN_STATE__.videoFailed, false);
  for (let attempt = 0; attempt < 24 && !replacementVideo.src; attempt += 1) {
    await Promise.resolve();
  }
  assert.match(replacementVideo.src, /^blob:fixture-/);
  replacementVideo.listeners.get("loadedmetadata")();
  await Promise.resolve();
  replacementVideo.listeners.get("loadeddata")();
  assert.equal(replacementVideo.style.opacity, "",
    "The replacement visibility guard must clear only after its first frame.");
  assert.equal(
    replacementState.mediaTransitions.some((entry) => entry.state !== "video"),
    false,
    "A successful video-to-video handoff must keep video as the displayed medium throughout.",
  );
  assert.equal(previousVideo.parentElement, null,
    "The previous video must be released after the replacement becomes ready.");
  assert.equal(replacementStage.children.length, 1,
    "A completed handoff must leave exactly one video in the background stage.");
  assert.equal(video.attrs.get("data-dream-media"), "video");
  assert.equal(replacementState.cleanup(), true);
  assert.equal(video.nodes.has("codex-dream-skin-background-stage"), false);

  const blobVideo = makeFixture({ nativeAppearance: "dark", autoMetadata: true });
  vm.runInNewContext(blobVideo.payloadFor({}, {
    mode: "blob",
    fallbackUrl: "http://127.0.0.1:1234/media/0123456789abcdef0123456789abcdef",
  }), blobVideo.context);
  const blobState = blobVideo.window.__CODEX_DREAM_SKIN_STATE__;
  const blobInput = blobVideo.nodes.get("codex-dream-skin-video-input");
  assert.equal(blobState.videoMode, "blob");
  assert.equal(blobInput.type, "file");
  assert.equal(blobInput.accept, "video/mp4");
  blobInput.files = [{ name: "fixture.mp4", type: "video/mp4" }];
  assert.equal(await blobState.attachVideoFile(), true, "CDP-provided file input must attach as a Blob URL");
  const blobStage = blobVideo.nodes.get("codex-dream-skin-background-stage");
  assert.ok(blobStage, "Blob video must mount a dedicated background stage");
  assert.equal(blobStage.children.length, 1, "Blob video mode must use one media element");
  assert.match(blobStage.children[0].src, /^blob:fixture-/);
  assert.equal(blobVideo.fetchCalls.length, 0, "Blob-first mode must not fetch the loopback fallback eagerly");
  assert.equal(blobState.cleanup(), true);
  assert.equal(blobVideo.nodes.has("codex-dream-skin-video-input"), false);


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
