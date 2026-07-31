import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { earlyPayloadFor } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");
const shellSelector = 'main:is(.main-surface, [data-app-shell-main-surface], [class*="_MainContentSurface_"])';

function createFixture() {
  const domReady = [];
  const timers = new Map();
  const intervals = new Map();
  let nextTimer = 1;
  let nextInterval = 1;
  const markers = {
    shell: false,
    sidebar: false,
    main: false,
    settingsPanel: false,
    settings: false,
    genericInput: false,
    branding: false,
  };
  let root = {};
  const context = {
    window: { installs: [] },
    location: { protocol: "app:" },
    document: {
      get documentElement() { return root; },
      addEventListener(type, callback) { if (type === "DOMContentLoaded") domReady.push(callback); },
      querySelector(selector) {
        if (selector === shellSelector) return markers.shell ? {} : null;
        if (selector === "aside.app-shell-left-panel") return markers.sidebar ? {} : null;
        if (selector === "[role=\"main\"]") return markers.main ? {} : null;
        if (selector === "main, [role=\"main\"]") return markers.main ? {} : null;
        if (selector === '[data-settings-panel-slug="general-settings"]') {
          return markers.settingsPanel ? {} : null;
        }
        if (selector.includes("textarea") || selector.includes("contenteditable") || selector.includes("textbox")) {
          return markers.genericInput ? {} : null;
        }
        if (selector.includes("appearance-theme") || selector.includes("theme-preview")) {
          return markers.settings ? {} : null;
        }
        if (selector.includes("app-shell-header-context-menu-surface")) {
          return markers.branding ? {} : null;
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
    brandAsCodex() { markers.branding = true; },
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

const generic = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("generic")', "generic"), generic.context);
generic.markers.main = true;
generic.markers.genericInput = true;
generic.tick();
assert.deepEqual(generic.context.window.installs, [],
  "An unbranded app:// page with generic main/input anchors must remain untouched.");
generic.brandAsCodex();
generic.tick();
assert.deepEqual(generic.context.window.installs, ["generic"],
  "A verified app:// Codex surface with generic main/input anchors must accept newer renderer shells.");

const settingsPanel = createFixture();
vm.runInNewContext(
  earlyPayloadFor('window.installs.push("settings-panel")', "settings-panel"),
  settingsPanel.context,
);
settingsPanel.markers.settingsPanel = true;
settingsPanel.tick();
assert.deepEqual(settingsPanel.context.window.installs, ["settings-panel"],
  "Codex 26.727 Settings must accept its stable general-settings panel without legacy appearance controls.");

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

const earlySource = earlyPayloadFor("", "source-contract");
assert.doesNotMatch(earlySource, /MutationObserver|childList|subtree/,
  "Early bootstrap must not observe the entire renderer DOM.");
assert.doesNotMatch(earlySource, /document\.title|document\.body\?\.innerText|location\.href/,
  "The early bootstrap must not read page title, body text, or URL.");
assert.match(earlySource, /DOMContentLoaded/);
assert.match(earlySource, /setInterval\(install, 250\)/);
const identityProbeStart = source.indexOf("async function probeSession");
const identityProbeSource = source.slice(identityProbeStart, identityProbeStart + 1800);
assert.ok(identityProbeStart >= 0, "The live target probe must remain covered by the identity test.");
const probePrefix = "return session.evaluate(`";
const probePayloadStart = source.indexOf(probePrefix, identityProbeStart) + probePrefix.length;
const probePayloadEnd = source.indexOf("`);", probePayloadStart);
assert.ok(probePayloadStart >= probePrefix.length && probePayloadEnd > probePayloadStart,
  "The live identity expression must remain extractable for behavioral testing.");
const probeTemplate = source.slice(probePayloadStart, probePayloadEnd);
assert.doesNotMatch(probeTemplate, /`/, "The live identity expression must not contain nested template literals.");
const liveProbePayload = vm.runInNewContext(`\`${probeTemplate}\``, {
  selectorLiteral: (key) => JSON.stringify(`[selector-${key}]`),
  stableTestidLiteral: (key) => JSON.stringify(`[data-testid="${key}"]`),
});
const runLiveProbe = ({
  protocol = "app:", settingsPanel: hasSettingsPanel = false,
  genericMain = false, genericInput = false, branding = false,
} = {}) => vm.runInNewContext(liveProbePayload, {
  location: { protocol },
  document: {
    querySelector(selector) {
      if (selector === "[selector-settings-panel]") return hasSettingsPanel ? {} : null;
      if (selector === 'main, [role="main"]') return genericMain ? {} : null;
      if (selector === 'textarea, [contenteditable="true"], [role="textbox"]') {
        return genericInput ? {} : null;
      }
      if (selector === '[data-testid="app-shell-header-context-menu-surface"]') {
        return branding ? {} : null;
      }
      return null;
    },
  },
});
assert.equal(runLiveProbe({ settingsPanel: true }).codex, true,
  "The live probe must accept the Codex 26.727 general Settings panel on app://.");
assert.equal(runLiveProbe({ protocol: "https:", settingsPanel: true }).codex, false,
  "The Settings marker must never identify a non-app target.");
assert.equal(runLiveProbe({ genericMain: true, genericInput: true }).codex, false,
  "The live probe must reject an unbranded generic app target.");
assert.equal(runLiveProbe({ genericMain: true, genericInput: true, branding: true }).codex, true,
  "The live probe may accept generic anchors only with the stable Codex branding marker.");
assert.match(identityProbeSource, /selectorLiteral\("settings-panel"\)/,
  "The live probe must retain the current Settings structural marker.");
assert.match(identityProbeSource, /return Boolean\(main && input && branded\)/,
  "The live target probe must require branding together with both generic anchors.");
assert.match(identityProbeSource, /app-shell-header-context-menu-surface/,
  "The live target probe must use a structural Codex branding marker.");
assert.doesNotMatch(identityProbeSource, /document\.title|document\.body\?\.innerText|location\.href/,
  "The live target probe must not read page title, body text, or URL.");
assert.doesNotMatch(identityProbeSource, /\(main && input\) \|\||\(main && branded\) \|\||\(input && branded\)/);
const registrationStart = source.indexOf("earlyScriptId = await registerEarlyPayload");
const evaluateStart = source.indexOf("await session.evaluate(earlyPayloadFor", registrationStart);
const probeStart = source.indexOf("const probe = await waitForCodexProbe", registrationStart);
assert.ok(registrationStart >= 0 && evaluateStart > registrationStart && probeStart > evaluateStart,
  "New targets must register and run the early payload before full shell probing.");
assert.match(source, /if \(earlyInjectionFallback\) attachLoadFallback\(/,
  "Load-event reinjection must be attached only when early injection falls back.");
assert.match(source, /if \(!fallbackTargets\.get\(id\)\) return;/,
  "Fallback listeners must stay inert after a successful early registration.");
assert.match(source, /Page\.removeScriptToEvaluateOnNewDocument/,
  "Watcher shutdown and theme refresh must unregister persistent Page scripts.");

console.log("PASS: Windows early injection is L0-ready, generation-safe, ordered before probing, and fallback-scoped.");
