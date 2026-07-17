#!/usr/bin/env node

// Keep the macOS and Windows distribution copies byte-identical. Each copy
// imports the image validator from its own self-contained platform package.

import { constants as fsConstants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

import { readImageMetadata } from "./image-metadata.mjs";

export const DREAMSKIN_LIMITS = Object.freeze({
  packageBytes: 30 * 1024 * 1024,
  themeBytes: 1024 * 1024,
  imageBytes: 16 * 1024 * 1024,
  previewBytes: 3 * 1024 * 1024,
  decodedBytes: 20 * 1024 * 1024,
  imageDimension: 16384,
  imagePixels: 50_000_000,
  previewDimension: 4096,
  previewPixels: 16 * 1024 * 1024,
});

const PACKAGE_FORMAT = "codex-dream-skin";
const PACKAGE_VERSION = 1;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const IMAGE_MEDIA_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const WINDOWS_DEVICE_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

export class DreamSkinPackageError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "DreamSkinPackageError";
    this.code = code;
  }
}

function failure(code, message, cause) {
  throw new DreamSkinPackageError(code, message, cause ? { cause } : undefined);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, required, optional, code, label) {
  if (!isPlainObject(value)) {
    failure(code, `${label} must be a JSON object.`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      failure(code, `${label} contains an unsupported field: ${key}`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      failure(code, `${label} is missing the required field: ${key}`);
    }
  }
}

function strictJsonParse(text, code, label) {
  let cursor = 0;

  function invalid(message) {
    failure(code, `${label}: ${message}`);
  }

  function skipWhitespace() {
    while (
      text[cursor] === " " ||
      text[cursor] === "\n" ||
      text[cursor] === "\r" ||
      text[cursor] === "\t"
    ) {
      cursor += 1;
    }
  }

  function parseString() {
    const start = cursor;
    cursor += 1;
    while (cursor < text.length) {
      const character = text[cursor];
      if (character === '"') {
        cursor += 1;
        try {
          return JSON.parse(text.slice(start, cursor));
        } catch {
          invalid("contains an invalid JSON string.");
        }
      }
      if (character === "\\") {
        cursor += 1;
        const escape = text[cursor];
        if (escape === "u") {
          const digits = text.slice(cursor + 1, cursor + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) {
            invalid("contains an invalid Unicode escape.");
          }
          cursor += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escape ?? "")) {
          invalid("contains an invalid escape sequence.");
        }
        cursor += 1;
        continue;
      }
      if (character.charCodeAt(0) <= 0x1f) {
        invalid("contains an unescaped control character.");
      }
      cursor += 1;
    }
    invalid("contains an unterminated string.");
  }

  function parseNumber() {
    const match = text
      .slice(cursor)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) invalid("contains an invalid number.");
    cursor += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) invalid("contains a non-finite number.");
    return value;
  }

  function parseArray(depth) {
    const result = [];
    cursor += 1;
    skipWhitespace();
    if (text[cursor] === "]") {
      cursor += 1;
      return result;
    }
    while (cursor < text.length) {
      result.push(parseValue(depth + 1));
      skipWhitespace();
      if (text[cursor] === "]") {
        cursor += 1;
        return result;
      }
      if (text[cursor] !== ",") invalid("contains an invalid array.");
      cursor += 1;
      skipWhitespace();
    }
    invalid("contains an unterminated array.");
  }

  function parseObject(depth) {
    const result = Object.create(null);
    const keys = new Set();
    cursor += 1;
    skipWhitespace();
    if (text[cursor] === "}") {
      cursor += 1;
      return result;
    }
    while (cursor < text.length) {
      if (text[cursor] !== '"') invalid("contains an invalid object key.");
      const key = parseString();
      if (keys.has(key)) invalid(`contains a duplicate object key: ${key}`);
      keys.add(key);
      skipWhitespace();
      if (text[cursor] !== ":") invalid("contains an object key without a value.");
      cursor += 1;
      skipWhitespace();
      result[key] = parseValue(depth + 1);
      skipWhitespace();
      if (text[cursor] === "}") {
        cursor += 1;
        return result;
      }
      if (text[cursor] !== ",") invalid("contains an invalid object.");
      cursor += 1;
      skipWhitespace();
    }
    invalid("contains an unterminated object.");
  }

  function parseValue(depth) {
    if (depth > 64) invalid("exceeds the maximum nesting depth.");
    skipWhitespace();
    const character = text[cursor];
    if (character === '"') return parseString();
    if (character === "{") return parseObject(depth);
    if (character === "[") return parseArray(depth);
    if (character === "-" || /[0-9]/.test(character ?? "")) return parseNumber();
    if (text.startsWith("true", cursor)) {
      cursor += 4;
      return true;
    }
    if (text.startsWith("false", cursor)) {
      cursor += 5;
      return false;
    }
    if (text.startsWith("null", cursor)) {
      cursor += 4;
      return null;
    }
    invalid("contains an invalid value.");
  }

  const value = parseValue(0);
  skipWhitespace();
  if (cursor !== text.length) invalid("contains trailing data.");
  return value;
}

