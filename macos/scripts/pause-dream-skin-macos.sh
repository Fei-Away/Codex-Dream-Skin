#!/bin/bash

# Soft-off: remove the live skin and stop the injector. Does not restart ChatGPT
# and does not restore the official base theme backup.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
OPERATION_TOKEN=""

record_pause_error() {
  local code="$1"
  local current_session=""
  local recovery_pid=""
  local recovery_start=""
  local recovery_node=""
  local recovery_path=""
  local recovery_port=""
  local recovery_protocol=""
  local expect_recovery="false"
  [ "$code" -ne 0 ] || return 0
  [ -n "${OPERATION_TOKEN:-}" ] || return 0
  if [ -f "$STATE_PATH" ] && [ -n "${NODE:-}" ]; then
    current_session="$(state_field session 2>/dev/null || true)"
    recovery_pid="$(state_field injectorPid 2>/dev/null || true)"
    recovery_start="$(state_field injectorStartedAt 2>/dev/null || true)"
    recovery_node="$(state_field nodePath 2>/dev/null || true)"
    recovery_path="$(state_field injectorPath 2>/dev/null || true)"
    recovery_port="$(state_field port 2>/dev/null || true)"
    recovery_protocol="$(state_field injectorProtocol 2>/dev/null || true)"
    if [ "$recovery_protocol" = "3" ] \
      && recorded_injector_process_matches \
        "$recovery_pid" "$recovery_start" "$recovery_node" "$recovery_path" "$recovery_port" \
      && operation_ack_matches "$OPERATION_TOKEN" "$recovery_pid" control; then
      expect_recovery="true"
    fi
    if [ "$current_session" = "paused" ] || [ "$expect_recovery" = "true" ]; then
      mark_state_stale 2>/dev/null || true
    fi
  fi
  write_operation_state failed "暂停失败，原状态可能未改变" "${OPERATION_TOKEN:-}" 2>/dev/null || true
  finish_client_operation "${PORT:-9341}" error "暂停失败，原状态可能未改变" \
    "$OPERATION_TOKEN" 1500 >/dev/null 2>&1 || true
  if [ "$expect_recovery" = "true" ] \
    && wait_for_operation_ack "$OPERATION_TOKEN" "$recovery_pid" full 240 \
    && recorded_injector_process_matches \
      "$recovery_pid" "$recovery_start" "$recovery_node" "$recovery_path" "$recovery_port"; then
    mark_state_active 2>/dev/null || true
  fi
  alert_user "暂停失败，请重新打开菜单查看状态。"
}
trap 'record_pause_error "$?"' EXIT

operation_ack_matches() {
  local expected_token="$1"
  local expected_pid="$2"
  local expected_mode="$3"
  local acknowledged_token=""
  local acknowledged_mode=""
  local acknowledged_pid=""
  [ -f "$OPERATION_ACK_PATH" ] || return 1
  acknowledged_token="$(/usr/bin/plutil -extract operationToken raw -o - "$OPERATION_ACK_PATH" 2>/dev/null || true)"
  acknowledged_mode="$(/usr/bin/plutil -extract mode raw -o - "$OPERATION_ACK_PATH" 2>/dev/null || true)"
  acknowledged_pid="$(/usr/bin/plutil -extract injectorPid raw -o - "$OPERATION_ACK_PATH" 2>/dev/null || true)"
  [ "$acknowledged_token" = "$expected_token" ] \
    && [ "$acknowledged_mode" = "$expected_mode" ] \
    && [ "$acknowledged_pid" = "$expected_pid" ]
}

wait_for_operation_ack() {
  local expected_token="$1"
  local expected_pid="$2"
  local expected_mode="$3"
  local maximum_attempts="${4:-100}"
  local attempts=0
  while [ "$attempts" -lt "$maximum_attempts" ]; do
    operation_ack_matches "$expected_token" "$expected_pid" "$expected_mode" && return 0
    attempts=$((attempts + 1))
    /bin/sleep 0.05
  done
  return 1
}

PORT=9341
PORT_EXPLICIT="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; PORT_EXPLICIT="true"; shift 2 ;;
    *) fail "Unknown pause argument: $1" ;;
  esac
done

OPERATION_TOKEN="$(new_operation_token)"
ensure_state_root
/bin/rm -f "$OPERATION_ACK_PATH"
write_operation_state pausing "正在暂停皮肤" "$OPERATION_TOKEN" \
  || fail "Could not publish the pause operation state."
