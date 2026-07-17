import assert from "node:assert/strict";
import { normalizeTheme } from "../theme-core/theme-schema.mjs";
import { themeRuntime } from "../runtime/theme-tokens.mjs";

const theme = normalizeTheme({
  schemaVersion: 3,
  id: "token-theme",
  name: "Token Theme",
  image: "background.png",
  shellMode: "recommended",
  palettes: {
    dark: { panel: "#102030", line: "#336699", lineOpacity: 0.4 },
    light: { panel: "#f0f4f8", line: "#224466", lineOpacity: 0.2 },
  },
  appearance: {
    background: { focusX: 72, focusY: 38, zoom: 115, overlay: 30 },
    surface: { opacity: 82, blur: 16, radius: 12, shadow: 45 },
    decoration: { style: "grid", intensity: 55 },
    typography: "technical",
  },
  scene: { chrome: { iconColor: "background", iconSurface: "accent", badgeColor: "highlight", cardText: "text" } },
  nativeAppearance: { variant: "light", accent: "#336699", surface: "#f0f4f8", ink: "#102030" },
});

const dark = themeRuntime(theme, "dark");
assert.equal(dark.shell, "light");
assert.equal(dark.attributes.decoration, "grid");
assert.equal(dark.attributes.typography, "technical");
assert.equal(dark.variables["--ds-panel"], "#f0f4f8");
assert.equal(dark.variables["--ds-line"], "rgba(34, 68, 102, 0.2)");
assert.equal(dark.variables["--ds-scene-icon"], theme.palettes.light.background);
assert.equal(dark.variables["--ds-scene-icon-surface"], theme.palettes.light.accent);
assert.equal(dark.variables["--dream-art-position"], "72% 38%");
assert.equal(dark.variables["--dream-art-size"], "115% auto");
assert.equal(dark.variables["--dream-overlay-opacity"], "0.3");
assert.equal(dark.variables["--dream-panel-opacity"], "0.82");
assert.equal(dark.variables["--dream-panel-blur"], "16px");
assert.equal(dark.variables["--dream-radius"], "12px");
assert.equal(dark.variables["--dream-shadow-opacity"], "0.45");
assert.equal(dark.variables["--dream-decoration-opacity"], "0.55");

const light = themeRuntime({ ...theme, shellMode: "auto" }, "light");
assert.equal(light.shell, "light");
assert.equal(light.variables["--ds-panel"], "#f0f4f8");
assert.equal(light.variables["--ds-line"], "rgba(34, 68, 102, 0.2)");

const forced = themeRuntime({ ...theme, shellMode: "dark" }, "light");
assert.equal(forced.shell, "dark");

console.log("PASS: Theme v3 runtime token mapping and recommended appearance.");
