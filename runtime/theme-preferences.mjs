import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function themePreferencesPath(platform = process.platform, env = process.env, home = os.homedir()) {
  const stateRoot = platform === "win32"
    ? path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "CodexDreamSkin")
    : path.join(home, "Library", "Application Support", "CodexDreamSkinStudio");
  return path.join(stateRoot, "theme-preferences.json");
}

const MAX_BYTES = 256 * 1024;
const warned = new Set();
export async function readThemeTransparency(themeId, {
  preferencesPath = themePreferencesPath(),
  warn = (message) => console.error(message),
} = {}) {
  let handle;
  try {
    handle = await fs.open(preferencesPath, "r");
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("invalid preferences");
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > MAX_BYTES) throw new Error("invalid preferences");
    const data = JSON.parse(bytes.subarray(0, length).toString("utf8"));
    if (data?.schemaVersion !== 1 || !data.themes || typeof data.themes !== "object" || Array.isArray(data.themes)) {
      throw new Error("invalid preferences");
    }
    if (!Object.hasOwn(data.themes, themeId)) return undefined;
    const value = data.themes[themeId]?.transparency;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error("invalid preferences");
    }
    warned.delete(preferencesPath);
    return value;
  } catch (error) {
    if (error.code !== "ENOENT" && !warned.has(preferencesPath)) {
      warned.add(preferencesPath);
      warn("[dream-skin] Local theme preferences unavailable or invalid; using theme transparency defaults.");
    }
    return undefined;
  } finally {
    await handle?.close();
  }
}