discover_codex_app
require_signed_node_runtime

if [ "$PORT_EXPLICIT" = "false" ] && [ -f "$STATE_PATH" ]; then
  saved_port="$(state_field port 2>/dev/null || true)"
  [ -n "${saved_port:-}" ] && PORT="$saved_port"
fi

DEBUG_READY="false"
if verified_cdp_endpoint "$PORT" 2>/dev/null; then
  DEBUG_READY="true"
fi
if codex_is_running && [ "$DEBUG_READY" != "true" ]; then
  fail "ChatGPT is running but the skin connection cannot be verified; pause was not reported as complete."
fi

if [ "$DEBUG_READY" = "true" ]; then
  begin_client_operation "$PORT" pause 3000 "$OPERATION_TOKEN" >/dev/null 2>&1 || true
fi

verify_macos_app_signature quick

REMOVED="false"
KEEP_CONTROL_WATCHER="false"
# Drop any launchd job that would relaunch ChatGPT with CDP after quit / quitting the menu bar.
release_codex_launchd_job || true
if [ -f "$STATE_PATH" ]; then
  injector_protocol="$(state_field injectorProtocol 2>/dev/null || true)"
  recorded_pid="$(state_field injectorPid 2>/dev/null || true)"
  recorded_start="$(state_field injectorStartedAt 2>/dev/null || true)"
  recorded_node="$(state_field nodePath 2>/dev/null || true)"
  recorded_path="$(state_field injectorPath 2>/dev/null || true)"
  recorded_port="$(state_field port 2>/dev/null || true)"
  if [ "$injector_protocol" = "3" ]; then
    case "$recorded_pid" in
      ''|*[!0-9]*) ;;
      *)
        if recorded_injector_process_matches \
          "$recorded_pid" "$recorded_start" "$recorded_node" "$recorded_path" "$recorded_port" \
          && wait_for_operation_ack "$OPERATION_TOKEN" "$recorded_pid" control \
          && recorded_injector_process_matches \
            "$recorded_pid" "$recorded_start" "$recorded_node" "$recorded_path" "$recorded_port"; then
          KEEP_CONTROL_WATCHER="true"
        fi
        ;;
    esac
  fi
  if [ "$KEEP_CONTROL_WATCHER" != "true" ]; then
    stop_recorded_injector \
      || fail "Could not stop the recorded injector; pause state was not written."
  fi
fi

if [ "$DEBUG_READY" = "true" ]; then
  if [ -n "$OPERATION_TOKEN" ]; then
    "$NODE" "$INJECTOR" --remove --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 8000 \
      --operation-token "$OPERATION_TOKEN" >/dev/null \
      || fail "Could not remove the live skin from ChatGPT."
  else
    "$NODE" "$INJECTOR" --remove --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 8000 >/dev/null \
      || fail "Could not remove the live skin from ChatGPT."
  fi
  REMOVED="true"
fi

"$NODE" -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const port = Number(process.argv[2]);
  const themeDir = process.argv[3];
  const root = process.argv[4];
  const keepControlWatcher = process.argv[5] === "true";
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const state = {
    ...prev,
    schemaVersion: 4,
    session: "paused",
    port,
    injectorPid: keepControlWatcher ? Number(prev.injectorPid || 0) : 0,
    injectorStartedAt: keepControlWatcher ? String(prev.injectorStartedAt || "") : "",
    injectorMode: keepControlWatcher ? "control" : "stopped",
    themeDir,
    projectRoot: root,
    pausedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  delete state.appliedThemeId;
  delete state.appliedThemeName;
  delete state.verifiedAt;
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
  ' "$STATE_PATH" "$PORT" "$THEME_DIR" "$PROJECT_ROOT" "$KEEP_CONTROL_WATCHER"
write_operation_state paused "皮肤已暂停" "$OPERATION_TOKEN" \
  || fail "Could not publish the completed pause state."
trap - EXIT

if [ "$REMOVED" = "true" ]; then
  printf 'ChatGPT Dream Skin paused (skin removed; control connection %s). Port %s may still be in debug mode.\n' \
    "$([ "$KEEP_CONTROL_WATCHER" = "true" ] && printf retained || printf unavailable)" "$PORT"
elif codex_is_running; then
  printf 'ChatGPT Dream Skin paused (injector stopped). Live remove skipped: CDP on port %s not verified.\n' "$PORT"
else
  printf 'ChatGPT Dream Skin paused (ChatGPT is not running).\n'
fi
