import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The Linux localization table is a port of the macOS one, and the client UI
// depends on both exposing the same dreamskin_text keys. This test extracts
// the `case "$language:$key"` branches with a plain line regex (no bash
// parsing) and compares the zh/en key sets across the two platforms.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const linuxLocalization = join(root, "scripts", "localization-linux.sh");
const macosLocalization = join(root, "..", "macos", "scripts", "localization-macos.sh");

const keyPattern = /^\s*(zh|en):([a-z_0-9]+)\)/;

const extractKeys = (file) => {
  const lines = readFileSync(file, "utf8").split("\n");
  const zh = new Set();
  const en = new Set();
  let inTable = false;
  for (const line of lines) {
    if (line.includes('case "$language:$key"')) {
      inTable = true;
      continue;
    }
    if (inTable && /^\s*esac\s*$/.test(line)) break;
    if (!inTable) continue;
    const match = line.match(keyPattern);
    if (!match) continue;
    const [, language, key] = match;
    (language === "zh" ? zh : en).add(key);
  }
  return { zh, en };
};

const linux = extractKeys(linuxLocalization);
const macos = extractKeys(macosLocalization);

test("linux localization table is symmetric across zh and en", () => {
  assert.deepEqual([...linux.zh].sort(), [...linux.en].sort());
});

test("linux zh key set matches the macos source zh key set", () => {
  assert.deepEqual([...linux.zh].sort(), [...macos.zh].sort());
});

test("linux localization table exposes a meaningful number of keys", () => {
  assert.ok(linux.zh.size >= 35, `expected at least 35 keys, got ${linux.zh.size}`);
});
