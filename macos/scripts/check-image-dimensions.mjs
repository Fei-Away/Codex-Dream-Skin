// Reject oversized images BEFORE anything rasterizes them.
//
// `load-image-theme` converts non-JPEG sources with `sips -Z`, which must
// fully decode the source first — a near-flat 30000×30000 PNG under the 50 MB
// byte cap would still balloon to gigabytes of pixels. This preflight reads the
// container header only (PNG/JPEG/WebP) and falls back to `sips -g` metadata for
// formats the header parser does not recognize (HEIC/TIFF); it never decodes.
//
// Exit 0 = within caps or dimensions undeterminable (later checks still apply),
// 1 = over caps, 2 = usage / unreadable file.

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  readRawDimensions,
} from "./image-metadata.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: check-image-dimensions.mjs <image>");
  process.exit(2);
}

function overCaps(width, height) {
  return !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1
    || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION
    || width * height > MAX_IMAGE_PIXELS;
}

let dimensions = null;
try {
  const bytes = new Uint8Array(await fs.readFile(file));
  dimensions = readRawDimensions(bytes, path.extname(file));
} catch (error) {
  console.error(`Could not read image: ${error.message}`);
  process.exit(2);
}

// HEIC/TIFF and anything the header parser does not recognize: ask sips for
// image properties only. Reading properties does not rasterize the file.
if (!dimensions) {
  try {
    const out = execFileSync(
      "/usr/bin/sips",
      ["-g", "pixelWidth", "-g", "pixelHeight", file],
      { encoding: "utf8", timeout: 10000 },
    );
    const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1]);
    const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1]);
    if (Number.isFinite(width) && Number.isFinite(height)) {
      dimensions = { width, height };
    }
  } catch {
    // sips unavailable or refused the file: fall through. The 50 MB byte cap and
    // the inject-time dimension check remain as backstops.
  }
}

if (dimensions && overCaps(dimensions.width, dimensions.height)) {
  console.error(
    `Image is ${dimensions.width}×${dimensions.height}px, over the `
    + `${MAX_IMAGE_DIMENSION}px-per-side / ${MAX_IMAGE_PIXELS / 1_000_000}-megapixel safety limit.`,
  );
  process.exit(1);
}
process.exit(0);
