import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const windowsRoot = path.resolve(here, "..");
const injectorPath = path.join(windowsRoot, "scripts", "injector.mjs");
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-payload-"));

const runPayloadCheck = () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    injectorPath,
    "--check-payload",
    "--theme-dir", fixtureRoot,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", reject);
  child.once("close", (code) => resolve({ code, stdout, stderr }));
});

try {
  await fs.copyFile(
    path.join(windowsRoot, "assets", "dream-reference.jpg"),
    path.join(fixtureRoot, "fixture.jpg"),
  );
  const specialName = "Literal replacement tokens: $& | $' | $` | $$";
  await fs.writeFile(path.join(fixtureRoot, "theme.json"), `${JSON.stringify({
    id: "payload-dollar-test",
    name: specialName,
    image: "fixture.jpg",
    appearance: "auto",
    art: { focusX: null, focusY: null, safeArea: "auto", taskMode: "auto" },
    palette: {},
  }, null, 2)}\n`, "utf8");

  const result = await runPayloadCheck();
  assert.equal(result.code, 0,
    `Payload construction must preserve dollar replacement tokens.\n${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.pass, true);
  assert.equal(report.themeId, "payload-dollar-test");

  await fs.writeFile(path.join(fixtureRoot, "theme.json"), `${JSON.stringify({
    schemaVersion: 2,
    id: "unsupported-schema-test",
    name: "Unsupported schema",
    image: "fixture.jpg",
  }, null, 2)}\n`, "utf8");
  const unsupported = await runPayloadCheck();
  assert.notEqual(unsupported.code, 0, "An explicit future theme schema must fail closed.");
  assert.match(`${unsupported.stdout}\n${unsupported.stderr}`, /Unsupported theme schemaVersion: 2/);
} finally {
  await fs.rm(fixtureRoot, { recursive: true, force: true });
}

console.log("PASS: Windows payload construction preserves literal dollar replacement tokens.");
