import fs from "node:fs/promises";
import path from "node:path";

import {
  LIMITS,
  WebStudioError,
  safeChild,
  sniffImage,
  validateThemeFields,
  validateThemeId,
} from "./web-studio-shared.mjs";

const TYPE_EXTENSION = Object.freeze({
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  tiff: "tiff",
  heic: "heic",
});

function demoSummary(active) {
  return {
    id: "demo",
    name: "内置抽象演示",
    tagline: "Codex Dream Skin Studio",
    quote: "MAKE SOMETHING WONDERFUL",
    colors: {
      accent: "#7cff46",
      secondary: "#36d7e8",
      highlight: "#642a8c",
    },
    imageUrl: null,
    active,
    bundled: true,
    createdAt: null,
  };
}

function timestampId(date, suffix) {
  const digits = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return `img-${digits}-${suffix}`;
}

async function atomicJsonWrite(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, file);
    await fs.chmod(file, 0o600);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function optionalLstat(file) {
  try {
    return await fs.lstat(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function validateThemeJson(value, expectedId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WebStudioError("validation_error", "Theme metadata is invalid.");
  }
  if (expectedId && value.id !== expectedId) {
    throw new WebStudioError("validation_error", "Theme metadata id does not match its directory.");
  }
  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new WebStudioError("validation_error", "Theme metadata name is invalid.");
  }
  if (typeof value.image !== "string" || path.basename(value.image) !== value.image ||
      !/\.(?:png|jpe?g|webp)$/i.test(value.image)) {
    throw new WebStudioError("validation_error", "Theme metadata image is invalid.");
  }
  return value;
}

export function createThemeStore({
  stateRoot,
  projectRoot,
  nodePath,
  runFile,
  now = () => new Date(),
  randomHex,
}) {
  if (typeof runFile !== "function") throw new TypeError("runFile is required");
  if (typeof randomHex !== "function") throw new TypeError("randomHex is required");

  const themesRoot = path.join(stateRoot, "themes");
  const activeRoot = path.join(stateRoot, "theme");

  async function ensureRoots() {
    await fs.mkdir(themesRoot, { recursive: true, mode: 0o700 });
    await fs.chmod(themesRoot, 0o700);
  }

  async function readThemeDirectory(directory, expectedId) {
    const directoryStat = await optionalLstat(directory);
    if (!directoryStat) {
      throw new WebStudioError("not_found", "Theme was not found.", 404);
    }
    if (directoryStat.isSymbolicLink()) {
      throw new WebStudioError("validation_error", "Theme directory must not be a symbolic link.");
    }
    if (!directoryStat.isDirectory()) {
      throw new WebStudioError("validation_error", "Theme path is not a directory.");
    }
    const themePath = path.join(directory, "theme.json");
    const themeStat = await fs.lstat(themePath);
    if (themeStat.isSymbolicLink() || !themeStat.isFile()) {
      throw new WebStudioError("validation_error", "Theme metadata must be a regular file.");
    }
    let value;
    try {
      value = JSON.parse(await fs.readFile(themePath, "utf8"));
    } catch {
      throw new WebStudioError("validation_error", "Theme metadata is not valid JSON.");
    }
    const theme = validateThemeJson(value, expectedId);
    const imagePath = path.join(directory, theme.image);
    const imageStat = await fs.lstat(imagePath);
    if (imageStat.isSymbolicLink() || !imageStat.isFile() || imageStat.size < 1 ||
        imageStat.size > LIMITS.preparedImageBytes) {
      throw new WebStudioError("validation_error", "Theme image must be a valid regular file.");
    }
    return { theme, imagePath };
  }

  function summary(theme, active) {
    return {
      id: theme.id,
      name: theme.name,
      tagline: typeof theme.tagline === "string" ? theme.tagline : "",
      quote: typeof theme.quote === "string" ? theme.quote : "",
      colors: {
        accent: theme.colors?.accent ?? "#7cff46",
        secondary: theme.colors?.secondary ?? "#36d7e8",
        highlight: theme.colors?.highlight ?? "#642a8c",
      },
      imageUrl: `/api/themes/${theme.id}/image`,
      active,
      bundled: false,
      createdAt: typeof theme.createdAt === "string" ? theme.createdAt : null,
    };
  }

  async function activeTheme() {
    const stat = await optionalLstat(activeRoot);
    if (!stat) return demoSummary(true);
    const { theme } = await readThemeDirectory(activeRoot);
    return summary(theme, true);
  }

  async function listThemes() {
    await ensureRoots();
    const active = await activeTheme();
    const values = [];
    for (const entry of await fs.readdir(themesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      try {
        const id = validateThemeId(entry.name);
        const { theme } = await readThemeDirectory(safeChild(themesRoot, id), id);
        values.push(summary(theme, active.id === id));
      } catch {
        // Ignore incomplete or unrelated directories in the user-managed state root.
      }
    }
    values.sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")));
    return [demoSummary(active.id === "demo"), ...values];
  }

  async function saveTheme({ bytes, fields }) {
    if (!Buffer.isBuffer(bytes)) {
      throw new WebStudioError("validation_error", "Theme image must be uploaded as bytes.");
    }
    if (bytes.length < 1) throw new WebStudioError("validation_error", "Theme image is empty.");
    if (bytes.length > LIMITS.sourceImageBytes) {
      throw new WebStudioError("validation_error", "Selected image is larger than 50 MB.");
    }
    const type = sniffImage(bytes);
    const normalized = validateThemeFields(fields);
    await ensureRoots();
    const createdAt = now();
    const id = timestampId(createdAt, randomHex(4));
    validateThemeId(id);
    const finalDirectory = safeChild(themesRoot, id);
    const incoming = path.join(themesRoot, `.incoming-${id}-${process.pid}`);
    const sourcePath = path.join(incoming, `source.${TYPE_EXTENSION[type]}`);
    const preparedPath = path.join(incoming, "background.jpg");
    await fs.rm(incoming, { recursive: true, force: true });
    await fs.mkdir(incoming, { recursive: false, mode: 0o700 });
    try {
      await fs.writeFile(sourcePath, bytes, { mode: 0o600 });
      await runFile("/usr/bin/sips", [
        "-s", "format", "jpeg",
        "-s", "formatOptions", "84",
        "-Z", "3200",
        sourcePath,
        "--out", preparedPath,
      ]);
      const preparedStat = await fs.lstat(preparedPath);
      if (!preparedStat.isFile() || preparedStat.isSymbolicLink() || preparedStat.size < 1) {
        throw new WebStudioError("operation_failed", "The converted theme image is empty.", 500);
      }
      if (preparedStat.size > LIMITS.preparedImageBytes) {
        throw new WebStudioError("validation_error", "The prepared image is larger than 16 MB.");
      }
      await fs.chmod(preparedPath, 0o600);
      await runFile(nodePath, [
        path.join(projectRoot, "scripts/write-theme.mjs"),
        "custom", "--output-dir", incoming,
        "--image", "background.jpg",
        "--name", normalized.name,
        "--tagline", normalized.tagline,
        "--quote", normalized.quote,
        "--accent", normalized.accent,
        "--secondary", normalized.secondary,
        "--highlight", normalized.highlight,
      ]);
      const themePath = path.join(incoming, "theme.json");
      const theme = validateThemeJson(JSON.parse(await fs.readFile(themePath, "utf8")));
      theme.id = id;
      theme.createdAt = createdAt.toISOString();
      await atomicJsonWrite(themePath, theme);
      await fs.rm(sourcePath, { force: true });
      if (await optionalLstat(finalDirectory)) {
        throw new WebStudioError("conflict", "A theme with this id already exists.", 409);
      }
      await fs.rename(incoming, finalDirectory);
      return summary(theme, false);
    } finally {
      await fs.rm(incoming, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function replaceActiveFrom(directory, id) {
    const { theme, imagePath } = await readThemeDirectory(directory, id);
    const next = `${activeRoot}.next.${process.pid}`;
    const previous = `${activeRoot}.previous.${process.pid}`;
    await fs.rm(next, { recursive: true, force: true });
    await fs.rm(previous, { recursive: true, force: true });
    await fs.mkdir(next, { recursive: false, mode: 0o700 });
    await fs.copyFile(path.join(directory, "theme.json"), path.join(next, "theme.json"));
    await fs.copyFile(imagePath, path.join(next, theme.image));
    await fs.chmod(path.join(next, "theme.json"), 0o600);
    await fs.chmod(path.join(next, theme.image), 0o600);

    const activeStat = await optionalLstat(activeRoot);
    if (activeStat?.isSymbolicLink()) {
      await fs.rm(next, { recursive: true, force: true });
      throw new WebStudioError("validation_error", "Active theme directory must not be a symbolic link.");
    }
    let movedPrevious = false;
    try {
      if (activeStat) {
        await fs.rename(activeRoot, previous);
        movedPrevious = true;
      }
      await fs.rename(next, activeRoot);
      await fs.rm(previous, { recursive: true, force: true });
    } catch (error) {
      await fs.rm(next, { recursive: true, force: true }).catch(() => {});
      if (movedPrevious && !(await optionalLstat(activeRoot))) {
        await fs.rename(previous, activeRoot).catch(() => {});
      }
      throw error;
    }
    return summary(theme, true);
  }

  async function activateTheme(id) {
    await ensureRoots();
    const valid = validateThemeId(id);
    return replaceActiveFrom(safeChild(themesRoot, valid), valid);
  }

  async function deleteTheme(id) {
    await ensureRoots();
    const valid = validateThemeId(id);
    if ((await activeTheme()).id === valid) {
      throw new WebStudioError("conflict", "The active theme cannot be deleted.", 409);
    }
    const directory = safeChild(themesRoot, valid);
    const stat = await optionalLstat(directory);
    if (!stat) throw new WebStudioError("not_found", "Theme was not found.", 404);
    if (stat.isSymbolicLink()) {
      throw new WebStudioError("validation_error", "Theme directory must not be a symbolic link.");
    }
    if (!stat.isDirectory()) throw new WebStudioError("validation_error", "Theme path is invalid.");
    await fs.rm(directory, { recursive: true, force: false });
  }

  async function applyDemo() {
    const stat = await optionalLstat(activeRoot);
    if (!stat) return demoSummary(true);
    if (stat.isSymbolicLink()) {
      throw new WebStudioError("validation_error", "Active theme directory must not be a symbolic link.");
    }
    const previous = `${activeRoot}.previous.${process.pid}`;
    await fs.rm(previous, { recursive: true, force: true });
    await fs.rename(activeRoot, previous);
    try {
      await fs.rm(previous, { recursive: true, force: false });
    } catch (error) {
      if (!(await optionalLstat(activeRoot))) await fs.rename(previous, activeRoot).catch(() => {});
      throw error;
    }
    return demoSummary(true);
  }

  async function resolveThemeImage(id) {
    await ensureRoots();
    const valid = validateThemeId(id);
    const { imagePath } = await readThemeDirectory(safeChild(themesRoot, valid), valid);
    return { path: imagePath, contentType: "image/jpeg" };
  }

  return {
    listThemes,
    saveTheme,
    activateTheme,
    deleteTheme,
    applyDemo,
    activeTheme,
    resolveThemeImage,
  };
}
