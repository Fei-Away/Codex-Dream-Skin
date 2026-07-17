import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const previewScript = path.join(macosRoot, "scripts", "theme-preview.mjs");
const activeAsset = path.join(macosRoot, "assets", "portal-hero.png");
const activeConfig = path.join(macosRoot, "assets", "theme.json");
const candidatePreset = path.join(macosRoot, "presets", "preset-gothic-void-crusade");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-dream-skin-preview-"));
const stateRoot = path.join(tempRoot, "state");
const activeDir = path.join(stateRoot, "theme");
const themesDir = path.join(stateRoot, "themes");
const candidateDir = path.join(themesDir, "preset-gothic-void-crusade");
const transactionDir = path.join(stateRoot, "theme-preview");

function runPreview(action, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      previewScript,
      action,
      "--state-root",
      stateRoot,
      ...extraArgs,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `theme-preview exited with ${code}`));
    });
  });
}

async function seedActiveTheme() {
  await fs.rm(activeDir, { recursive: true, force: true });
  await fs.mkdir(activeDir, { recursive: true });
  await fs.copyFile(activeAsset, path.join(activeDir, "portal-hero.png"));
  await fs.copyFile(activeConfig, path.join(activeDir, "theme.json"));
}

async function readActive() {
  const theme = JSON.parse(await fs.readFile(path.join(activeDir, "theme.json"), "utf8"));
  const image = await fs.readFile(path.join(activeDir, theme.image));
  return { theme, image };
}

try {
  await fs.mkdir(themesDir, { recursive: true });
  await fs.cp(candidatePreset, candidateDir, { recursive: true });
  await seedActiveTheme();
  const original = await readActive();

  await runPreview("begin", [
    "--source",
    candidateDir,
    "--owner-pid",
    String(process.pid),
    "--owner-started-at",
    "test-owner",
  ]);
  assert.equal((await readActive()).theme.id, "preset-gothic-void-crusade");
  assert.equal((await fs.stat(path.join(transactionDir, "backup", "theme.json"))).isFile(), true);
  assert.equal((await fs.stat(path.join(transactionDir, "candidate", "theme.json"))).isFile(), true);

  await runPreview("cancel");
  const restored = await readActive();
  assert.equal(restored.theme.id, original.theme.id);
  assert.deepEqual(restored.image, original.image);
  await assert.rejects(fs.stat(transactionDir), { code: "ENOENT" });

  await runPreview("begin", [
    "--source",
    candidateDir,
    "--owner-pid",
    String(process.pid),
    "--owner-started-at",
    "test-owner",
  ]);
  await runPreview("commit");
  assert.equal((await readActive()).theme.id, "preset-gothic-void-crusade");
  await assert.rejects(fs.stat(transactionDir), { code: "ENOENT" });

  await seedActiveTheme();
  const invalidDir = path.join(themesDir, "invalid-preview");
  await fs.mkdir(invalidDir);
  await fs.writeFile(
    path.join(invalidDir, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: "invalid-preview", image: "missing.png" })}\n`,
  );
  await assert.rejects(
    runPreview("begin", [
      "--source",
      invalidDir,
      "--owner-pid",
      String(process.pid),
      "--owner-started-at",
      "test-owner",
    ]),
    /Theme image|ENOENT/,
  );
  assert.equal((await readActive()).theme.id, original.theme.id);
  await assert.rejects(fs.stat(transactionDir), { code: "ENOENT" });

  console.log("PASS: macOS theme preview keeps, cancels, recovers, and rejects invalid candidates.");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
