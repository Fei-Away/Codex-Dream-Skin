import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const temporaryTheme = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-dollar-windows-"));
const specialName = "My $' Theme | Cool $& Skin | Price $$ Theme | Backtick $` Theme";

try {
  const theme = JSON.parse(await fs.readFile(path.join(root, "assets", "theme.json"), "utf8"));
  theme.id = "test-dollar-payload";
  theme.name = specialName;
  await fs.copyFile(
    path.join(root, "assets", theme.image),
    path.join(temporaryTheme, theme.image),
  );
  await fs.writeFile(
    path.join(temporaryTheme, "theme.json"),
    `${JSON.stringify(theme, null, 2)}\n`,
    "utf8",
  );

  const result = spawnSync(process.execPath, [
    path.join(root, "scripts", "injector.mjs"),
    "--check-payload",
    "--theme-dir",
    temporaryTheme,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.pass, true);
  assert.equal(report.themeName, specialName);
} finally {
  await fs.rm(temporaryTheme, { recursive: true, force: true });
}

console.log("PASS: Windows payload preserves theme names containing replacement-pattern dollar sequences.");
