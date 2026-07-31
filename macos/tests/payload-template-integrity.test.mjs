// Regression guard for payload template substitution.
//
// `String.prototype.replace` interprets `$$`, `$&`, "$`" and `$'` in a string
// replacement even when the replacement is not a regular expression result.
// Theme display fields such as `name` are attacker-influenced text that legally
// contains `$`, so building the renderer payload with string replacements let a
// crafted theme corrupt, truncate or silently rewrite the injected script.
// These tests drive the real `loadPayload` build path — not a reimplementation —
// and assert that every `$` construct survives byte-for-byte.

import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { assertPayloadIntegrity, loadPayload } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const templatePath = path.join(macosRoot, "assets", "renderer-inject.js");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-dream-skin-payload-"));

let crcTable = null;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let value = n;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[n] = value;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, checksum]);
}

// A minimal but genuinely decodable PNG so loadPayload's image metadata and
// magic-number checks exercise their real code paths.
function tinyPng(width = 4, height = 4) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const scanlines = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([
    Buffer.from([0]),
    Buffer.alloc(width * 3, 0x40),
  ])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

let themeSequence = 0;
async function makeThemeDir(overrides) {
  themeSequence += 1;
  const directory = path.join(tempRoot, `theme-${themeSequence}`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "background.png"), tinyPng());
  const theme = {
    schemaVersion: 1,
    id: `payload-case-${themeSequence}`,
    name: "Dream Skin",
    image: "background.png",
    ...overrides,
  };
  await fs.writeFile(path.join(directory, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`, "utf8");
  return { directory, theme };
}

async function addSafeCss(directory, source) {
  await fs.writeFile(path.join(directory, "theme.css"), source, "utf8");
}

// The payload is an IIFE. Injecting a `return` as the first statement of its
// body recovers exactly the arguments the renderer would have received, without
// running any renderer logic. If substitution corrupted the payload the values
// recovered here diverge from the theme on disk.
function readPayloadArguments(payload) {
  const marker = "((cssText, artDataUrl, themeConfig) => {";
  const at = payload.indexOf(marker);
  assert.notEqual(at, -1, "payload must keep the canonical renderer IIFE signature");
  const probe = `${payload.slice(0, at + marker.length)}
return { cssText, artDataUrl, themeConfig };
${payload.slice(at + marker.length)}`;
  return vm.runInNewContext(probe, Object.create(null), { timeout: 10_000 });
}

const dollarConstructs = {
  "trailing-match ($')": "$'",
  "preceding-match ($`)": "$`",
  "whole-match ($&)": "$&",
  "escaped-dollar ($$)": "$$",
  "combined ($$$&)": "$$$&",
  "combined (all four)": "$`$'$&$$",
  "embedded in prose": "Neon $& Chrome $$ 主题 $' 夜色 $` 版",
  "leading and trailing": "$$Aurora$&",
};

test("payload substitution preserves $ constructs in theme display text", async () => {
  for (const [label, name] of Object.entries(dollarConstructs)) {
    const { directory, theme } = await makeThemeDir({ name, statusText: name, quote: name });
    const loaded = await loadPayload(directory);

    assert.equal(
      loaded.theme.name,
      name,
      `${label}: loadTheme must keep the theme name verbatim`,
    );
    assert.ok(
      !/__DREAM_SKIN_[A-Z0-9_]+_JSON__/.test(loaded.payload),
      `${label}: no placeholder token may survive substitution`,
    );
    assert.doesNotThrow(
      () => new vm.Script(loaded.payload),
      `${label}: payload must stay parsable`,
    );

    const captured = readPayloadArguments(loaded.payload);
    assert.equal(
      captured.themeConfig.name,
      name,
      `${label}: the renderer must observe the exact theme name`,
    );
    assert.equal(captured.themeConfig.statusText, name, `${label}: statusText must be verbatim`);
    assert.equal(captured.themeConfig.quote, name, `${label}: quote must be verbatim`);
    assert.equal(captured.themeConfig.id, theme.id, `${label}: theme id must be verbatim`);
    assert.equal(
      typeof captured.cssText === "string" && captured.cssText.length > 0,
      true,
      `${label}: CSS must still be substituted`,
    );
    assert.ok(
      captured.artDataUrl.startsWith("data:image/png;base64,"),
      `${label}: art data URL must still be substituted`,
    );
  }
});

test("a benign theme name is unaffected by the substitution fix", async () => {
  const name = "Aurora Terminal 极光";
  const { directory } = await makeThemeDir({ name });
  const loaded = await loadPayload(directory);
  const captured = readPayloadArguments(loaded.payload);
  assert.equal(captured.themeConfig.name, name);
  assert.ok(!/__DREAM_SKIN_[A-Z0-9_]+_JSON__/.test(loaded.payload));
  assert.doesNotThrow(() => new vm.Script(loaded.payload));
});

