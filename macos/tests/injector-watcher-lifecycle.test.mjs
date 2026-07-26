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
  waitForWatchRetry,
} from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const themeDir = path.resolve(here, "../presets/preset-gothic-void-crusade");
const commonSource = await fs.readFile(path.resolve(here, "../scripts/common-macos.sh"), "utf8");
const startSource = await fs.readFile(path.resolve(here, "../scripts/start-dream-skin-macos.sh"), "utf8");
const statusSource = await fs.readFile(path.resolve(here, "../scripts/status-dream-skin-macos.sh"), "utf8");

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

assert.match(
  commonSource,
  /launch_injector_daemon\(\)[\s\S]*local host_pid="\$2"[\s\S]*--host-pid "\$host_pid"/,
  "Background watchers must receive the exact Codex host PID.",
);
assert.match(
  startSource,
  /--foreground-injector[\s\S]*exec "\$NODE" "\$INJECTOR" --watch[\s\S]{0,300}--host-pid "\$CODEX_PID"/,
  "Foreground watchers must receive the exact Codex host PID.",
);
assert.doesNotMatch(
  `${commonSource}\n${startSource}`,
  /launch_injector_daemon "\$(?:port|PORT)"\)/,
  "Every launch_injector_daemon call must pass a Codex host PID.",
);
assert.match(
  commonSource,
  /hot_reapply_theme\(\)[\s\S]*--host-pid[\s\S]*\$\(\s*i \+ 1\s*\)\s*==\s*host/,
  "Hot reapply must not reuse a legacy watcher that is missing the current Codex host PID.",
);
assert.doesNotMatch(
  commonSource,
  /\/bin\/launchctl submit[\s\S]{0,300}INJECTOR_JOB_LABEL/,
  "A submitted launchd job infers KeepAlive and relaunches a watcher after its host exits.",
);
assert.match(
  commonSource,
  /write_injector_launch_agent\(\)[\s\S]*KeepAlive -bool false[\s\S]*launchctl bootstrap/,
  "The background watcher must use a one-shot LaunchAgent that does not restart after a clean exit.",
);
assert.match(
  commonSource,
  /stop_recorded_injector\(\)[\s\S]{0,220}if \[ ! -f "\$STATE_PATH" \]; then[\s\S]{0,120}release_injector_launchd_job/,
  "Pause and restore cleanup must remove an orphaned launchd job even when state.json is missing.",
);
assert.match(
  statusSource,
  /lsappinfo find bundleID=com\.openai\.codex[\s\S]{0,160}grep -q '\^ASN:'/,
  "Fast status must use LaunchServices because pgrep does not see the current ChatGPT main process.",
);
assert.doesNotMatch(
  statusSource,
  /pgrep -x (?:ChatGPT|Codex)/,
  "Fast status must not rely on the stale process-name contract.",
);

const launchAgentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-launch-agent-"));
try {
  const generated = spawnSync("/bin/bash", [
    "-c",
    `
      . "$1"
      STATE_ROOT="$2"
      NODE="$3"
      INJECTOR="$4"
      THEME_DIR="$5"
      OPERATION_STATE_PATH="$STATE_ROOT/operation-state.plist"
      OPERATION_ACK_PATH="$STATE_ROOT/operation-control-ack.json"
      INJECTOR_LOG="$STATE_ROOT/injector.log"
      INJECTOR_ERROR_LOG="$STATE_ROOT/injector-error.log"
      ensure_state_root
      write_injector_launch_agent 19341 "$6"
    `,
    "_",
    path.resolve(here, "../scripts/common-macos.sh"),
    launchAgentRoot,
    process.execPath,
    injectorPath,
    themeDir,
    String(process.pid),
  ], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);
  const launchAgentPath = generated.stdout.trim();
  const keepAlive = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "KeepAlive", "raw", "-o", "-", launchAgentPath],
    { encoding: "utf8" },
  );
  assert.equal(keepAlive.status, 0, keepAlive.stderr);
  assert.equal(keepAlive.stdout.trim(), "false");
  const programArguments = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "ProgramArguments", "json", "-o", "-", launchAgentPath],
    { encoding: "utf8" },
  );
  assert.equal(programArguments.status, 0, programArguments.stderr);
  assert.deepEqual(JSON.parse(programArguments.stdout), [
    process.execPath,
    injectorPath,
    "--watch",
    "--port",
    "19341",
    "--theme-dir",
    themeDir,
    "--operation-state",
    path.join(launchAgentRoot, "operation-state.plist"),
    "--operation-ack",
    path.join(launchAgentRoot, "operation-control-ack.json"),
    "--host-pid",
    String(process.pid),
  ]);
} finally {
  await fs.rm(launchAgentRoot, { recursive: true, force: true });
}

