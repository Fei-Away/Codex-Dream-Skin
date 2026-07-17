import assert from "node:assert/strict";
import { readStrictZip } from "../lib/theme-package/zip.mjs";
import { deflateZip } from "./helpers/theme-package-zip-fixtures.mjs";

const expected = Buffer.from('{"formatVersion":1}\n', "utf8");
const entries = readStrictZip(deflateZip("manifest.json", expected));
assert.equal(entries.size, 1);
assert.deepEqual(entries.get("manifest.json"), expected);

console.log("PASS: strict ZIP reader accepts bounded Deflate content without system tools.");
