#!/bin/bash

set -Euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

PORT=""
RESTART_EXISTING="false"
PROMPT_RESTART="false"
FOREGROUND_INJECTOR="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --restart-existing) RESTART_EXISTING="true"; shift ;;
    --prompt-restart) PROMPT_RESTART="true"; shift ;;
    --foreground-injector) FOREGROUND_INJECTOR="true"; shift ;;
    *) printf 'Unknown start argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

activate_codex_window() {
  # Focus existing Codex window via D-Bus if possible
  if command -v wmctrl >/dev/null 2>&1; then
    wmctrl -a "ChatGPT" 2>/dev/null || true
  fi
}

record_start_exit() {
  local code="$1"
  local line="$2"
  local current_session=""
  [ -z "${VERIFY_OUTPUT:-}" ] || rm -f "$VERIFY_OUTPUT"
  [ "$code" -ne 0 ] || return 0
  [ "$OPERATION_FINISHED" != "true" ] || return 0
  [ -n "${OPERATION_TOKEN:-}" ] || return 0
  ensure_state_root 2>/dev/null || true
  if [ -f "$STATE_PATH" ] && [ -n "${NODE:-}" ]; then
    current_session="$(state_field session 2>/dev/null || true)"
    [ "$current_session" != "applying" ] || mark_state_stale 2>/dev/null || true
  fi
  printf '%s exit=%s line=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$code" "$line" \
    >> "$START_ERROR_LOG" 2>/dev/null || true
  write_operation_state failed "$(dreamskin_text apply_unconfirmed)" "${OPERATION_TOKEN:-}" 2>/dev/null || true
  finish_client_operation "${PORT:-9335}" error "$(dreamskin_text apply_unconfirmed)" \
    "${OPERATION_TOKEN:-}" 1500 >/dev/null 2>&1 || true
  printf 'ChatGPT Dream Skin: start failed at line %s (exit %s). See %s\n' "$line" "$code" "$START_ERROR_LOG" >&2
}

trap 'code=$?; record_start_exit "$code" "$LINENO"' EXIT

OPERATION_TOKEN=""
OPERATION_FINISHED="false"
VERIFY_OUTPUT=""

cancel_start() {
  if [ -n "$OPERATION_TOKEN" ]; then
    write_operation_state cancelled "$(dreamskin_text cancelled_unchanged)" "$OPERATION_TOKEN" \
      || fail "Could not publish the cancelled apply state."
    finish_client_operation "$PORT" cancelled "$(dreamskin_text cancelled_unchanged)" \
      "$OPERATION_TOKEN" 1500 >/dev/null 2>&1 || true
  fi
  OPERATION_FINISHED="true"
  exit 20
}

ensure_node_runtime || fail "Could not validate the ChatGPT runtime."
PORT_EXPLICIT="false"
[ -n "${PORT:-}" ] && PORT_EXPLICIT="true"

# Select port: auto-detect existing Codex CDP port, or pick a free one
if [ -z "$PORT" ]; then
  if codex_is_running; then
    PORT="$(detect_running_codex_port 2>/dev/null || true)"
  fi
fi
if [ -z "$PORT" ]; then
  PORT="$(select_available_port 9335)"
fi
# If we detected an existing CDP port, skip launching Codex with a new port
if [ -n "$PORT" ] && codex_is_running && detect_running_codex_port 2>/dev/null | grep -q "^${PORT}$"; then
  export PORT
  DETECTED_EXISTING_CDP="true"
else
  export PORT
  DETECTED_EXISTING_CDP="false"
fi

# Check if we can hot-reapply (CDP already open)
if [ "$RESTART_EXISTING" = "false" ] && [ -f "$STATE_PATH" ]; then
  local_port="$(state_field port 2>/dev/null || true)"
  local_mode="$(state_field injectorMode 2>/dev/null || true)"
  if [ -n "$local_port" ] && verified_cdp_endpoint "$local_port" \
     && [ "$local_mode" = "full" ]; then
    # Hot re-apply path
    if [ -n "${OPERATION_TOKEN:-}" ]; then
      "$NODE" "$INJECTOR" --once --port "$local_port" --theme-dir "$THEME_DIR" \
        --timeout-ms 15000 --operation-token "$OPERATION_TOKEN" >/dev/null 2>&1 || true
    else
      "$NODE" "$INJECTOR" --once --port "$local_port" --theme-dir "$THEME_DIR" \
        --timeout-ms 15000 >/dev/null 2>&1 || true
    fi
    mark_state_active || fail "Could not mark state as active."
    write_operation_state success "$(dreamskin_text skin_applied)" "${OPERATION_TOKEN:-}" || true
    printf 'ChatGPT Dream Skin %s is active on loopback port %s.\n' "$SKIN_VERSION" "$local_port"
    exit 0
  fi
