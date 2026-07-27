import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// A bare $var immediately followed by full-width CJK punctuation (no braces)
// can make bash misparse the variable name boundary under a UTF-8 locale
// with `set -u` active, raising "unbound variable" even though the variable
// is assigned — masking the real error behind a bogus one. Reproduced with
// the real common-macos.sh under LANG=en_US.UTF-8: `$code）` crashes,
// `${code}）` does not (#251). Require braces whenever a bare $var expansion
// directly abuts CJK punctuation.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scriptDirs = ["scripts", "menubar"];
const cjkPunctuation = "）。，：；！？」』】";
const bareVarBeforeCjk = new RegExp(`\\$[A-Za-z_][A-Za-z0-9_]*[${cjkPunctuation}]`, "g");

const listShFiles = (dir) => {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listShFiles(path));
    else if (entry.name.endsWith(".sh")) files.push(path);
  }
  return files;
};

const files = scriptDirs.flatMap((dir) => listShFiles(join(root, dir)));
assert.ok(files.length > 0, "expected to find at least one shell script to scan");

for (const file of files) {
  test(`no bare $var immediately before CJK punctuation in ${file.slice(root.length + 1)}`, () => {
    const source = readFileSync(file, "utf8");
    const findings = [...source.matchAll(bareVarBeforeCjk)].map((match) => match[0]);
    assert.deepEqual(findings, [], `bare $var before CJK punctuation found in ${file}`);
  });
}
