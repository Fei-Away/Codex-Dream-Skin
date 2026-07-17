import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePackageEntries, validateSource } from "../lib/theme-package/validate-source.mjs";
import { readStrictZip } from "../lib/theme-package/zip.mjs";
import { jsonSchemaErrors } from "./json-schema-subset.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const example = path.join(root, "examples", "theme-package", "kimi-sakura-dawn");
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-schema-parity-"));
const [sourceSchema, packageSchema, themeSchema] = await Promise.all([
  "dreamskin-source-manifest.schema.json",
  "dreamskin-manifest.schema.json",
  "dreamskin-theme.schema.json",
].map(async (name) => JSON.parse(await fs.readFile(path.join(root, "schemas", name), "utf8"))));

async function sourceFixture(name, mutate) {
  const directory = path.join(temporaryRoot, name);
  await fs.cp(example, directory, { recursive: true });
  const manifestPath = path.join(directory, "manifest.json");
  const themePath = path.join(directory, "theme.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const theme = JSON.parse(await fs.readFile(themePath, "utf8"));
  mutate(manifest, theme);
  await Promise.all([
    fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    fs.writeFile(themePath, `${JSON.stringify(theme, null, 2)}\n`, "utf8"),
  ]);
  return { directory, manifest, theme };
}

try {
  const validManifest = JSON.parse(await fs.readFile(path.join(example, "manifest.json"), "utf8"));
  const validTheme = JSON.parse(await fs.readFile(path.join(example, "theme.json"), "utf8"));
  assert.deepEqual(jsonSchemaErrors(sourceSchema, validManifest), []);
  assert.deepEqual(jsonSchemaErrors(themeSchema, validTheme), []);

  const cases = [
    {
      name: "control-name",
      code: "MANIFEST_FIELD_INVALID",
      mutate(manifest, theme) {
        manifest.name = "bad\nname";
        theme.name = manifest.name;
      },
    },
    {
      name: "ftp-author",
      code: "MANIFEST_FIELD_INVALID",
      mutate(manifest) {
        manifest.author.url = "ftp://example.com/theme";
      },
    },
    {
      name: "credential-author",
      code: "MANIFEST_FIELD_INVALID",
      mutate(manifest) {
        manifest.author.url = "https://user:secret@example.com/theme";
      },
    },
  ];
  for (const fixtureCase of cases) {
    const fixture = await sourceFixture(fixtureCase.name, fixtureCase.mutate);
    assert.notDeepEqual(jsonSchemaErrors(sourceSchema, fixture.manifest), [], fixtureCase.name);
    await assert.rejects(validateSource(fixture.directory), (error) => error.code === fixtureCase.code);
  }

  const uppercaseHttp = await sourceFixture("uppercase-http", (manifest) => {
    manifest.author.url = "HTTP://example.com/theme";
  });
  assert.deepEqual(jsonSchemaErrors(sourceSchema, uppercaseHttp.manifest), []);
  assert.equal((await validateSource(uppercaseHttp.directory)).pass, true);

  const goldenBytes = await fs.readFile(path.join(root, "examples", "theme-package", "kimi-sakura-dawn.dreamskin"));
  const entries = readStrictZip(goldenBytes);
  const packagedManifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
  assert.deepEqual(jsonSchemaErrors(packageSchema, packagedManifest), []);
  const oversizedPreview = Buffer.alloc(4 * 1024 * 1024 + 1);
  packagedManifest.resources.preview = {
    path: "assets/preview.png",
    mediaType: "image/png",
    bytes: oversizedPreview.length,
    sha256: createHash("sha256").update(oversizedPreview).digest("hex"),
  };
  const oversizedEntries = new Map(entries);
  oversizedEntries.set("manifest.json", Buffer.from(`${JSON.stringify(packagedManifest)}\n`, "utf8"));
  oversizedEntries.set("assets/preview.png", oversizedPreview);
  assert.notDeepEqual(jsonSchemaErrors(packageSchema, packagedManifest), []);
  await assert.rejects(
    validatePackageEntries(oversizedEntries),
    (error) => error.code === "ASSET_FILE_INVALID",
  );
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log("PASS: shared invalid fixtures agree between JSON Schemas and runtime validators.");
