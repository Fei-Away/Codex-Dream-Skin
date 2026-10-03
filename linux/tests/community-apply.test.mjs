import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const applyScript = path.join(here, "..", "scripts", "community-apply.mjs");

const ZIP_BYTES = Buffer.from([
  0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
]);
const ZIP_SHA256 = crypto.createHash("sha256").update(ZIP_BYTES).digest("hex");
const VERSION_ID = "ver_test1234";

function metadata(overrides = {}) {
  return {
    id: VERSION_ID,
    themeId: "t-1",
    name: "Test Theme",
    version: "1.0.0",
    authorDisplayName: "A",
    license: "MIT",
    packageSha256: ZIP_SHA256,
    packageBytes: ZIP_BYTES.length,
    applyCompatible: true,
    ...overrides,
  };
}

let servedMetadata = metadata();

const server = http.createServer((request, response) => {
  switch (request.url) {
    case `/v1/themes/${VERSION_ID}`:
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(servedMetadata));
      break;
    case `/v1/themes/${VERSION_ID}/download`:
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      response.end(ZIP_BYTES);
      break;
    default:
      response.writeHead(404);
      response.end();
  }
});

test("community apply downloader", async (t) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const roots = [];
  const makeRoot = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamskin-apply-test-"));
    roots.push(root);
    return root;
  };
  t.after(() => {
    server.close();
    roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  const runApply = async (args, root = makeRoot()) => {
    const env = {
      ...process.env,
      DREAMSKIN_COMMUNITY_API_ORIGIN: `http://127.0.0.1:${server.address().port}`,
    };
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [applyScript, ...args, root],
        { env, encoding: "utf8" },
      );
      return { code: 0, stdout, stderr, root };
    } catch (error) {
      return {
        code: typeof error.code === "number" ? error.code : 1,
        stdout: String(error.stdout ?? ""),
        stderr: String(error.stderr ?? ""),
        root,
      };
    }
  };

  // Usage: missing link argument exits 2.
  {
    const result = await runApply([]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Usage: community-apply\.mjs/);
  }

  // Happy path: verified bytes and manifest fields land in the transaction root.
  {
    servedMetadata = metadata();
    const result = await runApply([`dreamskin://apply?version=${VERSION_ID}`]);
    assert.equal(result.code, 0, result.stderr);
    const zip = fs.readFileSync(path.join(result.root, "package.zip"));
    assert.ok(zip.equals(ZIP_BYTES));
    const stat = fs.statSync(path.join(result.root, "package.zip"));
    assert.equal(stat.mode & 0o777, 0o600);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(result.root, "community-package.json"), "utf8"),
    );
    assert.deepEqual(manifest, {
      themeId: "t-1",
      name: "Test Theme",
      version: "1.0.0",
      packageSha256: ZIP_SHA256,
      packageBytes: ZIP_BYTES.length,
    });
  }

  // SHA-256 mismatch exits 1 and leaves nothing behind.
  {
    servedMetadata = metadata({ packageSha256: "f".repeat(64) });
    const result = await runApply([`dreamskin://apply?version=${VERSION_ID}`]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /这个一键换肤链接无效。/);
    assert.ok(!fs.existsSync(path.join(result.root, "package.zip")));
  }

  // Exact-size mismatch (declared one byte longer than the served body) exits 1.
  {
    servedMetadata = metadata({ packageBytes: ZIP_BYTES.length + 1 });
    const result = await runApply([`dreamskin://apply?version=${VERSION_ID}`]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /这个一键换肤链接无效。/);
    assert.ok(!fs.existsSync(path.join(result.root, "package.zip")));
  }

  servedMetadata = metadata();
});
