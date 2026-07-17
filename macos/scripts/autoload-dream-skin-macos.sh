#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

COMMAND="${1:-status}"
shift || true
GUI_DOMAIN="gui/$(/usr/bin/id -u)"

fail_unknown() {
  fail "Usage: autoload-dream-skin-macos.sh enable [--port PORT] [--no-start] | disable [--keep-live] | status [--json]"
}

agent_loaded() {
  /bin/launchctl print "$GUI_DOMAIN/$AUTOLOAD_LABEL" >/dev/null 2>&1
}

bootout_agent() {
  /bin/launchctl bootout "$GUI_DOMAIN/$AUTOLOAD_LABEL" >/dev/null 2>&1 || true
}

write_auto_state() {
  local enabled="$1"
  local paused="${2:-false}"
  ensure_state_root
  local temporary
  temporary="$(/usr/bin/mktemp "$STATE_ROOT/autoload.XXXXXX")" || fail "Could not create automatic-loading state file."
  if ! /usr/bin/printf '{\n  "schemaVersion": 1,\n  "enabled": %s,\n  "paused": %s,\n  "updatedAt": "%s"\n}\n' \
    "$enabled" "$paused" "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$temporary"; then
    /bin/rm -f "$temporary"
    fail "Could not write automatic-loading state."
  fi
  /bin/chmod 600 "$temporary"
  /bin/mv -f "$temporary" "$AUTOLOAD_STATE_PATH"
}

read_json_field() {
  [ -f "$1" ] || return 0
  /usr/bin/sed -n \
    -e 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^\"]*\)".*/\1/p' \
    -e 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' \
    -e 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*true.*/true/p' \
    -e 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*false.*/false/p' \
    "$1" 2>/dev/null | /usr/bin/head -n1
}

state_value() {
  read_json_field "$AUTOLOAD_STATE_PATH" "$1"
}

state_port() {
  read_json_field "$STATE_PATH" port
}

codex_running_for_status() {
  local pid
  local command_line
  while read -r pid command_line; do
    [ -n "$pid" ] || continue
    case "$command_line" in
      */Contents/MacOS/ChatGPT|*/Contents/MacOS/ChatGPT\ *) return 0 ;;
    esac
  done < <(/bin/ps -axo pid=,command=)
  return 1
}

find_existing_port() {
  local candidate="$(state_port)"
  if [ -n "$candidate" ] && verified_cdp_endpoint "$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi
  for candidate in $(seq 9341 9441); do
    if verified_cdp_endpoint "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

generate_agent() {
  /bin/mkdir -p "$HOME/Library/LaunchAgents"
  "$NODE" "$SCRIPT_DIR/write-autoload-plist.mjs" \
    --output "$AUTOLOAD_PLIST" \
    --label "$AUTOLOAD_LABEL" \
    --supervisor "$AUTOLOAD_SUPERVISOR" \
    --stdout "$AUTOLOAD_LOG" \
    --stderr "$AUTOLOAD_ERROR_LOG" >/dev/null
  /usr/bin/plutil -lint "$AUTOLOAD_PLIST" >/dev/null
}

start_agent() {
  bootout_agent
  local deadline=$((SECONDS + 12))
  while agent_loaded && [ "$SECONDS" -lt "$deadline" ]; do
    /bin/sleep 0.4
  done
  local attempt
  for attempt in 1 2 3 4 5 6 7 8; do
    if /bin/launchctl bootstrap "$GUI_DOMAIN" "$AUTOLOAD_PLIST" >/dev/null 2>&1; then
      if /bin/launchctl kickstart -k "$GUI_DOMAIN/$AUTOLOAD_LABEL" >/dev/null 2>&1; then
        return 0
      fi
      bootout_agent
    fi
    /bin/sleep 0.8
  done
  fail "Could not register the automatic-loading LaunchAgent. Try the Enable Auto Load launcher again."
}

stop_recorded_runtime() {
  if [ -f "$STATE_PATH" ]; then
    stop_recorded_injector || true
  fi
}

remove_live_skin() {
  local port="$(state_port)"
  [ -n "$port" ] || port=9341
  if verified_cdp_endpoint "$port"; then
    "$NODE" "$INJECTOR" --remove --port "$port" --theme-dir "$THEME_DIR" --timeout-ms 8000 >/dev/null \
      || fail "Could not remove the live skin from Codex."
  fi
}

enable_auto_load() {
  local port=9341
  local start_now="true"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --port) port="${2:-}"; shift 2 ;;
      --no-start) start_now="false"; shift ;;
      *) fail_unknown ;;
    esac
  done
  case "$port" in ''|*[!0-9]*) fail "Invalid port: $port" ;; esac
  [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || fail "Port must be between 1024 and 65535."

  discover_codex_app
  require_macos_runtime
  ensure_state_root
  "$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >/dev/null

  existing_port="$(find_existing_port || true)"
  if [ -n "$existing_port" ]; then
    port="$existing_port"
  fi
  if [ "$start_now" = "true" ] && codex_is_running && ! verified_cdp_endpoint "$port"; then
    if ! /usr/bin/osascript -e 'display dialog "Codex 需要重启一次才能启用自动加载。" buttons {"取消", "重启并启用"} default button "重启并启用" with title "Codex Dream Skin Studio"' >/dev/null 2>&1; then
      fail "Auto load setup was cancelled; the existing Codex session was left untouched."
    fi
    stop_codex true
  fi

  if [ "$start_now" = "true" ]; then
    # Upgrade/re-enable must not leave an older injector watching the same renderer.
    stop_recorded_injector || true
  fi
  write_auto_state true false
  generate_agent
  if [ "$start_now" = "true" ]; then
    start_agent
    printf 'Codex Dream Skin automatic loading is enabled and running.\n'
  else
    printf 'Codex Dream Skin automatic loading is enabled for the next macOS login.\n'
  fi
}

