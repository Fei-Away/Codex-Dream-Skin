import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const projectRoot = path.resolve(macosRoot, "..");
const publisher = path.join(macosRoot, "scripts", "publish-theme-import.mjs");
const recoveryWrapper = path.join(macosRoot, "scripts", "recover-theme-imports-macos.sh");
const killHook = path.join(here, "theme-import-kill-hook.cjs");
const fixtureImage = path.join(macosRoot, "assets", "portal-hero.png");
const crossPlatformFixtureImage = path.join(
  projectRoot,
  "docs",
  "images",
  "gallery",
  "skin-01.jpg",
);
const tempRoot = await fs.mkdtemp(path.join("/tmp", "codex-dream-skin-publish-"));
const themesRoot = path.join(tempRoot, "themes");
const activeRoot = path.join(tempRoot, "theme");

const recoveryWrapperSource = await fs.readFile(recoveryWrapper, "utf8");
assert.match(recoveryWrapperSource, /\nensure_node_runtime\n/);
assert.doesNotMatch(recoveryWrapperSource, /discover_codex_bundle/);

function runPublisher(args, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [publisher, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnvironment },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve({ value: JSON.parse(stdout), code, signal });
      else if (signal) resolve({ value: null, code, signal, stderr });
      else reject(new Error(stderr || `publisher exited with ${code}`));
    });
  });
}

async function publish(stage, destinationRoot = themesRoot) {
  return (await runPublisher([stage, destinationRoot])).value;
}

async function recover(destinationRoot) {
  return (await runPublisher(["--recover", destinationRoot])).value;
}

async function publishAndKill(stage, destinationRoot, phase) {
  const nodeOptions = [process.env.NODE_OPTIONS, `--require=${killHook}`].filter(Boolean).join(" ");
  const result = await runPublisher([stage, destinationRoot], {
    NODE_OPTIONS: nodeOptions,
    DREAM_SKIN_TEST_KILL_AFTER_RENAME: phase,
  });
  assert.equal(result.signal, "SIGKILL", `publisher did not stop at ${phase}`);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `${command} exited with ${code}`));
    });
  });
}

