import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MediaServerController } from "../scripts/media-server.mjs";

function mp4Fixture(marker) {
  const fileTypeBox = Buffer.alloc(24);
  fileTypeBox.writeUInt32BE(fileTypeBox.length, 0);
  fileTypeBox.write("ftyp", 4, "ascii");
  fileTypeBox.write("isom", 8, "ascii");
  fileTypeBox.writeUInt32BE(512, 12);
  fileTypeBox.write("isom", 16, "ascii");
  fileTypeBox.write("mp41", 20, "ascii");
  return Buffer.concat([fileTypeBox, Buffer.from(marker, "ascii")]);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-dream-skin-media-"));
try {
  const invalidVideoPath = path.join(root, "renamed.mp4");
  await fs.writeFile(invalidVideoPath, Buffer.from("not-an-mp4"));
  await assert.rejects(
    new MediaServerController().stage(invalidVideoPath),
    /not a valid MP4 container/,
  );

  const videoPath = path.join(root, "background.mp4");
  const bytes = mp4Fixture("AAAA");
  await fs.writeFile(videoPath, bytes);

  const media = new MediaServerController();
  const staged = await media.stage(videoPath);
  media.commit(staged);

  assert.match(staged.protocolUrl, /^codex-dream-skin:\/\/media\/[a-f0-9]{32}$/);

  const denied = await fetch(staged.url);
  assert.equal(denied.status, 403);

  const full = await fetch(staged.url, {
    headers: { "X-Codex-Dream-Skin-Token": staged.token },
  });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "video/mp4");
  assert.equal(Buffer.compare(Buffer.from(await full.arrayBuffer()), bytes), 0);

  const range = await fetch(staged.url, {
    headers: {
      Range: "bytes=4-7",
      "X-Codex-Dream-Skin-Token": staged.token,
    },
  });
  assert.equal(range.status, 206);
  assert.equal(Buffer.from(await range.arrayBuffer()).toString(), "ftyp");

  const options = await fetch(staged.url, {
    method: "OPTIONS",
    headers: {
      Origin: "app://-",
      "Access-Control-Request-Headers": "X-Codex-Dream-Skin-Token, Range",
      "Access-Control-Request-Private-Network": "true",
    },
  });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-private-network"), "true");

  const wrongOrigin = await fetch(staged.url, {
    headers: {
      Origin: "https://example.invalid",
      "X-Codex-Dream-Skin-Token": staged.token,
    },
  });
  assert.equal(wrongOrigin.status, 403);

  const missing = await fetch(`${staged.url}/other`);
  assert.equal(missing.status, 404);
  await media.close();
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log("PASS: loopback media server range and route isolation.");
