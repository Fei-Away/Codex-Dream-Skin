import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { decodeAndValidateSafeCss } from "../assets/safe-css-validator.mjs";
import { runtimeThemeContentFingerprint } from "./theme-content-fingerprint.mjs";

const [stageDirArg, themesRootArg] = process.argv.slice(2);
if (!stageDirArg || !themesRootArg) {
  throw new Error("Usage: publish-theme-import.mjs <validated-stage-dir> <saved-themes-root>");
}

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CSS_BYTES = 256 * 1024;
const MAX_LICENSE_BYTES = 64 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SIGNATURE_BYTES = 4 * 1024;
const OPEN_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);

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

async function writeExclusive(filePath, bytes) {
  await fs.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
  await fs.chmod(filePath, 0o600);
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

async function acquireLock(root) {
  const lock = path.join(root, ".theme-import.lock");
  try {
    await fs.mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const stat = await fs.lstat(lock).catch(() => null);
    if (!stat?.isDirectory() || stat.isSymbolicLink() || Date.now() - stat.mtimeMs < 5 * 60 * 1000) {
      throw new Error("Another theme import is still running; try again shortly");
    }
    await fs.rm(lock, { recursive: true, force: true });
    await fs.mkdir(lock, { mode: 0o700 });
  }
  await fs.writeFile(
    path.join(lock, "owner.json"),
    `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
    { flag: "wx", mode: 0o600 },
  );
  return async () => fs.rm(lock, { recursive: true, force: true });
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

async function main() {
  const [stageRoot, themesRoot] = await Promise.all([
    resolveRealDirectory(stageDirArg, "Theme import stage"),
    resolveRealDirectory(themesRootArg, "Saved themes root"),
  ]);

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
    await writeExclusive(path.join(temporary, theme.image), imageBytes);
    await writeExclusive(
      path.join(temporary, "theme.json"),
      Buffer.from(`${JSON.stringify(theme, null, 2)}\n`, "utf8"),
    );
    if (cssBytes) await writeExclusive(path.join(temporary, "theme.css"), cssBytes);
    if (licenseBytes) await writeExclusive(path.join(temporary, "LICENSE.txt"), licenseBytes);
    let replacementBackup = "";
    let publishedDestination = false;
    const legacyCleanupBackups = [];
    try {
      if (replaceExisting) {
        replacementBackup = path.join(themesRoot, `.theme-replace-${randomUUID()}`);
        assertContained(themesRoot, replacementBackup, "Imported theme replacement backup");
        await fs.rename(destination, replacementBackup);
      }
      await fs.rename(temporary, destination);
      publishedDestination = true;
      temporary = "";
      const published = await readStoredTheme(destination);
      if (!published || published.fingerprint !== fingerprint) {
        throw new Error("Published theme content does not match the validated import payload");
      }
      for (const record of legacyCleanupRecords) {
        if (record.entryName === id) continue;
        await assertReplaceableDirectory(record.directory, "Legacy saved theme duplicate");
        const cleanupBackup = path.join(
          themesRoot,
          `.theme-legacy-cleanup-${randomUUID()}`,
        );
        assertContained(themesRoot, cleanupBackup, "Legacy saved theme cleanup backup");
        legacyCleanupBackups.push({
          original: record.directory,
          backup: cleanupBackup,
          fingerprint: record.fingerprint,
        });
        await fs.rename(record.directory, cleanupBackup);
      }
    } catch (error) {
      const rollbackErrors = [];
      for (const record of [...legacyCleanupBackups].reverse()) {
        try {
          const backupExists = await pathExists(record.backup);
          const originalExists = await pathExists(record.original);
          if (backupExists) {
            if (originalExists) throw new Error("original cleanup path already exists");
            await fs.rename(record.backup, record.original);
          }
          if (await pathExists(record.backup)) throw new Error("cleanup backup remains after restore");
          if (!(await pathExists(record.original))) throw new Error("original cleanup directory was not restored");
          await assertStoredFingerprint(
            record.original,
            record.fingerprint,
            `Legacy saved theme ${record.original}`,
          );
        } catch (rollbackError) {
          rollbackErrors.push(`${record.original}: ${rollbackError.message}`);
        }
      }
      if (publishedDestination) {
        try {
          if (await pathExists(destination)) {
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
      if (replacementBackup) {
        try {
          const backupExists = await pathExists(replacementBackup);
          const destinationExists = await pathExists(destination);
          if (backupExists) {
            if (destinationExists) throw new Error("new destination remains");
            await fs.rename(replacementBackup, destination);
          }
          if (await pathExists(replacementBackup)) throw new Error("replacement backup remains after restore");
          if (!(await pathExists(destination))) throw new Error("original directory was not restored");
          await assertStoredFingerprint(destination, canonicalFingerprint, "Canonical saved theme");
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
    try {
      for (const record of legacyCleanupBackups) {
        await removeDirectoryVerified(record.backup, "Legacy duplicate cleanup backup");
      }
      // Keep the canonical backup until every legacy cleanup has succeeded. It
      // is the last recovery copy to be discarded on a successful import.
      if (replacementBackup) {
        await removeDirectoryVerified(replacementBackup, "Theme replacement backup");
      }
    } catch (error) {
      // The published destination has already passed its final fingerprint
      // check. Retain the recovery copy and report cleanup separately instead
      // of rolling back or misreporting the committed import as a failure.
      cleanupWarning = `Imported theme backup cleanup was not verified: ${error.message}`;
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
