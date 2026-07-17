import { inflateRawSync } from "node:zlib";
import { fail } from "./errors.mjs";

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 24 * 1024 * 1024;
const MAX_ENTRIES = 8;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  crcTable[index] = value >>> 0;
}

export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function assertLogicalPath(name) {
  if (
    typeof name !== "string" || name.length < 1 || Buffer.byteLength(name) > 180
    || name !== name.normalize("NFC") || name.startsWith("/") || name.includes("\\")
    || /^[a-z]:/i.test(name) || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(name)
  ) fail("CONTAINER_PATH_INVALID", `${name || "<empty>"} is not a safe package entry path.`, name || null);
  const segments = name.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    fail("CONTAINER_PATH_INVALID", `${name} is not a safe package entry path.`, name);
  }
}

export function createDeterministicZip(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_ENTRIES) {
    fail("CONTAINER_ENTRY_LIMIT", `A package must contain from 1 to ${MAX_ENTRIES} files.`);
  }
  const seen = new Set();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    assertLogicalPath(entry.name);
    const collisionKey = entry.name.toLowerCase();
    if (seen.has(collisionKey)) {
      fail("CONTAINER_ENTRY_DUPLICATE", `${entry.name} appears more than once.`, entry.name);
    }
    seen.add(collisionKey);
    const nameBytes = Buffer.from(entry.name, "utf8");
    const bytes = Buffer.from(entry.bytes);
    const checksum = crc32(bytes);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + bytes.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  const result = Buffer.concat([...localParts, centralDirectory, end]);
  if (result.length > MAX_PACKAGE_BYTES) fail("CONTAINER_SIZE_LIMIT", "Package exceeds 32 MiB.");
  return result;
}

function findEnd(bytes) {
  const minimum = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === END_SIGNATURE) return offset;
  }
  fail("CONTAINER_END_MISSING", "ZIP end record was not found.");
}

function decodeName(bytes, flags) {
  if (!(flags & UTF8_FLAG) && bytes.some((byte) => byte >= 0x80)) {
    fail("CONTAINER_FILENAME_ENCODING", "Non-ASCII package paths must be marked as UTF-8.");
  }
  try {
    return textDecoder.decode(bytes);
  } catch {
    fail("CONTAINER_FILENAME_ENCODING", "A package entry name is not strict UTF-8.");
  }
}

