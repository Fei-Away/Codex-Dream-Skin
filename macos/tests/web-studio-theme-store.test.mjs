import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LIMITS } from "../scripts/web-studio-shared.mjs";
import { createThemeStore } from "../scripts/web-studio-theme-store.mjs";

const jpegBytes = () => Buffer.from("ffd8ffe000104a464946", "hex");
const pngBytes = () => Buffer.from("89504e470d0a1a0a00000000", "hex");
const validFields = (name) => ({
  name,
  tagline: "测试口号",
  quote: "BUILD",
  accent: "#7cff46",
  secondary: "#36d7e8",
  highlight: "#642a8c",
  apply: false,
  allowRestart: false,
});

async function fixtureStore(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dream-web-theme-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateRoot = path.join(root, "state");
  const projectRoot = path.join(root, "project");
  await fs.mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  const control = { failure: null, preparedSize: null };
  const runFile = async (file, args) => {
    if (control.failure) throw control.failure;
    if (file === "/usr/bin/sips") {
      const sourcePath = args.at(-3);
      const outputPath = args.at(-1);
      await fs.copyFile(sourcePath, outputPath);
      if (control.preparedSize !== null) await fs.truncate(outputPath, control.preparedSize);
      return { stdout: "", stderr: "" };
    }
    const outputDir = args[args.indexOf("--output-dir") + 1];
    const image = args[args.indexOf("--image") + 1];
    const name = args[args.indexOf("--name") + 1];
    const tagline = args[args.indexOf("--tagline") + 1];
    const quote = args[args.indexOf("--quote") + 1];
    const accent = args[args.indexOf("--accent") + 1];
    const secondary = args[args.indexOf("--secondary") + 1];
    const highlight = args[args.indexOf("--highlight") + 1];
    await fs.writeFile(path.join(outputDir, "theme.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "fixture",
      name,
      tagline,
      quote,
      image,
      colors: { accent, secondary, highlight },
    })}\n`, { mode: 0o600 });
    return { stdout: "", stderr: "" };
  };
  const store = createThemeStore({
    stateRoot,
    projectRoot,
    nodePath: "/signed/node",
    runFile,
    now: () => new Date("2026-07-19T15:30:00Z"),
    randomHex: () => "a1b2c3d4",
  });
  return { root, stateRoot, projectRoot, store, control };
}

test("saves, lists, and atomically activates a Unicode theme", async (t) => {
  const { store } = await fixtureStore(t);
  const saved = await store.saveTheme({ bytes: jpegBytes(), fields: validFields("海边主题") });
  assert.equal(saved.id, "img-20260719153000-a1b2c3d4");
  assert.equal(saved.name, "海边主题");
  assert.equal(saved.imageUrl, "/api/themes/img-20260719153000-a1b2c3d4/image");
  assert.equal(saved.active, false);
  assert.equal(saved.bundled, false);

  await store.activateTheme(saved.id);
  assert.equal((await store.activeTheme()).name, "海边主题");
  const themes = await store.listThemes();
  assert.equal(themes[0].id, "demo");
  assert.equal(themes.filter((theme) => theme.active).length, 1);
  assert.equal(themes.find((theme) => theme.id === saved.id).active, true);
});

test("lists saved themes newest first", async (t) => {
  const fixture = await fixtureStore(t);
  const first = await fixture.store.saveTheme({ bytes: jpegBytes(), fields: validFields("A") });
  const firstPath = path.join(fixture.stateRoot, "themes", first.id, "theme.json");
  const firstJson = JSON.parse(await fs.readFile(firstPath, "utf8"));
  firstJson.createdAt = "2026-07-18T15:30:00.000Z";
  await fs.writeFile(firstPath, `${JSON.stringify(firstJson)}\n`);

  fixture.store = createThemeStore({
    stateRoot: fixture.stateRoot,
    projectRoot: fixture.projectRoot,
    nodePath: "/signed/node",
    runFile: async (file, args) => {
      if (file === "/usr/bin/sips") return fs.copyFile(args.at(-3), args.at(-1));
      const outputDir = args[args.indexOf("--output-dir") + 1];
      await fs.writeFile(path.join(outputDir, "theme.json"), JSON.stringify({
        schemaVersion: 1,
        id: "fixture",
        name: "B",
        tagline: "测试口号",
        quote: "BUILD",
        image: "background.jpg",
        colors: { accent: "#7cff46", secondary: "#36d7e8", highlight: "#642a8c" },
      }));
    },
    now: () => new Date("2026-07-19T15:31:00Z"),
    randomHex: () => "b1c2d3e4",
  });
  const second = await fixture.store.saveTheme({ bytes: jpegBytes(), fields: validFields("B") });
  const ids = (await fixture.store.listThemes()).filter((theme) => !theme.bundled).map((theme) => theme.id);
  assert.deepEqual(ids, [second.id, first.id]);
});

test("failed preparation leaves the active theme unchanged and cleans incoming files", async (t) => {
  const { store, control, stateRoot } = await fixtureStore(t);
  const first = await store.saveTheme({ bytes: jpegBytes(), fields: validFields("旧主题") });
  await store.activateTheme(first.id);
  control.failure = new Error("sips failed");
  await assert.rejects(store.saveTheme({ bytes: pngBytes(), fields: validFields("新主题") }), /sips failed/);
  assert.equal((await store.activeTheme()).id, first.id);
  const names = await fs.readdir(path.join(stateRoot, "themes"));
  assert.equal(names.some((name) => name.startsWith(".incoming-")), false);
});

test("rejects empty, unsupported, source-too-large, and prepared-too-large images", async (t) => {
  const { store, control } = await fixtureStore(t);
  await assert.rejects(store.saveTheme({ bytes: Buffer.alloc(0), fields: validFields("empty") }), /empty/i);
  await assert.rejects(store.saveTheme({ bytes: Buffer.from("hello"), fields: validFields("bad") }), /unsupported image/i);
  await assert.rejects(
    store.saveTheme({ bytes: Buffer.alloc(LIMITS.sourceImageBytes + 1), fields: validFields("large") }),
    /larger than 50 MB/i,
  );
  control.preparedSize = LIMITS.preparedImageBytes + 1;
  await assert.rejects(store.saveTheme({ bytes: jpegBytes(), fields: validFields("prepared") }), /larger than 16 MB/i);
});

test("refuses to delete the active theme and deletes inactive themes", async (t) => {
  const { store, stateRoot } = await fixtureStore(t);
  const first = await store.saveTheme({ bytes: jpegBytes(), fields: validFields("first") });
  await store.activateTheme(first.id);
  await assert.rejects(store.deleteTheme(first.id), (error) => error.code === "conflict");

  const secondStore = createThemeStore({
    stateRoot,
    projectRoot: path.join(path.dirname(stateRoot), "project"),
    nodePath: "/signed/node",
    runFile: async () => {},
    now: () => new Date("2026-07-19T15:31:00Z"),
    randomHex: () => "b1c2d3e4",
  });
  const secondDir = path.join(stateRoot, "themes", "img-20260719153100-b1c2d3e4");
  await fs.cp(path.join(stateRoot, "themes", first.id), secondDir, { recursive: true });
  const secondTheme = JSON.parse(await fs.readFile(path.join(secondDir, "theme.json"), "utf8"));
  secondTheme.id = "img-20260719153100-b1c2d3e4";
  await fs.writeFile(path.join(secondDir, "theme.json"), JSON.stringify(secondTheme));
  await secondStore.deleteTheme(secondTheme.id);
  await assert.rejects(fs.access(secondDir));
});

test("demo reset removes the active user theme without deleting saved themes", async (t) => {
  const { store, stateRoot } = await fixtureStore(t);
  const saved = await store.saveTheme({ bytes: jpegBytes(), fields: validFields("saved") });
  await store.activateTheme(saved.id);
  await store.applyDemo();
  assert.equal((await store.activeTheme()).id, "demo");
  await fs.access(path.join(stateRoot, "themes", saved.id, "theme.json"));
});

test("rejects symlinked theme directories and resolves regular images", async (t) => {
  const { store, stateRoot } = await fixtureStore(t);
  const saved = await store.saveTheme({ bytes: jpegBytes(), fields: validFields("saved") });
  const resolved = await store.resolveThemeImage(saved.id);
  assert.equal(resolved.contentType, "image/jpeg");
  assert.equal(path.basename(resolved.path), "background.jpg");

  const linkedId = "img-20260719153200-c1d2e3f4";
  await fs.symlink(path.join(stateRoot, "themes", saved.id), path.join(stateRoot, "themes", linkedId));
  await assert.rejects(store.activateTheme(linkedId), /symbolic link/i);
});
