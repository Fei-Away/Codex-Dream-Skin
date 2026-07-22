import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStudioServer } from "../studio/server.mjs";

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(testsRoot, "..");

async function verifyPlatform(platform) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `dream-studio-${platform}-`));
  const calls = [];
  const stateRoot = path.join(tempRoot, "state");
  const adapter = {
    platform,
    version: "2.0.0-test",
    paths: {
      stateRoot,
      themeRoot: path.join(stateRoot, "themes"),
      currentThemeRoot: path.join(stateRoot, "theme"),
      imagesRoot: path.join(stateRoot, "images"),
      configPath: path.join(tempRoot, ".codex", "config.toml"),
    },
    async status() { return { session: "off", platform, codexInstalled: true, codexVersion: "test" }; },
    async runAction(action, input) { calls.push({ action, input }); return { output: `${platform}:${action}` }; },
    async logs() { return { injector: "", injectorError: "" }; },
  };
  const studio = await createStudioServer({ adapter, sharedRoot, port: 0 });
  await studio.listen();
  const origin = `http://127.0.0.1:${studio.port}`;
  try {
    const htmlResponse = await fetch(origin);
    const html = await htmlResponse.text();
    const token = html.match(/content="([a-f0-9]{64})"[^>]+name="dream-studio-token"/)?.[1];
    assert.equal(htmlResponse.status, 200);
    assert.ok(token);
    const headers = { "X-Dream-Studio-Token": token };

    const catalogResponse = await fetch(`${origin}/api/themes`, { headers });
    const catalog = await catalogResponse.json();
    assert.equal(catalogResponse.status, 200);
    assert.equal(catalog.official.length, 24);
    assert.equal(catalog.official.filter((theme) => theme.available).length, 24);

    const applyResponse = await fetch(`${origin}/api/themes/skin-01/apply`, { method: "POST", headers });
    const apply = await applyResponse.json();
    assert.equal(applyResponse.status, 200);
    assert.equal(apply.ok, true);
    assert.equal(calls.at(-1).action, "apply-theme");
    assert.match(calls.at(-1).input.id, /^\.builtin-skin-01$/);

    const detailsResponse = await fetch(`${origin}/api/details`, { headers });
    const details = await detailsResponse.json();
    assert.equal(details.engine.platform, platform);
    assert.equal(details.engine.version, "2.0.0-test");

    const moduleResponse = await fetch(`${origin}/runtime/theme-tokens.mjs`);
    assert.equal(moduleResponse.status, 200);
    assert.match(moduleResponse.headers.get("content-type") || "", /javascript/);

    const referenceResponse = await fetch(`${origin}/assets/gallery/skin-01.jpg`);
    assert.equal(referenceResponse.status, 200);
    assert.match(referenceResponse.headers.get("content-type") || "", /image\/jpeg/);

    const missingResponse = await fetch(`${origin}/api/not-found`, { headers });
    const missing = await missingResponse.json();
    assert.equal(missingResponse.status, 404);
    assert.equal(typeof missing.error.message, "string");
    assert.equal(missing.error.platform, platform);
  } finally {
    await studio.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

await verifyPlatform("darwin");
await verifyPlatform("win32");
console.log("PASS: Shared Studio API supports macOS and Windows adapters.");