fi

# Full start: launch Codex with CDP, wait, inject
if [ "$RESTART_EXISTING" = "true" ] || [ "$PROMPT_RESTART" = "true" ]; then
  if codex_is_running; then
    if [ "$PROMPT_RESTART" = "true" ]; then
      # Try GUI prompt first
      if command -v zenity >/dev/null 2>&1; then
        if ! zenity --question --title="Codex Dream Skin" \
          --text="ChatGPT is running. Restart it to apply the theme?" \
          --ok-label="Restart" --cancel-label="Cancel" 2>/dev/null; then
          exit 20
        fi
      fi
    fi
    quit_codex_for_restart || {
      [ $? -eq 20 ] && exit 20
      fail "Failed to quit ChatGPT for restart."
    }
  fi
fi

# Launch Codex with CDP (skip if already running with CDP on detected port)
if [ "${DETECTED_EXISTING_CDP:-false}" = "true" ]; then
  printf 'Detected existing Codex with CDP on port %s.\n' "$PORT" >&2
else
  launch_codex_with_cdp "$PORT"
  wait_for_cdp "$PORT" || {
    # Codex may have started but CDP not yet ready; try activating window and retry
    activate_codex_window
    sleep 1
    wait_for_cdp "$PORT" || fail "CDP debug port did not become ready on port $PORT."
  }
fi

# Start injector daemon
if [ "$FOREGROUND_INJECTOR" = "true" ]; then
  # Foreground mode: run injector in this process
  "$NODE" "$INJECTOR" --watch --port "$PORT" --theme-dir "$THEME_DIR" \
    --operation-state "$OPERATION_STATE_PATH" \
    --operation-ack "$STATE_ROOT/operation-control-ack.json"
else
  INJECTOR_PID="$(launch_injector_daemon "$PORT")"
fi
sleep 0.15
[ -d "/proc/$INJECTOR_PID" ] || fail "The injector exited during startup. See $INJECTOR_ERROR_LOG"
INJECTOR_STARTED_AT="$(process_started_at "$INJECTOR_PID")"
[ -n "$INJECTOR_STARTED_AT" ] || fail "Could not record the injector process start time."
CODEX_PID="$(codex_main_pids | head -n 1)"
write_state "$PORT" "$INJECTOR_PID" "$INJECTOR_STARTED_AT" "${CODEX_PID:-0}"

# Commit active only after the renderer, exact theme, and payload revision verify.
VERIFY_OUTPUT="$(mktemp "${TMPDIR:-/tmp}/dream-skin-verify.XXXXXX")"
chmod 600 "$VERIFY_OUTPUT"
cleanup_verify_output() {
  [ -z "${VERIFY_OUTPUT:-}" ] || rm -f "$VERIFY_OUTPUT"
  VERIFY_OUTPUT=""
}
if "$NODE" "$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 20000 >"$VERIFY_OUTPUT" 2>/dev/null; then
  verify_code=0
else
  verify_code=$?
fi
if [ "$verify_code" -ne 0 ]; then
  activate_codex_window
  if [ -n "${OPERATION_TOKEN:-}" ]; then
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
  if ! stop_recorded_injector; then
    cleanup_verify_output
    fail "Injection verification failed and the recorded injector could not be stopped safely; state was preserved. See $INJECTOR_ERROR_LOG"
  fi
  mark_state_stale || true
  cleanup_verify_output
  fail "Injection verification failed. The injector was stopped; see $INJECTOR_ERROR_LOG"
fi
cleanup_verify_output

mark_state_active || fail "Could not commit the active skin state."
write_operation_state success "$(dreamskin_text skin_applied)" "${OPERATION_TOKEN:-}" \
  || fail "Could not publish the completed apply state."
OPERATION_FINISHED="true"
printf 'ChatGPT Dream Skin %s is active on loopback port %s.\n' "$SKIN_VERSION" "$PORT"
