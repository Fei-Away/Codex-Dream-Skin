#!/bin/bash

set -euo pipefail

if [ -z "${HOME:-}" ]; then
  CURRENT_USER="$(id -un)"
  HOME="$(getent passwd "$CURRENT_USER" | cut -d: -f6)"
  [ -n "$HOME" ] || { printf 'Codex Dream Skin: could not resolve the current home directory.\n' >&2; exit 1; }
  export HOME
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
. "$SCRIPT_DIR/localization-linux.sh"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
INJECTOR="$SCRIPT_DIR/injector.mjs"
INSTALL_ROOT="$HOME/.codex/codex-dream-skin-studio"
STATE_ROOT="$HOME/.local/share/codex-dream-skin"
STATE_PATH="$STATE_ROOT/state.json"
OPERATION_STATE_PATH="$STATE_ROOT/operation-state.json"
THEME_BACKUP_PATH="$STATE_ROOT/theme-backup.json"
THEME_DIR="$STATE_ROOT/theme"
CONFIG_PATH="$HOME/.codex/config.toml"
INJECTOR_LOG="$STATE_ROOT/injector.log"
INJECTOR_ERROR_LOG="$STATE_ROOT/injector-error.log"
APP_LOG="$STATE_ROOT/codex-launch.log"
APP_ERROR_LOG="$STATE_ROOT/codex-launch-error.log"
START_ERROR_LOG="$STATE_ROOT/start-error.log"
SKIN_VERSION="1.5.19"
DREAM_SKIN_VALIDATED_RUNTIME_NODE=""
DREAM_SKIN_VALIDATED_RUNTIME_PATH=""

fail() {
  local message="$*"
  if [ -n "${START_ERROR_LOG:-}" ] && [ -n "${STATE_ROOT:-}" ]; then
    mkdir -p "$STATE_ROOT" 2>/dev/null || true
    printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$message" \
      >> "$START_ERROR_LOG" 2>/dev/null || true
  fi
  printf 'ChatGPT Dream Skin: %s\n' "$message" >&2
  exit 1
}

notify_user() {
  local message="$*"
  notify-send -t 3000 "ChatGPT Dream Skin" "$message" 2>/dev/null || true
}

ensure_state_root() {
  mkdir -p "$STATE_ROOT"
  chmod 700 "$STATE_ROOT"
}

new_operation_token() {
  local timestamp_ms=""
  timestamp_ms="$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')"
  printf '%s:%s:%s\n' "$$" "$timestamp_ms" "$RANDOM"
}

operation_token_is_valid() {
  printf '%s' "$1" \
    | grep -Eq '^[0-9]{1,12}:[0-9]{13}:[0-9]{1,8}$'
}

write_operation_state() {
  local status="$1"
  local message="${2:-}"
  local operation_token="${3:-}"
  local terminal_policy="${4:-match}"
  local token_guarded="false"
  local current_token=""
  local current_status=""
  local current_updated_at=""
  local current_age=0
  local current_ttl=0
  local temporary=""
  local updated_at=""
  local lock_path=""
  local lock_mtime=""
  local now=""
  local attempts=0
  local result=0
  case "$status" in
    applying|pausing|success|paused|cancelled|failed) ;;
    *) return 1 ;;
  esac
  case "$terminal_policy" in match|idle) ;; *) return 1 ;; esac
  case "$message" in *$'\n'*|*$'\r'*) return 1 ;; esac
  [ "${#message}" -le 240 ] || return 1
  if [ -n "$operation_token" ]; then
    token_guarded="true"
  else
    operation_token="$(new_operation_token)"
  fi
  operation_token_is_valid "$operation_token" || return 1
  ensure_state_root
  lock_path="$STATE_ROOT/.operation-state.lock"
  while ! mkdir "$lock_path" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 50 ]; then return 1; fi
    lock_mtime="$(stat -c '%Y' "$lock_path" 2>/dev/null || true)"
    now="$(date +%s)"
    case "$lock_mtime" in
      ''|*[!0-9]*) ;;
      *) [ $((now - lock_mtime)) -le 5 ] || rm -rf "$lock_path" ;;
    esac
    sleep 0.02
  done
  case "$status" in
    success|paused|cancelled|failed)
      if [ "$token_guarded" = "true" ] && [ -f "$OPERATION_STATE_PATH" ]; then
        current_token="$(python3 -c "import json,sys; d=json.load(open('$OPERATION_STATE_PATH')); print(d.get('operationToken',''))" 2>/dev/null || true)"
        if [ "$current_token" != "$operation_token" ]; then
          if [ "$terminal_policy" = "idle" ]; then
            current_status="$(python3 -c "import json,sys; d=json.load(open('$OPERATION_STATE_PATH')); print(d.get('status',''))" 2>/dev/null || true)"
            current_updated_at="$(python3 -c "import json,sys; d=json.load(open('$OPERATION_STATE_PATH')); print(d.get('updatedAt','0'))" 2>/dev/null || true)"
            case "$current_updated_at" in ''|*[!0-9]*) current_updated_at=0 ;; esac
            now="$(date +%s)"
            current_age=$((now - current_updated_at))
            case "$current_status" in applying) current_ttl=180 ;; pausing) current_ttl=90 ;; *) current_ttl=0 ;; esac
            if [ "$current_ttl" -gt 0 ] && [ "$current_age" -ge -5 ] \
              && [ "$current_age" -le "$current_ttl" ]; then
              result=2
            fi
          elif operation_token_is_valid "$current_token"; then
            result=2
          fi
        fi
      fi
      ;;
  esac
  if [ "$result" -eq 0 ]; then
    temporary="$OPERATION_STATE_PATH.$$.tmp"
    updated_at="$(date +%s)"
    rm -f "$temporary"
    python3 -c "
