import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(path.resolve(here, ".."), "assets", "dream-skin.css");
const css = await fs.readFile(cssPath, "utf8");

assert.match(css, /:focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--dream-accent\) !important;/,
  "Windows controls must retain a visible keyboard focus ring.");
assert.match(css, /@media\s*\(forced-colors:\s*active\)/,
  "Windows CSS must define a forced-colors adaptation.");
assert.match(css, /--dream-accent:\s*Highlight;/,
  "Forced-colors mode must use the system highlight color.");
assert.match(css, /background:\s*ButtonFace !important;/,
  "Forced-colors primary controls must remain system-readable.");

console.log("PASS: Windows focus-visible and forced-colors styles are present.");
