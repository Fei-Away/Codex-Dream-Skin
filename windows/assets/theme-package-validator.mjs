#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const LIMITS = Object.freeze({
  manifest: 65_536,
  theme: 65_536,
  simpleTheme: 1_048_576,
  css: 262_144,
  image: 16_777_216,
  license: 65_536,
  signature: 4_096,
});

const BACKGROUND_MEDIA = new Map([
  ["background.webp", "image/webp"],
  ["background.jpg", "image/jpeg"],
  ["background.png", "image/png"],
]);
const PAYLOAD_MEDIA = new Map([
  ["theme.json", "application/json"],
  ...BACKGROUND_MEDIA,
  ["theme.css", "text/css"],
  ["LICENSE.txt", "text/plain"],
]);
const PACKAGE_FILES = new Set([
  "manifest.json",
  "manifest.sig",
  ...PAYLOAD_MEDIA.keys(),
]);
const MANIFEST_REQUIRED = [
  "packageVersion",
  "themeId",
  "version",
  "skinApiVersion",
  "minClientVersion",
  "platforms",
  "capabilities",
  "publisher",
  "license",
  "provenance",
  "files",
  "createdAt",
];
const THEME_REQUIRED = ["schemaVersion", "id", "name", "image"];
const THEME_COPY_KEYS = [
  "brandSubtitle",
  "tagline",
  "projectPrefix",
  "projectLabel",
  "statusText",
  "quote",
  "promoTitle",
  "promoSub",
];
const COLOR_KEYS = [
  "background",
  "panel",
  "panelAlt",
  "accent",
  "accentAlt",
  "secondary",
  "highlight",
  "text",
  "muted",
  "line",
];
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const THEME_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const PUBLISHER_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const LICENSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .+()-]*$/;
const KEY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const PROVENANCE_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const COLOR_PATTERN = /^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|#[0-9a-fA-F]{3,4}|rgb\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*\)|rgba\(\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*(0|1|1\.0|0?\.[0-9]{1,6})\s*\))$/;
const RFC3339_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/;
const OPEN_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
const decoder = new TextDecoder("utf-8", { fatal: true });
const scriptPath = fileURLToPath(import.meta.url);

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) fail(`Unknown argument: ${flag ?? "<missing>"}`);
    const key = flag.slice(2);
    if (!new Set(["source", "stage", "platform", "client-version"]).has(key) || values[key]) {
      fail(`Unknown or repeated argument: ${flag}`);
    }
    values[key] = value;
  }
  for (const key of ["source", "stage", "platform", "client-version"]) {
    if (!values[key]) fail(`Missing --${key}`);
  }
  if (!new Set(["macos", "windows"]).has(values.platform)) {
    fail(`Unsupported platform: ${values.platform}`);
  }
  return values;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  return value;
}

function assertExactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${label} is missing ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unsupported field ${key}`);
  }
}

export function codePointLength(value) {
  return Array.from(value).length;
}

export function normalizeThemeText(value, fallback, maxCodePoints, name, sourceLabel) {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string"
    || CONTROL_PATTERN.test(value)
    || codePointLength(value) > maxCodePoints
  ) {
    throw new Error(`${sourceLabel} has an invalid ${name} field`);
  }
  return value.trim() || fallback;
}

export function normalizeThemeColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return COLOR_PATTERN.test(normalized) ? normalized : fallback;
}

function assertString(value, label, { min = 0, max, pattern, controls = CONTROL_PATTERN } = {}) {
  if (typeof value !== "string") fail(`${label} must be a string`);
  const length = codePointLength(value);
  if (length < min || (max !== undefined && length > max)) fail(`${label} has an invalid length`);
  if (controls?.test(value)) fail(`${label} contains control characters`);
  if (pattern && !pattern.test(value)) fail(`${label} has an invalid format`);
  return value;
}

function parseSemver(value, label) {
  assertString(value, label, { min: 1, max: 32, pattern: SEMVER_PATTERN, controls: null });
  return value.split(".").map((part) => BigInt(part));
}

function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}

function assertStringSet(value, label, { min, max, allowed }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must contain between ${min} and ${max} values`);
  }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item)) fail(`${label} contains an unsupported value`);
    if (seen.has(item)) fail(`${label} repeats ${item}`);
    seen.add(item);
  }
  return seen;
}

