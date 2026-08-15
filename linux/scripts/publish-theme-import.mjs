import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { decodeAndValidateSafeCss } from "../assets/safe-css-validator.mjs";
import { runtimeThemeContentFingerprint } from "./theme-content-fingerprint.mjs";

const cliArgs = process.argv.slice(2);
const recoveryOnly = cliArgs[0] === "--recover";
const stageDirArg = recoveryOnly ? null : cliArgs[0];
const themesRootArg = cliArgs[1];
if (!themesRootArg || (!recoveryOnly && !stageDirArg) || cliArgs.length !== 2) {
  throw new Error(
    "Usage: publish-theme-import.mjs <validated-stage-dir> <saved-themes-root> | --recover <saved-themes-root>",
  );
}

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CSS_BYTES = 256 * 1024;
const MAX_LICENSE_BYTES = 64 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SIGNATURE_BYTES = 4 * 1024;
const OPEN_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
const REPLACEMENT_TRANSACTION_PREFIX = ".theme-replace-";
const REPLACEMENT_JOURNAL_NAME = "transaction.json";
const REPLACEMENT_BACKUP_NAME = "backup";
const REPLACEMENT_CANDIDATE_NAME = "candidate";
const REPLACEMENT_COMMIT_NAME = "committed";
const REPLACEMENT_COMMIT_TEMP_NAME = "commit.tmp";
const MAX_REPLACEMENT_JOURNAL_BYTES = 16 * 1024;

function assertContained(rootPath, candidatePath, label) {
  const relative = path.relative(rootPath, candidatePath);
  if (
    relative === ""
    || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  ) return;
  throw new Error(`${label} must stay inside its managed directory`);
}

async function pathExists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function removeDirectoryVerified(directory, label) {
  if (!(await pathExists(directory))) return;
  await assertReplaceableDirectory(directory, label);
  await fs.rm(directory, { recursive: true, force: true });
  if (await pathExists(directory)) throw new Error(`${label} cleanup was not verified`);
}

async function assertStoredFingerprint(directory, expectedFingerprint, label) {
  const stored = await readStoredTheme(directory);
  if (!stored) throw new Error(`${label} could not be read after restore`);
  if (stored.fingerprint !== expectedFingerprint) {
    throw new Error(`${label} fingerprint does not match the pre-import record`);
  }
}

function assertFingerprint(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function assertThemeId(value, label) {
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)
    || value.endsWith(".")
    || isWindowsReservedPathStem(value)
  ) throw new Error(`${label} is invalid`);
  return value;
}

function decodeTheme(bytes, label) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.includes("\0")) throw new Error(`${label} contains NUL characters`);
  let theme;
  try {
    theme = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!theme || typeof theme !== "object" || Array.isArray(theme) || theme.schemaVersion !== 1) {
    throw new Error(`${label} must use theme schemaVersion 1`);
  }
  if (typeof theme.image !== "string" || !theme.image || path.basename(theme.image) !== theme.image) {
    throw new Error(`${label} must reference one image beside theme.json`);
  }
  return theme;
}