disable_auto_load() {
  local keep_live="false"
  local paused="false"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --keep-live) keep_live="true"; shift ;;
      --paused) paused="true"; shift ;;
      *) fail_unknown ;;
    esac
  done

  discover_codex_app
  require_macos_runtime
  ensure_state_root
  write_auto_state false "$paused"
  bootout_agent
  /bin/sleep 0.4
  stop_recorded_runtime
  if [ "$keep_live" = "false" ]; then
    remove_live_skin
  fi
  /bin/rm -f "$AUTOLOAD_PLIST"
  if [ "$paused" = "true" ]; then
    printf 'Codex Dream Skin automatic loading is paused.\n'
  else
    printf 'Codex Dream Skin automatic loading is disabled.\n'
  fi
}

status_auto_load() {
  local json="false"
  [ "${1:-}" = "--json" ] && json="true"
  local enabled="$(state_value enabled)"
  local paused="$(state_value paused)"
  local loaded="false"
  local codex="false"
  local cdp="false"
  local injector="false"
  local port="$(state_port)"
  [ -n "$enabled" ] || enabled="false"
  [ -n "$paused" ] || paused="false"
  agent_loaded && loaded="true"
  [ -n "$port" ] || port=9341
  codex_running_for_status && codex="true"
  /usr/bin/curl --noproxy '*' --silent --fail --max-time 1 \
    "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1 && cdp="true"
  if [ -f "$STATE_PATH" ]; then
    pid="$(read_json_field "$STATE_PATH" injectorPid)"
    [ -n "${pid:-}" ] && [ "$pid" != "0" ] && /bin/kill -0 "$pid" 2>/dev/null && injector="true"
  fi
  if [ "$json" = "true" ]; then
    printf '{"enabled":%s,"paused":%s,"agentLoaded":%s,"codexRunning":%s,"cdpReady":%s,"injectorAlive":%s,"port":%s}\n' \
      "$enabled" "$paused" "$loaded" "$codex" "$cdp" "$injector" "$port"
    return 0
  fi
  printf 'enabled=%s\n' "$enabled"
  printf 'paused=%s\n' "$paused"
  printf 'agent=%s\n' "$loaded"
  printf 'codex=%s\n' "$codex"
  printf 'cdp=%s\n' "$cdp"
  printf 'injector=%s\n' "$injector"
  printf 'port=%s\n' "$port"
}

case "$COMMAND" in
  enable) enable_auto_load "$@" ;;
  disable) disable_auto_load "$@" ;;
  status) status_auto_load "$@" ;;
  *) fail_unknown ;;
esac
