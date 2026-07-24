import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const [stageDirArg, themesRootArg] = process.argv.slice(2);
if (!stageDirArg || !themesRootArg) {
  throw new Error("Usage: publish-theme-import.mjs <validated-stage-dir> <saved-themes-root>");
}

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
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

function safeBaseId(value, fingerprint) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(candidate)) return candidate;
  return `import-${fingerprint.slice(0, 12)}`;
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
    return { theme, fingerprint: normalizedFingerprint(theme, imageBytes, cssBytes, licenseBytes) };
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
  const fingerprint = normalizedFingerprint(sourceTheme, imageBytes, cssBytes, licenseBytes);
  const releaseLock = await acquireLock(themesRoot);
  let temporary = "";
  try {
    const entries = await fs.readdir(themesRoot, { withFileTypes: true });
    const existingNames = new Set();
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const directory = path.join(themesRoot, entry.name);
      const stored = await readStoredTheme(directory);
      if (!stored) continue;
      existingNames.add(displayName(stored.theme));
      if (stored.fingerprint === fingerprint) {
        return {
          status: "duplicate",
          id: entry.name,
          name: displayName(stored.theme),
          renamed: false,
          nameCollision: false,
          packageFormat,
          cssIgnored: Boolean(cssBytes),
          signatureIgnored: Boolean(signatureBytes),
        };
      }
    }

    const baseId = safeBaseId(sourceTheme.id, fingerprint);
    let id = baseId;
    let suffix = 2;
    while (await fs.access(path.join(themesRoot, id)).then(() => true, () => false)) {
      const marker = `-${suffix}`;
      id = `${baseId.slice(0, 80 - marker.length)}${marker}`;
      suffix += 1;
    }
    const renamed = id !== (typeof sourceTheme.id === "string" ? sourceTheme.id.trim() : "");
    const theme = { ...sourceTheme, id };
    const name = displayName(theme);
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
    await fs.rename(temporary, destination);
    temporary = "";
    return {
      status: "imported",
      id,
      name,
      renamed,
      nameCollision: existingNames.has(name),
      packageFormat,
      cssIgnored: Boolean(cssBytes),
      signatureIgnored: Boolean(signatureBytes),
    };
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
    await releaseLock();
  }
}

process.stdout.write(`${JSON.stringify(await main())}\n`);
