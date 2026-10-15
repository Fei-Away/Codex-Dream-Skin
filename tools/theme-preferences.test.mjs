import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readThemePreferences, readThemeTransparency, themePreferencesPath } from "../runtime/theme-preferences.mjs";
import * as mac from "../macos/scripts/injector.mjs";
import * as windows from "../windows/scripts/injector.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-preferences-"));
const preferencesPath = path.join(temp, "theme-preferences.json");
const warnings = [];
const options = { preferencesPath, warn: (message) => warnings.push(message) };
const write = (themes) => fs.writeFile(preferencesPath, JSON.stringify({ schemaVersion: 1, themes }));
try {
  assert.equal(themePreferencesPath("darwin", {}, "/test"), path.join("/test", "Library", "Application Support", "CodexDreamSkinStudio", "theme-preferences.json"));
  assert.equal(themePreferencesPath("win32", { LOCALAPPDATA: "/local" }, "/test"), path.join("/local", "CodexDreamSkin", "theme-preferences.json"));
  assert.equal(await readThemeTransparency("test", options), undefined);
  await write({ test: { transparency: 44, surfaceTransparency: { sidebar: 25 },
    transparencyEnabled: false, followTheme: true } });
  assert.deepEqual(await readThemePreferences("test", options), {
    transparency: 44, surfaceTransparency: { sidebar: 25 },
    transparencyEnabled: false, followTheme: true,
  });
  await write({ test: { transparencyEnabled: false }, other: { followTheme: true } });
  assert.deepEqual(await readThemePreferences("test", options), { transparencyEnabled: false });
  assert.deepEqual(await readThemePreferences("other", options), { followTheme: true });
  for (const transparency of [0, 30, 100]) {
    await write({ test: { transparency }, other: { transparency: 75 } });
    assert.equal(await readThemeTransparency("test", options), transparency);
    assert.equal(await readThemeTransparency("other", options), 75);
    assert.equal(await readThemeTransparency("absent", options), undefined);
  }
  await write({ test: { surfaceTransparency: { composer: 55, sidebar: 0, message: 100 } } });
  assert.deepEqual(await readThemePreferences("test", options), {
    surfaceTransparency: { composer: 55, sidebar: 0, message: 100 },
  });
  assert.equal(await readThemeTransparency("test", options), undefined);
  await write({ test: { surfaceTransparency: {
    composer: 37, composerFocused: 64, sidebar: 37, message: 37, messageFocused: 12,
  } } });
  assert.deepEqual((await readThemePreferences("test", options)).surfaceTransparency, {
    composer: 37, composerFocused: 64, sidebar: 37, message: 37, messageFocused: 12,
  });
  for (const invalid of [{ sidebar: -1 }, { message: 101 }, { composer: "55" }, { rail: 20 }, {}]) {
    await write({ test: { surfaceTransparency: invalid } });
    assert.deepEqual(await readThemePreferences("test", options), {});
  }
  for (const transparency of [-1, 101, "30", null]) {
    await write({ test: { transparency } });
    assert.equal(await readThemeTransparency("test", options), undefined);
  }
  for (const invalid of [0, 1, "true", null]) {
    await write({ test: { transparencyEnabled: invalid } });
    assert.deepEqual(await readThemePreferences("test", options), {});
    await write({ test: { followTheme: invalid } });
    assert.deepEqual(await readThemePreferences("test", options), {});
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
    userSurfaceTransparency: { message: 99 },
    surfaceTransparency: { composer: 20, sidebar: 10, message: 0 },
  }));
  for (const [name, api] of [["macOS", mac], ["Windows", windows]]) {
    await write({});
    const absent = await api.loadTheme(themeDir, options);
    assert.equal(Object.hasOwn(absent.theme, "userTransparency"), false, `${name} must ignore package-supplied override`);
    assert.equal(Object.hasOwn(absent.theme, "userSurfaceTransparency"), false);
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
    await write({ test: { surfaceTransparency: { composer: 65 } } });
    const surfaceLoaded = await api.loadTheme(themeDir, options);
    assert.deepEqual(surfaceLoaded.theme.userSurfaceTransparency, { composer: 65 });
    assert.deepEqual(surfaceLoaded.theme.surfaceTransparency, { composer: 20, sidebar: 10, message: 0 });
    const surfacePayload = name === "macOS"
      ? await api.loadPayload(themeDir, options)
      : await api.loadPayload(themeDir, surfaceLoaded);
    assert.notEqual(surfacePayload.revision, revisions[1], `${name} surface override must change renderer revision`);
    if (name === "Windows") assert.notEqual(surfaceLoaded.fingerprint, fingerprints[1]);
    await write({ test: { transparency: 33, surfaceTransparency: { sidebar: 42 },
      transparencyEnabled: false, followTheme: true } });
    const modeLoaded = await api.loadTheme(themeDir, options);
    assert.equal(modeLoaded.theme.transparencyEnabled, false);
    assert.equal(modeLoaded.theme.followTheme, true);
    assert.equal(modeLoaded.theme.userTransparency, 33);
    assert.equal(modeLoaded.theme.userSurfaceTransparency.sidebar, 42);
    const modePayload = name === "macOS"
      ? await api.loadPayload(themeDir, options)
      : await api.loadPayload(themeDir, modeLoaded);
    assert.notEqual(modePayload.revision, surfacePayload.revision, `${name} mode change must reach renderer`);
    await write({ test: { transparency: 33, surfaceTransparency: { sidebar: 42 },
      transparencyEnabled: true, followTheme: false } });
    const restored = await api.loadTheme(themeDir, options);
    assert.equal(restored.theme.transparencyEnabled, true);
    assert.equal(restored.theme.followTheme, false);
    assert.equal(restored.theme.userSurfaceTransparency.sidebar, 42, `${name} mode exit keeps saved value`);
  }
  console.log("PASS: local per-theme transparency preferences and injector revisions");
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
