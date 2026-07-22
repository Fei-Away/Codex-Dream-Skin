import fs from "node:fs/promises";
import path from "node:path";
import { normalizeTheme } from "../theme-core/theme-schema.mjs";

export async function readThemePackage(directory, id) {
  const configPath = path.join(directory, "theme.json");
  let raw;
  try {
    raw = JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`主题配置不存在：${id}`);
    throw new Error(`主题配置无法读取：${id}`);
  }
  const theme = normalizeTheme(raw, { id: raw.id || id });
  const imagePath = path.join(directory, theme.image);
  let stat;
  try {
    stat = await fs.stat(imagePath);
  } catch {
    throw new Error(`主题图片不存在：${id}/${theme.image}`);
  }
  if (!stat.isFile()) throw new Error(`主题图片不是文件：${id}/${theme.image}`);
  return {
    ...theme,
    id,
    themeId: theme.id,
    sourceImage: theme.image,
    imagePath,
    imageBytes: stat.size,
  };
}
