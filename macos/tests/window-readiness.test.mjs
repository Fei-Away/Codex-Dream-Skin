import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessRendererVerification,
  classifyNativeWindowError,
  classifyNativeWindowResponse,
  inspectNativeWindow,
} from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const startPath = path.join(macosRoot, "scripts", "start-dream-skin-macos.sh");
const commonPath = path.join(macosRoot, "scripts", "common-macos.sh");
const [startSource, commonSource] = await Promise.all([
  fs.readFile(startPath, "utf8"),
  fs.readFile(commonPath, "utf8"),
]);
const injectorSource = await fs.readFile(path.join(macosRoot, "scripts", "injector.mjs"), "utf8");

const exactPayload = {
  skinVersion: "test-version",
  expectedThemeId: "theme-exact",
  expectedRevision: "revision-exact",
};
const readyNativeWindow = classifyNativeWindowResponse({
  windowId: 7,
  bounds: { width: 1200, height: 780, windowState: "normal" },
});
const baseRenderer = {
  installed: true,
  version: exactPayload.skinVersion,
  themeId: exactPayload.expectedThemeId,
  revision: exactPayload.expectedRevision,
  stylePresent: true,
  businessClassPollution: 0,
  documentVisibility: "visible",
  viewport: { width: 1180, height: 740 },
  documentOverflow: { x: false, y: false },
  scope: { level: "L1", baseState: "thread", missingL1: [] },
  shell: { visible: true, width: 900, height: 740 },
  sidebar: { visible: true, width: 280, height: 740 },
  settings: null,
  homeRoute: false,
  homePresent: false,
  hero: null,
  visibleCardCount: 0,
  suggestionLabels: [],
  suggestionLabelColorsMatch: true,
  projectButton: null,
  composer: null,
};

assert.equal(readyNativeWindow.status, "ready");
assert.equal(assessRendererVerification(baseRenderer, readyNativeWindow, exactPayload).pass, true);

// Codex 26.721.x sometimes renders game-source/home suggestions before
// home-icon. In that interval homeRoute is already a real [role=main], so
// verification must use it when the stricter home-route selector is late.
assert.match(
  injectorSource,
  /const home = document\.querySelector\(\$\{selectorLiteral\("home-route"\)\}\) \?\? homeRoute;/,
  "Home verification must fall back to the already-resolved semantic home route (#306).",
);
assert.equal(
  assessRendererVerification({
    ...baseRenderer,
    scope: { level: "L1", baseState: "home", missingL1: [] },
    homeRoute: true,
    homePresent: true,
    hero: { visible: true, width: 800, height: 520 },
  }, readyNativeWindow, exactPayload).pass,
  true,
  "A visible fallback home container must satisfy the ordinary home verification gate.",
);
assert.equal(
  assessRendererVerification({
    ...baseRenderer,
    scope: { level: "L1", baseState: "home", missingL1: [] },
    homeRoute: false,
    homePresent: false,
    genericMain: { visible: true, width: 900, height: 640 },
    genericInput: { visible: true, width: 620, height: 80 },
  }, readyNativeWindow, exactPayload).pass,
  false,
  "A renderer that claims Home must expose a real Home identity signal.",
);

const windowCalls = [];
assert.equal((await inspectNativeWindow({
  target: { id: "target-main" },
  async send(method, params, timeoutMs) {
    windowCalls.push({ method, params, timeoutMs });
    return { windowId: 9, bounds: { width: 900, height: 640, windowState: "normal" } };
  },
})).status, "ready");
assert.deepEqual(windowCalls, [{
  method: "Browser.getWindowForTarget",
  params: { targetId: "target-main" },
  timeoutMs: 1500,
}]);

const minimized = classifyNativeWindowResponse({
  windowId: 7,
  bounds: { width: 1200, height: 780, windowState: "minimized" },
});
assert.equal(minimized.status, "not-ready");
assert.equal(assessRendererVerification(baseRenderer, minimized, exactPayload).pass, false);

const hiddenRenderer = { ...baseRenderer, documentVisibility: "hidden" };
assert.equal(
  assessRendererVerification(hiddenRenderer, readyNativeWindow, exactPayload).pass,
  false,
  "A hidden renderer must not verify even when CDP still reports window bounds.",
);

