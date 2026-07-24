import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const publisher = path.join(macosRoot, "scripts", "publish-theme-import.mjs");
const fixtureImage = path.join(macosRoot, "assets", "portal-hero.png");
const tempRoot = await fs.mkdtemp(path.join("/tmp", "codex-dream-skin-publish-"));
const themesRoot = path.join(tempRoot, "themes");
const activeRoot = path.join(tempRoot, "theme");

function publish(stage, destinationRoot = themesRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [publisher, stage, destinationRoot], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(JSON.parse(stdout));
      else reject(new Error(stderr || `publisher exited with ${code}`));
    });
  });
}

async function makeStage(name, id, extra = {}) {
  const stage = path.join(tempRoot, name);
  await fs.mkdir(stage);
  await fs.copyFile(fixtureImage, path.join(stage, "background.png"));
  await fs.writeFile(
    path.join(stage, "theme.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      id,
      name: extra.displayName ?? "Imported Theme",
      image: "background.png",
      appearance: "auto",
      art: { safeArea: "auto", taskMode: "auto" },
      ...extra.theme,
    }, null, 2)}\n`,
  );
  return stage;
}

try {
  await fs.mkdir(themesRoot);
  await fs.mkdir(activeRoot);
  await fs.writeFile(path.join(activeRoot, "last-known-good"), "unchanged\n");

  const firstStage = await makeStage("first", "theme-id");
  const first = await publish(firstStage);
  assert.deepEqual(first, {
    status: "imported",
    id: "theme-id",
    name: "Imported Theme",
    renamed: false,
    nameCollision: false,
    packageFormat: "simple",
    cssIgnored: false,
    signatureIgnored: false,
  });
  assert.equal(await fs.readFile(path.join(activeRoot, "last-known-good"), "utf8"), "unchanged\n");

  const duplicateStage = await makeStage("duplicate", "different-package-id");
  const duplicate = await publish(duplicateStage);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.id, "theme-id");
  assert.equal((await fs.readdir(themesRoot)).filter((name) => !name.startsWith(".")).length, 1);

  const collisionStage = await makeStage("collision", "theme-id", { displayName: "Second Theme" });
  const collision = await publish(collisionStage);
  assert.equal(collision.status, "imported");
  assert.equal(collision.id, "theme-id-2");
  assert.equal(collision.renamed, true);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(themesRoot, "theme-id-2", "theme.json"), "utf8")).id,
    "theme-id-2",
  );

  const nameCollisionStage = await makeStage("name-collision", "third-id", {
    theme: { quote: "DIFFERENT CONTENT" },
  });
  const nameCollision = await publish(nameCollisionStage);
  assert.equal(nameCollision.status, "imported");
  assert.equal(nameCollision.nameCollision, true);

  const unsafeIdStage = await makeStage("unsafe-id", "../../escape", {
    displayName: "Unsafe ID Theme",
  });
  const unsafeId = await publish(unsafeIdStage);
  assert.match(unsafeId.id, /^import-[0-9a-f]{12}$/);
  assert.equal(path.dirname(path.join(themesRoot, unsafeId.id)), themesRoot);

  const linkedStageTarget = await makeStage("linked-stage-target", "linked-stage");
  const linkedStageRoot = path.join(tempRoot, "linked-stage-root");
  await fs.symlink(linkedStageTarget, linkedStageRoot);
  await assert.rejects(publish(linkedStageRoot), /Theme import stage must be a real directory/);

  const linkedThemesTarget = path.join(tempRoot, "linked-themes-target");
  const linkedThemesRoot = path.join(tempRoot, "linked-themes-root");
  await fs.mkdir(linkedThemesTarget);
  await fs.symlink(linkedThemesTarget, linkedThemesRoot);
  await assert.rejects(
    publish(linkedStageTarget, linkedThemesRoot),
    /Saved themes root must be a real directory/,
  );
  assert.deepEqual(await fs.readdir(linkedThemesTarget), []);

  const linkedStage = path.join(tempRoot, "linked");
  await fs.mkdir(linkedStage);
  await fs.writeFile(
    path.join(linkedStage, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: "linked", image: "background.png" })}\n`,
  );
  await fs.symlink(fixtureImage, path.join(linkedStage, "background.png"));
  await assert.rejects(publish(linkedStage), /symbolic link/);

  const badSchema = await makeStage("bad-schema", "bad-schema");
  const badConfig = JSON.parse(await fs.readFile(path.join(badSchema, "theme.json"), "utf8"));
  badConfig.schemaVersion = 2;
  await fs.writeFile(path.join(badSchema, "theme.json"), `${JSON.stringify(badConfig)}\n`);
  await assert.rejects(publish(badSchema), /schemaVersion 1/);

  assert.equal(await fs.readFile(path.join(activeRoot, "last-known-good"), "utf8"), "unchanged\n");
  console.log("PASS: imported themes publish atomically with duplicate and collision handling.");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
