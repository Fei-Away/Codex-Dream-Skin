import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  createLogThrottle,
  nextDiscoveryDelay,
  parseArgs,
  processIsAlive,
  processIdentityMatches,
  readProcessIdentity,
  waitForWatchRetry,
} from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const themeDir = path.resolve(here, "../presets/preset-gothic-void-crusade");
const commonSource = await fs.readFile(path.resolve(here, "../scripts/common-macos.sh"), "utf8");
const startSource = await fs.readFile(
  path.resolve(here, "../scripts/start-dream-skin-macos.sh"), "utf8",
);

function waitForChildExit(child, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

function capture(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return { stdout: () => stdout, stderr: () => stderr };
}

assert.doesNotMatch(
  commonSource,
  /\/bin\/launchctl submit[\s\S]{0,300}INJECTOR_JOB_LABEL/,
  "The watcher must not use launchctl submit's inferred relaunch behavior.",
);
assert.match(
  commonSource,
  /write_injector_launch_agent\(\)[\s\S]*KeepAlive -bool false[\s\S]*launchctl bootstrap/,
  "The watcher must be owned by a one-shot LaunchAgent.",
);
assert.match(
  commonSource,
  /launch_injector_daemon\(\)[\s\S]*local host_pid="\$2"[\s\S]*local host_started_at="\$3"[\s\S]*local host_executable="\$4"/,
  "Background watcher launch must require the complete Codex host identity.",
);
assert.match(
  startSource,
  /--foreground-injector[\s\S]*--host-pid "\$CODEX_PID"[\s\S]*--host-started-at "\$CODEX_STARTED_AT"[\s\S]*--host-executable "\$CODEX_EXECUTABLE"/,
  "Foreground watcher launch must receive the complete Codex host identity.",
);
assert.doesNotMatch(
  `${commonSource}\n${startSource}`,
  /launch_injector_daemon "\$(?:port|PORT)"\)/,
  "Every background watcher launch must pass more than a port.",
);
assert.match(
  commonSource,
  /stop_recorded_injector\(\)[\s\S]{0,220}if \[ ! -f "\$STATE_PATH" \]; then[\s\S]{0,120}release_injector_launchd_job/,
  "Pause/restore cleanup must remove an orphaned LaunchAgent without state.json.",
);

const hostIdentity = await readProcessIdentity(process.pid);
assert.ok(hostIdentity, "The current test process must expose a macOS process identity.");
assert.equal(hostIdentity.pid, process.pid);
assert.equal(hostIdentity.executable, process.execPath);
assert.equal(processIsAlive(process.pid), true);
assert.equal(processIsAlive(2147483647), false);
assert.equal(await processIdentityMatches(hostIdentity), true);
assert.equal(await processIdentityMatches({
  ...hostIdentity,
  startedAt: "Thu Jan  1 00:00:00 1970",
}), false, "A reused PID with a different start time must fail closed.");
assert.equal(await processIdentityMatches({
  ...hostIdentity,
  executable: "/tmp/not-codex",
}), false, "A PID whose executable changed must fail closed.");

assert.throws(
  () => parseArgs(["--watch", "--port", "19341", "--theme-dir", themeDir]),
  /host pid/i,
);
assert.throws(
  () => parseArgs([
    "--watch", "--port", "19341", "--theme-dir", themeDir,
    "--host-pid", String(process.pid), "--host-started-at", hostIdentity.startedAt,
  ]),
  /host executable/i,
);
const options = parseArgs([
  "--watch", "--port", "19341", "--theme-dir", themeDir,
  "--host-pid", String(process.pid), "--host-started-at", hostIdentity.startedAt,
  "--host-executable", hostIdentity.executable,
]);
assert.equal(options.hostPid, process.pid);
assert.equal(options.hostStartedAt, hostIdentity.startedAt);
assert.equal(options.hostExecutable, hostIdentity.executable);

let delay = 250;
const observedDelays = [];
for (let attempt = 0; attempt < 10; attempt += 1) {
  observedDelays.push(delay);
  delay = nextDiscoveryDelay(delay);
}
assert.deepEqual(
  observedDelays.slice(0, 8),
  [250, 500, 1000, 2000, 4000, 8000, 16000, 30000],
);
assert.equal(delay, 30000);

let now = 0;
const shouldLog = createLogThrottle(30000, () => now);
assert.equal(shouldLog("first error"), true);
now = 29999;
assert.equal(shouldLog("different error"), false, "Changing errors must not bypass throttling.");
now = 30000;
assert.equal(shouldLog("third error"), true);

