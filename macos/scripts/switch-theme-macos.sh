#!/bin/bash

# Switch to a theme pack under themes/<id>/ — hot path when CDP is live.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
. "$SCRIPT_DIR/theme-switch-lock-macos.sh"

THEME_ID=""
SNAPSHOT_DIR=""
EXPECTED_CONTENT_FINGERPRINT=""
LOCK_TOKEN=""
APPLY_NOW="true"
OPERATION_TOKEN=""
stage=""

finish_switch() {
  local code="$1"
  [ -z "${stage:-}" ] || /bin/rm -rf "$stage"
  release_theme_switch_lock
  if [ "$code" -ne 0 ] && [ -n "${OPERATION_TOKEN:-}" ]; then
    write_operation_state failed "主题切换未完成，应用结果未确认" "$OPERATION_TOKEN" 2>/dev/null || true
    finish_client_operation "${PORT:-9341}" error "主题切换未完成，应用结果未确认" \
      "$OPERATION_TOKEN" 1500 >/dev/null 2>&1 || true
  fi
}
trap 'finish_switch "$?"' EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) THEME_ID="${2:-}"; shift 2 ;;
    --snapshot-dir) SNAPSHOT_DIR="${2:-}"; shift 2 ;;
    --expect-fingerprint) EXPECTED_CONTENT_FINGERPRINT="${2:-}"; shift 2 ;;
    --lock-token) LOCK_TOKEN="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[ -z "$THEME_ID" ] || [ -z "$SNAPSHOT_DIR" ] || fail "Choose either a saved theme id or a rollback snapshot, not both."
[ -n "$THEME_ID" ] || [ -n "$SNAPSHOT_DIR" ] \
  || fail "Usage: switch-theme-macos.sh --id <theme-id> [--expect-fingerprint <sha256>]"
if [ -n "$THEME_ID" ]; then
  case "$THEME_ID" in
    ''|.*|*[!A-Za-z0-9._-]*) fail "Theme id must start with a letter or number and contain only letters, numbers, dots, underscores, and hyphens." ;;
  esac
  [ "${#THEME_ID}" -le 80 ] || fail "Theme id is too long."
fi
if [ -n "$EXPECTED_CONTENT_FINGERPRINT" ]; then
  case "$EXPECTED_CONTENT_FINGERPRINT" in *[!0-9a-f]*|'') fail "Expected theme fingerprint must be lowercase SHA-256." ;; esac
  [ "${#EXPECTED_CONTENT_FINGERPRINT}" -eq 64 ] || fail "Expected theme fingerprint must be lowercase SHA-256."
fi
[ -z "$SNAPSHOT_DIR" ] || [ "$APPLY_NOW" = "true" ] \
  || fail "A rollback snapshot must be visibly reapplied and verified."

ensure_state_root
THEMES_ROOT="$STATE_ROOT/themes"
if [ -n "$THEME_ID" ]; then
  SRC="$THEMES_ROOT/$THEME_ID"
  [ -d "$SRC" ] || fail "Theme not found: $THEME_ID"
  [ -f "$SRC/theme.json" ] || fail "theme.json missing in $THEME_ID"
else
  case "$SNAPSHOT_DIR" in
    "$STATE_ROOT"/.community-apply-*/active-before|"$STATE_ROOT"/recovery/community-*/active-before) ;;
    *) fail "Rollback snapshot escapes the reserved community-apply namespace." ;;
  esac
  SRC="$SNAPSHOT_DIR"
  [ -d "$SRC" ] && [ ! -L "$SRC" ] || fail "Rollback snapshot is missing or invalid."
fi

if [ -n "$LOCK_TOKEN" ]; then
  assert_inherited_theme_switch_lock "$LOCK_TOKEN" "$PPID"
else
  acquire_theme_switch_lock "$(new_operation_token)"
fi
if [ "$APPLY_NOW" = "true" ]; then
  OPERATION_TOKEN="$(new_operation_token)"
  write_operation_state applying "正在切换主题" "$OPERATION_TOKEN" \
    || fail "Could not publish the theme switch operation state."
fi
ensure_node_runtime
themes_root_real="$(cd "$THEMES_ROOT" && pwd -P)"
src_real="$(cd "$SRC" && pwd -P)"
if [ -n "$THEME_ID" ]; then
  case "$src_real/" in "$themes_root_real/"*) ;; *) fail "Theme directory escapes the saved theme library." ;; esac
else
  state_root_real="$(cd "$STATE_ROOT" && pwd -P)"
  case "$src_real" in
    "$state_root_real"/.community-apply-*/active-before|"$state_root_real"/recovery/community-*/active-before) ;;
    *) fail "Rollback snapshot escapes the reserved community-apply namespace." ;;
  esac
fi

PORT=9341
if [ -f "$STATE_PATH" ]; then
  saved="$(state_field port 2>/dev/null || true)"
  [ -n "${saved:-}" ] && PORT="$saved"
