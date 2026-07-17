import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const fixtureRoot = path.join(repoRoot, "schemas", "fixtures", "theme-v1");
const schemaPath = path.join(repoRoot, "schemas", "theme-v1.schema.json");
const sourceImage = path.join(repoRoot, "macos", "presets", "preset-romantic-rose", "background.jpg");
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-theme-contract-"));
const loaders = [
  { name: "macOS", path: path.join(repoRoot, "macos", "scripts", "injector.mjs") },
  { name: "Windows", path: path.join(repoRoot, "windows", "scripts", "injector.mjs") },
];

const runLoader = (loader, themeDirectory) => spawnSync(
  process.execPath,
  [loader.path, "--check-payload", "--theme-dir", themeDirectory],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);

const findThemeFiles = async (directory) => {
  const found = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await findThemeFiles(candidate));
    else if (entry.isFile() && entry.name === "theme.json") found.push(candidate);
  }
  return found;
};

try {
  const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert(schema.required.includes("schemaVersion"));
  assert(schema.required.includes("image"));
  assert.equal(schema.additionalProperties, true);
  assert(schema.properties.palette);
  assert(schema.properties.extensions);
  new RegExp(schema.properties.image.pattern);
  new RegExp(schema.$defs.cssColor.pattern);

  const manifest = JSON.parse(await fs.readFile(path.join(fixtureRoot, "manifest.json"), "utf8"));
  assert(manifest.length >= 15, "Portable contract matrix is unexpectedly small");

  for (const entry of manifest) {
    const fixtureText = await fs.readFile(path.join(fixtureRoot, entry.file), "utf8");
    const caseRoot = path.join(temporaryRoot, path.basename(entry.file, ".json"));
    const themeDirectory = path.join(caseRoot, "theme");
    await fs.mkdir(themeDirectory, { recursive: true });
    await fs.writeFile(path.join(themeDirectory, "theme.json"), fixtureText);

    let fixture;
    try { fixture = JSON.parse(fixtureText); } catch {}
    if (fixture && !Array.isArray(fixture) && typeof fixture.image === "string") {
      const candidate = path.resolve(themeDirectory, fixture.image);
      const portableAbsolute = path.isAbsolute(fixture.image) || /^[A-Za-z]:[\\/]/.test(fixture.image);
      if (!portableAbsolute) {
        await fs.mkdir(path.dirname(candidate), { recursive: true });
        await fs.copyFile(sourceImage, candidate);
      }
    }

    const outputs = [];
    for (const loader of loaders) {
      const result = runLoader(loader, themeDirectory);
      const accepted = result.status === 0;
      assert.equal(
        accepted,
        entry.accepted,
        `${loader.name} disagreed with ${entry.file}: ${result.stderr || result.stdout}`,
      );
      if (!accepted) continue;
      const output = JSON.parse(result.stdout);
      assert.equal(output.schemaVersion, 1, `${loader.name} did not normalize schemaVersion`);
      if (entry.palette) {
        assert.deepEqual(output.palette, fixture.palette);
        assert.deepEqual(output.resolvedPalette, fixture.palette);
      }
      if (entry.extensions) assert.deepEqual(output.extensionNamespaces, entry.extensions);
      outputs.push(output);
    }
    if (entry.accepted) {
      assert.equal(outputs.length, loaders.length);
      assert.deepEqual(outputs[0].palette, outputs[1].palette, `${entry.file} palette drifted`);
      assert.deepEqual(
        outputs[0].extensionNamespaces,
        outputs[1].extensionNamespaces,
        `${entry.file} extension namespaces drifted`,
      );
    }
  }

  const bundledGroups = [
    { loader: loaders[0], roots: [path.join(repoRoot, "macos", "assets"), path.join(repoRoot, "macos", "presets")] },
    { loader: loaders[1], roots: [path.join(repoRoot, "windows", "assets")] },
  ];
  let bundledCount = 0;
  for (const group of bundledGroups) {
    for (const directory of group.roots) {
      for (const themePath of await findThemeFiles(directory)) {
        const descriptor = JSON.parse(await fs.readFile(themePath, "utf8"));
        assert.equal(descriptor.schemaVersion, 1, `${themePath} is not an authored v1 theme`);
        const result = runLoader(group.loader, path.dirname(themePath));
        assert.equal(result.status, 0, `${themePath} failed ${group.loader.name}: ${result.stderr}`);
        bundledCount += 1;
      }
    }
  }
  assert(bundledCount >= 8, "Bundled theme coverage is unexpectedly small");

  console.log(
    `PASS: ${manifest.length} shared portable-theme fixtures matched on both loaders; ` +
    `${bundledCount} bundled themes remain valid.`,
  );
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
