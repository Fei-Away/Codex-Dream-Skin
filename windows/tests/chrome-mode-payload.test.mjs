import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadPayload } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(here, "../assets");

async function makeActiveTheme() {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-chrome-mode-"));
  const themeDir = path.join(stateRoot, "active-theme");
  await fs.mkdir(themeDir);
  await fs.copyFile(
    path.join(assetsDir, "dream-reference.jpg"),
    path.join(themeDir, "dream-reference.jpg"),
  );
  await fs.writeFile(
    path.join(themeDir, "theme.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "chrome-mode-fixture",
      name: "Chrome mode fixture",
      image: "dream-reference.jpg",
      appearance: "auto",
    }),
    "utf8",
  );
  return { stateRoot, themeDir };
}

test("the active chrome-mode preference changes payload identity without changing theme files", async () => {
  const fixture = await makeActiveTheme();
  try {
    const initial = await loadPayload(fixture.themeDir);
    assert.equal(initial.theme.chromeMode, "left");

    await fs.writeFile(path.join(fixture.stateRoot, "chrome-mode"), "full\r\n", "utf8");
    const full = await loadPayload(fixture.themeDir);
    assert.equal(full.theme.chromeMode, "full");
    assert.equal(full.themeFingerprint, initial.themeFingerprint);
    assert.notEqual(full.fingerprint, initial.fingerprint);
    assert.notEqual(full.revision, initial.revision);
    assert.notEqual(full.sourceStamp, initial.sourceStamp);

    await fs.writeFile(path.join(fixture.stateRoot, "chrome-mode"), "left\r\n", "utf8");
    const restored = await loadPayload(fixture.themeDir);
    assert.equal(restored.theme.chromeMode, "left");
    assert.equal(restored.fingerprint, initial.fingerprint);
    assert.equal(restored.revision, initial.revision);
    assert.notEqual(restored.sourceStamp, full.sourceStamp);
  } finally {
    await fs.rm(fixture.stateRoot, { recursive: true, force: true });
  }
});

test("non-active payloads keep the safe left default", async () => {
  const fixture = await makeActiveTheme();
  const ordinaryThemeDir = path.join(fixture.stateRoot, "saved-theme");
  try {
    await fs.rename(fixture.themeDir, ordinaryThemeDir);
    await fs.writeFile(path.join(fixture.stateRoot, "chrome-mode"), "full\r\n", "utf8");
    const loaded = await loadPayload(ordinaryThemeDir);
    assert.equal(loaded.theme.chromeMode, "left");
  } finally {
    await fs.rm(fixture.stateRoot, { recursive: true, force: true });
  }
});
