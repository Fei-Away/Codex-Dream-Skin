import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { readImageMetadata } from "./image-metadata.mjs";

const MAX_JSON_BYTES = 256 * 1024;
const MAX_BACKGROUND_BYTES = 16 * 1024 * 1024;
const OPEN_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PACKAGE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const HEX_PATTERN = /^#[0-9a-f]{6}$/;

export class ThemePackageError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = "ThemePackageError";
    this.code = code;
    this.field = field;
  }
}

function fail(code, message, field = null) {
  throw new ThemePackageError(code, message, field);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, field, maximum) {
  if (typeof value !== "string" || value.length < 1 || Array.from(value).length > maximum) {
    fail("MANIFEST_FIELD_INVALID", `${field} must be a non-empty string of at most ${maximum} characters.`, field);
  }
  if (CONTROL_PATTERN.test(value)) {
    fail("MANIFEST_FIELD_INVALID", `${field} must not contain control characters.`, field);
  }
  return value;
}

function exactKeys(object, allowed, code, field) {
  if (!isPlainObject(object)) fail(code, `${field} must be an object.`, field);
  const unknown = Object.keys(object).find((key) => !allowed.includes(key));
  if (unknown) fail(code, `${field}.${unknown} is not supported.`, `${field}.${unknown}`);
}

function requireKeys(object, required, code, field) {
  const missing = required.find((key) => !Object.hasOwn(object, key));
  if (missing) fail(code, `${field}.${missing} is required.`, `${field}.${missing}`);
}

