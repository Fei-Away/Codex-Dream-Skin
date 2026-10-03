import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import {
  DEFAULT_ANIMATION_SETTINGS, ensureAnimationStateRoot, readAnimationSettings,
  saveAnimationSettings, validateAnimationSettings,
} from "../scripts/animation-settings.mjs";
import { loadPayload, watchPayloadSources, verifyAnimationRefresh } from "../scripts/injector.mjs";

const linuxRoot = fileURLToPath(new URL("../", import.meta.url));
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-animation-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("animation is opt-in and accepts only local preset/boolean/power data", () => {
  assert.equal(DEFAULT_ANIMATION_SETTINGS.enabled, false);
  for (const value of [null, [], {}, { ...DEFAULT_ANIMATION_SETTINGS, enabled: "true" },
    { ...DEFAULT_ANIMATION_SETTINGS, preset: "https://example.com/template" },
    { ...DEFAULT_ANIMATION_SETTINGS, preset: "<script>alert(1)</script>" },
    { ...DEFAULT_ANIMATION_SETTINGS, power: "unlimited" },
    { ...DEFAULT_ANIMATION_SETTINGS, css: "@keyframes remote {}" },
    { ...DEFAULT_ANIMATION_SETTINGS, schemaVersion: 2 }]) {
    assert.throws(() => validateAnimationSettings(value), /Invalid/);
  }
  assert.deepEqual(validateAnimationSettings({ ...DEFAULT_ANIMATION_SETTINGS, preset: "starfield" }),
    { ...DEFAULT_ANIMATION_SETTINGS, preset: "starfield" });
});

test("bounded preference reads reject oversized, empty, malformed and linked files", async (t) => {
  const directory = await fixture(t);
  const filename = path.join(directory, "animation.json");
  assert.deepEqual(await readAnimationSettings(filename), DEFAULT_ANIMATION_SETTINGS);
  for (const content of ["", "x".repeat(4097), "{bad", JSON.stringify({ ...DEFAULT_ANIMATION_SETTINGS, url: "remote" })]) {
    await fs.writeFile(filename, content);
    await assert.rejects(readAnimationSettings(filename));
  }
  await fs.rm(filename);
  const external = path.join(directory, "external.json");
  await fs.writeFile(external, JSON.stringify(DEFAULT_ANIMATION_SETTINGS));
  await fs.symlink(external, filename);
  await assert.rejects(readAnimationSettings(filename), /regular local file/);
});

test("atomic private preferences preserve theme files and remembered preset while disabled", async (t) => {
  const directory = await fixture(t);
  const artwork = path.join(directory, "background.jpg");
  await fs.writeFile(artwork, "unchanged wallpaper");
  const settings = { ...DEFAULT_ANIMATION_SETTINGS, enabled: true, preset: "starfield" };
  await saveAnimationSettings(directory, settings);
  const filename = path.join(directory, "animation.json");
  assert.deepEqual(await readAnimationSettings(filename), settings);
  assert.equal((await fs.stat(filename)).mode & 0o777, 0o600);
  await saveAnimationSettings(directory, { ...settings, enabled: false });
  assert.deepEqual(await readAnimationSettings(filename), { ...settings, enabled: false });
  assert.equal(await fs.readFile(artwork, "utf8"), "unchanged wallpaper");
  assert.deepEqual((await fs.readdir(directory)).sort(), ["animation.json", "background.jpg"]);
});

test("state redirects and hardlinked settings fail before unrelated files are changed", async (t) => {
  const directory = await fixture(t);
  const target = path.join(directory, "target");
  const linked = path.join(directory, "linked");
  await fs.mkdir(target);
  await fs.symlink(target, linked);
  await assert.rejects(ensureAnimationStateRoot(path.join(linked, "new-state")), /redirects/);
  assert.deepEqual(await fs.readdir(target), []);
  const external = path.join(directory, "external.json");
  await fs.writeFile(external, JSON.stringify(DEFAULT_ANIMATION_SETTINGS));
  await fs.link(external, path.join(directory, "animation.json"));
  await assert.rejects(saveAnimationSettings(directory, { ...DEFAULT_ANIMATION_SETTINGS, enabled: true }), /linked/);
  assert.equal(await fs.readFile(external, "utf8"), JSON.stringify(DEFAULT_ANIMATION_SETTINGS));
});

