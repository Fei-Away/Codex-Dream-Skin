import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { assessRendererReadiness } from "../runtime/renderer-readiness.mjs";
import { assessRendererReadiness as macosReadiness } from "../macos/assets/renderer-readiness.mjs";
import { assessRendererReadiness as windowsReadiness } from "../windows/assets/renderer-readiness.mjs";
import { assessRendererVerification as verifyMacos } from "../macos/scripts/injector.mjs";
import { assessRendererVerification as verifyWindows } from "../windows/scripts/injector.mjs";

const expected = { skinVersion: "fixture-version", expectedThemeId: "theme-a", expectedRevision: "revision-a" };
const visible = { visible: true, width: 900, height: 640 };
const base = {
  installed: true, version: expected.skinVersion, stylePresent: true,
  themeId: expected.expectedThemeId, revision: expected.expectedRevision,
  businessClassPollution: 0, documentVisibility: "visible", documentHidden: false,
  viewport: { width: 1280, height: 800 }, documentOverflow: { x: false, y: false },
  scope: { level: "L1", baseState: "thread", missingL1: [] },
  shell: visible, sidebar: visible, genericMain: null, genericInput: null,
  homeRoute: false, homePresent: false, homeSurface: null, hero: null,
  settings: null, composer: null, projectButton: null,
  visibleCardCount: 0, suggestionLabels: [], suggestionLabelColorsMatch: true,
};
const home = {
  scope: { level: "L1", baseState: "home", missingL1: [] },
  homeRoute: true, homePresent: true, homeSurface: visible, hero: visible,
};
const generic = { shell: null, sidebar: null, genericMain: visible, genericInput: visible };
const fixtures = [
  ["native task shell", {}, true],
  ["generic task shell", generic, true],
  ["generic task waiting for composer", { ...generic, genericInput: null }, false],
  ["generic task after composer arrives", { ...generic, genericInput: visible }, true],
  ["visible Home without optional cards or composer", home, true],
  ["generic Home before composer arrives", { ...home, ...generic, genericInput: null, hero: null }, true],
  ["Home identity has not arrived", { ...home, homePresent: false, homeSurface: null }, false],
  ["Home container is hidden despite visible descendants", { ...home, homeSurface: { ...visible, visible: false } }, false],
  ["Home has no visible hero or generic content", { ...home, hero: null }, false],
  ["one readable suggestion", { ...home, visibleCardCount: 1, suggestionLabels: [visible] }, true],
  ["suggestion label has not appeared", { ...home, visibleCardCount: 1 }, false],
  ["suggestion text is unreadable", { ...home, visibleCardCount: 1, suggestionLabels: [visible], suggestionLabelColorsMatch: false }, false],
  ["visible L0 settings", { scope: { level: "L0", baseState: "settings" }, shell: null, sidebar: null, settings: visible }, true],
  ["L0 settings lacks visible controls", { scope: { level: "L0", baseState: "settings" }, settings: null }, false],
  ["L0 cannot authorize a task", { scope: { level: "L0", baseState: "thread" }, ...generic }, false],
  ["L0 cannot authorize Home", { ...home, scope: { level: "L0", baseState: "home" } }, false],
  ["L1 required anchor is missing", { scope: { level: "L1", baseState: "thread", missingL1: ["header-tint"] } }, false],
  ["L1 completion evidence is missing", { scope: { level: "L1", baseState: "thread" } }, false],
  ["hidden document", { documentVisibility: "hidden", documentHidden: true }, false],
  ["contradictory hidden document", { documentHidden: true }, false],
  ["document visibility unavailable", { documentVisibility: null }, false],
  ["minimum usable viewport", { viewport: { width: 320, height: 240 } }, true],
  ["narrow viewport", { viewport: { width: 319, height: 800 } }, false],
  ["collapsed viewport", { viewport: { width: 1280, height: 0 } }, false],
  ["unbounded viewport", { viewport: { width: Infinity, height: 800 } }, false],
  ["oversized viewport", { viewport: { width: 65537, height: 800 } }, false],
  ["horizontal overflow", { documentOverflow: { x: true, y: false } }, false],
  ["vertical scrolling is allowed", { documentOverflow: { x: false, y: true } }, true],
  ["overflow evidence unavailable", { documentOverflow: null }, false],
  ["stale theme", { themeId: "theme-b" }, false],
  ["stale revision", { revision: "revision-b" }, false],
  ["stale injector version", { version: "previous-version" }, false],
  ["style no longer installed", { stylePresent: false }, false],
  ["skin no longer installed", { installed: false }, false],
  ["business class pollution", { businessClassPollution: 1 }, false],
];

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

