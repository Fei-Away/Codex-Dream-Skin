#!/bin/bash

set -u
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${PATH:-}"

if [ "${1:-}" != "--daemon" ]; then
  fail "This supervisor is managed by the Codex Dream Skin Auto Load LaunchAgent."
fi

SUPERVISOR_CHILD_PID=""
STOP_REQUESTED="false"
UNTHEMED_CODEX_PID=""

log() {
  printf '%s %s\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$AUTOLOAD_LOG"
}

stop_child() {
  local pid="${SUPERVISOR_CHILD_PID:-}"
  [ -n "$pid" ] || return 0
  if /bin/kill -0 "$pid" 2>/dev/null; then
    /bin/kill -TERM "$pid" 2>/dev/null || true
    local deadline=$((SECONDS + 5))
    while /bin/kill -0 "$pid" 2>/dev/null && [ "$SECONDS" -lt "$deadline" ]; do
      /bin/sleep 0.2
    done
    /bin/kill -KILL "$pid" 2>/dev/null || true
  fi
  SUPERVISOR_CHILD_PID=""
}

cleanup() {
  stop_child
}

request_stop() {
  STOP_REQUESTED="true"
}

trap cleanup EXIT
trap request_stop INT TERM HUP

autoload_enabled() {
  [ -f "$AUTOLOAD_STATE_PATH" ] || return 1
  /usr/bin/python3 - "$AUTOLOAD_STATE_PATH" <<'PY'
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        value = json.load(f)
    raise SystemExit(0 if value.get("enabled") is True and value.get("paused") is not True else 1)
except Exception:
    raise SystemExit(1)
PY
}

saved_port() {
  [ -f "$STATE_PATH" ] || return 0
  /usr/bin/python3 - "$STATE_PATH" <<'PY'
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        value = json.load(f).get("port")
    if value:
        print(value, end="")
except Exception:
    pass
PY
}

write_auto_state() {
  local enabled="$1"
  local paused="${2:-false}"
  /usr/bin/python3 - "$AUTOLOAD_STATE_PATH" "$enabled" "$paused" <<'PY'
import json, os, sys, tempfile

path, enabled, paused = sys.argv[1:]
value = {
    "schemaVersion": 1,
    "enabled": enabled == "true",
    "paused": paused == "true",
    "updatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z"),
}
directory = os.path.dirname(path)
os.makedirs(directory, mode=0o700, exist_ok=True)
fd, temporary = tempfile.mkstemp(prefix="autoload.", dir=directory)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
finally:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
PY
}

start_codex_direct() {
  local port="$1"
  : > "$APP_LOG"
  : > "$APP_ERROR_LOG"
  release_codex_launchd_job
  log "Launching official Codex with loopback CDP port $port."
  /usr/bin/nohup "$CODEX_EXE" \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="$port" \
    >>"$APP_LOG" 2>>"$APP_ERROR_LOG" &
}

choose_existing_port() {
  local candidate
  candidate="$(saved_port)"
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

start_injector() {
  local port="$1"
  stop_child
  : > "$INJECTOR_LOG"
  : > "$INJECTOR_ERROR_LOG"
  "$NODE" "$INJECTOR" --watch --port "$port" --theme-dir "$THEME_DIR" \
    >>"$INJECTOR_LOG" 2>>"$INJECTOR_ERROR_LOG" &
  SUPERVISOR_CHILD_PID="$!"
  /bin/sleep 0.8
  if ! /bin/kill -0 "$SUPERVISOR_CHILD_PID" 2>/dev/null; then
    log "Injector exited during startup."
    SUPERVISOR_CHILD_PID=""
    return 1
  fi
  "$NODE" "$INJECTOR" --once --port "$port" --theme-dir "$THEME_DIR" --timeout-ms 15000 \
    >>"$INJECTOR_LOG" 2>>"$INJECTOR_ERROR_LOG" || true
  return 0
}

discover_codex_app
require_macos_runtime
ensure_state_root

while [ "$STOP_REQUESTED" = "false" ]; do
  autoload_enabled || break

  PORT="$(choose_existing_port || true)"
  if [ -z "$PORT" ]; then
    PORT="$(saved_port)"
    [ -n "$PORT" ] || PORT=9341
    if ! codex_is_running; then
      PORT="$(select_available_port "$PORT")"
      start_codex_direct "$PORT"
      if ! wait_for_cdp "$PORT"; then
        log "Codex did not expose verified CDP on port $PORT."
        /bin/sleep 5
        continue
      fi
    else
      current_pid="$(codex_main_pids | /usr/bin/head -n 1)"
      if [ "$current_pid" != "$UNTHEMED_CODEX_PID" ]; then
        UNTHEMED_CODEX_PID="$current_pid"
        log "Codex is running without verified CDP; requesting one-time restart."
        if /usr/bin/osascript -e 'display dialog "Codex Dream Skin 需要重启一次才能自动加载。" buttons {"取消", "重启并加载"} default button "重启并加载" with title "Codex Dream Skin Studio"' >/dev/null 2>&1; then
          stop_codex true
          PORT="$(select_available_port "$PORT")"
          start_codex_direct "$PORT"
        fi
      fi
      /bin/sleep 5
      continue
    fi
  fi

  if ! verified_cdp_endpoint "$PORT"; then
    stop_child
    /bin/sleep 2
    continue
  fi

  if [ -z "$SUPERVISOR_CHILD_PID" ] || ! /bin/kill -0 "$SUPERVISOR_CHILD_PID" 2>/dev/null; then
    if start_injector "$PORT"; then
      log "Injector is active on verified Codex CDP port $PORT."
    else
      /bin/sleep 3
      continue
    fi
  fi

  INJECTOR_STARTED_AT="$(process_started_at "$SUPERVISOR_CHILD_PID")"
  CODEX_PID="$(codex_main_pids | /usr/bin/head -n 1)"
  write_state "$PORT" "$SUPERVISOR_CHILD_PID" "$INJECTOR_STARTED_AT" "$CODEX_PID"
  /bin/sleep 1
done

log "Auto-load supervisor stopped."