function assertManifest(manifest, { packaged = false } = {}) {
  exactKeys(manifest, [
    "formatVersion", "packageId", "packageVersion", "name", "author", "targets",
    "minimumDreamSkinVersion", "resources", ...(packaged ? ["contentHash"] : []),
  ], "MANIFEST_FIELD_UNKNOWN", "manifest");
  requireKeys(manifest, [
    "formatVersion", "packageId", "packageVersion", "name", "author", "targets",
    "minimumDreamSkinVersion", "resources", ...(packaged ? ["contentHash"] : []),
  ], "MANIFEST_FIELD_REQUIRED", "manifest");
  if (manifest.formatVersion !== 1) {
    fail("MANIFEST_FORMAT_UNSUPPORTED", "formatVersion must be 1.", "formatVersion");
  }
  if (
    typeof manifest.packageId !== "string" || manifest.packageId.length > 128
    || !PACKAGE_ID_PATTERN.test(manifest.packageId)
  ) {
    fail("MANIFEST_FIELD_INVALID", "packageId must be a lowercase reverse-domain-style identifier.", "packageId");
  }
  if (typeof manifest.packageVersion !== "string" || !SEMVER_PATTERN.test(manifest.packageVersion)) {
    fail("MANIFEST_FIELD_INVALID", "packageVersion must be a semantic version.", "packageVersion");
  }
  text(manifest.name, "name", 80);
  exactKeys(manifest.author, ["name", "url"], "MANIFEST_FIELD_UNKNOWN", "author");
  requireKeys(manifest.author, ["name"], "MANIFEST_FIELD_REQUIRED", "author");
  text(manifest.author.name, "author.name", 80);
  if (manifest.author.url !== undefined) {
    text(manifest.author.url, "author.url", 2048);
    let authorUrl;
    try {
      authorUrl = new URL(manifest.author.url);
    } catch {
      fail("MANIFEST_FIELD_INVALID", "author.url must be an absolute HTTP(S) URL.", "author.url");
    }
    if (!["http:", "https:"].includes(authorUrl.protocol) || authorUrl.username || authorUrl.password) {
      fail("MANIFEST_FIELD_INVALID", "author.url must be an absolute HTTP(S) URL without credentials.", "author.url");
    }
  }
  if (!Array.isArray(manifest.targets) || manifest.targets.length < 1) {
    fail("MANIFEST_FIELD_INVALID", "targets must contain macos and/or windows.", "targets");
  }
  if (new Set(manifest.targets).size !== manifest.targets.length
    || manifest.targets.some((target) => !["macos", "windows"].includes(target))) {
    fail("MANIFEST_FIELD_INVALID", "targets must contain unique macos/windows values.", "targets");
  }
  if (
    typeof manifest.minimumDreamSkinVersion !== "string"
    || !SEMVER_PATTERN.test(manifest.minimumDreamSkinVersion)
  ) {
    fail("MANIFEST_FIELD_INVALID", "minimumDreamSkinVersion must be a semantic version.", "minimumDreamSkinVersion");
  }
  if (packaged && (typeof manifest.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(manifest.contentHash))) {
    fail("MANIFEST_FIELD_INVALID", "contentHash must be a lowercase SHA-256 digest.", "contentHash");
  }
  exactKeys(manifest.resources, ["background", "preview"], "MANIFEST_FIELD_UNKNOWN", "resources");
  if (!manifest.resources.background) {
    fail("MANIFEST_FIELD_REQUIRED", "resources.background is required.", "resources.background");
  }
  const resourcePaths = new Set();
  for (const [name, resource] of Object.entries(manifest.resources)) {
    exactKeys(
      resource,
      ["path", "mediaType", ...(packaged ? ["bytes", "sha256"] : [])],
      "MANIFEST_FIELD_UNKNOWN",
      `resources.${name}`,
    );
    requireKeys(
      resource,
      ["path", "mediaType", ...(packaged ? ["bytes", "sha256"] : [])],
      "MANIFEST_FIELD_REQUIRED",
      `resources.${name}`,
    );
    text(resource.path, `resources.${name}.path`, 180);
    if (!/^assets\/[a-z0-9][a-z0-9._-]*$/.test(resource.path)) {
      fail("ASSET_PATH_INVALID", `${resource.path} is not an allowed asset path.`, `resources.${name}.path`);
    }
    if (resourcePaths.has(resource.path)) {
      fail("ASSET_PATH_DUPLICATE", `${resource.path} is declared more than once.`, `resources.${name}.path`);
    }
    resourcePaths.add(resource.path);
    const expected = path.extname(resource.path).toLowerCase() === ".png" ? "image/png"
      : [".jpg", ".jpeg"].includes(path.extname(resource.path).toLowerCase()) ? "image/jpeg"
        : path.extname(resource.path).toLowerCase() === ".webp" ? "image/webp" : null;
    if (!expected || resource.mediaType !== expected) {
      fail("ASSET_MEDIA_TYPE_INVALID", `${resource.path} has an unsupported or mismatched mediaType.`, `resources.${name}.mediaType`);
    }
    if (packaged && (!Number.isSafeInteger(resource.bytes) || resource.bytes < 1)) {
      fail("MANIFEST_FIELD_INVALID", `${resource.path} bytes must be a positive integer.`, `resources.${name}.bytes`);
    }
    if (packaged && (typeof resource.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(resource.sha256))) {
      fail("MANIFEST_FIELD_INVALID", `${resource.path} sha256 must be a lowercase digest.`, `resources.${name}.sha256`);
    }
  }
}