test("payload injects only the compiled Safe CSS cascade, on both clients", async () => {
  const source = `[data-ds-part="sidebar"] {
  background-color: #123456;
}
[data-ds-part="header"] {
  color: var(--ds-theme-color-text);
}
[data-ds-part="home-hero"] {
  font-weight: 700;
}
[data-ds-part="composer"] {
  border-radius: 17px;
}
[data-ds-part="composer-toolbar"] {
  color: #abcdef;
}`;
  const { directory } = await makeThemeDir({ name: "Safe CSS cascade" });
  await addSafeCss(directory, source);
  const loaded = await loadPayload(directory);
  const captured = readPayloadArguments(loaded.payload);
  assert.equal(loaded.safeCssStatus, "validated");
  assert.match(captured.cssText, /@layer dreamskin-accessibility, dreamskin-community;/);
  assert.match(captured.cssText, /@layer dreamskin-community\s*\{/);
  for (const declaration of [
    "background-color: #123456 !important;",
    "color: var(--ds-theme-color-text) !important;",
    "font-weight: 700 !important;",
    "border-radius: 17px !important;",
    "color: #abcdef !important;",
  ]) assert.ok(captured.cssText.includes(declaration), declaration);
  assert.ok(captured.cssText.includes("background-image: none !important;"));
  assert.match(captured.cssText, /composer-toolbar[^\n]+:where\(button:not/);
  assert.ok(!captured.cssText.includes("background-color: #123456;\n"),
    "The original unprioritized author source must not be appended to the payload.");
});

test("payload byte length does not drift with $ constructs", async () => {
  // Corruption showed up as a payload that grew by the whole template or lost
  // bytes. Identical-length names must produce identical-length payloads.
  const baseline = await makeThemeDir({ name: "AAAA" });
  const dollars = await makeThemeDir({ name: "$$$$" });
  const [baselineLoaded, dollarLoaded] = await Promise.all([
    loadPayload(baseline.directory),
    loadPayload(dollars.directory),
  ]);
  assert.equal(
    Buffer.byteLength(dollarLoaded.payload),
    Buffer.byteLength(baselineLoaded.payload),
    "a four-character name of dollar signs must not change the payload size",
  );
});

test("assertPayloadIntegrity rejects unresolved placeholders and unparsable payloads", async () => {
  const template = await fs.readFile(templatePath, "utf8");
  assert.throws(
    () => assertPayloadIntegrity(template),
    /placeholders were not fully replaced/,
    "the raw template still carries placeholder tokens",
  );
  assert.throws(
    () => assertPayloadIntegrity("((a) => { return a; )("),
    /not a parsable renderer script/,
    "a syntactically broken payload must fail closed",
  );

  const { directory } = await makeThemeDir({ name: "Integrity" });
  const loaded = await loadPayload(directory);
  assert.equal(assertPayloadIntegrity(loaded.payload), true);
});

test("assertPayloadIntegrity only parses and never executes the payload", () => {
  const sentinel = "__dream_skin_payload_integrity_side_effect__";
  delete globalThis[sentinel];
  assertPayloadIntegrity(`globalThis[${JSON.stringify(sentinel)}] = true;`);
  assert.equal(
    Object.hasOwn(globalThis, sentinel),
    false,
    "the integrity guard must compile without running the payload",
  );
});

test("the macOS injector builds payloads with function replacements only", async () => {
  const source = await fs.readFile(path.join(macosRoot, "scripts", "injector.mjs"), "utf8");
  const callPattern = /\.replace\(\s*"(__DREAM_SKIN_[A-Z0-9_]+_JSON__)"\s*,/g;
  const seen = [];
  for (const match of source.matchAll(callPattern)) {
    const rest = source.slice(match.index + match[0].length).trimStart();
    seen.push(match[1]);
    assert.ok(
      rest.startsWith("() =>"),
      `${match[1]} must use a function replacement so $ patterns stay literal, saw: ${
        JSON.stringify(rest.slice(0, 40))
      }`,
    );
  }
  assert.deepEqual(seen, [
    "__DREAM_SKIN_CSS_JSON__",
    "__DREAM_SKIN_ART_JSON__",
    "__DREAM_SKIN_THEME_JSON__",
    "__DREAM_SKIN_VERSION_JSON__",
    "__DREAM_SKIN_STYLE_REVISION_JSON__",
    "__DREAM_SKIN_PAYLOAD_REVISION_JSON__",
  ], "all six payload placeholders must still be substituted");
});

test.after(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});
