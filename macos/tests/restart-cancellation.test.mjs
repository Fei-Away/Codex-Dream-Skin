import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scripts = fileURLToPath(new URL("../scripts/", import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

const overrides = `
record() { printf '%s\\n' "$*" >> "$FIXTURE_EVENTS"; }
new_operation_token() { printf '123:1234567890123:1\\n'; }
discover_codex_app() { CODEX_BUNDLE="$HOME/ChatGPT.app"; record discover; }
require_signed_node_runtime() { NODE="$FIXTURE_NODE"; record runtime; }
ensure_node_runtime() { require_signed_node_runtime; }
verify_macos_app_signature() { record signature; }
verified_cdp_endpoint() { [ "$FIXTURE_MODE" = live ]; }
codex_is_running() {
  if [ "$FIXTURE_MODE" = still-running ]; then SECONDS=$((SECONDS + 20)); fi
  [ -f "$HOME/running" ]
}
codex_main_pids() { printf '12345\\n'; }
state_field() { case "$1" in port) printf '9341\\n';; session) printf 'active\\n';; esac; }
write_operation_state() { record "operation $1"; }
begin_client_operation() { record begin; }
finish_client_operation() { record "finish $2"; }
release_codex_launchd_job() { record release-launchd; }
stop_recorded_injector() { record stop-injector; }
sync_appearance_pin() { record config; }
select_available_port() { printf '9341\\n'; }
launch_codex_with_cdp() { record launch; touch "$HOME/running"; }
launch_injector_daemon() { record launch-injector; printf '23456\\n'; }
wait_for_cdp() { record cdp-ready; }
process_started_at() { printf 'fixture-start-time\\n'; }
write_state() { record write-state; }
mark_state_active() { record active; }
mark_state_stale() { record stale; }
hot_reapply_theme() { record hot-reapply; [ "$FIXTURE_MODE" = hot ]; }
`;

const nativeStub = `#!/bin/bash
set -euo pipefail
kind="$1"
shift
record() { printf '%s\\n' "$*" >> "$FIXTURE_EVENTS"; }
case "$kind" in
  osascript)
    source="$(/bin/cat)"
    if [[ "$source" == *'tell application id'* ]]; then
      record official-quit
      case "$FIXTURE_MODE" in
        official-cancel) printf 'cancelled\\n';;
        apple-event-timeout) printf 'timed-out\\n';;
        quit-error) exit 1;;
        still-running) printf 'requested\\n';;
        *) rm -f "$HOME/running"; printf 'requested\\n';;
      esac
    elif [[ "$source" == *'display dialog'* ]]; then
      if [[ "$*" == *'Restart and apply'* ]]; then
        record restart-confirm
        [ "$FIXTURE_MODE" != restart-cancel ]
      else
        record apply-confirm
        [ "$FIXTURE_MODE" != apply-cancel ]
      fi
    elif [[ "$source" == *'display alert'* ]]; then
      record alert
    else
      record notification
    fi
    ;;
  pgrep) [ -f "$HOME/running" ];;
  kill)
    record "kill $*"
    [ "$1" = -0 ] || exit 99
    ;;
  sleep) :;;
  open) record activate;;
  node) record "injector $*";;
  *) printf 'Unexpected native fixture call: %s\\n' "$kind" >&2; exit 99;;
esac
`;

async function runFixture(t, mode, entry = "apply-from-menubar-macos.sh", args = []) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-restart-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const engine = path.join(root, "scripts");
  const fixtureHome = path.join(root, "home");
  const stateRoot = path.join(fixtureHome, "Library/Application Support/CodexDreamSkinStudio");
  await fs.mkdir(engine, { recursive: true });
  await fs.mkdir(stateRoot, { recursive: true });
  const eventsPath = path.join(root, "events");
  await fs.writeFile(eventsPath, "");
  const initialState = '{"session":"active","appliedThemeId":"original"}\n';
  await fs.writeFile(path.join(stateRoot, "state.json"), initialState);
  if (mode !== "cold") await fs.writeFile(path.join(fixtureHome, "running"), "");
  const nativePath = path.join(root, "native");
  await fs.writeFile(nativePath, nativeStub, { mode: 0o700 });
  const nodePath = path.join(root, "node");
  await fs.writeFile(nodePath, `#!/bin/bash\nexec ${quote(nativePath)} node "$@"\n`, { mode: 0o700 });
  // Only the disposable copies replace native effects. Production control flow
  // and the actual quit helper run unchanged, without contacting a real app.
  for (const name of ["common-macos.sh", "start-dream-skin-macos.sh", "apply-from-menubar-macos.sh", "localization-macos.sh"]) {
    let source = await fs.readFile(path.join(scripts, name), "utf8");
    for (const [command, kind] of [
      ["/usr/bin/osascript", "osascript"], ["/usr/bin/pgrep", "pgrep"],
      ["/bin/kill", "kill"], ["/bin/sleep", "sleep"], ["/usr/bin/open", "open"],
    ]) source = source.replaceAll(command, `${quote(nativePath)} ${kind}`);
    if (name === "common-macos.sh") source += overrides;
    await fs.writeFile(path.join(engine, name), source, { mode: 0o700 });
  }
  await fs.writeFile(path.join(engine, "status-dream-skin-macos.sh"),
    "#!/bin/bash\nprintf 'session=active\\ntheme=Original\\nport=9341\\n'\n", { mode: 0o700 });
  const result = spawnSync("/bin/bash", [path.join(engine, entry), ...args], {
    env: { ...process.env, HOME: fixtureHome, DREAMSKIN_LANG: "en", FIXTURE_MODE: mode,
      FIXTURE_EVENTS: eventsPath, FIXTURE_NODE: nodePath },
    // Leave room for concurrent compiler tests; production deadlines are mocked.
    encoding: "utf8", timeout: 20000,
  });
  assert.ifError(result.error);
  const events = (await fs.readFile(eventsPath, "utf8")).trim().split("\n");
  const log = await fs.readFile(path.join(stateRoot, "menubar-apply.log"), "utf8").catch(() => "");
  return { ...result, events, log, initialState,
    state: await fs.readFile(path.join(stateRoot, "state.json"), "utf8") };
}

function assertNoRestartEffects(result) {
  assert.equal(result.state, result.initialState);
  for (const effect of ["release-launchd", "stop-injector", "config", "launch", "launch-injector", "write-state", "active", "operation success"]) {
    assert.ok(!result.events.includes(effect), `Unexpected ${effect}: ${result.events.join(", ")}`);
  }
  assert.ok(!result.events.some((event) => event.startsWith("kill ")));
  assert.doesNotMatch(result.log, /Complete: skin applied/);
}

for (const mode of ["apply-cancel", "restart-cancel", "official-cancel"]) {
  test(`menu apply preserves the current session after ${mode}`, async (t) => {
    const result = await runFixture(t, mode);
    assert.equal(result.status, 0, result.stderr + result.log);
    assertNoRestartEffects(result);
    assert.ok(result.events.includes("operation cancelled"));
    assert.ok(!result.events.includes("operation failed"));
    assert.ok(!result.events.includes("alert"));
    assert.match(result.log, /Cancelled; the previous skin is unchanged/);
    if (mode === "apply-cancel") assert.ok(!result.events.includes("hot-reapply"));
    if (mode === "restart-cancel") assert.ok(!result.events.includes("official-quit"));
    if (mode === "official-cancel") assert.ok(result.events.includes("official-quit"));
  });
}

for (const [mode, status] of [["apple-event-timeout", 124], ["still-running", 124], ["quit-error", 1]]) {
  test(`menu apply reports failure without forcing restart after ${mode}`, async (t) => {
    const result = await runFixture(t, mode);
    assert.equal(result.status, status, result.stderr + result.log);
    assertNoRestartEffects(result);
    assert.ok(result.events.includes("operation failed"));
    assert.ok(!result.events.includes("operation cancelled"));
    assert.ok(result.events.includes("alert"));
  });
}

test("menu restart follows separate consent, confirmed exit and renderer verification", async (t) => {
  const result = await runFixture(t, "quit-success");
  assert.equal(result.status, 0, result.stderr + result.log);
  const ordered = ["apply-confirm", "hot-reapply", "restart-confirm", "official-quit", "release-launchd", "stop-injector", "config", "launch", "active", "operation success"];
  let previous = -1;
  for (const event of ordered) {
    const index = result.events.indexOf(event);
    assert.ok(index > previous, `Expected ordered ${event}: ${result.events.join(", ")}`);
    previous = index;
  }
  assert.ok(result.events.some((event) => event.startsWith("injector ") && event.includes(" --verify ")));
  assert.ok(!result.events.some((event) => /^kill -(TERM|KILL)/.test(event)));
  assert.match(result.log, /Complete: skin applied/);
});

test("successful live apply does not request restart", async (t) => {
  const result = await runFixture(t, "hot");
  assert.equal(result.status, 0, result.stderr + result.log);
  assert.deepEqual(result.events, ["apply-confirm", "hot-reapply"]);
});

test("cold launch needs no restart consent or quit request", async (t) => {
  const result = await runFixture(t, "cold");
  assert.equal(result.status, 0, result.stderr + result.log);
  assert.ok(!result.events.includes("restart-confirm"));
  assert.ok(!result.events.includes("official-quit"));
  assert.ok(result.events.includes("launch"));
  assert.ok(result.events.includes("operation success"));
});

test("explicit CLI restart consent still respects official quit cancellation", async (t) => {
  const result = await runFixture(t, "official-cancel", "start-dream-skin-macos.sh", ["--restart-existing"]);
  assert.equal(result.status, 20, result.stderr);
  assertNoRestartEffects(result);
  assert.ok(!result.events.includes("restart-confirm"));
  assert.ok(result.events.includes("operation cancelled"));
});

test("CLI start without restart consent leaves a running app untouched", async (t) => {
  const result = await runFixture(t, "quit-success", "start-dream-skin-macos.sh");
  assert.equal(result.status, 1, result.stderr);
  assertNoRestartEffects(result);
  assert.ok(!result.events.includes("official-quit"));
});

test("AppleScript maps native quit errors without contacting an application", {
  skip: process.platform !== "darwin" ? "AppleScript requires macOS" : false,
}, async () => {
  const common = await fs.readFile(path.join(scripts, "common-macos.sh"), "utf8");
  const helper = common.slice(common.indexOf("quit_codex_for_restart()"), common.indexOf("\nstop_codex()"));
  const block = helper.match(/<<'APPLESCRIPT'\n([\s\S]*?)\nAPPLESCRIPT/);
  assert.ok(block);
  const quitCommand = 'tell application id "com.openai.codex" to quit';
  assert.ok(block[1].includes(quitCommand));
  for (const [replacement, status, output] of [
    ['error "Fixture cancellation" number -128', 0, "cancelled"],
    ['error "Fixture timeout" number -1712', 0, "timed-out"],
    ['error "Fixture failure" number -1708', 1, ""],
    ["set fixtureFinished to true", 0, "requested"],
  ]) {
    const script = block[1].replace(quitCommand, replacement);
    assert.doesNotMatch(script, /tell application/);
    const result = spawnSync("/usr/bin/osascript", ["-"], { input: script, encoding: "utf8", timeout: 5000 });
    assert.ifError(result.error);
    assert.equal(result.status, status, result.stderr);
    assert.equal(result.stdout.trim(), output);
  }
});
