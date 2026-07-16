#!/bin/bash

# Switch to a theme pack under themes/<id>/ — hot path when CDP is live.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
UI_SCRIPT="$SCRIPT_DIR/ui-macos.applescript"

THEME_ID=""
APPLY_NOW="true"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) THEME_ID="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[ -n "$THEME_ID" ] || fail "Usage: switch-theme-macos.sh --id <theme-id>"

ensure_state_root
THEMES_ROOT="$STATE_ROOT/themes"
SRC="$THEMES_ROOT/$THEME_ID"
[ -d "$SRC" ] || fail "Theme not found: $THEME_ID"
[ -f "$SRC/theme.json" ] || fail "theme.json missing in $THEME_ID"

progress() {
  printf '%s\n' "$*" >&2
  /usr/bin/osascript "$UI_SCRIPT" notify "$*" >/dev/null 2>&1 || true
}

progress "Switching..."

/bin/mkdir -p "$THEME_DIR"
/usr/bin/find "$THEME_DIR" -type f -maxdepth 1 -delete 2>/dev/null || true
/bin/cp -f "$SRC/"* "$THEME_DIR/" 2>/dev/null || true
/bin/chmod 600 "$THEME_DIR/"* 2>/dev/null || true

ensure_node_runtime
THEME_NAME="$("$NODE" -e 'try{const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(t.name||"")}catch{}' "$THEME_DIR/theme.json" 2>/dev/null || true)"
[ -n "$THEME_NAME" ] || THEME_NAME="$THEME_ID"

if [ "$APPLY_NOW" != "true" ]; then
  progress "Ready: ${THEME_NAME} (not applied)"
  exit 0
fi

PORT=9341
if [ -f "$STATE_PATH" ]; then
  saved="$(state_field port 2>/dev/null || true)"
  [ -n "${saved:-}" ] && PORT="$saved"
fi

# Hot path: CDP already open → seconds, not tens of seconds
if hot_reapply_theme "$PORT" 8000; then
  progress "Done: ${THEME_NAME}"
  exit 0
fi

# Cold path only when debug port is missing
progress "CDP not ready, full start..."
if "$SCRIPT_DIR/start-dream-skin-macos.sh" --port "$PORT" --restart-existing; then
  progress "Done: ${THEME_NAME}"
  exit 0
fi

/usr/bin/osascript "$UI_SCRIPT" alert "Theme switched but inject failed. Click Apply Skin." >/dev/null 2>&1 || true
exit 1
