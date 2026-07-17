import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const [mode, configPath, backupPath] = process.argv.slice(2);
// Backup these keys so Restore can put them back. Do NOT force dark —
// Dream Skin CSS auto-adapts to light/dark via data-dream-shell.
const settings = new Map([
  ["appearanceTheme", null],
  ["appearanceDarkCodeThemeId", null],
]);

if (!["install", "restore"].includes(mode) || !configPath || !backupPath) {
  throw new Error("Usage: theme-config.mjs <install|restore> <config-path> <backup-path>");
}

function desktopSection(content) {
  const headers = [...content.matchAll(/^[\t ]*\[[\t ]*desktop[\t ]*\][\t ]*(?:#[^\r\n]*)?(?:\r?\n|$)/gm)];
  if (headers.length > 1) throw new Error("Refusing to rewrite multiple [desktop] tables.");
  const header = headers[0];
  if (!header) return null;
  const bodyStart = header.index + header[0].length;
  const remainder = content.slice(bodyStart);
  const nextHeader = /^[\t ]*\[/m.exec(remainder);
  const bodyEnd = nextHeader ? bodyStart + nextHeader.index : content.length;
  return { bodyStart, bodyEnd, body: content.slice(bodyStart, bodyEnd) };
}

function tomlStructureForLine(line) {
  let result = "";
  let quote = null;
  let escaped = false;
  for (const character of line) {
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (quote === "'") {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "#") {
      break;
    } else {
      result += character;
    }
  }
  return result;
}

function assertSupportedTomlLayout(content) {
  for (const line of content.split(/\r?\n/)) {
    const structure = tomlStructureForLine(line);
    const assignment = structure.indexOf("=");
    if (assignment < 0) continue;
    let depth = 0;
    for (const character of structure.slice(assignment + 1)) {
      if (character === "[") depth += 1;
      if (character === "]") depth -= 1;
    }
    if (depth > 0) {
      throw new Error("Refusing to rewrite TOML containing multiline arrays.");
    }
  }
}

function settingLines(body, key) {
  const token = key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  const matches = body.match(new RegExp(`^${token}[\\t ]*=.*$`, "gm")) ?? [];
  if (matches.length > 1) throw new Error(`Refusing to rewrite duplicate ${key} settings.`);
  return { matches, token };
}

function validateBackup(backup) {
  if (
    backup?.schemaVersion !== 1
    || backup.platform !== "darwin"
    || backup.configPath !== configPath
    || !backup.values
    || typeof backup.values !== "object"
    || Array.isArray(backup.values)
  ) {
    throw new Error("Theme backup identity or schema does not match this config; nothing was restored.");
  }
  const expectedKeys = [...settings.keys()];
  const actualKeys = Object.keys(backup.values);
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key) => !settings.has(key))
    || expectedKeys.some((key) => !Object.hasOwn(backup.values, key))
  ) {
    throw new Error("Theme backup contains unexpected or missing settings; nothing was restored.");
  }
  for (const key of expectedKeys) {
    const line = backup.values[key];
    if (line === null) continue;
    const token = key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    const assignment = new RegExp(`^${token}[\\t ]*=[\\t ]*[^\\r\\n\\u2028\\u2029]*$`, "u");
    if (
      typeof line !== "string"
      || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/u.test(line)
      || !assignment.test(line)
    ) {
      throw new Error(`Theme backup contains an invalid ${key} assignment; nothing was restored.`);
    }
  }
}

function replaceSetting(body, key, line) {
  const { token } = settingLines(body, key);
  const pattern = new RegExp(`^${token}[\\t ]*=.*(?:\\r?\\n)?`, "m");
  const newline = body.includes("\r\n") ? "\r\n" : "\n";
  if (line === null) return body.replace(pattern, "");
  if (pattern.test(body)) return body.replace(pattern, `${line}${newline}`);
  const separator = body.length && !body.endsWith("\n") ? newline : "";
  return `${body}${separator}${line}${newline}`;
}

async function atomicWrite(file, value, modeBits, expectedBytes = null, expectedStat = null) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, value, { mode: modeBits, flag: "wx" });
    if (expectedBytes) await assertConfigUnchanged(expectedBytes, expectedStat);
    await fs.rename(temporary, file);
    await fs.chmod(file, modeBits);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function decodeStrictUtf8(bytes, label) {
  const content = bytes.toString("utf8");
  if (!Buffer.from(content, "utf8").equals(bytes)) {
    throw new Error(`${label} is not valid UTF-8; nothing was changed.`);
  }
  if (content.includes("\0")) {
    throw new Error(`${label} contains NUL characters; nothing was changed.`);
  }
  return content;
}

