#!/usr/bin/env node

import path from "node:path";
import { ThemePackageError } from "../lib/theme-package/errors.mjs";
import { validateSource } from "../lib/theme-package/validate-source.mjs";
import { importThemePackage } from "../lib/theme-package/import-core.mjs";
import { inspectPackage, packSource, publicReport } from "../lib/theme-package/package-operations.mjs";

function usage() {
  return "Usage: theme-package.mjs validate <source-dir> | pack <source-dir> --output <file.dreamskin> | inspect <file.dreamskin> [--platform <macos|windows> --dream-skin-version <semver>] | import <file.dreamskin> --platform <macos|windows> --dream-skin-version <semver> (--dry-run | --install --state-root <dir> [--replace] [--expected-content-hash <sha256>])";
}

function compatibilityArgs(args) {
  if (args.length === 0) return null;
  if (
    args.length !== 4 || args[0] !== "--platform" || !args[1]
    || args[2] !== "--dream-skin-version" || !args[3]
  ) throw new ThemePackageError("CLI_USAGE", usage());
  return { platform: args[1], dreamSkinVersion: args[3] };
}

function importArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--dry-run", "--install", "--replace"].includes(argument)) {
      if (options[argument]) throw new ThemePackageError("CLI_USAGE", usage());
      options[argument] = true;
      continue;
    }
    if (["--platform", "--dream-skin-version", "--state-root", "--expected-content-hash"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--") || options[argument]) {
        throw new ThemePackageError("CLI_USAGE", usage());
      }
      options[argument] = value;
      index += 1;
      continue;
    }
    throw new ThemePackageError("CLI_USAGE", usage());
  }
  const dryRun = Boolean(options["--dry-run"]);
  const install = Boolean(options["--install"]);
  if (
    dryRun === install || !options["--platform"] || !options["--dream-skin-version"]
    || (install && !options["--state-root"])
    || (dryRun && (options["--state-root"] || options["--replace"] || options["--expected-content-hash"]))
    || (options["--expected-content-hash"]
      && !/^[0-9a-f]{64}$/.test(options["--expected-content-hash"]))
  ) throw new ThemePackageError("CLI_USAGE", usage());
  return {
    platform: options["--platform"],
    dreamSkinVersion: options["--dream-skin-version"],
    mode: dryRun ? "dry-run" : "install",
    stateRoot: options["--state-root"] ?? null,
    replace: Boolean(options["--replace"]),
    expectedContentHash: options["--expected-content-hash"] ?? null,
  };
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
  } else if (command === "import") {
    report = await importThemePackage({
      packagePath: path.resolve(input),
      ...importArgs(args),
    });
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
    persistentChanges: known ? error.persistentChanges : false,
  }, null, 2)}\n`);
  process.exitCode = 1;
}
