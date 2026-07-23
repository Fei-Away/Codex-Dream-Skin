import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { buildPayloadForTheme, earlyPayloadFor } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");

function createFixture() {
  const domReady = [];
  const timers = new Map();
  const intervals = new Map();
  let nextTimer = 1;
  let nextInterval = 1;
  const markers = { shell: false, sidebar: false, main: false, settings: false };
  let root = {};
  const context = {
    window: { installs: [] },
    location: { protocol: "app:" },
    document: {
      get documentElement() { return root; },
      addEventListener(type, callback) { if (type === "DOMContentLoaded") domReady.push(callback); },
      querySelector(selector) {
        if (selector === "main.main-surface") return markers.shell ? {} : null;
        if (selector === "aside.app-shell-left-panel") return markers.sidebar ? {} : null;
        if (selector === "[role=\"main\"]") return markers.main ? {} : null;
        if (selector.includes("appearance-theme") || selector.includes("theme-preview")) {
          return markers.settings ? {} : null;
        }
        return null;
      },
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback) {
      const id = nextInterval++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
  };
  return {
    context,
    markers,
    makeNotReady() { root = null; },
    makeReady() { root = {}; },
    fireDomReady() { for (const callback of [...domReady]) callback(); },
    tick() { for (const callback of [...intervals.values()]) callback(); },
    observers: [],
  };
}

const guarded = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
assert.deepEqual(guarded.context.window.installs, [], "Auxiliary app targets must remain untouched.");
assert.equal(guarded.observers.length, 0, "Early bootstrap must not install a broad MutationObserver.");
guarded.markers.shell = true;
guarded.tick();
assert.deepEqual(guarded.context.window.installs, [], "A shell without its sidebar is not sufficient for identity.");
guarded.markers.sidebar = true;
guarded.tick();
assert.deepEqual(guarded.context.window.installs, ["guarded"]);

const generations = createFixture();
generations.makeNotReady();
generations.markers.shell = true;
generations.markers.sidebar = true;
vm.runInNewContext(earlyPayloadFor('window.installs.push("old")', "old"), generations.context);
vm.runInNewContext(earlyPayloadFor('window.installs.push("new")', "new"), generations.context);
generations.makeReady();
generations.fireDomReady();
assert.deepEqual(
  generations.context.window.installs,
  ["new"],
  "A stale early script must yield to the newest watcher generation.",
);
assert.equal(generations.context.window.__CODEX_DREAM_SKIN_EARLY_APPLIED__, "new");

const earlyStart = source.indexOf("export function earlyPayloadFor");
const earlySource = source.slice(earlyStart, earlyStart + 2200);
assert.ok(earlyStart >= 0, "Early payload helper must remain exported for bootstrap tests.");
assert.doesNotMatch(earlySource, /MutationObserver|childList|subtree/,
  "Early bootstrap must not observe the entire renderer DOM.");
assert.match(earlySource, /DOMContentLoaded/);
assert.match(earlySource, /setInterval\(install, 250\)/);
const discoveryStart = source.indexOf("record.earlyScriptId = await registerEarly");
const probeStart = source.indexOf("const probe = await waitForCodexProbe", discoveryStart);
assert.ok(discoveryStart >= 0 && probeStart > discoveryStart, "Early registration must happen before full shell probing.");
assert.match(
  source,
  /finally\s*\{[\s\S]*Promise\.all\(\[\.\.\.sessions\.values\(\)\][\s\S]*removeEarly\(record\)/,
  "Watcher shutdown must unregister persistent Page scripts before closing CDP sessions.",
);
assert.match(
  source,
  /const earlyApplied = await session\.evaluate\([\s\S]*if \(!earlyApplied\) \{[\s\S]*applyToSession/,
  "The watcher must not run the full payload twice after a successful early install.",
);
assert.match(
  source,
  /const suggestionLabelColorsMatch = visibleSuggestionLabels\.every\(/,
  "Live verification must reject visible home suggestion labels that diverge from the themed card color.",
);
assert.match(source, /visibleSuggestionLabels\.length >= result\.visibleCardCount/);
assert.match(source, /result\.suggestionLabelColorsMatch/);
assert.match(
  source,
  /sky-garden-duo-extension\.css[\s\S]+sky-garden-duo-extension\.js/,
  "The trusted Sky Garden extension must load from dedicated macOS-only assets.",
);
assert.match(
  source,
  /\[\s*"dream-skin\.css",\s*"renderer-inject\.js",\s*"sky-garden-duo-extension\.css",\s*"sky-garden-duo-extension\.js",\s*\]\.includes\(name\)/,
  "The watcher must invalidate cached payloads when either trusted extension asset changes.",
);
assert.match(
  source,
  /const extensionPayload = theme\.id === DUO_THEME_ID[\s\S]+skyGardenExtensionCleanupPayload\(\),[\s\S]+canonicalPayload,[\s\S]+extensionPayload/,
  "Payload composition must clean the optional extension, install the canonical runtime, then install Sky Garden UI.",
);
const removeStart = source.indexOf("async function removeFromSession");
const extensionCleanupStart = source.indexOf("skyGardenExtensionCleanupPayload()", removeStart);
const canonicalCleanupStart = source.indexOf("__CODEX_DREAM_SKIN_DISABLED__", extensionCleanupStart);
assert.ok(
  removeStart >= 0 && extensionCleanupStart > removeStart && canonicalCleanupStart > extensionCleanupStart,
  "Soft removal must clean the trusted extension before removing the canonical runtime.",
);

const duoPayload = await buildPayloadForTheme(path.join(macosRoot, "presets", "preset-sky-garden-duo"));
const genericPayload = await buildPayloadForTheme(path.join(macosRoot, "presets", "preset-gothic-void-crusade"));
new vm.Script(duoPayload.payload);
new vm.Script(genericPayload.payload);
assert.match(duoPayload.payload, /dream-duo-lounge-rig/);
assert.doesNotMatch(genericPayload.payload, /dream-duo-lounge-rig/);

console.log("PASS: early injection is L0-ready, generation-safe, and removed on shutdown.");
