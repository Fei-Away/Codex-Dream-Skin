import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";

export const LIMITS = Object.freeze({
  jsonBytes: 64 * 1024,
  sourceImageBytes: 50 * 1024 * 1024,
  preparedImageBytes: 16 * 1024 * 1024,
  multipartBytes: 51 * 1024 * 1024,
  jobLogLines: 120,
});

export const THEME_ID_PATTERN = /^img-[0-9]{14}-[a-f0-9]{8}$/;

const THEME_FIELDS = new Set([
  "name",
  "tagline",
  "quote",
  "accent",
  "secondary",
  "highlight",
  "apply",
  "allowRestart",
]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const DEFAULTS = Object.freeze({
  name: "我的 Codex Dream Skin",
  tagline: "把喜欢的画面变成可交互的 Codex 工作台。",
  quote: "MAKE SOMETHING WONDERFUL",
  accent: "#7cff46",
  secondary: "#36d7e8",
  highlight: "#642a8c",
  apply: false,
  allowRestart: false,
});

export class WebStudioError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "WebStudioError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function boundedText(value, name, fallback, maximum) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") {
    throw new WebStudioError("validation_error", `${name} must be text.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return [...trimmed].slice(0, maximum).join("");
}

function color(value, name, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    throw new WebStudioError("validation_error", `${name} must be a six-digit hex color.`);
  }
  return value.toLowerCase();
}

function booleanValue(value, name, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new WebStudioError("validation_error", `${name} must be a boolean.`);
  }
  return value;
}

export function validateThemeFields(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new WebStudioError("validation_error", "Theme fields must be an object.");
  }
  for (const field of Object.keys(input)) {
    if (!THEME_FIELDS.has(field)) {
      throw new WebStudioError("validation_error", `Unknown field: ${field}.`);
    }
  }
  return {
    name: boundedText(input.name, "name", DEFAULTS.name, 80),
    tagline: boundedText(input.tagline, "tagline", DEFAULTS.tagline, 160),
    quote: boundedText(input.quote, "quote", DEFAULTS.quote, 80),
    accent: color(input.accent, "accent", DEFAULTS.accent),
    secondary: color(input.secondary, "secondary", DEFAULTS.secondary),
    highlight: color(input.highlight, "highlight", DEFAULTS.highlight),
    apply: booleanValue(input.apply, "apply", DEFAULTS.apply),
    allowRestart: booleanValue(input.allowRestart, "allowRestart", DEFAULTS.allowRestart),
  };
}

export function validateThemeId(value) {
  if (typeof value !== "string" || !THEME_ID_PATTERN.test(value)) {
    throw new WebStudioError("validation_error", "Invalid theme id.");
  }
  return value;
}

export function safeChild(root, id) {
  const valid = validateThemeId(id);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, valid);
  if (path.dirname(resolved) !== resolvedRoot) {
    throw new WebStudioError("validation_error", "Theme path escaped its managed root.");
  }
  return resolved;
}

function startsWith(bytes, signature) {
  return bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature);
}

export function sniffImage(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value ?? []);
  if (startsWith(bytes, Buffer.from("ffd8ff", "hex"))) return "jpeg";
  if (startsWith(bytes, Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (startsWith(bytes, Buffer.from("49492a00", "hex")) ||
      startsWith(bytes, Buffer.from("4d4d002a", "hex"))) return "tiff";
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "heic";
  }
  throw new WebStudioError("validation_error", "Unsupported image content.");
}

export function tokenMatches(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function assertRequestAuthority({ host, origin, expectedHost, mutating }) {
  if (host !== expectedHost) {
    throw new WebStudioError("forbidden", "Invalid request host.", 403);
  }
  if (mutating && origin !== `http://${expectedHost}`) {
    throw new WebStudioError("forbidden", "Invalid request origin.", 403);
  }
}
