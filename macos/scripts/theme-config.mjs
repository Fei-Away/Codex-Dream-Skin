import fs from "node:fs/promises";
import path from "node:path";

const [mode, configPath, backupPath] = process.argv.slice(2);
// Back up the user's base appearance so Restore can put it back. The bundled
// Dongge preset is intentionally light, matching the Windows delivery.
const settings = new Map([
  ["appearanceTheme", 'appearanceTheme = "light"'],
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

function replaceSetting(body, key, line) {
  const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*=.*(?:\\r?\\n)?`, "m");
  if (line === null) return body.replace(pattern, "");
  if (pattern.test(body)) return body.replace(pattern, `${line}\n`);
  const separator = body.length && !body.endsWith("\n") ? "\n" : "";
  return `${body}${separator}${line}\n`;
}

async function atomicWrite(file, value, modeBits) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, value, { mode: modeBits });
  await fs.rename(temporary, file);
  await fs.chmod(file, modeBits);
}

let content;
try {
  content = await fs.readFile(configPath, "utf8");
} catch (error) {
  if (error.code === "ENOENT") throw new Error(`Codex config not found: ${configPath}`);
  throw error;
}

const originalStat = await fs.stat(configPath);
let section = desktopSection(content);
if (!section) {
  content = `${content.trimEnd()}\n\n[desktop]\n`;
  section = desktopSection(content);
}

if (mode === "install") {
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
    body = replaceSetting(body, key, line);
    changed = true;
  }
  if (changed) {
    const updated = content.slice(0, section.bodyStart) + body + content.slice(section.bodyEnd);
    await atomicWrite(configPath, updated, originalStat.mode & 0o777);
  }
  console.log("Saved base-theme backup and selected the light appearance for the Dongge theme.");
} else {
  let backup;
  try {
    backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("No selective pre-install theme backup is available.");
    throw new Error(`Could not read the theme backup: ${error.message}`);
  }
  if (backup.schemaVersion !== 1 || backup.configPath !== configPath || !backup.values) {
    throw new Error("Theme backup identity or schema does not match this config; nothing was restored.");
  }
  let body = section.body;
  for (const key of settings.keys()) body = replaceSetting(body, key, backup.values[key] ?? null);
  const restored = content.slice(0, section.bodyStart) + body + content.slice(section.bodyEnd);
  await atomicWrite(configPath, restored, originalStat.mode & 0o777);
  await fs.unlink(backupPath);
  console.log("Restored the saved base-theme keys.");
}
