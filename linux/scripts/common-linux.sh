#!/bin/bash

set -euo pipefail

if [ -z "${HOME:-}" ]; then
  CURRENT_USER="$(/usr/bin/id -un 2>/dev/null || id -un)"
  HOME="$(/usr/bin/getent passwd "$CURRENT_USER" 2>/dev/null | /usr/bin/cut -d: -f6)"
  [ -n "$HOME" ] || { printf 'Codex Dream Skin: could not resolve the current Linux home directory.\n' >&2; exit 1; }
  export HOME
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
. "$SCRIPT_DIR/localization-linux.sh"
. "$SCRIPT_DIR/linux-launch.sh"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
INJECTOR="$SCRIPT_DIR/injector.mjs"
INSTALL_ROOT="$HOME/.local/share/codex-dream-skin"
STATE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/codex-dream-skin"
STATE_PATH="$STATE_ROOT/state.json"
OPERATION_STATE_PATH="$STATE_ROOT/operation-state.json"
OPERATION_ACK_PATH="$STATE_ROOT/operation-control-ack.json"
THEME_BACKUP_PATH="$STATE_ROOT/theme-backup.json"
THEME_DIR="$STATE_ROOT/theme"
CONFIG_PATH="$HOME/.codex/config.toml"
ELECTRON_FLAGS_PATH="$STATE_ROOT/electron-flags.conf"
INJECTOR_LOG="$STATE_ROOT/injector.log"
INJECTOR_ERROR_LOG="$STATE_ROOT/injector-error.log"
APP_LOG="$STATE_ROOT/codex-launch.log"
APP_ERROR_LOG="$STATE_ROOT/codex-launch-error.log"
START_ERROR_LOG="$STATE_ROOT/start-error.log"
SKIN_VERSION="1.5.14"

fail() {
  local message="$*"
  if [ -n "${START_ERROR_LOG:-}" ] && [ -n "${STATE_ROOT:-}" ]; then
    /bin/mkdir -p "$STATE_ROOT" 2>/dev/null || true
    printf '%s %s\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" "$message" >> "$START_ERROR_LOG" 2>/dev/null || true
  fi
  printf 'ChatGPT Dream Skin: %s\n' "$message" >&2
  exit 1
}

notify_user() {
  local message="$*"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "Dream Skin" "$message" >/dev/null 2>&1 || true
  else
    printf 'Dream Skin: %s\n' "$message" >&2 || true
  fi
}

alert_user() {
  local message="$*"
  if command -v zenity >/dev/null 2>&1; then
    zenity --info --title="Dream Skin" --text="$message" >/dev/null 2>&1 || true
  else
    printf 'Dream Skin: %s\n' "$message" >&2 || true
  fi
}

ensure_state_root() {
  /bin/mkdir -p "$STATE_ROOT"
  /bin/chmod 700 "$STATE_ROOT"
}

new_operation_token() {
  local timestamp_ms=""
  if [ -x /usr/bin/perl ]; then
    timestamp_ms="$(LC_ALL=C /usr/bin/perl -MTime::HiRes=time -e 'printf "%.0f", time() * 1000')"
  else
    timestamp_ms="$(/bin/date +%s)000"
  fi
  /usr/bin/printf '%s:%s:%s\n' "$$" "$timestamp_ms" "${RANDOM:-0}"
}

operation_token_is_valid() {
  LC_ALL=C /usr/bin/printf '%s' "$1" \
    | LC_ALL=C /usr/bin/grep -Eq '^[0-9]{1,12}:[0-9]{13}:[0-9]{1,8}$'
}

