import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeTheme, themeDefaults } from "../theme-core/theme-schema.mjs";
import { officialThemeDefinitions, officialThemeIds } from "./official-themes.mjs";
import { readThemePackage } from "./theme-store.mjs";

function slugify(value) {
  const ascii = String(value || "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
  const slug = ascii.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28);
  return slug || `theme-${Date.now().toString(36)}`;
}

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}

function decodeImage(data) {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=\s]+)$/i.exec(data || "");
  if (!match) throw new Error("图片格式不受支持，请使用 PNG、JPEG 或 WebP");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 16 * 1024 * 1024) throw new Error("处理后的主题图片必须小于 16 MB");
  return { buffer, extension: match[1] === "jpg" ? "jpeg" : match[1] };
}

export class ThemeService {
  constructor({ adapter, sharedRoot }) {
    this.adapter = adapter;
    this.sharedRoot = sharedRoot;
    this.officialRoot = path.join(sharedRoot, "themes");
    this.paths = adapter.paths;
    this.tokenPath = path.join(this.paths.stateRoot, ".studio-token");
  }

  async init() {
    await Promise.all([
      fs.mkdir(this.paths.themeRoot, { recursive: true, mode: 0o700 }),
      fs.mkdir(this.paths.imagesRoot, { recursive: true, mode: 0o700 }),
    ]);
    try { await fs.access(this.tokenPath); }
    catch { await fs.writeFile(this.tokenPath, `${crypto.randomBytes(32).toString("hex")}\n`, { mode: 0o600 }); }
    this.token = (await fs.readFile(this.tokenPath, "utf8")).trim();
  }

  async readCurrent() {
    try { return await readThemePackage(this.paths.currentThemeRoot, "current"); }
    catch { return null; }
  }

