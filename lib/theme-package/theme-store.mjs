import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ThemePackageError, fail } from "./errors.mjs";
import { readStableFile } from "./stable-file.mjs";

const IMPORT_RECORD_BYTES = 64 * 1024;
const THEME_BYTES = 256 * 1024;
const BACKGROUND_BYTES = 16 * 1024 * 1024;
const PREVIEW_BYTES = 4 * 1024 * 1024;

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureDirectory(fileSystem, directory, label) {
  const before = await fileSystem.lstat(directory).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (before?.isSymbolicLink() || (before && !before.isDirectory())) {
    fail("INSTALL_STORE_INVALID", `${label} must be a real directory.`);
  }
  if (!before) await fileSystem.mkdir(directory, { recursive: true, mode: 0o700 });
  const after = await fileSystem.lstat(directory);
  if (after.isSymbolicLink() || !after.isDirectory()) {
    fail("INSTALL_STORE_INVALID", `${label} must be a real directory.`);
  }
  await fileSystem.chmod(directory, 0o700).catch(() => {});
  return !before;
}

async function readImportRecord(directory) {
  const recordPath = path.join(directory, "import.json");
  const exists = await fs.lstat(recordPath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!exists || exists.isSymbolicLink() || !exists.isFile()) return null;
  const bytes = await readStableFile(recordPath, {
    maximum: IMPORT_RECORD_BYTES,
    invalidCode: "CONFLICT_EXISTING_THEME_INVALID",
    missingCode: "CONFLICT_EXISTING_THEME_INVALID",
    label: "Existing import record",
  });
  let record;
  try {
    record = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  return record;
}

function sameIdentity(record, report, platform) {
  return record?.schemaVersion === 1
    && record.packageId === report.packageId
    && record.packageVersion === report.packageVersion
    && record.contentHash === report.contentHash
    && record.platform === platform;
}

async function copyPreparedFile(fileSystem, preparedDirectory, stagingDirectory, name, maximum) {
  const bytes = await readStableFile(path.join(preparedDirectory, name), {
    maximum,
    invalidCode: "INSTALL_STAGE_SOURCE_INVALID",
    missingCode: "INSTALL_STAGE_SOURCE_INVALID",
    label: name,
  });
  await fileSystem.writeFile(path.join(stagingDirectory, name), bytes, { flag: "wx", mode: 0o600 });
}

async function directoryIsEmpty(fileSystem, directory) {
  return (await fileSystem.readdir(directory)).length === 0;
}

export async function installPreparedTheme({
  stateRoot,
  preparedDirectory,
  report,
  compiledTheme,
  platform,
  replace = false,
  installedAt = new Date().toISOString(),
  fileSystem = fs,
}) {
  const requestedRoot = path.resolve(stateRoot);
  const stateCreated = await ensureDirectory(fileSystem, requestedRoot, "State root");
  const canonicalRoot = await fileSystem.realpath(requestedRoot);
  const themesDirectory = path.join(canonicalRoot, "themes");
  const themesCreated = await ensureDirectory(fileSystem, themesDirectory, "Theme library");
  const canonicalThemes = await fileSystem.realpath(themesDirectory);
  if (path.dirname(canonicalThemes) !== canonicalRoot) {
    fail("INSTALL_STORE_INVALID", "Theme library must stay directly inside the state root.");
  }

  const finalDirectory = path.join(canonicalThemes, report.packageId);
  const lockPath = path.join(canonicalThemes, `.${report.packageId}.import.lock`);
  let lockHandle;
  try {
    lockHandle = await fileSystem.open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") fail("INSTALL_BUSY", "Another import for this theme is in progress.");
    throw error;
  }

  let stagingDirectory = null;
  let backupDirectory = null;
  try {
    const existing = await fileSystem.lstat(finalDirectory).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) {
      fail("CONFLICT_EXISTING_THEME_INVALID", "Existing theme must be a real directory.");
    }
    if (existing) {
      const record = await readImportRecord(finalDirectory);
      if (sameIdentity(record, report, platform)) {
        return {
          status: "already-installed",
          themeId: report.packageId,
          replaced: false,
        };
      }
      if (!replace) {
        fail(
          "CONFLICT_CONFIRMATION_REQUIRED",
          "A different theme package with the same packageId is already installed.",
        );
      }
    }

    stagingDirectory = await fileSystem.mkdtemp(
      path.join(canonicalThemes, `.${report.packageId}.staging-`),
    );
    await fileSystem.chmod(stagingDirectory, 0o700).catch(() => {});
    await copyPreparedFile(
      fileSystem,
      preparedDirectory,
      stagingDirectory,
      compiledTheme.image,
      BACKGROUND_BYTES,
    );
    const previewName = report.resources.preview
      ? `preview${path.extname(report.resources.preview.path).toLowerCase()}`
      : null;
    if (previewName) {
      await copyPreparedFile(fileSystem, preparedDirectory, stagingDirectory, previewName, PREVIEW_BYTES);
    }
    await copyPreparedFile(fileSystem, preparedDirectory, stagingDirectory, "theme.json", THEME_BYTES);
    await fileSystem.writeFile(path.join(stagingDirectory, "import.json"), jsonBytes({
      schemaVersion: 1,
      packageId: report.packageId,
      packageVersion: report.packageVersion,
      contentHash: report.contentHash,
      platform,
      compilerVersion: 1,
      installedAt,
    }), { flag: "wx", mode: 0o600 });

    if (existing) {
      backupDirectory = path.join(
        canonicalThemes,
        `.${report.packageId}.backup-${randomUUID()}`,
      );
      await fileSystem.rename(finalDirectory, backupDirectory);
    }
    try {
      await fileSystem.rename(stagingDirectory, finalDirectory);
      stagingDirectory = null;
    } catch (error) {
      if (backupDirectory) {
        try {
          await fileSystem.rename(backupDirectory, finalDirectory);
          backupDirectory = null;
        } catch {
          fail(
            "INSTALL_RECOVERY_REQUIRED",
            "Theme install failed and the preserved backup could not be restored automatically.",
            null,
            true,
          );
        }
      }
      fail("INSTALL_COMMIT_FAILED", "Theme install failed; the previous theme was preserved.");
    }
    if (backupDirectory) {
      await fileSystem.rm(backupDirectory, { recursive: true, force: true }).catch(() => {});
      backupDirectory = null;
    }
    return {
      status: "installed",
      themeId: report.packageId,
      replaced: Boolean(existing),
    };
  } catch (error) {
    if (error instanceof ThemePackageError) throw error;
    fail("INSTALL_FAILED", "Theme installation failed.");
  } finally {
    if (stagingDirectory) {
      await fileSystem.rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
    }
    await lockHandle.close().catch(() => {});
    await fileSystem.rm(lockPath, { force: true }).catch(() => {});
    if (themesCreated && await directoryIsEmpty(fileSystem, canonicalThemes).catch(() => false)) {
      await fileSystem.rmdir(canonicalThemes).catch(() => {});
    }
    if (stateCreated && await directoryIsEmpty(fileSystem, canonicalRoot).catch(() => false)) {
      await fileSystem.rmdir(canonicalRoot).catch(() => {});
    }
  }
}
