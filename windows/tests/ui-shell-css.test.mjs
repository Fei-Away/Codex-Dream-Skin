import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "assets", "dream-skin.css"), "utf8");

const mainRule = css.match(
  /html\.codex-dream-skin main\.main-surface\s*\{([\s\S]*?)\}/,
);
assert.ok(mainRule, "the main Codex surface rule must exist");
assert.doesNotMatch(
  mainRule[1],
  /overflow\s*:\s*hidden\s*!important/,
  "the skin must not clip native menus and side-panel popovers",
);

const headerRule = css.match(
  /html\.codex-dream-skin main\.main-surface\s*>\s*header\.app-header-tint\s*\{([\s\S]*?)\}/,
);
assert.ok(headerRule, "the native Codex header rule must exist");
assert.doesNotMatch(
  headerRule[1],
  /position\s*:\s*relative/,
  "the skin must preserve the native header positioning context",
);

console.log("ui-shell-css.test.mjs: passed");
