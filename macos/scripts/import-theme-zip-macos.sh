#!/bin/bash

# Import one validated ZIP pack into the saved-theme library without applying it.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

ARCHIVE=""
EXPECTED_SHA256=""
EXPECTED_BYTES=""
WORK_ROOT=""

cleanup_import() {
  [ -z "${WORK_ROOT:-}" ] || /bin/rm -rf "$WORK_ROOT"
}
trap cleanup_import EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --file) ARCHIVE="${2:-}"; shift 2 ;;
    --expected-sha256) EXPECTED_SHA256="${2:-}"; shift 2 ;;
    --expected-bytes) EXPECTED_BYTES="${2:-}"; shift 2 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[ -n "$ARCHIVE" ] || fail "Usage: import-theme-zip-macos.sh --file <theme.zip>"
if { [ -n "$EXPECTED_SHA256" ] && [ -z "$EXPECTED_BYTES" ]; } \
  || { [ -z "$EXPECTED_SHA256" ] && [ -n "$EXPECTED_BYTES" ]; }; then
  fail "Expected package SHA-256 and byte count must be supplied together."
fi
if [ -n "$EXPECTED_SHA256" ]; then
  case "$EXPECTED_SHA256" in *[!0-9a-f]*|'') fail "Expected package SHA-256 is invalid." ;; esac
  [ "${#EXPECTED_SHA256}" -eq 64 ] || fail "Expected package SHA-256 is invalid."
  case "$EXPECTED_BYTES" in ''|*[!0-9]*) fail "Expected package byte count is invalid." ;; esac
  [ "$EXPECTED_BYTES" -gt 0 ] && [ "$EXPECTED_BYTES" -le 33554432 ] \
    || fail "Expected package byte count is outside the import limit."
fi
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
PAYLOAD_VALIDATION_STAGE="$WORK_ROOT/payload-validation"
/bin/mkdir "$EXTRACT_STAGE" "$VALIDATED_STAGE" "$PAYLOAD_VALIDATION_STAGE"
/bin/chmod 700 "$EXTRACT_STAGE" "$VALIDATED_STAGE" "$PAYLOAD_VALIDATION_STAGE"

ensure_node_runtime
SNAPSHOTTER="$SCRIPT_DIR/snapshot-theme-zip.mjs"
[ -f "$SNAPSHOTTER" ] || fail "Theme ZIP snapshot helper is missing from the installed engine."
"$NODE" "$SNAPSHOTTER" "$ARCHIVE" "$ARCHIVE_SNAPSHOT" \
  || fail "Theme ZIP could not be copied safely for import."
if [ -n "$EXPECTED_SHA256" ]; then
  snapshot_bytes="$(/usr/bin/stat -f '%z' "$ARCHIVE_SNAPSHOT")"
  [ "$snapshot_bytes" = "$EXPECTED_BYTES" ] \
    || fail "The private import snapshot no longer matches the approved package byte count."
  snapshot_sha256="$(LC_ALL=C /usr/bin/shasum -a 256 "$ARCHIVE_SNAPSHOT" | /usr/bin/awk '{print $1}')"
  [ "$snapshot_sha256" = "$EXPECTED_SHA256" ] \
    || fail "The private import snapshot no longer matches the approved package SHA-256."
fi
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

# The publisher assigns a stable private ID when a simplified package omits ID
# or supplies a non-string value. Validate every other runtime field against a
# private copy with a temporary valid ID, while preserving the original stage
# for the publisher's cross-platform identity fingerprint.
/bin/cp -R "$VALIDATED_STAGE/." "$PAYLOAD_VALIDATION_STAGE/"
/bin/chmod -R u=rwX,go= "$PAYLOAD_VALIDATION_STAGE"
"$NODE" -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const theme = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Object.hasOwn(theme, "id") || typeof theme.id !== "string") {
    theme.id = "import-payload-validation";
    fs.writeFileSync(file, `${JSON.stringify(theme, null, 2)}\n`, "utf8");
  }
' "$PAYLOAD_VALIDATION_STAGE/theme.json" \
  || fail "Theme ZIP failed theme.json validation."
"$NODE" "$INJECTOR" --check-payload --theme-dir "$PAYLOAD_VALIDATION_STAGE" >/dev/null \
  || fail "Theme ZIP failed theme.json or image validation."

# The publisher emits one JSON object consumed by the native menu app. It
# deduplicates semantically identical packs and never writes the active theme.
"$NODE" "$SCRIPT_DIR/publish-theme-import.mjs" "$VALIDATED_STAGE" "$THEMES_ROOT"

trap - EXIT
cleanup_import
