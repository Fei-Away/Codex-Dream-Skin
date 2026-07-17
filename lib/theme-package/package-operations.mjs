import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { createDeterministicZip, readStrictZip } from "./zip.mjs";
import {
  ThemePackageError,
  validatePackageEntries,
  validateSource,
} from "./validate-source.mjs";

const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
const OPEN_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function fail(code, message, field = null) {
  throw new ThemePackageError(code, message, field);
}

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
    const difference = Number(leftMatch[index]) - Number(rightMatch[index]);
    if (difference !== 0) return Math.sign(difference);
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
    if (leftNumeric && rightNumeric) return Math.sign(Number(leftPre[index]) - Number(rightPre[index]));
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
  if (await fs.lstat(outputPath).catch(() => null)) {
    fail("OUTPUT_EXISTS", "Refusing to overwrite an existing output file.", "output");
  }
  const temporary = path.join(parent, `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, outputPath);
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

function sameStat(before, after) {
  return before.isFile() && after.isFile()
    && before.dev === after.dev
    && before.ino === after.ino
    && before.size === after.size
    && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs;
}

async function readStablePackage(packagePath) {
  let handle;
  try {
    handle = await fs.open(packagePath, OPEN_FLAGS);
  } catch (error) {
    if (error.code === "ELOOP") fail("PACKAGE_FILE_INVALID", "Package must not be a symbolic link.");
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > MAX_PACKAGE_BYTES) {
      fail("PACKAGE_FILE_INVALID", "Package must be a regular file no larger than 32 MiB.");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameStat(before, after)) fail("SOURCE_CHANGED", "Package changed while being read.");
    return bytes;
  } finally {
    await handle.close();
  }
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
