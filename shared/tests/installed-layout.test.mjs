import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsRoot, "..", "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dream-installed-layout-"));

try {
  await fs.mkdir(path.join(temporary, "platform"), { recursive: true });
  await fs.mkdir(path.join(temporary, "shared", "process"), { recursive: true });
  await fs.copyFile(
    path.join(repoRoot, "macos", "platform", "studio-adapter.mjs"),
    path.join(temporary, "platform", "studio-adapter.mjs"),
  );
  await fs.copyFile(
    path.join(repoRoot, "shared", "process", "run-action.mjs"),
    path.join(temporary, "shared", "process", "run-action.mjs"),
  );
  const module = await import(`${pathToFileURL(path.join(temporary, "platform", "studio-adapter.mjs"))}?test=${Date.now()}`);
  assert.equal(typeof module.createMacosStudioAdapter, "function");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

console.log("PASS: platform adapter resolves shared runner in installed layout.");
