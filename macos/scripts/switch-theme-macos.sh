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
  *[!A-Za-z0-9_-]*|'') fail "Theme id may contain only letters, numbers, underscores, and hyphens." ;;
esac
[ "${#THEME_ID}" -le 80 ] || fail "Theme id is too long."

ensure_state_root
THEMES_ROOT="$STATE_ROOT/themes"
SRC="$THEMES_ROOT/$THEME_ID"
[ -d "$SRC" ] || fail "Theme not found: $THEME_ID"
[ -f "$SRC/theme.json" ] || fail "theme.json missing in $THEME_ID"
ensure_node_runtime
themes_root_real="$(cd "$THEMES_ROOT" && pwd -P)"
src_real="$(cd "$SRC" && pwd -P)"
case "$src_real/" in "$themes_root_real/"*) ;; *) fail "Theme directory escapes the saved theme library." ;; esac

progress() {
  printf '%s\n' "$*" >&2
  notify_user "$*"
}

progress "Switching..."

stage="$(/usr/bin/mktemp -d "$STATE_ROOT/.theme-switch.XXXXXX")"
cleanup_stage() { /bin/rm -rf "$stage"; }
trap cleanup_stage EXIT
/bin/mkdir -p "$THEME_DIR"
/bin/chmod 700 "$stage"
# Snapshot theme.json and its referenced image from stable, no-follow file
# descriptors. This closes the validation/copy TOCTOU window: after this
# command returns, edits or symlink swaps in themes/<id> cannot mix the pair
# that will be published to the live theme directory.
THEME_IMAGE="$("$NODE" "$SCRIPT_DIR/stage-theme.mjs" "$SRC" "$stage")" \
  || fail "Theme pack changed or failed staging: $THEME_ID"
# Validate the exact staged pair, not the mutable library directory. The
# injector performs the full schema, path, dimensions, and image checks.
"$NODE" "$INJECTOR" --check-payload --theme-dir "$stage" >/dev/null \
  || fail "Theme pack failed validation: $THEME_ID"
THEME_BYTES="$(/usr/bin/stat -f '%z' "$stage/$THEME_IMAGE")"
[ "$THEME_BYTES" -gt 0 ] && [ "$THEME_BYTES" -le 16777216 ] \
  || fail "Theme image must be non-empty and no larger than 16 MB."
/bin/chmod 600 "$stage/"*
for entry in "$stage/"*; do
  [ -f "$entry" ] || continue
  [ "$(/usr/bin/basename "$entry")" = "theme.json" ] && continue
  /bin/mv -f "$entry" "$THEME_DIR/"
done
# theme.json is the commit marker: the watcher never observes a config that
# references a partially copied image.
/bin/mv -f "$stage/theme.json" "$THEME_DIR/theme.json"
/usr/bin/find "$THEME_DIR" -maxdepth 1 -type f \
  ! -name 'theme.json' ! -name "$THEME_IMAGE" -delete
/bin/rm -rf "$stage"
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

alert_user "Theme switched but inject failed. Click Apply Skin."
exit 1