import json, sys
data = {
    'status': '$status',
    'message': '''$message''',
    'operationToken': '$operation_token',
    'updatedAt': $updated_at
}
with open('$temporary', 'w') as f:
    json.dump(data, f, ensure_ascii=False)
" || { rm -f "$temporary"; return 1; }
    chmod 600 "$temporary"
    mv -f "$temporary" "$OPERATION_STATE_PATH" || result=1
  fi
  rm -rf "$lock_path"
  return "$result"
}

clear_operation_state() {
  rm -f "$OPERATION_STATE_PATH"
}

begin_client_operation() {
  local port="$1"
  local kind="$2"
  local timeout_ms="${3:-3000}"
  local token="${4:-}"
  case "$kind" in apply|pause|switch) ;; *) return 1 ;; esac
  [ -n "$token" ] || token="$(new_operation_token)"
  operation_token_is_valid "$token" || return 1
  token="$("$NODE" "$INJECTOR" --begin-operation --operation-kind "$kind" \
    --operation-token "$token" --port "$port" --timeout-ms "$timeout_ms" \
    2>>"$INJECTOR_ERROR_LOG")" || return 1
  operation_token_is_valid "$token" || return 1
  printf '%s\n' "$token"
}

finish_client_operation() {
  local port="$1"
  local state="$2"
  local message="$3"
  local token="$4"
  local timeout_ms="${5:-1500}"
  case "$state" in success|error|cancelled) ;; *) return 1 ;; esac
  operation_token_is_valid "$token" || return 1
  [ -n "${NODE:-}" ] && [ -x "$NODE" ] || return 1
  "$NODE" "$INJECTOR" --finish-operation --operation-ui-state "$state" \
    --operation-message "$message" --operation-token "$token" \
    --port "$port" --timeout-ms "$timeout_ms" 2>>"$INJECTOR_ERROR_LOG"
}