let identityChecks = 0;
const hostExitResult = await waitForWatchRetry(30000, {
  matchesHost: async () => {
    identityChecks += 1;
    return identityChecks < 3;
  },
  pollIntervalMs: 5,
});
assert.equal(hostExitResult, "host-exited");
assert.ok(identityChecks >= 3);

const abortController = new AbortController();
const abortStartedAt = Date.now();
const abortedRetry = waitForWatchRetry(30000, {
  matchesHost: async () => true,
  signal: abortController.signal,
});
setTimeout(() => abortController.abort(), 20);
assert.equal(await abortedRetry, "stopped");
assert.ok(Date.now() - abortStartedAt < 500);

const launchAgentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-launch-agent-"));
try {
  const generated = spawnSync("/bin/bash", [
    "-c",
    `
      . "$1"
      STATE_ROOT="$2"
      STATE_PATH="$STATE_ROOT/state.json"
      INJECTOR_JOB_PLIST="$STATE_ROOT/$INJECTOR_JOB_LABEL.plist"
      NODE="$3"
      INJECTOR="$4"
      THEME_DIR="$5"
      OPERATION_STATE_PATH="$STATE_ROOT/operation-state.plist"
      OPERATION_ACK_PATH="$STATE_ROOT/operation-control-ack.json"
      INJECTOR_LOG="$STATE_ROOT/injector.log"
      INJECTOR_ERROR_LOG="$STATE_ROOT/injector-error.log"
      ensure_state_root
      write_injector_launch_agent 19341 "$6" "$7" "$8"
    `,
    "_",
    path.resolve(here, "../scripts/common-macos.sh"),
    launchAgentRoot,
    process.execPath,
    injectorPath,
    themeDir,
    String(process.pid),
    hostIdentity.startedAt,
    hostIdentity.executable,
  ], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);
  const launchAgentPath = generated.stdout.trim();
  const keepAlive = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "KeepAlive", "raw", "-o", "-", launchAgentPath],
    { encoding: "utf8" },
  );
  assert.equal(keepAlive.stdout.trim(), "false");
  const launchOnlyOnce = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "LaunchOnlyOnce", "raw", "-o", "-", launchAgentPath],
    { encoding: "utf8" },
  );
  assert.equal(launchOnlyOnce.stdout.trim(), "true");
  const argsResult = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "ProgramArguments", "json", "-o", "-", launchAgentPath],
    { encoding: "utf8" },
  );
  assert.equal(argsResult.status, 0, argsResult.stderr);
  const args = JSON.parse(argsResult.stdout);
  assert.deepEqual(args.slice(args.indexOf("--host-pid"), args.indexOf("--watcher-state")), [
    "--host-pid", String(process.pid),
    "--host-started-at", hostIdentity.startedAt,
    "--host-executable", hostIdentity.executable,
  ]);
  assert.deepEqual(args.slice(-2), ["--watcher-state", path.join(launchAgentRoot, "state.json")]);
} finally {
  await fs.rm(launchAgentRoot, { recursive: true, force: true });
}

const repeatedStartRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-repeated-start-"));
try {
  const repeatedStart = spawnSync("/bin/bash", [
    "-c",
    `
      set -euo pipefail
      . "$1"
      STATE_ROOT="$2"
      STATE_PATH="$STATE_ROOT/state.json"
      THEME_DIR="$3"
      NODE="$4"
      INJECTOR="$5"
      INJECTOR_JOB_LABEL="com.openai.codex-dream-skin-studio.injector.test.$6"
      INJECTOR_JOB_PLIST="$STATE_ROOT/$INJECTOR_JOB_LABEL.plist"
      OPERATION_STATE_PATH="$STATE_ROOT/operation-state.plist"
      OPERATION_ACK_PATH="$STATE_ROOT/operation-control-ack.json"
      INJECTOR_LOG="$STATE_ROOT/injector.log"
      INJECTOR_ERROR_LOG="$STATE_ROOT/injector-error.log"
      pid_is_codex_executable() { return 0; }
      cleanup_repeated_start() { release_injector_launchd_job; }
      trap cleanup_repeated_start EXIT
      ensure_state_root
      first="$(launch_injector_daemon 19341 "$6" "$7" "$8")"
      second="$(launch_injector_daemon 19341 "$6" "$7" "$8")"
      [ "$first" != "$second" ]
      deadline=$((SECONDS + 3))
      while /bin/kill -0 "$first" 2>/dev/null && [ "$SECONDS" -lt "$deadline" ]; do
        /bin/sleep 0.05
      done
      ! /bin/kill -0 "$first" 2>/dev/null
      /bin/kill -0 "$second"
      release_injector_launchd_job
      ! /bin/launchctl print "gui/$(/usr/bin/id -u)/$INJECTOR_JOB_LABEL" >/dev/null 2>&1
      /usr/bin/printf '%s %s\\n' "$first" "$second"
    `,
    "_",
    path.resolve(here, "../scripts/common-macos.sh"),
    repeatedStartRoot,
    themeDir,
    process.execPath,
    injectorPath,
    String(process.pid),
    hostIdentity.startedAt,
    hostIdentity.executable,
  ], { encoding: "utf8", timeout: 20000 });
  assert.equal(repeatedStart.status, 0, `${repeatedStart.stdout}\n${repeatedStart.stderr}`);
  assert.match(repeatedStart.stdout, /^\d+ \d+\n$/);
} finally {
  await fs.rm(repeatedStartRoot, { recursive: true, force: true });
}

