#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

record_start_error() {
  local code="$1"
  local line="$2"
  ensure_state_root
  printf '%s exit=%s line=%s\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" "$code" "$line" >> "$START_ERROR_LOG"
  printf 'Codex Dream Skin Studio: start failed at line %s (exit %s). See %s\n' "$line" "$code" "$START_ERROR_LOG" >&2
}
trap 'code=$?; record_start_error "$code" "$LINENO"' ERR

PORT=9341
PORT_EXPLICIT="false"
FOREGROUND_INJECTOR="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; PORT_EXPLICIT="true"; shift 2 ;;
    --foreground-injector) FOREGROUND_INJECTOR="true"; shift ;;
    *) fail "Unknown start argument: $1" ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) fail "Invalid port: $PORT" ;; esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "Port must be between 1024 and 65535."

discover_codex_app
require_macos_runtime
ensure_state_root

if [ "$PORT_EXPLICIT" = "false" ] && [ -f "$STATE_PATH" ]; then
  saved_port="$(state_field port)" || fail "Could not read the existing state port."
  [ -n "$saved_port" ] && PORT="$saved_port"
fi

DEBUG_READY="false"
if verified_cdp_endpoint "$PORT"; then DEBUG_READY="true"; fi

if codex_is_running && [ "$DEBUG_READY" = "false" ]; then
  fail "Codex is already running without the skin debug port. Quit Codex yourself, then open '栋哥 Codex.app' again."
fi

if [ "$DEBUG_READY" = "false" ]; then
  PORT="$(select_available_port "$PORT")"
  printf 'Launching Codex with skin debug port %s…\n' "$PORT" >&2
  launch_codex_with_cdp "$PORT"
  if ! wait_for_cdp "$PORT"; then
    # Last resort: if something already listens and answers HTTP, continue.
    if cdp_http_ready "$PORT"; then
      printf 'CDP HTTP is up on %s; continuing with soft verification.\n' "$PORT" >&2
    else
      fail "Codex did not expose a loopback CDP endpoint on port $PORT within 45 seconds. See $APP_LOG and $APP_ERROR_LOG"
    fi
  fi
fi

if [ -f "$STATE_PATH" ]; then
  stop_recorded_injector
  /bin/rm -f "$STATE_PATH"
fi

if [ "$FOREGROUND_INJECTOR" = "true" ]; then
  exec "$NODE" "$INJECTOR" --watch --port "$PORT" --theme-dir "$THEME_DIR"
fi

INJECTOR_PID="$(launch_injector_daemon "$PORT")"
/bin/sleep 0.8
/bin/kill -0 "$INJECTOR_PID" 2>/dev/null || fail "The injector exited during startup. See $INJECTOR_ERROR_LOG"
INJECTOR_STARTED_AT="$(process_started_at "$INJECTOR_PID")"
[ -n "$INJECTOR_STARTED_AT" ] || fail "Could not record the injector process start time."
CODEX_PID="$(codex_main_pids | /usr/bin/head -n 1)"
write_state "$PORT" "$INJECTOR_PID" "$INJECTOR_STARTED_AT" "$CODEX_PID"

# Soft verify: keep the injector even if secondary selectors differ by Codex version.
set +e
"$NODE" "$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 20000 >/tmp/dream-skin-verify.$$.json 2>/dev/null
verify_code=$?
set -e
if [ "$verify_code" -ne 0 ]; then
  # One more force inject before giving up
  "$NODE" "$INJECTOR" --once --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 15000 >/dev/null 2>&1 || true
  set +e
  "$NODE" "$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 12000 >/tmp/dream-skin-verify.$$.json 2>/dev/null
  verify_code=$?
  set -e
fi
if [ "$verify_code" -ne 0 ]; then
  # If CSS markers are present, treat as soft success (do not kill injector).
  if /usr/bin/grep -q '"installed": true' /tmp/dream-skin-verify.$$.json 2>/dev/null; then
    printf 'Codex Dream Skin Studio %s is active (soft verify) on port %s.\n' "$SKIN_VERSION" "$PORT"
    /bin/rm -f /tmp/dream-skin-verify.$$.json
    exit 0
  fi
  /bin/launchctl remove "$INJECTOR_JOB_LABEL" >/dev/null 2>&1 || /bin/kill -TERM "$INJECTOR_PID" 2>/dev/null || true
  /bin/rm -f "$STATE_PATH" /tmp/dream-skin-verify.$$.json
  fail "Injection verification failed. The injector was stopped; see $INJECTOR_ERROR_LOG"
fi
/bin/rm -f /tmp/dream-skin-verify.$$.json

printf 'Codex Dream Skin Studio %s is active on loopback port %s.\n' "$SKIN_VERSION" "$PORT"
