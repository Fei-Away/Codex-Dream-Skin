import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = fileURLToPath(new URL("../scripts/linux-launch.sh", import.meta.url));
function shell(body, ...args) {
  return spawnSync("/bin/bash", ["-c",
    '. "$1"; shift; fail() { printf "%s\\n" "$*" >&2; exit 1; }; ' + body, "_", source, ...args],
  { encoding: "utf8" });
}

test("custom Electron flags cannot override the managed debugging endpoint", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-flags-test-"));
  const file = path.join(root, "flags");
  try {
    for (const flag of ["--remote-debugging-address=0.0.0.0", "--remote-debugging-port 9222", "--remote-debugging-pipe", "--disable-gpu --remote-debugging-address=0.0.0.0"]) {
      await fs.writeFile(file, flag + "\n");
      const result = shell('ELECTRON_FLAGS_PATH="$1"; electron_flags_lines', file);
      assert.notEqual(result.status, 0, flag);
    }
    await fs.writeFile(file, "# comment\n--disable-gpu-compositing\n");
    const result = shell('ELECTRON_FLAGS_PATH="$1"; electron_flags_lines', file);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--disable-gpu-compositing/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("an official candidate does not authenticate a different installed version", () => {
  const policy = `chatgpt:
  Installed: 1.0
  Candidate: 2.0
  Version table:
     2.0 500
        500 https://persistent.oaistatic.com/codex-app-prod/linux/deb stable/main amd64 Packages
 *** 1.0 500
        500 https://untrusted.example/repo stable/main amd64 Packages
        100 /var/lib/dpkg/status
`;
  assert.notEqual(shell('installed_codex_origin_is_official "$1" "$2"', policy, "1.0").status, 0);
  assert.equal(shell('installed_codex_origin_is_official "$1" "$2"', policy, "2.0").status, 0);
  assert.notEqual(shell('installed_codex_origin_is_official "$1" "$2"', policy, "3.0").status, 0);
});

test("CDP listener inspection rejects wildcard and mixed binds", () => {
  const local = "LISTEN 0 128 127.0.0.1:9335 0.0.0.0:*";
  const wildcard = "LISTEN 0 128 0.0.0.0:9335 0.0.0.0:*";
  assert.equal(shell('listeners_are_loopback "$1"', local).status, 0);
  assert.notEqual(shell('listeners_are_loopback "$1"', wildcard).status, 0);
  assert.notEqual(shell('listeners_are_loopback "$1"', local + "\n" + wildcard).status, 0);
  assert.notEqual(shell('listeners_are_loopback "$1"', "").status, 0);
});
