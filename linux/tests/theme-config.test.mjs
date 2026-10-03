import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, "../scripts/theme-config.mjs");
const tempRoot = await fs.mkdtemp(path.join("/tmp", "codex-dream-skin-config-"));

function runThemeConfig(mode, config, backup, appearance = "auto") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, mode, config, backup, appearance], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `theme-config exited with ${code}`));
    });
  });
}

async function assertRejectedWithoutWrites(label, content) {
  const config = path.join(tempRoot, `${label}.toml`);
  const backup = path.join(tempRoot, `${label}-backup.json`);
  await fs.writeFile(config, content);
  await assert.rejects(runThemeConfig("install", config, backup, "dark"), /TOML|array|multiline/i);
  assert.equal(await fs.readFile(config, "utf8"), content);
  await assert.rejects(fs.access(backup), { code: "ENOENT" });
  await assert.rejects(fs.access(`${config}.dream-skin.lock`), { code: "ENOENT" });
}

try {
  const config = path.join(tempRoot, "multiline-arrays.toml");
  const backup = path.join(tempRoot, "multiline-arrays-backup.json");
  const original = `model = "gpt-5"
features = [
  "hash # stays inside the string",
  "brackets [stay] inside the string", # ignored comment brackets []
  ["nested", "array"],
]

[desktop]
rows = [
  ["one", "two"], # an unrelated desktop array
  ["three", "[desktop]"],
]
appearanceTheme = "system"
appearanceDarkCodeThemeId = "vscode-dark"
keepMe = true

[mcp_servers.example]
args = [
  "--flag",
  "value#with-hash",
]
`;
  await fs.writeFile(config, original);

  await runThemeConfig("install", config, backup, "dark");
  const installed = await fs.readFile(config, "utf8");
  assert.equal(
    installed,
    original.replace('appearanceTheme = "system"', 'appearanceTheme = "dark"'),
  );
  const saved = JSON.parse(await fs.readFile(backup, "utf8"));
  assert.deepEqual(saved.values, {
    appearanceTheme: 'appearanceTheme = "system"',
    appearanceDarkCodeThemeId: 'appearanceDarkCodeThemeId = "vscode-dark"',
  });

  await runThemeConfig("restore", config, backup);
  assert.equal(await fs.readFile(config, "utf8"), original);
  await assert.rejects(fs.access(backup), { code: "ENOENT" });

  await assertRejectedWithoutWrites(
    "unterminated-array",
    'features = [\n  "one",\n\n[desktop]\nappearanceTheme = "system"\n',
  );
  await assertRejectedWithoutWrites(
    "unmatched-array-bracket",
    'features = ]\n\n[desktop]\nappearanceTheme = "system"\n',
  );
  await assertRejectedWithoutWrites(
    "multiline-managed-setting",
    '[desktop]\nappearanceTheme = [\n  "dark",\n]\n',
  );

  console.log("PASS: theme config preserves multiline arrays across TOML sections and rejects malformed arrays.");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
