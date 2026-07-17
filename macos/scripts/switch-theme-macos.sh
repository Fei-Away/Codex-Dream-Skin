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
SWITCH_LOCK_META="$STATE_ROOT/.theme-switch.meta"
SWITCH_GATE="$STATE_ROOT/.theme-switch-gate"
LOCK_GATE_TEMP=""
LOCK_META_TEMP=""
LOCK_OWNER_PID=""
LOCK_OWNER_START=""
stage=""

lock_meta_field() {
  local field="$1"
  [ -f "$SWITCH_LOCK_META" ] && [ ! -L "$SWITCH_LOCK_META" ] || return 1
  /usr/bin/awk -F= -v key="$field" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' \
    "$SWITCH_LOCK_META"
}

cleanup_switch() {
  [ -z "$stage" ] || /bin/rm -rf "$stage"
  [ -z "$LOCK_GATE_TEMP" ] || /bin/rm -f "$LOCK_GATE_TEMP"
  [ -z "$LOCK_META_TEMP" ] || /bin/rm -f "$LOCK_META_TEMP"
  [ -n "$LOCK_OWNER_PID" ] || return 0
  exec 9>&- 2>/dev/null || true
  [ -f "$SWITCH_GATE" ] && [ ! -L "$SWITCH_GATE" ] || return 0
  exec 9<>"$SWITCH_GATE" || return 0
  if /usr/bin/lockf -s -t 1 9; then
    current_pid="$(/bin/cat "$SWITCH_LOCK" 2>/dev/null || true)"
    current_meta_pid="$(lock_meta_field pid 2>/dev/null || true)"
    current_meta_start="$(lock_meta_field startedAt 2>/dev/null || true)"
    if [ "$current_pid" = "$LOCK_OWNER_PID" ] \
      && { [ -z "$current_meta_pid" ] || { [ "$current_meta_pid" = "$LOCK_OWNER_PID" ] \
        && [ "$current_meta_start" = "$LOCK_OWNER_START" ]; }; }; then
      /bin/rm -f "$SWITCH_LOCK" "$SWITCH_LOCK_META"
    fi
  fi
  exec 9>&-
}
trap cleanup_switch EXIT

# The persistent gate serializes only lock publication/reclamation. FD 9 is
# closed before staging or launching any injector/Codex child.
if [ -L "$SWITCH_GATE" ] || { [ -e "$SWITCH_GATE" ] && [ ! -f "$SWITCH_GATE" ]; }; then
  fail "Theme switch gate must be a regular file."
fi
if [ ! -e "$SWITCH_GATE" ]; then
  LOCK_GATE_TEMP="$(/usr/bin/mktemp "$STATE_ROOT/.theme-switch-gate.XXXXXX")"
  /bin/chmod 600 "$LOCK_GATE_TEMP"
  /bin/ln "$LOCK_GATE_TEMP" "$SWITCH_GATE" 2>/dev/null || true
  /bin/rm -f "$LOCK_GATE_TEMP"
  LOCK_GATE_TEMP=""
fi
[ -f "$SWITCH_GATE" ] && [ ! -L "$SWITCH_GATE" ] \
  || fail "Theme switch gate must be a regular file."
/bin/chmod 600 "$SWITCH_GATE"

LOCK_OWNER_START="$(/bin/ps -p "$$" -o lstart= 2>/dev/null | /usr/bin/awk '{$1=$1; print}')"
[ -n "$LOCK_OWNER_START" ] || fail "Could not identify the theme switch process."
exec 9<>"$SWITCH_GATE" || fail "Could not open the theme switch gate."
/usr/bin/lockf -s -t 1 9 || fail "Another theme switch is already starting."

if [ -L "$SWITCH_LOCK" ] || { [ -e "$SWITCH_LOCK" ] && [ ! -f "$SWITCH_LOCK" ]; }; then
  fail "Theme switch lock must be a regular file."
fi
if ! /usr/bin/shlock -f "$SWITCH_LOCK" -p "$$"; then
  existing_pid="$(/bin/cat "$SWITCH_LOCK" 2>/dev/null || true)"
  existing_meta_pid="$(lock_meta_field pid 2>/dev/null || true)"
  existing_meta_start="$(lock_meta_field startedAt 2>/dev/null || true)"
  existing_process_start=""
  case "$existing_pid" in
    ''|*[!0-9]*) ;;
    *) existing_process_start="$(/bin/ps -p "$existing_pid" -o lstart= 2>/dev/null \
      | /usr/bin/awk '{$1=$1; print}')" ;;
  esac
  if [ -n "$existing_process_start" ] \
    && [ "$existing_meta_pid" = "$existing_pid" ] \
    && [ "$existing_meta_start" = "$existing_process_start" ]; then
    fail "Another theme switch is already running."
  fi
  /bin/rm -f "$SWITCH_LOCK" "$SWITCH_LOCK_META"
  /usr/bin/shlock -f "$SWITCH_LOCK" -p "$$" \
    || fail "Another theme switch is already running."
fi
LOCK_OWNER_PID="$$"
[ -f "$SWITCH_LOCK" ] && [ ! -L "$SWITCH_LOCK" ] \
  || fail "Theme switch lock must be a regular file."
LOCK_META_TEMP="$(/usr/bin/mktemp "$STATE_ROOT/.theme-switch-meta.XXXXXX")"
/usr/bin/printf 'pid=%s\nstartedAt=%s\n' "$LOCK_OWNER_PID" "$LOCK_OWNER_START" > "$LOCK_META_TEMP"
/bin/chmod 600 "$LOCK_META_TEMP"
/bin/mv -f "$LOCK_META_TEMP" "$SWITCH_LOCK_META"
LOCK_META_TEMP=""
/bin/chmod 600 "$SWITCH_LOCK"
exec 9>&-

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
