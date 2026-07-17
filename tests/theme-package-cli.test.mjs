import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const cli = path.join(root, "tools", "theme-package.mjs");
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-author-cli-"));

// A real, independently encoded 1x1 PNG keeps the public test at the file and
// CLI boundary instead of substituting an internal image parser.
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function runCli(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function parseReport(result) {
  assert.equal(result.stderr, "", result.stderr);
  assert.notEqual(result.stdout.trim(), "", "CLI must emit one JSON report");
  return JSON.parse(result.stdout);
}

function replaceAllBytes(value, from, to, expectedReplacements) {
  assert.equal(Buffer.byteLength(from), Buffer.byteLength(to));
  const result = Buffer.from(value);
  const needle = Buffer.from(from);
  const replacement = Buffer.from(to);
  let replacements = 0;
  for (let offset = result.indexOf(needle); offset >= 0; offset = result.indexOf(needle, offset + replacement.length)) {
    replacement.copy(result, offset);
    replacements += 1;
  }
  assert.equal(replacements, expectedReplacements, `${from} occurrence count changed unexpectedly`);
  return result;
}

function zipHeaders(value) {
  const bytes = Buffer.from(value);
  const endOffset = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.notEqual(endOffset, -1, "fixture must contain a ZIP end record");
  const count = bytes.readUInt16LE(endOffset + 10);
  let centralOffset = bytes.readUInt32LE(endOffset + 16);
  const headers = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(bytes.readUInt32LE(centralOffset), 0x02014b50);
    const nameLength = bytes.readUInt16LE(centralOffset + 28);
    const extraLength = bytes.readUInt16LE(centralOffset + 30);
    const commentLength = bytes.readUInt16LE(centralOffset + 32);
    const localOffset = bytes.readUInt32LE(centralOffset + 42);
    const name = bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");
    headers.push({ name, centralOffset, localOffset });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return { bytes, headers };
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function mutateStoredEntry(value, name, mutate) {
  const fixture = zipHeaders(value);
  const header = fixture.headers.find((candidate) => candidate.name === name);
  assert.ok(header, `${name} must exist in the fixture package`);
  assert.equal(fixture.bytes.readUInt16LE(header.centralOffset + 10), 0, "fixture entry must use Store");
  const bytesLength = fixture.bytes.readUInt32LE(header.centralOffset + 24);
  const localNameLength = fixture.bytes.readUInt16LE(header.localOffset + 26);
  const localExtraLength = fixture.bytes.readUInt16LE(header.localOffset + 28);
  const dataOffset = header.localOffset + 30 + localNameLength + localExtraLength;
  const original = Buffer.from(fixture.bytes.subarray(dataOffset, dataOffset + bytesLength));
  const changed = Buffer.from(mutate(original));
  assert.equal(changed.length, original.length, "fixture mutation must preserve Store entry size");
  changed.copy(fixture.bytes, dataOffset);
  const checksum = crc32(changed);
  fixture.bytes.writeUInt32LE(checksum, header.localOffset + 14);
  fixture.bytes.writeUInt32LE(checksum, header.centralOffset + 16);
  return fixture.bytes;
}

async function createValidSource(name = "valid-source") {
  const source = path.join(temporaryRoot, name);
  await fs.mkdir(path.join(source, "assets"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(source, "manifest.json"), `${JSON.stringify({
      formatVersion: 1,
      packageId: "ai.kimi.sakura-dawn",
      packageVersion: "1.0.0",
      name: "Kimi Sakura Dawn",
      author: { name: "Kimi Theme Lab" },
      targets: ["macos", "windows"],
      minimumDreamSkinVersion: "1.2.0",
      resources: {
        background: { path: "assets/background.png", mediaType: "image/png" },
      },
    }, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(source, "theme.json"), `${JSON.stringify({
      schemaVersion: 1,
      name: "Kimi Sakura Dawn",
      background: "background",
      appearance: "auto",
      text: {
        tagline: "让樱花晨光落进 Codex 工作台。",
        quote: "MAKE SOMETHING WONDERFUL",
      },
      art: {
        focusX: 0.72,
        focusY: 0.45,
        safeArea: "left",
        taskMode: "ambient",
      },
      palette: {
        accent: "#e25563",
        accentAlt: "#f07a86",
        secondary: "#f3a8af",
        highlight: "#c93d4c",
      },
    }, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(source, "assets", "background.png"), tinyPng),
  ]);
  return source;
}

try {
  const source = await createValidSource();
  const beforeEntries = (await fs.readdir(source, { recursive: true })).sort();
  const beforeManifest = await fs.readFile(path.join(source, "manifest.json"));

  const result = runCli("validate", source);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = parseReport(result);
  assert.deepEqual({
    pass: report.pass,
    command: report.command,
    formatVersion: report.formatVersion,
    packageId: report.packageId,
    packageVersion: report.packageVersion,
  }, {
    pass: true,
    command: "validate",
    formatVersion: 1,
    packageId: "ai.kimi.sakura-dawn",
    packageVersion: "1.0.0",
  });
  assert.match(report.contentHash, /^[0-9a-f]{64}$/);
  assert.equal(report.resources.background.bytes, tinyPng.length);
  assert.equal(
    report.resources.background.sha256,
    createHash("sha256").update(tinyPng).digest("hex"),
  );
  assert.deepEqual(report.resources.background.dimensions, { width: 1, height: 1 });
  assert.deepEqual(report.warnings, []);

  assert.deepEqual((await fs.readdir(source, { recursive: true })).sort(), beforeEntries);
  assert.deepEqual(await fs.readFile(path.join(source, "manifest.json")), beforeManifest);

  const forbiddenSource = await createValidSource("forbidden-source");
  await fs.writeFile(path.join(forbiddenSource, "unused.js"), "process.exit(0);\n", "utf8");
  const forbiddenResult = runCli("validate", forbiddenSource);
  assert.equal(forbiddenResult.status, 1, forbiddenResult.stderr || forbiddenResult.stdout);
  assert.deepEqual(parseReport(forbiddenResult), {
    pass: false,
    code: "SOURCE_ENTRY_FORBIDDEN",
    message: "unused.js is not allowed in a theme source.",
    field: "unused.js",
    persistentChanges: false,
  });

  const firstPackage = path.join(temporaryRoot, "kimi-sakura-a.dreamskin");
  const secondPackage = path.join(temporaryRoot, "kimi-sakura-b.dreamskin");
  const firstPackResult = runCli("pack", source, "--output", firstPackage);
  assert.equal(firstPackResult.status, 0, firstPackResult.stderr || firstPackResult.stdout);
  const firstPackReport = parseReport(firstPackResult);
  assert.equal(firstPackReport.pass, true);
  assert.equal(firstPackReport.command, "pack");
  assert.equal(firstPackReport.contentHash, report.contentHash);
  assert.equal(firstPackReport.outputBytes, (await fs.stat(firstPackage)).size);
  assert.equal(firstPackReport.output, path.basename(firstPackage));

  const secondPackResult = runCli("pack", source, "--output", secondPackage);
  assert.equal(secondPackResult.status, 0, secondPackResult.stderr || secondPackResult.stdout);
  assert.deepEqual(await fs.readFile(secondPackage), await fs.readFile(firstPackage));

  const inspectResult = runCli("inspect", firstPackage);
  assert.equal(inspectResult.status, 0, inspectResult.stderr || inspectResult.stdout);
  const inspectReport = parseReport(inspectResult);
  assert.deepEqual({
    pass: inspectReport.pass,
    command: inspectReport.command,
    formatVersion: inspectReport.formatVersion,
    packageId: inspectReport.packageId,
    packageVersion: inspectReport.packageVersion,
    contentHash: inspectReport.contentHash,
    resources: inspectReport.resources,
    warnings: inspectReport.warnings,
  }, {
    pass: true,
    command: "inspect",
    formatVersion: report.formatVersion,
    packageId: report.packageId,
    packageVersion: report.packageVersion,
    contentHash: report.contentHash,
    resources: report.resources,
    warnings: [],
  });

  const traversalPackage = path.join(temporaryRoot, "traversal.dreamskin");
  await fs.writeFile(
    traversalPackage,
    replaceAllBytes(
      await fs.readFile(firstPackage),
      "assets/background.png",
      "../bad/background.png",
      3,
    ),
  );
  const traversalResult = runCli("inspect", traversalPackage);
  assert.equal(traversalResult.status, 1, traversalResult.stderr || traversalResult.stdout);
  assert.deepEqual(parseReport(traversalResult), {
    pass: false,
    code: "CONTAINER_PATH_INVALID",
    message: "../bad/background.png is not a safe package entry path.",
    field: "../bad/background.png",
    persistentChanges: false,
  });

  const sourceWithNotice = await createValidSource("source-with-notice");
  await fs.writeFile(path.join(sourceWithNotice, "NOTICE.txt"), "Fixture notice.\n", "utf8");
  const noticePackage = path.join(temporaryRoot, "with-notice.dreamskin");
  const noticePackResult = runCli("pack", sourceWithNotice, "--output", noticePackage);
  assert.equal(noticePackResult.status, 0, noticePackResult.stderr || noticePackResult.stdout);
  const duplicatePackage = path.join(temporaryRoot, "duplicate.dreamskin");
  await fs.writeFile(
    duplicatePackage,
    replaceAllBytes(await fs.readFile(noticePackage), "NOTICE.txt", "theme.json", 2),
  );
  const duplicateResult = runCli("inspect", duplicatePackage);
  assert.equal(duplicateResult.status, 1, duplicateResult.stderr || duplicateResult.stdout);
  assert.equal(parseReport(duplicateResult).code, "CONTAINER_ENTRY_DUPLICATE");

  const encryptedPackage = path.join(temporaryRoot, "encrypted.dreamskin");
  const encryptedFixture = zipHeaders(await fs.readFile(firstPackage));
  encryptedFixture.bytes.writeUInt16LE(
    encryptedFixture.bytes.readUInt16LE(encryptedFixture.headers[0].centralOffset + 8) | 1,
    encryptedFixture.headers[0].centralOffset + 8,
  );
  encryptedFixture.bytes.writeUInt16LE(
    encryptedFixture.bytes.readUInt16LE(encryptedFixture.headers[0].localOffset + 6) | 1,
    encryptedFixture.headers[0].localOffset + 6,
  );
  await fs.writeFile(encryptedPackage, encryptedFixture.bytes);
  const encryptedResult = runCli("inspect", encryptedPackage);
  assert.equal(encryptedResult.status, 1, encryptedResult.stderr || encryptedResult.stdout);
  assert.equal(parseReport(encryptedResult).code, "CONTAINER_ENCRYPTED");

  const linkPackage = path.join(temporaryRoot, "link.dreamskin");
  const linkFixture = zipHeaders(await fs.readFile(firstPackage));
  linkFixture.bytes.writeUInt32LE(
    (0o120777 << 16) >>> 0,
    linkFixture.headers[0].centralOffset + 38,
  );
  await fs.writeFile(linkPackage, linkFixture.bytes);
  const linkResult = runCli("inspect", linkPackage);
  assert.equal(linkResult.status, 1, linkResult.stderr || linkResult.stdout);
  assert.equal(parseReport(linkResult).code, "CONTAINER_LINK_FORBIDDEN");

  const corruptedPackage = path.join(temporaryRoot, "corrupted.dreamskin");
  const corruptedBytes = Buffer.from(await fs.readFile(firstPackage));
  const imageOffset = corruptedBytes.indexOf(tinyPng);
  assert.notEqual(imageOffset, -1, "fixture package must contain the source PNG bytes");
  corruptedBytes[imageOffset + tinyPng.length - 1] ^= 0xff;
  await fs.writeFile(corruptedPackage, corruptedBytes);
  const corruptedResult = runCli("inspect", corruptedPackage);
  assert.equal(corruptedResult.status, 1, corruptedResult.stderr || corruptedResult.stdout);
  assert.equal(parseReport(corruptedResult).code, "CONTAINER_CHECKSUM_MISMATCH");

  const assetHashPackage = path.join(temporaryRoot, "asset-hash.dreamskin");
  await fs.writeFile(assetHashPackage, mutateStoredEntry(
    await fs.readFile(firstPackage),
    "assets/background.png",
    (bytes) => {
      bytes[bytes.length - 1] ^= 0xff;
      return bytes;
    },
  ));
  const assetHashResult = runCli("inspect", assetHashPackage);
  assert.equal(assetHashResult.status, 1, assetHashResult.stderr || assetHashResult.stdout);
  assert.equal(parseReport(assetHashResult).code, "ASSET_HASH_MISMATCH");

  const contentHashPackage = path.join(temporaryRoot, "content-hash.dreamskin");
  await fs.writeFile(contentHashPackage, mutateStoredEntry(
    await fs.readFile(firstPackage),
    "manifest.json",
    (bytes) => Buffer.from(bytes.toString("utf8").replace('"packageVersion": "1.0.0"', '"packageVersion": "1.0.1"')),
  ));
  const contentHashResult = runCli("inspect", contentHashPackage);
  assert.equal(contentHashResult.status, 1, contentHashResult.stderr || contentHashResult.stdout);
  assert.equal(parseReport(contentHashResult).code, "MANIFEST_CONTENT_HASH_MISMATCH");

  const unknownPackage = path.join(temporaryRoot, "unknown-entry.dreamskin");
  await fs.writeFile(
    unknownPackage,
    replaceAllBytes(await fs.readFile(noticePackage), "NOTICE.txt", "malware.js", 2),
  );
  const unknownResult = runCli("inspect", unknownPackage);
  assert.equal(unknownResult.status, 1, unknownResult.stderr || unknownResult.stdout);
  assert.equal(parseReport(unknownResult).code, "CONTAINER_ENTRY_FORBIDDEN");

  const schemaSource = await createValidSource("schema-source");
  const schemaThemePath = path.join(schemaSource, "theme.json");
  const schemaTheme = JSON.parse(await fs.readFile(schemaThemePath, "utf8"));
  schemaTheme.plugin = "not-allowed";
  await fs.writeFile(schemaThemePath, `${JSON.stringify(schemaTheme, null, 2)}\n`, "utf8");
  const schemaResult = runCli("validate", schemaSource);
  assert.equal(schemaResult.status, 1, schemaResult.stderr || schemaResult.stdout);
  assert.equal(parseReport(schemaResult).code, "THEME_FIELD_UNKNOWN");

  const imageSource = await createValidSource("image-source");
  await fs.writeFile(path.join(imageSource, "assets", "background.png"), "not an image");
  const imageResult = runCli("validate", imageSource);
  assert.equal(imageResult.status, 1, imageResult.stderr || imageResult.stdout);
  assert.equal(parseReport(imageResult).code, "ASSET_IMAGE_INVALID");

  const limitSource = await createValidSource("limit-source");
  const limitManifestPath = path.join(limitSource, "manifest.json");
  const limitManifest = JSON.parse(await fs.readFile(limitManifestPath, "utf8"));
  limitManifest.resources.preview = {
    path: "assets/preview.png",
    mediaType: "image/png",
  };
  await Promise.all([
    fs.writeFile(limitManifestPath, `${JSON.stringify(limitManifest, null, 2)}\n`, "utf8"),
    fs.writeFile(path.join(limitSource, "assets", "preview.png"), Buffer.alloc(4 * 1024 * 1024 + 1)),
  ]);
  const limitResult = runCli("validate", limitSource);
  assert.equal(limitResult.status, 1, limitResult.stderr || limitResult.stdout);
  assert.equal(parseReport(limitResult).code, "ASSET_FILE_INVALID");

  const compatibleResult = runCli(
    "inspect",
    firstPackage,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.2.0",
  );
  assert.equal(compatibleResult.status, 0, compatibleResult.stderr || compatibleResult.stdout);
  assert.deepEqual(parseReport(compatibleResult).compatibility, {
    compatible: true,
    platform: "macos",
    dreamSkinVersion: "1.2.0",
  });

  const oldVersionResult = runCli(
    "inspect",
    firstPackage,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.1.0",
  );
  assert.equal(oldVersionResult.status, 1, oldVersionResult.stderr || oldVersionResult.stdout);
  assert.equal(parseReport(oldVersionResult).code, "COMPAT_VERSION_TOO_OLD");

  const macOnlySource = await createValidSource("mac-only-source");
  const macOnlyManifestPath = path.join(macOnlySource, "manifest.json");
  const macOnlyManifest = JSON.parse(await fs.readFile(macOnlyManifestPath, "utf8"));
  macOnlyManifest.targets = ["macos"];
  await fs.writeFile(macOnlyManifestPath, `${JSON.stringify(macOnlyManifest, null, 2)}\n`, "utf8");
  const macOnlyPackage = path.join(temporaryRoot, "mac-only.dreamskin");
  const macOnlyPackResult = runCli("pack", macOnlySource, "--output", macOnlyPackage);
  assert.equal(macOnlyPackResult.status, 0, macOnlyPackResult.stderr || macOnlyPackResult.stdout);
  const wrongPlatformResult = runCli(
    "inspect",
    macOnlyPackage,
    "--platform",
    "windows",
    "--dream-skin-version",
    "1.2.0",
  );
  assert.equal(wrongPlatformResult.status, 1, wrongPlatformResult.stderr || wrongPlatformResult.stdout);
  assert.equal(parseReport(wrongPlatformResult).code, "COMPAT_PLATFORM_UNSUPPORTED");
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log("PASS: theme-package validate reports a valid source without mutating it.");
