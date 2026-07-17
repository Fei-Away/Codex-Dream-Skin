import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [scene, macInjector, windowsInjector, macCommon, windowsCommon] = await Promise.all([
  fs.readFile(new URL("../runtime/scene-inject.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../../macos/scripts/injector.mjs", import.meta.url), "utf8"),
  fs.readFile(new URL("../../windows/scripts/injector.mjs", import.meta.url), "utf8"),
  fs.readFile(new URL("../../macos/scripts/common-macos.sh", import.meta.url), "utf8"),
  fs.readFile(new URL("../../windows/scripts/common-windows.ps1", import.meta.url), "utf8"),
]);

for (const injector of [macInjector, windowsInjector]) {
  assert.match(injector, /resolveSharedRoot/);
  assert.match(injector, /scene-inject\.js/);
  assert.match(injector, /scene-v3\.css/);
  assert.match(injector, /__CODEX_DREAM_SKIN_SCENE_STATE__/);
}
assert.match(scene, /composer-home-top-menu/);
assert.match(scene, /dream-skin-scene-action-button/);
assert.match(macCommon, /EXPECTED_CODEX_TEAM_ID/);
assert.match(windowsCommon, /Get-DreamSkinVerifiedCdpIdentity/);
assert.match(windowsInjector, /BrowserIdentityAnchor/);

console.log("PASS: platform injectors preserve safety and load the shared Theme v3 scene layer.");
