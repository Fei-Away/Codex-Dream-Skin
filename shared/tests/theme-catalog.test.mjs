import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { officialThemeDefinitions, officialThemeIds } from "../studio/official-themes.mjs";
import { readThemePackage } from "../studio/theme-store.mjs";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(testsRoot, "..");
const themesRoot = path.join(sharedRoot, "themes");

assert.equal(officialThemeDefinitions.length, 24);
assert.equal(officialThemeIds.size, 24);
assert.deepEqual(officialThemeDefinitions.slice(8, 16).map((theme) => theme.category), Array(8).fill("role"));
assert.deepEqual(officialThemeDefinitions.slice(16).map((theme) => theme.category), Array(8).fill("original-cn-fantasy"));
assert.ok(officialThemeDefinitions.every((theme) => theme.source === "official" && theme.builtIn));
assert.ok(officialThemeDefinitions.every((theme) => !theme.previewOnly));

const first = await readThemePackage(path.join(themesRoot, "skin-01"), "skin-01");
assert.equal(first.schemaVersion, 3);
assert.equal(first.id, "skin-01");
assert.equal(first.themeId, "skin-01");
assert.equal(first.sourceImage, "background.png");
assert.ok(first.imageBytes > 0);
assert.equal((await fs.stat(first.imagePath)).isFile(), true);

const currentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-current-theme-"));
await fs.cp(path.join(themesRoot, "skin-02"), currentRoot, { recursive: true });
const current = await readThemePackage(currentRoot, "current");
assert.equal(current.id, "current");
assert.equal(current.themeId, "skin-02");
await fs.rm(currentRoot, { recursive: true, force: true });

for (const definition of officialThemeDefinitions) {
  const theme = await readThemePackage(path.join(themesRoot, definition.id), definition.id);
  assert.equal(theme.schemaVersion, 3, `${definition.id} 不是 Theme v3`);
  assert.ok(theme.imageBytes > 0, `${definition.id} 背景为空`);
  assert.ok(theme.palettes.dark && theme.palettes.light, `${definition.id} 缺少双调色板`);
  assert.equal(theme.scene.kind, "official-scene", `${definition.id} 未标识为官方场景`);
  assert.equal(theme.scene.actions.length, 4, `${definition.id} 缺少四张行动卡`);
  assert.ok(theme.nativeAppearance?.accent, `${definition.id} 缺少 Codex 原生外观建议`);
}

await assert.rejects(
  readThemePackage(path.join(themesRoot, "missing-theme"), "missing-theme"),
  /主题配置不存在/,
);

console.log("PASS: Shared 24-theme catalog and package reader.");