function maxEntryBytes(name) {
  if (name === "manifest.json" || name === "theme.json" || name === "LICENSE.txt" || name === "NOTICE.txt") {
    return 256 * 1024;
  }
  if (/^assets\//.test(name)) return 16 * 1024 * 1024;
  return 256 * 1024;
}

export function readStrictZip(value) {
  const bytes = Buffer.from(value);
  if (bytes.length > MAX_PACKAGE_BYTES) fail("CONTAINER_SIZE_LIMIT", "Package exceeds 32 MiB.");
  if (bytes.length < 22) fail("CONTAINER_END_MISSING", "ZIP end record was not found.");
  const endOffset = findEnd(bytes);
  const commentLength = bytes.readUInt16LE(endOffset + 20);
  if (endOffset + 22 + commentLength !== bytes.length) {
    fail("CONTAINER_END_INVALID", "ZIP end record is inconsistent with the package size.");
  }
  if (commentLength !== 0) fail("CONTAINER_FEATURE_UNSUPPORTED", "ZIP archive comments are not supported.");
  if (
    bytes.readUInt16LE(endOffset + 4) !== 0 || bytes.readUInt16LE(endOffset + 6) !== 0
    || bytes.readUInt16LE(endOffset + 8) !== bytes.readUInt16LE(endOffset + 10)
  ) fail("CONTAINER_MULTIVOLUME", "Multi-volume ZIP packages are not supported.");
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  if (entryCount < 1 || entryCount > MAX_ENTRIES) {
    fail("CONTAINER_ENTRY_LIMIT", `A package must contain from 1 to ${MAX_ENTRIES} files.`);
  }
  const centralSize = bytes.readUInt32LE(endOffset + 12);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  if (centralOffset + centralSize !== endOffset || centralOffset > bytes.length) {
    fail("CONTAINER_DIRECTORY_INVALID", "ZIP central directory bounds are invalid.");
  }

  const metadata = [];
  const seen = new Set();
  let cursor = centralOffset;
  let expandedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || bytes.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      fail("CONTAINER_DIRECTORY_INVALID", "ZIP central directory entry is invalid.");
    }
    const versionMadeBy = bytes.readUInt16LE(cursor + 4);
    const versionNeeded = bytes.readUInt16LE(cursor + 6);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const entryCommentLength = bytes.readUInt16LE(cursor + 32);
    const disk = bytes.readUInt16LE(cursor + 34);
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (end > endOffset) fail("CONTAINER_DIRECTORY_INVALID", "ZIP central directory entry is truncated.");
    if (versionNeeded > 20 || extraLength !== 0 || entryCommentLength !== 0) {
      fail("CONTAINER_FEATURE_UNSUPPORTED", "ZIP64, extra fields, and entry comments are not supported.");
    }
    if (disk !== 0) fail("CONTAINER_MULTIVOLUME", "Multi-volume ZIP packages are not supported.");
    if (flags & 0x0001) fail("CONTAINER_ENCRYPTED", "Encrypted ZIP entries are not allowed.");
    if ((flags & ~0x0806) !== 0) {
      fail("CONTAINER_FEATURE_UNSUPPORTED", "Unsupported ZIP flags are not allowed.");
    }
    if (![0, 8].includes(method) || (method === 0 && (flags & 0x0006))) {
      fail("CONTAINER_COMPRESSION_UNSUPPORTED", "Only ZIP Store and Deflate are supported.");
    }
    const name = decodeName(bytes.subarray(cursor + 46, cursor + 46 + nameLength), flags);
    assertLogicalPath(name);
    const collisionKey = name.toLowerCase();
    if (seen.has(collisionKey)) fail("CONTAINER_ENTRY_DUPLICATE", `${name} appears more than once.`, name);
    seen.add(collisionKey);
    const host = versionMadeBy >>> 8;
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    const unixType = unixMode & 0o170000;
    if ((host === 3 && unixType !== 0 && unixType !== 0o100000) || (externalAttributes & 0x10)) {
      fail("CONTAINER_LINK_FORBIDDEN", `${name} is not a regular file.`, name);
    }
    if (compressedSize < 1 || uncompressedSize < 1 || uncompressedSize > maxEntryBytes(name)) {
      fail("CONTAINER_ENTRY_SIZE_LIMIT", `${name} exceeds its allowed size.`, name);
    }
    expandedBytes += uncompressedSize;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      fail("CONTAINER_EXPANDED_SIZE_LIMIT", "Package expanded content exceeds 24 MiB.");
    }
    metadata.push({
      name, flags, method, checksum, compressedSize, uncompressedSize, localOffset,
    });
    cursor = end;
  }
  if (cursor !== endOffset) fail("CONTAINER_DIRECTORY_INVALID", "ZIP central directory size is inconsistent.");

  const ranges = [];
  const entries = new Map();
  for (const entry of metadata) {
    const { localOffset } = entry;
    if (localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      fail("CONTAINER_LOCAL_HEADER_INVALID", `${entry.name} has an invalid local header.`, entry.name);
    }
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localChecksum = bytes.readUInt32LE(localOffset + 14);
    const localCompressedSize = bytes.readUInt32LE(localOffset + 18);
    const localUncompressedSize = bytes.readUInt32LE(localOffset + 22);
    const nameLength = bytes.readUInt16LE(localOffset + 26);
    const extraLength = bytes.readUInt16LE(localOffset + 28);
    const nameStart = localOffset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (extraLength !== 0 || dataEnd > centralOffset) {
      fail("CONTAINER_LOCAL_HEADER_INVALID", `${entry.name} has invalid local bounds.`, entry.name);
    }
    const localName = decodeName(bytes.subarray(nameStart, nameStart + nameLength), localFlags);
    if (localName !== entry.name || localFlags !== entry.flags || localMethod !== entry.method) {
      fail("CONTAINER_HEADER_MISMATCH", `${entry.name} local and central headers disagree.`, entry.name);
    }
    if (!(entry.flags & 0x0008) && (
      localChecksum !== entry.checksum
      || localCompressedSize !== entry.compressedSize
      || localUncompressedSize !== entry.uncompressedSize
    )) fail("CONTAINER_HEADER_MISMATCH", `${entry.name} local and central sizes disagree.`, entry.name);
    ranges.push({ start: localOffset, end: dataEnd, name: entry.name });

    const compressed = bytes.subarray(dataStart, dataEnd);
    let content;
    if (entry.method === 0) {
      if (entry.compressedSize !== entry.uncompressedSize) {
        fail("CONTAINER_DATA_INVALID", `${entry.name} has invalid Store sizes.`, entry.name);
      }
      content = Buffer.from(compressed);
    } else {
      try {
        content = inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize });
      } catch {
        fail("CONTAINER_DATA_INVALID", `${entry.name} cannot be safely inflated.`, entry.name);
      }
    }
    if (content.length !== entry.uncompressedSize || crc32(content) !== entry.checksum) {
      fail("CONTAINER_CHECKSUM_MISMATCH", `${entry.name} failed size or CRC verification.`, entry.name);
    }
    entries.set(entry.name, content);
  }
  ranges.sort((left, right) => left.start - right.start);
  if (ranges[0].start !== 0 || ranges.at(-1).end !== centralOffset) {
    fail("CONTAINER_ENTRY_OVERLAP", "ZIP local entries must exactly precede the central directory.");
  }
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].start !== ranges[index - 1].end) {
      fail("CONTAINER_ENTRY_OVERLAP", `${ranges[index].name} overlaps or leaves an entry gap.`, ranges[index].name);
    }
  }
  return entries;
}