operation_state_field() {
  local key="$1"
  "$NODE" -e '
    const fs = require("node:fs");
    let value = "";
    try {
      const parsed = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (parsed[process.argv[2]] !== undefined && parsed[process.argv[2]] !== null) {
        value = String(parsed[process.argv[2]]);
      }
    } catch {}
    process.stdout.write(value);
  ' "$OPERATION_STATE_PATH" "$key" 2>/dev/null || true
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
  [ -n "${NODE:-}" ] && [ -x "$NODE" ] || ensure_node_runtime
  ensure_state_root
  lock_path="$STATE_ROOT/.operation-state.lock"
  while ! /bin/mkdir "$lock_path" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 50 ]; then return 1; fi
    lock_mtime="$(/usr/bin/stat -c '%Y' "$lock_path" 2>/dev/null || true)"
    now="$(/bin/date +%s)"
    case "$lock_mtime" in
      ''|*[!0-9]*) ;;
      *) [ $((now - lock_mtime)) -le 5 ] || /bin/rm -rf "$lock_path" ;;
    esac
    /bin/sleep 0.02
  done
  case "$status" in
    success|paused|cancelled|failed)
      if [ "$token_guarded" = "true" ] && [ -f "$OPERATION_STATE_PATH" ]; then
        current_token="$(operation_state_field operationToken)"
        if [ "$current_token" != "$operation_token" ]; then
          if [ "$terminal_policy" = "idle" ]; then
            current_status="$(operation_state_field status)"
            current_updated_at="$(operation_state_field updatedAt)"
            case "$current_updated_at" in ''|*[!0-9]*) current_updated_at=0 ;; esac
            now="$(/bin/date +%s)"
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
    updated_at="$(/bin/date +%s)"
    "$NODE" -e '
      const fs = require("node:fs");
      const [file, status, message, token, updatedAt] = process.argv.slice(1);
      const temporary = `${file}.${process.pid}.tmp`;
      const payload = `${JSON.stringify({ status, message, operationToken: token, updatedAt: Number(updatedAt) }, null, 2)}\n`;
      fs.writeFileSync(temporary, payload, { encoding: "utf8", mode: 0o600 });
      fs.renameSync(temporary, file);
    ' "$OPERATION_STATE_PATH" "$status" "$message" "$operation_token" "$updated_at" || result=1
  fi
  /bin/rm -rf "$lock_path"
  return "$result"
}

clear_operation_state() {
  /bin/rm -f "$OPERATION_STATE_PATH"
}

# Presence check for a recorded string value in the machine-written
# theme-backup.json. theme-config.mjs stores the ORIGINAL config line as the
# value, so real entries contain escaped quotes (\" ) and are unreliable to
# extract with sed; the uninstall branch only needs to distinguish "a real
# value was recorded" (present) from "null or missing" (absent), which the
# macOS flow compared as the literal "null".
backup_value_present() {
  local key="$1"
  [ -f "$THEME_BACKUP_PATH" ] || return 1
  /usr/bin/grep -Eq '^[[:space:]]*"'"$key"'"[[:space:]]*:[[:space:]]*"' "$THEME_BACKUP_PATH"
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
  /usr/bin/printf '%s\n' "$token"
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

# Seed bundled preset packs into the user's themes/ library so a fresh install
# ships with ready-to-use skins. Idempotent (each preset is refreshed in place)
# and scoped to preset-* ids, so user-made custom-* packs are never touched.
seed_bundled_presets() {
  local presets_root="$PROJECT_ROOT/presets"
  [ -d "$presets_root" ] || return 0
  local themes_root="$STATE_ROOT/themes"
  /bin/mkdir -p "$themes_root"
  local retired
  for retired in \
    preset-midnight-aurora preset-sakura-dawn preset-amber-dusk \
    preset-forest-mist preset-cyber-neon preset-romantic-rose; do
    /bin/rm -rf "$themes_root/$retired"
  done
  local src id dest entry
  for src in "$presets_root"/preset-*/; do
    [ -d "$src" ] || continue
    [ -f "${src}theme.json" ] || continue
    id="$(/usr/bin/basename "$src")"
    dest="$themes_root/$id"
    /bin/rm -rf "$dest"
    /bin/mkdir -p "$dest"
    /bin/chmod 700 "$dest"
    for entry in "$src"*; do
      [ -f "$entry" ] || continue
      /bin/cp "$entry" "$dest/"
    done
    /bin/chmod 600 "$dest"/* 2>/dev/null || true
  done
}

# First-run lazy seed for package installs. The tar.gz installer seeds bundled
# presets at install time (install-dream-skin-linux.sh), but the deb postinst
# must not: it runs as root and would write into root's state tree. The start
# flow therefore calls this after ensure_state_root and before it needs a
# staged active theme. Idempotent and safe to call repeatedly: it seeds only
# when the theme library holds no preset pack with a theme.json, stages the
# default preset only when no active theme is staged, and never touches
# user-made custom-* packs.
ensure_first_run_theme() {
  ensure_state_root
  local themes_root="$STATE_ROOT/themes"
  local preset=""
  local seeded="false"
  for preset in "$themes_root"/preset-*/; do
    [ -d "$preset" ] || continue
    [ -f "${preset}theme.json" ] || continue
    seeded="true"
    break
  done
  [ "$seeded" = "true" ] || seed_bundled_presets
  if [ ! -f "$THEME_DIR/theme.json" ]; then
    "$SCRIPT_DIR/switch-theme-linux.sh" --id preset-gothic-void-crusade --no-apply >/dev/null
  fi
}

codex_main_pids() {
  local pid
  local exe
  local exe_canonical
  local expected_canonical
  local cmdline
  # ensure_node_runtime no longer triggers discovery (unlike macOS), so every
  # probe function must resolve the Codex executable itself first.
  [ -n "${CODEX_EXE:-}" ] || discover_codex_app
  expected_canonical="$(canonical_existing_path "$CODEX_EXE" 2>/dev/null || true)"
  while read -r pid; do
    [ -n "$pid" ] || continue
    exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
    if [ -n "$exe" ]; then
      exe_canonical="$(canonical_existing_path "$exe" 2>/dev/null || true)"
      [ -n "$exe_canonical" ] && [ "$exe_canonical" = "$expected_canonical" ] \
        && printf '%s\n' "$pid" && continue
    fi
    # AppImage: the process exe resolves inside the FUSE mount, so fall back
    # to matching the AppImage path in the command line. The stderr redirect
    # comes BEFORE the input redirect so a PID that dies between the ps scan
    # and this read (cmdline vanishes) fails silently instead of spamming.
    cmdline="$(/usr/bin/tr '\0' ' ' 2>/dev/null < "/proc/$pid/cmdline" || true)"
    case " $cmdline " in
      *" $CODEX_EXE "*) printf '%s\n' "$pid" ;;
    esac
  done < <(/bin/ps -eo pid= 2>/dev/null)
}

