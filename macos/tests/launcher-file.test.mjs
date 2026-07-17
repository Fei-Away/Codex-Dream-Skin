import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const helper = path.resolve(here, "../scripts/launcher-file.mjs");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-launcher-test-"));

function run(mode, target, command = undefined, success = true) {
  const args = [helper, mode, target];
  if (command !== undefined) args.push(command);
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status === 0, success, result.stderr || result.stdout);
  return result;
}

try {
  const launcher = path.join(temporary, "Codex Dream Skin.command");
  run("write", launcher, "exec true");
  assert.equal(
    await fs.readFile(launcher, "utf8"),
    "#!/bin/bash\n# CodexDreamSkinStudio launcher\nset -e\nexec true\n",
  );
  if (process.platform !== "win32") {
    assert.equal((await fs.stat(launcher)).mode & 0o777, 0o700);
  }
  run("check", launcher);
  run("write", launcher, "exec false");
  assert.match(await fs.readFile(launcher, "utf8"), /exec false/u);

  const unrelated = path.join(temporary, "unrelated.command");
  await fs.writeFile(unrelated, "#!/bin/bash\necho user-file\n# CodexDreamSkinStudio launcher\n");
  run("write", unrelated, "exec true", false);
  run("remove", unrelated, undefined, false);
  assert.equal(
    await fs.readFile(unrelated, "utf8"),
    "#!/bin/bash\necho user-file\n# CodexDreamSkinStudio launcher\n",
  );

  const sentinel = path.join(temporary, "sentinel.txt");
  const linkedLauncher = path.join(temporary, "linked.command");
  await fs.writeFile(sentinel, "preserve me");
  let symlinkAvailable = true;
  try {
    await fs.symlink(sentinel, linkedLauncher, "file");
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
      symlinkAvailable = false;
    } else {
      throw error;
    }
  }
  if (symlinkAvailable) {
    run("write", linkedLauncher, "exec true", false);
    run("remove", linkedLauncher, undefined, false);
    assert.equal((await fs.lstat(linkedLauncher)).isSymbolicLink(), true);
    assert.equal(await fs.readFile(sentinel, "utf8"), "preserve me");
  }

  run("remove", launcher);
  await assert.rejects(fs.lstat(launcher), { code: "ENOENT" });
  run("check", launcher);
  console.log("PASS: launcher ownership, atomic replacement, symlink rejection, and safe removal");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
