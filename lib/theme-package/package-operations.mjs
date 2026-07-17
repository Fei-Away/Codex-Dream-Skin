import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fail } from "./errors.mjs";
import { readStableFile } from "./stable-file.mjs";
import { createDeterministicZip, readStrictZip } from "./zip.mjs";
import {
  validatePackageEntries,
  validateSource,
} from "./validate-source.mjs";

const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function publicReport(report, command = report.command) {
  return {
    pass: true,
    command,
    formatVersion: report.formatVersion,
    packageId: report.packageId,
    packageVersion: report.packageVersion,
    contentHash: report.contentHash,
    resources: report.resources,
    warnings: report.warnings,
  };
}

function compareSemver(left, right) {
  const leftMatch = SEMVER_PATTERN.exec(left);
  const rightMatch = SEMVER_PATTERN.exec(right);
  if (!leftMatch || !rightMatch) fail("COMPAT_VERSION_INVALID", "Dream Skin version must be semantic versioning.");
  for (let index = 1; index <= 3; index += 1) {
    const leftPart = BigInt(leftMatch[index]);
    const rightPart = BigInt(rightMatch[index]);
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }
  const leftPre = leftMatch[4]?.split(".") ?? [];
  const rightPre = rightMatch[4]?.split(".") ?? [];
  if (!leftPre.length || !rightPre.length) return leftPre.length ? -1 : rightPre.length ? 1 : 0;
  for (let index = 0; index < Math.max(leftPre.length, rightPre.length); index += 1) {
    if (leftPre[index] === undefined) return -1;
    if (rightPre[index] === undefined) return 1;
    if (leftPre[index] === rightPre[index]) continue;
    const leftNumeric = /^\d+$/.test(leftPre[index]);
    const rightNumeric = /^\d+$/.test(rightPre[index]);
    if (leftNumeric && rightNumeric) {
      const leftPart = BigInt(leftPre[index]);
      const rightPart = BigInt(rightPre[index]);
      if (leftPart === rightPart) continue;
      return leftPart < rightPart ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPre[index] < rightPre[index] ? -1 : 1;
  }
  return 0;
}

function assertCompatibility(manifest, context) {
  if (!context) return null;
  if (!["macos", "windows"].includes(context.platform)) {
    fail("COMPAT_PLATFORM_INVALID", "Platform must be macos or windows.", "platform");
  }
  if (!manifest.targets.includes(context.platform)) {
    fail(
      "COMPAT_PLATFORM_UNSUPPORTED",
      `Package does not target ${context.platform}.`,
      "targets",
    );
  }
  if (compareSemver(context.dreamSkinVersion, manifest.minimumDreamSkinVersion) < 0) {
    fail(
      "COMPAT_VERSION_TOO_OLD",
      `Dream Skin ${context.dreamSkinVersion} is older than required ${manifest.minimumDreamSkinVersion}.`,
      "minimumDreamSkinVersion",
    );
  }
  return {
    compatible: true,
    platform: context.platform,
    dreamSkinVersion: context.dreamSkinVersion,
  };
}

function packageManifest(report) {
  return {
    ...report.manifest,
    resources: Object.fromEntries(Object.entries(report.resources).map(([name, resource]) => [name, {
      path: resource.path,
      mediaType: resource.mediaType,
      bytes: resource.bytes,
      sha256: resource.sha256,
    }])),
    contentHash: report.contentHash,
  };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeNewAtomically(outputPath, bytes) {
  if (path.extname(outputPath).toLowerCase() !== ".dreamskin") {
    fail("OUTPUT_EXTENSION_INVALID", "Output filename must end in .dreamskin.", "output");
  }
  const parent = path.dirname(outputPath);
  const parentStat = await fs.stat(parent).catch(() => null);
  if (!parentStat?.isDirectory()) fail("OUTPUT_DIRECTORY_INVALID", "Output directory does not exist.", "output");
  const temporary = path.join(parent, `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    try {
      // Publishing a hard link is atomic and fails with EEXIST, closing the
      // check-then-rename race that could overwrite a concurrently created file.
      await fs.link(temporary, outputPath);
    } catch (error) {
      if (error.code === "EEXIST") {
        fail("OUTPUT_EXISTS", "Refusing to overwrite an existing output file.", "output");
      }
      throw error;
    }
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

export async function packSource(sourceDirectory, outputPath) {
  const report = await validateSource(sourceDirectory);
  const entries = [
    { name: "manifest.json", bytes: jsonBytes(packageManifest(report)) },
    { name: "theme.json", bytes: jsonBytes(report.theme) },
  ];
  for (const resource of Object.values(report.resources).sort((left, right) => left.path.localeCompare(right.path))) {
    entries.push({ name: resource.path, bytes: report.resourceBytes.get(resource.path) });
  }
  for (const name of ["LICENSE.txt", "NOTICE.txt"]) {
    if (report.optionalEntries.has(name)) entries.push({ name, bytes: report.optionalEntries.get(name) });
  }
  const packageBytes = createDeterministicZip(entries);
  await writeNewAtomically(path.resolve(outputPath), packageBytes);
  return {
    ...publicReport(report, "pack"),
    output: path.basename(outputPath),
    outputBytes: packageBytes.length,
    archiveSha256: createHash("sha256").update(packageBytes).digest("hex"),
  };
}

async function readStablePackage(packagePath) {
  return readStableFile(packagePath, {
    maximum: MAX_PACKAGE_BYTES,
    invalidCode: "PACKAGE_FILE_INVALID",
    missingCode: "PACKAGE_NOT_FOUND",
    label: "Package",
  });
}

export async function inspectPackage(packagePath, compatibility = null) {
  if (path.extname(packagePath).toLowerCase() !== ".dreamskin") {
    fail("PACKAGE_EXTENSION_INVALID", "Package filename must end in .dreamskin.");
  }
  const bytes = await readStablePackage(path.resolve(packagePath));
  const report = await validatePackageEntries(readStrictZip(bytes));
  const compatibilityReport = assertCompatibility(report.manifest, compatibility);
  return {
    ...publicReport(report, "inspect"),
    ...(compatibilityReport ? { compatibility: compatibilityReport } : {}),
    packageBytes: bytes.length,
    archiveSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export { publicReport };
