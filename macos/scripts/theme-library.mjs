import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const [command, ...args] = process.argv.slice(2);

function valueFor(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
  return value;
}

const presetsDir = path.resolve(valueFor("presets-dir", path.join(root, "presets")));
const themesDirValue = valueFor("themes-dir", "");
const themesDir = themesDirValue ? path.resolve(themesDirValue) : "";
const format = valueFor("format", "json");
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const imagePattern = /\.(?:png|jpe?g|webp)$/i;
const colorPattern = /^(?:#[0-9a-f]{6}|rgba?\([0-9., %]+\))$/i;

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function text(value, label, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${label} must be non-empty text no longer than ${max} characters`);
  }
  return value.trim();
}

async function validateLibrary() {
  const manifestPath = path.join(presetsDir, "index.json");
  const manifest = await readJson(manifestPath);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.collections) || !manifest.collections.length) {
    throw new Error(`${manifestPath} has an unsupported schema or empty collections`);
  }

  const ordered = [];
  const ids = new Set();
  for (const collection of manifest.collections) {
    const collectionId = text(collection.id, "collection id", 80);
    if (!idPattern.test(collectionId)) throw new Error(`Invalid collection id: ${collectionId}`);
    const collectionName = text(collection.name, `collection ${collectionId} name`, 80);
    if (!Array.isArray(collection.themes) || !collection.themes.length) {
      throw new Error(`Collection ${collectionId} has no themes`);
    }
    for (const rawId of collection.themes) {
      const id = text(rawId, `theme id in ${collectionId}`, 80);
      if (!idPattern.test(id)) throw new Error(`Invalid theme id: ${id}`);
      if (ids.has(id)) throw new Error(`Duplicate theme id: ${id}`);
      ids.add(id);
      ordered.push({ id, collectionId, collectionName });
    }
  }

  const entries = await fs.readdir(presetsDir, { withFileTypes: true });
  const directoryIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const expectedIds = [...ids].sort();
  if (JSON.stringify(directoryIds) !== JSON.stringify(expectedIds)) {
    throw new Error("Preset directories must match the ids declared in presets/index.json exactly");
  }

  const themes = [];
  for (const entry of ordered) {
    const directory = path.join(presetsDir, entry.id);
    const files = await fs.readdir(directory, { withFileTypes: true });
    if (files.some((file) => !file.isFile() || file.isSymbolicLink())) {
      throw new Error(`Preset ${entry.id} may contain regular files only`);
    }
    const configPath = path.join(directory, "theme.json");
    const theme = await readJson(configPath);
    if (theme.schemaVersion !== 1 || theme.id !== entry.id) {
      throw new Error(`${configPath} schema or id does not match its directory`);
    }
    const name = text(theme.name, `${entry.id} name`, 80);
    const image = text(theme.image, `${entry.id} image`, 120);
    if (path.basename(image) !== image || !imagePattern.test(image)) {
      throw new Error(`${entry.id} has an unsafe or unsupported image filename`);
    }
    const imagePath = path.join(directory, image);
    const imageStat = await fs.stat(imagePath);
    if (!imageStat.isFile() || imageStat.size < 1 || imageStat.size > 16 * 1024 * 1024) {
      throw new Error(`${entry.id} image must be non-empty and no larger than 16 MB`);
    }
    const allowedFiles = new Set(["theme.json", image]);
    if (files.some((file) => !allowedFiles.has(file.name))) {
      throw new Error(`${entry.id} contains files not referenced by its theme`);
    }
    const requiredColors = [
      "background", "panel", "panelAlt", "accent", "accentAlt",
      "secondary", "highlight", "text", "muted", "line",
    ];
    for (const colorName of requiredColors) {
      const value = theme.colors?.[colorName];
      if (typeof value !== "string" || !colorPattern.test(value.trim())) {
        throw new Error(`${entry.id} has an invalid ${colorName} color`);
      }
    }
    themes.push({ ...entry, name, image, directory, theme });
  }

  return { manifest, themes };
}

async function chmodTree(directory) {
  await fs.chmod(directory, 0o700);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await chmodTree(target);
    else await fs.chmod(target, 0o600);
  }
}

async function installLibrary(library) {
  if (!themesDir) throw new Error("install requires --themes-dir <directory>");
  await fs.mkdir(themesDir, { recursive: true, mode: 0o700 });
  await fs.chmod(themesDir, 0o700);

  for (const preset of library.themes) {
    const target = path.join(themesDir, preset.id);
    const temporary = path.join(themesDir, `.${preset.id}.installing-${process.pid}`);
    const previous = path.join(themesDir, `.${preset.id}.previous-${process.pid}`);
    await fs.rm(temporary, { recursive: true, force: true });
    await fs.rm(previous, { recursive: true, force: true });
    await fs.cp(preset.directory, temporary, { recursive: true, errorOnExist: true });
    await chmodTree(temporary);
    let movedPrevious = false;
    try {
      try {
        await fs.rename(target, previous);
        movedPrevious = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await fs.rename(temporary, target);
      await fs.rm(previous, { recursive: true, force: true });
    } catch (error) {
      await fs.rm(temporary, { recursive: true, force: true });
      if (movedPrevious) await fs.rename(previous, target).catch(() => {});
      throw error;
    }
  }
}

async function listThemes(library) {
  if (!themesDir) throw new Error("list requires --themes-dir <directory>");
  const bundledIds = new Set(library.themes.map((theme) => theme.id));
  const available = [];

  for (const preset of library.themes) {
    const configPath = path.join(themesDir, preset.id, "theme.json");
    try {
      const installed = await readJson(configPath);
      available.push({
        id: preset.id,
        name: typeof installed.name === "string" && installed.name.trim() ? installed.name.trim() : preset.name,
        collection: preset.collectionName,
        bundled: true,
      });
    } catch {}
  }

  let entries = [];
  try {
    entries = await fs.readdir(themesDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const custom = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || bundledIds.has(entry.name) || !idPattern.test(entry.name)) continue;
    try {
      const theme = await readJson(path.join(themesDir, entry.name, "theme.json"));
      custom.push({
        id: entry.name,
        name: typeof theme.name === "string" && theme.name.trim() ? theme.name.trim() : entry.name,
        collection: "我的主题",
        bundled: false,
      });
    } catch {}
  }
  custom.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
  return [...available, ...custom];
}

const library = await validateLibrary();

if (command === "validate") {
  process.stdout.write(`${JSON.stringify({
    pass: true,
    collectionCount: library.manifest.collections.length,
    themeCount: library.themes.length,
  })}\n`);
} else if (command === "install") {
  await installLibrary(library);
  process.stdout.write(`${JSON.stringify({ pass: true, installed: library.themes.length, themesDir })}\n`);
} else if (command === "list") {
  const themes = await listThemes(library);
  if (format === "tsv") {
    for (const theme of themes) {
      const fields = [theme.id, theme.name, theme.collection, theme.bundled ? "true" : "false"]
        .map((value) => String(value).replace(/[\t\r\n]/g, " "));
      process.stdout.write(`${fields.join("\t")}\n`);
    }
  } else if (format === "json") {
    process.stdout.write(`${JSON.stringify(themes)}\n`);
  } else {
    throw new Error(`Unsupported list format: ${format}`);
  }
} else {
  throw new Error("Usage: theme-library.mjs <validate|install|list> [options]");
}
