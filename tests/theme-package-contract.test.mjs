import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const cli = path.join(root, "tools", "theme-package.mjs");
const example = path.join(root, "examples", "theme-package", "kimi-sakura-dawn");
const golden = path.join(root, "examples", "theme-package", "kimi-sakura-dawn.dreamskin");
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-contract-"));

function runCli(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

try {
  const schemaFiles = [
    "dreamskin-source-manifest.schema.json",
    "dreamskin-manifest.schema.json",
    "dreamskin-theme.schema.json",
  ];
  const schemaIds = new Set();
  for (const name of schemaFiles) {
    const schema = JSON.parse(await fs.readFile(path.join(root, "schemas", name), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.match(schema.$id, new RegExp(`${name.replaceAll(".", "\\.")}$`));
    schemaIds.add(schema.$id);
  }
  assert.equal(schemaIds.size, schemaFiles.length);

  const validateReport = runCli("validate", example);
  const inspectReport = runCli("inspect", golden);
  assert.equal(validateReport.contentHash, "cd3919a9c9782fa968da7397549ca177b57921699bac53cf9c61b84778859e58");
  assert.equal(inspectReport.contentHash, validateReport.contentHash);
  assert.equal(inspectReport.packageId, validateReport.packageId);

  const rebuilt = path.join(temporaryRoot, "rebuilt.dreamskin");
  const packReport = runCli("pack", example, "--output", rebuilt);
  assert.equal(packReport.contentHash, validateReport.contentHash);
  assert.deepEqual(await fs.readFile(rebuilt), await fs.readFile(golden));

  const contract = await fs.readFile(path.join(root, "docs", "THEME_PACKAGE.md"), "utf8");
  const prompt = await fs.readFile(path.join(root, "docs", "KIMI_THEME_AUTHORING_PROMPT.md"), "utf8");
  for (const command of ["validate", "pack", "inspect"]) {
    assert.match(contract, new RegExp(`theme-package\\.mjs ${command}`));
    assert.match(prompt, new RegExp(`theme-package\\.mjs ${command}`));
  }
  for (const schema of schemaFiles) assert.ok(contract.includes(`schemas/${schema}`));

  const runtimeSources = await Promise.all([
    fs.readFile(cli, "utf8"),
    ...(
      await fs.readdir(path.join(root, "lib", "theme-package"))
    ).filter((name) => name.endsWith(".mjs")).map((name) => (
      fs.readFile(path.join(root, "lib", "theme-package", name), "utf8")
    )),
  ]);
  const runtimeText = runtimeSources.join("\n");
  assert.doesNotMatch(runtimeText, /node:https?|fetch\s*\(|XMLHttpRequest|WebSocket/);
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log("PASS: schemas, docs, example source, and golden package stay in sync.");