// Codex 26.721.x (Chrome/150) returns -32000 "Browser window not found" for
// the app's real, focused, on-screen window (confirmed live via CDP: the
// error is identical before and after actually activating the window, while
// documentVisibility correctly flips hidden -> visible). -32000 is treated
// like the unsupported-domain case: fall back to documentVisible, which
// stays a hard requirement below. See #256.
const windowNotFound = classifyNativeWindowError(new Error("window not found (-32000)"));
assert.equal(windowNotFound.status, "unsupported");
assert.equal(assessRendererVerification(baseRenderer, windowNotFound, exactPayload).pass, true);
assert.equal(
  classifyNativeWindowError(new Error("Method target window not found (-32000)")).status,
  "unsupported",
);
const windowNotFoundByCode = new Error("Browser window not found");
windowNotFoundByCode.cdpCode = -32000;
assert.equal(classifyNativeWindowError(windowNotFoundByCode).status, "unsupported");
assert.equal(
  assessRendererVerification(hiddenRenderer, windowNotFound, exactPayload).pass,
  false,
  "Even when Browser.getWindowForTarget is unusable (-32000), a hidden document must still fail verification.",
);

const unsupported = classifyNativeWindowError(new Error("'Browser.getWindowForTarget' wasn't found (-32601)"));
assert.equal(unsupported.status, "unsupported");
const unsupportedByCode = new Error("Protocol method unavailable");
unsupportedByCode.cdpCode = -32601;
assert.equal(classifyNativeWindowError(unsupportedByCode).status, "unsupported");
assert.equal(
  assessRendererVerification(baseRenderer, unsupported, exactPayload).pass,
  true,
  "A visible, laid-out ordinary route may use the strict DOM fallback.",
);

const settingsRenderer = {
  ...baseRenderer,
  scope: { level: "L0", baseState: "settings" },
  shell: null,
  sidebar: null,
  settings: { visible: true, width: 320, height: 40 },
};
assert.equal(assessRendererVerification(settingsRenderer, unsupported, exactPayload).pass, true);
assert.equal(
  assessRendererVerification({ ...settingsRenderer, settings: null }, unsupported, exactPayload).pass,
  false,
  "Settings L0 must expose a visible settings control.",
);

const incompleteHomeL0 = {
  ...baseRenderer,
  scope: {
    level: "L0",
    baseState: "home",
    missingL1: ["left-panel"],
  },
  shell: null,
  sidebar: null,
  homePresent: true,
  homeRoute: true,
  genericMain: { visible: true, width: 900, height: 640 },
  hero: { visible: true, width: 800, height: 260 },
};
assert.equal(
  assessRendererVerification(incompleteHomeL0, unsupported, exactPayload).pass,
  false,
  "Home may not verify at L0 while required shell anchors are missing.",
);

const arbitraryL0 = {
  ...baseRenderer,
  scope: { level: "L0", baseState: "thread" },
  shell: null,
  sidebar: null,
};
assert.equal(
  assessRendererVerification(arbitraryL0, unsupported, exactPayload).pass,
  false,
  "L0 may not bypass ordinary route structure.",
);
assert.equal(
  assessRendererVerification({
    ...baseRenderer,
    scope: {
      level: "L0",
      baseState: "thread",
      missingL1: ["shell-main", "left-panel", "header-tint"],
    },
    shell: null,
    sidebar: null,
    genericMain: { visible: true, width: 900, height: 640 },
    genericInput: { visible: true, width: 620, height: 80 },
  }, unsupported, exactPayload).pass,
  false,
  "Generic app parts must not turn an L0 thread with missing shell/header anchors into visible success.",
);
assert.equal(
  assessRendererVerification({
    ...baseRenderer,
    shell: null,
    sidebar: null,
    genericMain: { visible: true, width: 900, height: 640 },
    genericInput: { visible: true, width: 620, height: 80 },
  }, unsupported, exactPayload).pass,
  true,
  "A complete L1 scope may verify through registered generic app parts.",
);
assert.equal(
  assessRendererVerification(
    { ...baseRenderer, viewport: { width: 1, height: 1 } },
    unsupported,
    exactPayload,
  ).pass,
  false,
);
assert.equal(
  assessRendererVerification(
    { ...baseRenderer, revision: "wrong-revision" },
    unsupported,
    exactPayload,
  ).pass,
  false,
  "Window readiness must never weaken exact payload verification.",
);

