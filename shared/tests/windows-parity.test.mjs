import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testsRoot, "..", "..");
const read = (file) => fs.readFile(path.join(root, file), "utf8");
const [install, start, common, injector, studio, status, switchTheme, adapter] = await Promise.all([
  read("windows/scripts/install-dream-skin.ps1"),
  read("windows/scripts/start-dream-skin.ps1"),
  read("windows/scripts/common-windows.ps1"),
  read("shared/runtime/injector.mjs"),
  read("windows/scripts/start-dream-skin-studio.ps1"),
  read("windows/scripts/status-dream-skin.ps1"),
  read("windows/scripts/switch-theme.ps1"),
  read("windows/platform/studio-adapter.mjs"),
]);

assert.doesNotMatch(install, /appearanceTheme\s*=\s*"light"/);
assert.match(install, /\.codex[\\/]codex-dream-skin-studio/i);
assert.match(install, /shared/i);
assert.match(install, /Codex Dream Skin Studio\.lnk/);
assert.doesNotMatch(`${install}\n${start}\n${common}`, /WindowsApps\\[^'"\s]*_\d/);

assert.match(common, /Get-AppxPackage\s+OpenAI\.Codex/i);
assert.match(common, /cua_node/i);
assert.match(start, /--theme-dir/i);
assert.match(injector, /normalizeTheme/);
assert.match(injector, /__DREAM_SKIN_RUNTIME_JSON__/);

assert.match(studio, /studio[\\/]server\.mjs/i);
assert.match(status, /ConvertTo-Json/);
assert.match(switchTheme, /theme\.json/);
assert.match(switchTheme, /start-dream-skin\.ps1/);
assert.match(adapter, /apply-theme/);
assert.match(adapter, /status-dream-skin\.ps1/);

console.log("PASS: Windows full-parity lifecycle contract.");
