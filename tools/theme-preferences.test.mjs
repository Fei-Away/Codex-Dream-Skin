import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readThemeTransparency, themePreferencesPath } from "../runtime/theme-preferences.mjs";
import * as mac from "../macos/scripts/injector.mjs";
import * as windows from "../windows/scripts/injector.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-preferences-"));
const preferencesPath = path.join(temp, "theme-preferences.json");
const warnings = [];
const options = { preferencesPath, warn: (message) => warnings.push(message) };
const write = (themes) => fs.writeFile(preferencesPath, JSON.stringify({ schemaVersion: 1, themes }));
try {
  assert.equal(themePreferencesPath("darwin", {}, "/test"), "/test/Library/Application Support/CodexDreamSkinStudio/theme-preferences.json");
  assert.equal(themePreferencesPath("win32", { LOCALAPPDATA: "/local" }, "/test"), "/local/CodexDreamSkin/theme-preferences.json");
  assert.equal(await readThemeTransparency("test", options), undefined);
  for (const transparency of [0, 30, 100]) {
    await write({ test: { transparency }, other: { transparency: 75 } });
    assert.equal(await readThemeTransparency("test", options), transparency);
    assert.equal(await readThemeTransparency("other", options), 75);
    assert.equal(await readThemeTransparency("absent", options), undefined);
  }
  for (const transparency of [-1, 101, "30", null]) {
    await write({ test: { transparency } });
    assert.equal(await readThemeTransparency("test", options), undefined);
  }
  for (const invalid of ['{"secret":"DO_NOT_LOG"', JSON.stringify({ schemaVersion: 2, themes: {} }), "x".repeat(262145)]) {
    await fs.writeFile(preferencesPath, invalid);
    assert.equal(await readThemeTransparency("test", options), undefined);
  }
  assert.ok(warnings.length > 0);
  assert.ok(warnings.every((message) => !message.includes("DO_NOT_LOG")));
  const themeDir = path.join(temp, "theme");
  await fs.mkdir(themeDir);
  await fs.copyFile(path.join(root, "macos/assets/portal-hero.png"), path.join(themeDir, "background.png"));
  await fs.writeFile(path.join(themeDir, "theme.json"), JSON.stringify({
    schemaVersion: 1, id: "test", image: "background.png", userTransparency: 99,
  }));
  for (const [name, api] of [["macOS", mac], ["Windows", windows]]) {
    await write({});
    const absent = await api.loadTheme(themeDir, options);
    assert.equal(Object.hasOwn(absent.theme, "userTransparency"), false, `${name} must ignore package-supplied override`);
    const revisions = [];
    const fingerprints = [];
    for (const transparency of [0, 100]) {
      await write({ test: { transparency } });
      const loaded = await api.loadTheme(themeDir, options);
      assert.equal(loaded.theme.userTransparency, transparency);
      const payload = name === "macOS"
        ? await api.loadPayload(themeDir, options)
        : await api.loadPayload(themeDir, loaded);
      revisions.push(payload.revision);
      fingerprints.push(loaded.fingerprint);
    }
    assert.notEqual(revisions[0], revisions[1], `${name} preference changes must invalidate renderer revision`);
    if (name === "Windows") assert.notEqual(fingerprints[0], fingerprints[1], "Polling must detect preference-only changes");
  }
  console.log("PASS: local per-theme transparency preferences and injector revisions");
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
