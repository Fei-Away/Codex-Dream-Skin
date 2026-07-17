import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ThemePackageError } from "../lib/theme-package/errors.mjs";
import { addApplyResult, prepareThemePackage } from "../lib/theme-package/import-core.mjs";
import { installPreparedTheme } from "../lib/theme-package/theme-store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const cli = path.join(root, "tools", "theme-package.mjs");
const golden = path.join(root, "examples", "theme-package", "kimi-sakura-dawn.dreamskin");
const exampleSource = path.join(root, "examples", "theme-package", "kimi-sakura-dawn");
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-import-core-"));

function runCli(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function reportFor(result, expectedStatus = 0) {
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

async function fileSnapshot(directory) {
  const result = {};
  async function visit(current, relative) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(child, childRelative);
      else if (entry.isFile()) result[childRelative] = (await fs.readFile(child)).toString("base64");
      else result[childRelative] = "non-regular";
    }
  }
  if (await fs.lstat(directory).catch(() => null)) await visit(directory, "");
  return result;
}

async function assertNoTransactionArtifacts(stateRoot) {
  const themes = path.join(stateRoot, "themes");
  const entries = await fs.readdir(themes).catch(() => []);
  assert.deepEqual(entries.filter((name) => name.startsWith(".")), []);
}

try {
  const applyFailure = addApplyResult({ pass: true, install: { status: "installed" } }, "failed-after-install");
  assert.deepEqual(applyFailure, {
    pass: false,
    install: { status: "installed" },
    apply: { status: "failed-after-install" },
    code: "APPLY_FAILED_AFTER_INSTALL",
    message: "The theme was installed, but it could not be applied and verified.",
    persistentChanges: true,
  });

  const unusedStateRoot = path.join(temporaryRoot, "state-must-not-exist");
  const dryRun = reportFor(runCli(
    "import",
    golden,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.3.0",
    "--dry-run",
  ));
  assert.deepEqual({
    pass: dryRun.pass,
    command: dryRun.command,
    mode: dryRun.mode,
    packageId: dryRun.packageId,
    packageVersion: dryRun.packageVersion,
    contentHash: dryRun.contentHash,
    platform: dryRun.platform,
    install: dryRun.install,
  }, {
    pass: true,
    command: "import",
    mode: "dry-run",
    packageId: "dev.codex-dream-skin.kimi-sakura-dawn",
    packageVersion: "1.0.0",
    contentHash: "0849c3b462e38fe0639941df5a8e1c6832e1a182d4ddd632464bbbf0d6ddc785",
    platform: "macos",
    install: { status: "not-requested" },
  });
  assert.deepEqual(dryRun.runtimeTheme, {
    id: "dev.codex-dream-skin.kimi-sakura-dawn",
    name: "Kimi Sakura Dawn",
    image: "background.jpg",
    appearance: "auto",
  });
  assert.equal(dryRun.author.name, "Dream Skin Example Authors");
  assert.deepEqual(dryRun.targets, ["macos", "windows"]);
  assert.deepEqual(dryRun.preview, { available: false });
  assert.deepEqual(dryRun.warnings, []);
  assert.equal(await fs.lstat(unusedStateRoot).catch(() => null), null);

  const windowsDryRun = reportFor(runCli(
    "import",
    golden,
    "--platform",
    "windows",
    "--dream-skin-version",
    "1.3.0",
    "--dry-run",
  ));
  assert.equal(windowsDryRun.packageId, dryRun.packageId);
  assert.equal(windowsDryRun.packageVersion, dryRun.packageVersion);
  assert.equal(windowsDryRun.contentHash, dryRun.contentHash);
  assert.equal(windowsDryRun.platform, "windows");
  assert.deepEqual(windowsDryRun.warnings.map((warning) => warning.code), [
    "WINDOWS_TEXT_FIELDS_NOT_RENDERED",
    "WINDOWS_EXTENDED_PALETTE_NOT_RENDERED",
  ]);
  const windowsStateRoot = path.join(temporaryRoot, "windows-state");
  reportFor(runCli(
    "import",
    golden,
    "--platform",
    "windows",
    "--dream-skin-version",
    "1.3.0",
    "--install",
    "--state-root",
    windowsStateRoot,
    "--expected-content-hash",
    windowsDryRun.contentHash,
  ));
  const windowsRuntimeTheme = JSON.parse(await fs.readFile(path.join(
    windowsStateRoot,
    "themes",
    windowsDryRun.packageId,
    "theme.json",
  )));
  assert.equal(windowsRuntimeTheme.packageContentHash, windowsDryRun.contentHash);

  const source = path.join(temporaryRoot, "changed-source");
  const changedPackage = path.join(temporaryRoot, "changed.dreamskin");
  await fs.cp(exampleSource, source, { recursive: true });
  const changedManifestPath = path.join(source, "manifest.json");
  const changedManifest = JSON.parse(await fs.readFile(changedManifestPath, "utf8"));
  changedManifest.packageVersion = "1.0.1";
  await fs.writeFile(changedManifestPath, `${JSON.stringify(changedManifest, null, 2)}\n`);
  reportFor(runCli("pack", source, "--output", changedPackage));

  const stateRoot = path.join(temporaryRoot, "state");
  const activeDirectory = path.join(stateRoot, "theme");
  await fs.mkdir(activeDirectory, { recursive: true });
  await fs.writeFile(path.join(activeDirectory, "keep.txt"), "active theme must stay unchanged\n");
  const activeBefore = await fileSnapshot(activeDirectory);
  const staleConfirmation = reportFor(runCli(
    "import",
    changedPackage,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.3.0",
    "--install",
    "--state-root",
    stateRoot,
    "--expected-content-hash",
    dryRun.contentHash,
  ), 1);
  assert.equal(staleConfirmation.code, "PACKAGE_CONFIRMATION_STALE");
  assert.equal(staleConfirmation.persistentChanges, false);
  assert.deepEqual(await fileSnapshot(activeDirectory), activeBefore);
  assert.equal(await fs.lstat(path.join(stateRoot, "themes")).catch(() => null), null);

  const installed = reportFor(runCli(
    "import",
    golden,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.3.0",
    "--install",
    "--state-root",
    stateRoot,
    "--expected-content-hash",
    dryRun.contentHash,
  ));
  assert.deepEqual(installed.install, {
    status: "installed",
    themeId: dryRun.packageId,
    replaced: false,
  });
  const installedDirectory = path.join(stateRoot, "themes", dryRun.packageId);
  assert.deepEqual((await fs.readdir(installedDirectory)).sort(), [
    "background.jpg",
    "import.json",
    "theme.json",
  ]);
  assert.equal(JSON.parse(await fs.readFile(path.join(installedDirectory, "import.json"))).packageVersion, "1.0.0");
  assert.deepEqual(await fileSnapshot(activeDirectory), activeBefore);
  await assertNoTransactionArtifacts(stateRoot);

  const beforeRepeat = await fileSnapshot(stateRoot);
  const repeated = reportFor(runCli(
    "import",
    golden,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.3.0",
    "--install",
    "--state-root",
    stateRoot,
  ));
  assert.deepEqual(repeated.install, {
    status: "already-installed",
    themeId: dryRun.packageId,
    replaced: false,
  });
  assert.deepEqual(await fileSnapshot(stateRoot), beforeRepeat);

  const conflict = reportFor(runCli(
    "import",
    changedPackage,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.3.0",
    "--install",
    "--state-root",
    stateRoot,
  ), 1);
  assert.equal(conflict.code, "CONFLICT_CONFIRMATION_REQUIRED");
  assert.equal(conflict.persistentChanges, false);
  assert.deepEqual(await fileSnapshot(stateRoot), beforeRepeat);

  const replaced = reportFor(runCli(
    "import",
    changedPackage,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.3.0",
    "--install",
    "--state-root",
    stateRoot,
    "--replace",
  ));
  assert.deepEqual(replaced.install, {
    status: "installed",
    themeId: dryRun.packageId,
    replaced: true,
  });
  assert.equal(JSON.parse(await fs.readFile(path.join(installedDirectory, "import.json"))).packageVersion, "1.0.1");
  assert.deepEqual(await fileSnapshot(activeDirectory), activeBefore);
  await assertNoTransactionArtifacts(stateRoot);

  const rollbackState = path.join(temporaryRoot, "rollback-state");
  reportFor(runCli(
    "import",
    golden,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.3.0",
    "--install",
    "--state-root",
    rollbackState,
  ));
  const rollbackBefore = await fileSnapshot(rollbackState);
  const prepared = path.join(temporaryRoot, "prepared-changed");
  await fs.mkdir(prepared, { mode: 0o700 });
  const candidate = await prepareThemePackage({
    packagePath: changedPackage,
    platform: "macos",
    dreamSkinVersion: "1.3.0",
    stagingDirectory: prepared,
  });
  let renameCalls = 0;
  const injectedFileSystem = {
    ...fs,
    async rename(from, to) {
      renameCalls += 1;
      if (renameCalls === 2) {
        const error = new Error("injected staging publication failure");
        error.code = "EIO";
        throw error;
      }
      return fs.rename(from, to);
    },
  };
  await assert.rejects(
    installPreparedTheme({
      stateRoot: rollbackState,
      preparedDirectory: prepared,
      report: candidate.report,
      compiledTheme: candidate.compiledTheme,
      platform: "macos",
      replace: true,
      fileSystem: injectedFileSystem,
    }),
    (error) => error instanceof ThemePackageError && error.code === "INSTALL_COMMIT_FAILED",
  );
  assert.deepEqual(await fileSnapshot(rollbackState), rollbackBefore);
  await assertNoTransactionArtifacts(rollbackState);

  const cleanupState = path.join(temporaryRoot, "cleanup-state");
  reportFor(runCli(
    "import",
    golden,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.3.0",
    "--install",
    "--state-root",
    cleanupState,
  ));
  const cleanupPrepared = path.join(temporaryRoot, "prepared-cleanup");
  await fs.mkdir(cleanupPrepared, { mode: 0o700 });
  const cleanupCandidate = await prepareThemePackage({
    packagePath: changedPackage,
    platform: "macos",
    dreamSkinVersion: "1.3.0",
    stagingDirectory: cleanupPrepared,
  });
  const cleanupFileSystem = {
    ...fs,
    async rm(target, options) {
      if (path.basename(target).startsWith(`.${dryRun.packageId}.backup-`)) {
        const error = new Error("injected backup cleanup failure");
        error.code = "EACCES";
        throw error;
      }
      return fs.rm(target, options);
    },
  };
  await assert.rejects(
    installPreparedTheme({
      stateRoot: cleanupState,
      preparedDirectory: cleanupPrepared,
      report: cleanupCandidate.report,
      compiledTheme: cleanupCandidate.compiledTheme,
      platform: "macos",
      replace: true,
      fileSystem: cleanupFileSystem,
    }),
    (error) => error instanceof ThemePackageError
      && error.code === "INSTALL_RECOVERY_REQUIRED"
      && error.persistentChanges === true,
  );
  const cleanupThemes = path.join(cleanupState, "themes");
  const cleanupEntries = await fs.readdir(cleanupThemes);
  assert.equal(cleanupEntries.filter((name) => name.includes(".backup-")).length, 1);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(cleanupThemes, dryRun.packageId, "import.json"))).packageVersion,
    "1.0.1",
  );

  const symlinkState = path.join(temporaryRoot, "symlink-state");
  const outside = path.join(temporaryRoot, "outside-themes");
  await fs.mkdir(symlinkState);
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(symlinkState, "themes"), process.platform === "win32" ? "junction" : "dir");
  const symlinkFailure = reportFor(runCli(
    "import",
    golden,
    "--platform",
    "macos",
    "--dream-skin-version",
    "1.3.0",
    "--install",
    "--state-root",
    symlinkState,
  ), 1);
  assert.equal(symlinkFailure.code, "INSTALL_STORE_INVALID");
  assert.deepEqual(await fileSnapshot(outside), {});

  if (process.platform === "win32") {
    const ancestorTarget = path.join(temporaryRoot, "ancestor-target");
    const ancestorLink = path.join(temporaryRoot, "ancestor-link");
    await fs.mkdir(ancestorTarget);
    await fs.symlink(ancestorTarget, ancestorLink, "junction");
    const ancestorFailure = reportFor(runCli(
      "import",
      golden,
      "--platform",
      "windows",
      "--dream-skin-version",
      "1.3.0",
      "--install",
      "--state-root",
      path.join(ancestorLink, "state"),
    ), 1);
    assert.equal(ancestorFailure.code, "INSTALL_STORE_INVALID");
    assert.deepEqual(await fileSnapshot(ancestorTarget), {});
  }
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log("PASS: streaming import, runtime compilation, atomic install, conflict, and rollback are verified.");
