#!/bin/bash

# Import one validated ZIP pack into the saved-theme library without applying it.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

ARCHIVE=""
WORK_ROOT=""

cleanup_import() {
  [ -z "${WORK_ROOT:-}" ] || /bin/rm -rf "$WORK_ROOT"
}
trap cleanup_import EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --file) ARCHIVE="${2:-}"; shift 2 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[ -n "$ARCHIVE" ] || fail "Usage: import-theme-zip-macos.sh --file <theme.zip>"
archive_name="$(/usr/bin/basename "$ARCHIVE")"
archive_lower="$(LC_ALL=C /usr/bin/printf '%s' "$archive_name" | /usr/bin/tr '[:upper:]' '[:lower:]')"
case "$archive_lower" in
  *.zip) ;;
  *) fail "Only ordinary .zip theme packages are supported; .dreamskin files are not accepted." ;;
esac

ensure_state_root
WORK_ROOT="$(/usr/bin/mktemp -d "$STATE_ROOT/.theme-import-work.XXXXXX")"
/bin/chmod 700 "$WORK_ROOT"
ARCHIVE_SNAPSHOT="$WORK_ROOT/archive.zip"
EXTRACT_STAGE="$WORK_ROOT/extracted"
VALIDATED_STAGE="$WORK_ROOT/validated"
/bin/mkdir "$EXTRACT_STAGE" "$VALIDATED_STAGE"
/bin/chmod 700 "$EXTRACT_STAGE" "$VALIDATED_STAGE"

ensure_node_runtime
SNAPSHOTTER="$SCRIPT_DIR/snapshot-theme-zip.mjs"
[ -f "$SNAPSHOTTER" ] || fail "Theme ZIP snapshot helper is missing from the installed engine."
"$NODE" "$SNAPSHOTTER" "$ARCHIVE" "$ARCHIVE_SNAPSHOT" \
  || fail "Theme ZIP could not be copied safely for import."
"$SCRIPT_DIR/extract-theme-zip-macos.sh" "$ARCHIVE_SNAPSHOT" "$EXTRACT_STAGE"

THEMES_ROOT="$STATE_ROOT/themes"
/bin/mkdir -p "$THEMES_ROOT"
/bin/chmod 700 "$THEMES_ROOT"
[ ! -L "$THEMES_ROOT" ] || fail "Saved themes folder must not be a symbolic link."

PACKAGE_VALIDATOR="$PROJECT_ROOT/assets/theme-package-validator.mjs"
[ -f "$PACKAGE_VALIDATOR" ] || fail "Theme package validator is missing from the installed engine."
"$NODE" "$PACKAGE_VALIDATOR" \
  --source "$EXTRACT_STAGE" \
  --stage "$VALIDATED_STAGE" \
  --platform macos \
  --client-version "$SKIN_VERSION" >/dev/null \
  || fail "Theme ZIP failed official package or local simplified-format validation."
"$NODE" "$INJECTOR" --check-payload --theme-dir "$VALIDATED_STAGE" >/dev/null \
  || fail "Theme ZIP failed theme.json or image validation."

# The publisher emits one JSON object consumed by the native menu app. It
# deduplicates semantically identical packs and never writes the active theme.
"$NODE" "$SCRIPT_DIR/publish-theme-import.mjs" "$VALIDATED_STAGE" "$THEMES_ROOT"

trap - EXIT
cleanup_import
