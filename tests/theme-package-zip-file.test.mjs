import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openStrictZipFile } from "../lib/theme-package/zip-file.mjs";
import { deflateZip } from "./helpers/theme-package-zip-fixtures.mjs";

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
}

const deflatedPath = path.join(temporaryRoot, "deflated.dreamskin");
const deflatedContent = Buffer.from('{"formatVersion":1}\n', "utf8");
await fs.writeFile(deflatedPath, deflateZip("manifest.json", deflatedContent));
const deflatedArchive = await openStrictZipFile(deflatedPath);
try {
  const result = await deflatedArchive.readEntry("manifest.json", { maximum: 256 * 1024 });
  assert.deepEqual(result.bytes, deflatedContent);
  assert.ok(result.maxOutputChunkBytes <= 64 * 1024);
} finally {
  await deflatedArchive.close();
}

const replaceablePath = path.join(temporaryRoot, "replaceable.dreamskin");
const movedPath = path.join(temporaryRoot, "opened-snapshot.dreamskin");
await fs.copyFile(golden, replaceablePath);
const snapshotArchive = await openStrictZipFile(replaceablePath);
try {
  await fs.rename(replaceablePath, movedPath);
  await fs.writeFile(replaceablePath, deflateZip("manifest.json", deflatedContent));
  await assert.rejects(
    snapshotArchive.readEntry("assets/background.jpg", {
      maximum: 16 * 1024 * 1024,
    }),
    (error) => error.code === "SOURCE_CHANGED",
  );
} finally {
  await snapshotArchive.close();
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log("PASS: file-backed ZIP reader streams Store/Deflate and rejects source replacement.");
