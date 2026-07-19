import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  LIMITS,
  WebStudioError,
  assertRequestAuthority,
  safeChild,
  sniffImage,
  tokenMatches,
  validateThemeFields,
  validateThemeId,
} from "../scripts/web-studio-shared.mjs";

test("normalizes allowed theme fields", () => {
  assert.deepEqual(validateThemeFields({
    name: "  测试主题  ",
    tagline: "工作台",
    quote: "BUILD",
    accent: "#AABBCC",
    secondary: "#36d7e8",
    highlight: "#642a8c",
    apply: true,
    allowRestart: false,
  }), {
    name: "测试主题",
    tagline: "工作台",
    quote: "BUILD",
    accent: "#aabbcc",
    secondary: "#36d7e8",
    highlight: "#642a8c",
    apply: true,
    allowRestart: false,
  });
});

test("uses safe defaults and code-point limits", () => {
  const defaults = validateThemeFields({});
  assert.equal(defaults.name, "我的 Codex Dream Skin");
  assert.equal(defaults.tagline, "把喜欢的画面变成可交互的 Codex 工作台。");
  assert.equal(defaults.quote, "MAKE SOMETHING WONDERFUL");
  assert.equal(defaults.accent, "#7cff46");
  assert.equal([...validateThemeFields({ name: "🐱".repeat(100) }).name].length, 80);
  assert.equal([...validateThemeFields({ tagline: "界".repeat(200) }).tagline].length, 160);
  assert.equal([...validateThemeFields({ quote: "✨".repeat(100) }).quote].length, 80);
});

test("rejects unknown fields, invalid booleans, and invalid colors", () => {
  assert.throws(() => validateThemeFields({ command: "rm" }), /unknown field/i);
  assert.throws(() => validateThemeFields({ apply: "true" }), /apply must be a boolean/i);
  assert.throws(() => validateThemeFields({ allowRestart: 1 }), /allowRestart must be a boolean/i);
  assert.throws(() => validateThemeFields({ accent: "red" }), /six-digit/i);
  assert.throws(() => validateThemeFields({ secondary: "#abcd" }), /six-digit/i);
});

test("exports exact upload limits", () => {
  assert.equal(LIMITS.jsonBytes, 64 * 1024);
  assert.equal(LIMITS.sourceImageBytes, 50 * 1024 * 1024);
  assert.equal(LIMITS.preparedImageBytes, 16 * 1024 * 1024);
  assert.equal(LIMITS.multipartBytes, 51 * 1024 * 1024);
  assert.equal(LIMITS.jobLogLines, 120);
});

test("accepts generated theme ids and rejects traversal", () => {
  const id = "img-20260719153000-a1b2c3d4";
  assert.equal(validateThemeId(id), id);
  assert.equal(safeChild("/tmp/themes", id), path.join("/tmp/themes", id));
  for (const value of ["../theme", "img-bad", "img-20260719153000-A1B2C3D4", "demo", ""]) {
    assert.throws(() => validateThemeId(value), /invalid theme id/i);
  }
});

test("sniffs supported images by content", () => {
  assert.equal(sniffImage(Buffer.from("ffd8ffe00010", "hex")), "jpeg");
  assert.equal(sniffImage(Buffer.from("89504e470d0a1a0a", "hex")), "png");
  assert.equal(sniffImage(Buffer.from("524946460000000057454250", "hex")), "webp");
  assert.equal(sniffImage(Buffer.from("49492a0008000000", "hex")), "tiff");
  assert.equal(sniffImage(Buffer.from("4d4d002a00000008", "hex")), "tiff");
  assert.equal(sniffImage(Buffer.from("000000186674797068656963", "hex")), "heic");
  assert.equal(sniffImage(Buffer.from("00000018667479706d696631", "hex")), "heic");
  assert.throws(() => sniffImage(Buffer.from("hello")), /unsupported image/i);
});

test("compares bearer tokens without accepting non-strings", () => {
  assert.equal(tokenMatches("secret", "secret"), true);
  assert.equal(tokenMatches("secret", "other"), false);
  assert.equal(tokenMatches("secret", "a much longer secret"), false);
  assert.equal(tokenMatches(undefined, "secret"), false);
});

test("requires exact loopback authority and same origin for mutations", () => {
  assert.doesNotThrow(() => assertRequestAuthority({
    host: "127.0.0.1:9460",
    origin: "http://127.0.0.1:9460",
    expectedHost: "127.0.0.1:9460",
    mutating: true,
  }));
  assert.doesNotThrow(() => assertRequestAuthority({
    host: "127.0.0.1:9460",
    origin: undefined,
    expectedHost: "127.0.0.1:9460",
    mutating: false,
  }));
  assert.throws(() => assertRequestAuthority({
    host: "evil.example",
    origin: "http://127.0.0.1:9460",
    expectedHost: "127.0.0.1:9460",
    mutating: true,
  }), (error) => error instanceof WebStudioError && error.status === 403);
  assert.throws(() => assertRequestAuthority({
    host: "127.0.0.1:9460",
    origin: "https://evil.example",
    expectedHost: "127.0.0.1:9460",
    mutating: true,
  }), (error) => error instanceof WebStudioError && error.status === 403);
  assert.throws(() => assertRequestAuthority({
    host: "127.0.0.1:9460",
    origin: undefined,
    expectedHost: "127.0.0.1:9460",
    mutating: true,
  }), (error) => error instanceof WebStudioError && error.status === 403);
});
