import assert from "node:assert/strict";
import { deriveLightPalette, normalizeTheme, themeDefaults, toRgba } from "../theme-core/theme-schema.mjs";

const v1 = {
  schemaVersion: 1,
  id: "legacy-theme",
  name: "旧主题",
  image: "background.jpg",
  colors: {
    background: "#071116",
    panel: "#0b1a20",
    panelAlt: "#10272c",
    accent: "#7cff46",
    accentAlt: "#9cff70",
    secondary: "#36d7e8",
    highlight: "#642a8c",
    text: "#f2fff7",
    muted: "#a7c2ba",
    line: "rgba(124, 255, 70, 0.32)",
  },
};

const migrated = normalizeTheme(v1);
assert.equal(migrated.schemaVersion, 3);
assert.equal(migrated.id, "legacy-theme");
assert.equal(migrated.palettes.dark.line, "#7cff46");
assert.equal(migrated.palettes.dark.lineOpacity, 0.32);
assert.equal(migrated.palettes.light.accent, "#7cff46");
assert.equal(migrated.appearance.background.focusX, themeDefaults.appearance.background.focusX);
assert.equal(migrated.appearance.surface.blur, themeDefaults.appearance.surface.blur);
assert.equal(migrated.scene.actions.length, 4);
assert.equal(migrated.scene.identity.icon, "spark");
assert.equal(migrated.nativeAppearance.variant, "dark");

const derived = deriveLightPalette(migrated.palettes.dark);
assert.match(derived.background, /^#[0-9a-f]{6}$/);
assert.match(derived.panel, /^#[0-9a-f]{6}$/);
assert.equal(derived.accent, migrated.palettes.dark.accent);
assert.equal(derived.lineOpacity, migrated.palettes.dark.lineOpacity);

const normalized = normalizeTheme({
  schemaVersion: 3,
  id: "bounded-theme",
  name: "Bounded",
  image: "background.webp",
  shellMode: "recommended",
  palettes: {
    dark: { accent: "#ABCDEF", line: "#123456", lineOpacity: 5 },
    light: { lineOpacity: -1 },
  },
  appearance: {
    background: { focusX: -50, focusY: 140, zoom: 999, overlay: -10 },
    surface: { opacity: 5, blur: 99, radius: -4, shadow: 120 },
    decoration: { style: "sparkles", intensity: 101 },
    typography: "editorial",
  },
  scene: {
    identity: { icon: "not-allowed", shortName: "Bounded Theme" },
    hero: { eyebrow: "Focus", title: "Build carefully", description: "A structured scene", tags: ["one", "two", "three", "four", "five"] },
    actions: [{ icon: "code", title: "Read", detail: "Understand the code", badge: "Focus", tone: "accent" }],
    widget: { icon: "signal", title: "Status", lines: ["One", "Two", "Three", "Four"] },
    composer: { icon: "wand", label: "Prompt", hint: "Describe the next step" },
    chrome: { iconColor: "background", iconSurface: "accent", badgeColor: "highlight", cardText: "text" },
  },
  nativeAppearance: { variant: "light", accent: "#ABCDEF", surface: "#FFFFFF", ink: "#111111", contrast: 999 },
});
assert.equal(normalized.schemaVersion, 3);
assert.equal(normalized.shellMode, "recommended");
assert.equal(normalized.palettes.dark.accent, "#abcdef");
assert.equal(normalized.palettes.dark.lineOpacity, 1);
assert.equal(normalized.palettes.light.lineOpacity, 0);
assert.deepEqual(normalized.appearance.background, { focusX: 0, focusY: 100, zoom: 160, overlay: 0 });
assert.deepEqual(normalized.appearance.surface, { opacity: 40, blur: 30, radius: 0, shadow: 100 });
assert.deepEqual(normalized.appearance.decoration, { style: "sparkles", intensity: 100 });
assert.equal(normalized.appearance.typography, "editorial");
assert.equal(normalized.scene.identity.icon, "spark");
assert.equal(normalized.scene.hero.tags.length, 4);
assert.equal(normalized.scene.actions.length, 4);
assert.equal(normalized.scene.actions[0].icon, "code");
assert.equal(normalized.scene.widget.lines.length, 3);
assert.equal(normalized.nativeAppearance.variant, "light");
assert.equal(normalized.nativeAppearance.accent, "#abcdef");
assert.equal(normalized.nativeAppearance.contrast, 100);

assert.equal(toRgba("#7cff46", 0.32), "rgba(124, 255, 70, 0.32)");
assert.throws(() => normalizeTheme({ id: "bad", name: "Bad", image: "../secret.png" }), /主题图片/);
assert.throws(() => normalizeTheme({ id: "bad id", name: "Bad", image: "background.png" }), /主题 ID/);

console.log("PASS: Theme v1/v2 migration and v3 normalization.");
