import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// CSS forbids nesting :has() inside :has() (or inside :not() that is itself
// an argument of :has()).  Chromium drops the entire rule, so a nested
// pattern ships as silently dead styling — v1.3.1 lost the full-window home
// and every task-route ambient background this way.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const files = [
  "runtime/dream-skin.css",
  "macos/assets/dream-skin.css",
  "windows/assets/dream-skin.css",
];

const findNestedHas = (css) => {
  const findings = [];
  for (let index = css.indexOf(":has("); index !== -1; index = css.indexOf(":has(", index + 1)) {
    const open = index + ":has(".length - 1;
    let depth = 0;
    for (let cursor = open; cursor < css.length; cursor += 1) {
      const char = css[cursor];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          const argument = css.slice(open + 1, cursor);
          if (argument.includes(":has(")) {
            findings.push(css.slice(index, Math.min(cursor + 1, index + 160)));
          }
          break;
        }
      }
    }
  }
  return findings;
};

for (const file of files) {
  test(`no nested :has() in ${file}`, () => {
    const css = readFileSync(join(root, file), "utf8");
    const findings = findNestedHas(css);
    assert.deepEqual(findings, [], `nested :has() found in ${file}`);
  });

  test(`wide full-mode Markdown retains themed light text in ${file}`, () => {
    const css = readFileSync(join(root, file), "utf8");
    const selectorToken = file.startsWith("runtime/")
      ? "__DREAM_SELECTOR_SHELL_MAIN__:not\\(:has\\(__DREAM_SELECTOR_HOME_ROUTE_CSS__\\)\\) __DREAM_SELECTOR_MARKDOWN__"
      : "main:is\\(\\.main-surface, \\[data-app-shell-main-surface\\], \\[class\\*=\"_MainContentSurface_\"\\]\\):not\\(:has\\(\\[role=\"main\"\\]\\)\\) \\[class\\*=\"_markdown\"\\]";
    const fullMode = ':is\\([^)]*\\[data-dream-task-mode="full"\\][^)]*\\[data-dream-art-task-mode="full"\\][^)]*\\)\\[data-dream-art-wide="true"\\]';
    const markdownRule = new RegExp(`${fullMode}\\s*\\n?\\s*${selectorToken}\\s*\\{\\s*\\n?\\s*color:\\s*var\\(--ds-text\\)\\s*!important;`);
    const lightShadowRule = new RegExp(`\\[data-dream-shell="light"\\]${fullMode}\\s*\\n?\\s*${selectorToken}\\s*\\{\\s*\\n?\\s*text-shadow:`);
    assert.match(css, markdownRule,
      "Full task mode must override native dark-shell Markdown foreground (#309).");
    assert.match(css, lightShadowRule,
      "Full task mode must retain the light-shell Markdown contrast shadow (#309).");
  });
}
