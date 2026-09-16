#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

ensure_node_runtime
ensure_state_root

TARGET_THEME="${1:-}"
[ -n "$TARGET_THEME" ] || { printf 'Usage: switch-theme-linux.sh <theme-id>\n' >&2; exit 2; }

# Locate the target theme directory
themes_root="$STATE_ROOT/themes"
target_dir=""
for dir in "$themes_root"/"$TARGET_THEME"* "$themes_root"/preset-"$TARGET_THEME"*; do
  [ -d "$dir" ] && [ -f "$dir/theme.json" ] && { target_dir="$dir"; break; }
done
[ -n "$target_dir" ] || { printf 'Theme not found: %s\n' "$TARGET_THEME" >&2; exit 1; }

# Copy theme into active theme dir
rm -rf "$THEME_DIR"
cp -a "$target_dir" "$THEME_DIR"
chmod 700 "$THEME_DIR"
chmod 600 "$THEME_DIR"/* 2>/dev/null || true

# Sync appearance config
sync_appearance_pin || true

# Restart injector to apply new theme
port="$(state_field port 2>/dev/null || echo 9335)"
[ -n "$port" ] || port="9335"

if [ -f "$STATE_PATH" ]; then
  stop_recorded_injector 2>/dev/null || true
fi
inj_pid="$(launch_injector_daemon "$port")"
sleep 0.15
[ -d "/proc/$inj_pid" ] || { printf 'Failed to restart injector for theme switch.\n' >&2; exit 1; }
started_at="$(process_started_at "$inj_pid")"
codex_pid="$(codex_main_pids | head -n 1)"
write_state "$port" "$inj_pid" "${started_at:-$(date)}" "${codex_pid:-0}" active
mark_state_active || true
printf 'Theme switched to %s\n' "$TARGET_THEME"
