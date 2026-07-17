import assert from "node:assert/strict";
import { readAtMost } from "../lib/theme-package/stable-file.mjs";

let bytesServed = 0;
const unboundedHandle = {
  async read(buffer, offset, length) {
    buffer.fill(0x61, offset, offset + length);
    bytesServed += length;
    return { bytesRead: length, buffer };
  },
};

const bounded = await readAtMost(unboundedHandle, 1024);
assert.equal(bounded.length, 1025);
assert.equal(bytesServed, 1025);

console.log("PASS: stable file reads stop at one byte beyond the configured limit.");
