#!/usr/bin/env node

import path from "node:path";
import { validateSource, ThemePackageError } from "../lib/theme-package/validate-source.mjs";
import { inspectPackage, packSource, publicReport } from "../lib/theme-package/package-operations.mjs";

function usage() {
  return "Usage: theme-package.mjs validate <source-dir> | pack <source-dir> --output <file.dreamskin> | inspect <file.dreamskin> [--platform <macos|windows> --dream-skin-version <semver>]";
}

function compatibilityArgs(args) {
  if (args.length === 0) return null;
  if (
    args.length !== 4 || args[0] !== "--platform" || !args[1]
    || args[2] !== "--dream-skin-version" || !args[3]
  ) throw new ThemePackageError("CLI_USAGE", usage());
  return { platform: args[1], dreamSkinVersion: args[3] };
}

async function main() {
  const [command, input, ...args] = process.argv.slice(2);
  if (!input) throw new ThemePackageError("CLI_USAGE", usage());
  let report;
  if (command === "validate" && args.length === 0) {
    report = publicReport(await validateSource(path.resolve(input)));
  } else if (command === "inspect") {
    report = await inspectPackage(path.resolve(input), compatibilityArgs(args));
  } else if (command === "pack" && args.length === 2 && args[0] === "--output" && args[1]) {
    report = await packSource(path.resolve(input), path.resolve(args[1]));
  } else {
    throw new ThemePackageError("CLI_USAGE", usage());
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  const known = error instanceof ThemePackageError;
  process.stdout.write(`${JSON.stringify({
    pass: false,
    code: known ? error.code : "INTERNAL_ERROR",
    message: known ? error.message : "Theme package operation failed.",
    ...(known && error.field ? { field: error.field } : {}),
    persistentChanges: false,
  }, null, 2)}\n`);
  process.exitCode = 1;
}
