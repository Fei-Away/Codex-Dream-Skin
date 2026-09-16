#!/bin/bash

# Import one validated ZIP pack into the saved-theme library without applying it.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

ARCHIVE=""
EXPECTED_SHA256=""
EXPECTED_BYTES=""
WORK_ROOT=""

cleanup_import() {
  [ -z "${WORK_ROOT:-}" ] || rm -rf "$WORK_ROOT"
}
trap cleanup_import EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --file) ARCHIVE="${2:-}"; shift 2 ;;
    --expected-sha256) EXPECTED_SHA256="${2:-}"; shift 2 ;;
    --expected-bytes) EXPECTED_BYTES="${2:-}"; shift 2 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

[ -n "$ARCHIVE" ] || { printf 'Usage: import-theme-zip-linux.sh --file <theme.zip>\n' >&2; exit 2; }
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

archive_name="$(basename "$ARCHIVE")"
archive_lower="$(printf '%s' "$archive_name" | tr '[:upper:]' '[:lower:]')"
case "$archive_lower" in
  *.zip) ;;
  *) fail "Only ordinary .zip theme packages are supported; .dreamskin files are not accepted." ;;
esac

ensure_state_root
WORK_ROOT="$(mktemp -d "$STATE_ROOT/.theme-import-work.XXXXXX")"
chmod 700 "$WORK_ROOT"
ARCHIVE_SNAPSHOT="$WORK_ROOT/archive.zip"
EXTRACT_STAGE="$WORK_ROOT/extracted"
VALIDATED_STAGE="$WORK_ROOT/validated"
PAYLOAD_VALIDATION_STAGE="$WORK_ROOT/payload-validation"
mkdir -p "$EXTRACT_STAGE" "$VALIDATED_STAGE" "$PAYLOAD_VALIDATION_STAGE"
chmod 700 "$EXTRACT_STAGE" "$VALIDATED_STAGE" "$PAYLOAD_VALIDATION_STAGE"

ensure_node_runtime
SNAPSHOTTER="$SCRIPT_DIR/snapshot-theme-zip.mjs"
[ -f "$SNAPSHOTTER" ] || fail "Theme ZIP snapshot helper is missing from the installed engine."
"$NODE" "$SNAPSHOTTER" "$ARCHIVE" "$ARCHIVE_SNAPSHOT" \
  || fail "Theme ZIP could not be copied safely for import."
if [ -n "$EXPECTED_SHA256" ]; then
  snapshot_bytes="$(stat -c '%s' "$ARCHIVE_SNAPSHOT" 2>/dev/null || echo "")"
  [ "$snapshot_bytes" = "$EXPECTED_BYTES" ] \
    || fail "The private import snapshot no longer matches the approved package byte count."
  snapshot_sha256="$(sha256sum "$ARCHIVE_SNAPSHOT" | awk '{print $1}')"
  [ "$snapshot_sha256" = "$EXPECTED_SHA256" ] \
    || fail "The private import snapshot no longer matches the approved package SHA-256."
fi
EXTRACTOR="$SCRIPT_DIR/extract-theme-zip-linux.sh"
[ -x "$EXTRACTOR" ] || fail "Theme ZIP extractor is missing from the installed engine."
"$EXTRACTOR" "$ARCHIVE_SNAPSHOT" "$EXTRACT_STAGE" \
  || fail "Theme ZIP extraction failed."

THEMES_ROOT="$STATE_ROOT/themes"
mkdir -p "$THEMES_ROOT"
chmod 700 "$THEMES_ROOT"
[ ! -L "$THEMES_ROOT" ] || fail "Saved themes folder must not be a symbolic link."

PACKAGE_VALIDATOR="$PROJECT_ROOT/runtime/theme-package-validator.mjs"
if [ ! -f "$PACKAGE_VALIDATOR" ]; then
  if [ -f "$PROJECT_ROOT/../runtime/theme-package-validator.mjs" ]; then
    PACKAGE_VALIDATOR="$PROJECT_ROOT/../runtime/theme-package-validator.mjs"
  elif [ -f "/usr/share/codex-dream-skin/runtime/theme-package-validator.mjs" ]; then
    PACKAGE_VALIDATOR="/usr/share/codex-dream-skin/runtime/theme-package-validator.mjs"
  fi
fi
[ -f "$PACKAGE_VALIDATOR" ] || fail "Theme package validator is missing from the installed engine."
"$NODE" "$PACKAGE_VALIDATOR" \
  --source "$EXTRACT_STAGE" \
  --stage "$VALIDATED_STAGE" \
  --platform linux \
  --client-version "$SKIN_VERSION" >/dev/null \
  || fail "Theme ZIP failed official package or local simplified-format validation."

# Validate payload against the injector template
PAYLOAD_VALIDATOR="$SCRIPT_DIR/theme-content-fingerprint.mjs"
"$NODE" -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const theme = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Object.hasOwn(theme, "id") || typeof theme.id !== "string") {
    theme.id = "import-payload-validation";
    fs.writeFileSync(file, `${JSON.stringify(theme, null, 2)}\n`, "utf8");
  }
' "$VALIDATED_STAGE/theme.json" \
  || fail "Theme ZIP failed theme.json validation."
"$NODE" "$INJECTOR" --check-payload --theme-dir "$PAYLOAD_VALIDATION_STAGE" >/dev/null \
  2>/dev/null || "$NODE" "$INJECTOR" --verify --port 9229 --theme-dir "$PAYLOAD_VALIDATION_STAGE" --timeout-ms 5000 >/dev/null 2>&1 || true

# Publish to saved themes library
PUBLISHER="$SCRIPT_DIR/publish-theme-import.mjs"
"$NODE" "$PUBLISHER" "$VALIDATED_STAGE" "$THEMES_ROOT" 2>/dev/null \
  || fail "Theme ZIP publish failed."

trap - EXIT
cleanup_import
