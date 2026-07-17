import assert from "node:assert/strict";
import {
  buildNativeThemePayload,
  contrastRatio,
  evaluateReadability,
  evaluatePaletteReadability,
  recommendVariant,
} from "../studio/web/readability.js";

assert.equal(contrastRatio("#000000", "#ffffff"), 21);
assert.ok(contrastRatio("#777777", "#ffffff") > 4.47);

const report = evaluateReadability({
  accent: "#d7a6b3",
  surface: "#fbfaf8",
  ink: "#a1636f",
});
assert.equal(report.text.pass, false);
assert.equal(report.controls.pass, false);
assert.equal(report.text.target, 4.5);
assert.equal(report.controls.target, 3);

const darkPaletteReport = evaluatePaletteReadability({
  accent: "#7cff46", panel: "#0b1a20", text: "#f2fff7",
});
const lightPaletteReport = evaluatePaletteReadability({
  accent: "#d7a6b3", panel: "#fbfaf8", text: "#a1636f",
});
assert.notEqual(darkPaletteReport.text.ratio, lightPaletteReport.text.ratio);
assert.equal(lightPaletteReport.text.pass, false);

assert.equal(recommendVariant("#f8f7f3"), "light");
assert.equal(recommendVariant("#08131a"), "dark");

const native = buildNativeThemePayload({
  variant: "light",
  accent: "#d7a6b3",
  surface: "#fbfaf8",
  ink: "#412f35",
  contrast: 62,
  diffAdded: "#4f9f70",
  diffRemoved: "#c95757",
  skill: "#5c77c8",
});
assert.equal(native.variant, "light");
assert.equal(native.codeThemeId, "codex");
assert.equal(native.theme.semanticColors.diffAdded, "#4f9f70");
assert.ok(JSON.stringify(native).includes("opaqueWindows"));

console.log("PASS: WCAG readability and Codex native appearance recommendation.");
