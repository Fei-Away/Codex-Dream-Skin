import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-payload-macos-"));
const temporaryTheme = path.join(temporaryRoot, "theme");
const specialName = "My $' Theme | Cool $& Skin | Price $$ Theme | Backtick $` Theme";

function runCheck(injectorPath) {
  return spawnSync(process.execPath, [
    injectorPath,
    "--check-payload",
    "--theme-dir",
    temporaryTheme,
  ], { encoding: "utf8" });
}

async function createInjectorFixture(name, template) {
  const fixtureRoot = path.join(temporaryRoot, name);
  const scriptsDir = path.join(fixtureRoot, "scripts");
  const assetsDir = path.join(fixtureRoot, "assets");
  await Promise.all([
    fs.mkdir(scriptsDir, { recursive: true }),
    fs.mkdir(assetsDir, { recursive: true }),
  ]);
  await Promise.all([
    fs.copyFile(path.join(root, "scripts", "injector.mjs"), path.join(scriptsDir, "injector.mjs")),
    fs.copyFile(path.join(root, "scripts", "image-metadata.mjs"), path.join(scriptsDir, "image-metadata.mjs")),
    fs.copyFile(path.join(root, "assets", "dream-skin.css"), path.join(assetsDir, "dream-skin.css")),
    fs.writeFile(path.join(assetsDir, "renderer-inject.js"), template, "utf8"),
  ]);
  return fs.realpath(path.join(scriptsDir, "injector.mjs"));
}

try {
  await fs.mkdir(temporaryTheme, { recursive: true });
  const theme = JSON.parse(await fs.readFile(path.join(root, "assets", "theme.json"), "utf8"));
  theme.id = "test-payload-template";
  theme.name = specialName;
  theme.brandSubtitle = "__DREAM_SKIN_CSS_JSON__";
  theme.tagline = "__DREAM_SKIN_ART_JSON__ | __DREAM_SKIN_THEME_JSON__";
  theme.projectPrefix = "__DREAM_SKIN_VERSION_JSON__";
  theme.quote = "__DREAM_SKIN_STYLE_REVISION_JSON__";
  await fs.copyFile(
    path.join(root, "assets", theme.image),
    path.join(temporaryTheme, theme.image),
  );
  await fs.writeFile(
    path.join(temporaryTheme, "theme.json"),
    `${JSON.stringify(theme, null, 2)}\n`,
    "utf8",
  );

  const result = runCheck(path.join(root, "scripts", "injector.mjs"));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.pass, true);
  assert.equal(report.themeName, specialName);
  assert.equal(report.payloadIntegrity, "verified");

  const template = await fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8");
  const missingInjector = await createInjectorFixture(
    "missing-token",
    template.replace("__DREAM_SKIN_VERSION_JSON__", ""),
  );
  const missingResult = runCheck(missingInjector);
  assert.notEqual(missingResult.status, 0, missingResult.stderr || missingResult.stdout);
  assert.match(
    missingResult.stderr,
    /must contain exactly one __DREAM_SKIN_VERSION_JSON__; found 0/,
  );

  const duplicateInjector = await createInjectorFixture(
    "duplicate-token",
    `${template}\n__DREAM_SKIN_THEME_JSON__\n`,
  );
  const duplicateResult = runCheck(duplicateInjector);
  assert.notEqual(duplicateResult.status, 0, duplicateResult.stderr || duplicateResult.stdout);
  assert.match(
    duplicateResult.stderr,
    /must contain exactly one __DREAM_SKIN_THEME_JSON__; found 2/,
  );
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log("PASS: macOS payload safely replaces exactly one of every template token.");
