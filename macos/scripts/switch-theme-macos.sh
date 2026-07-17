#!/bin/bash

# Switch to a theme pack under themes/<id>/ — hot path when CDP is live.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

THEME_ID=""
EXPECTED_CONTENT_HASH=""
APPLY_NOW="true"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) THEME_ID="${2:-}"; shift 2 ;;
    --expected-content-hash) EXPECTED_CONTENT_HASH="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[ -n "$THEME_ID" ] || fail "Usage: switch-theme-macos.sh --id <theme-id>"
case "$THEME_ID" in
  ''|.|..|*[!A-Za-z0-9._-]*) fail "Theme id contains unsupported characters." ;;
esac
[ "${#THEME_ID}" -le 128 ] || fail "Theme id is too long."
case "$EXPECTED_CONTENT_HASH" in
  '') ;;
  *[!0-9a-f]*) fail "Expected content hash must be a lowercase SHA-256 digest." ;;
esac
[ -z "$EXPECTED_CONTENT_HASH" ] || [ "${#EXPECTED_CONTENT_HASH}" -eq 64 ] \
  || fail "Expected content hash must be a lowercase SHA-256 digest."

ensure_state_root
SWITCH_LOCK="$STATE_ROOT/.theme-switch.lock"
# shlock publishes the owner PID with an atomic hard-link operation. This
# avoids the mkdir-then-write gap without holding an FD that the long-running
# injector or Codex process could inherit after this script exits.
if [ -L "$SWITCH_LOCK" ] || { [ -e "$SWITCH_LOCK" ] && [ ! -f "$SWITCH_LOCK" ]; }; then
  fail "Theme switch lock must be a regular file."
fi
/usr/bin/shlock -f "$SWITCH_LOCK" -p "$$" \
  || fail "Another theme switch is already running."
stage=""
cleanup_switch() {
  [ -z "$stage" ] || /bin/rm -rf "$stage"
  lock_owner="$(/bin/cat "$SWITCH_LOCK" 2>/dev/null || true)"
  [ "$lock_owner" != "$$" ] || /bin/rm -f "$SWITCH_LOCK"
}
trap cleanup_switch EXIT
[ -f "$SWITCH_LOCK" ] && [ ! -L "$SWITCH_LOCK" ] \
  || fail "Theme switch lock must be a regular file."
/bin/chmod 600 "$SWITCH_LOCK"

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
/bin/mkdir -p "$THEME_DIR"
/bin/chmod 700 "$stage"
# Snapshot theme.json and its referenced image from stable, no-follow file
# descriptors. This closes the validation/copy TOCTOU window: after this
# command returns, edits or symlink swaps in themes/<id> cannot mix the pair
# that will be published to the live theme directory.
THEME_IMAGE="$("$NODE" "$SCRIPT_DIR/stage-theme.mjs" "$SRC" "$stage")" \
  || fail "Theme pack changed or failed staging: $THEME_ID"
if [ -n "$EXPECTED_CONTENT_HASH" ]; then
  "$NODE" -e '
    const theme = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (theme.id !== process.argv[2] || theme.packageContentHash !== process.argv[3]) process.exit(1);
  ' "$stage/theme.json" "$THEME_ID" "$EXPECTED_CONTENT_HASH" \
    || fail "Theme pack no longer matches the confirmed package identity: $THEME_ID"
fi
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
stage=""

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
if hot_reapply_theme "$PORT" 8000 "$THEME_ID" "$EXPECTED_CONTENT_HASH"; then
  progress "Done: ${THEME_NAME}"
  exit 0
fi

# Cold path only when debug port is missing
progress "CDP not ready, full start..."
if "$SCRIPT_DIR/start-dream-skin-macos.sh" --port "$PORT" --restart-existing \
  && { [ -z "$EXPECTED_CONTENT_HASH" ] || "$NODE" "$INJECTOR" --verify --port "$PORT" \
    --theme-dir "$THEME_DIR" --timeout-ms 12000 --expected-theme-id "$THEME_ID" \
    --expected-content-hash "$EXPECTED_CONTENT_HASH" >/dev/null; }; then
  progress "Done: ${THEME_NAME}"
  exit 0
fi

alert_user "Theme switched but inject failed. Click Apply Skin."
exit 1
