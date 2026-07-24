#!/usr/bin/env node

import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { decodeAndValidateSafeCss } from "./safe-css-validator.mjs";

const [fileArg] = process.argv.slice(2);
if (!fileArg) throw new Error("Usage: validate-safe-css-file.mjs <theme.css>");

const filePath = path.resolve(fileArg);
let handle;
try {
  handle = await fs.open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
} catch (error) {
  if (error.code === "ELOOP") throw new Error("Theme Safe CSS must not be a symbolic link");
  throw error;
}

try {
  const before = await handle.stat();
  if (!before.isFile() || before.size < 1 || before.size > 256 * 1024) {
    throw new Error("Theme Safe CSS must be a non-empty regular file no larger than 262144 bytes");
  }
  const bytes = await handle.readFile();
  const after = await handle.stat();
  if (
    !after.isFile()
    || before.dev !== after.dev
    || before.ino !== after.ino
    || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs
    || before.ctimeMs !== after.ctimeMs
    || bytes.length !== after.size
  ) throw new Error("Theme Safe CSS changed while being validated");
  const { validation } = decodeAndValidateSafeCss(bytes);
  process.stdout.write(`${JSON.stringify(validation)}\n`);
} finally {
  await handle.close();
}