codex_is_running() {
  [ -n "$(codex_main_pids)" ]
}

# First Codex main PID without an early-exit pipeline: `head -n 1` closes the
# pipe after one line, which SIGPIPEs the producer under `set -o pipefail`
# (exit 141) whenever more than one process matches the identity check.
# Capture the full list, then slice the first line.
first_codex_pid() {
  local pids=""
  pids="$(codex_main_pids 2>/dev/null || true)"
  [ -n "$pids" ] || return 0
  printf '%s\n' "${pids%%$'\n'*}"
}

active_theme_appearance() {
  "$NODE" -e '
const fs = require("node:fs");
let appearance = "auto";
try { appearance = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).appearance; } catch {}
process.stdout.write(appearance === "light" || appearance === "dark" ? appearance : "auto");
' "$THEME_DIR/theme.json"
}

# Pin Codex appearanceTheme to the staged theme's declared appearance (or put
# the user's original line back for auto themes). Callers must only run this
# while Codex is closed; config writes race the app's own saves otherwise.
sync_appearance_pin() {
  "$NODE" "$SCRIPT_DIR/theme-config.mjs" install "$CONFIG_PATH" "$THEME_BACKUP_PATH" "$(active_theme_appearance)"
}

process_started_at() {
  LC_ALL=C /bin/ps -p "$1" -o lstart= 2>/dev/null | LC_ALL=C /usr/bin/awk '{$1=$1; print}'
}

recorded_injector_process_matches() {
  local pid="$1"
  local expected_start="${2:-}"
  local expected_node="${3:-}"
  local expected_injector="${4:-}"
  local expected_port="${5:-}"
  local command_line=""
  local command_lower=""
  local node_lower=""
  local injector_lower=""
  local actual_start=""

  # A recorded PID is only safe to signal when the complete launch identity
  # was persisted.  Do not fall back to the current process paths: a stale or
  # hand-edited state file must fail closed instead of authorizing a reused PID.
  [ -n "$expected_start" ] && [ -n "$expected_node" ] && [ -n "$expected_injector" ] || return 1
  case "$expected_port" in
    ''|*[!0-9]*) return 1 ;;
  esac
  /bin/kill -0 "$pid" 2>/dev/null || return 1
  command_line="$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)"
  [ -n "$command_line" ] || return 1
  command_lower="$(printf '%s' "$command_line" | /usr/bin/tr '[:upper:]' '[:lower:]')"
  injector_lower="$(printf '%s' "$expected_injector" | /usr/bin/tr '[:upper:]' '[:lower:]')"
  node_lower="$(printf '%s' "$expected_node" | /usr/bin/tr '[:upper:]' '[:lower:]')"
  case "$command_lower" in "$node_lower "*) ;; *) return 1 ;; esac
  # The watcher launch shape is deliberately matched as tokens.  In
  # particular, `--port 93410` must never satisfy a saved `9341` identity.
  case "$command_lower" in
    *"$injector_lower --watch --port $expected_port --theme-dir "*) ;;
    *) return 1 ;;
  esac
  actual_start="$(process_started_at "$pid")"
  [ -n "$actual_start" ] && [ "$actual_start" = "$expected_start" ] || return 1
  return 0
}

