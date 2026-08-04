import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  classifyPetActivityTarget,
  earlyPayloadFor,
  isCodexRendererCandidateTarget,
  petActivityCompatibilityPayloadFor,
} from "../scripts/injector.mjs";

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

const petTarget = (url, title = "Codex Pet Composition Surface") => ({
  type: "page",
  title,
  url,
});
assert.equal(classifyPetActivityTarget(petTarget(
  "app://-/avatar-overlay-composition-surface.html?surfaceId=activity-slot-0",
)), "activity-slot-0");
assert.equal(classifyPetActivityTarget(petTarget(
  "app://-/avatar-overlay-composition-surface.html?surfaceId=activity-slot-3",
)), "activity-slot-3");
for (const url of [
  "app://-/index.html?initialRoute=%2Favatar-overlay",
  "app://-/avatar-overlay-composition-surface.html?surfaceId=mascot-badge",
  "app://-/avatar-overlay-composition-surface.html?surfaceId=voice-controls",
  "app://-/avatar-overlay-composition-surface.html?surfaceId=activity-slot-4",
  "app://-/avatar-overlay-composition-surface.html?surfaceId=activity-slot-0&extra=1",
  "https://-/avatar-overlay-composition-surface.html?surfaceId=activity-slot-0",
]) {
  assert.equal(classifyPetActivityTarget(petTarget(url)), null,
    `Non-activity or non-app target must not receive pet compatibility CSS: ${url}`);
}
assert.equal(classifyPetActivityTarget(petTarget(
  "app://-/avatar-overlay-composition-surface.html?surfaceId=activity-slot-0",
  "Unexpected Surface",
)), null, "The exact native pet title is part of the auxiliary-target identity boundary.");

const codexTarget = (url, title = "Codex") => ({ type: "page", title, url });
assert.equal(isCodexRendererCandidateTarget(codexTarget("app://-/index.html")), true);
assert.equal(isCodexRendererCandidateTarget(codexTarget(
  "app://-/index.html?initialRoute=%2Fsettings",
)), true, "Normal Codex initial routes must remain eligible for renderer probing.");
for (const target of [
  codexTarget("app://-/index.html?initialRoute=%2Favatar-overlay"),
  codexTarget("app://-/index.html?initialRoute=%2Fsettings&initialRoute=%2Favatar-overlay"),
  codexTarget("app://-/avatar-overlay-composition-surface.html?surfaceId=mascot-badge"),
  codexTarget("https://example.com/index.html"),
]) {
  assert.equal(isCodexRendererCandidateTarget(target), false,
    `Auxiliary or non-Codex targets must not receive operation UI or full Dream Skin: ${target.url}`);
}

function createPetCompatibilityFixture(href) {
  const nodes = new Map();
  const head = {
    append(node) {
      node.parentNode = head;
      nodes.set(node.id, node);
    },
  };
  const document = {
    head,
    createElement(tagName) {
      return { tagName: tagName.toUpperCase(), id: "", textContent: "", parentNode: null };
    },
    getElementById(id) { return nodes.get(id) ?? null; },
  };
  return {
    context: {
      location: new URL(href),
      document,
    },
    get style() { return nodes.get("codex-dream-skin-pet-compat-style") ?? null; },
    remove(id) { nodes.delete(id); },
  };
}

const petCompat = createPetCompatibilityFixture(
  "app://-/avatar-overlay-composition-surface.html?surfaceId=activity-slot-1",
);
vm.runInNewContext(petActivityCompatibilityPayloadFor(true), petCompat.context);
assert.ok(petCompat.style, "An exact activity slot must receive the bounded compatibility style.");
assert.match(petCompat.style.textContent, /\[class\*="_activityPillMaterial_"\]/);
assert.match(petCompat.style.textContent, /var\(--color-token-main-surface-primary, Canvas\)/);
assert.doesNotMatch(petCompat.style.textContent, /(?:html|body|main|form)\s*\{/,
  "Pet compatibility CSS must not paint the auxiliary window or native input surface.");
assert.doesNotMatch(petCompat.style.textContent, /background-image|url\(/,
  "Pet compatibility CSS must never copy the Dream Skin wallpaper into pet surfaces.");
petCompat.style.remove = () => petCompat.remove(petCompat.style.id);
vm.runInNewContext(petActivityCompatibilityPayloadFor(false), petCompat.context);
assert.equal(petCompat.style, null, "Pausing or stopping Dream Skin must remove the pet workaround.");

const petCompatWrongSurface = createPetCompatibilityFixture(
  "app://-/avatar-overlay-composition-surface.html?surfaceId=voice-controls",
);
vm.runInNewContext(petActivityCompatibilityPayloadFor(true), petCompatWrongSurface.context);
assert.equal(petCompatWrongSurface.style, null,
  "Voice, mascot, and other auxiliary surfaces must remain completely untouched.");
const targetLoopStart = source.indexOf("for (const target of targets)", source.indexOf("async function runWatch"));
const petClassificationStart = source.indexOf("classifyPetActivityTarget(target)", targetLoopStart);
const codexClassificationStart = source.indexOf("isCodexRendererCandidateTarget(target)", petClassificationStart);
const mainEarlyRegistrationStart = source.indexOf("registerEarlyForRecord(", petClassificationStart);
assert.ok(targetLoopStart >= 0 && petClassificationStart > targetLoopStart
  && codexClassificationStart > petClassificationStart
  && mainEarlyRegistrationStart > codexClassificationStart,
"Pet activity surfaces must be classified first, and only a true Codex renderer may receive the full payload.");
const connectCodexTargetsStart = source.indexOf("async function connectCodexTargets");
const operationUiStart = source.indexOf("function operationUiExpression", connectCodexTargetsStart);
assert.match(source.slice(connectCodexTargetsStart, operationUiStart), /isCodexRendererCandidateTarget\(target\)/,
  "Operation UI discovery must reject the avatar-overlay root before probing or connecting it.");
assert.match(source, /await setPetActivityCompatibility\(petSession, true\)/,
  "The watcher must install the bounded pet style only after live target identity verification.");
assert.match(source, /petSession\.on\("Page\.loadEventFired"[\s\S]*livePetActivityTarget\(petSession\)[\s\S]*setPetActivityCompatibility\(petSession, true\)/,
  "A same-target pet renderer reload must reverify its identity and restore the bounded style.");
assert.match(source, /operation\.status === "pausing"[\s\S]*await releasePetSessions\(\{ strict: true \}\)/,
  "Pausing Dream Skin must remove pet compatibility before acknowledging control-only mode.");
assert.match(source, /finally\s*\{[\s\S]*await releasePetSessions\(\)[\s\S]*record\.session\.close/,
  "Watcher shutdown must remove the pet style before closing auxiliary CDP sessions.");

console.log("PASS: early injection is L0-ready, generation-safe, removed on shutdown, and pet-safe.");
