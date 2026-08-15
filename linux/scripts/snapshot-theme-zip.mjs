import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

const [sourcePath, destinationPath] = process.argv.slice(2);
if (!sourcePath || !destinationPath) {
  throw new Error("Usage: snapshot-theme-zip.mjs <source.zip> <private-snapshot.zip>");
}

const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const COPY_BUFFER_BYTES = 64 * 1024;
if (typeof fsConstants.O_NOFOLLOW !== "number") {
  throw new Error("This platform cannot safely open a theme ZIP without following links");
}

function sameFileSnapshot(before, after) {
  return before.isFile() && after.isFile()
    && before.dev === after.dev
    && before.ino === after.ino
    && before.size === after.size
    && before.mtimeNs === after.mtimeNs
    && before.ctimeNs === after.ctimeNs;
}

async function main() {
  let source;
  let destination;
  let completed = false;
  try {
    try {
      source = await fs.open(sourcePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    } catch (error) {
      if (error?.code === "ELOOP") throw new Error("Theme ZIP must not be a symbolic link");
      throw error;
    }

    const before = await source.stat({ bigint: true });
    if (!before.isFile()) throw new Error("Theme ZIP must be a regular file");
    if (before.size < 1n) throw new Error("Theme ZIP is empty");
    if (before.size > BigInt(MAX_ARCHIVE_BYTES)) {
      throw new Error("Theme ZIP exceeds the 32 MB archive limit");
    }

    destination = await fs.open(destinationPath, "wx", 0o600);
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let copied = 0;
    for (;;) {
      const { bytesRead } = await source.read(buffer, 0, buffer.length, copied);
      if (bytesRead === 0) break;
      copied += bytesRead;
      if (copied > MAX_ARCHIVE_BYTES) {
        throw new Error("Theme ZIP exceeds the 32 MB archive limit while being copied");
      }
      let written = 0;
      while (written < bytesRead) {
        const result = await destination.write(buffer, written, bytesRead - written, null);
        if (result.bytesWritten < 1) throw new Error("Theme ZIP snapshot write made no progress");
        written += result.bytesWritten;
      }
    }

    const after = await source.stat({ bigint: true });
    if (!sameFileSnapshot(before, after) || BigInt(copied) !== before.size) {
      throw new Error("Theme ZIP changed while it was being copied");
    }
    await destination.sync();
    await destination.chmod(0o600);
    completed = true;
  } finally {
    await destination?.close().catch(() => {});
    await source?.close().catch(() => {});
    if (!completed) await fs.rm(destinationPath, { force: true }).catch(() => {});
  }
}

await main();