const staleIdentityChild = spawn(process.execPath, [
  injectorPath, "--watch", "--port", "19341", "--theme-dir", themeDir,
  "--host-pid", String(process.pid),
  "--host-started-at", "Thu Jan  1 00:00:00 1970",
  "--host-executable", hostIdentity.executable,
], { stdio: ["ignore", "pipe", "pipe"] });
const staleOutput = capture(staleIdentityChild);
assert.deepEqual(
  await waitForChildExit(staleIdentityChild, 2000, "Stale PID identity did not stop watcher."),
  { code: 0, signal: null },
);
assert.match(staleOutput.stdout(), /host identity .* is gone; stopping watcher/i);
assert.equal(staleOutput.stderr(), "");

const unavailableChild = spawn(process.execPath, [
  injectorPath, "--watch", "--port", "19341", "--theme-dir", themeDir,
  "--host-pid", String(process.pid), "--host-started-at", hostIdentity.startedAt,
  "--host-executable", hostIdentity.executable,
], { stdio: ["ignore", "pipe", "pipe"] });
const unavailableOutput = capture(unavailableChild);
await Promise.race([
  new Promise((resolve) => unavailableChild.stderr.once("data", resolve)),
  new Promise((resolve) => setTimeout(resolve, 750)),
]);
await new Promise((resolve) => setTimeout(resolve, 800));
const signalStartedAt = Date.now();
unavailableChild.kill("SIGTERM");
assert.deepEqual(
  await waitForChildExit(unavailableChild, 1000, "SIGTERM did not interrupt watcher backoff."),
  { code: 0, signal: null },
);
assert.ok(Date.now() - signalStartedAt < 1000);
assert.ok(
  unavailableOutput.stderr().split("\n").filter(Boolean).length <= 1,
  "A short CDP outage must not flood injector-error.log.",
);

const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-host-exit-"));
let hostChild;
let watcherChild;
try {
  hostChild = spawn("/bin/sleep", ["60"], { stdio: "ignore" });
  const childIdentity = await readProcessIdentity(hostChild.pid);
  assert.ok(childIdentity);
  const statePath = path.join(stateRoot, "state.json");
  watcherChild = spawn(process.execPath, [
    injectorPath, "--watch", "--port", "19341", "--theme-dir", themeDir,
    "--host-pid", String(childIdentity.pid), "--host-started-at", childIdentity.startedAt,
    "--host-executable", childIdentity.executable, "--watcher-state", statePath,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const watcherOutput = capture(watcherChild);
  await fs.writeFile(statePath, `${JSON.stringify({
    injectorPid: watcherChild.pid,
    injectorStartedAt: "fixture",
    codexPid: childIdentity.pid,
    codexStartedAt: childIdentity.startedAt,
    codexExe: childIdentity.executable,
    session: "active",
  })}\n`, { mode: 0o600 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  hostChild.kill("SIGTERM");
  await waitForChildExit(hostChild, 1000, "Fixture host did not exit.");
  hostChild = null;
  assert.deepEqual(
    await waitForChildExit(watcherChild, 2500, "Watcher survived its exact host identity."),
    { code: 0, signal: null },
  );
  watcherChild = null;
  assert.match(watcherOutput.stdout(), /host identity .* exited; stopping watcher/i);
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  assert.equal(state.session, "stale");
  assert.equal(state.injectorPid, 0);
  assert.equal(state.staleReason, "codex-host-exited");
} finally {
  hostChild?.kill("SIGKILL");
  watcherChild?.kill("SIGKILL");
  await fs.rm(stateRoot, { recursive: true, force: true });
}

console.log("PASS: watcher lifetime follows the exact Codex host identity and backs off after CDP loss.");
