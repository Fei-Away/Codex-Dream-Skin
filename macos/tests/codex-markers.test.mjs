import assert from "node:assert/strict";
import vm from "node:vm";
import {
  CODEX_DOM_SELECTORS,
  CODEX_PROBE_MARKERS,
  buildCodexMarkerInspectionSource,
  inspectCodexMarkers,
  isCodexMarkerSet,
} from "../scripts/codex-markers.mjs";

for (const name of CODEX_PROBE_MARKERS) {
  assert.ok(CODEX_DOM_SELECTORS[name].length >= 2, `${name} needs at least one fallback selector`);
  assert.equal(new Set(CODEX_DOM_SELECTORS[name]).size, CODEX_DOM_SELECTORS[name].length);
}

const primaryNodes = new Map(Object.values(CODEX_DOM_SELECTORS).map((selectors) => [selectors[0], {}]));
const primary = inspectCodexMarkers((selector) => primaryNodes.get(selector) ?? null, CODEX_DOM_SELECTORS);
assert.equal(isCodexMarkerSet(primary.markers), true);
assert.deepEqual(CODEX_PROBE_MARKERS.map((name) => primary.matches[name]),
  CODEX_PROBE_MARKERS.map((name) => CODEX_DOM_SELECTORS[name][0]));

const fallbackNodes = new Map(CODEX_PROBE_MARKERS.map((name) => [CODEX_DOM_SELECTORS[name][1], {}]));
const fallback = inspectCodexMarkers((selector) => fallbackNodes.get(selector) ?? null, CODEX_DOM_SELECTORS);
assert.equal(isCodexMarkerSet(fallback.markers), true);
for (const name of CODEX_PROBE_MARKERS) assert.equal(fallback.matches[name], CODEX_DOM_SELECTORS[name][1]);

const shellAndSidebarOnly = new Map([
  [CODEX_DOM_SELECTORS.shell[2], {}],
  [CODEX_DOM_SELECTORS.sidebar[1], {}],
]);
const optionalContent = inspectCodexMarkers((selector) => shellAndSidebarOnly.get(selector) ?? null,
  CODEX_DOM_SELECTORS);
assert.equal(isCodexMarkerSet(optionalContent.markers), true);
assert.ok(optionalContent.missing.includes("composer"));
assert.ok(optionalContent.missing.includes("main"));

const missingSidebar = inspectCodexMarkers((selector) =>
  selector === CODEX_DOM_SELECTORS.shell[0] || selector === CODEX_DOM_SELECTORS.composer[0] ? {} : null,
CODEX_DOM_SELECTORS);
assert.equal(isCodexMarkerSet(missingSidebar.markers), false);
assert.ok(missingSidebar.missing.includes("sidebar"));

const serializedSource = buildCodexMarkerInspectionSource();
const serializedMatches = vm.runInNewContext(`(() => { ${serializedSource} return markerInspection.matches; })()`, {
  document: { querySelector: (selector) => fallbackNodes.get(selector) ?? null },
});
for (const name of CODEX_PROBE_MARKERS) assert.equal(serializedMatches[name], CODEX_DOM_SELECTORS[name][1]);

const exceptionTolerant = inspectCodexMarkers((selector) => {
  if (selector === CODEX_DOM_SELECTORS.shell[0]) throw new Error("stale selector");
  return selector === CODEX_DOM_SELECTORS.shell[1] ? {} : null;
}, CODEX_DOM_SELECTORS);
assert.equal(exceptionTolerant.matches.shell, CODEX_DOM_SELECTORS.shell[1]);

console.log("PASS: Codex DOM marker primary, fallback, diagnostic, and serialization checks.");
