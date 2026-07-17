import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MARKER = "# CodexDreamSkinStudio launcher";
const MAX_LAUNCHER_BYTES = 64 * 1024;
const [mode, targetArg, command] = process.argv.slice(2);

if (!new Set(["check", "write", "remove"]).has(mode) || !targetArg
    || (mode === "write" && command === undefined)) {
  throw new Error("Usage: launcher-file.mjs <check|write|remove> <target> [command]");
}

const target = path.resolve(targetArg);

async function inspectOwned(file, { allowMissing = false, label = target } = {}) {
  let stat;
  try {
    stat = await fs.lstat(file);
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return false;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_LAUNCHER_BYTES) {
    throw new Error(`Refusing to modify an unrelated Desktop entry: ${label}`);
  }
  const bytes = await fs.readFile(file);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Refusing to modify an unrelated Desktop entry: ${label}`);
  }
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== "#!/bin/bash" || lines[1] !== MARKER) {
    throw new Error(`Refusing to modify an unrelated Desktop entry: ${label}`);
  }
  return true;
}

async function moveTargetAside() {
  const quarantine = `${target}.dream-skin-${process.pid}-${randomUUID()}.previous`;
  try {
    await fs.rename(target, quarantine);
  } catch (error) {
    if (error.code === "ENOENT") return { moved: false, quarantine };
    throw error;
  }
  try {
    await inspectOwned(quarantine, { label: target });
  } catch (error) {
    try {
      await fs.rename(quarantine, target);
    } catch (restoreError) {
      throw new Error(
        `${error.message} The entry was preserved at ${quarantine}; `
        + `automatic restoration failed: ${restoreError.message}`,
      );
    }
    throw error;
  }
  return { moved: true, quarantine };
}

async function restoreMovedTarget(claim) {
  if (!claim?.moved) return;
  try {
    await fs.lstat(target);
    throw new Error(`A new entry appeared at ${target}; previous launcher preserved at ${claim.quarantine}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.rename(claim.quarantine, target);
  claim.moved = false;
}

async function writeLauncher() {
  if (typeof command !== "string" || command.length > 16 * 1024 || /[\0\r\n]/u.test(command)) {
    throw new Error("Launcher command must be a single line no longer than 16 KB.");
  }
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.dream-skin-${process.pid}-${randomUUID()}.tmp`;
  let handle;
  let claim;
  try {
    handle = await fs.open(temporary, "wx", 0o700);
    await handle.chmod(0o700);
    await handle.writeFile(`#!/bin/bash\n${MARKER}\nset -e\n${command}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;

    // Move the current entry aside without following it, verify ownership on
    // the moved object, then publish with a no-overwrite hard link. A symlink,
    // directory, or unrelated file is restored and rejected unchanged.
    claim = await moveTargetAside();
    try {
      await fs.link(temporary, target);
    } catch (error) {
      await restoreMovedTarget(claim);
      throw error;
    }
    await fs.unlink(temporary);
    if (claim.moved) {
      await fs.unlink(claim.quarantine).catch((error) => {
        console.error(`Installed launcher but could not remove its old copy: ${error.message}`);
      });
    }
  } finally {
    await handle?.close().catch(() => {});
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function removeLauncher() {
  const claim = await moveTargetAside();
  if (!claim.moved) return;
  try {
    await fs.unlink(claim.quarantine);
    claim.moved = false;
  } catch (error) {
    await restoreMovedTarget(claim);
    throw error;
  }
}

if (mode === "check") await inspectOwned(target, { allowMissing: true });
else if (mode === "write") await writeLauncher();
else await removeLauncher();
