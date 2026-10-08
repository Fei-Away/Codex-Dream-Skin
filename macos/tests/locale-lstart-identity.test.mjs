import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// `ps -o lstart=` is formatted per the ambient locale: macOS prints
// "四 10/ 8 17:02:26 2026" under LANG=zh_CN.UTF-8 where a C locale prints
// "Thu Oct  8 17:02:26 2026".  The injector's start time is persisted into
// state.json as part of its recorded identity and later compared verbatim, so
// a state written from one locale failed to verify from another and
// start/restore aborted fail-closed — on the double-click entry points the
// docs recommend.  Reading lstart always pins LC_ALL=C; these checks keep the
// pin in place.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NON_C_LOCALE = "zh_CN.UTF-8";

const listShellFiles = (dir) => {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listShellFiles(path));
    else if (entry.name.endsWith(".sh")) files.push(path);
  }
  return files;
};

const shellFiles = ["scripts", "menubar", "tests"]
  .flatMap((dir) => {
    try {
      return listShellFiles(join(root, dir));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  })
  .sort();

assert.ok(shellFiles.length > 0, "expected to find shell scripts to scan");

const LSTART_READ = /-o\s+lstart=/;

const runBash = (script, env, args = []) =>
  execFileSync("/bin/bash", ["-c", script, "_", root, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      LANG: "",
      LC_ALL: "",
      LC_CTYPE: "",
      LC_TIME: "",
      ...env,
    },
  }).trim();

const lifecycle = `
set -e
. "$1/scripts/common-macos.sh" >/dev/null 2>&1
`;

for (const file of shellFiles) {
  test(`lstart reads pin LC_ALL=C in ${file.slice(root.length + 1)}`, () => {
    const offenders = readFileSync(file, "utf8")
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => !line.trimStart().startsWith("#"))
      .filter(({ line }) => LSTART_READ.test(line) && !line.includes("LC_ALL=C"))
      .map(({ line, number }) => `${number}: ${line.trim()}`);
    assert.deepEqual(
      offenders,
      [],
      "lstart is locale-formatted and must be read with LC_ALL=C",
    );
  });
}

test("process_started_at output does not depend on the ambient locale", () => {
  const probe = (env) => runBash(`${lifecycle}process_started_at $$`, env);
  const pinned = probe({ LC_ALL: "C" });
  assert.notEqual(pinned, "", "process_started_at produced no output");
  assert.equal(probe({ LANG: NON_C_LOCALE }), pinned);
});

test("a watcher identity recorded under one locale verifies under another", async () => {
  const workDir = mkdtempSync(join(tmpdir(), "dreamskin-lstart-"));
  const injector = join(workDir, "injector.mjs");
  const themeDir = join(workDir, "theme");
  // The matcher only inspects the command line, so a plain bash watcher with
  // the recorded launch shape is enough — no signed Codex runtime required.
  writeFileSync(injector, "while true; do sleep 1; done\n");
  chmodSync(injector, 0o700);
  mkdirSync(themeDir);

  const watcher = spawn(
    "/bin/bash",
    [injector, "--watch", "--port", "9341", "--theme-dir", themeDir],
    { stdio: "ignore" },
  );

  try {
    let startedAt = "";
    for (let attempt = 0; attempt < 100 && startedAt === ""; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      try {
        startedAt = execFileSync(
          "/bin/bash",
          [
            "-c",
            'LC_ALL=C /bin/ps -p "$1" -o lstart= | /usr/bin/awk \'{$1=$1; print}\'',
            "_",
            String(watcher.pid),
          ],
          { encoding: "utf8" },
        ).trim();
      } catch {
        startedAt = "";
      }
    }
    assert.notEqual(startedAt, "", "watcher did not start");

    for (const env of [{ LC_ALL: "C" }, { LANG: NON_C_LOCALE }]) {
      const outcome = runBash(
        `${lifecycle}
if recorded_injector_process_matches "$2" "$3" /bin/bash "$4" 9341; then
  printf matched
else
  printf mismatched
fi`,
        env,
        [String(watcher.pid), startedAt, injector],
      );
      assert.equal(
        outcome,
        "matched",
        `recorded identity did not verify under ${JSON.stringify(env)}`,
      );
    }
  } finally {
    watcher.kill("SIGTERM");
    rmSync(workDir, { recursive: true, force: true });
  }
});
