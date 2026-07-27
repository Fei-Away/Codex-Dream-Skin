import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const stageScript = path.join(macosRoot, "scripts", "stage-theme.mjs");
const fixtureAsset = path.join(macosRoot, "assets", "portal-hero.png");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-dream-skin-stage-"));

function mp4Fixture(marker) {
  const fileTypeBox = Buffer.alloc(24);
  fileTypeBox.writeUInt32BE(fileTypeBox.length, 0);
  fileTypeBox.write("ftyp", 4, "ascii");
  fileTypeBox.write("isom", 8, "ascii");
  fileTypeBox.writeUInt32BE(512, 12);
  fileTypeBox.write("isom", 16, "ascii");
  fileTypeBox.write("mp41", 20, "ascii");
  return Buffer.concat([fileTypeBox, Buffer.from(marker, "ascii")]);
}

function runStage(source, stage) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [stageScript, source, stage], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `stage-theme exited with ${code}`));
    });
  });
}

try {
  const source = path.join(tempRoot, "themes", "preset-race");
  const stage = path.join(tempRoot, "stage");
  await fs.mkdir(source, { recursive: true });
  await fs.mkdir(stage);
  await fs.copyFile(fixtureAsset, path.join(source, "background-a.png"));
  await fs.writeFile(
    path.join(source, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: "preset-race", name: "A", image: "background-a.png" })}\n`,
  );

  const stagedIdentity = JSON.parse(await runStage(source, stage));
  assert.equal(stagedIdentity.image, "background-a.png");
  assert.match(stagedIdentity.contentFingerprint, /^[0-9a-f]{64}$/);
  const stagedConfig = JSON.parse(await fs.readFile(path.join(stage, "theme.json"), "utf8"));
  assert.equal(stagedConfig.image, "background-a.png");
  const stagedBeforeMutation = await fs.readFile(path.join(stage, "background-a.png"));

  // A source edit after staging must not change the pair that is about to be
  // published. This is the regression for switch-theme's old copy-after-
  // validation TOCTOU window.
  await fs.copyFile(fixtureAsset, path.join(source, "background-b.png"));
  await fs.writeFile(
    path.join(source, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: "preset-race", name: "B", image: "background-b.png" })}\n`,
  );
  await fs.writeFile(path.join(source, "background-a.png"), Buffer.from("changed-after-stage"));
  assert.deepEqual(await fs.readFile(path.join(stage, "background-a.png")), stagedBeforeMutation);
  assert.equal(JSON.parse(await fs.readFile(path.join(stage, "theme.json"), "utf8")).name, "A");

  const secondStage = path.join(tempRoot, "stage-second");
  await fs.mkdir(secondStage);
  const secondIdentity = JSON.parse(await runStage(stage, secondStage));
  assert.equal(secondIdentity.contentFingerprint, stagedIdentity.contentFingerprint);
  await fs.writeFile(
    path.join(stage, "theme.css"),
    '[data-ds-part="root"] { color: var(--ds-theme-color-text); }\n',
  );
  const cssStage = path.join(tempRoot, "stage-css");
  await fs.mkdir(cssStage);
  const cssIdentity = JSON.parse(await runStage(stage, cssStage));
  assert.notEqual(cssIdentity.contentFingerprint, stagedIdentity.contentFingerprint);

  const videoSource = path.join(tempRoot, "video-source");
  const videoStage = path.join(tempRoot, "video-stage");
  await fs.mkdir(videoSource);
  await fs.mkdir(videoStage);
  await fs.copyFile(fixtureAsset, path.join(videoSource, "background.png"));
  await fs.writeFile(path.join(videoSource, "background.mp4"), mp4Fixture("stage"));
  await fs.writeFile(
    path.join(videoSource, "theme.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      id: "video-stage",
      image: "background.png",
      video: "background.mp4",
    })}\n`,
  );
  const videoIdentity = JSON.parse(await runStage(videoSource, videoStage));
  assert.equal(videoIdentity.video, "background.mp4");
  assert.deepEqual(
    await fs.readFile(path.join(videoStage, "background.mp4")),
    mp4Fixture("stage"),
  );

  await fs.writeFile(path.join(videoSource, "background.mp4"), Buffer.from("renamed-as-mp4"));
  const invalidVideoStage = path.join(tempRoot, "invalid-video-stage");
  await fs.mkdir(invalidVideoStage);
  await assert.rejects(runStage(videoSource, invalidVideoStage), /not a valid MP4 container/);

  const outside = path.join(tempRoot, "outside.png");
  await fs.copyFile(fixtureAsset, outside);
  const traversal = path.join(tempRoot, "traversal");
  await fs.mkdir(traversal);
  await fs.writeFile(
    path.join(traversal, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: "bad", image: "../outside.png" })}\n`,
  );
  const traversalStage = path.join(tempRoot, "traversal-stage");
  await fs.mkdir(traversalStage);
  await assert.rejects(runStage(traversal, traversalStage), /inside its theme directory/);

  const symlink = path.join(tempRoot, "symlink");
  await fs.mkdir(symlink);
  let symlinkCreated = false;
  try {
    await fs.symlink(outside, path.join(symlink, "background.png"));
    symlinkCreated = true;
  } catch (error) {
    if (process.platform !== "win32" || error?.code !== "EPERM") throw error;
    console.log("SKIP: Windows host does not grant symbolic-link creation; macOS/CI retains this assertion.");
  }
  if (symlinkCreated) {
    await fs.writeFile(
      path.join(symlink, "theme.json"),
      `${JSON.stringify({ schemaVersion: 1, id: "bad-link", image: "background.png" })}\n`,
    );
    const symlinkStage = path.join(tempRoot, "symlink-stage");
    await fs.mkdir(symlinkStage);
    await assert.rejects(runStage(symlink, symlinkStage), /symbolic link/);
  }

  console.log("PASS: theme staging snapshots a matched pair and binds it to a stable content fingerprint.");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
