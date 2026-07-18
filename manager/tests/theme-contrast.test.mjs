import assert from "node:assert/strict";
import test from "node:test";
import { parseThemeColor, themeContrastIssues } from "../src/theme-contrast.js";

const readableDarkTheme = {
  background: "#080C10", panel: "#10171D", panelAlt: "#18242B",
  accent: "#3EB1BE", accentAlt: "#85E3EB", secondary: "#397986",
  highlight: "#D66A52", text: "#EFF7F8", muted: "#A4B7BC",
  line: "rgba(133, 227, 235, 0.28)",
};

function rgba(color) {
  return `rgba(${Math.round(color.red)}, ${Math.round(color.green)}, ${Math.round(color.blue)}, ${color.alpha})`;
}

test("accepts the generated dark palette", () => {
  assert.deepEqual(themeContrastIssues(readableDarkTheme), []);
});

test("reports the exact field, surface, ratio, and threshold", () => {
  const [issue] = themeContrastIssues({ ...readableDarkTheme, text: "rgba(255, 255, 255, 0.2)" });
  assert.equal(issue.field, "text");
  assert.equal(issue.minimum, 4.5);
  assert.ok(issue.ratio < issue.minimum);
  assert.ok(issue.failedSurfaces.length >= 1);
});

test("suggestion becomes readable after RGBA compositing", () => {
  const colors = { ...readableDarkTheme, text: "#ffffff20" };
  const [issue] = themeContrastIssues(colors);
  assert.ok(issue.suggestedColor);
  const repaired = { ...colors, text: rgba(issue.suggestedColor) };
  assert.deepEqual(themeContrastIssues(repaired).filter(({ field }) => field === "text"), []);
});

test("detects every legacy palette issue before text-only edits are saved", () => {
  const colors = {
    background: "#F7F4F5", panel: "#FFFFFF", panelAlt: "#FFF7F8",
    accent: "#E25563", accentAlt: "#F07A86", secondary: "#F3A8AF",
    highlight: "#C93D4C", text: "#2B2224", muted: "#8A7A7D",
    line: "rgba(196, 120, 128, 0.22)",
  };
  assert.deepEqual(themeContrastIssues(colors).map(({ field }) => field), ["muted", "accentAlt"]);
});

test("parser keeps alpha precision and rejects unsafe channels", () => {
  assert.equal(parseThemeColor("rgba(12, 34, 56, .123456)")?.alpha, 0.123456);
  assert.equal(parseThemeColor("#1234")?.alpha, 0x44 / 255);
  assert.equal(parseThemeColor("rgb(256, 0, 0)"), null);
  assert.equal(parseThemeColor("rgba(0, 0, 0, 2)"), null);
});
