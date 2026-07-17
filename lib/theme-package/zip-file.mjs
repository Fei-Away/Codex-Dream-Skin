import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";
import { ThemePackageError, fail } from "./errors.mjs";
import { sameFileIdentity } from "./stable-file.mjs";
import {
  MAX_PACKAGE_BYTES,
  assertStrictEntryRanges,
  parseStrictCentralDirectory,
  parseStrictLocalHeader,
  updateCrc32,
} from "./zip.mjs";

const OPEN_READ_FLAGS = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
const OPEN_WRITE_FLAGS = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
  | (fsConstants.O_NOFOLLOW ?? 0);
const MAX_TAIL_BYTES = 22 + 0xffff;
const MAX_LOCAL_HEADER_BYTES = 30 + 180;
const STREAM_CHUNK_BYTES = 64 * 1024;

async function readExactly(handle, length, position, label) {
  const bytes = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    const result = await handle.read(bytes, offset, length - offset, position + offset);
    if (result.bytesRead === 0) fail("SOURCE_CHANGED", `${label} changed while being read.`);
    offset += result.bytesRead;
  }
  return bytes;
}

async function writeExactly(handle, bytes, position) {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset, position + offset);
    if (result.bytesWritten === 0) fail("INSTALL_STAGE_WRITE_FAILED", "Staging file write made no progress.");
    offset += result.bytesWritten;
  }
}

export class StrictZipFile {
  #handle;
  #initialStat;
  #entries;

  constructor(handle, initialStat, metadata) {
    this.#handle = handle;
    this.#initialStat = initialStat;
    this.#entries = new Map(metadata.map((entry) => [entry.name, entry]));
  }

  get entryNames() {
    return [...this.#entries.keys()];
  }

  async #assertStable() {
    const current = await this.#handle.stat();
    if (!sameFileIdentity(this.#initialStat, current)) {
      fail("SOURCE_CHANGED", "Package changed while being read.");
    }
  }

  async *#compressedChunks(entry) {
    let position = entry.dataStart;
    let remaining = entry.compressedSize;
    while (remaining > 0) {
      const length = Math.min(STREAM_CHUNK_BYTES, remaining);
      const chunk = await readExactly(this.#handle, length, position, entry.name);
      yield chunk;
      position += length;
      remaining -= length;
    }
  }

  async readEntry(name, { maximum, destination = null } = {}) {
    const entry = this.#entries.get(name);
    if (!entry) fail("CONTAINER_ENTRY_REQUIRED", `${name} is required.`, name);
    if (!Number.isSafeInteger(maximum) || maximum < 1 || entry.uncompressedSize > maximum) {
      fail("CONTAINER_ENTRY_SIZE_LIMIT", `${name} exceeds its allowed size.`, name);
    }
    if (entry.method === 0 && entry.compressedSize !== entry.uncompressedSize) {
      fail("CONTAINER_DATA_INVALID", `${name} has invalid Store sizes.`, name);
    }

    let outputHandle = null;
    let outputCreated = false;
    const chunks = [];
    let outputBytes = 0;
    let maxOutputChunkBytes = 0;
    let checksum = 0xffffffff;
    const digest = createHash("sha256");
    const compressed = Readable.from(this.#compressedChunks(entry));
    const decoded = entry.method === 0 ? compressed : compressed.pipe(createInflateRaw());
    try {
      if (destination) {
        outputHandle = await fs.open(destination, OPEN_WRITE_FLAGS, 0o600);
        outputCreated = true;
      }
      try {
        for await (const value of decoded) {
          const chunk = Buffer.from(value);
          outputBytes += chunk.length;
          maxOutputChunkBytes = Math.max(maxOutputChunkBytes, chunk.length);
          if (outputBytes > maximum || outputBytes > entry.uncompressedSize) {
            decoded.destroy();
            fail("CONTAINER_ENTRY_SIZE_LIMIT", `${name} exceeds its allowed size.`, name);
          }
          checksum = updateCrc32(checksum, chunk);
          digest.update(chunk);
          if (outputHandle) await writeExactly(outputHandle, chunk, outputBytes - chunk.length);
          else chunks.push(chunk);
        }
      } catch (error) {
        if (error instanceof ThemePackageError) throw error;
        fail("CONTAINER_DATA_INVALID", `${name} cannot be safely inflated.`, name);
      }
      if (outputBytes !== entry.uncompressedSize || ((checksum ^ 0xffffffff) >>> 0) !== entry.checksum) {
        fail("CONTAINER_CHECKSUM_MISMATCH", `${name} failed size or CRC verification.`, name);
      }
      await this.#assertStable();
      return {
        bytes: destination ? null : Buffer.concat(chunks, outputBytes),
        byteLength: outputBytes,
        sha256: digest.digest("hex"),
        maxOutputChunkBytes,
      };
    } catch (error) {
      if (outputHandle) await outputHandle.close().catch(() => {});
      outputHandle = null;
      if (outputCreated) await fs.rm(destination, { force: true }).catch(() => {});
      throw error;
    } finally {
      if (outputHandle) await outputHandle.close();
    }
  }

  async close() {
    await this.#handle.close();
  }
}

export async function openStrictZipFile(packagePath) {
  if (path.extname(packagePath).toLowerCase() !== ".dreamskin") {
    fail("PACKAGE_EXTENSION_INVALID", "Package filename must end in .dreamskin.");
  }
  let handle;
  try {
    handle = await fs.open(packagePath, OPEN_READ_FLAGS);
  } catch (error) {
    if (error.code === "ENOENT") fail("PACKAGE_NOT_FOUND", "Package does not exist.");
    if (error.code === "ELOOP") fail("PACKAGE_FILE_INVALID", "Package must not be a symbolic link.");
    throw error;
  }
  try {
    const initialStat = await handle.stat();
    if (!initialStat.isFile() || initialStat.size < 22 || initialStat.size > MAX_PACKAGE_BYTES) {
      fail("PACKAGE_FILE_INVALID", "Package must be a regular ZIP file no larger than 32 MiB.");
    }
    const tailLength = Math.min(initialStat.size, MAX_TAIL_BYTES);
    const tailOffset = initialStat.size - tailLength;
    const tail = await readExactly(handle, tailLength, tailOffset, "Package");
    const { metadata, centralOffset } = parseStrictCentralDirectory(tail, {
      baseOffset: tailOffset,
      fileSize: initialStat.size,
    });
    const ranges = [];
    for (const entry of metadata) {
      const available = Math.min(MAX_LOCAL_HEADER_BYTES, centralOffset - entry.localOffset);
      if (available < 30) {
        fail("CONTAINER_LOCAL_HEADER_INVALID", `${entry.name} has an invalid local header.`, entry.name);
      }
      const localHeader = await readExactly(handle, available, entry.localOffset, entry.name);
      const dataStart = entry.localOffset + parseStrictLocalHeader(localHeader, entry);
      const dataEnd = dataStart + entry.compressedSize;
      if (dataEnd > centralOffset) {
        fail("CONTAINER_LOCAL_HEADER_INVALID", `${entry.name} has invalid local bounds.`, entry.name);
      }
      entry.dataStart = dataStart;
      ranges.push({ start: entry.localOffset, end: dataEnd, name: entry.name });
    }
    assertStrictEntryRanges(ranges, centralOffset);
    const afterHeaders = await handle.stat();
    if (!sameFileIdentity(initialStat, afterHeaders)) fail("SOURCE_CHANGED", "Package changed while being read.");
    return new StrictZipFile(handle, initialStat, metadata);
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}
