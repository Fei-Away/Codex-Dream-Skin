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
AUTOLOAD_STATE_PATH="${STATE_ROOT}/autoload.json"
AUTOLOAD_LABEL="com.openai.codex-dream-skin-studio.autoload"
THEME_DIR="${STATE_ROOT}/theme"

PORT="9341"
SESSION="off"
INJECTOR_ALIVE="false"
CDP_OK="false"
THEME_NAME=""
CODEX_RUNNING="false"
AUTOLOAD_ENABLED="false"
AUTOLOAD_PAUSED="false"
AUTOLOAD_AGENT="false"

read_json_field() {
  /usr/bin/python3 - "$1" "$2" 2>/dev/null <<'PY' || true
import json, sys
try:
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    v = data.get(sys.argv[2])
    if v is not None:
        print(v, end="")
except Exception:
    pass
PY
}

# Codex process: cheap executable-path match, refined from the recorded PID below.
if /usr/bin/pgrep -f '/(ChatGPT|Codex)\.app/Contents/MacOS/(ChatGPT|Codex)( |$)' >/dev/null 2>&1; then
  CODEX_RUNNING="true"
fi

if [ -f "$STATE_PATH" ]; then
  saved_port="$(read_json_field "$STATE_PATH" port)"
  [ -n "${saved_port:-}" ] && PORT="$saved_port"
  SESSION="$(read_json_field "$STATE_PATH" session)"
  codex_pid="$(read_json_field "$STATE_PATH" codexPid)"
  if [ -n "${codex_pid:-}" ] && [ "$codex_pid" != "0" ] && /bin/kill -0 "$codex_pid" 2>/dev/null; then
    CODEX_RUNNING="true"
  fi
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

if [ -f "$AUTOLOAD_STATE_PATH" ]; then
  AUTOLOAD_ENABLED="$(read_json_field "$AUTOLOAD_STATE_PATH" enabled)"
  AUTOLOAD_PAUSED="$(read_json_field "$AUTOLOAD_STATE_PATH" paused)"
  [ "$AUTOLOAD_ENABLED" = "True" ] && AUTOLOAD_ENABLED="true"
  [ "$AUTOLOAD_PAUSED" = "True" ] && AUTOLOAD_PAUSED="true"
  [ "$AUTOLOAD_ENABLED" = "False" ] && AUTOLOAD_ENABLED="false"
  [ "$AUTOLOAD_PAUSED" = "False" ] && AUTOLOAD_PAUSED="false"
fi
if /bin/launchctl print "gui/$(/usr/bin/id -u)/$AUTOLOAD_LABEL" >/dev/null 2>&1; then
  AUTOLOAD_AGENT="true"
fi

if [ -f "$THEME_DIR/theme.json" ]; then
  THEME_NAME="$(read_json_field "$THEME_DIR/theme.json" name)"
  [ -n "$THEME_NAME" ] || THEME_NAME="$(read_json_field "$THEME_DIR/theme.json" id)"
fi

if [ "$DEEP" = "true" ] || [ "$JSON" = "true" ]; then
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
  /usr/bin/python3 - "$SESSION" "$PORT" "$INJECTOR_ALIVE" "$CDP_OK" "$CODEX_RUNNING" "$THEME_NAME" "$AUTOLOAD_ENABLED" "$AUTOLOAD_PAUSED" "$AUTOLOAD_AGENT" <<'PY'
import json, sys
print(json.dumps({
    "session": sys.argv[1],
    "port": int(sys.argv[2]) if str(sys.argv[2]).isdigit() else sys.argv[2],
    "injectorAlive": sys.argv[3] == "true",
    "cdpOk": sys.argv[4] == "true",
    "codexRunning": sys.argv[5] == "true",
    "themeName": sys.argv[6] or "",
    "autoLoadEnabled": sys.argv[7] == "true",
    "autoLoadPaused": sys.argv[8] == "true",
    "autoLoadAgent": sys.argv[9] == "true",
}))
PY
  exit 0
fi

printf 'session=%s\n' "$SESSION"
printf 'port=%s\n' "$PORT"
printf 'injector=%s\n' "$INJECTOR_ALIVE"
printf 'cdp=%s\n' "$CDP_OK"
printf 'codex=%s\n' "$CODEX_RUNNING"
printf 'theme=%s\n' "${THEME_NAME:-}"
printf 'autoLoad=%s\n' "$AUTOLOAD_ENABLED"
printf 'autoLoadPaused=%s\n' "$AUTOLOAD_PAUSED"
printf 'autoLoadAgent=%s\n' "$AUTOLOAD_AGENT"