test("Linux dispatch, menu and enable/disable persist without launching or changing Codex", async (t) => {
  const directory = await fixture(t);
  const stateRoot = path.join(directory, "codex-dream-skin");
  const env = { ...process.env, XDG_STATE_HOME: directory };
  const entry = path.join(linuxRoot, "scripts/dreamskin.sh");
  // Source the entry point without its desktop/MIME setup, then exercise its
  // real dispatch and menu with an isolated XDG state root.
  const run = (...args) => execFileSync("/bin/bash", ["-c",
    'source "$1" --self-test-source; shift; dispatch animation "$@"', "--", entry, ...args], { env, encoding: "utf8" });
  run("preset", "starfield");
  run("off");
  let settings = await readAnimationSettings(path.join(stateRoot, "animation.json"));
  assert.equal(settings.enabled, false);
  assert.equal(settings.preset, "starfield");
  run("on");
  run("power", "low");
  settings = await readAnimationSettings(path.join(stateRoot, "animation.json"));
  assert.deepEqual(settings, { schemaVersion: 1, enabled: true, preset: "starfield", power: "low" });
  const menu = execFileSync("/bin/bash", ["-c", 'source "$1" --self-test-source; menu_loop', "--", entry],
    { env, input: "M\n1\n0\n", encoding: "utf8" });
  assert.match(menu, /极光.*星空/);
  assert.equal((await readAnimationSettings(path.join(stateRoot, "animation.json"))).preset, "aurora");
  const beforeInvalid = await fs.readFile(path.join(stateRoot, "animation.json"), "utf8");
  assert.throws(() => run("preset", "remote"));
  assert.equal(await fs.readFile(path.join(stateRoot, "animation.json"), "utf8"), beforeInvalid);
  assert.deepEqual((await fs.readdir(stateRoot)).sort(), ["animation.json"]);
});

test("Linux payload incorporates preferences into revision and corrupted preferences fall back to static", async (t) => {
  const directory = await fixture(t);
  const filename = path.join(directory, "animation.json");
  const staticPayload = await loadPayload(undefined, filename);
  assert.equal(staticPayload.theme.animation.enabled, false);
  await saveAnimationSettings(directory, { ...DEFAULT_ANIMATION_SETTINGS, enabled: true });
  const animatedPayload = await loadPayload(undefined, filename);
  assert.equal(animatedPayload.theme.animation.preset, "aurora");
  assert.notEqual(animatedPayload.revision, staticPayload.revision);
  assert.equal(animatedPayload.theme.image, staticPayload.theme.image);
  await fs.writeFile(filename, "{invalid preference");
  const fallback = await loadPayload(undefined, filename);
  assert.deepEqual(fallback.theme.animation, DEFAULT_ANIMATION_SETTINGS);
  assert.equal(fallback.revision, staticPayload.revision);
  assert.equal(fallback.safeCssStatus, staticPayload.safeCssStatus);
});

test("actual Linux watcher sees atomic preference publication and ignores other state files", async (t) => {
  const directory = await fixture(t);
  const themeDir = path.join(directory, "theme");
  await fs.mkdir(themeDir);
  const filename = path.join(directory, "animation.json");
  let resolveChange;
  const changed = new Promise((resolve) => { resolveChange = resolve; });
  const close = watchPayloadSources(themeDir, resolveChange, filename);
  t.after(close);
  await fs.writeFile(path.join(directory, "state.json"), "{}");
  const unrelated = await Promise.race([changed.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 80))]);
  assert.equal(unrelated, false);
  await saveAnimationSettings(directory, { ...DEFAULT_ANIMATION_SETTINGS, enabled: true });
  const timeout = setTimeout(() => resolveChange({ timeout: true }), 2000);
  const result = await changed;
  clearTimeout(timeout);
  assert.equal(result.timeout, undefined, "atomic rename must reload the Linux animation preferences");
  assert.equal(result.staticChanged, false);
  assert.equal(result.animationChanged, true);
});

test("preference refresh verifies the exact hidden renderer without activating a window", async () => {
  const attrs = { "data-dream-skin": "active", "data-dream-animation": "aurora" };
  const context = {
    document: { hidden: true, visibilityState: "hidden", documentElement: { getAttribute: (key) => attrs[key] } },
    window: { __CODEX_DREAM_SKIN_STATE__: { revision: "expected" } },
  };
  const session = {
    evaluate: async (expression) => vm.runInNewContext(expression, context),
    send: () => { throw new Error("Preference refresh must not focus the window"); },
  };
  const settings = { ...DEFAULT_ANIMATION_SETTINGS, enabled: true };
  assert.equal(await verifyAnimationRefresh(session, "expected", settings), true);
  assert.equal(await verifyAnimationRefresh(session, "stale", settings), false);
  attrs["data-dream-animation"] = "off";
  assert.equal(await verifyAnimationRefresh(session, "expected", settings), false);
  assert.equal(await verifyAnimationRefresh(session, "expected", DEFAULT_ANIMATION_SETTINGS), true);
  context.window.__CODEX_DREAM_SKIN_DISABLED__ = true;
  assert.equal(await verifyAnimationRefresh(session, "expected", DEFAULT_ANIMATION_SETTINGS), false);
});