async function acquireConfigLock() {
  const lockPath = `${configPath}.dream-skin.lock`;
  const deadline = Date.now() + 5000;
  while (true) {
    let created = false;
    try {
      await fs.mkdir(lockPath, { mode: 0o700 });
      created = true;
      await fs.writeFile(
        path.join(lockPath, "owner.json"),
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
        { mode: 0o600, flag: "wx" },
      );
      return async () => fs.rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (created) {
        await fs.rm(lockPath, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
      if (error.code !== "EEXIST") {
        throw error;
      }
      const lockStat = await fs.lstat(lockPath).catch(() => null);
      if (lockStat?.isSymbolicLink() || (lockStat && !lockStat.isDirectory())) {
        throw new Error(`Unsafe config lock path: ${lockPath}`);
      }
      if (lockStat && Date.now() - lockStat.mtimeMs > 30000) {
        let ownerAlive = false;
        try {
          const owner = JSON.parse(await fs.readFile(path.join(lockPath, "owner.json"), "utf8"));
          if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
            try {
              process.kill(owner.pid, 0);
              ownerAlive = true;
            } catch (probeError) {
              ownerAlive = probeError.code === "EPERM";
            }
          }
        } catch {}
        if (!ownerAlive) {
          await fs.rm(lockPath, { recursive: true, force: true });
          continue;
        }
      }
      if (Date.now() >= deadline) {
        throw new Error("Another Dream Skin config operation is still running; try again shortly.");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function assertConfigUnchanged(expectedBytes, expectedStat = null) {
  const currentStat = await fs.lstat(configPath);
  if (
    currentStat.isSymbolicLink()
    || !currentStat.isFile()
    || (expectedStat && (currentStat.dev !== expectedStat.dev || currentStat.ino !== expectedStat.ino))
  ) {
    throw new Error("Codex config file identity changed during this operation; nothing was overwritten.");
  }
  const currentBytes = await fs.readFile(configPath);
  if (!currentBytes.equals(expectedBytes)) {
    throw new Error("Codex config changed during this operation; nothing was overwritten.");
  }
}

async function main() {
  let originalBytes;
  let content;
  try {
    originalBytes = await fs.readFile(configPath);
    content = decodeStrictUtf8(originalBytes, "Codex config");
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Codex config not found: ${configPath}`);
    throw error;
  }

  const originalStat = await fs.lstat(configPath);
  if (originalStat.isSymbolicLink() || !originalStat.isFile()) {
    throw new Error("Codex config must be a regular file, not a symbolic link.");
  }
  if (content.includes('"""') || content.includes("'''")) {
    throw new Error("Refusing to rewrite TOML containing multiline strings.");
  }
  assertSupportedTomlLayout(content);
  let section = desktopSection(content);

  if (mode === "install") {
    if (!section) {
      content = `${content.trimEnd()}\n\n[desktop]\n`;
      section = desktopSection(content);
    }
    try {
      await fs.access(backupPath);
    } catch {
      const values = {};
      for (const key of settings.keys()) {
        const { matches } = settingLines(section.body, key);
        values[key] = matches[0] ?? null;
      }
      const backup = {
        schemaVersion: 1,
        platform: "darwin",
        createdAt: new Date().toISOString(),
        configPath,
        values,
      };
      await fs.mkdir(path.dirname(backupPath), { recursive: true, mode: 0o700 });
      await assertConfigUnchanged(originalBytes, originalStat);
      await atomicWrite(backupPath, `${JSON.stringify(backup, null, 2)}\n`, 0o600);
    }

    // Only apply non-null settings. null means "backup only / leave user's appearance alone".
    let body = section.body;
    let changed = false;
    for (const [key, line] of settings) {
      if (line === null) continue;
      body = replaceSetting(body, key, line);
      changed = true;
    }
    if (changed) {
      const updated = content.slice(0, section.bodyStart) + body + content.slice(section.bodyEnd);
      await assertConfigUnchanged(originalBytes, originalStat);
      await atomicWrite(configPath, updated, originalStat.mode & 0o777, originalBytes, originalStat);
    }
    console.log("Saved base-theme backup; left Codex appearanceTheme unchanged (skin auto-adapts light/dark).");
    return;
  }

  let backup;
  try {
    const backupBytes = await fs.readFile(backupPath);
    backup = JSON.parse(decodeStrictUtf8(backupBytes, "Theme backup"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("No selective pre-install theme backup is available.");
    throw new Error(`Could not read the theme backup: ${error.message}`);
  }
  validateBackup(backup);
  if (!section) {
    const hasSavedSetting = [...settings.keys()].some((key) => backup.values[key]);
    if (!hasSavedSetting) {
      await assertConfigUnchanged(originalBytes, originalStat);
      await fs.unlink(backupPath);
      console.log("Restored the saved base-theme keys.");
      return;
    }
    content = `${content.trimEnd()}\n\n[desktop]\n`;
    section = desktopSection(content);
  }
  let body = section.body;
  for (const key of settings.keys()) body = replaceSetting(body, key, backup.values[key] ?? null);
  const restored = content.slice(0, section.bodyStart) + body + content.slice(section.bodyEnd);
  await assertConfigUnchanged(originalBytes, originalStat);
  await atomicWrite(configPath, restored, originalStat.mode & 0o777, originalBytes, originalStat);
  await fs.unlink(backupPath);
  console.log("Restored the saved base-theme keys.");
}

const releaseLock = await acquireConfigLock();
try {
  await main();
} finally {
  await releaseLock();
}