fi
if [ -n "$OPERATION_TOKEN" ] && verified_cdp_endpoint "$PORT" 2>/dev/null; then
  begin_client_operation "$PORT" switch 3000 "$OPERATION_TOKEN" >/dev/null 2>&1 || true
fi

progress() {
  printf '%s\n' "$*" >&2
  notify_user "$*"
}

progress "Validating theme content..."

stage="$(/usr/bin/mktemp -d "$STATE_ROOT/.theme-switch.XXXXXX")"
/bin/mkdir -p "$THEME_DIR"
/bin/chmod 700 "$stage"
# Snapshot theme.json and its referenced image from stable, no-follow file
# descriptors. This closes the validation/copy TOCTOU window: after this
# command returns, edits or symlink swaps in themes/<id> cannot mix the pair
# that will be published to the live theme directory.
STAGE_RESULT="$("$NODE" "$SCRIPT_DIR/stage-theme.mjs" "$SRC" "$stage")" \
  || fail "Theme pack changed or failed staging: $THEME_ID"
THEME_IMAGE="$("$NODE" -e '
const value = JSON.parse(process.argv[1]);
if (typeof value.image !== "string" || !value.image) process.exit(1);
process.stdout.write(value.image);
' "$STAGE_RESULT")" || fail "Theme staging returned an invalid image identity."
STAGED_CONTENT_FINGERPRINT="$("$NODE" -e '
const value = JSON.parse(process.argv[1]);
if (!/^[0-9a-f]{64}$/.test(value.contentFingerprint ?? "")) process.exit(1);
process.stdout.write(value.contentFingerprint);
' "$STAGE_RESULT")" || fail "Theme staging returned an invalid content fingerprint."
[ -z "$EXPECTED_CONTENT_FINGERPRINT" ] \
  || [ "$STAGED_CONTENT_FINGERPRINT" = "$EXPECTED_CONTENT_FINGERPRINT" ] \
  || fail "Saved theme content no longer matches the package that was imported."
# Validate the exact staged pair, not the mutable library directory. The
# injector performs the full schema, path, dimensions, and image checks.
"$NODE" "$INJECTOR" --check-payload --theme-dir "$stage" >/dev/null \
  || fail "Theme pack failed validation: $THEME_ID"
THEME_BYTES="$(/usr/bin/stat -f '%z' "$stage/$THEME_IMAGE")"
[ "$THEME_BYTES" -gt 0 ] && [ "$THEME_BYTES" -le 10485760 ] \
  || fail "Theme image must be non-empty and no larger than 10 MiB."
SAFE_CSS_NAME=""
[ ! -f "$stage/theme.css" ] || SAFE_CSS_NAME="theme.css"
/bin/chmod 600 "$stage/"*
progress "Publishing validated theme..."
for entry in "$stage/"*; do
  [ -f "$entry" ] || continue
  [ "$(/usr/bin/basename "$entry")" = "theme.json" ] && continue
  /bin/mv -f "$entry" "$THEME_DIR/"
done
# A legacy theme has no Safe CSS. Remove the previous theme's CSS before the
# config commit marker so a failed cleanup cannot pair new metadata with old CSS.
[ -n "$SAFE_CSS_NAME" ] || /bin/rm -f "$THEME_DIR/theme.css"
# theme.json is the commit marker: the watcher never observes a config that
# references a partially copied image.
/bin/mv -f "$stage/theme.json" "$THEME_DIR/theme.json"
if [ -n "$SAFE_CSS_NAME" ]; then
  /usr/bin/find "$THEME_DIR" -maxdepth 1 -type f \
    ! -name 'theme.json' ! -name "$THEME_IMAGE" ! -name 'theme.css' -delete
else
  /usr/bin/find "$THEME_DIR" -maxdepth 1 -type f \
    ! -name 'theme.json' ! -name "$THEME_IMAGE" -delete
fi
/bin/rm -rf "$stage"
stage=""

THEME_NAME="$("$NODE" -e 'try{const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(t.name||"")}catch{}' "$THEME_DIR/theme.json" 2>/dev/null || true)"
[ -n "$THEME_NAME" ] || THEME_NAME="$THEME_ID"

if [ "$APPLY_NOW" != "true" ]; then
  progress "Ready: ${THEME_NAME} (not applied)"
  exit 0
fi

# Hot path: CDP already open → seconds, not tens of seconds
progress "Applying theme to ChatGPT..."
if hot_reapply_theme "$PORT" 8000 "$OPERATION_TOKEN"; then
  progress "Verifying rendered theme..."
  "$NODE" "$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 10000 >/dev/null \
    || fail "Theme injection completed but the visible renderer did not verify the exact active theme."
  progress "Done: ${THEME_NAME}"
  exit 0
fi

# Cold path only when debug port is missing
progress "Restarting ChatGPT for verified apply..."
if "$SCRIPT_DIR/start-dream-skin-macos.sh" --port "$PORT" --restart-existing; then
  progress "Done: ${THEME_NAME}"
  exit 0
fi

alert_user "Theme switched but inject failed. Click Apply Skin."
exit 1
