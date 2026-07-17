import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const writer = path.join(root, "scripts", "write-theme.mjs");
const injector = path.join(root, "scripts", "injector.mjs");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-reset-test-"));

function run(args, success = true) {
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(result.status === 0, success, result.stderr || result.stdout);
  return result;
}

try {
  const theme = path.join(temporary, "theme");
  const unrelated = path.join(temporary, "unrelated-output");
  await fs.mkdir(path.join(theme, "nested"), { recursive: true });
  await fs.mkdir(unrelated);
  await fs.writeFile(path.join(theme, "keep-me"), "preserve");
  await fs.writeFile(path.join(theme, "background-user.jpg"), "preserve");
  await fs.writeFile(path.join(theme, "nested", "keep-me-too"), "preserve");
  await fs.writeFile(path.join(unrelated, "keep-me"), "preserve");

  run([writer, "reset-demo", "--output-dir", theme]);
  assert.deepEqual(
    await fs.readFile(path.join(theme, "theme.json")),
    await fs.readFile(path.join(root, "assets", "theme.json")),
  );
  assert.deepEqual(
    await fs.readFile(path.join(theme, "portal-hero.png")),
    await fs.readFile(path.join(root, "assets", "portal-hero.png")),
  );
  for (const relative of ["keep-me", "background-user.jpg", path.join("nested", "keep-me-too")]) {
    assert.equal(await fs.readFile(path.join(theme, relative), "utf8"), "preserve");
  }
  run([injector, "--check-payload", "--theme-dir", theme]);

  run([writer, "reset-demo", "--output-dir", unrelated], false);
  assert.equal(await fs.readFile(path.join(unrelated, "keep-me"), "utf8"), "preserve");

  const sentinel = path.join(temporary, "sentinel");
  const aliasRoot = path.join(temporary, "alias");
  const alias = path.join(aliasRoot, "theme");
  await fs.mkdir(aliasRoot);
  await fs.mkdir(sentinel);
  await fs.writeFile(path.join(sentinel, "keep-me"), "preserve");
  let symlinkAvailable = true;
  try {
    await fs.symlink(sentinel, alias, "junction");
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
      symlinkAvailable = false;
    } else {
      throw error;
    }
  }
  if (symlinkAvailable) {
    run([writer, "reset-demo", "--output-dir", alias], false);
    assert.equal((await fs.lstat(alias)).isSymbolicLink(), true);
    assert.equal(await fs.readFile(path.join(sentinel, "keep-me"), "utf8"), "preserve");
  }
  console.log("PASS: reset-demo restores bundled assets without deleting unrelated files");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