function parseUtf8Json(bytes, code, label) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    failure(code, `${label} must not contain a UTF-8 BOM.`);
  }
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch (error) {
    failure(code, `${label} must be valid UTF-8.`, error);
  }
  return strictJsonParse(text, code, label);
}

function isPortableText(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 80 &&
    /\S/u.test(value) &&
    !CONTROL_PATTERN.test(value)
  );
}

function imageMediaType(fileName) {
  return IMAGE_MEDIA_TYPES.get(path.extname(fileName).toLowerCase()) ?? null;
}

function portableCaseKey(value) {
  return value
    .normalize("NFC")
    .toLocaleUpperCase("en-US")
    .toLocaleLowerCase("en-US");
}

function validatePortableImageName(value, code, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > 240 ||
    value !== value.normalize("NFC") ||
    value === "." ||
    value === ".." ||
    value.endsWith(".") ||
    value.endsWith(" ") ||
    /[<>:"/\\|?*]/u.test(value) ||
    CONTROL_PATTERN.test(value) ||
    WINDOWS_DEVICE_PATTERN.test(value) ||
    !imageMediaType(value)
  ) {
    failure(code, `${label} is not a portable PNG, JPEG, or WebP basename.`);
  }
}

function validatePortableDirectoryName(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > 80 ||
    value !== value.normalize("NFC") ||
    value === "." ||
    value === ".." ||
    !/\S/u.test(value) ||
    value.endsWith(".") ||
    value.endsWith(" ") ||
    /[<>:"/\\|?*]/u.test(value) ||
    CONTROL_PATTERN.test(value) ||
    WINDOWS_DEVICE_PATTERN.test(value)
  ) {
    failure("PACKAGE_PATH_INVALID", "Destination theme directory name is not portable.");
  }
}

function validateTheme(theme) {
  if (!isPlainObject(theme)) {
    failure("THEME_INVALID", "theme.json must contain a JSON object.");
  }
  if (theme.schemaVersion !== 1) {
    failure(
      "THEME_VERSION_UNSUPPORTED",
      "Packaged themes must explicitly declare schemaVersion: 1.",
    );
  }
  validatePortableImageName(theme.image, "THEME_INVALID", "theme.image");
  for (const field of ["id", "name"]) {
    if (Object.hasOwn(theme, field) && !isPortableText(theme[field])) {
      failure("THEME_INVALID", `theme.${field} must be portable display text.`);
    }
  }
  if (
    Object.hasOwn(theme, "appearance") &&
    !["auto", "light", "dark"].includes(theme.appearance)
  ) {
    failure("THEME_INVALID", "theme.appearance is unsupported.");
  }
  if (Object.hasOwn(theme, "art")) {
    if (!isPlainObject(theme.art)) {
      failure("THEME_INVALID", "theme.art must be an object.");
    }
    for (const field of ["focusX", "focusY"]) {
      if (
        Object.hasOwn(theme.art, field) &&
        theme.art[field] !== null &&
        (typeof theme.art[field] !== "number" ||
          !Number.isFinite(theme.art[field]) ||
          theme.art[field] < 0 ||
          theme.art[field] > 1)
      ) {
        failure("THEME_INVALID", `theme.art.${field} must be null or 0..1.`);
      }
    }
    if (
      Object.hasOwn(theme.art, "safeArea") &&
      !["auto", "left", "right", "center", "none"].includes(theme.art.safeArea)
    ) {
      failure("THEME_INVALID", "theme.art.safeArea is unsupported.");
    }
    if (
      Object.hasOwn(theme.art, "taskMode") &&
      !["auto", "ambient", "banner", "off"].includes(theme.art.taskMode)
    ) {
      failure("THEME_INVALID", "theme.art.taskMode is unsupported.");
    }
  }
}

