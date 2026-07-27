import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadTheme } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const writer = path.join(macosRoot, "scripts", "write-theme.mjs");
const fixtureImage = path.join(macosRoot, "assets", "portal-hero.png");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || stdout || `${command} exited with ${code}`));
    });
  });
}

test("custom theme writer matches the injector text and task-mode contract", async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-write-contract."));
  try {
    await fs.copyFile(fixtureImage, path.join(output, "background.png"));
    const longTagline = "界".repeat(130);
    const longQuote = "光".repeat(130);
    await run(process.execPath, [
      writer,
      "custom",
      "--output-dir", output,
      "--image", "background.png",
      "--name", "Writer contract fixture",
      "--tagline", longTagline,
      "--quote", longQuote,
      "--task-mode", "full",
    ]);

    const raw = JSON.parse(await fs.readFile(path.join(output, "theme.json"), "utf8"));
    assert.equal(Array.from(raw.tagline).length, 120);
    assert.equal(Array.from(raw.quote).length, 120);
    assert.equal(raw.art.taskMode, "full");

    const loaded = await loadTheme(output);
    assert.equal(loaded.theme.tagline, "界".repeat(120));
    assert.equal(loaded.theme.quote, "光".repeat(120));
    assert.equal(loaded.theme.art.taskMode, "full");
  } finally {
    await fs.rm(output, { recursive: true, force: true });
  }
});
