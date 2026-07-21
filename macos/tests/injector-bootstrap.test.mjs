import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { earlyPayloadFor } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");

function createFixture() {
  const observers = [];
  const timers = new Map();
  let nextTimer = 1;
  const markers = { shell: false, sidebar: false };
  const context = {
    window: { installs: [] },
    document: {
      documentElement: {},
      querySelector(selector) {
        if (selector === "main.main-surface") return markers.shell ? {} : null;
        if (selector === "aside.app-shell-left-panel") return markers.sidebar ? {} : null;
        return null;
      },
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.connected = true;
        observers.push(this);
      }
      observe() {}
      disconnect() { this.connected = false; }
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  return { context, markers, observers };
}

const guarded = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
assert.deepEqual(guarded.context.window.installs, [], "Auxiliary app targets must remain untouched.");
guarded.markers.shell = true;
guarded.observers[0].callback([]);
assert.deepEqual(guarded.context.window.installs, [], "A main surface without the Codex sidebar is not sufficient.");

const generations = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("old")', "old"), generations.context);
vm.runInNewContext(earlyPayloadFor('window.installs.push("new")', "new"), generations.context);
generations.markers.shell = true;
generations.markers.sidebar = true;
for (const observer of generations.observers) observer.callback([]);
assert.deepEqual(
  generations.context.window.installs,
  ["new"],
  "A stale early script must yield to the newest watcher generation.",
);
assert.equal(generations.context.window.__CODEX_DREAM_SKIN_EARLY_APPLIED__, "new");

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
  /const suggestionLabelColorsMatch = visibleSuggestionLabels\.every\([\s\S]{0,160}item\.color === item\.expectedColor\)/,
  "Live verification must compare visible home suggestion labels with the themed card color.",
);
assert.match(
  source,
  /visibleSuggestionLabels\.length >= result\.visibleCardCount[\s\S]{0,160}result\.suggestionLabelColorsMatch/,
  "Live verification must reject visible home suggestion labels that diverge from the themed card color.",
);
assert.match(
  source,
  /verifyRemovedSession[\s\S]*codex-dream-skin-motion-stage/,
  "Soft-off verification must reject a leaked dedicated motion stage.",
);
assert.match(
  source,
  /verifyRemovedSession[\s\S]*codex-dream-skin-sidebar-widget/,
  "Soft-off verification must reject a leaked sidebar companion widget.",
);
assert.match(
  source,
  /motion:\s*\{[\s\S]{0,700}petalCount:[\s\S]{0,700}foregroundPresent:[\s\S]{0,700}loungePresent:[\s\S]{0,700}avoidanceMode:[\s\S]{0,700}sidebarWidgetPresent:[\s\S]{0,900}motionPass/,
  "Live verification must report and enforce the dedicated motion, foreground, lounge, avoidance, and sidebar-widget contract.",
);
assert.match(
  source,
  /DUO_WIDGET_IMAGE_FILE[\s\S]{0,160}duo-sidebar-widget-v3\.png/,
  "The injector must load the stable long-gown artwork for the theme card.",
);
assert.match(
  source,
  /DUO_FOREGROUND_IMAGE_FILE[\s\S]{0,160}duo-foreground-characters-jk-v1\.png/,
  "The injector must load the high-resolution transparent loafer duo for the foreground layer.",
);
assert.match(
  source,
  /DUO_LOUNGE_IMAGE_FILE[\s\S]{0,160}duo-lounge-jk-v1\.png/,
  "The injector must load the horizontal reclining duo for the upper safe area.",
);
assert.match(source, /DUO_LOUNGE_BODY_IMAGE_FILE[\s\S]{0,180}duo-lounge-body-v2\.webp/);
assert.match(source, /DUO_LOUNGE_LEFT_LEGS_IMAGE_FILE[\s\S]{0,180}duo-lounge-left-legs-v2\.webp/);
assert.match(source, /DUO_LOUNGE_RIGHT_LEGS_IMAGE_FILE[\s\S]{0,180}duo-lounge-right-legs-v2\.webp/);
assert.match(source, /DUO_LOUNGE_BLINK_IMAGE_FILE[\s\S]{0,180}duo-lounge-blink-v1\.webp/);
assert.match(
  source,
  /replace\("__DREAM_DUO_WIDGET_ART_JSON__",\s*JSON\.stringify\(duoWidgetArt\)\)/,
);
assert.match(
  source,
  /replace\("__DREAM_DUO_FOREGROUND_ART_JSON__",\s*JSON\.stringify\(duoForegroundArt\)\)/,
);
assert.match(
  source,
  /replace\("__DREAM_DUO_LOUNGE_ART_JSON__",\s*JSON\.stringify\(duoLoungeArt\)\)/,
);
assert.match(
  source,
  /replace\("__DREAM_DUO_LOUNGE_BODY_ART_JSON__",\s*JSON\.stringify\(duoLoungeBodyArt\)\)/,
);
assert.match(
  source,
  /replace\("__DREAM_DUO_LOUNGE_LEFT_LEGS_ART_JSON__",\s*JSON\.stringify\(duoLoungeLeftLegsArt\)\)/,
);
assert.match(
  source,
  /replace\("__DREAM_DUO_LOUNGE_RIGHT_LEGS_ART_JSON__",\s*JSON\.stringify\(duoLoungeRightLegsArt\)\)/,
);
assert.match(
  source,
  /replace\("__DREAM_DUO_LOUNGE_BLINK_ART_JSON__",\s*JSON\.stringify\(duoLoungeBlinkArt\)\)/,
);
assert.match(source, /const DUO_THEME_ID = "preset-sky-garden-duo"/);
assert.match(source, /themeId !== DUO_THEME_ID[\s\S]{0,300}duoIcons:\s*\{\}/,
  "Non-duo presets must not load or embed the trusted character asset pack.");
assert.match(source, /widgetBytes:\s*duoAssets\.widgetBytes/);
assert.match(source, /foregroundBytes:\s*duoAssets\.foregroundBytes/);
assert.match(source, /loungeBytes:\s*duoAssets\.loungeBytes/);
assert.match(source, /loungeBodyBytes:\s*duoAssets\.loungeBodyBytes/);
assert.match(source, /loungeLegBytes:\s*duoAssets\.loungeLegBytes/);
assert.match(source, /loungeBlinkBytes:\s*duoAssets\.loungeBlinkBytes/);
assert.match(
  source,
  /DUO_CHARACTER_ICON_FILES[\s\S]{0,2400}nav-new-task\.webp[\s\S]{0,2400}control-send\.webp/,
  "The injector must load the complete generated character icon pack.",
);
assert.match(
  source,
  /replace\("__DREAM_DUO_ICONS_JSON__",\s*JSON\.stringify\(duoIcons\)\)/,
  "The character icon pack must be embedded once as a renderer payload object.",
);
assert.match(source, /characterIconBytes:\s*duoAssets\.characterIconBytes/);
assert.match(
  source,
  /DUO_ASSET_ROOT[\s\S]{0,1800}duo-character-icons[\s\S]+watchPayloadSources/,
  "Generated character icon edits must invalidate the cached renderer payload.",
);
assert.match(
  source,
  /watchPayloadSources[\s\S]{0,2500}add\(DUO_ASSET_ROOT, "static"\)[\s\S]{0,200}add\(characterIconRoot, "static"\)/,
  "Trusted preset artwork and icon edits must invalidate the cached renderer payload.",
);

console.log("PASS: early injection is shell-guarded, generation-safe, and removed on shutdown.");
