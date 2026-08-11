import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localizationPath = join(root, "scripts", "localization-windows.ps1");
const bytes = readFileSync(localizationPath);
const source = bytes.subarray(3).toString("utf8");
const tray = readFileSync(join(root, "scripts", "tray-dream-skin.ps1"), "utf8");
const updateCheck = readFileSync(join(root, "scripts", "check-update.ps1"), "utf8");
const start = readFileSync(join(root, "scripts", "start-dream-skin.ps1"), "utf8");
const restore = readFileSync(join(root, "scripts", "restore-dream-skin.ps1"), "utf8");
const communityApply = readFileSync(join(root, "scripts", "apply-community-theme.ps1"), "utf8");
const bootstrap = readFileSync(join(root, "installer", "setup-bootstrap.ps1"), "utf8");
const common = readFileSync(join(root, "scripts", "common-windows.ps1"), "utf8");
const releaseBuilder = readFileSync(join(root, "installer", "build-release.ps1"), "utf8");
const themeWindows = readFileSync(join(root, "scripts", "theme-windows.ps1"), "utf8");
const runTests = readFileSync(join(root, "tests", "run-tests.ps1"), "utf8");

const extractCatalog = (language, until) => {
  const pattern = new RegExp(`'${language}'\\s*=\\s*@\\{([\\s\\S]*?)${until}`);
  const match = source.match(pattern);
  assert.ok(match, `missing ${language} localization catalog`);
  return new Map(
    [...match[1].matchAll(/([A-Za-z][A-Za-z0-9]*)\s*=\s*'([^']*)'/g)]
      .map((entry) => [entry[1], entry[2]])
  );
};

test("Windows localization source is PowerShell 5.1-safe UTF-8 with BOM", () => {
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  for (const functionName of [
    "Resolve-DreamSkinLanguage",
    "Set-DreamSkinLanguage",
    "Get-DreamSkinLanguagePreference",
    "Get-DreamSkinText"
  ]) {
    assert.match(source, new RegExp(`function ${functionName}\\s*\\{`));
  }
  assert.doesNotMatch(source, /\?\?|\?\.|ForEach-Object\s+-Parallel/);
});

test("Windows English and Chinese catalogs have the same format contract", () => {
  const english = extractCatalog("en-US", "\\n\\s*\\}\\s*\\n\\s*'zh-CN'");
  const chinese = extractCatalog("zh-CN", "\\n\\s*\\}\\s*\\n\\s*\\}\\s*\\n");
  assert.deepEqual([...english.keys()].sort(), [...chinese.keys()].sort());
  assert.ok(english.size >= 35, "expected the primary tray surface to be translated");
  for (const [key, englishText] of english) {
    const chineseText = chinese.get(key);
    assert.ok(englishText.trim(), `${key} English copy is empty`);
    assert.ok(chineseText?.trim(), `${key} Chinese copy is empty`);
    assert.equal(
      (englishText.match(/\{\d+\}/g) ?? []).join(","),
      (chineseText.match(/\{\d+\}/g) ?? []).join(","),
      `${key} format placeholders differ`
    );
  }
});

test("Windows tray references only translated keys and packages the helper", () => {
  const english = extractCatalog("en-US", "\\n\\s*\\}\\s*\\n\\s*'zh-CN'");
  const localizedClients = [tray, updateCheck, start, restore, communityApply];
  const referencedKeys = localizedClients.flatMap((client) => [
    ...client.matchAll(/Get-DreamSkin(?:Tray|Update|Community)?Text\s+-Key\s+'([A-Za-z][A-Za-z0-9]*)'/g)
  ].map((match) => match[1]));
  assert.ok(referencedKeys.length >= 25, "expected localized tray actions");
  for (const key of referencedKeys) {
    assert.ok(english.has(key), `tray references unknown localization key ${key}`);
  }
  assert.match(tray, /Add-DreamSkinTrayLanguageMenu/);
  assert.match(tray, /Set-DreamSkinLanguage -Language \$optionValue/);
  assert.match(tray, /\$env:DREAMSKIN_LANG = Resolve-DreamSkinLanguage -StateRoot \$StateRoot/);
  for (const packagingSource of [bootstrap, common, releaseBuilder]) {
    assert.match(packagingSource, /'scripts\\localization-windows\.ps1'/);
  }
  for (const client of [updateCheck, start, restore, communityApply]) {
    assert.match(client, /Join-Path \$PSScriptRoot 'localization-windows\.ps1'/);
  }
});

test("Windows pause results use one localized message across tray and renderer", () => {
  for (const parameter of [
    "PauseNoSessionMessage",
    "PauseSucceededMessage",
    "PauseFailedMessage"
  ]) {
    assert.match(themeWindows, new RegExp(`\\[string\\]\\$${parameter}`));
    assert.match(tray, new RegExp(`-${parameter} \\$${parameter[0].toLowerCase()}${parameter.slice(1)}`));
  }
  assert.match(tray, /\$removalMessage = \$removal\.Message/);
  const liveRemove = themeWindows.match(/function Invoke-DreamSkinLiveRemove\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(liveRemove, "missing live remove implementation");
  assert.doesNotMatch(liveRemove, /-Message '(?:皮肤已暂停|暂停失败，请重试)'/);
  assert.match(liveRemove, /Message = \$PauseNoSessionMessage/);
  assert.match(liveRemove, /Message = \$PauseSucceededMessage/);
  assert.match(liveRemove, /Message = \$PauseFailedMessage/);
  for (const token of [
    "'[string]$PauseNoSessionMessage'",
    "'[string]$PauseSucceededMessage'",
    "'[string]$PauseFailedMessage'",
    "Get-DreamSkinTrayText -Key 'PauseNoSession'",
    "Get-DreamSkinTrayText -Key 'PauseSucceeded'",
    "Get-DreamSkinTrayText -Key 'PauseFailed'"
  ]) {
    assert.ok(runTests.includes(token), `Windows static gate is missing ${token}`);
  }
});
