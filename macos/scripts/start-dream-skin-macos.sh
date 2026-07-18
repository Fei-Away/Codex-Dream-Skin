#!/bin/bash

set -Eeuo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
OPERATION_TOKEN=""
OPERATION_FINISHED="false"
VERIFY_OUTPUT=""

record_start_exit() {
  local code="$1"
  local line="$2"
  local current_session=""
  [ -z "${VERIFY_OUTPUT:-}" ] || /bin/rm -f "$VERIFY_OUTPUT"
  [ "$code" -ne 0 ] || return 0
  [ "$OPERATION_FINISHED" != "true" ] || return 0
  [ -n "${OPERATION_TOKEN:-}" ] || return 0
  ensure_state_root 2>/dev/null || true
  if [ -f "$STATE_PATH" ] && [ -n "${NODE:-}" ]; then
    current_session="$(state_field session 2>/dev/null || true)"
    [ "$current_session" != "applying" ] || mark_state_stale 2>/dev/null || true
  fi
  printf '%s exit=%s line=%s\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" "$code" "$line" \
    >> "$START_ERROR_LOG" 2>/dev/null || true
  write_operation_state failed "应用失败，应用结果未确认" "${OPERATION_TOKEN:-}" 2>/dev/null || true
  finish_client_operation "${PORT:-9341}" error "应用失败，应用结果未确认" \
    "$OPERATION_TOKEN" 1500 >/dev/null 2>&1 || true
  printf 'ChatGPT Dream Skin: start failed at line %s (exit %s). See %s\n' "$line" "$code" "$START_ERROR_LOG" >&2
}
trap 'code=$?; record_start_exit "$code" "$LINENO"' EXIT

PORT=9341
PORT_EXPLICIT="false"
RESTART_EXISTING="false"
PROMPT_RESTART="false"
FOREGROUND_INJECTOR="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; PORT_EXPLICIT="true"; shift 2 ;;
    --restart-existing) RESTART_EXISTING="true"; shift ;;
    --prompt-restart) PROMPT_RESTART="true"; shift ;;
    --foreground-injector) FOREGROUND_INJECTOR="true"; shift ;;
    *) fail "Unknown start argument: $1" ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) fail "Invalid port: $PORT" ;; esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "Port must be between 1024 and 65535."

ensure_state_root
if [ "$FOREGROUND_INJECTOR" != "true" ]; then
  OPERATION_TOKEN="$(new_operation_token)"
  write_operation_state applying "正在应用皮肤" "$OPERATION_TOKEN" \
    || fail "Could not publish the apply operation state."
fi
discover_codex_app
require_signed_node_runtime

if [ "$PORT_EXPLICIT" = "false" ] && [ -f "$STATE_PATH" ]; then
  saved_port="$(state_field port)" || fail "Could not read the existing state port."
  [ -n "$saved_port" ] && PORT="$saved_port"
fi

DEBUG_READY="false"
if verified_cdp_endpoint "$PORT"; then DEBUG_READY="true"; fi

if [ "$DEBUG_READY" = "true" ] && [ -n "$OPERATION_TOKEN" ]; then
  begin_client_operation "$PORT" apply 3000 "$OPERATION_TOKEN" >/dev/null 2>&1 || true
fi

# A connected renderer can show progress before the App check. Before this
# script launches or restarts ChatGPT, verify the complete bundle.
if [ "$DEBUG_READY" = "false" ]; then
  verify_macos_app_signature deep
else
  verify_macos_app_signature quick
fi

if codex_is_running && [ "$DEBUG_READY" = "false" ]; then
  if [ "$PROMPT_RESTART" = "true" ] && [ "$RESTART_EXISTING" = "false" ]; then
    if ! /usr/bin/osascript -e 'display dialog "ChatGPT 需要重启一次才能启用皮肤。通常会在 10–30 秒内完成。" buttons {"取消", "重启并应用"} default button "重启并应用" with title "ChatGPT Dream Skin"' >/dev/null; then
      write_operation_state cancelled "操作已取消，原皮肤保持不变" "$OPERATION_TOKEN" \
        || fail "Could not publish the cancelled apply state."
      finish_client_operation "$PORT" cancelled "操作已取消，原皮肤保持不变" \
        "$OPERATION_TOKEN" 1500 >/dev/null 2>&1 || true
      OPERATION_FINISHED="true"
      exit 0
    fi
    RESTART_EXISTING="true"
  fi
  [ "$RESTART_EXISTING" = "true" ] || fail "ChatGPT is already running without the verified skin CDP endpoint. Close it first or pass --restart-existing."
  stop_codex true
