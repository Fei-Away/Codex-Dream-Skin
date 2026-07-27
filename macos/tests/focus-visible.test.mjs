import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "..", "..");

const cases = [
  {
    label: "macOS",
    cssPath: path.join(repositoryRoot, "macos", "assets", "dream-skin.css"),
    accent: "--ds-accent",
  },
  {
    label: "Windows",
    cssPath: path.join(repositoryRoot, "windows", "assets", "dream-skin.css"),
    accent: "--dream-accent",
  },
];

for (const { label, cssPath, accent } of cases) {
  const css = await fs.readFile(cssPath, "utf8");
  const focusRule = new RegExp(
    String.raw`:is\([\s\S]*\[role="button"\][\s\S]*\[role="menuitem"\][\s\S]*\[role="tab"\][\s\S]*\):focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(${accent}\) !important;[\s\S]*?outline-offset:\s*3px !important;`,
  );

  assert.match(
    css,
    focusRule,
    `${label} must keep a visible keyboard focus ring for native and role-based controls.`,
  );
}