function assertTheme(theme, manifest) {
  exactKeys(theme, [
    "schemaVersion", "name", "background", "appearance", "text", "art", "palette",
  ], "THEME_FIELD_UNKNOWN", "theme");
  requireKeys(
    theme,
    ["schemaVersion", "name", "background", "appearance", "text", "art", "palette"],
    "THEME_FIELD_REQUIRED",
    "theme",
  );
  if (theme.schemaVersion !== 1) {
    fail("THEME_SCHEMA_UNSUPPORTED", "theme.schemaVersion must be 1.", "schemaVersion");
  }
  text(theme.name, "theme.name", 80);
  if (theme.background !== "background") {
    fail("THEME_FIELD_INVALID", "theme.background must reference the background resource.", "background");
  }
  if (!["auto", "light", "dark"].includes(theme.appearance)) {
    fail("THEME_FIELD_INVALID", "theme.appearance must be auto, light, or dark.", "appearance");
  }
  exactKeys(theme.text, ["tagline", "quote"], "THEME_FIELD_UNKNOWN", "text");
  requireKeys(theme.text, ["tagline", "quote"], "THEME_FIELD_REQUIRED", "text");
  text(theme.text.tagline, "theme.text.tagline", 160);
  text(theme.text.quote, "theme.text.quote", 80);
  exactKeys(theme.art, ["focusX", "focusY", "safeArea", "taskMode"], "THEME_FIELD_UNKNOWN", "art");
  requireKeys(theme.art, ["focusX", "focusY", "safeArea", "taskMode"], "THEME_FIELD_REQUIRED", "art");
  for (const coordinate of ["focusX", "focusY"]) {
    if (!Number.isFinite(theme.art[coordinate]) || theme.art[coordinate] < 0 || theme.art[coordinate] > 1) {
      fail("THEME_FIELD_INVALID", `theme.art.${coordinate} must be from 0 to 1.`, `art.${coordinate}`);
    }
  }
  if (!["auto", "left", "right", "center", "none"].includes(theme.art.safeArea)) {
    fail("THEME_FIELD_INVALID", "theme.art.safeArea is not supported.", "art.safeArea");
  }
  if (!["auto", "ambient", "banner", "off"].includes(theme.art.taskMode)) {
    fail("THEME_FIELD_INVALID", "theme.art.taskMode is not supported.", "art.taskMode");
  }
  exactKeys(theme.palette, ["accent", "accentAlt", "secondary", "highlight"], "THEME_FIELD_UNKNOWN", "palette");
  requireKeys(
    theme.palette,
    ["accent", "accentAlt", "secondary", "highlight"],
    "THEME_FIELD_REQUIRED",
    "palette",
  );
  for (const [name, color] of Object.entries(theme.palette)) {
    if (typeof color !== "string" || !HEX_PATTERN.test(color)) {
      fail("THEME_FIELD_INVALID", `theme.palette.${name} must be a lowercase six-digit hex color.`, `palette.${name}`);
    }
  }
  if (theme.name !== manifest.name) {
    fail("THEME_IDENTITY_MISMATCH", "theme.name must equal manifest.name.", "name");
  }
}

function sameStat(before, after) {
  return before.isFile() && after.isFile()
    && before.dev === after.dev
    && before.ino === after.ino
    && before.size === after.size
    && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs;
}

