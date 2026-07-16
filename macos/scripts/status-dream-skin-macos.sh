#!/bin/bash

# Fast status for SwiftBar. No codesign / CDP probes by default.

set +e
set -u

SHORT="false"
JSON="false"
DEEP="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --short) SHORT="true"; shift ;;
    --json) JSON="true"; shift ;;
    --deep) DEEP="true"; shift ;;
    *) printf 'Unknown status argument: %s\n' "$1" >&2; exit 1 ;;
  esac
done

STATE_ROOT="${HOME}/Library/Application Support/CodexDreamSkinStudio"
STATE_PATH="${STATE_ROOT}/state.json"
THEME_DIR="${STATE_ROOT}/theme"

PORT="9341"
SESSION="off"
INJECTOR_ALIVE="false"
CDP_OK="false"
THEME_NAME=""
CODEX_RUNNING="false"

read_json_field() {
  /usr/bin/plutil -extract "$2" raw -o - "$1" 2>/dev/null || true
}

# Codex process: cheap name match only
if /usr/bin/pgrep -x ChatGPT >/dev/null 2>&1; then
  CODEX_RUNNING="true"
fi

if [ -f "$STATE_PATH" ]; then
  saved_port="$(read_json_field "$STATE_PATH" port)"
  [ -n "${saved_port:-}" ] && PORT="$saved_port"
  SESSION="$(read_json_field "$STATE_PATH" session)"
  pid="$(read_json_field "$STATE_PATH" injectorPid)"
  if [ -n "${pid:-}" ] && [ "$pid" != "0" ] && /bin/kill -0 "$pid" 2>/dev/null; then
    INJECTOR_ALIVE="true"
    SESSION="active"
  elif [ "${SESSION:-}" = "paused" ]; then
    SESSION="paused"
  elif [ -n "${pid:-}" ] && [ "$pid" != "0" ]; then
    SESSION="stale"
  elif [ -z "${SESSION:-}" ]; then
    SESSION="unknown"
  fi
fi

if [ -f "$THEME_DIR/theme.json" ]; then
  THEME_NAME="$(read_json_field "$THEME_DIR/theme.json" name)"
  [ -n "$THEME_NAME" ] || THEME_NAME="$(read_json_field "$THEME_DIR/theme.json" id)"
fi

if [ "$DEEP" = "true" ]; then
  if /usr/bin/curl --noproxy '*' --silent --fail --max-time 1 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    CDP_OK="true"
  fi
fi

label="Skin"
case "$SESSION" in
  active) label="Skin ON" ;;
  paused) label="Skin 暂停" ;;
  stale|unknown) label="Skin ?" ;;
  *) label="Skin 关" ;;
esac

if [ "$SHORT" = "true" ]; then
  printf '%s\n' "$label"
  exit 0
fi

if [ "$JSON" = "true" ]; then
  /usr/bin/osascript -l JavaScript - "$SESSION" "$PORT" "$INJECTOR_ALIVE" \
    "$CDP_OK" "$CODEX_RUNNING" "$THEME_NAME" <<'JXA'
function run(argv) {
  const numericPort = Number(argv[1]);
  return JSON.stringify({
    session: argv[0],
    port: Number.isInteger(numericPort) ? numericPort : argv[1],
    injectorAlive: argv[2] === "true",
    cdpOk: argv[3] === "true",
    codexRunning: argv[4] === "true",
    themeName: argv[5] || "",
  });
}
JXA
  exit 0
fi

printf 'session=%s\n' "$SESSION"
printf 'port=%s\n' "$PORT"
printf 'injector=%s\n' "$INJECTOR_ALIVE"
printf 'cdp=%s\n' "$CDP_OK"
printf 'codex=%s\n' "$CODEX_RUNNING"
printf 'theme=%s\n' "${THEME_NAME:-}"