function decodeJson(bytes, label) {
  let text;
  try {
    text = decoder.decode(bytes);
  } catch {
    fail(`${label} is not valid UTF-8`);
  }
  if (text.includes("\0")) fail(`${label} contains NUL characters`);
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

function expectedLimit(name, simple = false) {
  if (name === "manifest.json") return LIMITS.manifest;
  if (name === "theme.json") return simple ? LIMITS.simpleTheme : LIMITS.theme;
  if (name === "theme.css") return LIMITS.css;
  if (name === "LICENSE.txt") return LIMITS.license;
  if (name === "manifest.sig") return LIMITS.signature;
  if (BACKGROUND_MEDIA.has(name) || /\.(?:png|jpe?g|webp)$/i.test(name)) return LIMITS.image;
  return 0;
}

function sameFileStat(left, right) {
  return left.isFile() && right.isFile()
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

async function readStableFile(root, name, maxBytes) {
  if (path.basename(name) !== name || maxBytes < 1) fail(`Unsafe package file name: ${name}`);
  const filePath = path.join(root, name);
  let handle;
  try {
    handle = await fs.open(filePath, OPEN_FLAGS);
  } catch (error) {
    if (error.code === "ELOOP") fail(`${name} must not be a symbolic link`);
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > maxBytes) {
      fail(`${name} must be a non-empty regular file no larger than ${maxBytes} bytes`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameFileStat(before, after) || bytes.length !== after.size) fail(`${name} changed while being read`);
    return bytes;
  } finally {
    await handle.close();
  }
}

async function resolveDirectory(directory, label, requireEmpty = false) {
  const original = await fs.lstat(directory);
  if (!original.isDirectory() || original.isSymbolicLink()) fail(`${label} must be a real directory`);
  const resolved = await fs.realpath(directory);
  if (requireEmpty && (await fs.readdir(resolved)).length !== 0) fail(`${label} must be empty`);
  return resolved;
}

async function sourceFileNames(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  if (entries.length < 1) fail("Theme package is empty");
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) fail(`Theme package contains a non-file entry: ${entry.name}`);
    if (path.basename(entry.name) !== entry.name || CONTROL_PATTERN.test(entry.name)) {
      fail(`Theme package contains an unsafe file name: ${entry.name}`);
    }
  }
  return entries.map((entry) => entry.name).sort();
}

function validateTimestamp(value) {
  assertString(value, "manifest.createdAt", { min: 1, max: 40, pattern: RFC3339_PATTERN, controls: null });
  if (!Number.isFinite(Date.parse(value))) fail("manifest.createdAt is not a valid date-time");
}

function validateOfficialTheme(value) {
  const theme = assertObject(value, "theme.json");
  assertExactKeys(
    theme,
    THEME_REQUIRED,
    [...THEME_COPY_KEYS, "promoUrl", "appearance", "art", "colors"],
    "theme.json",
  );
  if (theme.schemaVersion !== 1) fail("theme.json must use schemaVersion 1");
  assertString(theme.id, "theme.json.id", { min: 3, max: 64, pattern: THEME_ID_PATTERN, controls: null });
  assertString(theme.name, "theme.json.name", { min: 1, max: 80 });
  assertString(theme.image, "theme.json.image", { min: 1, max: 32, controls: null });
  if (!BACKGROUND_MEDIA.has(theme.image)) fail("theme.json.image must name one registered background file");
  for (const key of THEME_COPY_KEYS) {
    if (theme[key] !== undefined) assertString(theme[key], `theme.json.${key}`, { max: 120 });
  }
  if (theme.promoUrl !== undefined) assertString(theme.promoUrl, "theme.json.promoUrl", { max: 512 });
  if (theme.appearance !== undefined && !new Set(["auto", "light", "dark"]).has(theme.appearance)) {
    fail("theme.json.appearance is unsupported");
  }
  if (theme.art !== undefined) {
    const art = assertObject(theme.art, "theme.json.art");
    assertExactKeys(art, [], ["focusX", "focusY", "safeArea", "taskMode"], "theme.json.art");
    for (const key of ["focusX", "focusY"]) {
      if (art[key] !== undefined && (typeof art[key] !== "number" || !Number.isFinite(art[key]) || art[key] < 0 || art[key] > 1)) {
        fail(`theme.json.art.${key} must be between 0 and 1`);
      }
    }
    if (art.safeArea !== undefined && !new Set(["left", "right", "none"]).has(art.safeArea)) {
      fail("theme.json.art.safeArea is unsupported");
    }
    if (art.taskMode !== undefined && !new Set(["ambient", "full", "off"]).has(art.taskMode)) {
      fail("theme.json.art.taskMode is unsupported");
    }
  }
  if (theme.colors !== undefined) {
    const colors = assertObject(theme.colors, "theme.json.colors");
    assertExactKeys(colors, COLOR_KEYS, [], "theme.json.colors");
    for (const key of COLOR_KEYS) {
      assertString(colors[key], `theme.json.colors.${key}`, {
        min: 1,
        max: 64,
        pattern: COLOR_PATTERN,
        controls: null,
      });
    }
  }
  return theme;
}