async function readStable(filePath, maximum, code) {
  let handle;
  try {
    handle = await fs.open(filePath, OPEN_FLAGS);
  } catch (error) {
    if (error.code === "ELOOP") fail(code, `${path.basename(filePath)} must not be a symbolic link.`);
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail(code, `${path.basename(filePath)} must be a regular file.`);
    if (before.size < 1 || before.size > maximum) {
      fail(code, `${path.basename(filePath)} exceeds its allowed size.`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameStat(before, after)) fail("SOURCE_CHANGED", `${path.basename(filePath)} changed while being read.`);
    return bytes;
  } finally {
    await handle.close();
  }
}

function decodeJson(bytes, name, prefix = "SOURCE") {
  let textValue;
  try {
    textValue = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${prefix}_UTF8_INVALID`, `${name} must be strict UTF-8.`, name);
  }
  if (textValue.includes("\0")) fail(`${prefix}_UTF8_INVALID`, `${name} must not contain NUL.`, name);
  try {
    return JSON.parse(textValue);
  } catch {
    fail(`${prefix}_JSON_INVALID`, `${name} must contain valid JSON.`, name);
  }
}

async function readJson(sourceRoot, name) {
  const bytes = await readStable(path.join(sourceRoot, name), MAX_JSON_BYTES, "SOURCE_FILE_INVALID");
  return decodeJson(bytes, name);
}

async function assertSourceEntries(sourceRoot, manifest) {
  const allowedFiles = new Set([
    "manifest.json",
    "theme.json",
    "LICENSE.txt",
    "NOTICE.txt",
    ...Object.values(manifest.resources).map((resource) => resource.path),
  ]);
  const rootEntries = await fs.readdir(sourceRoot, { withFileTypes: true });
  for (const entry of rootEntries) {
    const logicalPath = entry.name;
    if (entry.isSymbolicLink()) {
      fail("SOURCE_ENTRY_FORBIDDEN", `${logicalPath} must not be a symbolic link.`, logicalPath);
    }
    if (entry.isDirectory()) {
      if (entry.name !== "assets") {
        fail("SOURCE_ENTRY_FORBIDDEN", `${logicalPath} is not allowed in a theme source.`, logicalPath);
      }
      continue;
    }
    if (!entry.isFile() || !allowedFiles.has(logicalPath)) {
      fail("SOURCE_ENTRY_FORBIDDEN", `${logicalPath} is not allowed in a theme source.`, logicalPath);
    }
  }

  const assetsPath = path.join(sourceRoot, "assets");
  const assetEntries = await fs.readdir(assetsPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") fail("SOURCE_FILE_INVALID", "assets directory is required.", "assets");
    throw error;
  });
  for (const entry of assetEntries) {
    const logicalPath = `assets/${entry.name}`;
    if (entry.isSymbolicLink()) {
      fail("SOURCE_ENTRY_FORBIDDEN", `${logicalPath} must not be a symbolic link.`, logicalPath);
    }
    if (!entry.isFile() || !allowedFiles.has(logicalPath)) {
      fail("SOURCE_ENTRY_FORBIDDEN", `${logicalPath} is not allowed in a theme source.`, logicalPath);
    }
  }
}

function manifestWithoutIntegrity(manifest) {
  return {
    formatVersion: manifest.formatVersion,
    packageId: manifest.packageId,
    packageVersion: manifest.packageVersion,
    name: manifest.name,
    author: manifest.author,
    targets: manifest.targets,
    minimumDreamSkinVersion: manifest.minimumDreamSkinVersion,
    resources: Object.fromEntries(Object.entries(manifest.resources).map(([name, resource]) => [name, {
      path: resource.path,
      mediaType: resource.mediaType,
    }])),
  };
}

function calculateContentHash(manifest, theme, resources) {
  return sha256(canonicalJson({
    manifest: manifestWithoutIntegrity(manifest),
    theme,
    resources: Object.fromEntries(Object.entries(resources).map(([name, resource]) => [name, {
      path: resource.path,
      mediaType: resource.mediaType,
      bytes: resource.bytes,
      sha256: resource.sha256,
    }])),
  }));
}

function baseReport(command, manifest, contentHash, resources) {
  return {
    pass: true,
    command,
    formatVersion: manifest.formatVersion,
    packageId: manifest.packageId,
    packageVersion: manifest.packageVersion,
    contentHash,
    resources,
    warnings: [],
  };
}

async function validateResourceBytes(manifest, byteFor) {
  const resources = {};
  const resourceBytes = new Map();
  for (const [name, declaration] of Object.entries(manifest.resources)) {
    const maximum = name === "background" ? MAX_BACKGROUND_BYTES : 4 * 1024 * 1024;
    const bytes = await byteFor(name, declaration, maximum);
    if (bytes.length < 1 || bytes.length > maximum) {
      fail("ASSET_FILE_INVALID", `${declaration.path} exceeds its allowed size.`, declaration.path);
    }
    const dimensions = readImageMetadata(bytes, path.extname(declaration.path));
    if (!dimensions) {
      fail(
        "ASSET_IMAGE_INVALID",
        `${declaration.path} is not a supported image within the dimension limits.`,
        declaration.path,
      );
    }
    const actual = {
      path: declaration.path,
      mediaType: declaration.mediaType,
      bytes: bytes.length,
      sha256: sha256(bytes),
      dimensions,
    };
    if (declaration.bytes !== undefined && declaration.bytes !== actual.bytes) {
      fail("ASSET_SIZE_MISMATCH", `${declaration.path} does not match its declared byte size.`, declaration.path);
    }
    if (declaration.sha256 !== undefined && declaration.sha256 !== actual.sha256) {
      fail("ASSET_HASH_MISMATCH", `${declaration.path} does not match its declared SHA-256.`, declaration.path);
    }
    resources[name] = actual;
    resourceBytes.set(declaration.path, Buffer.from(bytes));
  }
  return { resources, resourceBytes };
}

export async function validateSource(sourceDirectory) {
  const requestedRoot = path.resolve(sourceDirectory);
  const requestedStat = await fs.lstat(requestedRoot).catch(() => null);
  if (!requestedStat) fail("SOURCE_NOT_FOUND", "Theme source directory does not exist.");
  if (requestedStat.isSymbolicLink()) fail("SOURCE_NOT_DIRECTORY", "Theme source must not be a symbolic link.");
  const sourceRoot = await fs.realpath(sourceDirectory);
  const rootStat = await fs.stat(sourceRoot);
  if (!rootStat.isDirectory()) fail("SOURCE_NOT_DIRECTORY", "Theme source must be a directory.");

  const [manifest, theme] = await Promise.all([
    readJson(sourceRoot, "manifest.json"),
    readJson(sourceRoot, "theme.json"),
  ]);
  assertManifest(manifest);
  assertTheme(theme, manifest);
  await assertSourceEntries(sourceRoot, manifest);

  const { resources, resourceBytes } = await validateResourceBytes(
    manifest,
    (_name, declaration, maximum) => readStable(
      path.join(sourceRoot, ...declaration.path.split("/")),
      maximum,
      "ASSET_FILE_INVALID",
    ),
  );
  const optionalEntries = new Map();
  for (const name of ["LICENSE.txt", "NOTICE.txt"]) {
    if ((await fs.lstat(path.join(sourceRoot, name)).catch(() => null))?.isFile()) {
      optionalEntries.set(name, await readStable(path.join(sourceRoot, name), MAX_JSON_BYTES, "SOURCE_FILE_INVALID"));
    }
  }
  const contentHash = calculateContentHash(manifest, theme, resources);

  return {
    ...baseReport("validate", manifest, contentHash, resources),
    manifest,
    theme,
    resourceBytes,
    optionalEntries,
  };
}

export async function validatePackageEntries(entries) {
  if (!(entries instanceof Map)) fail("CONTAINER_DIRECTORY_INVALID", "Package entries are unavailable.");
  for (const required of ["manifest.json", "theme.json"]) {
    if (!entries.has(required)) fail("CONTAINER_ENTRY_REQUIRED", `${required} is required.`, required);
  }
  const manifest = decodeJson(entries.get("manifest.json"), "manifest.json", "PACKAGE");
  const theme = decodeJson(entries.get("theme.json"), "theme.json", "PACKAGE");
  assertManifest(manifest, { packaged: true });
  assertTheme(theme, manifest);
  const allowed = new Set([
    "manifest.json",
    "theme.json",
    "LICENSE.txt",
    "NOTICE.txt",
    ...Object.values(manifest.resources).map((resource) => resource.path),
  ]);
  for (const name of entries.keys()) {
    if (!allowed.has(name)) {
      fail("CONTAINER_ENTRY_FORBIDDEN", `${name} is not allowed in a theme package.`, name);
    }
  }
  for (const resource of Object.values(manifest.resources)) {
    if (!entries.has(resource.path)) {
      fail("CONTAINER_ENTRY_REQUIRED", `${resource.path} is required.`, resource.path);
    }
  }
  const { resources } = await validateResourceBytes(manifest, (_name, declaration) => entries.get(declaration.path));
  const contentHash = calculateContentHash(manifest, theme, resources);
  if (manifest.contentHash !== contentHash) {
    fail("MANIFEST_CONTENT_HASH_MISMATCH", "manifest contentHash does not match package content.", "contentHash");
  }
  return {
    ...baseReport("inspect", manifest, contentHash, resources),
    manifest,
    theme,
  };
}