for (const [name, patch, shouldPass] of fixtures) {
  test(`shared verdict: ${name}`, () => {
    const renderer = freeze(structuredClone({ ...base, ...patch }));
    const original = structuredClone(renderer);
    for (const status of ["ready", "unsupported"]) {
      const nativeWindow = freeze({ status });
      const verdict = assessRendererReadiness(renderer, nativeWindow, expected);
      assert.equal(verdict.pass, shouldPass, status);
      assert.deepEqual(macosReadiness(renderer, nativeWindow, expected), verdict);
      assert.deepEqual(windowsReadiness(renderer, nativeWindow, expected), verdict);

      const macos = verifyMacos(renderer, nativeWindow, expected);
      const windows = verifyWindows({ ...renderer, settingsAnchor: renderer.settings }, {
        pass: status === "ready", unsupported: status === "unsupported",
      }, expected);
      assert.equal(macos.pass, shouldPass, `macOS ${status}`);
      assert.equal(windows.pass, shouldPass, `Windows ${status}`);
      assert.equal(macos.checks.structurePass, windows.readiness.structurePass);
      assert.equal(macos.checks.documentVisible, windows.readiness.documentPass);
      assert.equal(macos.checks.viewportPass, windows.readiness.viewportPass);
      assert.equal(macos.checks.payloadPass, verdict.checks.payloadPass);
    }
    assert.deepEqual(renderer, original, "pure evaluation must not mutate its observations");
  });
}

test("unavailable, minimized and invalid native bindings never use unsupported fallback", () => {
  for (const reason of ["invalid-window-binding", "window-not-visible", "window-bounds-too-small", "target-window-unavailable"]) {
    const canonical = assessRendererReadiness(base, { status: "not-ready", reason }, expected);
    const macos = verifyMacos(base, { status: "not-ready", reason }, expected);
    const windows = verifyWindows(base, { pass: false, bound: false, reason }, expected);
    assert.equal(canonical.pass, false, reason);
    assert.equal(macos.pass, false, reason);
    assert.equal(windows.pass, false, reason);
    assert.equal(canonical.checks.fallbackWindowPass, false);
    assert.equal(windows.nativeWindow.reason, reason, "platform diagnostics remain intact");
  }
});

test("optional payload matching and existing diagnostics remain compatible", () => {
  const nativeWindow = { status: "ready" };
  const optionalExpected = { skinVersion: expected.skinVersion, expectedThemeId: null, expectedRevision: null };
  const macos = verifyMacos(base, nativeWindow, optionalExpected);
  const windows = verifyWindows(base, { pass: true, bound: true }, optionalExpected);
  assert.equal(macos.pass, true);
  assert.equal(windows.pass, true);
  assert.deepEqual(Object.keys(macos.checks).sort(), [
    "documentVisible", "fallbackWindowPass", "nativeWindowPass", "payloadPass",
    "structurePass", "viewportPass", "windowPass",
  ]);
  assert.deepEqual(Object.keys(windows.readiness).sort(), [
    "documentPass", "fallbackWindowPass", "nativeWindowPass", "structurePass", "viewportPass", "windowPass",
  ]);
  assert.equal(macos.expectedThemeId, null);
  assert.equal(windows.expectedRevision, null);
  assert.equal(macos.softNotes.composerOptionalOnNonTaskRoutes, true);
});

test("both packaged readiness modules are byte-identical to the canonical source", async () => {
  const canonical = await fs.readFile(new URL("../runtime/renderer-readiness.mjs", import.meta.url));
  for (const platform of ["macos", "windows"]) {
    assert.deepEqual(await fs.readFile(new URL(`../${platform}/assets/renderer-readiness.mjs`, import.meta.url)), canonical);
  }
});