stop_codex() {
  local allow_force="${1:-false}"
  local deadline
  local pid
  codex_is_running || return 0
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    # Re-verify the identity right before signalling; a PID from the initial
    # scan could have been recycled in between (stop_recorded_injector standard).
    pid_is_codex_executable "$pid" || continue
    /bin/kill -TERM "$pid" 2>/dev/null || true
  done < <(codex_main_pids)
  deadline=$((SECONDS + 15))
  while codex_is_running && [ "$SECONDS" -lt "$deadline" ]; do /bin/sleep 0.25; done
  codex_is_running || return 0
  [ "$allow_force" = "true" ] || fail "Codex did not close within 15 seconds; explicit restart authorization is required for a forced stop."
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    pid_is_codex_executable "$pid" || continue
    /bin/kill -KILL "$pid" 2>/dev/null || true
  done < <(codex_main_pids)
  /bin/sleep 0.5
  codex_is_running && fail "Codex could not be stopped safely."
  return 0
}

port_is_available() {
  [ -z "$(listener_pids "$1")" ]
}

canonical_existing_path() {
  local input="$1"
  local directory
  local basename
  [ -e "$input" ] || return 1
  directory="$(cd "$(dirname "$input")" 2>/dev/null && pwd -P)" || return 1
  basename="$(basename "$input")"
  printf '%s/%s\n' "$directory" "$basename"
}

pid_is_codex_executable() {
  local actual
  local actual_canonical
  local expected_canonical
  local cmdline
  actual="$(process_executable_path "$1")"
  actual_canonical="$(canonical_existing_path "$actual" 2>/dev/null || true)"
  expected_canonical="$(canonical_existing_path "$CODEX_EXE" 2>/dev/null || true)"
  if [ -n "$actual_canonical" ] && [ "$actual_canonical" = "$expected_canonical" ]; then
    return 0
  fi
  cmdline="$(/usr/bin/tr '\0' ' ' < "/proc/$1/cmdline" 2>/dev/null || true)"
  case " $cmdline " in
    *" $CODEX_EXE "*) return 0 ;;
    *) return 1 ;;
  esac
}

pid_is_codex_descendant() {
  local current="$1"
  [ -n "${CODEX_EXE:-}" ] || discover_codex_app
  local command_line=""
  local parent=""
  local depth=0
  while [ "$current" -gt 1 ] 2>/dev/null && [ "$depth" -lt 32 ]; do
    command_line="$(/bin/ps -p "$current" -o command= 2>/dev/null || true)"
    case "$command_line" in
      "$CODEX_EXE"*) pid_is_codex_executable "$current" && return 0 ;;
    esac
    parent="$(/bin/ps -p "$current" -o ppid= 2>/dev/null | /usr/bin/awk '{$1=$1; print}')"
    case "$parent" in ''|*[!0-9]*) return 1 ;; esac
    [ "$parent" -ne "$current" ] || return 1
    current="$parent"
    depth=$((depth + 1))
  done
  return 1
}

port_belongs_to_codex() {
  local port="$1"
  local found="false"
  local pid
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    found="true"
    pid_is_codex_descendant "$pid" || return 1
  done < <(listener_pids "$port")
  [ "$found" = "true" ]
}

# Cheap: can we talk to a loopback DevTools HTTP endpoint?
cdp_http_ready() {
  local port="$1"
  /usr/bin/curl --noproxy '*' --silent --fail --max-time 1 \
    "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1
}

verified_cdp_endpoint() {
  local port="$1"
  port_belongs_to_codex "$port" || return 1
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
    /bin/sleep 0.35
  done
  return 1
}

