import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const source = path.join(
  macosRoot,
  "menubar-app/Sources/CodexDreamSkinMenuBar/BoundedCommunityHTTPClient.swift",
);
const harness = path.join(here, "bounded-community-http.test.swift");
function sdkPath() {
  const configured = process.env.DREAMSKIN_SDK;
  if (configured) return configured;
  const known = "/Library/Developer/CommandLineTools/SDKs/MacOSX14.4.sdk";
  if (existsSync(known)) return known;
  return execFileSync("/usr/bin/xcrun", ["--sdk", "macosx", "--show-sdk-path"], {
    encoding: "utf8",
    timeout: 60_000,
  }).trim();
}

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `${executable} exited with ${code}`));
    });
  });
}

const server = http.createServer((request, response) => {
  switch (request.url) {
    case "/ok":
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      response.end("ok");
      break;
    case "/redirect":
      response.writeHead(302, { Location: "/ok" });
      response.end();
      break;
    case "/oversize-header":
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": "32",
      });
      response.end("01234567890123456789012345678901");
      break;
    case "/chunked-oversize":
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      response.write("01234567");
      setImmediate(() => response.end("89abcdef"));
      break;
    case "/slow":
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      setTimeout(() => response.end("ok"), 500);
      break;
    default:
      response.writeHead(404);
      response.end();
  }
});

test("bounded community HTTP client", {
  skip: process.platform !== "darwin" && "requires the macOS Swift SDK",
}, async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-http-test-"));
  const binary = path.join(temporary, "bounded-community-http-test");
  try {
    const arch = process.arch === "arm64" ? "arm64" : "x86_64";
    // No timeout here means a contended CI runner can hang the whole suite
    // instead of failing it, and this test now gates tag creation.
    execFileSync("/usr/bin/swiftc", [
      "-sdk", sdkPath(),
      "-target", `${arch}-apple-macosx13.0`,
      source,
      harness,
      "-o", binary,
    ], { stdio: "pipe", timeout: 180_000 });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const output = await run(binary, [`http://127.0.0.1:${address.port}`]);
    process.stdout.write(output);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
