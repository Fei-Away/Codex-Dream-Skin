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

async function writeTheme(root, image) {
  await fs.writeFile(path.join(root, "theme.json"), `${JSON.stringify({
    schemaVersion: 1,
    id: "path-containment-fixture",
    name: "Path containment fixture",
    image,
  }, null, 2)}\n`);
}

test("an in-directory image name beginning with two dots is not mistaken for traversal", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-dot-image."));
  try {
    const imageName = "..hero.jpg";
    await fs.copyFile(sourceImage, path.join(root, imageName));
    await writeTheme(root, imageName);

    const loaded = await loadTheme(root);
    assert.equal(loaded.theme.image, imageName);
    assert.equal(loaded.imagePath, await fs.realpath(path.join(root, imageName)));
    assert.ok(loaded.imageBytes.length > 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("real parent-directory traversal remains rejected", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-parent-traversal."));
  const root = path.join(parent, "theme");
  try {
    await fs.mkdir(root);
    await fs.copyFile(sourceImage, path.join(parent, "outside.jpg"));
    await writeTheme(root, `..${path.sep}outside.jpg`);

    await assert.rejects(
      loadTheme(root),
      /must remain inside the selected theme directory/,
    );
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