async function readRegular(filePath, label, maxBytes) {
  let handle;
  try {
    handle = await fs.open(filePath, OPEN_FLAGS);
  } catch (error) {
    if (error.code === "ELOOP") throw new Error(`${label} must not be a symbolic link`);
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) {
      throw new Error(`${label} must be a non-empty regular file no larger than ${maxBytes} bytes`);
    }
    const bytes = await handle.readFile();
    if (bytes.length < 1 || bytes.length > maxBytes) {
      throw new Error(`${label} changed size while it was read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function normalizedFingerprint(theme, imageBytes, cssBytes = null, licenseBytes = null) {
  const semanticTheme = { ...theme };
  delete semanticTheme.id;
  const hash = createHash("sha256")
    .update(JSON.stringify(semanticTheme))
    .update("\0")
    .update(imageBytes);
  if (cssBytes) hash.update("\0theme.css\0").update(cssBytes);
  if (licenseBytes) hash.update("\0LICENSE.txt\0").update(licenseBytes);
  return hash.digest("hex");
}

function updateCanonicalLength(hash, value) {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(BigInt(value));
  hash.update(bytes);
}

function updateCanonicalString(hash, value) {
  const bytes = Buffer.from(value, "utf8");
  hash.update(Buffer.from([4]));
  updateCanonicalLength(hash, bytes.length);
  hash.update(bytes);
}

function updateCanonicalJsonValue(hash, value) {
  if (value === null) {
    hash.update(Buffer.from([0]));
  } else if (value === false) {
    hash.update(Buffer.from([1]));
  } else if (value === true) {
    hash.update(Buffer.from([2]));
  } else if (typeof value === "number") {
    const bytes = Buffer.allocUnsafe(8);
    bytes.writeDoubleBE(Object.is(value, -0) ? 0 : value);
    hash.update(Buffer.from([3])).update(bytes);
  } else if (typeof value === "string") {
    updateCanonicalString(hash, value);
  } else if (Array.isArray(value)) {
    hash.update(Buffer.from([5]));
    updateCanonicalLength(hash, value.length);
    for (const item of value) updateCanonicalJsonValue(hash, item);
  } else if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    hash.update(Buffer.from([6]));
    updateCanonicalLength(hash, keys.length);
    for (const key of keys) {
      updateCanonicalString(hash, key);
      updateCanonicalJsonValue(hash, value[key]);
    }
  } else {
    throw new TypeError("Theme JSON contains a value that cannot be canonicalized");
  }
}

function canonicalJsonFingerprint(value) {
  const hash = createHash("sha256").update("dreamskin-canonical-json/1\0", "utf8");
  updateCanonicalJsonValue(hash, value);
  return hash.digest("hex");
}

function sourceIdFallbackFingerprint(theme, imageBytes, cssBytes = null, licenseBytes = null) {
  const semanticTheme = { ...theme };
  delete semanticTheme.id;
  const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const identity = [
    "dreamskin-source-theme-fallback/1",
    "theme.json", canonicalJsonFingerprint(semanticTheme),
    "image", hashBytes(imageBytes),
    "theme.css", cssBytes ? hashBytes(cssBytes) : "absent",
    "LICENSE.txt", licenseBytes ? hashBytes(licenseBytes) : "absent",
  ].join("\0");
  return createHash("sha256").update(identity, "utf8").digest("hex");
}

function isWindowsReservedPathStem(value) {
  const stem = value.split(".", 1)[0];
  return /^(?:CON|PRN|AUX|NUL|COM[1-9\u00b9\u00b2\u00b3]|LPT[1-9\u00b9\u00b2\u00b3])$/i.test(stem);
}

function safeBaseId(value, fingerprint) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(candidate)
    && !candidate.endsWith(".")
    && !isWindowsReservedPathStem(candidate)
  ) return candidate;
  if (!candidate) return `import-${fingerprint.slice(0, 24)}`;
  const identity = createHash("sha256")
    .update("dreamskin-source-theme-id/1\0")
    .update(candidate)
    .digest("hex");
  return `import-${identity.slice(0, 24)}`;
}

function displayName(theme) {
  const value = typeof theme.name === "string" ? theme.name.trim() : "";
  return Array.from(value || "Codex Dream Skin").slice(0, 120).join("");
}

async function readStoredTheme(directory) {
  try {
    const configBytes = await readRegular(path.join(directory, "theme.json"), "Saved theme config", MAX_CONFIG_BYTES);
    const theme = decodeTheme(configBytes, "Saved theme config");
    const imageBytes = await readRegular(path.join(directory, theme.image), "Saved theme image", MAX_IMAGE_BYTES);
    const [cssBytes, licenseBytes] = await Promise.all([
      readOptionalRegular(path.join(directory, "theme.css"), "Saved theme CSS", MAX_CSS_BYTES),
      readOptionalRegular(path.join(directory, "LICENSE.txt"), "Saved theme license", MAX_LICENSE_BYTES),
    ]);
    if (cssBytes) decodeAndValidateSafeCss(cssBytes);
    const allowedFiles = new Set(["theme.json", theme.image, "theme.css", "LICENSE.txt"]);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const hasOnlyRuntimeFiles = entries.every((entry) =>
      entry.isFile() && !entry.isSymbolicLink() && allowedFiles.has(entry.name));
    return {
      theme,
      fingerprint: normalizedFingerprint(theme, imageBytes, cssBytes, licenseBytes),
      contentFingerprint: runtimeThemeContentFingerprint(theme, imageBytes, cssBytes),
      hasOnlyRuntimeFiles,
    };
  } catch {
    return null;
  }
}

async function readOptionalRegular(filePath, label, maxBytes) {
  try {
    return await readRegular(filePath, label, maxBytes);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function assertReplaceableDirectory(directory, label) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a real saved-theme directory`);
  }
}

