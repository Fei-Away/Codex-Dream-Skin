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
OPERATION_STATE_PATH="${STATE_ROOT}/operation-state.plist"
THEME_DIR="${STATE_ROOT}/theme"

PORT="9341"
SESSION="off"
INJECTOR_ALIVE="false"
CDP_OK="false"
THEME_NAME=""
APPLIED_THEME_NAME=""
CODEX_RUNNING="false"
OPERATION_STATUS=""
OPERATION_MESSAGE=""

read_json_text_field() {
  # Parse machine-written JSON (one key per line) without python3, which macOS
  # 12.3+ no longer preinstalls. Handles "key": "string" and "key": number.
  local text="$1"
  local key="$2"
  [ -n "$text" ] || return 0
  LC_ALL=C /usr/bin/printf '%s\n' "$text" |
  /usr/bin/sed -n \
    -e 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    -e 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' \
    2>/dev/null | /usr/bin/head -n1
}

read_plist_snapshot_field() {
  local snapshot="$1"
  local key="$2"
  [ -n "$snapshot" ] || return 0
  LC_ALL=C /usr/bin/printf '%s' "$snapshot" \
    | /usr/bin/plutil -extract "$key" raw -o - - 2>/dev/null
}

# Keep this check deliberately shell/ps-only: SwiftBar invokes status every
# few seconds and must not perform codesign, CDP, or Node startup.  A live PID
# alone is not enough because a stale state file can outlive the watcher and
# its PID may later be reused by an unrelated process.
injector_identity_matches() {
  local pid="$1"
  local expected_start="$2"
  local expected_node="$3"
  local expected_injector="$4"
  local expected_port="$5"
  local command_line command_lower node_lower injector_lower actual_start

  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  [ "$pid" != "0" ] || return 1
  [ -n "$expected_start" ] && [ -n "$expected_node" ] && [ -n "$expected_injector" ] || return 1
  case "$expected_port" in ''|*[!0-9]*) return 1 ;; esac
  /bin/kill -0 "$pid" 2>/dev/null || return 1
  command_line="$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)"
  [ -n "$command_line" ] || return 1
  command_lower="$(printf '%s' "$command_line" | /usr/bin/tr '[:upper:]' '[:lower:]')"
  node_lower="$(printf '%s' "$expected_node" | /usr/bin/tr '[:upper:]' '[:lower:]')"
  injector_lower="$(printf '%s' "$expected_injector" | /usr/bin/tr '[:upper:]' '[:lower:]')"
  case "$command_lower" in "$node_lower "*) ;; *) return 1 ;; esac
  case "$command_lower" in *"$injector_lower"*--watch*) ;; *) return 1 ;; esac
  # The watcher launch shape puts --theme-dir immediately after the port.
  # Requiring that following token prevents 93410 from matching saved port
  # 9341 via a loose prefix pattern.
  case "$command_lower" in *"--port $expected_port --theme-dir "*) ;; *) return 1 ;; esac
  actual_start="$(/bin/ps -p "$pid" -o lstart= 2>/dev/null | /usr/bin/awk '{$1=$1; print}')"
  [ -n "$actual_start" ] && [ "$actual_start" = "$expected_start" ]
}

# Codex process: cheap name match only.  26.707 renamed Codex.app to
# ChatGPT.app, while older installs still expose the former process name.
if /usr/bin/pgrep -x ChatGPT >/dev/null 2>&1 || /usr/bin/pgrep -x Codex >/dev/null 2>&1; then
  CODEX_RUNNING="true"
fi

if [ -f "$STATE_PATH" ]; then
  STATE_SNAPSHOT="$(/bin/cat "$STATE_PATH" 2>/dev/null)"
  saved_port="$(read_json_text_field "$STATE_SNAPSHOT" port)"
  [ -n "${saved_port:-}" ] && PORT="$saved_port"
  SESSION="$(read_json_text_field "$STATE_SNAPSHOT" session)"
  pid="$(read_json_text_field "$STATE_SNAPSHOT" injectorPid)"
  saved_start="$(read_json_text_field "$STATE_SNAPSHOT" injectorStartedAt)"
  saved_node="$(read_json_text_field "$STATE_SNAPSHOT" nodePath)"
  saved_injector="$(read_json_text_field "$STATE_SNAPSHOT" injectorPath)"
  APPLIED_THEME_NAME="$(read_json_text_field "$STATE_SNAPSHOT" appliedThemeName)"
  if injector_identity_matches "${pid:-}" "$saved_start" "$saved_node" "$saved_injector" "$PORT"; then
    INJECTOR_ALIVE="true"
    case "${SESSION:-}" in
      applying) SESSION="applying" ;;
      active|'') SESSION="active" ;;
      paused) SESSION="paused" ;;
      stale) SESSION="stale" ;;
      *) SESSION="unknown" ;;
    esac
  elif [ "${SESSION:-}" = "paused" ]; then
    SESSION="paused"
  else
    case "${SESSION:-}" in
      active|stale) SESSION="stale" ;;
      applying) SESSION="applying" ;;
      off) SESSION="off" ;;
      '') [ -n "${pid:-}" ] && [ "$pid" != "0" ] && SESSION="stale" || SESSION="off" ;;
      *) SESSION="unknown" ;;
    esac
  fi
