import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const snapshotter = path.join(macosRoot, "scripts", "snapshot-theme-zip.mjs");
const extractor = path.join(macosRoot, "scripts", "extract-theme-zip-macos.sh");
const tempRoot = await fs.mkdtemp(path.join("/tmp", "codex-dream-skin-zip-snapshot-"));

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      const result = { code, stdout, stderr };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(stderr || stdout || `${command} exited with ${code}`), result));
    });
  });
}

async function writePack(directory, id) {
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, "theme.json"), `${JSON.stringify({
    schemaVersion: 1,
    id,
    name: id,
    image: "background.jpg",
  })}\n`);
  await fs.writeFile(path.join(directory, "background.jpg"), `image-for-${id}\n`);
}

async function makeZip(source, archive) {
  await run("/usr/bin/zip", ["-q", archive, "theme.json", "background.jpg"], { cwd: source });
}

async function expectSnapshotRejected(source, destination, pattern) {
  await assert.rejects(run(process.execPath, [snapshotter, source, destination]), pattern);
  await assert.rejects(fs.access(destination), (error) => error?.code === "ENOENT");
}

function forgedExpandedZip(actualBytes, declaredBytes) {
  const name = Buffer.from("payload.bin", "utf8");
  const compressed = deflateRawSync(Buffer.alloc(actualBytes), { level: 9 });
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(declaredBytes, 22);
  local.writeUInt16LE(name.length, 26);

  const centralOffset = local.length + name.length + compressed.length;
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(declaredBytes, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0x81a40000, 38);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

try {
  const selectedPack = path.join(tempRoot, "selected-pack");
  const replacementPack = path.join(tempRoot, "replacement-pack");
  const selectedArchive = path.join(tempRoot, "selected.zip");
  const replacementArchive = path.join(tempRoot, "replacement.zip");
  const snapshot = path.join(tempRoot, "private-snapshot.zip");
  const extracted = path.join(tempRoot, "extracted");
  await writePack(selectedPack, "selected-theme");
  await writePack(replacementPack, "replacement-theme");
  await makeZip(selectedPack, selectedArchive);
  await makeZip(replacementPack, replacementArchive);

  await run(process.execPath, [snapshotter, selectedArchive, snapshot]);
  await fs.rename(replacementArchive, selectedArchive);
  await fs.mkdir(extracted);
  await run(extractor, [snapshot, extracted]);
  assert.equal(JSON.parse(await fs.readFile(path.join(extracted, "theme.json"), "utf8")).id, "selected-theme");
  assert.notDeepEqual(await fs.readFile(snapshot), await fs.readFile(selectedArchive));
  assert.equal((await fs.stat(snapshot)).mode & 0o777, 0o600);

  const linkedArchive = path.join(tempRoot, "linked.zip");
  const linkedSnapshot = path.join(tempRoot, "linked-snapshot.zip");
  await fs.symlink(selectedArchive, linkedArchive);
  await expectSnapshotRejected(linkedArchive, linkedSnapshot, /symbolic link|ELOOP/i);

  const emptyArchive = path.join(tempRoot, "empty.zip");
  const emptySnapshot = path.join(tempRoot, "empty-snapshot.zip");
  await fs.writeFile(emptyArchive, "");
  await expectSnapshotRejected(emptyArchive, emptySnapshot, /Theme ZIP is empty/);

  const directoryArchive = path.join(tempRoot, "directory.zip");
  const directorySnapshot = path.join(tempRoot, "directory-snapshot.zip");
  await fs.mkdir(directoryArchive);
  await expectSnapshotRejected(directoryArchive, directorySnapshot, /regular file/);

  const oversizedArchive = path.join(tempRoot, "oversized.zip");
  const oversizedSnapshot = path.join(tempRoot, "oversized-snapshot.zip");
  const oversizedHandle = await fs.open(oversizedArchive, "wx");
  try {
    await oversizedHandle.truncate((32 * 1024 * 1024) + 1);
  } finally {
    await oversizedHandle.close();
  }
  await expectSnapshotRejected(oversizedArchive, oversizedSnapshot, /32 MB archive limit/);

  const forgedArchive = path.join(tempRoot, "forged-expanded-size.zip");
  const forgedDestination = path.join(tempRoot, "forged-expanded-output");
  await fs.writeFile(forgedArchive, forgedExpandedZip(65 * 1024 * 1024, 1));
  assert.ok((await fs.stat(forgedArchive)).size < 1024 * 1024);
  await fs.mkdir(forgedDestination);
  await assert.rejects(run(extractor, [forgedArchive, forgedDestination]), /64 MB expanded-size limit/);
  assert.deepEqual(await fs.readdir(forgedDestination), []);

  console.log("PASS: macOS ZIP snapshots and actual expansion are bounded before staged writes.");
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