function legacySuffixOf(value, baseId) {
  if (!baseId || value === baseId) return null;
  const match = value.match(/-([2-9][0-9]*)$/);
  if (!match) return null;
  const suffix = match[1];
  const marker = `-${suffix}`;
  const expectedPrefix = baseId.slice(0, Math.max(0, 80 - marker.length));
  if (value.slice(0, -marker.length) !== expectedPrefix) return null;
  if (!/^[2-9][0-9]*$/.test(suffix)) return null;
  const number = Number(suffix);
  return Number.isSafeInteger(number) ? number : null;
}

function isLegacySuffixRecord(record, baseId) {
  return legacySuffixOf(record.entryName, baseId) !== null
    && record.themeId === record.entryName;
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function readLockOwner(lock) {
  try {
    const bytes = await readRegular(path.join(lock, "owner.json"), "Theme import lock owner", 4096);
    const owner = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !owner
      || typeof owner !== "object"
      || Array.isArray(owner)
      || Object.keys(owner).sort().join("\0") !== "createdAt\0pid\0token"
      || !Number.isSafeInteger(owner.pid)
      || owner.pid < 1
      || typeof owner.createdAt !== "string"
      || !Number.isFinite(Date.parse(owner.createdAt))
      || typeof owner.token !== "string"
      || !/^[0-9a-f-]{36}$/.test(owner.token)
    ) return null;
    return owner;
  } catch {
    return null;
  }
}