function decodeBase64(value, code, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !BASE64_PATTERN.test(value)
  ) {
    failure(code, `${label} must use canonical RFC 4648 base64.`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    failure(code, `${label} must use canonical RFC 4648 base64.`);
  }
  return bytes;
}

function decodeRecord(record, role, maxBytes) {
  assertExactKeys(
    record,
    ["path", "mediaType", "encoding", "bytes", "sha256", "data"],
    [],
    "PACKAGE_SHAPE_INVALID",
    role,
  );
  if (record.encoding !== "base64") {
    failure("CONTENT_ENCODING_INVALID", `${role}.encoding must be "base64".`);
  }
  if (
    !Number.isSafeInteger(record.bytes) ||
    record.bytes < 1 ||
    record.bytes > maxBytes
  ) {
    failure("CONTENT_SIZE_MISMATCH", `${role}.bytes is outside the allowed range.`);
  }
  if (typeof record.sha256 !== "string" || !SHA256_PATTERN.test(record.sha256)) {
    failure("PACKAGE_SHAPE_INVALID", `${role}.sha256 must be lowercase SHA-256.`);
  }
  const bytes = decodeBase64(record.data, "CONTENT_ENCODING_INVALID", `${role}.data`);
  if (bytes.length !== record.bytes) {
    failure("CONTENT_SIZE_MISMATCH", `${role} decoded byte length does not match.`);
  }
  if (sha256(bytes) !== record.sha256) {
    failure("CONTENT_HASH_MISMATCH", `${role} SHA-256 does not match.`);
  }
  return bytes;
}

function validateImage(bytes, fileName, declaredMediaType, role) {
  validatePortableImageName(
    fileName,
    role === "preview" ? "PREVIEW_INVALID" : "IMAGE_INVALID",
    `${role}.path`,
  );
  const expectedMediaType = imageMediaType(fileName);
  const code = role === "preview" ? "PREVIEW_INVALID" : "IMAGE_INVALID";
  if (declaredMediaType !== expectedMediaType) {
    failure(code, `${role} media type does not match its extension.`);
  }
  const dimensions = readImageMetadata(bytes, path.extname(fileName));
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    failure(code, `${role} content does not match its declared image type.`);
  }
  const maxDimension =
    role === "preview"
      ? DREAMSKIN_LIMITS.previewDimension
      : DREAMSKIN_LIMITS.imageDimension;
  const maxPixels =
    role === "preview" ? DREAMSKIN_LIMITS.previewPixels : DREAMSKIN_LIMITS.imagePixels;
  if (
    dimensions.width > maxDimension ||
    dimensions.height > maxDimension ||
    dimensions.width * dimensions.height > maxPixels
  ) {
    failure(code, `${role} dimensions exceed the allowed limit.`);
  }
  return dimensions;
}

function summarize(validated) {
  return {
    format: PACKAGE_FORMAT,
    packageVersion: PACKAGE_VERSION,
    packageSha256: validated.packageSha256,
    contentId: validated.contentId,
    theme: {
      schemaVersion: validated.theme.schemaVersion,
      id: validated.theme.id ?? "custom",
      name: validated.theme.name ?? "Codex Dream Skin",
      image: validated.theme.image,
    },
    image: {
      path: validated.envelope.image.path,
      mediaType: validated.envelope.image.mediaType,
      bytes: validated.imageBytes.length,
      sha256: validated.envelope.image.sha256,
      width: validated.imageDimensions.width,
      height: validated.imageDimensions.height,
    },
    preview: validated.previewBytes
      ? {
          path: validated.envelope.preview.path,
          mediaType: validated.envelope.preview.mediaType,
          bytes: validated.previewBytes.length,
          sha256: validated.envelope.preview.sha256,
          width: validated.previewDimensions.width,
          height: validated.previewDimensions.height,
        }
      : null,
  };
}

