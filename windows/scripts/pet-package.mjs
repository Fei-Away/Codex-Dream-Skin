import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "./image-metadata.mjs";

const MANIFEST_NAME = "pet.json";
const SPRITESHEET_NAME = "spritesheet.webp";
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SPRITESHEET_BYTES = 16 * 1024 * 1024;
const EXPECTED_WIDTH = 1536;
const EXPECTED_HEIGHT = 2288;
const ALLOWED_MANIFEST_KEYS = new Set([
  "id",
  "displayName",
  "description",
  "spriteVersionNumber",
  "spritesheetPath",
]);
const utf8 = new TextDecoder("utf-8", { fatal: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

async function assertRegularFile(filePath, label) {
  let entry;
  try {
    entry = await fs.lstat(filePath);
  } catch {
    throw new Error(`${label} is missing: ${filePath}`);
  }
  assert(entry.isFile() && !entry.isSymbolicLink(), `${label} must be a regular file, not a link: ${filePath}`);
  return entry;
}

async function assertRealPathInside(filePath, packageRoot, label) {
  const [realFile, realRoot] = await Promise.all([fs.realpath(filePath), fs.realpath(packageRoot)]);
  assert(isPathInside(realFile, realRoot), `${label} escaped the package directory: ${filePath}`);
}

function normalizeString(value, label, maximumLength) {
  assert(typeof value === "string", `${label} must be a string.`);
  const normalized = value.trim();
  assert(normalized.length > 0, `${label} cannot be empty.`);
  assert(normalized.length <= maximumLength, `${label} exceeds ${maximumLength} characters.`);
  assert(!/[\u0000-\u001f\u007f]/u.test(normalized), `${label} contains control characters.`);
  return normalized;
}

export function normalizePetManifest(value) {
  assert(value && typeof value === "object" && !Array.isArray(value), "pet.json must contain one JSON object.");
  const unknown = Object.keys(value).filter((key) => !ALLOWED_MANIFEST_KEYS.has(key));
  assert(unknown.length === 0, `pet.json contains unsupported fields: ${unknown.join(", ")}`);

  const id = normalizeString(value.id, "id", 64);
  assert(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(id),
    "id must use lowercase ASCII letters, digits, and single hyphen-separated segments.");
  assert(!id.includes("--"), "id cannot contain consecutive hyphens.");

  const displayName = normalizeString(value.displayName, "displayName", 80);
  const description = normalizeString(value.description, "description", 280);
  assert(value.spriteVersionNumber === 2, "spriteVersionNumber must be 2 for an 8x11 pet atlas.");
  assert(value.spritesheetPath === SPRITESHEET_NAME,
    `spritesheetPath must be exactly ${JSON.stringify(SPRITESHEET_NAME)}.`);

  return {
    id,
    displayName,
    description,
    spriteVersionNumber: 2,
    spritesheetPath: SPRITESHEET_NAME,
  };
}

function uint32le(bytes, offset) {
  return bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000;
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function inspectWebp(bytes) {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return { alpha: false, imagePayload: false };
  }
  const riffEnd = uint32le(bytes, 4) + 8;
  if (riffEnd !== bytes.length) return { alpha: false, imagePayload: false };
  let offset = 12;
  let alpha = false;
  let imagePayload = false;
  while (offset + 8 <= riffEnd) {
    const type = ascii(bytes, offset, 4);
    const size = uint32le(bytes, offset + 4);
    const data = offset + 8;
    if (data + size > riffEnd) return { alpha: false, imagePayload: false };
    if (type === "VP8X" && size >= 10) alpha ||= (bytes[data] & 0x10) !== 0;
    if (type === "ALPH") alpha = true;
    if (type === "VP8 " && size >= 10 && bytes[data + 3] === 0x9d &&
      bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      imagePayload = true;
    }
    if (type === "VP8L" && size >= 5 && bytes[data] === 0x2f) {
      imagePayload = true;
      alpha ||= (bytes[data + 4] & 0x10) !== 0;
    }
    offset = data + size + (size % 2);
  }
  if (offset !== riffEnd) return { alpha: false, imagePayload: false };
  return { alpha, imagePayload };
}

export function webpHasAlpha(bytes) {
  return inspectWebp(bytes).alpha;
}

export async function validatePetPackage(packagePath) {
  const packageRoot = path.resolve(packagePath);
  let packageEntry;
  try {
    packageEntry = await fs.lstat(packageRoot);
  } catch {
    throw new Error(`Pet package directory does not exist: ${packageRoot}`);
  }
  assert(packageEntry.isDirectory() && !packageEntry.isSymbolicLink(),
    `Pet package must be a real directory, not a link: ${packageRoot}`);

  const manifestPath = path.join(packageRoot, MANIFEST_NAME);
  const manifestEntry = await assertRegularFile(manifestPath, MANIFEST_NAME);
  assert(manifestEntry.size > 0 && manifestEntry.size <= MAX_MANIFEST_BYTES,
    `${MANIFEST_NAME} must be between 1 byte and ${MAX_MANIFEST_BYTES} bytes.`);
  await assertRealPathInside(manifestPath, packageRoot, MANIFEST_NAME);

  const manifestBytes = await fs.readFile(manifestPath);
  assert(!(manifestBytes.length >= 3 && manifestBytes[0] === 0xef &&
    manifestBytes[1] === 0xbb && manifestBytes[2] === 0xbf),
    `${MANIFEST_NAME} must be UTF-8 without a BOM.`);
  let parsed;
  try {
    parsed = JSON.parse(utf8.decode(manifestBytes));
  } catch (error) {
    throw new Error(`${MANIFEST_NAME} is not strict UTF-8 JSON: ${error?.message ?? String(error)}`);
  }
  const manifest = normalizePetManifest(parsed);

  const spritesheetPath = path.resolve(packageRoot, manifest.spritesheetPath);
  assert(isPathInside(spritesheetPath, packageRoot), "spritesheetPath escaped the package directory.");
  const spritesheetEntry = await assertRegularFile(spritesheetPath, SPRITESHEET_NAME);
  assert(spritesheetEntry.size > 0 && spritesheetEntry.size <= MAX_SPRITESHEET_BYTES,
    `${SPRITESHEET_NAME} must be between 1 byte and ${MAX_SPRITESHEET_BYTES} bytes.`);
  await assertRealPathInside(spritesheetPath, packageRoot, SPRITESHEET_NAME);

  const spritesheetBytes = await fs.readFile(spritesheetPath);
  const metadata = readImageMetadata(spritesheetBytes, ".webp");
  assert(metadata, `${SPRITESHEET_NAME} is not a valid WebP image.`);
  assert(metadata.width === EXPECTED_WIDTH && metadata.height === EXPECTED_HEIGHT,
    `${SPRITESHEET_NAME} must be exactly ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}; got ${metadata.width}x${metadata.height}.`);
  const webp = inspectWebp(spritesheetBytes);
  assert(webp.imagePayload, `${SPRITESHEET_NAME} must contain a VP8 or VP8L image payload.`);
  assert(webp.alpha, `${SPRITESHEET_NAME} must declare an alpha channel for a transparent pet window.`);

  return {
    ...manifest,
    atlas: {
      width: metadata.width,
      height: metadata.height,
      columns: 8,
      rows: 11,
      bytes: spritesheetEntry.size,
      alpha: true,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, packagePath] = process.argv.slice(2);
  if (mode !== "--check" || !packagePath) {
    console.error("Usage: pet-package.mjs --check <pet-package-directory>");
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(await validatePetPackage(packagePath)));
    } catch (error) {
      console.error(error?.message ?? String(error));
      process.exitCode = 2;
    }
  }
}
