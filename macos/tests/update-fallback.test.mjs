import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scripts = new URL("../scripts/", import.meta.url);
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const releaseUrl = "https://github.com/Fei-Away/Codex-Dream-Skin/releases/latest";
const tagUrl = "https://github.com/Fei-Away/Codex-Dream-Skin/releases/tag/v9.8.7";

const nativeStub = `
import fs from "node:fs";
const [kind, ...args] = process.argv.slice(2);
if (kind === "stat") {
  console.log(fs.statSync(args.at(-1)).size);
} else if (kind === "plutil") {
  console.log(JSON.parse(fs.readFileSync(args.at(-1), "utf8")).tag_name);
} else if (kind === "curl") {
  const url = args.find((arg) => arg.startsWith("https://"));
  fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({url, args}) + "\\n");
  if (url.startsWith("https://api.github.com/")) {
    if (process.env.FIXTURE_MODE !== "api-success") process.exit(22);
    fs.writeFileSync(args[args.indexOf("--output") + 1], JSON.stringify({tag_name:"v9.8.7"}));
  } else {
    if (process.env.FIXTURE_MODE === "offline") process.exit(7);
    fs.writeFileSync(args[args.indexOf("--dump-header") + 1], process.env.FIXTURE_HEADERS);
  }
} else {
  throw new Error("Unexpected fixture command: " + kind);
}
`;

async function check(t, headers, mode = "api-failed") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-update-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const engine = path.join(root, "scripts");
  await fs.mkdir(engine);
  const stub = path.join(root, "native.mjs");
  await fs.writeFile(stub, nativeStub);
  const callsPath = path.join(root, "calls");
  await fs.writeFile(callsPath, "");
  const version = (await fs.readFile(new URL("../VERSION", import.meta.url), "utf8")).trim();
  await fs.writeFile(path.join(root, "VERSION"), version);
  await fs.copyFile(new URL("localization-macos.sh", scripts), path.join(engine, "localization-macos.sh"));
  let source = await fs.readFile(new URL("check-update-macos.sh", scripts), "utf8");
  for (const kind of ["curl", "stat", "plutil"]) {
    source = source.replaceAll(`/usr/bin/${kind}`, `${quote(process.execPath)} ${quote(stub)} ${kind}`);
  }
  const script = path.join(engine, "check-update-macos.sh");
  await fs.writeFile(script, source);
  const env = { ...process.env, DREAMSKIN_LANG: "en", FIXTURE_CALLS: callsPath,
    FIXTURE_HEADERS: headers, FIXTURE_MODE: mode };
  delete env.CODEX_DREAM_SKIN_TEST_RESPONSE_FILE;
  delete env.CODEX_DREAM_SKIN_TEST_REDIRECT_HEADERS_FILE;
  const result = spawnSync("/bin/bash", [script, "--json"], {
    env, encoding: "utf8", timeout: 20000,
  });
  assert.ifError(result.error);
  const calls = (await fs.readFile(callsPath, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  assert.equal(calls[0].url, "https://api.github.com/repos/Fei-Away/Codex-Dream-Skin/releases/latest");
  if (mode !== "api-success") {
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, releaseUrl);
    assert.ok(calls[1].args.includes("--head"));
    assert.ok(!calls[1].args.some((arg) => arg === "-L" || arg === "--location"));
  }
  return { ...result, calls, version };
}

test("successful API update checks do not use the fallback", async (t) => {
  const result = await check(t, "", "api-success");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    currentVersion: `v${result.version}`, latestVersion: "v9.8.7", updateAvailable: true, releaseUrl,
  });
});

for (const header of ["location", "Location", "LOCATION"]) {
  test(`API failure accepts a fixed-repository ${header} redirect`, async (t) => {
    const result = await check(t, `HTTP/2 302\r\n${header}: ${tagUrl}\r\n\r\n`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).latestVersion, "v9.8.7");
  });
}

test("proxy response headers cannot replace the final release redirect", async (t) => {
  const result = await check(t, `HTTP/1.1 200 Connection established\r\nLocation: https://example.invalid/\r\n\r\nHTTP/2 302\r\nLocation: ${tagUrl}\r\n\r\n`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).latestVersion, "v9.8.7");
});

for (const [name, headers] of [
  ["foreign repository", "HTTP/2 302\r\nLocation: https://github.com/other/repo/releases/tag/v9.8.7\r\n"],
  ["missing Location", "HTTP/2 302\r\n"],
  ["duplicate Location", `HTTP/2 302\r\nLocation: ${tagUrl}\r\nLocation: ${tagUrl}\r\n`],
  ["non-redirect response", `HTTP/2 200\r\nLocation: ${tagUrl}\r\n`],
  ["invalid tag", `HTTP/2 302\r\nLocation: ${tagUrl}?extra=true\r\n`],
  ["oversized headers", `HTTP/2 302\r\nLocation: ${tagUrl}\r\nX-Padding: ${"x".repeat(65536)}\r\n`],
]) {
  test(`update fallback rejects ${name}`, async (t) => {
    const result = await check(t, headers);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  });
}

test("an unavailable API and release page produce a failed check", async (t) => {
  const result = await check(t, "", "offline");
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Could not connect to GitHub/);
});
