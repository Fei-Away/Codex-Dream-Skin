#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const toolsRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(toolsRoot, "..");
const checkOnly = process.argv.slice(2).includes("--check");
const unknown = process.argv.slice(2).filter((arg) => arg !== "--check");
if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);

const selectorSource = await fs.readFile(path.join(toolsRoot, "selectors.json"), "utf8");
const contract = JSON.parse(selectorSource);
if (contract.schema !== "codex-dream-skin-selectors/1" || !Array.isArray(contract.selectors)) {
  throw new Error("tools/selectors.json has an unsupported schema");
}
const selectors = new Map();
for (const entry of contract.selectors) {
  if (!entry?.key || !entry?.selector || selectors.has(entry.key)) {
    throw new Error(`Invalid or duplicate selector key: ${entry?.key || "<missing>"}`);
  }
  selectors.set(entry.key, entry.selector);
}

function compileSelectorTokens(source, sourceName) {
  const compiled = source.replace(/__DREAM_SELECTOR_([A-Z0-9_]+)__/g, (token, identifier) => {
    const key = identifier.toLowerCase().replaceAll("_", "-");
    const selector = selectors.get(key);
    if (!selector) throw new Error(`${sourceName} references unknown selector token ${token}`);
    return selector;
  });
  const unresolved = compiled.match(/__DREAM_SELECTOR_[A-Za-z0-9_]+__/);
  if (unresolved) throw new Error(`${sourceName} contains unresolved selector token ${unresolved[0]}`);
  return compiled;
}

function compileRuntime(source) {
  const token = "__DREAM_SKIN_SELECTORS_JSON__";
  const occurrences = source.split(token).length - 1;
  if (occurrences !== 1) {
    throw new Error(`runtime/renderer-inject.js must contain exactly one ${token} token`);
  }
  // The renderer needs only executable selector data. Keep the full
  // contract (including verification provenance and retired probes) in the
  // staged selectors.json, but do not ship documentation/fossil strings in
  // every page payload. This projection is still generated exclusively from
  // tools/selectors.json, so there is no second editable selector source.
  const runtimeContract = {
    schema: contract.schema,
    selectors: contract.selectors.map(({ key, selector, tier, scope, required }) => ({
      key, selector, tier, scope, required: Boolean(required),
    })),
    stableTestids: Array.isArray(contract.stableTestids) ? [...contract.stableTestids] : [],
  };
  return source.replace(token, JSON.stringify(runtimeContract));
}

const sourceCss = await fs.readFile(path.join(projectRoot, "runtime", "dream-skin.css"), "utf8");
const sourceRuntime = await fs.readFile(path.join(projectRoot, "runtime", "renderer-inject.js"), "utf8");
const sourceThemePackageValidator = await fs.readFile(
  path.join(projectRoot, "runtime", "theme-package-validator.mjs"),
  "utf8",
);
const outputs = [
  {
    // The injector runs from a packaged platform tree, so stage the same
    // contract beside the renderer assets while keeping tools/selectors.json
    // as the only editable source.
    content: selectorSource,
    paths: ["macos/assets/selectors.json", "windows/assets/selectors.json"],
  },
  {
    content: compileSelectorTokens(sourceCss, "runtime/dream-skin.css"),
    paths: ["macos/assets/dream-skin.css", "windows/assets/dream-skin.css"],
  },
  {
    content: compileRuntime(sourceRuntime),
    paths: ["macos/assets/renderer-inject.js", "windows/assets/renderer-inject.js"],
  },
  {
    content: sourceThemePackageValidator,
    paths: [
      "macos/assets/theme-package-validator.mjs",
      "windows/assets/theme-package-validator.mjs",
    ],
  },
];

let mismatches = 0;
for (const output of outputs) {
  for (const relativePath of output.paths) {
    const outputPath = path.join(projectRoot, relativePath);
    if (checkOnly) {
      const current = await fs.readFile(outputPath, "utf8").catch(() => null);
      if (current !== output.content) {
        console.error(`out-of-date=${relativePath}`);
        mismatches += 1;
      }
    } else {
      await fs.writeFile(outputPath, output.content, "utf8");
      console.log(`updated=${relativePath}`);
    }
  }
}

if (mismatches) process.exitCode = 1;
