import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  classifyImageDimensions,
  readImageMetadata,
} from "../scripts/image-metadata.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");

const portal = await fs.readFile(path.join(macosRoot, "assets", "portal-hero.png"));
assert.deepEqual(readImageMetadata(portal, ".png"), {
  width: 2168,
  height: 725,
  ratio: 2168 / 725,
  wide: true,
  aspect: "ultrawide",
  taskMode: "banner",
});
const malformedPng = Buffer.from(portal);
malformedPng[0] = 0;
assert.equal(readImageMetadata(malformedPng, ".png"), null);

const amber = await fs.readFile(path.join(
  macosRoot,
  "presets",
  "preset-amber-dusk",
  "background.jpg",
));
assert.deepEqual(readImageMetadata(amber, ".jpg"), {
  width: 1920,
  height: 1200,
  ratio: 1.6,
  wide: false,
  aspect: "wide",
  taskMode: "ambient",
});

assert.deepEqual(classifyImageDimensions({ width: 2400, height: 1350 }), {
  width: 2400,
  height: 1350,
  ratio: 2400 / 1350,
  wide: true,
  aspect: "wide",
  taskMode: "ambient",
});
assert.equal(MAX_IMAGE_DIMENSION, 16384);
assert.equal(MAX_IMAGE_PIXELS, 50_000_000);
assert.equal(classifyImageDimensions({ width: 10000, height: 6000 }), null);
assert.equal(classifyImageDimensions({ width: 20000, height: 1 }), null);
assert.equal(classifyImageDimensions({ width: 2560.5, height: 1440 }), null);

const writeAscii = (bytes, offset, value) => {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
};
const writeUint32Le = (bytes, offset, value) => {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
};
const writeUint24Le = (bytes, offset, value) => {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
};

const vp8l = new Uint8Array(26);
writeAscii(vp8l, 0, "RIFF");
writeUint32Le(vp8l, 4, vp8l.length - 8);
writeAscii(vp8l, 8, "WEBP");
writeAscii(vp8l, 12, "VP8L");
writeUint32Le(vp8l, 16, 5);
vp8l.set([0x2f, 0x7f, 0xc2, 0x59, 0x00], 20);
assert.deepEqual(readImageMetadata(vp8l, ".webp"), {
  width: 640,
  height: 360,
  ratio: 640 / 360,
  wide: true,
  aspect: "wide",
  taskMode: "ambient",
});

const vp8x = new Uint8Array(30);
writeAscii(vp8x, 0, "RIFF");
writeUint32Le(vp8x, 4, vp8x.length - 8);
writeAscii(vp8x, 8, "WEBP");
writeAscii(vp8x, 12, "VP8X");
writeUint32Le(vp8x, 16, 10);
writeUint24Le(vp8x, 24, 2559);
writeUint24Le(vp8x, 27, 1439);
assert.deepEqual(readImageMetadata(vp8x, ".webp"), {
  width: 2560,
  height: 1440,
  ratio: 2560 / 1440,
  wide: true,
  aspect: "wide",
  taskMode: "ambient",
});

assert.equal(readImageMetadata(new Uint8Array([0, 1, 2, 3]), ".png"), null);

console.log("PASS: image dimensions strictly classify PNG, JPEG, VP8L, and VP8X profiles.");