state_field() {
  local key="$1"
  ensure_node_runtime
  "$NODE" -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[process.argv[2]];
    if (value !== undefined && value !== null) process.stdout.write(String(value));
  ' "$STATE_PATH" "$key"
}

write_state() {
  local port="$1"
  local injector_pid="$2"
  local injector_started_at="$3"
  local codex_pid="$4"
  local session="${5:-applying}"
  local node_ver="${NODE_VERSION:-unknown}"
  local bundle="${CODEX_BUNDLE:-}"
  local exe="${CODEX_EXE:-}"
  local app_ver="${CODEX_VERSION:-}"
  local team="${CODEX_TEAM_ID:-}"
  "$NODE" -e '
    const fs = require("node:fs");
    const [file, version, port, pid, startedAt, injector, node, nodeVersion, bundle, exe, appVersion, teamId, root, themeDir, codexPid, arch, session] = process.argv.slice(1);
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
      codexBundle: bundle,
      codexExe: exe,
      codexVersion: appVersion,
      codexTeamId: teamId,
      codexPid: Number(codexPid || 0),
      projectRoot: root,
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
  ' "$STATE_PATH" "$SKIN_VERSION" "$port" "$injector_pid" "$injector_started_at" "$INJECTOR" "$NODE" "$node_ver" "$bundle" "$exe" "$app_ver" "$team" "$PROJECT_ROOT" "$THEME_DIR" "$codex_pid" "$(/usr/bin/uname -m)" "$session"
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
  # Already paused / no daemon
  if [ "$pid" = "0" ]; then
    return 0
  fi
  case "$pid" in
    *[!0-9]*|??????????*)
      printf 'Recorded Dream Skin injector PID is invalid; state was preserved.\n' >&2
      return 1
      ;;
  esac
  while [ "${pid#0}" != "$pid" ]; do pid="${pid#0}"; done
  if [ -z "$pid" ]; then
    return 0
  fi

  # Load and validate every recorded identity field before probing or
  # signalling the PID.  Missing fields are not treated as a harmless legacy
  # state: preserving the evidence is safer than guessing which process is
  # allowed to receive TERM/KILL.
  saved_port="$(state_field port 2>/dev/null || true)"
  saved_start="$(state_field injectorStartedAt 2>/dev/null || true)"
  saved_node="$(state_field nodePath 2>/dev/null || true)"
  saved_injector="$(state_field injectorPath 2>/dev/null || true)"
  case "$saved_port" in
    ''|*[!0-9]*)
      printf 'Recorded Dream Skin injector port is missing or invalid; state was preserved.\n' >&2
      return 1
      ;;
  esac
  [ "$saved_port" -ge 1024 ] && [ "$saved_port" -le 65535 ] || {
    printf 'Recorded Dream Skin injector port is out of range; state was preserved.\n' >&2
    return 1
  }
  if [ -z "$saved_start" ] || [ -z "$saved_node" ] || [ -z "$saved_injector" ]; then
    printf 'Recorded Dream Skin injector identity is incomplete; state was preserved.\n' >&2
    return 1
  fi
  /bin/kill -0 "$pid" 2>/dev/null || {
    return 0
  }
  if ! recorded_injector_process_matches "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port"; then
    # The process may have exited between the initial kill -0 probe and the
    # identity check. A dead (or already reaped) recorded PID is safe to
    # forget; a live PID with mismatched identity is never signalled.
    if ! /bin/kill -0 "$pid" 2>/dev/null || [ -z "$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)" ]; then
      return 0
    fi
    printf 'Recorded injector PID %s is live but its identity does not match; refusing to signal it.\n' "$pid" >&2
    return 1
  fi
  /bin/kill -TERM "$pid" 2>/dev/null || true
  local deadline=$((SECONDS + 6))
  while recorded_injector_process_matches "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port" \
    && [ "$SECONDS" -lt "$deadline" ]; do
    /bin/sleep 0.2
  done
  if recorded_injector_process_matches "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port"; then
    /bin/kill -KILL "$pid" 2>/dev/null || true
  fi
  deadline=$((SECONDS + 2))
  while recorded_injector_process_matches "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port" \
    && [ "$SECONDS" -lt "$deadline" ]; do
    /bin/sleep 0.1
  done
  if recorded_injector_process_matches "$pid" "$saved_start" "$saved_node" "$saved_injector" "$saved_port"; then
    printf 'Could not stop the recorded Dream Skin injector (PID %s).\n' "$pid" >&2
    return 1
  fi
  return 0
}