async function makeStage(name, id, extra = {}) {
  const stage = path.join(tempRoot, name);
  const imageName = extra.imageName ?? "background.png";
  await fs.mkdir(stage);
  await fs.copyFile(extra.fixtureImage ?? fixtureImage, path.join(stage, imageName));
  await fs.writeFile(
    path.join(stage, "theme.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      id,
      name: extra.displayName ?? "Imported Theme",
      image: imageName,
      appearance: "auto",
      art: { safeArea: "auto", taskMode: "auto" },
      ...extra.theme,
    }, null, 2)}\n`,
  );
  if (extra.safeCss !== false) {
    await fs.writeFile(
      path.join(stage, "theme.css"),
      extra.safeCss ?? '[data-ds-part="root"] { color: var(--ds-theme-color-text); }\n',
    );
  }
  return stage;
}

async function writeSavedTheme(directoryName, id, extra = {}, destinationRoot = themesRoot) {
  const directory = path.join(destinationRoot, directoryName);
  await fs.mkdir(directory);
  await fs.copyFile(fixtureImage, path.join(directory, "background.png"));
  await fs.writeFile(
    path.join(directory, "theme.json"),
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
  await fs.writeFile(
    path.join(directory, "theme.css"),
    extra.safeCss ?? '[data-ds-part="root"] { color: var(--ds-theme-color-text); }\n',
  );
  return directory;
}

async function savedThemeNames() {
  return (await fs.readdir(themesRoot)).filter((name) => !name.startsWith(".")).sort();
}

async function transactionResidue() {
  return (await fs.readdir(themesRoot))
    .filter((name) => /^\.theme-(?:failed|import-|legacy-cleanup-|replace-)/.test(name))
    .sort();
}

async function replacementTransactions(destinationRoot) {
  return (await fs.readdir(destinationRoot))
    .filter((name) => name.startsWith(".theme-replace-"))
    .sort();
}

try {
  await fs.mkdir(themesRoot);
  await fs.mkdir(activeRoot);
  await fs.writeFile(path.join(activeRoot, "last-known-good"), "unchanged\n");

  const firstStage = await makeStage("first", "theme-id");
  const first = await publish(firstStage);
  assert.deepEqual({ ...first, contentFingerprint: undefined }, {
    status: "imported",
    id: "theme-id",
    name: "Imported Theme",
    renamed: false,
    replaced: false,
    nameCollision: false,
    packageFormat: "simple",
    safeCssStatus: "validated",
    signatureIgnored: false,
    contentFingerprint: undefined,
    cleanupWarning: null,
  });
  assert.match(first.contentFingerprint, /^[0-9a-f]{64}$/);

  const noCssStage = await makeStage("no-css", "no-css", { safeCss: false });
  await assert.rejects(publish(noCssStage), /require non-empty theme\.css/);
  assert.equal(await fs.readFile(path.join(activeRoot, "last-known-good"), "utf8"), "unchanged\n");

  const duplicateStage = await makeStage("duplicate", "different-package-id");
  const duplicate = await publish(duplicateStage);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.id, "theme-id");
  assert.equal(duplicate.contentFingerprint, first.contentFingerprint);
  assert.equal((await fs.readdir(themesRoot)).filter((name) => !name.startsWith(".")).length, 1);

  const collisionStage = await makeStage("collision", "theme-id", { displayName: "Second Theme" });
  const collision = await publish(collisionStage);
  assert.equal(collision.status, "imported");
  assert.equal(collision.id, "theme-id");
  assert.equal(collision.renamed, false);
  assert.equal(collision.replaced, true);
  assert.equal(collision.nameCollision, false);
  assert.match(collision.contentFingerprint, /^[0-9a-f]{64}$/);
  assert.notEqual(collision.contentFingerprint, first.contentFingerprint);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(themesRoot, "theme-id", "theme.json"), "utf8")).name,
    "Second Theme",
  );
  assert.deepEqual(await savedThemeNames(), ["theme-id"]);

  const nameCollisionStage = await makeStage("name-collision", "third-id", {
    displayName: "Second Theme",
    theme: { quote: "DIFFERENT CONTENT" },
  });
  const nameCollision = await publish(nameCollisionStage);
  assert.equal(nameCollision.status, "imported");
  assert.equal(nameCollision.nameCollision, true);

  const replacementNameCollisionStage = await makeStage("replacement-name-collision", "theme-id", {
    displayName: "Second Theme",
    theme: { quote: "REPLACEMENT COLLIDES WITH THIRD" },
  });
  const replacementNameCollision = await publish(replacementNameCollisionStage);
  assert.equal(replacementNameCollision.status, "imported");
  assert.equal(replacementNameCollision.id, "theme-id");
  assert.equal(replacementNameCollision.replaced, true);
  assert.equal(replacementNameCollision.nameCollision, true);

  await writeSavedTheme("theme-id-2", "theme-id-2", {
    displayName: "Legacy Exact",
    theme: { quote: "LEGACY EXACT CONTENT" },
  });
  const legacyExactStage = await makeStage("legacy-exact", "theme-id", {
    displayName: "Legacy Exact",
    theme: { quote: "LEGACY EXACT CONTENT" },
  });
  const legacyExact = await publish(legacyExactStage);
  assert.equal(legacyExact.status, "imported");
  assert.equal(legacyExact.id, "theme-id");
  assert.equal(legacyExact.replaced, true);
  assert.deepEqual(await savedThemeNames(), ["theme-id", "third-id"]);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(themesRoot, "theme-id", "theme.json"), "utf8")).name,
    "Legacy Exact",
  );

  // Re-importing an exact package must still consolidate a pre-existing
  // canonical/legacy pair; an early duplicate return would leave both dirs.
  await writeSavedTheme("legacy-reimport", "legacy-reimport", {
    displayName: "Legacy Re-import",
    theme: { quote: "LEGACY REIMPORT CONTENT" },
  });
  await writeSavedTheme("legacy-reimport-2", "legacy-reimport-2", {
    displayName: "Legacy Re-import",
    theme: { quote: "LEGACY REIMPORT CONTENT" },
  });
  const legacyReimportStage = await makeStage("legacy-reimport-stage", "legacy-reimport", {
    displayName: "Legacy Re-import",
    theme: { quote: "LEGACY REIMPORT CONTENT" },
  });
  const legacyReimport = await publish(legacyReimportStage);
  assert.equal(legacyReimport.status, "imported");
  assert.equal(legacyReimport.id, "legacy-reimport");
  assert.equal(legacyReimport.replaced, true);
  assert.deepEqual(await savedThemeNames(), ["legacy-reimport", "theme-id", "third-id"]);
  assert.equal(
    await fs.access(path.join(themesRoot, "legacy-reimport-2")).then(() => true, () => false),
    false,
  );
  assert.deepEqual(await transactionResidue(), []);

  const legacyExtraDirectory = await writeSavedTheme("legacy-extra-2", "legacy-extra-2", {
    displayName: "Legacy Extra",
    theme: { quote: "LEGACY EXTRA CONTENT" },
  });
  await fs.writeFile(path.join(legacyExtraDirectory, "KEEP.txt"), "preserve this independent file\n");
  const legacyExtraStage = await makeStage("legacy-extra-stage", "legacy-extra", {
    displayName: "Legacy Extra",
    theme: { quote: "LEGACY EXTRA CONTENT" },
  });
  const legacyExtra = await publish(legacyExtraStage);
  assert.equal(legacyExtra.status, "imported");
  assert.equal(await fs.readFile(path.join(legacyExtraDirectory, "KEEP.txt"), "utf8"),
    "preserve this independent file\n");

  await writeSavedTheme("theme-id-2", "unrelated-theme", {
    displayName: "Unrelated Suffix",
    theme: { quote: "UNRELATED SUFFIX CONTENT" },
  });
  await writeSavedTheme("theme-id-3", "theme-id-3", {
    displayName: "Preserve Canonical",
    theme: { quote: "INDEPENDENT NUMERIC ID CONTENT" },
  });
  const preserveSuffixStage = await makeStage("preserve-unrelated-suffix", "theme-id", {
    displayName: "Preserve Canonical",
    theme: { quote: "PRESERVE UNRELATED SUFFIX" },
  });
  const preserveSuffix = await publish(preserveSuffixStage);
  assert.equal(preserveSuffix.status, "imported");
  assert.equal(preserveSuffix.id, "theme-id");
  assert.deepEqual(await savedThemeNames(), [
    "legacy-extra",
    "legacy-extra-2",
    "legacy-reimport",
    "theme-id",
    "theme-id-2",
    "theme-id-3",
    "third-id",
  ]);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(themesRoot, "theme-id-2", "theme.json"), "utf8")).id,
    "unrelated-theme",
  );
  assert.equal(
    JSON.parse(await fs.readFile(path.join(themesRoot, "theme-id-3", "theme.json"), "utf8")).id,
    "theme-id-3",
    "A legitimate numeric-suffix theme with unrelated content but the same name must be preserved.",
  );

  const longBaseId = "l".repeat(80);
  const longLegacyId = `${longBaseId.slice(0, 78)}-2`;
  await writeSavedTheme(longLegacyId, longLegacyId, {
    displayName: "Long Legacy",
    theme: { quote: "LONG LEGACY CONTENT" },
  });
  const longLegacyStage = await makeStage("long-legacy", longBaseId, {
    displayName: "Long Legacy",
    theme: { quote: "LONG LEGACY CONTENT" },
  });
  const longLegacy = await publish(longLegacyStage);
  assert.equal(longLegacy.status, "imported");
  assert.equal(longLegacy.id, longBaseId);
  assert.equal(longLegacy.replaced, false);
  assert.equal(await fs.access(path.join(themesRoot, longLegacyId)).then(() => true, () => false), false);

  await writeSavedTheme("ambiguous-id", "different-internal-id", {
    displayName: "Ambiguous Canonical",
    theme: { quote: "AMBIGUOUS CANONICAL" },
  });
  const ambiguousStage = await makeStage("ambiguous-replacement", "ambiguous-id", {
    displayName: "Should Not Replace",
    theme: { quote: "AMBIGUOUS REPLACEMENT" },
  });
  await assert.rejects(
    publish(ambiguousStage),
    /Existing saved theme identity could not be confirmed/,
  );
  assert.equal(
    JSON.parse(await fs.readFile(path.join(themesRoot, "ambiguous-id", "theme.json"), "utf8")).id,
    "different-internal-id",
  );

  const fileCollisionPath = path.join(themesRoot, "file-collision");
  await fs.writeFile(fileCollisionPath, "keep-file\n");
  const fileCollisionStage = await makeStage("file-collision", "file-collision", {
    displayName: "File Collision",
    theme: { quote: "FILE COLLISION" },
  });
  await assert.rejects(
    publish(fileCollisionStage),
    /Existing saved theme path is not a directory/,
  );
  assert.equal(await fs.readFile(fileCollisionPath, "utf8"), "keep-file\n");
  assert.equal(await fs.access(path.join(themesRoot, "file-collision-2")).then(() => true, () => false), false);
  assert.deepEqual(await transactionResidue(), []);

  if (process.platform === "darwin") {
    const rollbackCanonical = await writeSavedTheme("rollback-id", "rollback-id", {
      displayName: "Rollback Original",
      theme: { quote: "ROLLBACK ORIGINAL CONTENT" },
    });
    const rollbackLegacy = await writeSavedTheme("rollback-id-2", "rollback-id-2", {
      displayName: "Rollback Incoming",
      theme: { quote: "ROLLBACK INCOMING CONTENT" },
    });
    const rollbackStage = await makeStage("rollback-stage", "rollback-id", {
      displayName: "Rollback Incoming",
      theme: { quote: "ROLLBACK INCOMING CONTENT" },
    });
    await runCommand("/usr/bin/chflags", ["uchg", rollbackLegacy]);
    let legacyCleanupResult;
    try {
      legacyCleanupResult = await publish(rollbackStage);
      assert.equal(legacyCleanupResult.status, "imported");
      assert.match(legacyCleanupResult.cleanupWarning, /backup cleanup was not verified/i);
    } finally {
      const rollbackEntries = await fs.readdir(themesRoot);
      for (const entry of rollbackEntries) {
        if (entry.includes("rollback-id") || entry.startsWith(".theme-legacy-cleanup-")) {
          const entryPath = path.join(themesRoot, entry);
          await runCommand("/usr/bin/chflags", ["-R", "nouchg", entryPath]);
          if (entry.startsWith(".theme-legacy-cleanup-")) {
            await fs.rm(entryPath, { recursive: true, force: true });
          }
        }
      }
    }
    assert.equal(
      JSON.parse(await fs.readFile(path.join(rollbackCanonical, "theme.json"), "utf8")).quote,
      "ROLLBACK INCOMING CONTENT",
    );
    assert.equal(
      await fs.access(rollbackLegacy).then(() => true, () => false),
      true,
    );
    assert.equal(
      JSON.parse(await fs.readFile(path.join(rollbackLegacy, "theme.json"), "utf8")).quote,
      "ROLLBACK INCOMING CONTENT",
    );
    assert.deepEqual(await transactionResidue(), []);

    const cleanupCanonical = await writeSavedTheme("cleanup-warning-id", "cleanup-warning-id", {
      displayName: "Cleanup Warning Theme",
      theme: { quote: "CLEANUP WARNING A" },
    });
    const cleanupStage = await makeStage("cleanup-warning-stage", "cleanup-warning-id", {
      displayName: "Cleanup Warning Theme",
      theme: { quote: "CLEANUP WARNING B" },
    });
    await runCommand("/usr/bin/chflags", ["uchg", path.join(cleanupCanonical, "theme.json")]);
    let cleanupResult;
    try {
      cleanupResult = await publish(cleanupStage);
      assert.equal(cleanupResult.status, "imported");
      assert.equal(cleanupResult.replaced, true);
      assert.match(cleanupResult.cleanupWarning, /backup cleanup was not verified/i);
      assert.equal(
        JSON.parse(await fs.readFile(path.join(cleanupCanonical, "theme.json"), "utf8")).quote,
        "CLEANUP WARNING B",
      );
      const cleanupBackups = (await fs.readdir(themesRoot))
        .filter((name) => name.startsWith(".theme-replace-"));
      assert.equal(cleanupBackups.length, 1);
      assert.equal(
        JSON.parse(await fs.readFile(
          path.join(themesRoot, cleanupBackups[0], "backup", "theme.json"),
          "utf8",
        )).quote,
        "CLEANUP WARNING A",
      );
    } finally {
      const cleanupBackups = (await fs.readdir(themesRoot))
        .filter((name) => name.startsWith(".theme-replace-"));
      for (const entry of cleanupBackups) {
        const backup = path.join(themesRoot, entry);
        await runCommand("/usr/bin/chflags", ["-R", "nouchg", backup]);
        await fs.rm(backup, { recursive: true, force: true });
      }
    }
    assert.deepEqual(await transactionResidue(), []);
  }

  async function runHardInterruptionCase(label, phase, expectedQuote) {
    const crashThemesRoot = path.join(tempRoot, `crash-themes-${label}`);
    await fs.mkdir(crashThemesRoot);
    await writeSavedTheme("crash-theme", "crash-theme", {
      displayName: "Crash Recovery Theme",
      theme: { quote: "CRASH ORIGINAL" },
    }, crashThemesRoot);
    const crashStage = await makeStage(`crash-stage-${label}`, "crash-theme", {
      displayName: "Crash Recovery Theme",
      theme: { quote: "CRASH REPLACEMENT" },
    });
    await publishAndKill(crashStage, crashThemesRoot, phase);
    const recovery = await recover(crashThemesRoot);
    assert.equal(recovery.status, "recovered");
    assert.equal(
      JSON.parse(await fs.readFile(
        path.join(crashThemesRoot, "crash-theme", "theme.json"),
        "utf8",
      )).quote,
      expectedQuote,
    );
    assert.deepEqual(
      (await fs.readdir(crashThemesRoot)).filter((name) => name.startsWith(".theme-")),
      [],
      `${phase} recovery left hidden transaction state`,
    );
  }

  await runHardInterruptionCase("after-backup", "backup", "CRASH ORIGINAL");
  await runHardInterruptionCase("after-candidate", "candidate", "CRASH ORIGINAL");
  await runHardInterruptionCase("after-commit", "committed", "CRASH REPLACEMENT");

  const corruptCandidateRoot = path.join(tempRoot, "corrupt-candidate-themes");
  await fs.mkdir(corruptCandidateRoot);
  await writeSavedTheme("corrupt-theme", "corrupt-theme", {
    theme: { quote: "CORRUPT ORIGINAL" },
  }, corruptCandidateRoot);
  const corruptCandidateStage = await makeStage("corrupt-candidate-stage", "corrupt-theme", {
    theme: { quote: "CORRUPT REPLACEMENT" },
  });
  await publishAndKill(corruptCandidateStage, corruptCandidateRoot, "backup");
  const [corruptTransactionName] = await replacementTransactions(corruptCandidateRoot);
  const corruptTransaction = path.join(corruptCandidateRoot, corruptTransactionName);
  await fs.writeFile(path.join(corruptTransaction, "candidate", "theme.json"), "{}\n");
  await assert.rejects(recover(corruptCandidateRoot), /replacement candidate could not be read/i);
  assert.equal(
    JSON.parse(await fs.readFile(
      path.join(corruptCandidateRoot, "corrupt-theme", "theme.json"),
      "utf8",
    )).quote,
    "CORRUPT ORIGINAL",
  );
  assert.deepEqual(await replacementTransactions(corruptCandidateRoot), [corruptTransactionName]);
  assert.equal(
    await fs.access(path.join(corruptTransaction, "candidate")).then(() => true, () => false),
    true,
  );
  assert.equal(
    await fs.access(path.join(corruptTransaction, "backup")).then(() => true, () => false),
    false,
  );

  const conflictingCommitRoot = path.join(tempRoot, "conflicting-commit-themes");
  await fs.mkdir(conflictingCommitRoot);
  await writeSavedTheme("commit-theme", "commit-theme", {
    theme: { quote: "COMMIT ORIGINAL" },
  }, conflictingCommitRoot);
  const conflictingCommitStage = await makeStage("conflicting-commit-stage", "commit-theme", {
    theme: { quote: "COMMIT REPLACEMENT" },
  });
  await publishAndKill(conflictingCommitStage, conflictingCommitRoot, "committed");
  const [conflictingTransactionName] = await replacementTransactions(conflictingCommitRoot);
  const conflictingTransaction = path.join(conflictingCommitRoot, conflictingTransactionName);
  await fs.writeFile(
    path.join(conflictingTransaction, "commit.tmp"),
    "dreamskin-theme-replace-commit/1\n",
  );
  await assert.rejects(recover(conflictingCommitRoot), /temporary commit marker/i);
  assert.equal(
    JSON.parse(await fs.readFile(
      path.join(conflictingCommitRoot, "commit-theme", "theme.json"),
      "utf8",
    )).quote,
    "COMMIT REPLACEMENT",
  );
  assert.deepEqual(await replacementTransactions(conflictingCommitRoot), [conflictingTransactionName]);
  await fs.rm(path.join(conflictingTransaction, "commit.tmp"));
  await recover(conflictingCommitRoot);
  assert.deepEqual(await replacementTransactions(conflictingCommitRoot), []);

  const duplicateTransactionRoot = path.join(tempRoot, "duplicate-transaction-themes");
  await fs.mkdir(duplicateTransactionRoot);
  await writeSavedTheme("duplicate-theme", "duplicate-theme", {
    theme: { quote: "DUPLICATE ORIGINAL" },
  }, duplicateTransactionRoot);
  const duplicateTransactionStage = await makeStage(
    "duplicate-transaction-stage",
    "duplicate-theme",
    { theme: { quote: "DUPLICATE REPLACEMENT" } },
  );
  await publishAndKill(duplicateTransactionStage, duplicateTransactionRoot, "backup");
  const [firstTransactionName] = await replacementTransactions(duplicateTransactionRoot);
  const secondTransactionName = ".theme-replace-00000000-0000-4000-8000-000000000002";
  await fs.cp(
    path.join(duplicateTransactionRoot, firstTransactionName),
    path.join(duplicateTransactionRoot, secondTransactionName),
    { recursive: true },
  );
  await assert.rejects(
    recover(duplicateTransactionRoot),
    /multiple theme replacement transactions target duplicate-theme/i,
  );
  assert.equal(
    await fs.access(path.join(duplicateTransactionRoot, "duplicate-theme"))
      .then(() => true, () => false),
    false,
  );
  assert.deepEqual(
    await replacementTransactions(duplicateTransactionRoot),
    [firstTransactionName, secondTransactionName].sort(),
  );
  await fs.rm(path.join(duplicateTransactionRoot, secondTransactionName), {
    recursive: true,
    force: true,
  });
  await recover(duplicateTransactionRoot);
  assert.equal(
    JSON.parse(await fs.readFile(
      path.join(duplicateTransactionRoot, "duplicate-theme", "theme.json"),
      "utf8",
    )).quote,
    "DUPLICATE ORIGINAL",
  );

  const malformedThemesRoot = path.join(tempRoot, "malformed-recovery-themes");
  await fs.mkdir(malformedThemesRoot);
  await writeSavedTheme("malformed-theme", "malformed-theme", {
    theme: { quote: "MALFORMED ORIGINAL" },
  }, malformedThemesRoot);
  const malformedTransaction = path.join(
    malformedThemesRoot,
    ".theme-replace-00000000-0000-4000-8000-000000000000",
  );
  await fs.mkdir(malformedTransaction);
  await fs.writeFile(path.join(malformedTransaction, "transaction.json"), "{}\n");
  await assert.rejects(recover(malformedThemesRoot), /unsupported schema/);
  assert.equal(
    JSON.parse(await fs.readFile(
      path.join(malformedThemesRoot, "malformed-theme", "theme.json"),
      "utf8",
    )).quote,
    "MALFORMED ORIGINAL",
  );
  assert.equal(await fs.access(malformedTransaction).then(() => true, () => false), true);

  const liveLockThemesRoot = path.join(tempRoot, "live-lock-themes");
  await fs.mkdir(liveLockThemesRoot);
  const liveLock = path.join(liveLockThemesRoot, ".theme-import.lock");
  await fs.mkdir(liveLock);
  await fs.writeFile(
    path.join(liveLock, "owner.json"),
    `${JSON.stringify({
      pid: process.pid,
      token: "00000000-0000-4000-8000-000000000001",
      createdAt: new Date().toISOString(),
    })}\n`,
  );
  await assert.rejects(recover(liveLockThemesRoot), /still running/);
  assert.equal(await fs.access(liveLock).then(() => true, () => false), true);
  await fs.rm(liveLock, { recursive: true, force: true });

  const unsafeIdStage = await makeStage("unsafe-id", "../../escape", {
    displayName: "Unsafe ID Theme",
  });
  const unsafeId = await publish(unsafeIdStage);
  assert.match(unsafeId.id, /^import-[0-9a-f]{24}$/);
  assert.equal(path.dirname(path.join(themesRoot, unsafeId.id)), themesRoot);

  const fallbackVectorOptions = {
    displayName: "Cross-platform & ' Fallback ID",
    fixtureImage: crossPlatformFixtureImage,
    imageName: "background.jpg",
    theme: {
      art: { focusX: 1e-7, safeArea: "auto", taskMode: "auto" },
      quote: "CROSS PLATFORM FALLBACK",
    },
  };
  const missingIdStage = await makeStage("missing-id", undefined, fallbackVectorOptions);
  const missingId = await publish(missingIdStage);
  assert.equal(missingId.status, "imported");
  assert.equal(missingId.id, "import-b009c788e6a9307c35ed281e");
  assert.equal(missingId.renamed, true);

  const nonStringIdStage = await makeStage("non-string-id", 42, fallbackVectorOptions);
  const nonStringId = await publish(nonStringIdStage);
  assert.equal(nonStringId.status, "duplicate");
  assert.equal(nonStringId.id, missingId.id);

  const reservedStageA = await makeStage("reserved-a", "con.theme", {
    displayName: "Reserved Cross-platform ID",
    theme: { quote: "RESERVED A" },
  });
  const reservedA = await publish(reservedStageA);
  assert.match(reservedA.id, /^import-[0-9a-f]{24}$/);
  assert.equal(reservedA.id, "import-931599c2985393be807cf0ed");
  assert.equal(reservedA.renamed, true);
  const reservedStageB = await makeStage("reserved-b", "con.theme", {
    displayName: "Reserved Cross-platform ID",
    theme: { quote: "RESERVED B" },
  });
  const reservedB = await publish(reservedStageB);
  assert.equal(reservedB.id, reservedA.id);
  assert.equal(reservedB.replaced, true);
  assert.equal(
    (await savedThemeNames()).filter((name) => name === reservedA.id).length,
    1,
  );

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
  await assert.rejects(
    publish(linkedStage),
    process.platform === "win32" ? /require non-empty theme\.css/ : /symbolic link/,
  );

  const badSchema = await makeStage("bad-schema", "bad-schema");
  const badConfig = JSON.parse(await fs.readFile(path.join(badSchema, "theme.json"), "utf8"));
  badConfig.schemaVersion = 2;
  await fs.writeFile(path.join(badSchema, "theme.json"), `${JSON.stringify(badConfig)}\n`);
  await assert.rejects(publish(badSchema), /schemaVersion 1/);

  assert.equal(await fs.readFile(path.join(activeRoot, "last-known-good"), "utf8"), "unchanged\n");
  assert.deepEqual(await transactionResidue(), []);
  console.log("PASS: imported themes publish atomically with duplicate and collision handling.");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
