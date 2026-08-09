import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helper = readFileSync(join(root, "scripts", "localization-macos.sh"), "utf8");
const status = readFileSync(join(root, "scripts", "status-dream-skin-macos.sh"), "utf8");
const updateCheck = readFileSync(join(root, "scripts", "check-update-macos.sh"), "utf8");
const applyFromMenubar = readFileSync(join(root, "scripts", "apply-from-menubar-macos.sh"), "utf8");
const startScript = readFileSync(join(root, "scripts", "start-dream-skin-macos.sh"), "utf8");
const customizeScript = readFileSync(join(root, "scripts", "customize-theme-macos.sh"), "utf8");
const loadImageScript = readFileSync(join(root, "scripts", "load-image-theme-macos.sh"), "utf8");
const switchThemeScript = readFileSync(join(root, "scripts", "switch-theme-macos.sh"), "utf8");
const appDelegate = readFileSync(
  join(root, "menubar-app", "Sources", "CodexDreamSkinMenuBar", "AppDelegate.swift"),
  "utf8"
);
const scriptRunner = readFileSync(
  join(root, "menubar-app", "Sources", "CodexDreamSkinMenuBar", "ScriptRunner.swift"),
  "utf8"
);
const buildScript = readFileSync(join(root, "scripts", "build-menubar-app.sh"), "utf8");

test("macOS shell catalogs keep matching English and Chinese keys", () => {
  const matches = [...helper.matchAll(/\b(zh|en):([a-z][a-z0-9_]*)\)/g)];
  const keys = { zh: new Set(), en: new Set() };
  for (const [, language, key] of matches) keys[language].add(key);
  assert.deepEqual([...keys.en].sort(), [...keys.zh].sort());
  assert.ok(keys.en.size >= 35, "expected the primary script operation copy to be translated");
  for (const required of [
    "applying_skin",
    "skin_applied",
    "pausing_skin",
    "skin_paused",
    "restart_prompt",
    "loading_image",
    "validating_theme_content",
    "theme_switch_apply_failed",
    "cancel"
  ]) {
    assert.ok(keys.en.has(required), `missing shell localization key ${required}`);
  }
});

test("macOS theme load and switch notifications use the localized catalog", () => {
  for (const [name, source] of Object.entries({ loadImageScript, switchThemeScript })) {
    assert.doesNotMatch(source, /^\s*(?:progress|alert_user)\s+"(?!\$\(dreamskin_text\b)/m,
      `${name} still has a hard-coded user notification`);
  }
  assert.match(loadImageScript, /dreamskin_text loading_image/);
  assert.match(loadImageScript, /dreamskin_text image_saved_apply_failed/);
  assert.match(switchThemeScript, /dreamskin_text validating_theme_content/);
  assert.match(switchThemeScript, /dreamskin_text theme_switch_apply_failed/);
});

test("macOS native language selection persists and reaches child scripts", () => {
  assert.match(appDelegate, /DreamSkinLanguage\.stored\(\)/);
  assert.match(appDelegate, /addLanguageMenu\(\)/);
  assert.match(appDelegate, /UserDefaults\.standard\.set\(newValue\.rawValue/);
  assert.match(scriptRunner, /import DreamSkinCore/);
  assert.match(scriptRunner, /environment\["DREAMSKIN_LANG"\]\s*=\s*DreamSkinLanguage\.stored\(\)\.environmentValue/);
  assert.match(buildScript, /\n\s*localization-macos\.sh\n/);
});

test("macOS localized status keeps the machine-readable JSON contract stable", () => {
  assert.match(status, /\. "\$SCRIPT_DIR\/localization-macos\.sh"/);
  assert.match(
    status,
    /\{"session":"%s","operation":"%s","operationMessage":"%s","port":%s,"injectorAlive":%s,"cdpOk":%s,"codexRunning":%s,"themeId":"%s","themeName":"%s","appliedThemeId":"%s","appliedThemeName":"%s"\}/
  );
  assert.doesNotMatch(status, /"(?:session|operation|port|themeId)"\s*:\s*"?\$\(dreamskin_text/);
});

test("macOS localized dialogs keep line breaks and explicit cancel semantics", () => {
  assert.doesNotMatch(updateCheck, /UPDATE_MESSAGE=.*\\n/);
  assert.match(updateCheck, /UPDATE_MESSAGE="发现新版本[^\n]*\n\n当前版本/);
  assert.match(updateCheck, /UPDATE_MESSAGE="New version[^\n]*\n\nYou are running/);
  assert.match(updateCheck, /default button downloadLabel cancel button laterLabel/);
  assert.match(applyFromMenubar, /default button okLabel cancel button cancelLabel/);
  assert.match(startScript, /default button okLabel cancel button cancelLabel/);
  assert.match(customizeScript, /default button continueLabel cancel button cancelLabel/);

  for (const [name, source] of Object.entries({
    applyFromMenubar,
    startScript,
    updateCheck,
    customizeScript
  })) {
    const blocks = [...source.matchAll(/<<'APPLESCRIPT'[^\n]*\n([\s\S]*?)\nAPPLESCRIPT/g)];
    assert.ok(blocks.length > 0, `${name} has no AppleScript block to validate`);
    for (const [, block] of blocks) {
      assert.doesNotMatch(block, /\\\s*$/m, `${name} uses a shell continuation inside AppleScript`);
    }
  }
});
