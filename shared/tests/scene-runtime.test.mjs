import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(testsRoot, "..");
const [injector, sceneCss, homeCss] = await Promise.all([
  fs.readFile(path.join(sharedRoot, "runtime", "scene-inject.js"), "utf8"),
  fs.readFile(path.join(sharedRoot, "runtime", "css", "scene-v3.css"), "utf8"),
  fs.readFile(path.join(sharedRoot, "runtime", "css", "home.css"), "utf8"),
]);

for (const marker of [
  "dream-skin-scene-shell",
  "dream-skin-scene-hero-surface",
  "dream-skin-scene-identity",
  "dream-skin-scene-hero",
  "dream-skin-scene-actions",
  "dream-skin-scene-action",
  "dream-skin-scene-menu",
  "dream-skin-scene-companion",
]) {
  assert.match(injector, new RegExp(marker), `运行时缺少 ${marker}`);
  assert.match(sceneCss, new RegExp(marker), `样式缺少 ${marker}`);
}
assert.match(injector, /const icons = Object\.freeze/);
assert.match(injector, /RENDERER_VERSION/);
assert.match(injector, /createElementNS\("http:\/\/www\.w3\.org\/2000\/svg"/);
assert.doesNotMatch(injector, /spark:\s*"✦"/);
assert.match(injector, /replaceChildren/);
assert.match(injector, /removeScene/);
assert.match(injector, /closestDirectChild/);
assert.match(injector, /findHome/);
assert.match(injector, /runAction/);
assert.match(injector, /openNativeComposerMenu/);
assert.match(injector, /data-composer-navigation-target=\\?"add-context/);
assert.match(injector, /composer-home-top-menu/);
assert.match(injector, /aria-haspopup/);
assert.match(sceneCss, /scene-shell:has\(\.dream-skin-scene-menu:not\(\[hidden\]\)\)/);
assert.match(sceneCss, /grid-template-columns:\s*repeat\(4/);
assert.doesNotMatch(injector, /dream-skin-scene-widget/);
assert.doesNotMatch(sceneCss, /dream-skin-scene-widget/);
assert.match(homeCss, /dream-skin-native-hero-region/);
assert.doesNotMatch(homeCss, /flex:\s*0\s+0\s+430px/);
assert.doesNotMatch(injector, /innerHTML\s*=\s*THEME/);

console.log("PASS: Theme v3 scene components are injected and cleaned up safely.");