async function acquireLock(root) {
  const lock = path.join(root, ".theme-import.lock");
  const token = randomUUID();
  while (true) {
    try {
      await fs.mkdir(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const stat = await fs.lstat(lock).catch(() => null);
      if (!stat?.isDirectory() || stat.isSymbolicLink()) {
        throw new Error("Theme import lock is not a trusted directory");
      }
      const owner = await readLockOwner(lock);
      if (owner && processIsAlive(owner.pid)) {
        throw new Error("Another theme import is still running; try again shortly");
      }
      if (!owner && Date.now() - stat.mtimeMs < 5 * 60 * 1000) {
        throw new Error("Another theme import is still starting; try again shortly");
      }
      const abandoned = path.join(root, `.theme-import-lock-stale-${randomUUID()}`);
      try {
        await fs.rename(lock, abandoned);
      } catch (renameError) {
        if (renameError.code === "ENOENT") continue;
        throw renameError;
      }
      await fs.rm(abandoned, { recursive: true, force: true });
    }
  }

  const owner = { pid: process.pid, token, createdAt: new Date().toISOString() };
  try {
    await writeDurableExclusive(
      path.join(lock, "owner.json"),
      Buffer.from(`${JSON.stringify(owner)}\n`, "utf8"),
    );
    await syncDirectory(root);
  } catch (error) {
    await fs.rm(lock, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return async () => {
    const current = await readLockOwner(lock);
    if (!current || current.token !== token || current.pid !== process.pid) return;
    const released = path.join(root, `.theme-import-lock-release-${token}`);
    try {
      await fs.rename(lock, released);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    await fs.rm(released, { recursive: true, force: true });
    await syncDirectory(root);
  };
}

async function resolveRealDirectory(directory, label) {
  const original = await fs.lstat(directory);
  if (!original.isDirectory() || original.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
  const resolved = await fs.realpath(directory);
  const resolvedStat = await fs.lstat(resolved);
  if (!resolvedStat.isDirectory() || resolvedStat.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
  return resolved;
}

async function syncDirectory(directory) {
  const handle = await fs.open(directory, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeDurableExclusive(filePath, bytes) {
  const handle = await fs.open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(path.dirname(filePath));
}

function replacementTransactionPath(themesRoot) {
  return path.join(themesRoot, `${REPLACEMENT_TRANSACTION_PREFIX}${randomUUID()}`);
}

async function createReplacementTransaction(
  themesRoot,
  candidateSource,
  destinationName,
  oldFingerprint,
  newFingerprint,
) {
  const journal = {
    schemaVersion: 1,
    destinationName: assertThemeId(destinationName, "Replacement destination"),
    oldFingerprint: assertFingerprint(oldFingerprint, "Replacement old fingerprint"),
    newFingerprint: assertFingerprint(newFingerprint, "Replacement new fingerprint"),
  };
  const transaction = replacementTransactionPath(themesRoot);
  assertContained(themesRoot, transaction, "Theme replacement transaction");
  await fs.mkdir(transaction, { mode: 0o700 });
  await fs.chmod(transaction, 0o700);
  const candidate = path.join(transaction, REPLACEMENT_CANDIDATE_NAME);
  await fs.rename(candidateSource, candidate);
  await syncDirectory(transaction);
  await assertStoredFingerprint(candidate, journal.newFingerprint, "Theme replacement candidate");
  await writeDurableExclusive(
    path.join(transaction, REPLACEMENT_JOURNAL_NAME),
    Buffer.from(`${JSON.stringify(journal)}\n`, "utf8"),
  );
  await syncDirectory(themesRoot);
  return {
    root: transaction,
    backup: path.join(transaction, REPLACEMENT_BACKUP_NAME),
    candidate,
    committed: path.join(transaction, REPLACEMENT_COMMIT_NAME),
    journal,
  };
}

async function readReplacementJournal(transaction) {
  const journalPath = path.join(transaction, REPLACEMENT_JOURNAL_NAME);
  const bytes = await readRegular(
    journalPath,
    "Theme replacement journal",
    MAX_REPLACEMENT_JOURNAL_BYTES,
  );
  let journal;
  try {
    journal = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Theme replacement journal is invalid JSON");
  }
  if (!journal || typeof journal !== "object" || Array.isArray(journal)) {
    throw new Error("Theme replacement journal must be an object");
  }
  const keys = Object.keys(journal).sort();
  if (
    keys.join("\0") !== [
      "destinationName",
      "newFingerprint",
      "oldFingerprint",
      "schemaVersion",
    ].join("\0")
    || journal.schemaVersion !== 1
  ) throw new Error("Theme replacement journal has an unsupported schema");
  return {
    schemaVersion: 1,
    destinationName: assertThemeId(journal.destinationName, "Replacement destination"),
    oldFingerprint: assertFingerprint(journal.oldFingerprint, "Replacement old fingerprint"),
    newFingerprint: assertFingerprint(journal.newFingerprint, "Replacement new fingerprint"),
  };
}

async function replacementEntryState(transaction) {
  await assertReplaceableDirectory(transaction, "Theme replacement transaction");
  const entries = await fs.readdir(transaction, { withFileTypes: true });
  const allowed = new Set([
    REPLACEMENT_JOURNAL_NAME,
    REPLACEMENT_BACKUP_NAME,
    REPLACEMENT_CANDIDATE_NAME,
    REPLACEMENT_COMMIT_NAME,
    REPLACEMENT_COMMIT_TEMP_NAME,
  ]);
  for (const entry of entries) {
    if (!allowed.has(entry.name) || entry.isSymbolicLink()) {
      throw new Error("Theme replacement transaction contains an unexpected entry");
    }
    if (
      (entry.name === REPLACEMENT_BACKUP_NAME || entry.name === REPLACEMENT_CANDIDATE_NAME)
        ? !entry.isDirectory()
        : !entry.isFile()
    ) throw new Error("Theme replacement transaction entry has the wrong type");
  }
  return new Set(entries.map((entry) => entry.name));
}

async function commitReplacementTransaction(transaction) {
  const temporaryMarker = path.join(transaction.root, REPLACEMENT_COMMIT_TEMP_NAME);
  await writeDurableExclusive(
    temporaryMarker,
    Buffer.from("dreamskin-theme-replace-commit/1\n", "utf8"),
  );
  await fs.rename(temporaryMarker, transaction.committed);
  await syncDirectory(transaction.root);
}

async function assertReplacementCommitMarker(markerPath, label) {
  const bytes = await readRegular(markerPath, label, 128);
  if (bytes.toString("utf8") !== "dreamskin-theme-replace-commit/1\n") {
    throw new Error(`${label} is invalid`);
  }
}

async function removeReplacementTransaction(transaction, themesRoot) {
  assertContained(themesRoot, transaction, "Theme replacement transaction cleanup");
  await replacementEntryState(transaction);
  await fs.rm(transaction, { recursive: true, force: false });
  if (await pathExists(transaction)) {
    throw new Error("Theme replacement transaction cleanup was not verified");
  }
  await syncDirectory(themesRoot);
}

async function recoverJournaledReplacement(themesRoot, transaction, journal) {
  const entries = await replacementEntryState(transaction);
  const destination = path.join(themesRoot, journal.destinationName);
  const backup = path.join(transaction, REPLACEMENT_BACKUP_NAME);
  const candidate = path.join(transaction, REPLACEMENT_CANDIDATE_NAME);
  assertContained(themesRoot, destination, "Recovered theme destination");
  const committed = entries.has(REPLACEMENT_COMMIT_NAME);
  const commitTemporary = entries.has(REPLACEMENT_COMMIT_TEMP_NAME);
  const backupExists = entries.has(REPLACEMENT_BACKUP_NAME);
  const candidateExists = entries.has(REPLACEMENT_CANDIDATE_NAME);
  const destinationExists = await pathExists(destination);

  if (committed) {
    if (commitTemporary) {
      throw new Error("Committed theme replacement still contains a temporary commit marker");
    }
    await assertReplacementCommitMarker(
      path.join(transaction, REPLACEMENT_COMMIT_NAME),
      "Theme replacement commit marker",
    );
    if (!destinationExists) throw new Error("Committed theme replacement destination is missing");
    await assertStoredFingerprint(
      destination,
      journal.newFingerprint,
      "Committed theme replacement destination",
    );
    if (candidateExists) {
      throw new Error("Committed theme replacement still contains a candidate directory");
    }
    if (backupExists) {
      await assertStoredFingerprint(backup, journal.oldFingerprint, "Theme replacement backup");
    }
    await removeReplacementTransaction(transaction, themesRoot);
    return "committed";
  }

  if (!backupExists) {
    if (!destinationExists || !candidateExists) {
      throw new Error("Prepared theme replacement is missing its recovery copy");
    }
    await assertStoredFingerprint(
      destination,
      journal.oldFingerprint,
      "Prepared theme replacement destination",
    );
    await assertStoredFingerprint(
      candidate,
      journal.newFingerprint,
      "Prepared theme replacement candidate",
    );
    if (commitTemporary) {
      await assertReplacementCommitMarker(
        path.join(transaction, REPLACEMENT_COMMIT_TEMP_NAME),
        "Temporary theme replacement commit marker",
      );
    }
    await removeReplacementTransaction(transaction, themesRoot);
    return "unchanged";
  }

  await assertStoredFingerprint(backup, journal.oldFingerprint, "Theme replacement backup");

  if (destinationExists) {
    if (candidateExists) {
      throw new Error("Prepared theme replacement has both a candidate and destination");
    }
    await assertReplaceableDirectory(destination, "Uncommitted theme replacement destination");
    await fs.rename(destination, candidate);
    await syncDirectory(themesRoot);
  }

  await fs.rename(backup, destination);
  await syncDirectory(themesRoot);
  await assertStoredFingerprint(
    destination,
    journal.oldFingerprint,
    "Recovered canonical saved theme",
  );
  if (!(await pathExists(candidate))) {
    throw new Error("Recovered canonical saved theme, but replacement evidence is incomplete");
  }
  await assertStoredFingerprint(
    candidate,
    journal.newFingerprint,
    "Uncommitted theme replacement candidate",
  );
  if (commitTemporary) {
    await assertReplacementCommitMarker(
      path.join(transaction, REPLACEMENT_COMMIT_TEMP_NAME),
      "Temporary theme replacement commit marker",
    );
  }
  await removeReplacementTransaction(transaction, themesRoot);
  return "rolled-back";
}

async function recoverLegacyReplacement(themesRoot, transaction) {
  const stored = await readStoredTheme(transaction);
  if (!stored) throw new Error("Legacy theme replacement backup has no valid journal or theme");
  const destinationName = assertThemeId(stored.theme.id, "Legacy replacement destination");
  const destination = path.join(themesRoot, destinationName);
  assertContained(themesRoot, destination, "Legacy replacement destination");
  if (await pathExists(destination)) return "retained-legacy";
  await fs.rename(transaction, destination);
  await syncDirectory(themesRoot);
  await assertStoredFingerprint(
    destination,
    stored.fingerprint,
    "Recovered legacy canonical saved theme",
  );
  return "rolled-back-legacy";
}

async function recoverUnjournaledReplacement(themesRoot, transaction) {
  const stored = await readStoredTheme(transaction);
  if (stored) return recoverLegacyReplacement(themesRoot, transaction);

  const entries = await replacementEntryState(transaction);
  if (
    entries.size !== 1
    || !entries.has(REPLACEMENT_CANDIDATE_NAME)
  ) throw new Error("Theme replacement recovery journal is missing");
  const candidate = path.join(transaction, REPLACEMENT_CANDIDATE_NAME);
  const candidateStored = await readStoredTheme(candidate);
  if (!candidateStored) throw new Error("Unjournaled theme replacement candidate is invalid");
  const destinationName = assertThemeId(
    candidateStored.theme.id,
    "Unjournaled replacement destination",
  );
  const destination = path.join(themesRoot, destinationName);
  if (!(await pathExists(destination))) {
    throw new Error("Unjournaled theme replacement has no canonical destination");
  }
  const destinationStored = await readStoredTheme(destination);
  if (!destinationStored || destinationStored.theme.id !== destinationName) {
    throw new Error("Unjournaled theme replacement canonical identity is invalid");
  }
  await removeReplacementTransaction(transaction, themesRoot);
  return "discarded-unprepared";
}

async function recoverReplacementTransactions(themesRoot) {
  const entries = (await fs.readdir(themesRoot, { withFileTypes: true }))
    .filter((entry) => entry.name.startsWith(REPLACEMENT_TRANSACTION_PREFIX));
  const transactions = [];
  const destinationNames = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error("Theme replacement recovery entry must be a real directory");
    }
    const transaction = path.join(themesRoot, entry.name);
    assertContained(themesRoot, transaction, "Theme replacement recovery entry");
    const journalPath = path.join(transaction, REPLACEMENT_JOURNAL_NAME);
    if (!(await pathExists(journalPath))) {
      const stored = await readStoredTheme(transaction)
        ?? await readStoredTheme(path.join(transaction, REPLACEMENT_CANDIDATE_NAME));
      if (!stored) throw new Error("Theme replacement recovery journal is missing");
      const destinationName = assertThemeId(stored.theme.id, "Legacy replacement destination");
      if (destinationNames.has(destinationName)) {
        throw new Error(`Multiple theme replacement transactions target ${destinationName}`);
      }
      destinationNames.add(destinationName);
      transactions.push({ transaction, journal: null });
      continue;
    }
    const journal = await readReplacementJournal(transaction);
    if (destinationNames.has(journal.destinationName)) {
      throw new Error(`Multiple theme replacement transactions target ${journal.destinationName}`);
    }
    destinationNames.add(journal.destinationName);
    transactions.push({ transaction, journal });
  }
  const recovered = [];
  for (const record of transactions) {
    recovered.push(record.journal
      ? await recoverJournaledReplacement(themesRoot, record.transaction, record.journal)
      : await recoverUnjournaledReplacement(themesRoot, record.transaction));
  }
  return recovered;
}

async function main() {
  const themesRoot = await resolveRealDirectory(themesRootArg, "Saved themes root");
  if (recoveryOnly) {
    const releaseLock = await acquireLock(themesRoot);
    try {
      const recovered = await recoverReplacementTransactions(themesRoot);
      return { status: "recovered", recovered };
    } finally {
      await releaseLock();
    }
  }
  const stageRoot = await resolveRealDirectory(stageDirArg, "Theme import stage");

  const configBytes = await readRegular(path.join(stageRoot, "theme.json"), "Imported theme config", MAX_CONFIG_BYTES);
  const sourceTheme = decodeTheme(configBytes, "Imported theme config");
  const imagePath = path.join(stageRoot, sourceTheme.image);
  assertContained(stageRoot, imagePath, "Imported theme image");
  const imageBytes = await readRegular(imagePath, "Imported theme image", MAX_IMAGE_BYTES);
  const [manifestBytes, cssBytes, licenseBytes, signatureBytes] = await Promise.all([
    readOptionalRegular(path.join(stageRoot, "manifest.json"), "Imported manifest", MAX_MANIFEST_BYTES),
    readOptionalRegular(path.join(stageRoot, "theme.css"), "Imported theme CSS", MAX_CSS_BYTES),
    readOptionalRegular(path.join(stageRoot, "LICENSE.txt"), "Imported theme license", MAX_LICENSE_BYTES),
    readOptionalRegular(path.join(stageRoot, "manifest.sig"), "Imported reserved signature", MAX_SIGNATURE_BYTES),
  ]);
  const packageFormat = manifestBytes ? "official" : "simple";
  if (!cssBytes) throw new Error("New theme imports require non-empty theme.css");
  decodeAndValidateSafeCss(cssBytes);
  const safeCssStatus = "validated";
  const fingerprint = normalizedFingerprint(sourceTheme, imageBytes, cssBytes, licenseBytes);
  const fallbackFingerprint = sourceIdFallbackFingerprint(
    sourceTheme,
    imageBytes,
    cssBytes,
    licenseBytes,
  );
  const releaseLock = await acquireLock(themesRoot);
  let temporary = "";
  try {
    await recoverReplacementTransactions(themesRoot);
    const entries = await fs.readdir(themesRoot, { withFileTypes: true });
    const records = [];
    const storedById = new Map();
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const directory = path.join(themesRoot, entry.name);
      const stored = await readStoredTheme(directory);
      if (!stored) continue;
      const record = {
        entryName: entry.name,
        directory,
        stored,
        theme: stored.theme,
        themeId: typeof stored.theme.id === "string" ? stored.theme.id.trim() : "",
        name: displayName(stored.theme),
        fingerprint: stored.fingerprint,
        contentFingerprint: stored.contentFingerprint,
      };
      records.push(record);
      storedById.set(entry.name, record);
    }

    const baseId = safeBaseId(sourceTheme.id, fallbackFingerprint);
    let id = baseId;
    const existingForId = storedById.get(id) ?? null;
    const canonicalFingerprint = existingForId?.entryName === baseId
      ? existingForId.fingerprint
      : null;
    const legacySuffixRecords = records
      .filter((record) => isLegacySuffixRecord(record, baseId))
      .sort((a, b) => legacySuffixOf(a.entryName, baseId) - legacySuffixOf(b.entryName, baseId));
    const exactRecords = records.filter((record) => record.fingerprint === fingerprint);
    const exactCanonical = exactRecords.find((record) => record.entryName === baseId) ?? null;
    const exactLegacy = exactRecords.filter((record) => isLegacySuffixRecord(record, baseId));
    const exactUnrelated = exactRecords.find((record) =>
      record.entryName !== baseId && !isLegacySuffixRecord(record, baseId));
    if (!existingForId && exactUnrelated && exactLegacy.length === 0) {
      return {
        status: "duplicate",
        id: exactUnrelated.entryName,
        name: exactUnrelated.name,
        renamed: false,
        nameCollision: false,
        packageFormat,
        safeCssStatus,
        signatureIgnored: Boolean(signatureBytes),
        contentFingerprint: exactUnrelated.contentFingerprint,
      };
    }
    // A suffix and a display name are not proof of lineage: a legitimate
    // theme may intentionally use an ID such as `${baseId}-2`. Only an
    // identical semantic fingerprint makes cleanup safe and reversible.
    const legacyCleanupRecords = legacySuffixRecords.filter((record) =>
      record.entryName !== baseId
      && record.fingerprint === fingerprint
      && record.stored.hasOnlyRuntimeFiles);
    if (exactCanonical && legacyCleanupRecords.length === 0) {
      return {
        status: "duplicate",
        id: exactCanonical.entryName,
        name: exactCanonical.name,
        renamed: false,
        nameCollision: false,
        packageFormat,
        safeCssStatus,
        signatureIgnored: Boolean(signatureBytes),
        contentFingerprint: exactCanonical.contentFingerprint,
      };
    }
    const baseDestination = path.join(themesRoot, id);
    const basePathExists = await pathExists(baseDestination);
    if (basePathExists) {
      const baseStat = await fs.lstat(baseDestination);
      if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) {
        throw new Error("Existing saved theme path is not a directory; refusing replacement");
      }
      if (!existingForId || existingForId.themeId !== baseId) {
        throw new Error("Existing saved theme identity could not be confirmed for replacement");
      }
    }
    const replaceExisting = basePathExists;
    if (!replaceExisting) {
      let suffix = 2;
      while (await pathExists(path.join(themesRoot, id))) {
        const marker = `-${suffix}`;
        id = `${baseId.slice(0, 80 - marker.length)}${marker}`;
        suffix += 1;
      }
    }
    const renamed = id !== (typeof sourceTheme.id === "string" ? sourceTheme.id.trim() : "");
    const theme = { ...sourceTheme, id };
    const name = displayName(theme);
    const contentFingerprint = runtimeThemeContentFingerprint(theme, imageBytes, cssBytes);
    const destination = path.join(themesRoot, id);
    assertContained(themesRoot, destination, "Imported theme destination");

    temporary = await fs.mkdtemp(path.join(themesRoot, ".theme-import-"));
    await fs.chmod(temporary, 0o700);
    await writeDurableExclusive(path.join(temporary, theme.image), imageBytes);
    await writeDurableExclusive(
      path.join(temporary, "theme.json"),
      Buffer.from(`${JSON.stringify(theme, null, 2)}\n`, "utf8"),
    );
    if (cssBytes) await writeDurableExclusive(path.join(temporary, "theme.css"), cssBytes);
    if (licenseBytes) {
      await writeDurableExclusive(path.join(temporary, "LICENSE.txt"), licenseBytes);
    }
    let replacementTransaction = null;
    let publishedDestination = false;
    if (replaceExisting) {
      replacementTransaction = await createReplacementTransaction(
        themesRoot,
        temporary,
        id,
        canonicalFingerprint,
        fingerprint,
      );
      temporary = "";
    }
    const publishSource = replacementTransaction?.candidate ?? temporary;
    try {
      if (replacementTransaction) {
        await fs.rename(destination, replacementTransaction.backup);
        await syncDirectory(themesRoot);
        await syncDirectory(replacementTransaction.root);
      }
      await fs.rename(publishSource, destination);
      publishedDestination = true;
      if (!replacementTransaction) temporary = "";
      await syncDirectory(themesRoot);
      const published = await readStoredTheme(destination);
      if (!published || published.fingerprint !== fingerprint) {
        throw new Error("Published theme content does not match the validated import payload");
      }
      if (replacementTransaction) {
        await commitReplacementTransaction(replacementTransaction);
      }
    } catch (error) {
      const rollbackErrors = [];
      if (publishedDestination) {
        try {
          if (replacementTransaction) {
            if (await pathExists(replacementTransaction.candidate)) {
              throw new Error("replacement candidate already exists");
            }
            await fs.rename(destination, replacementTransaction.candidate);
          } else if (await pathExists(destination)) {
            await assertReplaceableDirectory(destination, "Published theme rollback target");
            const quarantine = path.join(themesRoot, `.theme-failed-${randomUUID()}`);
            assertContained(themesRoot, quarantine, "Failed theme quarantine");
            await fs.rename(destination, quarantine);
            await removeDirectoryVerified(quarantine, "Failed theme quarantine");
          }
          if (await pathExists(destination)) throw new Error("published destination remains");
        } catch (rollbackError) {
          rollbackErrors.push(`${destination}: ${rollbackError.message}`);
        }
      }
      if (replacementTransaction) {
        try {
          const backupExists = await pathExists(replacementTransaction.backup);
          const destinationExists = await pathExists(destination);
          if (backupExists) {
            if (destinationExists) throw new Error("new destination remains");
            await fs.rename(replacementTransaction.backup, destination);
            await syncDirectory(themesRoot);
          }
          if (await pathExists(replacementTransaction.backup)) {
            throw new Error("replacement backup remains after restore");
          }
          if (!(await pathExists(destination))) throw new Error("original directory was not restored");
          await assertStoredFingerprint(destination, canonicalFingerprint, "Canonical saved theme");
          await removeReplacementTransaction(replacementTransaction.root, themesRoot);
        } catch (rollbackError) {
          rollbackErrors.push(`${destination}: ${rollbackError.message}`);
        }
      } else {
        try {
          if (await pathExists(destination)) {
            throw new Error("unexpected destination remains after rollback");
          }
        } catch (rollbackError) {
          rollbackErrors.push(`${destination}: ${rollbackError.message}`);
        }
      }
      if (rollbackErrors.length > 0) {
        throw new Error(`${error.message}; import rollback was not verified: ${rollbackErrors.join("; ")}`);
      }
      throw error;
    }

    let cleanupWarning = null;
    const cleanupErrors = [];
    if (replacementTransaction) {
      try {
        await removeReplacementTransaction(replacementTransaction.root, themesRoot);
      } catch (error) {
        cleanupErrors.push(error.message);
      }
    }
    // Canonical publication is durably committed before legacy exact-duplicate
    // cleanup. A hard stop here can only retain an identical hidden duplicate;
    // it can no longer cause the canonical replacement to roll back.
    for (const record of legacyCleanupRecords) {
      if (record.entryName === id) continue;
      const cleanupBackup = path.join(
        themesRoot,
        `.theme-legacy-cleanup-${randomUUID()}`,
      );
      try {
        await assertReplaceableDirectory(record.directory, "Legacy saved theme duplicate");
        assertContained(themesRoot, cleanupBackup, "Legacy saved theme cleanup backup");
        await fs.rename(record.directory, cleanupBackup);
        await removeDirectoryVerified(cleanupBackup, "Legacy duplicate cleanup backup");
      } catch (error) {
        cleanupErrors.push(error.message);
      }
    }
    if (cleanupErrors.length > 0) {
      cleanupWarning = `Imported theme backup cleanup was not verified: ${cleanupErrors.join("; ")}`;
    }
    return {
      status: "imported",
      id,
      name,
      renamed,
      replaced: replaceExisting,
      nameCollision: records.some((record) =>
        record.name === name
        && record.entryName !== id
        && !legacyCleanupRecords.some((legacy) => legacy.entryName === record.entryName)),
      packageFormat,
      safeCssStatus,
      signatureIgnored: Boolean(signatureBytes),
      contentFingerprint,
      cleanupWarning,
    };
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
    await releaseLock();
  }
}

process.stdout.write(`${JSON.stringify(await main())}\n`);