fi

if [ -f "$STATE_PATH" ]; then
  stop_recorded_injector
fi

INJECTOR_PID=""
if [ "$DEBUG_READY" = "false" ]; then
  PORT="$(select_available_port "$PORT")"
  printf 'Launching ChatGPT with skin debug port %s…\n' "$PORT" >&2
  launch_codex_with_cdp "$PORT"
  # Start probing immediately instead of waiting for the native window to finish loading.
  if [ "$FOREGROUND_INJECTOR" != "true" ]; then
    INJECTOR_PID="$(launch_injector_daemon "$PORT")"
  fi
  # Some builds open the window slowly; also try activating the app once.
  /usr/bin/open -na "$CODEX_BUNDLE" --args --remote-debugging-address=127.0.0.1 --remote-debugging-port="$PORT" >/dev/null 2>&1 || true
  if ! wait_for_cdp "$PORT"; then
    [ -z "$INJECTOR_PID" ] || /bin/kill -TERM "$INJECTOR_PID" 2>/dev/null || true
    fail "ChatGPT did not expose a verified loopback CDP endpoint on port $PORT within 45 seconds. See $APP_LOG and $APP_ERROR_LOG"
  fi
fi

if [ "$FOREGROUND_INJECTOR" = "true" ]; then
  exec "$NODE" "$INJECTOR" --watch --port "$PORT" --theme-dir "$THEME_DIR" \
    --operation-state "$OPERATION_STATE_PATH" --operation-ack "$OPERATION_ACK_PATH"
fi

if [ -z "$INJECTOR_PID" ]; then
  INJECTOR_PID="$(launch_injector_daemon "$PORT")"
fi
/bin/sleep 0.15
/bin/kill -0 "$INJECTOR_PID" 2>/dev/null || fail "The injector exited during startup. See $INJECTOR_ERROR_LOG"
INJECTOR_STARTED_AT="$(process_started_at "$INJECTOR_PID")"
[ -n "$INJECTOR_STARTED_AT" ] || fail "Could not record the injector process start time."
CODEX_PID="$(codex_main_pids | /usr/bin/head -n 1)"
write_state "$PORT" "$INJECTOR_PID" "$INJECTOR_STARTED_AT" "$CODEX_PID"

# Commit active only after the renderer, exact theme, and payload revision verify.
VERIFY_OUTPUT="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/dream-skin-verify.XXXXXX")"
/bin/chmod 600 "$VERIFY_OUTPUT"
cleanup_verify_output() {
  [ -z "${VERIFY_OUTPUT:-}" ] || /bin/rm -f "$VERIFY_OUTPUT"
  VERIFY_OUTPUT=""
}
if "$NODE" "$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 20000 >"$VERIFY_OUTPUT" 2>/dev/null; then
  verify_code=0
else
  verify_code=$?
fi
if [ "$verify_code" -ne 0 ]; then
  # One more force inject before giving up
  if [ -n "$OPERATION_TOKEN" ]; then
    "$NODE" "$INJECTOR" --once --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 15000 \
      --operation-token "$OPERATION_TOKEN" >/dev/null 2>&1 || true
  else
    "$NODE" "$INJECTOR" --once --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 15000 >/dev/null 2>&1 || true
  fi
  if "$NODE" "$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 12000 >"$VERIFY_OUTPUT" 2>/dev/null; then
    verify_code=0
  else
    verify_code=$?
  fi
fi
if [ "$verify_code" -ne 0 ]; then
  # Verify the PID/path/start-time tuple before changing state. If the watcher
  # cannot be stopped safely, preserve the state as evidence and fail closed.
  if ! stop_recorded_injector; then
    cleanup_verify_output
    fail "Injection verification failed and the recorded injector could not be stopped safely; state was preserved. See $INJECTOR_ERROR_LOG"
  fi
  mark_state_stale || true
  cleanup_verify_output
  fail "Injection verification failed. The injector was stopped; see $INJECTOR_ERROR_LOG"
fi
cleanup_verify_output

mark_state_active || fail "Could not commit the verified active skin state."
write_operation_state success "皮肤已应用" "$OPERATION_TOKEN" \
  || fail "Could not publish the completed apply state."
OPERATION_FINISHED="true"
printf 'ChatGPT Dream Skin %s is active on loopback port %s.\n' "$SKIN_VERSION" "$PORT"
