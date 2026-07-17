import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testsRoot, "..", "..");
const read = (file) => fs.readFile(path.join(root, file), "utf8");
const [install, clientBuild, releaseBuild, version, packageSource, sharedInjector] = await Promise.all([
  read("macos/scripts/install-dream-skin-macos.sh"),
  read("macos/scripts/build-client-release.sh"),
  read("macos/scripts/build-release.sh"),
  read("macos/VERSION"),
  read("macos/package.json"),
  read("shared/runtime/injector.mjs"),
]);

for (const [name, source] of [["installer", install], ["client build", clientBuild], ["release build", releaseBuild]]) {
  assert.match(source, /shared/i, `${name} 没有复制 shared runtime`);
}
const expected = version.trim();
assert.equal(JSON.parse(packageSource).version, expected);
assert.match(sharedInjector, /path\.join\(projectRoot, "macos", "VERSION"\)/);
assert.doesNotMatch(sharedInjector, /SKIN_VERSION\s*=\s*["']1\./);

console.log("PASS: Release packaging includes shared runtime and consistent version.");
