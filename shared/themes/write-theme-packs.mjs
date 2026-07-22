import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { officialThemeSpecs } from "./theme-specs.mjs";

const themesRoot = path.dirname(fileURLToPath(import.meta.url));
for (const theme of officialThemeSpecs) {
  const directory = path.join(themesRoot, theme.id);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`);
}
console.log(`Wrote ${officialThemeSpecs.length} Theme v3 official scenes.`);
