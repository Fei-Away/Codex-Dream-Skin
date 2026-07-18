import assert from "node:assert/strict";
import {
  buildThemeTokens,
  createThemeTokens,
  THEME_SCHEMA_VERSION,
} from "../scripts/theme-schema.mjs";

const partial = buildThemeTokens({
  schemaVersion: THEME_SCHEMA_VERSION,
  tokens: {
    shared: { layout: { cardGap: "8px" } },
    dark: { color: { accent: "#07c160" } },
  },
});

assert.equal(partial.tokens.shared.layout.cardGap, "8px");
assert.equal(partial.tokens.light.color.accent, "var(--ds-accent)");
assert.equal(partial.cssVariables.shared["--ds-layout-card-gap"], "8px");
assert.equal(partial.explicitCssVariables.dark["--ds-color-accent"], "#07c160");
assert.equal(partial.explicitCssVariables.light["--ds-color-accent"], undefined);
assert.ok(partial.variableCount >= 200);

const legacy = buildThemeTokens({
  schemaVersion: 1,
  colors: { accent: "#11aa55", text: "#f5f5f5" },
  tokens: "ignored-for-v1-compatibility",
});
assert.equal(legacy.tokens.dark.color.accent, "#11aa55");
assert.equal(legacy.tokens.light.color.accent, "#11aa55");
assert.equal(legacy.tokens.dark.color.text, "#f5f5f5");

assert.throws(
  () => buildThemeTokens({ schemaVersion: 2, tokens: { shared: { layout: { cardGapp: "8px" } } } }),
  /Theme token tokens\.shared\.layout\.cardGapp is not supported\./,
);
assert.throws(
  () => buildThemeTokens({ schemaVersion: 2, tokens: { dark: { color: { accent: "red" } } } }),
  /must be a CSS color/,
);
assert.throws(
  () => buildThemeTokens({
    schemaVersion: 2,
    tokens: { dark: { effect: { cardShadow: "0 0 1px red; display: none" } } },
  }),
  /contains an unsafe CSS value/,
);
assert.equal(createThemeTokens({ shared: { shape: { cardRadius: "7px" } } })
  .shared.shape.cardRadius, "7px");

console.log("PASS: schema v2 resolves partial tokens, rejects invalid values, and preserves v1 themes.");
