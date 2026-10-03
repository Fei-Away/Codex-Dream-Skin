import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export const DEFAULT_ANIMATION_SETTINGS = Object.freeze({
  schemaVersion: 1, enabled: false, preset: "aurora", power: "auto",
});
const MAX_BYTES = 4096;

export function validateAnimationSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 4
    || Object.keys(value).some((key) => !Object.hasOwn(DEFAULT_ANIMATION_SETTINGS, key))
    || value.schemaVersion !== 1 || typeof value.enabled !== "boolean"
    || !["aurora", "starfield"].includes(value.preset)
    || !["auto", "low"].includes(value.power)) {
    throw new Error("Invalid animated background settings");
  }
  return { schemaVersion: 1, enabled: value.enabled, preset: value.preset, power: value.power };
}

// Preferences are local data, outside the theme ZIP contract. Never accept CSS,
// URLs, scripts, arbitrary preset names or content from a downloaded theme here.
export async function readAnimationSettings(filename) {
  if (!filename) return { ...DEFAULT_ANIMATION_SETTINGS };
  let handle;
  try {
    handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (error.code === "ENOENT") return { ...DEFAULT_ANIMATION_SETTINGS };
    throw new Error("Animated background settings must be a regular local file");
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > MAX_BYTES) {
      throw new Error("Animated background settings must be a non-empty file up to 4096 bytes");
    }
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat();
    if (bytesRead !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error("Animated background settings changed while reading");
    }
    return validateAnimationSettings(JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")));
  } finally {
    await handle.close();
  }
}

export async function ensureAnimationStateRoot(stateRoot) {
  const resolved = path.resolve(stateRoot);
  let ancestor = resolved;
  while (true) {
    const existing = await fs.lstat(ancestor).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing) {
      if (!existing.isDirectory() || existing.isSymbolicLink() || await fs.realpath(ancestor) !== ancestor) {
        throw new Error("Animated background state must not follow linked redirects");
      }
      break;
    }
    ancestor = path.dirname(ancestor);
  }
  await fs.mkdir(resolved, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(resolved) !== resolved
    || (typeof process.getuid === "function" && stat.uid !== process.getuid())
    || (stat.mode & 0o022) !== 0) {
    throw new Error("Animated background state must be an owned directory without writable or linked redirects");
  }
  return resolved;
}

// The Linux shell controller holds the existing cross-process theme-switch
// lock across read/modify/write. Publish a private file with rename so the
// injector observes either the previous complete settings or the next ones.
export async function saveAnimationSettings(stateRoot, settings) {
  const normalized = validateAnimationSettings(settings);
  const directory = await ensureAnimationStateRoot(stateRoot);
  const filename = path.join(directory, "animation.json");
  const existing = await fs.lstat(filename).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) {
    throw new Error("Refusing to replace linked or non-regular animated background settings");
  }
  const temporary = path.join(directory, `.animation-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(normalized, null, 2)}\n`);
    await handle.sync();
    await handle.close();
    handle = null;
    const current = await fs.lstat(filename).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (Boolean(current) !== Boolean(existing)
      || (current && (current.dev !== existing.dev || current.ino !== existing.ino))) {
      throw new Error("Animated background settings changed before publication");
    }
    await fs.rename(temporary, filename);
  } finally {
    await handle?.close();
    await fs.rm(temporary, { force: true });
  }
  return normalized;
}

async function main(argv) {
  const [rootFlag, stateRoot, command = "status", ...args] = argv;
  if (rootFlag !== "--state-root" || !stateRoot) throw new Error("Expected --state-root <directory>");
  if (command === "check-root" && args.length === 0) {
    await ensureAnimationStateRoot(stateRoot);
    return;
  }
  const commands = ["status", "on", "off", "preset", "power", "reset"];
  if (!commands.includes(command) || args.length !== (["preset", "power"].includes(command) ? 1 : 0)) {
    throw new Error("Usage: dreamskin animation status|on|off|preset aurora|starfield|power auto|low|reset");
  }
  let settings = command === "reset" ? { ...DEFAULT_ANIMATION_SETTINGS }
    : await readAnimationSettings(path.join(path.resolve(stateRoot), "animation.json"));
  if (command === "on") settings.enabled = true;
  if (command === "off") settings.enabled = false;
  if (command === "preset") { settings.preset = args[0]; settings.enabled = true; }
  if (command === "power") settings.power = args[0];
  if (command !== "status") settings = await saveAnimationSettings(stateRoot, settings);
  console.log(`动画设置：${settings.enabled ? "开启" : "关闭"}；预设：${settings.preset === "aurora" ? "极光" : "星空"}；节能：${settings.power === "low" ? "静止" : "自动"}。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
