import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openStrictZipFile } from "../lib/theme-package/zip-file.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const golden = path.join(root, "examples", "theme-package", "kimi-sakura-dawn.dreamskin");
const expectedBackground = path.join(
  root,
  "examples",
  "theme-package",
  "kimi-sakura-dawn",
  "assets",
  "background.jpg",
);
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-zip-file-"));
const stagedBackground = path.join(temporaryRoot, "system-background.jpg");
const archive = await openStrictZipFile(golden);

try {
  assert.deepEqual(archive.entryNames, [
    "manifest.json",
    "theme.json",
    "assets/background.jpg",
    "NOTICE.txt",
  ]);
  const manifest = await archive.readEntry("manifest.json", { maximum: 256 * 1024 });
  assert.equal(JSON.parse(manifest.bytes.toString("utf8")).formatVersion, 1);

  const copied = await archive.readEntry("assets/background.jpg", {
    maximum: 16 * 1024 * 1024,
    destination: stagedBackground,
  });
  assert.equal(copied.bytes, null);
  assert.ok(copied.maxOutputChunkBytes <= 64 * 1024);
  assert.deepEqual(await fs.readFile(stagedBackground), await fs.readFile(expectedBackground));
} finally {
  await archive.close();
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log("PASS: file-backed ZIP reader streams verified entries into system-named staging files.");
