import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadTheme } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(here, "..");
const sourceImage = path.join(windowsRoot, "assets", "dream-reference.jpg");

async function makeTheme(root, schemaVersion, includeSchema = true) {
  await fs.copyFile(sourceImage, path.join(root, "background.jpg"));
  const theme = {
    id: "schema-contract-fixture",
    name: "Schema contract fixture",
    image: "background.jpg",
  };
  if (includeSchema) theme.schemaVersion = schemaVersion;
  await fs.writeFile(path.join(root, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`);
}

async function withTheme(schemaVersion, includeSchema, callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-schema-contract."));
  try {
    await makeTheme(root, schemaVersion, includeSchema);
    await callback(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("Windows runtime accepts and preserves theme schemaVersion 1", async () => {
  await withTheme(1, true, async (root) => {
    const loaded = await loadTheme(root);
    assert.equal(loaded.theme.schemaVersion, 1);
  });
});

test("Windows runtime rejects missing and future theme schema versions", async () => {
  await withTheme(undefined, false, async (root) => {
    await assert.rejects(loadTheme(root), /must use schemaVersion 1/);
  });
  await withTheme(2, true, async (root) => {
    await assert.rejects(loadTheme(root), /must use schemaVersion 1/);
  });
  await withTheme("1", true, async (root) => {
    await assert.rejects(loadTheme(root), /must use schemaVersion 1/);
  });
});