assert.match(
  commonSource,
  /\/usr\/bin\/open -na "\$CODEX_BUNDLE" --args[\s\\]*\n[\s\\]*--remote-debugging-address=127\.0\.0\.1/,
  "The first launch must retain a new CDP-enabled app instance.",
);
assert.match(
  startSource,
  /activate_codex_window\(\)\s*\{\s*\/usr\/bin\/open -a "\$CODEX_BUNDLE"[^\n]*\n\}/,
  "Window activation must use the exact bundle without starting another instance.",
);

const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-window-ready-test."));
let watcherPid = null;
try {
  const scriptsDir = path.join(fixtureRoot, "scripts");
  await fs.mkdir(scriptsDir);
  const openMock = path.join(fixtureRoot, "open-mock.sh");
  const nodeMock = path.join(fixtureRoot, "node-mock.sh");
  const copiedStart = path.join(scriptsDir, "start-dream-skin-macos.sh");
  const mockCommon = path.join(scriptsDir, "common-macos.sh");

  await fs.writeFile(openMock, `#!/bin/bash
set -euo pipefail
{
  /usr/bin/printf 'argc=%s' "$#"
  for argument in "$@"; do /usr/bin/printf '|%s' "$argument"; done
  /usr/bin/printf '\\n'
} >> "$OPEN_LOG"
`, { mode: 0o700 });
  await fs.writeFile(nodeMock, `#!/bin/bash
set -euo pipefail
case " $* " in
  *" --verify "*)
    count=0
    [ ! -f "$VERIFY_COUNT" ] || count="$(/bin/cat "$VERIFY_COUNT")"
    count=$((count + 1))
    /usr/bin/printf '%s\\n' "$count" > "$VERIFY_COUNT"
    [ "\${VERIFY_ALWAYS_FAIL:-0}" != "1" ] || exit 2
    [ "$count" -gt 1 ] || exit 2
    ;;
  *" --once "*) /usr/bin/printf 'once\\n' >> "$NODE_LOG" ;;
esac
exit 0
`, { mode: 0o700 });
  await fs.writeFile(mockCommon, `#!/bin/bash
CODEX_BUNDLE="/Applications/ChatGPT.app"
SKIN_VERSION="test-version"
STATE_ROOT="$FIXTURE_ROOT/state"
STATE_PATH="$STATE_ROOT/state.json"
START_ERROR_LOG="$FIXTURE_ROOT/start-error.log"
APP_LOG="$FIXTURE_ROOT/app.log"
APP_ERROR_LOG="$FIXTURE_ROOT/app-error.log"
INJECTOR_ERROR_LOG="$FIXTURE_ROOT/injector-error.log"
OPERATION_STATE_PATH="$STATE_ROOT/operation.plist"
OPERATION_ACK_PATH="$STATE_ROOT/operation-ack.json"
THEME_DIR="$FIXTURE_ROOT/theme"
INJECTOR="$FIXTURE_ROOT/injector.mjs"
NODE="$NODE_MOCK"
fail() { /usr/bin/printf '%s\\n' "$*" >&2; exit 1; }
ensure_state_root() { /bin/mkdir -p "$STATE_ROOT" "$THEME_DIR"; }
new_operation_token() { /usr/bin/printf '123:1234567890123:1\\n'; }
write_operation_state() { return 0; }
finish_client_operation() { return 0; }
discover_codex_app() { return 0; }
require_signed_node_runtime() { return 0; }
state_field() { return 1; }
verified_cdp_endpoint() { return 1; }
verify_macos_app_signature() { return 0; }
codex_is_running() { return 1; }
stop_codex() { return 0; }
stop_recorded_injector() {
  [ -f "$WATCHER_PID_FILE" ] || return 1
  pid="$(/bin/cat "$WATCHER_PID_FILE")"
  /bin/kill -TERM "$pid" 2>/dev/null || true
  /usr/bin/printf 'stopped:%s\\n' "$pid" >> "$STOP_MARKER"
}
sync_appearance_pin() { return 0; }
select_available_port() { /usr/bin/printf '%s\\n' "$1"; }
launch_codex_with_cdp() { /usr/bin/printf '%s\\n' "$1" > "$LAUNCH_LOG"; }
launch_injector_daemon() {
  /bin/sleep 60 </dev/null >/dev/null 2>&1 &
  pid="$!"
  /usr/bin/printf '%s\\n' "$pid" > "$WATCHER_PID_FILE"
  /usr/bin/printf '%s\\n' "$pid"
}
wait_for_cdp() { return 0; }
process_started_at() { /usr/bin/printf 'test-start-time\\n'; }
codex_main_pids() { /usr/bin/printf '4242\\n'; }
write_state() { /usr/bin/printf '{}\\n' > "$STATE_PATH"; }
mark_state_stale() { /usr/bin/printf 'stale\\n' > "$STALE_MARKER"; }
mark_state_active() { /usr/bin/printf 'active\\n' > "$ACTIVE_MARKER"; }
`, { mode: 0o700 });

  const transformedStart = startSource.replaceAll("/usr/bin/open", openMock);
  await fs.writeFile(copiedStart, transformedStart, { mode: 0o700 });

  const environment = {
    ...process.env,
    ACTIVE_MARKER: path.join(fixtureRoot, "active"),
    FIXTURE_ROOT: fixtureRoot,
    LAUNCH_LOG: path.join(fixtureRoot, "launch.log"),
    NODE_LOG: path.join(fixtureRoot, "node.log"),
    NODE_MOCK: nodeMock,
    OPEN_LOG: path.join(fixtureRoot, "open.log"),
    STALE_MARKER: path.join(fixtureRoot, "stale"),
    STOP_MARKER: path.join(fixtureRoot, "stopped"),
    VERIFY_COUNT: path.join(fixtureRoot, "verify-count"),
    WATCHER_PID_FILE: path.join(fixtureRoot, "watcher.pid"),
  };
  const run = spawnSync("/bin/bash", [copiedStart], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: environment,
    timeout: 10000,
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const openCalls = (await fs.readFile(environment.OPEN_LOG, "utf8")).trim().split("\n");
  assert.deepEqual(openCalls, [
    "argc=2|-a|/Applications/ChatGPT.app",
    "argc=2|-a|/Applications/ChatGPT.app",
  ]);
  assert.equal(await fs.readFile(environment.VERIFY_COUNT, "utf8"), "2\n");
  assert.equal(await fs.readFile(environment.NODE_LOG, "utf8"), "once\n");
  assert.equal(await fs.readFile(environment.ACTIVE_MARKER, "utf8"), "active\n");
  watcherPid = Number((await fs.readFile(environment.WATCHER_PID_FILE, "utf8")).trim());
  if (Number.isSafeInteger(watcherPid) && watcherPid > 1) {
    try { process.kill(watcherPid, "SIGTERM"); } catch {}
  }
  watcherPid = null;

  await Promise.all([
    environment.ACTIVE_MARKER,
    environment.NODE_LOG,
    environment.OPEN_LOG,
    environment.STALE_MARKER,
    environment.STOP_MARKER,
    environment.VERIFY_COUNT,
    environment.WATCHER_PID_FILE,
  ].map((file) => fs.rm(file, { force: true })));
  await fs.rm(path.join(fixtureRoot, "state"), { recursive: true, force: true });

  const failedRun = spawnSync("/bin/bash", [copiedStart], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: { ...environment, VERIFY_ALWAYS_FAIL: "1" },
    timeout: 10000,
  });
  assert.notEqual(failedRun.status, 0, `${failedRun.stdout}\n${failedRun.stderr}`);
  const failedOpenCalls = (await fs.readFile(environment.OPEN_LOG, "utf8")).trim().split("\n");
  assert.deepEqual(failedOpenCalls, [
    "argc=2|-a|/Applications/ChatGPT.app",
    "argc=2|-a|/Applications/ChatGPT.app",
  ]);
  assert.equal(await fs.readFile(environment.VERIFY_COUNT, "utf8"), "2\n");
  assert.equal(await fs.readFile(environment.NODE_LOG, "utf8"), "once\n");
  await assert.rejects(fs.stat(environment.ACTIVE_MARKER), { code: "ENOENT" });
  assert.equal(await fs.readFile(environment.STALE_MARKER, "utf8"), "stale\n");
  assert.match(await fs.readFile(environment.STOP_MARKER, "utf8"), /^stopped:\d+\n$/);
  watcherPid = Number((await fs.readFile(environment.WATCHER_PID_FILE, "utf8")).trim());
} finally {
  if (Number.isSafeInteger(watcherPid) && watcherPid > 1) {
    try { process.kill(watcherPid, "SIGTERM"); } catch {}
  }
  await fs.rm(fixtureRoot, { recursive: true, force: true });
}

console.log("PASS: native-window readiness commits active only after visible verification.");
