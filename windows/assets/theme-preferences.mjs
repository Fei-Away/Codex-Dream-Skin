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
const SURFACE_KEYS = new Set(["composer", "composerFocused", "sidebar", "message", "messageFocused"]);

/** Read validated local overrides for one theme; an absent field follows the theme. */
export async function readThemePreferences(themeId, {
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
    if (!Object.hasOwn(data.themes, themeId)) return {};
    const entry = data.themes[themeId];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("invalid preferences");
    }
    const validPercentage = (value) => typeof value === "number" && Number.isFinite(value)
      && value >= 0 && value <= 100;
    if (entry.transparency !== undefined && !validPercentage(entry.transparency)) {
      throw new Error("invalid preferences");
    }
    if (entry.transparencyEnabled !== undefined && typeof entry.transparencyEnabled !== "boolean") {
      throw new Error("invalid preferences");
    }
    if (entry.followTheme !== undefined && typeof entry.followTheme !== "boolean") {
      throw new Error("invalid preferences");
    }
    const surfaces = entry.surfaceTransparency;
    if (surfaces !== undefined && (!surfaces || typeof surfaces !== "object" || Array.isArray(surfaces)
      || Object.keys(surfaces).length === 0
      || Object.entries(surfaces).some(([key, value]) => !SURFACE_KEYS.has(key) || !validPercentage(value)))) {
      throw new Error("invalid preferences");
    }
    if (entry.transparency === undefined && surfaces === undefined
      && entry.transparencyEnabled === undefined && entry.followTheme === undefined) {
      throw new Error("invalid preferences");
    }
    warned.delete(preferencesPath);
    return {
      ...(entry.transparency === undefined ? {} : { transparency: entry.transparency }),
      ...(surfaces === undefined ? {} : { surfaceTransparency: surfaces }),
      ...(entry.transparencyEnabled === undefined ? {} : { transparencyEnabled: entry.transparencyEnabled }),
      ...(entry.followTheme === undefined ? {} : { followTheme: entry.followTheme }),
    };
  } catch (error) {
    if (error.code !== "ENOENT" && !warned.has(preferencesPath)) {
      warned.add(preferencesPath);
      warn("[dream-skin] Local theme preferences unavailable or invalid; using theme transparency defaults.");
    }
    return {};
  } finally {
    await handle?.close();
  }
}

export async function readThemeTransparency(themeId, options) {
  return (await readThemePreferences(themeId, options)).transparency;
}