seed_bundled_presets() {
  local presets_root="$PROJECT_ROOT/presets"
  [ -d "$presets_root" ] || return 0
  local themes_root="$STATE_ROOT/themes"
  mkdir -p "$themes_root"
  local src id dest entry
  for src in "$presets_root"/preset-*/; do
    [ -d "$src" ] || continue
    [ -f "${src}theme.json" ] || continue
    id="$(basename "$src")"
    dest="$themes_root/$id"
    rm -rf "$dest"
    mkdir -p "$dest"
    chmod 700 "$dest"
    for entry in "$src"*; do
      [ -f "$entry" ] || continue
      cp "$entry" "$dest/"
    done
    chmod 600 "$dest"/* 2>/dev/null || true
  done
}

discover_codex_app() {
  local candidate=""
  local version_path=""
  local configured="${CODEX_APP_PATH:-}"

  CODEX_EXE=""
  for candidate in \
    "$configured" \
    "/usr/lib/chatgpt/ChatGPT" \
    "/opt/chatgpt/ChatGPT" \
    "$HOME/.local/share/applications/chatgpt" \
    "/usr/bin/chatgpt"; do
    [ -n "$candidate" ] || continue
    [ -x "$candidate" ] || continue
    # Verify it is the official OpenAI ChatGPT/Linux executable
    local file_type
    file_type="$(file -b "$candidate" 2>/dev/null || true)"
    case "$file_type" in
      *"ELF"*|*"executable"*) ;;
      *) continue ;;
    esac
    CODEX_EXE="$candidate"
    break
  done

  # Resolve version from known locations
  CODEX_VERSION=""
  for version_path in \
    "/usr/lib/chatgpt/version" \
    "/usr/lib/chatgpt/resources/version" \
    "/usr/lib/chatgpt/resources/linux-package-metadata.json"; do
    if [ -f "$version_path" ]; then
      case "$version_path" in
        *.json)
          CODEX_VERSION="$(python3 -c "import json; d=json.load(open('$version_path')); print(d.get('version',''))" 2>/dev/null || true)"
          ;;
        *)
          CODEX_VERSION="$(tr -d '[:space:]' < "$version_path" 2>/dev/null || true)"
          ;;
      esac
      [ -n "$CODEX_VERSION" ] && break
    fi
  done

  [ -n "${CODEX_EXE:-}" ] || fail "Could not find the official ChatGPT/Linux executable."
  [ -n "${CODEX_VERSION:-}" ] || CODEX_VERSION="unknown"
  export CODEX_EXE CODEX_VERSION
}

require_linux_runtime() {
  [ "$(uname -s)" = "Linux" ] || fail "This launcher requires Linux."
  [ -n "${CODEX_EXE:-}" ] \
    || discover_codex_app

  RUNTIME_NODE="/usr/lib/chatgpt/resources/cua_node/bin/node"
  [ -x "$RUNTIME_NODE" ] || fail "The Node.js runtime bundled with ChatGPT was not found: $RUNTIME_NODE"

  NODE_VERSION="$($RUNTIME_NODE --version)"
  local node_major="${NODE_VERSION#v}"
  node_major="${node_major%%.*}"
  case "$node_major" in ''|*[!0-9]*) fail "Could not parse bundled Node.js version: $NODE_VERSION" ;; esac
  [ "$node_major" -ge 20 ] || fail "ChatGPT bundled Node.js $NODE_VERSION is too old; version 20 or newer is required."

  NODE="$RUNTIME_NODE"
  DREAM_SKIN_VALIDATED_RUNTIME_NODE="$RUNTIME_NODE"
  DREAM_SKIN_VALIDATED_RUNTIME_PATH="$RUNTIME_NODE"
  export NODE RUNTIME_NODE NODE_VERSION
}

codex_main_pids() {
  local exe_name
  exe_name="$(basename "$CODEX_EXE")"
  pgrep -af ".*$exe_name.*" 2>/dev/null | awk '{print $1}' || true
}

codex_is_running() {
  [ -n "$(codex_main_pids 2>/dev/null)" ]
}

detect_running_codex_port() {
  # Detect the CDP debugging port from an already-running Codex process
  local pid_list
  pid_list="$(codex_main_pids 2>/dev/null)"
  [ -n "$pid_list" ] || return 0
  for pid in $pid_list; do
    local cmdline
    cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    if [ -n "$cmdline" ]; then
      local port
      port="$(printf '%s' "$cmdline" | grep -oP 'remote-debugging-port=\K[0-9]+' | head -1 || true)"
      if [ -n "$port" ] && cdp_http_ready "$port" 2>/dev/null; then
        printf '%s' "$port"
        return 0
      fi
    fi
  done
  return 1
}

quit_codex_for_restart() {
  codex_is_running || return 0

  # Try graceful shutdown via D-Bus or signal
  # First try killing the process group gently
  local pid
  while IFS= read -r pid; do
    [ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null || true
  done < <(codex_main_pids)

  local deadline=$((SECONDS + 15))
  while codex_is_running && [ "$SECONDS" -lt "$deadline" ]; do sleep 0.25; done
  if codex_is_running; then
    printf 'ChatGPT is still running; restart was stopped.\n' >&2
    return 124
  fi
  return 0
}

stop_codex() {
  local allow_force="${1:-false}"
  local deadline
  local pid

  codex_is_running || return 0
  local pid_list
  pid_list="$(codex_main_pids)"
  [ -n "$pid_list" ] || return 0

  while IFS= read -r pid; do
    [ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null || true
  done <<< "$pid_list"
  deadline=$((SECONDS + 15))
  while codex_is_running && [ "$SECONDS" -lt "$deadline" ]; do sleep 0.25; done
  codex_is_running || return 0

  [ "$allow_force" = "true" ] || fail "ChatGPT did not close within 15 seconds; explicit restart authorization is required for a forced stop."
  while IFS= read -r pid; do
    [ -n "$pid" ] && kill -KILL "$pid" 2>/dev/null || true
  done <<< "$pid_list"
  sleep 0.5
  codex_is_running && fail "ChatGPT could not be stopped safely."
  return 0
}

listener_pids() {
  ss -tlnp 2>/dev/null | grep ":$1 " | grep -oP 'pid=\K[0-9]+' | sort -u || true
}

port_is_available() {
  [ -z "$(listener_pids "$1")" ]
}

process_started_at() {
  local pid="$1"
  if [ -f "/proc/$pid/stat" ]; then
    # Get process start time from /proc
    local btime
    btime="$(awk '/btime/ {print $2}' /proc/stat)"
    local starttime
    starttime="$(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null || echo "0")"
    local clock_ticks
    clock_ticks="$(getconf CLK_TCK 2>/dev/null || echo 100)"
    local start_seconds
    start_seconds="$(python3 -c "print(int($starttime) / $clock_ticks)" 2>/dev/null || echo 0)"
    local now_epoch
    now_epoch="$(python3 -c "import time; print(int(time.time()))" 2>/dev/null || echo "0")"
    python3 -c "
import datetime
btime = $btime
start_sec = $start_seconds
epoch_now = $now_epoch
start_epoch = btime + start_sec
print(datetime.datetime.utcfromtimestamp(start_epoch).strftime('%Y-%m-%d %H:%M:%S'))
" 2>/dev/null || date
  else
    date
  fi
}

recorded_injector_process_matches() {
  local pid="$1"
  local expected_start="${2:-}"
  local expected_node="${3:-}"
  local expected_injector="${4:-}"
  local expected_port="${5:-}"

  [ -n "$expected_start" ] && [ -n "$expected_node" ] && [ -n "$expected_injector" ] || return 1
  case "$expected_port" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ -d "/proc/$pid" ] || return 1
  local command_line
  command_line="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  [ -n "$command_line" ] || return 1
  local command_lower injector_lower node_lower
  command_lower="$(printf '%s' "$command_line" | tr '[:upper:]' '[:lower:]')"
  injector_lower="$(printf '%s' "$expected_injector" | tr '[:upper:]' '[:lower:]')"
  node_lower="$(printf '%s' "$expected_node" | tr '[:upper:]' '[:lower:]')"
  case "$command_lower" in "$node_lower "*) ;; *) return 1 ;; esac
  case "$command_lower" in
    *"$injector_lower --watch --port $expected_port --theme-dir "*) ;;
    *) return 1 ;;
  esac
  return 0
}

state_field() {
  local key="$1"
  [ -f "$STATE_PATH" ] || return 1
  python3 -c "
import json, sys
try:
    d = json.load(open('$STATE_PATH'))
    v = d.get('$key', '')
    if v is not None:
        print(str(v))
except: pass
" 2>/dev/null
}

write_state() {
  local port="$1"
  local injector_pid="$2"
  local injector_started_at="$3"
  local codex_pid="$4"
  local session="${5:-applying}"
  local node_ver="${NODE_VERSION:-unknown}"
  local arch
  arch="$(uname -m)"
  "$NODE" -e '
    const fs = require("node:fs");
    const [file, version, port, pid, startedAt, injector, node, nodeVersion, codexExe, codexVersion, projectRoot, themeDir, codexPid, arch, session] = process.argv.slice(1);
    const state = {
      schemaVersion: 4,
      platform: `linux-${arch}`,
      skinVersion: version,
      injectorProtocol: 3,
      port: Number(port),
      injectorPid: Number(pid),
      injectorStartedAt: startedAt,
      injectorPath: injector,
      nodePath: node,
      nodeVersion,
      codexExe,
      codexVersion,
      codexPid: Number(codexPid || 0),
      projectRoot,
      themeDir,
      session,
      injectorMode: "full",
      createdAt: new Date().toISOString()
    };
    if (session === "active") {
      try {
        const theme = JSON.parse(fs.readFileSync(`${themeDir}/theme.json`, "utf8"));
        state.appliedThemeId = String(theme.id || "");
        state.appliedThemeName = String(theme.name || theme.id || "");
        state.verifiedAt = new Date().toISOString();
      } catch {}
    }
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  ' "$STATE_PATH" "$SKIN_VERSION" "$port" "$injector_pid" "$injector_started_at" "$INJECTOR" "$NODE" "$node_ver" "$CODEX_EXE" "$CODEX_VERSION" "$PROJECT_ROOT" "$THEME_DIR" "$codex_pid" "$arch" "$session"
}

mark_state_active() {
  [ -f "$STATE_PATH" ] || return 1
  "$NODE" -e '
    const fs = require("node:fs");
    const [file, themeDir] = process.argv.slice(1);
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    const theme = JSON.parse(fs.readFileSync(`${themeDir}/theme.json`, "utf8"));
    state.session = "active";
    state.appliedThemeId = String(theme.id || "");
    state.appliedThemeName = String(theme.name || theme.id || "");
    state.injectorMode = "full";
    delete state.pausedAt;
    state.verifiedAt = new Date().toISOString();
    state.updatedAt = state.verifiedAt;
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  ' "$STATE_PATH" "$THEME_DIR"
}

mark_state_stale() {
  [ -f "$STATE_PATH" ] || return 0
  "$NODE" -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    state.session = "stale";
    state.updatedAt = new Date().toISOString();
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  ' "$STATE_PATH"
}

stop_recorded_injector() {
  [ -f "$STATE_PATH" ] || return 0
  local pid
  local saved_port
  local saved_start
  local saved_node
  local saved_injector
  if ! pid="$(state_field injectorPid 2>/dev/null)" || [ -z "${pid:-}" ]; then
    printf 'Dream Skin state is damaged or missing its injector PID; state was preserved.\n' >&2
    return 1
  fi
  if [ "$pid" = "0" ]; then
    return 0
  fi
  case "$pid" in
    *[!0-9]*|??????????*)
      printf 'Recorded Dream Skin injector PID is invalid; state was preserved.\n' >&2
      return 1 ;;
  esac
  while [ "${pid#0}" != "$pid" ]; do pid="${pid#0}"; done
  if [ -z "$pid" ]; then return 0; fi

  saved_port="$(state_field port 2>/dev/null || true)"
  saved_start="$(state_field injectorStartedAt 2>/dev/null || true)"
  saved_node="$(state_field nodePath 2>/dev/null || true)"
  saved_injector="$(state_field injectorPath 2>/dev/null || true)"
  case "$saved_port" in
    ''|*[!0-9]*)
      printf 'Recorded Dream Skin injector port is missing or invalid; state was preserved.\n' >&2
      return 1 ;;
  esac
  [ "$saved_port" -ge 1024 ] && [ "$saved_port" -le 65535 ] || {
    printf 'Recorded Dream Skin injector port is out of range; state was preserved.\n' >&2
    return 1
  }
  if [ -z "$saved_start" ] || [ -z "$saved_node" ] || [ -z "$saved_injector" ]; then
    printf 'Recorded Dream Skin injector identity is incomplete; state was preserved.\n' >&2
    return 1
  fi
  if [ ! -d "/proc/$pid" ]; then return 0; fi
  if ! recorded_injector_process_matches "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port"; then
    if [ ! -d "/proc/$pid" ] || [ -z "$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)" ]; then
      return 0
    fi
    printf 'Recorded injector PID %s is live but its identity does not match; refusing to signal it.\n' "$pid" >&2
    return 1
  fi
  kill -TERM "$pid" 2>/dev/null || true
  local deadline=$((SECONDS + 6))
  while recorded_injector_process_matches "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port" \
    && [ "$SECONDS" -lt "$deadline" ]; do sleep 0.2; done
  if recorded_injector_process_matches "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port"; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
  deadline=$((SECONDS + 2))
  while recorded_injector_process_matches "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port" \
    && [ "$SECONDS" -lt "$deadline" ]; do sleep 0.1; done
  if recorded_injector_process_matches "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port"; then
    printf 'Could not stop the recorded Dream Skin injector (PID %s).\n' "$pid" >&2
    return 1
  fi
  return 0
}

launch_injector_daemon() {
  local port="$1"
  local pid=""
  local deadline=$((SECONDS + 10))
  : > "$INJECTOR_LOG"
  : > "$INJECTOR_ERROR_LOG"

  nohup "$NODE" "$INJECTOR" --watch --port "$port" --theme-dir "$THEME_DIR" \
    --operation-state "$OPERATION_STATE_PATH" --operation-ack "$STATE_ROOT/operation-control-ack.json" \
    >>"$INJECTOR_LOG" 2>>"$INJECTOR_ERROR_LOG" &
  pid="$!"
  sleep 0.15
  if [ -n "$pid" ] && [ -d "/proc/$pid" ]; then
    printf '%s\n' "$pid"
    return 0
  fi
  fail "The injector did not start. See $INJECTOR_ERROR_LOG and $INJECTOR_LOG"
}

ensure_node_runtime() {
  if [ "$DREAM_SKIN_VALIDATED_RUNTIME_NODE" = "$DREAM_SKIN_VALIDATED_RUNTIME_PATH" ] \
    && [ -n "${NODE:-}" ] && [ "${NODE:-}" = "$DREAM_SKIN_VALIDATED_RUNTIME_NODE" ]; then
    return 0
  fi
  discover_codex_app
  require_linux_runtime
}

cdp_http_ready() {
  local port="$1"
  curl --noproxy '*' --silent --fail --max-time 1 \
    "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1
}

verified_cdp_endpoint() {
  local port="$1"
  # Check that the listener belongs to codex process
  local listener_pid
  listener_pid="$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
  [ -n "$listener_pid" ] || return 1
  # Verify the PID is a child/descendant of codex or matches the codex exe
  local exe_path
  exe_path="$(tr '\0' ' ' < "/proc/$listener_pid/cmdline" 2>/dev/null || true)"
  case "$exe_path" in
    *"$CODEX_EXE"*) ;;
    *) return 1 ;;
  esac
  cdp_http_ready "$port"
}

select_available_port() {
  local preferred="$1"
  local candidate="$preferred"
  local last=$((preferred + 100))
  [ "$last" -le 65535 ] || last=65535
  while [ "$candidate" -le "$last" ]; do
    if port_is_available "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
    candidate=$((candidate + 1))
  done
  fail "No free loopback port was found between $preferred and $last."
}

wait_for_cdp() {
  local port="$1"
  local deadline=$((SECONDS + 45))
  local last_note=0
  while [ "$SECONDS" -lt "$deadline" ]; do
    verified_cdp_endpoint "$port" && return 0
    if [ $((SECONDS - last_note)) -ge 8 ]; then
      last_note=$SECONDS
      printf 'Waiting for ChatGPT debug port %s… (%ss)\n' "$port" "$SECONDS" >&2
    fi
    sleep 0.35
  done
  return 1
}

active_theme_appearance() {
  "$NODE" -e '
const fs = require("node:fs");
let appearance = "auto";
try { appearance = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).appearance; } catch {}
process.stdout.write(appearance === "light" || appearance === "dark" ? appearance : "auto");
' "$THEME_DIR/theme.json"
}

sync_appearance_pin() {
  "$NODE" "$SCRIPT_DIR/theme-config.mjs" install "$CONFIG_PATH" "$THEME_BACKUP_PATH" "$(active_theme_appearance)"
}

launch_codex_with_cdp() {
  local port="$1"
  : > "$APP_LOG"
  : > "$APP_ERROR_LOG"
  # Start Codex with CDP flags via nohup (nohup preserves args that exec might drop)
  nohup "$CODEX_EXE" \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="$port" \
    >>"$APP_LOG" 2>>"$APP_ERROR_LOG" &
  local codex_pid="$!"
  sleep 0.5
  # Verify the process started
  [ -d "/proc/$codex_pid" ] || fail "Failed to start ChatGPT with CDP on port $port."
  export DREAM_SKIN_CODEX_LAUNCH_PID="$codex_pid"
}

launch_codex_normally() {
  # Launch Codex without CDP flags (user-controlled launch)
  xdg-open "codex://" 2>/dev/null \
    || "$CODEX_EXE" &>/dev/null &
  return 0
}