  async listCustom() {
    let entries = [];
    try { entries = await fs.readdir(this.paths.themeRoot, { withFileTypes: true }); } catch { return []; }
    const themes = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9_-]{0,48}$/i.test(entry.name)) continue;
      try { themes.push(await readThemePackage(path.join(this.paths.themeRoot, entry.name), entry.name)); } catch {}
    }
    return themes;
  }

  async catalog() {
    const [current, custom] = await Promise.all([this.readCurrent(), this.listCustom()]);
    const official = await Promise.all(officialThemeDefinitions.map(async (definition) => {
      try {
        const theme = await readThemePackage(path.join(this.officialRoot, definition.id), definition.id);
        return { ...theme, ...definition, available: true, active: current?.themeId === definition.id };
      } catch (error) {
        return { ...definition, available: false, active: false, unavailableReason: error.message };
      }
    }));
    const activeOfficial = official.some((theme) => theme.active);
    const themes = custom.map((theme) => ({
      ...theme,
      id: path.basename(path.dirname(theme.imagePath)),
      source: "library",
      imageUrl: `/api/themes/${encodeURIComponent(path.basename(path.dirname(theme.imagePath)))}/image`,
      active: current?.themeId === theme.themeId,
    }));
    if (current && !activeOfficial && !themes.some((theme) => theme.active)) {
      themes.unshift({ ...current, id: "current", source: "current", imageUrl: "/api/themes/current/image", active: true });
    }
    return { official, themes };
  }

  async stageOfficial(id) {
    if (!officialThemeIds.has(id)) return id;
    const source = path.join(this.officialRoot, id);
    await readThemePackage(source, id);
    const stagedId = `.builtin-${id}`;
    const target = path.join(this.paths.themeRoot, stagedId);
    await fs.rm(target, { recursive: true, force: true });
    await fs.cp(source, target, { recursive: true });
    return stagedId;
  }

  async apply(id) {
    const stagedId = await this.stageOfficial(id);
    const result = await this.adapter.runAction("apply-theme", { id: stagedId });
    return { ok: true, ...result, status: await this.adapter.status() };
  }

  async sourcePackage(id) {
    if (officialThemeIds.has(id)) return readThemePackage(path.join(this.officialRoot, id), id);
    if (id === "current") return readThemePackage(this.paths.currentThemeRoot, "current");
    if (!/^[a-z0-9][a-z0-9_-]{0,48}$/i.test(id)) throw new Error("主题 ID 无效");
    return readThemePackage(path.join(this.paths.themeRoot, id), id);
  }

  async imagePath(id) {
    return (await this.sourcePackage(id)).imagePath;
  }

  async saveTheme(input, options = {}) {
    const existing = options.existing || null;
    const id = options.id || `${slugify(input.name)}-${Date.now().toString(36)}`;
    const directory = path.join(this.paths.themeRoot, id);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    let image = existing?.sourceImage || existing?.image || "";
    if (input.imageData) {
      const decoded = decodeImage(input.imageData);
      image = `background.${decoded.extension}`;
      await fs.writeFile(path.join(directory, image), decoded.buffer, { mode: 0o600 });
    } else if (options.copyImageFrom) {
      image = path.basename(options.copyImageFrom);
      await fs.copyFile(options.copyImageFrom, path.join(directory, image));
    }
    if (!image) throw new Error("请选择一张纯背景图片");
    const existingAppearance = existing?.appearance || {};
    const inputAppearance = input.appearance || {};
    const merged = {
      ...existing,
      ...input,
      id,
      image,
      palettes: {
        dark: { ...(existing?.palettes?.dark || {}), ...(input.colors || {}), ...(input.palettes?.dark || {}) },
        light: { ...(existing?.palettes?.light || {}), ...(input.palettes?.light || {}) },
      },
      appearance: {
        ...existingAppearance,
        ...inputAppearance,
        background: { ...(existingAppearance.background || {}), ...(inputAppearance.background || {}) },
        surface: { ...(existingAppearance.surface || {}), ...(inputAppearance.surface || {}) },
        decoration: { ...(existingAppearance.decoration || {}), ...(inputAppearance.decoration || {}) },
      },
    };
    const theme = normalizeTheme(merged, { id });
    await writeJsonAtomic(path.join(directory, "theme.json"), theme);
    return { ...theme, imageUrl: `/api/themes/${encodeURIComponent(id)}/image`, source: "library", active: false };
  }

  async create(input) {
    return this.saveTheme(input);
  }

  async update(id, input) {
    const existing = await this.sourcePackage(id);
    return this.saveTheme(input, { id, existing });
  }

  async duplicate(id, input) {
    const source = await this.sourcePackage(id);
    return this.saveTheme({ ...source, ...input, name: input.name || `${source.name} 参考主题` }, { copyImageFrom: input.imageData ? null : source.imagePath });
  }

  async remove(id) {
    if (officialThemeIds.has(id) || id === "current" || !/^[a-z0-9][a-z0-9_-]{0,48}$/i.test(id)) throw new Error("不能删除这个主题");
    await fs.rm(path.join(this.paths.themeRoot, id), { recursive: true, force: false });
  }

  async details(port) {
    const [status, themes, images, logs] = await Promise.all([
      this.adapter.status(), this.listCustom(), this.listImages(), this.adapter.logs(),
    ]);
    return {
      engine: { name: "Codex Dream Skin Studio", version: this.adapter.version, platform: this.adapter.platform, loopback: `127.0.0.1:${port}` },
      paths: this.paths,
      status,
      storage: { savedThemeCount: themes.length, inboxImageCount: images.length },
      logs,
    };
  }

  async listImages() {
    let entries = [];
    try { entries = await fs.readdir(this.paths.imagesRoot, { withFileTypes: true }); } catch { return []; }
    const images = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/^[\w .()@+-]+\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
      const stat = await fs.stat(path.join(this.paths.imagesRoot, entry.name));
      images.push({ name: entry.name, bytes: stat.size, modifiedAt: stat.mtime.toISOString(), imageUrl: `/api/library-images/${encodeURIComponent(entry.name)}/image` });
    }
    return images.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  }

  async importImage(name) {
    if (path.basename(name) !== name || !/^[\w .()@+-]+\.(png|jpe?g|webp)$/i.test(name)) throw new Error("图片名称无效");
    const file = path.join(this.paths.imagesRoot, name);
    const extension = path.extname(name).slice(1).replace("jpg", "jpeg");
    const imageData = `data:image/${extension};base64,${(await fs.readFile(file)).toString("base64")}`;
    const theme = await this.create({ ...themeDefaults, name: path.basename(name, path.extname(name)), imageData });
    await this.apply(theme.id);
    return theme;
  }
}