fi

if [ -f "$THEME_DIR/theme.json" ]; then
  THEME_SNAPSHOT="$(/bin/cat "$THEME_DIR/theme.json" 2>/dev/null)"
  THEME_NAME="$(read_json_text_field "$THEME_SNAPSHOT" name)"
  [ -n "$THEME_NAME" ] || THEME_NAME="$(read_json_text_field "$THEME_SNAPSHOT" id)"
fi
[ -n "$APPLIED_THEME_NAME" ] || { [ "$SESSION" = "active" ] && APPLIED_THEME_NAME="$THEME_NAME"; }

if [ -f "$OPERATION_STATE_PATH" ]; then
  OPERATION_SNAPSHOT="$(/bin/cat "$OPERATION_STATE_PATH" 2>/dev/null)"
  operation_status="$(read_plist_snapshot_field "$OPERATION_SNAPSHOT" status)"
  operation_message="$(read_plist_snapshot_field "$OPERATION_SNAPSHOT" message)"
  operation_updated_at="$(read_plist_snapshot_field "$OPERATION_SNAPSHOT" updatedAt)"
  now="$(/bin/date +%s)"
  case "$operation_updated_at" in ''|*[!0-9]*) operation_updated_at="0" ;; esac
  age=$((now - operation_updated_at))
  ttl=0
  case "$operation_status" in
    applying) ttl=180 ;;
    pausing) ttl=90 ;;
    failed) ttl=120 ;;
    cancelled) ttl=20 ;;
    success|paused) ttl=12 ;;
  esac
  if [ "$age" -ge 0 ] && [ "$ttl" -gt 0 ] && [ "$age" -le "$ttl" ]; then
    OPERATION_STATUS="$operation_status"
    OPERATION_MESSAGE="$operation_message"
  elif { [ "$operation_status" = "applying" ] || [ "$operation_status" = "pausing" ]; } \
    && [ "$age" -ge 0 ] && [ "$age" -le $((ttl + 120)) ]; then
    OPERATION_STATUS="failed"
    OPERATION_MESSAGE="操作超时，请重试"
  fi
fi

if [ "$SESSION" = "applying" ] && [ "$OPERATION_STATUS" != "applying" ]; then
  if [ "$INJECTOR_ALIVE" = "true" ]; then SESSION="stale"; else SESSION="unknown"; fi
fi

if [ "$DEEP" = "true" ]; then
  if /usr/bin/curl --noproxy '*' --silent --fail --max-time 1 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    CDP_OK="true"
  fi
fi

label="Skin"
case "$SESSION" in
  active) label="Skin ON" ;;
  applying) label="Skin 应用中" ;;
  paused|off) label="Skin OFF" ;;
  stale|unknown) label="Skin 异常" ;;
  *) label="Skin 异常" ;;
esac
case "$OPERATION_STATUS" in
  applying) label="Skin 应用中" ;;
  pausing) label="Skin 暂停中" ;;
  failed)
    case "$SESSION" in
      active) label="Skin ON · 操作失败" ;;
      paused|off) label="Skin OFF · 操作失败" ;;
      *) label="Skin 异常 · 操作失败" ;;
    esac
    ;;
  cancelled) label="$label · 已取消" ;;
esac

if [ "$SHORT" = "true" ]; then
  printf '%s\n' "$label"
  exit 0
fi

if [ "$JSON" = "true" ]; then
  # Emit JSON without python3; escape strings for a valid JSON string context.
  json_escape() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; printf '%s' "$s"; }
  bool() { [ "$1" = "true" ] && printf 'true' || printf 'false'; }
  case "$PORT" in ''|*[!0-9]*) port_json="\"$(json_escape "$PORT")\"" ;; *) port_json="$PORT" ;; esac
  printf '{"session":"%s","operation":"%s","operationMessage":"%s","port":%s,"injectorAlive":%s,"cdpOk":%s,"codexRunning":%s,"themeName":"%s","appliedThemeName":"%s"}\n' \
    "$(json_escape "$SESSION")" "$(json_escape "$OPERATION_STATUS")" "$(json_escape "$OPERATION_MESSAGE")" \
    "$port_json" "$(bool "$INJECTOR_ALIVE")" "$(bool "$CDP_OK")" "$(bool "$CODEX_RUNNING")" \
    "$(json_escape "$THEME_NAME")" "$(json_escape "$APPLIED_THEME_NAME")"
  exit 0
fi

printf 'session=%s\n' "$SESSION"
printf 'label=%s\n' "$label"
printf 'operation=%s\n' "$OPERATION_STATUS"
printf 'operation_message=%s\n' "$OPERATION_MESSAGE"
printf 'port=%s\n' "$PORT"
printf 'injector=%s\n' "$INJECTOR_ALIVE"
printf 'cdp=%s\n' "$CDP_OK"
printf 'codex=%s\n' "$CODEX_RUNNING"
printf 'theme=%s\n' "${THEME_NAME:-}"
printf 'applied_theme=%s\n' "${APPLIED_THEME_NAME:-}"
