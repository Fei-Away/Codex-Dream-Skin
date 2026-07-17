import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(here, "..");
const injector = path.join(windowsRoot, "scripts", "injector.mjs");
const sourceImage = path.join(windowsRoot, "assets", "dream-reference.jpg");
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-split-theme-"));

const runPayloadCheck = (themeDirectory) => spawnSync(
  process.execPath,
  [injector, "--check-payload", "--theme-dir", themeDirectory],
  { encoding: "utf8" },
);

try {
  const validTheme = path.join(temporaryRoot, "valid");
  await fs.mkdir(validTheme);
  await fs.copyFile(sourceImage, path.join(validTheme, "workspace.jpg"));
  await fs.copyFile(sourceImage, path.join(validTheme, "sidebar.jpg"));
  await fs.writeFile(path.join(validTheme, "theme.json"), JSON.stringify({
    id: "split-test",
    image: "workspace.jpg",
    sidebarImage: "sidebar.jpg",
    appearance: "auto",
    art: { safeArea: "auto", taskMode: "auto" },
  }));

  const valid = runPayloadCheck(validTheme);
  assert.equal(valid.status, 0, valid.stderr);
  const validPayload = JSON.parse(valid.stdout);
  assert.equal(validPayload.sidebarImage, "sidebar.jpg");

  const sharedImageTheme = path.join(temporaryRoot, "shared-image");
  await fs.mkdir(sharedImageTheme);
  await fs.copyFile(sourceImage, path.join(sharedImageTheme, "shared.jpg"));
  await fs.writeFile(path.join(sharedImageTheme, "theme.json"), JSON.stringify({
    id: "shared-image",
    image: "shared.jpg",
    sidebarImage: "shared.jpg",
  }));
  const shared = runPayloadCheck(sharedImageTheme);
  assert.equal(shared.status, 0, shared.stderr);
  const sharedPayload = JSON.parse(shared.stdout);
  assert.equal(sharedPayload.sidebarImage, "shared.jpg");
  assert.equal(validPayload.artMetadata.width, 2560);
  assert.equal(validPayload.sidebarArtMetadata.height, 1440);

  const outsideImage = path.join(temporaryRoot, "outside.jpg");
  await fs.copyFile(sourceImage, outsideImage);
  await fs.writeFile(path.join(validTheme, "theme.json"), JSON.stringify({
    id: "escape-test",
    image: "workspace.jpg",
    sidebarImage: "../outside.jpg",
  }));
  const escaped = runPayloadCheck(validTheme);
  assert.notEqual(escaped.status, 0);
  assert.match(escaped.stderr, /Sidebar image must remain inside/i);

  const oversizedTheme = path.join(temporaryRoot, "combined-oversized");
  await fs.mkdir(oversizedTheme);
  for (const name of ["workspace.jpg", "sidebar.jpg"]) {
    const target = path.join(oversizedTheme, name);
    await fs.copyFile(sourceImage, target);
    await fs.truncate(target, 9 * 1024 * 1024);
  }
  await fs.writeFile(path.join(oversizedTheme, "theme.json"), JSON.stringify({
    id: "combined-oversized",
    image: "workspace.jpg",
    sidebarImage: "sidebar.jpg",
  }));
  const oversized = runPayloadCheck(oversizedTheme);
  assert.notEqual(oversized.status, 0);
  assert.match(oversized.stderr, /Combined theme images exceed the 16 MB limit/i);

  console.log("PASS: split themes validate both images, reject traversal, and enforce a combined budget.");
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
