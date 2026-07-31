import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../..");
const validatorPaths = [
  path.join(projectRoot, "runtime", "safe-css-validator.mjs"),
  path.join(projectRoot, "macos", "assets", "safe-css-validator.mjs"),
  path.join(projectRoot, "windows", "assets", "safe-css-validator.mjs"),
];
const policyPaths = [
  path.join(projectRoot, "runtime", "safe-css-policy.json"),
  path.join(projectRoot, "macos", "assets", "safe-css-policy.json"),
  path.join(projectRoot, "windows", "assets", "safe-css-policy.json"),
];
const validators = await Promise.all(validatorPaths.map(async (file) => import(pathToFileURL(file))));

function assertRejected(source, code) {
  for (const validator of validators) {
    assert.throws(
      () => validator.validateSafeCss(source),
      (error) => error?.code === code && Number.isInteger(error.line) && Number.isInteger(error.column),
      `${code}: ${source}`,
    );
  }
}

test("runtime and platform Safe CSS validators stay byte-identical", async () => {
  const files = await Promise.all(validatorPaths.map((file) => fs.readFile(file)));
  assert.deepEqual(files[1], files[0]);
  assert.deepEqual(files[2], files[0]);
});

test("runtime policy matches the platform assets and executable validator contract", async () => {
  const files = await Promise.all(policyPaths.map((file) => fs.readFile(file)));
  assert.deepEqual(files[1], files[0]);
  assert.deepEqual(files[2], files[0]);
  const policy = JSON.parse(files[0].toString("utf8"));
  for (const validator of validators) assert.deepEqual(validator.SAFE_CSS_CONTRACT, policy);
});

test("accepts only the bounded public part/property/value contract", () => {
  const source = `[data-ds-part="sidebar"] {
  background-color: var(--ds-theme-color-panel);
  border-color: rgba(124, 255, 70, 0.28);
  border-width: 1px;
  border-style: solid;
  border-radius: 12px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(var(--ds-theme-surface-blur));
  transition-property: background-color, border-color, box-shadow;
  transition-duration: 180ms;
}
[data-ds-part="dialog"]:focus-visible {
  border-color: var(--ds-theme-color-accent);
}`;
  for (const validator of validators) {
    assert.deepEqual(validator.validateSafeCss(source), {
      contract: "dreamskin-safe-css/1",
      status: "validated",
      bytes: new TextEncoder().encode(source).length,
      ruleCount: 2,
      declarationCount: 10,
    });
  }
});

test("matches the public glass-filter contract used by approved themes", () => {
  const accepted = [
    `none`,
    `blur(22px) saturate(1.15)`,
    `blur(var(--ds-theme-surface-blur)) saturate(1.15)`,
    `blur(30px) brightness(1.5) contrast(0.8) saturate(0.5)`,
  ];
  for (const value of accepted) {
    const source = `[data-ds-part="sidebar"] { backdrop-filter: ${value}; }`;
    for (const validator of validators) {
      assert.equal(validator.validateSafeCss(source).status, "validated");
      assert.match(validator.compileSafeCss(source), new RegExp(
        `backdrop-filter: ${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} !important;`,
      ));
    }
  }
});

test("compiles validated declarations into the controlled community cascade layer", () => {
  const source = `[data-ds-part="sidebar"] {
  background-color: var(--ds-theme-color-panel);
  border-radius: 12px;
}
[data-ds-part="composer"]:focus-visible {
  border-color: #abcdef;
}`;
  const expected = `@layer dreamskin-community {
  [data-ds-part="sidebar"] {
    background-color: var(--ds-theme-color-panel) !important;
    background-image: none !important;
    border-radius: 12px !important;
  }
  [data-ds-part="composer"]:focus-visible {
    border-color: #abcdef !important;
  }
}
`;
  for (const validator of validators) {
    assert.equal(validator.compileSafeCss(source), expected);
    const decoded = validator.decodeAndValidateSafeCss(new TextEncoder().encode(source));
    assert.equal(decoded.source, source);
    assert.equal(decoded.runtimeSource, expected);
    assert.equal(decoded.validation.status, "validated");
  }
});