function validateManifest(value, platform, clientVersion) {
  const manifest = assertObject(value, "manifest.json");
  assertExactKeys(manifest, MANIFEST_REQUIRED, ["keyId"], "manifest.json");
  if (manifest.packageVersion !== 1) fail("manifest.json must use packageVersion 1");
  if (manifest.skinApiVersion !== 1) fail("manifest.json requires an unsupported Skin API version");
  assertString(manifest.themeId, "manifest.themeId", {
    min: 3,
    max: 64,
    pattern: THEME_ID_PATTERN,
    controls: null,
  });
  parseSemver(manifest.version, "manifest.version");
  const requiredClient = parseSemver(manifest.minClientVersion, "manifest.minClientVersion");
  const installedClient = parseSemver(clientVersion, "client version");
  if (compareSemver(requiredClient, installedClient) > 0) {
    fail(`Theme requires Dream Skin ${manifest.minClientVersion} or newer; installed version is ${clientVersion}`);
  }
  const platforms = assertStringSet(manifest.platforms, "manifest.platforms", {
    min: 1,
    max: 2,
    allowed: new Set(["macos", "windows"]),
  });
  if (!platforms.has(platform)) fail(`Theme package does not support ${platform}`);
  const capabilities = assertStringSet(manifest.capabilities, "manifest.capabilities", {
    min: 1,
    max: 3,
    allowed: new Set(["background", "tokens", "safe-css"]),
  });

  const publisher = assertObject(manifest.publisher, "manifest.publisher");
  assertExactKeys(publisher, ["id", "displayName"], [], "manifest.publisher");
  assertString(publisher.id, "manifest.publisher.id", {
    min: 1,
    max: 64,
    pattern: PUBLISHER_ID_PATTERN,
    controls: null,
  });
  assertString(publisher.displayName, "manifest.publisher.displayName", { min: 1, max: 80 });
  assertString(manifest.license, "manifest.license", {
    min: 1,
    max: 64,
    pattern: LICENSE_PATTERN,
    controls: null,
  });
  const provenance = assertObject(manifest.provenance, "manifest.provenance");
  assertExactKeys(provenance, ["aiGenerated", "summary"], [], "manifest.provenance");
  if (typeof provenance.aiGenerated !== "boolean") fail("manifest.provenance.aiGenerated must be boolean");
  assertString(provenance.summary, "manifest.provenance.summary", {
    min: 1,
    max: 500,
    controls: PROVENANCE_CONTROL_PATTERN,
  });
  if (manifest.keyId !== undefined) {
    assertString(manifest.keyId, "manifest.keyId", {
      min: 1,
      max: 64,
      pattern: KEY_ID_PATTERN,
      controls: null,
    });
  }
  validateTimestamp(manifest.createdAt);

  if (!Array.isArray(manifest.files) || manifest.files.length < 2 || manifest.files.length > 8) {
    fail("manifest.files must contain between 2 and 8 entries");
  }
  const files = new Map();
  for (let index = 0; index < manifest.files.length; index += 1) {
    const entry = assertObject(manifest.files[index], `manifest.files[${index}]`);
    assertExactKeys(entry, ["path", "mediaType", "bytes", "sha256"], [], `manifest.files[${index}]`);
    if (typeof entry.path !== "string" || !PAYLOAD_MEDIA.has(entry.path)) {
      fail(`manifest.files[${index}].path is unsupported`);
    }
    if (files.has(entry.path)) fail(`manifest.files repeats ${entry.path}`);
    if (entry.mediaType !== PAYLOAD_MEDIA.get(entry.path)) {
      fail(`manifest.files mediaType does not match ${entry.path}`);
    }
    const limit = expectedLimit(entry.path);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > limit) {
      fail(`manifest.files bytes for ${entry.path} exceed its limit`);
    }
    if (typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      fail(`manifest.files SHA-256 for ${entry.path} is invalid`);
    }
    files.set(entry.path, entry);
  }
  const backgrounds = [...files.keys()].filter((name) => BACKGROUND_MEDIA.has(name));
  if (!files.has("theme.json") || backgrounds.length !== 1) {
    fail("manifest.files must contain theme.json and exactly one background file");
  }
  if (files.has("theme.css") !== capabilities.has("safe-css")) {
    fail("theme.css presence must match the safe-css capability");
  }
  return { manifest, files, background: backgrounds[0] };
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function detectedImageMedia(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((byte, index) => bytes[index] === byte)) {
    return "image/png";
  }
  if (
    bytes.length >= 12
    && bytes.subarray(0, 4).toString() === "RIFF"
    && bytes.subarray(8, 12).toString() === "WEBP"
  ) return "image/webp";
  return "";
}

