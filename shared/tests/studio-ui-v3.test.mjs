import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testsRoot, "..", "studio", "web");
const files = await Promise.all([
  "index.html", "studio.js", "theme-editor.js", "theme-preview.js", "studio.css", "editor-v3.css",
].map((file) => fs.readFile(path.join(webRoot, file), "utf8")));
const source = files.join("\n");

for (const mode of ["home", "task", "diff"]) {
  assert.match(source, new RegExp(`data-preview-view=["']${mode}["']`), `缺少 ${mode} 预览视图`);
}
for (const field of ["nativeAccent", "nativeSurface", "nativeInk", "nativeContrast"] ) {
  assert.match(source, new RegExp(`name=["']${field}["']`), `缺少 ${field} 原生外观字段`);
}
assert.match(source, /4\.5:1/);
assert.match(source, /3:1/);
assert.match(source, /data-copy-native-theme/);
assert.match(source, /codex:\/\/settings/);
assert.match(source, /sampleImageAccent/);
assert.match(source, /schemaVersion:\s*3/);
assert.match(source, /Dream Skin 官方场景/);
assert.match(source, /_previewPalette/);
assert.match(source, /evaluatePaletteReadability/);
assert.match(source, /\.theme-editor-controls\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
assert.match(source, /\.theme-editor-layout\s*\{[^}]*height:/s);

console.log("PASS: Studio Theme v3 live composition and readability contract.");
