import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const appDelegate = await fs.readFile(
  path.join(macosRoot, "menubar-app/Sources/CodexDreamSkinMenuBar/AppDelegate.swift"),
  "utf8",
);
const updateScript = await fs.readFile(
  path.join(macosRoot, "scripts/check-update-macos.sh"),
  "utf8",
);

/**
 * `check-update-macos.sh` answers "which version am I running" by reading the
 * VERSION file next to itself. Which copy of the script runs therefore decides
 * which version gets reported, and only one copy cannot be stale.
 *
 * The deployed engine can lag the app indefinitely: it is installed
 * asynchronously after launch, and the installer refuses outright while Codex
 * is open ("Close Codex before installation so config.toml cannot be rewritten
 * while the app is saving it"). While that refusal stands, the app bundle is
 * the new version and the engine is still the old one, so the installed script
 * reports the old number as `currentVersion` and the client announces an update
 * to the exact version it is already running.
 */
test("the update check reads the app bundle's version, never the deployed engine's", () => {
  const calls = [...appDelegate.matchAll(
    /(\w+)Script\(named: "check-update-macos\.sh"\)\s*\n?\s*\?\?\s*(\w+)Script\(named: "check-update-macos\.sh"\)/g,
  )];
  assert.ok(calls.length >= 2, "expected the manual and background update checks");
  for (const [, first, second] of calls) {
    assert.equal(first, "bundled", "the bundled copy must be preferred");
    assert.equal(second, "installed", "the deployed engine stays as a fallback only");
  }
});

test("no other resolution of the update script slips past that rule", () => {
  const mentions = [...appDelegate.matchAll(/\w+Script\(named: "check-update-macos\.sh"\)/g)];
  const installedFirst = appDelegate.includes(
    'installedScript(named: "check-update-macos.sh")\n      ?? bundledScript',
  );
  assert.equal(installedFirst, false, "the stale-engine ordering must not come back");
  assert.equal(mentions.length % 2, 0, "every resolution must keep an explicit fallback pair");
});

test("the script still derives its current version from its own root", () => {
  // If this ever changes to read an absolute installed path, preferring the
  // bundled copy would stop fixing anything.
  assert.match(updateScript, /ROOT="\$\(cd "\$\(dirname "\$0"\)\/\.\." && pwd -P\)"/);
  assert.match(updateScript, /VERSION_PATH="\$ROOT\/VERSION"/);
});