async function validateOfficial(root, names, platform, clientVersion) {
  for (const name of names) {
    if (!PACKAGE_FILES.has(name)) fail(`Official theme package contains unregistered file ${name}`);
  }
  if (!names.includes("manifest.json")) fail("Official theme package is missing manifest.json");
  const bytes = new Map();
  for (const name of names) bytes.set(name, await readStableFile(root, name, expectedLimit(name)));
  const { manifest, files, background } = validateManifest(
    decodeJson(bytes.get("manifest.json"), "manifest.json"),
    platform,
    clientVersion,
  );
  const actualPayload = new Set(names.filter((name) => name !== "manifest.json" && name !== "manifest.sig"));
  if (!setsEqual(actualPayload, new Set(files.keys()))) {
    fail("ZIP payload files do not exactly match manifest.files");
  }
  for (const [name, entry] of files) {
    const data = bytes.get(name);
    if (!data) fail(`manifest.files declares missing file ${name}`);
    if (data.length !== entry.bytes) fail(`${name} byte length does not match manifest.json`);
    if (sha256(data) !== entry.sha256) fail(`${name} SHA-256 does not match manifest.json`);
  }
  const theme = validateOfficialTheme(decodeJson(bytes.get("theme.json"), "theme.json"));
  if (manifest.themeId !== theme.id) fail("manifest.themeId does not match theme.json id");
  if (theme.image !== background) fail("theme.json image does not match the manifest background file");
  if (detectedImageMedia(bytes.get(background)) !== BACKGROUND_MEDIA.get(background)) {
    fail(`${background} content does not match its extension and mediaType`);
  }
  return {
    format: "official",
    image: background,
    cssIgnored: bytes.has("theme.css"),
    signatureIgnored: bytes.has("manifest.sig"),
    bytes,
  };
}

async function validateSimple(root, names) {
  if (names.length !== 2 || !names.includes("theme.json")) {
    fail("Local simplified ZIP must contain exactly theme.json and its image");
  }
  const themeBytes = await readStableFile(root, "theme.json", LIMITS.simpleTheme);
  const theme = assertObject(decodeJson(themeBytes, "theme.json"), "theme.json");
  if (theme.schemaVersion !== 1 || typeof theme.image !== "string" || !theme.image) {
    fail("Local simplified theme must use schemaVersion 1 and name an image");
  }
  if (
    path.basename(theme.image) !== theme.image
    || CONTROL_PATTERN.test(theme.image)
    || !/\.(?:png|jpe?g|webp)$/i.test(theme.image)
    || !names.includes(theme.image)
  ) fail("Local simplified theme image must be beside theme.json");
  const imageBytes = await readStableFile(root, theme.image, LIMITS.image);
  const expectedMedia = /\.png$/i.test(theme.image)
    ? "image/png"
    : /\.webp$/i.test(theme.image) ? "image/webp" : "image/jpeg";
  if (detectedImageMedia(imageBytes) !== expectedMedia) {
    fail(`${theme.image} content does not match its extension`);
  }
  return {
    format: "simple",
    image: theme.image,
    cssIgnored: false,
    signatureIgnored: false,
    bytes: new Map([["theme.json", themeBytes], [theme.image, imageBytes]]),
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const source = await resolveDirectory(args.source, "Theme package source");
  const stage = await resolveDirectory(args.stage, "Theme package stage", true);
  const names = await sourceFileNames(source);
  const result = names.includes("manifest.json")
    ? await validateOfficial(source, names, args.platform, args["client-version"])
    : await validateSimple(source, names);
  for (const [name, bytes] of result.bytes) {
    await fs.writeFile(path.join(stage, name), bytes, { flag: "wx", mode: 0o600 });
    await fs.chmod(path.join(stage, name), 0o600);
  }
  return {
    format: result.format,
    image: result.image,
    cssIgnored: result.cssIgnored,
    signatureIgnored: result.signatureIgnored,
  };
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  try {
    process.stdout.write(`${JSON.stringify(await main())}\n`);
  } catch (error) {
    process.stderr.write(`Theme package validation failed: ${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}
