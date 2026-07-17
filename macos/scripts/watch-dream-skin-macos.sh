#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

MODE="watch"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --once) MODE="once"; shift ;;
    --watch) MODE="watch"; shift ;;
    *) fail "Unknown watcher argument: $1" ;;
  esac
done

SETTLE_SECONDS="${DREAM_SKIN_WATCHER_SETTLE_SECONDS:-3}"
POLL_SECONDS="${DREAM_SKIN_WATCHER_POLL_SECONDS:-2}"
COOLDOWN_SECONDS="${DREAM_SKIN_WATCHER_COOLDOWN_SECONDS:-120}"
for seconds in "$SETTLE_SECONDS" "$POLL_SECONDS" "$COOLDOWN_SECONDS"; do
  case "$seconds" in ''|*[!0-9]*) fail "Watcher timing values must be non-negative integers." ;; esac
done

discover_codex_app
ensure_node_runtime
ensure_state_root

current_codex_pid() {
  if [ -n "${DREAM_SKIN_TEST_CODEX_PID:-}" ]; then
    printf '%s\n' "$DREAM_SKIN_TEST_CODEX_PID"
    return 0
  fi
  codex_main_pids | /usr/bin/head -n 1
}

recovery_port() {
  local port="9341"
  if [ -f "$STATE_PATH" ]; then
    port="$(state_field port 2>/dev/null || true)"
  fi
  case "$port" in ''|*[!0-9]*) port="9341" ;; esac
  if [ "$port" -lt 1024 ] || [ "$port" -gt 65535 ]; then port="9341"; fi
  printf '%s\n' "$port"
}

recovery_cdp_ready() {
  case "${DREAM_SKIN_TEST_CDP_READY:-}" in
    true) return 0 ;;
    false) return 1 ;;
  esac
  verified_cdp_endpoint "$(recovery_port)"
}

recovery_injector_ready() {
  case "${DREAM_SKIN_TEST_INJECTOR_READY:-}" in
    true) return 0 ;;
    false) return 1 ;;
  esac
  [ -f "$STATE_PATH" ] || return 1
  local pid
  local saved_port
  local saved_start
  local saved_node
  local saved_injector
  pid="$(state_field injectorPid 2>/dev/null || true)"
  case "$pid" in ''|0|*[!0-9]*) return 1 ;; esac
  saved_port="$(state_field port 2>/dev/null || true)"
  saved_start="$(state_field injectorStartedAt 2>/dev/null || true)"
  saved_node="$(state_field nodePath 2>/dev/null || true)"
  saved_injector="$(state_field injectorPath 2>/dev/null || true)"
  recorded_injector_process_matches \
    "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port"
}

recovery_session_ready() {
  recovery_cdp_ready && recovery_injector_ready
}

attempt_is_cooling_down() {
  local pid="$1"
  local now="$2"
  local last_pid=""
  local last_at="0"
  if [ -f "$RECOVERY_ATTEMPT_PATH" ]; then
    read -r last_pid last_at < "$RECOVERY_ATTEMPT_PATH" || true
  fi
  case "$last_at" in ''|*[!0-9]*) last_at="0" ;; esac
  [ "$last_pid" = "$pid" ] || return 1
  [ $((now - last_at)) -lt "$COOLDOWN_SECONDS" ]
}

recover_once() {
  [ -f "$RECOVERY_ENABLED_PATH" ] || return 0

  local pid
  pid="$(current_codex_pid)"
  [ -n "$pid" ] && [ "$pid" != "0" ] || return 0
  recovery_session_ready && return 0

  /bin/sleep "$SETTLE_SECONDS"
  [ "$(current_codex_pid)" = "$pid" ] || return 0
  recovery_session_ready && return 0

  local now="${DREAM_SKIN_TEST_NOW:-$(/bin/date +%s)}"
  local port
  case "$now" in ''|*[!0-9]*) fail "Watcher time must be an integer epoch." ;; esac
  port="$(recovery_port)"
  attempt_is_cooling_down "$pid" "$now" && return 0
  /bin/mkdir "$RECOVERY_LOCK_DIR" 2>/dev/null || return 0
  trap '/bin/rm -rf "$RECOVERY_LOCK_DIR"' EXIT INT TERM
  /usr/bin/printf '%s %s\n' "$pid" "$now" > "$RECOVERY_ATTEMPT_PATH"
  quarantine_untrusted_injector_state

  local start_command="${DREAM_SKIN_RECOVERY_START_COMMAND:-$SCRIPT_DIR/start-dream-skin-macos.sh}"
  if [ ! -x "$start_command" ]; then
    printf 'Codex Dream Skin recovery start command is not executable: %s\n' "$start_command" >> "$RECOVERY_ERROR_LOG"
  else
    "$start_command" --port "$port" --restart-existing >> "$RECOVERY_LOG" 2>> "$RECOVERY_ERROR_LOG" || true
  fi

  /bin/rm -rf "$RECOVERY_LOCK_DIR"
  trap - EXIT INT TERM
}

if [ "$MODE" = "once" ]; then
  recover_once
  exit 0
fi

while true; do
  recover_once
  /bin/sleep "$POLL_SECONDS"
done