assert.throws(
  () => parseArgs(["--watch", "--port", "19341", "--theme-dir", themeDir]),
  /host pid/i,
  "A watcher must be tied to the Codex process that owns its CDP endpoint.",
);
assert.throws(
  () => parseArgs([
    "--watch", "--port", "19341", "--theme-dir", themeDir, "--host-pid", "0",
  ]),
  /host pid/i,
  "The watcher must reject an invalid host PID.",
);

const options = parseArgs([
  "--watch",
  "--port",
  "19341",
  "--theme-dir",
  themeDir,
  "--host-pid",
  String(process.pid),
]);
assert.equal(options.hostPid, process.pid);
assert.equal(processIsAlive(process.pid), true);
assert.equal(processIsAlive(2147483647), false);

let delay = 250;
const observedDelays = [];
for (let attempt = 0; attempt < 12; attempt += 1) {
  observedDelays.push(delay);
  delay = nextDiscoveryDelay(delay);
}
assert.deepEqual(
  observedDelays.slice(0, 8),
  [250, 500, 1000, 2000, 4000, 8000, 16000, 30000],
);
assert.equal(delay, 30000, "Disconnected CDP polling must remain capped at 30 seconds.");

let now = 0;
const shouldLog = createLogThrottle(30000, () => now);
assert.equal(shouldLog("fetch failed"), true);
now = 29999;
assert.equal(shouldLog("fetch failed"), false);
assert.equal(shouldLog("connection refused"), true);
now = 30000;
assert.equal(shouldLog("fetch failed"), true);

let aliveChecks = 0;
const hostExitResult = await waitForWatchRetry(30000, {
  hostPid: process.pid,
  isAlive: () => {
    aliveChecks += 1;
    return aliveChecks < 3;
  },
  pollIntervalMs: 5,
});
assert.equal(hostExitResult, "host-exited");
assert.ok(aliveChecks >= 3);

const abortController = new AbortController();
const abortStartedAt = Date.now();
const abortedRetry = waitForWatchRetry(30000, {
  hostPid: process.pid,
  signal: abortController.signal,
});
setTimeout(() => abortController.abort(), 20);
assert.equal(await abortedRetry, "stopped");
assert.ok(Date.now() - abortStartedAt < 500, "SIGTERM-equivalent abort must interrupt backoff.");

const child = spawn(process.execPath, [
  injectorPath,
  "--watch",
  "--port",
  "19341",
  "--theme-dir",
  themeDir,
  "--host-pid",
  "2147483647",
], {
  stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });

const exit = await waitForChildExit(
  child,
  2000,
  "Watcher did not exit after its host process disappeared.",
);

assert.deepEqual(exit, { code: 0, signal: null });
assert.match(stdout, /host process .* exited; stopping watcher/i);
assert.equal(stderr, "");

const signalChild = spawn(process.execPath, [
  injectorPath,
  "--watch",
  "--port",
  "19341",
  "--theme-dir",
  themeDir,
  "--host-pid",
  String(process.pid),
], {
  stdio: ["ignore", "pipe", "pipe"],
});
let signalStderr = "";
signalChild.stderr.setEncoding("utf8");
signalChild.stderr.on("data", (chunk) => { signalStderr += chunk; });
const signalExitPromise = waitForChildExit(
  signalChild,
  1000,
  "SIGTERM did not interrupt the watcher retry promptly.",
);
await Promise.race([
  new Promise((resolve) => signalChild.stderr.once("data", resolve)),
  new Promise((resolve) => setTimeout(resolve, 500)),
]);
const signalStartedAt = Date.now();
signalChild.kill("SIGTERM");
const signalExit = await signalExitPromise;
assert.deepEqual(signalExit, { code: 0, signal: null });
assert.ok(Date.now() - signalStartedAt < 1000);
assert.ok(signalStderr.split("\n").filter(Boolean).length <= 1);

console.log("PASS: watcher lifecycle follows its Codex host and backs off after CDP loss.");