function validatePackageBytes(packageBytes) {
  if (packageBytes.length > DREAMSKIN_LIMITS.packageBytes) {
    failure("PACKAGE_TOO_LARGE", "The .dreamskin file exceeds the package limit.");
  }
  const envelope = parseUtf8Json(
    packageBytes,
    "PACKAGE_INVALID_JSON",
    ".dreamskin package",
  );
  assertExactKeys(
    envelope,
    ["format", "packageVersion", "theme", "image"],
    ["preview"],
    "PACKAGE_SHAPE_INVALID",
    ".dreamskin package",
  );
  if (envelope.format !== PACKAGE_FORMAT) {
    failure("PACKAGE_SHAPE_INVALID", `Package format must be "${PACKAGE_FORMAT}".`);
  }
  if (envelope.packageVersion !== PACKAGE_VERSION) {
    failure(
      "PACKAGE_VERSION_UNSUPPORTED",
      `Unsupported packageVersion: ${String(envelope.packageVersion)}`,
    );
  }

  const themeBytes = decodeRecord(
    envelope.theme,
    "theme",
    DREAMSKIN_LIMITS.themeBytes,
  );
  if (
    envelope.theme.path !== "theme.json" ||
    envelope.theme.mediaType !== "application/json"
  ) {
    failure("PACKAGE_PATH_INVALID", "The theme payload must be theme.json.");
  }

  const imageBytes = decodeRecord(
    envelope.image,
    "image",
    DREAMSKIN_LIMITS.imageBytes,
  );
  validatePortableImageName(envelope.image.path, "PACKAGE_PATH_INVALID", "image.path");

  let previewBytes = null;
  if (Object.hasOwn(envelope, "preview")) {
    previewBytes = decodeRecord(
      envelope.preview,
      "preview",
      DREAMSKIN_LIMITS.previewBytes,
    );
    validatePortableImageName(
      envelope.preview.path,
      "PACKAGE_PATH_INVALID",
      "preview.path",
    );
    if (!/^preview\.(?:png|jpe?g|webp)$/i.test(envelope.preview.path)) {
      failure("PACKAGE_PATH_INVALID", "The preview path must use preview.<image-ext>.");
    }
  }

  const decodedBytes =
    themeBytes.length + imageBytes.length + (previewBytes?.length ?? 0);
  if (decodedBytes > DREAMSKIN_LIMITS.decodedBytes) {
    failure("PACKAGE_TOO_LARGE", "Decoded package content exceeds the total limit.");
  }

  const logicalPaths = [
    envelope.theme.path,
    envelope.image.path,
    ...(previewBytes ? [envelope.preview.path] : []),
  ];
  if (
    new Set(logicalPaths.map((entry) => portableCaseKey(entry))).size !==
    logicalPaths.length
  ) {
    failure("PACKAGE_PATH_INVALID", "Package payload paths collide by case.");
  }

  const theme = parseUtf8Json(themeBytes, "THEME_INVALID", "theme.json");
  validateTheme(theme);
  if (theme.image !== envelope.image.path) {
    failure("THEME_INVALID", "theme.image must exactly match image.path.");
  }

  const imageDimensions = validateImage(
    imageBytes,
    envelope.image.path,
    envelope.image.mediaType,
    "image",
  );
  const previewDimensions = previewBytes
    ? validateImage(
        previewBytes,
        envelope.preview.path,
        envelope.preview.mediaType,
        "preview",
      )
    : null;
  const contentId = sha256(
    Buffer.from(
      `codex-dream-skin:v1\0${envelope.theme.sha256}\0${envelope.image.sha256}`,
      "utf8",
    ),
  );
  return {
    envelope,
    theme,
    themeBytes,
    imageBytes,
    previewBytes,
    imageDimensions,
    previewDimensions,
    packageSha256: sha256(packageBytes),
    contentId,
  };
}

function packageExtension(filePath) {
  if (path.extname(filePath).toLowerCase() !== ".dreamskin") {
    failure("PACKAGE_PATH_INVALID", "Package paths must end with .dreamskin.");
  }
}

