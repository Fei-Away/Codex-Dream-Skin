import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testsRoot, "..", "studio", "web");
const index = await fs.readFile(path.join(webRoot, "index.html"), "utf8");
const editor = await fs.readFile(path.join(webRoot, "theme-editor.js"), "utf8");
const preview = await fs.readFile(path.join(webRoot, "theme-preview.js"), "utf8");
const card = await fs.readFile(path.join(webRoot, "theme-card.js"), "utf8");
const source = `${index}\n${editor}\n${preview}`;

assert.doesNotMatch(index, /name=["']line["'][^>]+type=["']text["']/);
assert.match(index, /name=["']line["'][^>]+type=["']color["']/);
assert.match(index, /name=["']lineOpacity["'][^>]+type=["']range["']/);
assert.match(index, /data-palette=["']dark["']/);
assert.match(index, /data-palette=["']light["']/);
assert.match(index, /data-generate-palette/);

for (const field of [
  "shellMode", "focusX", "focusY", "zoom", "overlay", "surfaceOpacity",
  "blur", "radius", "shadow", "decorationStyle", "decorationIntensity", "typography",
]) {
  assert.match(index, new RegExp(`name=["']${field}["']`), `编辑器缺少 ${field}`);
}

assert.match(source, /运行效果/);
assert.match(source, /设计参考/);
assert.match(preview, /themeRuntime/);
assert.match(editor, /palettes/);
assert.match(editor, /appearance/);
assert.equal((card.match(/theme\.imageUrl/g) || []).length, 2);
assert.equal((card.match(/assetUrl\(theme\.imageUrl\)/g) || []).length, 2, "内置主题图片绕过了查询令牌");

console.log("PASS: Studio Theme v2 editor and preview contract.");
