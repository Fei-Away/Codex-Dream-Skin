import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fail } from "./errors.mjs";

const OPEN_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
const READ_CHUNK_BYTES = 64 * 1024;

export function sameFileIdentity(before, after) {
  return before.isFile() && after.isFile()
    && before.dev === after.dev
    && before.ino === after.ino
    && before.size === after.size
    && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs;
}

export async function readAtMost(handle, maximum) {
  const chunks = [];
  let total = 0;
  while (total <= maximum) {
    const requested = Math.min(READ_CHUNK_BYTES, maximum + 1 - total);
    if (requested < 1) break;
    const chunk = Buffer.allocUnsafe(requested);
    const { bytesRead } = await handle.read(chunk, 0, requested, null);
    if (bytesRead === 0) break;
    chunks.push(chunk.subarray(0, bytesRead));
    total += bytesRead;
  }
  return Buffer.concat(chunks, total);
}

export async function readStableFile(filePath, {
  maximum,
  minimum = 1,
  invalidCode,
  missingCode = invalidCode,
  changedCode = "SOURCE_CHANGED",
  label = path.basename(filePath),
  field = null,
}) {
  let handle;
  try {
    handle = await fs.open(filePath, OPEN_FLAGS);
  } catch (error) {
    if (error.code === "ENOENT") fail(missingCode, `${label} does not exist.`, field);
    if (error.code === "ELOOP") fail(invalidCode, `${label} must not be a symbolic link.`, field);
    throw error;
  }
  try {
    const before = await handle.stat();
    if (!before.isFile()) fail(invalidCode, `${label} must be a regular file.`, field);
    if (before.size < minimum || before.size > maximum) {
      fail(invalidCode, `${label} exceeds its allowed size.`, field);
    }
    const bytes = await readAtMost(handle, maximum);
    const after = await handle.stat();
    if (!sameFileIdentity(before, after)) fail(changedCode, `${label} changed while being read.`, field);
    if (bytes.length < minimum || bytes.length > maximum) {
      fail(invalidCode, `${label} exceeds its allowed size.`, field);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}