function sameSnapshot(before, after) {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs
  );
}

function sameFilesystemPath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32" || process.platform === "darwin"
    ? normalizedLeft.toLocaleLowerCase("en-US") ===
        normalizedRight.toLocaleLowerCase("en-US")
    : normalizedLeft === normalizedRight;
}

async function readStableRegularFile(filePath, maxBytes, missingCode, label) {
  const absolute = path.resolve(filePath);
  let initial;
  let initialReal;
  try {
    initial = await lstat(absolute);
    initialReal = await realpath(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") failure(missingCode, `${label} was not found.`);
    failure("STAGING_FAILED", `Could not inspect ${label}.`, error);
  }
  if (initial.isSymbolicLink() || !initial.isFile()) {
    failure("PACKAGE_PATH_INVALID", `${label} must be a regular file, not a link.`);
  }
  if (!sameFilesystemPath(initialReal, absolute)) {
    failure("PACKAGE_PATH_INVALID", `${label} must not traverse a linked path.`);
  }
  if (initial.size < 1 || initial.size > maxBytes) {
    const code = label === ".dreamskin package" ? "PACKAGE_TOO_LARGE" : "CONTENT_SIZE_MISMATCH";
    failure(code, `${label} is empty or exceeds its size limit.`);
  }

  let handle;
  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  try {
    handle = await open(absolute, fsConstants.O_RDONLY | noFollow);
  } catch (error) {
    if (noFollow && process.platform === "win32" && ["EINVAL", "ENOTSUP"].includes(error?.code)) {
      handle = await open(absolute, fsConstants.O_RDONLY);
    } else {
      failure("PACKAGE_PATH_INVALID", `Could not safely open ${label}.`, error);
    }
  }

  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maxBytes) {
      failure("CONTENT_SIZE_MISMATCH", `${label} changed before it was read.`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameSnapshot(before, after) || bytes.length !== after.size) {
      failure("SOURCE_CHANGED", `${label} changed while it was being read.`);
    }
    const final = await lstat(absolute);
    const finalReal = await realpath(absolute);
    if (
      final.isSymbolicLink() ||
      !sameSnapshot(initial, final) ||
      !sameFilesystemPath(initialReal, finalReal)
    ) {
      failure("SOURCE_CHANGED", `${label} changed while it was being read.`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function inspectDirectory(directoryPath, label) {
  const absolute = path.resolve(directoryPath);
  let entry;
  try {
    entry = await lstat(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") failure("PACKAGE_NOT_FOUND", `${label} was not found.`);
    failure("STAGING_FAILED", `Could not inspect ${label}.`, error);
  }
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    failure("PACKAGE_PATH_INVALID", `${label} must be a real directory.`);
  }
  const resolvedReal = await realpath(absolute);
  if (!sameFilesystemPath(resolvedReal, absolute)) {
    failure("PACKAGE_PATH_INVALID", `${label} must not traverse a linked path.`);
  }
  return { absolute, real: resolvedReal };
}

async function assertDirectoryIdentity(directoryPath, expected) {
  let current;
  let resolvedReal;
  try {
    current = await lstat(directoryPath);
    resolvedReal = await realpath(directoryPath);
  } catch (error) {
    failure("PUBLISH_FAILED", "Destination directory changed during import.", error);
  }
  if (
    current.isSymbolicLink() ||
    !current.isDirectory() ||
    current.dev !== expected.dev ||
    current.ino !== expected.ino ||
    current.birthtimeMs !== expected.birthtimeMs ||
    !sameFilesystemPath(resolvedReal, directoryPath)
  ) {
    failure("PUBLISH_FAILED", "Destination directory changed during import.");
  }
}

async function removeDirectoryIfIdentityMatches(directoryPath, expected) {
  if (!expected) return false;
  try {
    const current = await lstat(directoryPath);
    if (
      current.isSymbolicLink() ||
      !current.isDirectory() ||
      current.dev !== expected.dev ||
      current.ino !== expected.ino ||
      current.birthtimeMs !== expected.birthtimeMs
    ) {
      return false;
    }
    await rm(directoryPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    return error?.code === "ENOENT";
  }
}

function assertWithinRoot(root, candidate, code, label) {
  const relative = path.relative(root, candidate);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return;
  }
  failure(code, `${label} escapes its theme directory.`);
}

async function readThemeDirectory(themeDirectory) {
  const root = await inspectDirectory(themeDirectory, "Theme directory");
  const themePath = path.join(root.absolute, "theme.json");
  const themeBytes = await readStableRegularFile(
    themePath,
    DREAMSKIN_LIMITS.themeBytes,
    "PACKAGE_NOT_FOUND",
    "theme.json",
  );
  const theme = parseUtf8Json(themeBytes, "THEME_INVALID", "theme.json");
  validateTheme(theme);
  const imagePath = path.join(root.absolute, theme.image);
  let imageReal;
  try {
    imageReal = await realpath(imagePath);
  } catch (error) {
    if (error?.code === "ENOENT") failure("PACKAGE_NOT_FOUND", "Theme image was not found.");
    failure("PACKAGE_PATH_INVALID", "Could not resolve the theme image.", error);
  }
  assertWithinRoot(root.real, imageReal, "PACKAGE_PATH_INVALID", "Theme image");
  const imageBytes = await readStableRegularFile(
    imagePath,
    DREAMSKIN_LIMITS.imageBytes,
    "PACKAGE_NOT_FOUND",
    "Theme image",
  );
  validateImage(imageBytes, theme.image, imageMediaType(theme.image), "image");
  const confirmedThemeBytes = await readStableRegularFile(
    themePath,
    DREAMSKIN_LIMITS.themeBytes,
    "PACKAGE_NOT_FOUND",
    "theme.json",
  );
  const confirmedImageBytes = await readStableRegularFile(
    imagePath,
    DREAMSKIN_LIMITS.imageBytes,
    "PACKAGE_NOT_FOUND",
    "Theme image",
  );
  if (
    !themeBytes.equals(confirmedThemeBytes) ||
    !imageBytes.equals(confirmedImageBytes)
  ) {
    failure("SOURCE_CHANGED", "Theme files changed while the pair was captured.");
  }
  return { theme, themeBytes, imageBytes };
}

function makeRecord(logicalPath, mediaType, bytes) {
  return {
    path: logicalPath,
    mediaType,
    encoding: "base64",
    bytes: bytes.length,
    sha256: sha256(bytes),
    data: bytes.toString("base64"),
  };
}

async function syncDirectory(directoryPath) {
  let handle;
  try {
    handle = await open(directoryPath, fsConstants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (process.platform !== "win32" && !["EINVAL", "ENOTSUP", "EISDIR"].includes(error?.code)) {
      throw error;
    }
  } finally {
    await handle?.close();
  }
}

async function writeExclusiveFile(filePath, bytes, mode = 0o600) {
  const handle = await open(filePath, "wx", mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function destinationDoesNotExist(filePath) {
  try {
    await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    failure("PUBLISH_FAILED", `Could not inspect destination: ${filePath}`, error);
  }
  failure("OUTPUT_EXISTS", `Refusing to overwrite existing path: ${filePath}`);
}

async function removeFileIfIdentityMatches(filePath, expected) {
  if (!expected) return false;
  try {
    const current = await lstat(filePath);
    if (
      current.isSymbolicLink() ||
      !current.isFile() ||
      current.dev !== expected.dev ||
      current.ino !== expected.ino ||
      current.birthtimeMs !== expected.birthtimeMs
    ) {
      return false;
    }
    await unlink(filePath);
    return true;
  } catch (error) {
    return error?.code === "ENOENT";
  }
}

async function validatedParent(targetPath) {
  const parent = path.dirname(path.resolve(targetPath));
  const inspected = await inspectDirectory(parent, "Destination parent");
  return { parent: inspected.absolute, parentReal: inspected.real };
}

async function publishPackage(outputFile, packageBytes) {
  const requestedOutput = path.resolve(outputFile);
  packageExtension(requestedOutput);
  const { parentReal } = await validatedParent(requestedOutput);
  const parent = parentReal;
  const output = path.join(parent, path.basename(requestedOutput));
  await destinationDoesNotExist(output);
  const temporary = path.join(
    parent,
    `.${path.basename(output)}.${process.pid}.${randomBytes(8).toString("hex")}.dreamskin`,
  );
  let temporaryIdentity = null;
  try {
    await writeExclusiveFile(temporary, packageBytes);
    const temporaryBytes = await readStableRegularFile(
      temporary,
      DREAMSKIN_LIMITS.packageBytes,
      "PACKAGE_NOT_FOUND",
      ".dreamskin package",
    );
    validatePackageBytes(temporaryBytes);
    temporaryIdentity = await lstat(temporary);
    try {
      await link(temporary, output);
    } catch (error) {
      if (error?.code === "EEXIST") {
        failure("OUTPUT_EXISTS", `Refusing to overwrite existing path: ${output}`);
      }
      failure("PUBLISH_FAILED", "Could not atomically publish the package.", error);
    }
    const outputIdentity = await lstat(output);
    if (
      outputIdentity.isSymbolicLink() ||
      !outputIdentity.isFile() ||
      outputIdentity.dev !== temporaryIdentity.dev ||
      outputIdentity.ino !== temporaryIdentity.ino ||
      outputIdentity.birthtimeMs !== temporaryIdentity.birthtimeMs
    ) {
      failure("PUBLISH_FAILED", "Published package identity changed unexpectedly.");
    }
    await unlink(temporary);
    await syncDirectory(parent);
    const publishedBytes = await readStableRegularFile(
      output,
      DREAMSKIN_LIMITS.packageBytes,
      "PACKAGE_NOT_FOUND",
      ".dreamskin package",
    );
    if (sha256(publishedBytes) !== sha256(packageBytes)) {
      failure("PUBLISH_FAILED", "Published package readback changed unexpectedly.");
    }
    validatePackageBytes(publishedBytes);
    return output;
  } catch (error) {
    await removeFileIfIdentityMatches(output, temporaryIdentity);
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function inspectPackage(packageFile) {
  const absolute = path.resolve(packageFile);
  packageExtension(absolute);
  const packageBytes = await readStableRegularFile(
    absolute,
    DREAMSKIN_LIMITS.packageBytes,
    "PACKAGE_NOT_FOUND",
    ".dreamskin package",
  );
  return summarize(validatePackageBytes(packageBytes));
}

export async function exportPackage(themeDirectory, outputFile, options = {}) {
  assertExactKeys(
    options,
    [],
    ["previewPath"],
    "PACKAGE_SHAPE_INVALID",
    "Export options",
  );
  const source = await readThemeDirectory(themeDirectory);
  const envelope = {
    format: PACKAGE_FORMAT,
    packageVersion: PACKAGE_VERSION,
    theme: makeRecord("theme.json", "application/json", source.themeBytes),
    image: makeRecord(
      source.theme.image,
      imageMediaType(source.theme.image),
      source.imageBytes,
    ),
  };
  if (options.previewPath !== undefined) {
    const previewBytes = await readStableRegularFile(
      options.previewPath,
      DREAMSKIN_LIMITS.previewBytes,
      "PACKAGE_NOT_FOUND",
      "Preview image",
    );
    const extension = path.extname(options.previewPath).toLowerCase();
    const previewPath = `preview${extension}`;
    const mediaType = imageMediaType(previewPath);
    validateImage(previewBytes, previewPath, mediaType, "preview");
    envelope.preview = makeRecord(previewPath, mediaType, previewBytes);
  }
  const packageBytes = Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  if (packageBytes.length > DREAMSKIN_LIMITS.packageBytes) {
    failure("PACKAGE_TOO_LARGE", "Encoded package exceeds the package limit.");
  }
  validatePackageBytes(packageBytes);
  const output = await publishPackage(outputFile, packageBytes);
  return { output, ...(await inspectPackage(output)) };
}

export async function importPackage(packageFile, destinationDirectory) {
  const packagePath = path.resolve(packageFile);
  packageExtension(packagePath);
  const packageBytes = await readStableRegularFile(
    packagePath,
    DREAMSKIN_LIMITS.packageBytes,
    "PACKAGE_NOT_FOUND",
    ".dreamskin package",
  );
  const validated = validatePackageBytes(packageBytes);
  const requestedDestination = path.resolve(destinationDirectory);
  const destinationName = path.basename(requestedDestination);
  validatePortableDirectoryName(destinationName);
  const { parentReal } = await validatedParent(requestedDestination);
  const parent = parentReal;
  const destination = path.join(parent, destinationName);
  await destinationDoesNotExist(destination);
  const staging = await mkdtemp(path.join(parent, ".dreamskin-import-"));
  await chmod(staging, 0o700);
  const stagingIdentity = await lstat(staging);
  let destinationCreated = false;
  let destinationIdentity = null;
  try {
    const stagedImage = path.join(staging, validated.envelope.image.path);
    const stagedTheme = path.join(staging, "theme.json");
    await writeExclusiveFile(stagedImage, validated.imageBytes);
    await writeExclusiveFile(stagedTheme, validated.themeBytes);

    const readback = await readThemeDirectory(staging);
    if (
      sha256(readback.themeBytes) !== validated.envelope.theme.sha256 ||
      sha256(readback.imageBytes) !== validated.envelope.image.sha256
    ) {
      failure("STAGING_FAILED", "Staged theme readback did not match the package.");
    }

    try {
      await mkdir(destination, { mode: 0o700 });
      destinationCreated = true;
    } catch (error) {
      if (error?.code === "EEXIST") {
        failure("OUTPUT_EXISTS", `Refusing to overwrite existing path: ${destination}`);
      }
      failure("PUBLISH_FAILED", "Could not create the destination theme directory.", error);
    }

    destinationIdentity = await lstat(destination);
    await assertDirectoryIdentity(destination, destinationIdentity);
    await rename(stagedImage, path.join(destination, validated.envelope.image.path));
    await assertDirectoryIdentity(destination, destinationIdentity);
    await rename(stagedTheme, path.join(destination, "theme.json"));
    await assertDirectoryIdentity(destination, destinationIdentity);
    await syncDirectory(destination);
    await syncDirectory(parent);

    const published = await readThemeDirectory(destination);
    if (
      sha256(published.themeBytes) !== validated.envelope.theme.sha256 ||
      sha256(published.imageBytes) !== validated.envelope.image.sha256
    ) {
      failure("PUBLISH_FAILED", "Published theme readback did not match the package.");
    }
    await removeDirectoryIfIdentityMatches(staging, stagingIdentity);
    return { destination, ...summarize(validated) };
  } catch (error) {
    if (destinationCreated) {
      await removeDirectoryIfIdentityMatches(destination, destinationIdentity);
    }
    await removeDirectoryIfIdentityMatches(staging, stagingIdentity);
    if (error instanceof DreamSkinPackageError) throw error;
    failure("PUBLISH_FAILED", "Could not publish the imported theme.", error);
  }
}

function usage() {
  return [
    "Usage:",
    "  dreamskin-package inspect <file.dreamskin>",
    "  dreamskin-package export <theme-directory> <file.dreamskin> [--preview <image>]",
    "  dreamskin-package import <file.dreamskin> <destination-directory>",
  ].join("\n");
}

async function main(arguments_) {
  const [command, ...parameters] = arguments_;
  if (command === "inspect" && parameters.length === 1) {
    return inspectPackage(parameters[0]);
  }
  if (command === "import" && parameters.length === 2) {
    return importPackage(parameters[0], parameters[1]);
  }
  if (command === "export") {
    if (parameters.length === 2) {
      return exportPackage(parameters[0], parameters[1]);
    }
    if (
      parameters.length === 4 &&
      parameters[2] === "--preview" &&
      parameters[3]
    ) {
      return exportPackage(parameters[0], parameters[1], {
        previewPath: parameters[3],
      });
    }
  }
  failure("USAGE", usage());
}

const entryUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (entryUrl === import.meta.url) {
  main(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error) => {
      const code =
        error instanceof DreamSkinPackageError ? error.code : "UNEXPECTED_ERROR";
      process.stderr.write(`${code}: ${error.message}\n`);
      process.exitCode =
        code === "USAGE" ? 64 : code === "OUTPUT_EXISTS" ? 3 : code.startsWith("PACKAGE_") || code.startsWith("CONTENT_") || code.startsWith("THEME_") || code.endsWith("_INVALID") ? 2 : 1;
    });
}
