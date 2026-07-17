import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "..");
const schemaPath = path.join(repositoryRoot, "schemas", "theme-v1.schema.json");
const fixturePath = path.join(
  repositoryRoot,
  "tests",
  "fixtures",
  "theme-contract",
  "cases.json",
);
const loaders = [
  {
    name: "macOS",
    script: path.join(repositoryRoot, "macos", "scripts", "injector.mjs"),
  },
  {
    name: "Windows",
    script: path.join(repositoryRoot, "windows", "scripts", "injector.mjs"),
  },
];
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function runLoader(loader, themeDirectory) {
  const result = spawnSync(
    process.execPath,
    [loader.script, "--check-payload", "--theme-dir", themeDirectory],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  return result;
}

function parseAcceptedOutput(loader, fixtureName, result) {
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    assert.fail(
      `${loader.name} returned invalid JSON for ${fixtureName}:\n${result.stdout}\n${result.stderr}`,
    );
  }
}

async function writeFixture(directory, fixture) {
  const { theme } = fixture;
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`);
  const image = theme && !Array.isArray(theme) ? theme.image : null;
  if (
    fixture.writeImage !== false
    && typeof image === "string"
    && !/[<>:"/\\|?*]/u.test(image)
    && image !== "theme.json"
  ) {
    await fs.writeFile(path.join(directory, image), tinyPng);
  }
}

test("theme-v1 schema exposes the portable core and extension seam", async () => {
  const schema = await readJson(schemaPath);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.deepEqual(schema.required, ["schemaVersion", "image"]);
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.deepEqual(schema.properties.appearance.enum, ["auto", "light", "dark"]);
  assert.deepEqual(
    schema.properties.art.properties.safeArea.enum,
    ["auto", "left", "right", "center", "none"],
  );
  assert.deepEqual(
    schema.properties.art.properties.taskMode.enum,
    ["auto", "ambient", "banner", "off"],
  );
  assert.equal(schema.additionalProperties, true);
  assert.equal(schema.properties.art.additionalProperties, true);
  const imagePattern = new RegExp(schema.properties.image.pattern, "u");
  assert.equal(imagePattern.test("background.WEBP"), true);
  assert.equal(imagePattern.test("CON.png"), false);
});

test("macOS and Windows loaders share one portable fixture matrix", async (context) => {
  const fixtures = await readJson(fixturePath);
  assert.equal(fixtures.fixtureVersion, 1);
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-contract-"));
  try {
    for (const fixture of fixtures.cases) {
      await context.test(fixture.name, async () => {
        const themeDirectory = path.join(temporaryRoot, fixture.name);
        await writeFixture(themeDirectory, fixture);
        const accepted = [];
        for (const loader of loaders) {
          const result = runLoader(loader, themeDirectory);
          const didAccept = result.status === 0;
          assert.equal(
            didAccept,
            fixture.accept,
            `${loader.name} acceptance mismatch for ${fixture.name}:\n${result.stderr || result.stdout}`,
          );
          if (!didAccept && fixture.errorPattern) {
            assert.match(
              `${result.stderr}\n${result.stdout}`,
              new RegExp(fixture.errorPattern, "u"),
              `${loader.name} rejected ${fixture.name} for the wrong reason`,
            );
          }
          if (didAccept) {
            const output = parseAcceptedOutput(loader, fixture.name, result);
            assert.equal(output.pass, true);
            assert.deepEqual(output.portableTheme, fixture.portableTheme);
            accepted.push(output.portableTheme);
          }
        }
        if (fixture.accept) assert.deepEqual(accepted[0], accepted[1]);
      });
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("every bundled descriptor is portable across both loaders", async (context) => {
  const bundled = [
    path.join(repositoryRoot, "macos", "assets"),
    path.join(repositoryRoot, "windows", "assets"),
  ];
  const presetRoot = path.join(repositoryRoot, "macos", "presets");
  for (const entry of await fs.readdir(presetRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("preset-")) {
      bundled.push(path.join(presetRoot, entry.name));
    }
  }

  for (const themeDirectory of bundled) {
    const label = path.relative(repositoryRoot, themeDirectory);
    await context.test(label, () => {
      const portableThemes = [];
      for (const loader of loaders) {
        const result = runLoader(loader, themeDirectory);
        assert.equal(
          result.status,
          0,
          `${loader.name} rejected ${label}:\n${result.stderr || result.stdout}`,
        );
        portableThemes.push(parseAcceptedOutput(loader, label, result).portableTheme);
      }
      assert.deepEqual(portableThemes[0], portableThemes[1]);
    });
  }
});
