#!/bin/bash

# Switch to a theme pack under themes/<id>/ — hot path when CDP is live.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

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
case "$THEME_ID" in
  *[!A-Za-z0-9._-]*|.|..) fail "Invalid theme ID: $THEME_ID" ;;
esac

ensure_state_root
THEMES_ROOT="$STATE_ROOT/themes"
SRC="$THEMES_ROOT/$THEME_ID"
[ -d "$SRC" ] || fail "Theme not found: $THEME_ID"
[ -f "$SRC/theme.json" ] || fail "theme.json missing in $THEME_ID"
ensure_node_runtime

progress() {
  printf '%s\n' "$*" >&2
  /usr/bin/osascript -e "display notification \"$*\" with title \"Codex Dream Skin\"" >/dev/null 2>&1 || true
}

progress "Switching..."

staged="$(/usr/bin/mktemp -d "$STATE_ROOT/theme.staged.XXXXXX")"
previous="$(/usr/bin/mktemp -d "$STATE_ROOT/theme.previous.XXXXXX")"
/bin/rmdir "$previous"
cleanup_switch() {
  /bin/rm -rf "$staged" "$previous"
}
trap cleanup_switch EXIT

/bin/cp -R "$SRC/." "$staged/"
/bin/chmod 600 "$staged/"* 2>/dev/null || true
"$NODE" "$INJECTOR" --check-payload --theme-dir "$staged" >/dev/null

if [ -e "$THEME_DIR" ]; then /bin/mv "$THEME_DIR" "$previous"; fi
if ! /bin/mv "$staged" "$THEME_DIR"; then
  [ ! -e "$previous" ] || /bin/mv "$previous" "$THEME_DIR"
  fail "Could not activate theme: $THEME_ID"
fi
/bin/rm -rf "$previous"
trap - EXIT

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

/usr/bin/osascript -e 'display alert "Codex Dream Skin" message "Theme switched but inject failed. Click Apply Skin."' >/dev/null 2>&1 || true
exit 1
