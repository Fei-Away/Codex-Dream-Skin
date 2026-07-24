#!/bin/bash

# Capture the exact active runtime theme into one private community-apply root.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
. "$SCRIPT_DIR/theme-switch-lock-macos.sh"

DESTINATION=""
LOCK_TOKEN=""
SNAPSHOT_COMPLETE="false"

cleanup_snapshot() {
  if [ "$SNAPSHOT_COMPLETE" != "true" ] && [ -n "${DESTINATION:-}" ] && [ -d "$DESTINATION" ]; then
    /bin/rm -rf "$DESTINATION"
  fi
}
trap cleanup_snapshot EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --destination) DESTINATION="${2:-}"; shift 2 ;;
    --lock-token) LOCK_TOKEN="${2:-}"; shift 2 ;;
    *) fail "Unknown snapshot argument: $1" ;;
  esac
done

[ -n "$DESTINATION" ] || fail "Usage: snapshot-active-theme-macos.sh --destination <private-active-before-dir>"
ensure_state_root
if [ -n "$LOCK_TOKEN" ]; then
  assert_inherited_theme_switch_lock "$LOCK_TOKEN" "$PPID"
fi
case "$DESTINATION" in
  "$STATE_ROOT"/.community-apply-*/active-before) ;;
  *) fail "Active-theme snapshots must stay in the reserved community-apply namespace." ;;
esac
[ ! -e "$DESTINATION" ] && [ ! -L "$DESTINATION" ] \
  || fail "Active-theme snapshot destination already exists."
parent="$(/usr/bin/dirname "$DESTINATION")"
[ -d "$parent" ] && [ ! -L "$parent" ] || fail "Active-theme snapshot parent is invalid."
state_root_real="$(cd "$STATE_ROOT" && pwd -P)"
parent_real="$(cd "$parent" && pwd -P)"
case "$parent_real/" in "$state_root_real/.community-apply-"*/) ;; *) fail "Active-theme snapshot parent escapes the reserved namespace." ;; esac
[ -d "$THEME_DIR" ] && [ ! -L "$THEME_DIR" ] || fail "There is no regular active theme to snapshot."

ensure_node_runtime
/bin/mkdir "$DESTINATION"
/bin/chmod 700 "$DESTINATION"
result="$("$NODE" "$SCRIPT_DIR/stage-theme.mjs" "$THEME_DIR" "$DESTINATION")" \
  || fail "The active theme changed while its rollback snapshot was captured."
"$NODE" "$INJECTOR" --check-payload --theme-dir "$DESTINATION" >/dev/null \
  || fail "The active theme could not be validated for rollback."
SNAPSHOT_COMPLETE="true"
/usr/bin/printf '%s\n' "$result"