launch_injector_daemon() {
  local port="$1"
  local pid=""
  : > "$INJECTOR_LOG"
  : > "$INJECTOR_ERROR_LOG"
  /usr/bin/nohup "$NODE" "$INJECTOR" --watch --port "$port" --theme-dir "$THEME_DIR" \
    --operation-state "$OPERATION_STATE_PATH" --operation-ack "$OPERATION_ACK_PATH" \
    >>"$INJECTOR_LOG" 2>>"$INJECTOR_ERROR_LOG" &
  pid="$!"
  /bin/sleep 0.15
  if [ -n "$pid" ] && /bin/kill -0 "$pid" 2>/dev/null; then
    printf '%s\n' "$pid"
    return 0
  fi
  fail "The injector did not start. See $INJECTOR_ERROR_LOG and $INJECTOR_LOG"
}

# Resolve Node from the system installation and require version 18 or newer.
ensure_node_runtime() {
  if [ -n "${NODE:-}" ] && [ -x "$NODE" ]; then
    return 0
  fi
  NODE="$(command -v node || true)"
  [ -n "$NODE" ] && [ -x "$NODE" ] || fail "Node.js was not found. Install nodejs (>= 18) first."
  local node_major=""
  node_major="$("$NODE" --version)"
  node_major="${node_major#v}"
  node_major="${node_major%%.*}"
  case "$node_major" in ''|*[!0-9]*) fail "Could not parse Node.js version." ;; esac
  [ "$node_major" -ge 18 ] || fail "Node.js $("$NODE" --version) is too old; version 18 or newer is required."
  NODE_VERSION="$("$NODE" --version)"
  export NODE NODE_VERSION
}

# Fast path when CDP is already open: restart injector + one-shot inject.
# Returns 0 on success, 1 if CDP is not ready (caller should full-start).
hot_reapply_theme() {
  local port="${1:-9335}"
  local timeout_ms="${2:-8000}"
  local operation_token="${3:-}"
  local operation_args=()
  local inj_pid=""
  local injector_protocol=""
  local injector_mode=""
  local started_at=""
  local codex_pid=""

  # A generic HTTP listener is not enough for a hot re-apply: only use the
  # endpoint already verified as belonging to the official Codex process.
  ensure_node_runtime || return 1
  verified_cdp_endpoint "$port" || return 1
  [ -n "$operation_token" ] || operation_token="$(new_operation_token)"
  write_operation_state applying "$(dreamskin_text applying_selected_theme)" "$operation_token" || return 1
  operation_args=(--operation-token "$operation_token")

  injector_protocol="$(state_field injectorProtocol 2>/dev/null || true)"
  injector_mode="$(state_field injectorMode 2>/dev/null || true)"
  if [ "$injector_protocol" = "2" ] || [ "$injector_protocol" = "3" ]; then
    inj_pid="$(/bin/ps -axo pid=,command= | /usr/bin/awk -v inj="$INJECTOR" -v port="$port" '
      index($0, inj) && index($0, "--watch") && index($0, "--port " port " --theme-dir ") { print $1; exit }
    ')"
  fi
  if ! "$NODE" "$INJECTOR" --once --port "$port" --theme-dir "$THEME_DIR" \
    --timeout-ms "$timeout_ms" "${operation_args[@]}" >/dev/null 2>&1; then
    return 1
  fi

  # A current watcher reloads theme files itself. Start one only when absent.
  if [ -n "$inj_pid" ] && /bin/kill -0 "$inj_pid" 2>/dev/null \
    && [ "$injector_mode" != "control" ]; then
    mark_state_active || return 1
    write_operation_state success "$(dreamskin_text skin_applied)" "$operation_token" || return 1
    return 0
  fi
  stop_recorded_injector 2>/dev/null || return 1
  inj_pid="$(launch_injector_daemon "$port")"
  /bin/kill -0 "$inj_pid" 2>/dev/null || return 1
  started_at="$(process_started_at "$inj_pid")"
  codex_pid="$(first_codex_pid)"
  [ -n "$started_at" ] || started_at="$(/bin/date)"
  write_state "$port" "$inj_pid" "$started_at" "${codex_pid:-0}" active
  write_operation_state success "$(dreamskin_text skin_applied)" "$operation_token" || return 1
  return 0
}
