#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

ACTION="${1:-list}"
shift || true

ensure_node_runtime
ensure_state_root

case "$ACTION" in
  list)
    local themes_root="$STATE_ROOT/themes"
    [ -d "$themes_root" ] || { printf 'No themes saved yet.\n'; exit 0; }
    local active_id=""
    [ -f "$STATE_PATH" ] && active_id="$(state_field appliedThemeId 2>/dev/null || true)"
    for dir in "$themes_root"/*/; do
      [ -d "$dir" ] || continue
      local tid tname tactive
      tid="$(python3 -c "import json; print(json.load(open('$dir/theme.json')).get('id',''))" 2>/dev/null || true)"
      tname="$(python3 -c "import json; print(json.load(open('$dir/theme.json')).get('name',json.load(open('$dir/theme.json')).get('id','')))" 2>/dev/null || true)"
      [ "$tid" = "$active_id" ] && tactive="*" || tactive=" "
      printf '%s [%s] %s\n' "$tactive" "$tid" "$tname"
    done
    ;;
  switch)
    local target="$1"
    [ -n "$target" ] || { printf 'Usage: theme-manager switch <theme-id>\n' >&2; exit 2; }
    "$NODE" "$SCRIPT_DIR/switch-theme-macos.sh" "$target" 2>/dev/null \
      || "$NODE" "$SCRIPT_DIR/../runtime/stage-theme.mjs" --switch "$target" \
         --theme-dir "$THEME_DIR" --state-path "$STATE_PATH" \
         --injector "$INJECTOR" --node "$NODE" 2>>"$START_ERROR_LOG" \
      || { printf 'Failed to switch theme to %s\n' "$target" >&2; exit 1; }
    printf 'Theme switched to %s\n' "$target"
    ;;
  *)
    printf 'Usage: theme-manager {list|switch <id>}\n' >&2
    exit 2
    ;;
esac