test("compiles bounded root and toolbar bridges for visible inherited styling", () => {
  const source = `[data-ds-part="root"] {
  background-color: #112233;
  color: #ddeeff;
  font-family: system-ui, sans-serif;
}
[data-ds-part="composer-toolbar"] {
  color: var(--ds-theme-color-muted);
}`;
  for (const validator of validators) {
    const runtime = validator.compileSafeCss(source);
    assert.match(runtime, /\[data-ds-part="root"\] body \{/);
    assert.match(runtime, /background-color: #112233 !important;/);
    assert.doesNotMatch(runtime, /background-image:/,
      "Root color bridging must preserve the canonical body wallpaper.");
    assert.match(runtime, /font-family: system-ui, sans-serif !important;/);
    assert.match(runtime, /composer-toolbar[^\n]+:where\(button:not/);
    assert.match(runtime, /color: var\(--ds-theme-color-muted\) !important;/);
  }
});

test("clears only registered core surface background images", () => {
  const surfaceParts = ["sidebar", "main", "home"];
  const otherParts = validators[0].SAFE_CSS_PARTS.filter((part) =>
    part !== "root" && !surfaceParts.includes(part),
  );
  for (const validator of validators) {
    for (const part of surfaceParts) {
      const runtime = validator.compileSafeCss(
        `[data-ds-part="${part}"] { background-color: #112233; }`,
      );
      assert.match(runtime, /background-image: none !important;/, part);
    }
    for (const part of ["root", ...otherParts]) {
      const runtime = validator.compileSafeCss(
        `[data-ds-part="${part}"] { background-color: #112233; }`,
      );
      assert.doesNotMatch(runtime, /background-image:/, part);
    }
  }
});

test("rejects selector escape, global reach, DOM coupling, and unregistered parts", () => {
  for (const source of [
    `:root { color: #fff; }`,
    `html { color: #fff; }`,
    `body { color: #fff; }`,
    `* { color: #fff; }`,
    `.sidebar { color: #fff; }`,
    `#app { color: #fff; }`,
    `[data-ds-part="sidebar"] button { color: #fff; }`,
    `[data-ds-part="sidebar"] > * { color: #fff; }`,
    `[data-ds-part^="side"] { color: #fff; }`,
    `[data-ds-part="sidebar"]:has(button) { color: #fff; }`,
    `[data-ds-part="sidebar"]::before { color: #fff; }`,
    `[data-ds-part="panel"] { color: #fff; }`,
  ]) assertRejected(source, "selector/unsupported");
  assertRejected(`[data-ds-pa\\72t="sidebar"] { color: #fff; }`, "syntax/escape");
  assertRejected(
    `[data-ds-part="sidebar"], [data-ds-part="main"] { color: #fff; }`,
    "selector/list",
  );
});

test("rejects network, font, at-rule, comment, and parser-confusion inputs", () => {
  assertRejected(`@import url(https://example.invalid/theme.css);`, "syntax/rule");
  assertRejected(`@font-face { font-family: remote; src: url(https://example.invalid/a.woff2); }`, "syntax/rule");
  assertRejected(`@media (min-width: 1px) { [data-ds-part="main"] { color: #fff; } }`, "syntax/rule");
  assertRejected(`[data-ds-part="main"] { background-image: url(https://example.invalid/a.png); }`, "property/unsupported");
  assertRejected(`[data-ds-part="main"] { color: #f/**/ff; }`, "syntax/comment");
  assertRejected(`[data-ds-part="main"] { color: red !important; }`, "value/token");
  assertRejected(`[data-ds-part="main"] { color: var(--ds-theme-color-accent, red); }`, "value/unsupported");
  assertRejected(`[data-ds-part="main"] { color: var(--unknown); }`, "value/unsupported");
  assertRejected(`[data-ds-part="main"] { color: expression(alert(1)); }`, "value/unsupported");
});

test("rejects Unicode separators that are not CSS whitespace", () => {
  assertRejected(
    `[data-ds-part="main"] { border-width: 1px\u00a02px; }`,
    "value/unsupported",
  );
  assertRejected(
    `[data-ds-part="main"] { box-shadow: 0\u00a00\u00a04px\u00a0#fff; }`,
    "value/unsupported",
  );
});

test("rejects layout, concealment, interaction, animation, and unbounded values", () => {
  for (const property of [
    "position: fixed",
    "inset: 0",
    "top: 0",
    "z-index: 999999",
    "display: none",
    "visibility: hidden",
    "content: none",
    "pointer-events: none",
    "cursor: none",
    "overflow: hidden",
    "transform: scale(20)",
    "animation: spin 1ms infinite",
  ]) assertRejected(`[data-ds-part="main"] { ${property}; }`, "property/unsupported");
  assertRejected(`[data-ds-part="main"] { opacity: 0; }`, "value/unsupported");
  assertRejected(`[data-ds-part="main"] { border-width: 99px; }`, "value/unsupported");
  assertRejected(`[data-ds-part="main"] { border-radius: 999px; }`, "value/unsupported");
  for (const value of [
    "blur(31px)",
    "blur(12px) saturate(0.49)",
    "blur(12px) saturate(2.01)",
    "blur(12px) brightness(0.79)",
    "blur(12px) brightness(1.51)",
    "blur(12px) contrast(0.79)",
    "blur(12px) contrast(1.51)",
    "saturate(1.15) blur(12px)",
    "blur(12px) blur(13px)",
    "blur(12px) saturate(1.1) saturate(1.2)",
    "blur(12px) opacity(0.9)",
    "blur(12px) drop-shadow(0 2px 4px #000)",
  ]) {
    assertRejected(
      `[data-ds-part="main"] { backdrop-filter: ${value}; }`,
      "value/unsupported",
    );
  }
  assertRejected(`[data-ds-part="main"] { transition-duration: 10s; }`, "value/unsupported");
});

test("rejects invalid UTF-8 and reports the offending line", () => {
  for (const validator of validators) {
    assert.throws(
      () => validator.decodeAndValidateSafeCss(Uint8Array.from([0xff, 0xfe])),
      (error) => error?.code === "syntax/utf8" && error.line === 1 && error.column === 1,
    );
    assert.throws(
      () => validator.validateSafeCss(`[data-ds-part="main"] {\n  position: fixed;\n}`),
      (error) => error?.code === "property/unsupported" && error.line === 2 && error.column === 3,
    );
  }
});
