import fs from "node:fs/promises";
import path from "node:path";

const [mode, configPath, backupPath] = process.argv.slice(2);
const utf8 = new TextDecoder("utf-8", { fatal: true });
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
  const header = /^\[desktop\]\s*\r?\n/m.exec(content);
  if (!header) return null;
  const bodyStart = header.index + header[0].length;
  const remainder = content.slice(bodyStart);
  const nextHeader = /^\[/m.exec(remainder);
  const bodyEnd = nextHeader ? bodyStart + nextHeader.index : content.length;
  return { bodyStart, bodyEnd, body: content.slice(bodyStart, bodyEnd) };
}

function newlineFor(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function replaceSetting(body, key, line, newline) {
  const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*=.*(?:\\r?\\n)?`, "m");
  if (line === null) return body.replace(pattern, "");
  if (pattern.test(body)) return body.replace(pattern, `${line}${newline}`);
  const separator = body.length && !body.endsWith("\n") ? newline : "";
  return `${body}${separator}${line}${newline}`;
}

async function atomicWrite(file, value, modeBits) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, value, { mode: modeBits });
  await fs.rename(temporary, file);
  await fs.chmod(file, modeBits);
}

async function readUtf8(file) {
  const bytes = await fs.readFile(file);
  let content;
  try {
    content = utf8.decode(bytes);
  } catch {
    throw new Error(`Refusing to rewrite a file that is not valid UTF-8: ${file}`);
  }
  if (content.includes("\0")) {
    throw new Error(`Refusing to rewrite a file containing NUL characters: ${file}`);
  }
  return content;
}

let content;
try {
  content = await readUtf8(configPath);
} catch (error) {
  if (error.code === "ENOENT") throw new Error(`Codex config not found: ${configPath}`);
  throw error;
}

const originalStat = await fs.stat(configPath);
const newline = newlineFor(content);
let section = desktopSection(content);

if (mode === "install") {
  if (!section) {
    content = `${content.trimEnd()}${newline}${newline}[desktop]${newline}`;
    section = desktopSection(content);
  }
  try {
    await fs.access(backupPath);
  } catch {
    const values = {};
    for (const key of settings.keys()) {
      const match = new RegExp(`^${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*=.*$`, "m").exec(section.body);
      values[key] = match ? match[0] : null;
    }
    const backup = {
      schemaVersion: 1,
      platform: "darwin",
      createdAt: new Date().toISOString(),
      configPath,
      values,
    };
    await fs.mkdir(path.dirname(backupPath), { recursive: true, mode: 0o700 });
    await atomicWrite(backupPath, `${JSON.stringify(backup, null, 2)}\n`, 0o600);
  }

  // Only apply non-null settings. null means "backup only / leave user's appearance alone".
  let body = section.body;
  let changed = false;
  for (const [key, line] of settings) {
    if (line === null) continue;
    body = replaceSetting(body, key, line, newline);
    changed = true;
  }
  if (changed) {
    const updated = content.slice(0, section.bodyStart) + body + content.slice(section.bodyEnd);
    await atomicWrite(configPath, updated, originalStat.mode & 0o777);
  }
  console.log("Saved base-theme backup; left Codex appearanceTheme unchanged (skin auto-adapts light/dark).");
} else {
  let backup;
  try {
    backup = JSON.parse(await readUtf8(backupPath));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("No selective pre-install theme backup is available.");
    throw new Error(`Could not read the theme backup: ${error.message}`);
  }
  if (backup.schemaVersion !== 1 || backup.configPath !== configPath || !backup.values) {
    throw new Error("Theme backup identity or schema does not match this config; nothing was restored.");
  }
  if (!section) {
    const hasSavedSetting = [...settings.keys()].some((key) => backup.values[key]);
    if (!hasSavedSetting) {
      await fs.unlink(backupPath);
      console.log("Restored the saved base-theme keys.");
      process.exit(0);
    }
    content = `${content.trimEnd()}${newline}${newline}[desktop]${newline}`;
    section = desktopSection(content);
  }
  let body = section.body;
  for (const key of settings.keys()) body = replaceSetting(body, key, backup.values[key] ?? null, newline);
  const restored = content.slice(0, section.bodyStart) + body + content.slice(section.bodyEnd);
  await atomicWrite(configPath, restored, originalStat.mode & 0o777);
  await fs.unlink(backupPath);
  console.log("Restored the saved base-theme keys.");
}
