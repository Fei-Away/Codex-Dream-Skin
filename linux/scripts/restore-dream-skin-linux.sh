#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

# Linux: read a string field from the machine-written theme-backup.json
# (JSON.stringify(..., null, 2), one key per line). Returns empty when the
# key is missing or null. Equivalent to the macOS property-list extractor
# read, which returned the literal "null" for a JSON null value.
read_theme_backup_field() {
  local key="$1"
  /usr/bin/sed -n 's/^[[:space:]]*"'"$key"'"[[:space:]]*:[[:space:]]*"\([^"]*\)"[[:space:]]*,*$/\1/p' \
    "$THEME_BACKUP_PATH" 2>/dev/null | /usr/bin/head -n 1
}

PORT=9335
PORT_EXPLICIT="false"
RESTORE_BASE_THEME="false"
RESTART_CODEX="false"
UNINSTALL="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; PORT_EXPLICIT="true"; shift 2 ;;
    --restore-base-theme) RESTORE_BASE_THEME="true"; shift ;;
    --restart-codex) RESTART_CODEX="true"; shift ;;
    --uninstall) UNINSTALL="true"; shift ;;
    *) fail "Unknown restore argument: $1" ;;
  esac
done

# A native install deploys the engine before it validates Codex and the
# config. If that validation fails, the outer installer rolls the engine back;
# this branch also makes a stale partial engine safe to remove without asking
# for an official app or Node that was never used to change config.
if [ "$UNINSTALL" = "true" ] && [ ! -e "$STATE_PATH" ] &&
    [ ! -e "$OPERATION_STATE_PATH" ] && [ ! -e "$OPERATION_ACK_PATH" ]; then
  if [ ! -e "$THEME_BACKUP_PATH" ]; then
    printf 'No active Dream Skin session or config backup was found; safe engine-only cleanup.\n'
    exit 0
  fi
  backup_appearance="$(read_theme_backup_field appearanceTheme)"
  backup_dark_code="$(read_theme_backup_field appearanceDarkCodeThemeId)"
  # Install may have pinned appearanceTheme even when the backup recorded no
  # original line; a pinned config still needs the full restore below.
  # (macOS read these via its property-list extractor and compared against
  # the literal "null"; the Linux JSON reader returns empty for null or
  # absent values.)
  if [ -z "$backup_appearance" ] && [ -z "$backup_dark_code" ] &&
      ! /usr/bin/grep -E -q '^[[:space:]]*appearanceTheme[[:space:]]*=' "$CONFIG_PATH" 2>/dev/null; then
    /bin/rm -f "$THEME_BACKUP_PATH"
    printf 'The install created no config overrides; safe engine-only cleanup.\n'
    exit 0
  fi
fi

discover_codex_app
require_linux_runtime
ensure_state_root
if [ "$PORT_EXPLICIT" = "false" ] && [ -f "$STATE_PATH" ]; then
  PORT="$(state_field port)" || fail "Could not read the saved CDP port; state was preserved."
fi

if [ -f "$STATE_PATH" ]; then
  stop_recorded_injector \
    || fail "Could not stop the recorded injector; restore state was preserved."
fi
# macOS removed a themed launchd job here so quitting ChatGPT stays quit;
# Linux launches Codex directly per command, so the hook is a verified no-op.
release_codex_launchd_job || true
CODEX_RUNNING="false"
codex_is_running && CODEX_RUNNING="true"
DEBUG_READY="false"
verified_cdp_endpoint "$PORT" && DEBUG_READY="true"

if [ "$DEBUG_READY" = "true" ]; then
  "$NODE" "$INJECTOR" --remove --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 8000 >/dev/null \
    || fail "The live skin could not be removed and verified; restore stopped safely."
elif [ "$CODEX_RUNNING" = "true" ] && [ "$RESTART_CODEX" = "false" ]; then
  fail "ChatGPT is still running but its saved CDP endpoint cannot be verified. Pass --restart-codex for a full restore."
fi

if [ "$RESTORE_BASE_THEME" = "true" ]; then
  if [ "$CODEX_RUNNING" = "true" ]; then
    [ "$RESTART_CODEX" = "true" ] \
      || fail "Close ChatGPT or pass --restart-codex before restoring config.toml."
    stop_codex true
    CODEX_RUNNING="false"
  fi
  "$NODE" "$SCRIPT_DIR/theme-config.mjs" restore "$CONFIG_PATH" "$THEME_BACKUP_PATH"
fi

if [ "$RESTART_CODEX" = "true" ]; then
  [ "$CODEX_RUNNING" = "true" ] && stop_codex true
  launch_codex_normally
fi

/bin/rm -f "$STATE_PATH"
clear_operation_state
/bin/rm -f "$OPERATION_ACK_PATH"
# The macOS uninstall also removed the Desktop *.command launchers it had
# created; the Linux installer manages .desktop entries instead, so there are
# no equivalent files to clean up here.

printf 'ChatGPT Dream Skin was removed and the requested Linux restore actions completed successfully.\n'
