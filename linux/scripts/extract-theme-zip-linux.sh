#!/bin/bash
# Expand one ordinary ZIP theme package into an empty staging directory.

set -euo pipefail

ARCHIVE="${1:-}"
DESTINATION="${2:-}"
MAX_ARCHIVE_BYTES=$((32 * 1024 * 1024))
MAX_EXPANDED_BYTES=$((64 * 1024 * 1024))
MAX_ENTRIES=32
EXTRACT_ROOT=""
PROBE_COUNT_FILE=""

fail_extract() {
  printf 'ChatGPT Dream Skin: %s\n' "$*" >&2
  exit 1
}

cleanup_extract() {
  [ -z "${PROBE_COUNT_FILE:-}" ] || rm -f "$PROBE_COUNT_FILE"
  [ -z "${EXTRACT_ROOT:-}" ] || rm -rf "$EXTRACT_ROOT"
}
trap cleanup_extract EXIT

[ -n "$ARCHIVE" ] && [ -n "$DESTINATION" ] \
  || fail_extract "Usage: extract-theme-zip-linux.sh <theme.zip> <empty-stage-dir>"
[ -f "$ARCHIVE" ] || fail_extract "Theme ZIP not found: $ARCHIVE"
archive_name="$(basename "$ARCHIVE")"
archive_lower="$(printf '%s' "$archive_name" | tr '[:upper:]' '[:lower:]')"
case "$archive_lower" in
  *.zip) ;;
  *) fail_extract "Only ordinary .zip theme packages are supported; .dreamskin files are not accepted." ;;
esac

[ -d "$DESTINATION" ] || fail_extract "Theme import stage does not exist: $DESTINATION"
[ ! -L "$DESTINATION" ] || fail_extract "Theme import stage must not be a symbolic link."
[ -z "$(find "$DESTINATION" -mindepth 1 -maxdepth 1 -print -quit)" ] \
  || fail_extract "Theme import stage must be empty."

archive_bytes="$(stat -c '%s' "$ARCHIVE" 2>/dev/null || echo "")"
case "$archive_bytes" in ''|*[!0-9]*) fail_extract "Could not read theme ZIP size." ;; esac
[ "$archive_bytes" -gt 0 ] || fail_extract "Theme ZIP is empty."
[ "$archive_bytes" -le "$MAX_ARCHIVE_BYTES" ] \
  || fail_extract "Theme ZIP exceeds the 32 MB archive limit."

# Check for encrypted ZIP
unzip -t "$ARCHIVE" >/dev/null 2>&1 || fail_extract "Theme ZIP is encrypted or damaged."

# Inspect ZIP entries
entry_count="$(unzip -l "$ARCHIVE" 2>/dev/null | awk 'NR>3 && /^ *[0-9]/ {count++} END {print count+0}')"
[ "$entry_count" -gt 0 ] || fail_extract "Theme ZIP contains no entries."
[ "$entry_count" -le "$MAX_ENTRIES" ] \
  || fail_extract "Theme ZIP exceeds the $MAX_ENTRIES-entry limit."

# Validate ZIP structure and measure expanded size
unzip -l "$ARCHIVE" 2>/dev/null | awk '
  NR>3 && /^ *[0-9]/ {
    type = $4
    if (type ~ /\//) { next }
    if ($1 !~ /^[0-9]+$/) { print "invalid_size"; exit }
    total += $1
  }
  END {
    if (total > '"$MAX_EXPANDED_BYTES"') print "too_large"
    else print "ok " total
  }
' > /tmp/_zip_probe_$$ 2>/dev/null || {
  fail_extract "Theme ZIP could not be inspected."
}
probe_result="$(cat /tmp/_zip_probe_$$)"
rm -f /tmp/_zip_probe_$$
case "$probe_result" in
  invalid*) fail_extract "Theme ZIP contains invalid entry sizes." ;;
  too_large*) fail_extract "Theme ZIP exceeds the 64 MB expanded-size limit." ;;
  ok*) ;;
  *) fail_extract "Theme ZIP content is encrypted, damaged, or unreadable." ;;
esac

destination_parent="$(cd "$(dirname "$DESTINATION")" && pwd -P)"
EXTRACT_ROOT="$(mktemp -d "$destination_parent/.theme-zip-extract.XXXXXX")"
chmod 700 "$EXTRACT_ROOT"
PROBE_COUNT_FILE="$(mktemp "$EXTRACT_ROOT/.expanded-byte-count.XXXXXX")"
chmod 600 "$PROBE_COUNT_FILE"

# Measure actual expanded size using unzip -p
unzip -p "$ARCHIVE" 2>/dev/null \
  | head -c "$((MAX_EXPANDED_BYTES + 1))" \
  | wc -c > "$PROBE_COUNT_FILE" 2>/dev/null || true
probe_bytes="$(tr -d '[:space:]' < "$PROBE_COUNT_FILE")"
case "$probe_bytes" in ''|*[!0-9]*) fail_extract "Could not measure expanded theme ZIP content." ;; esac
if [ "$probe_bytes" -gt "$MAX_EXPANDED_BYTES" ]; then
  fail_extract "Theme ZIP exceeds the 64 MB expanded-size limit."
fi
rm -f "$PROBE_COUNT_FILE"
PROBE_COUNT_FILE=""

# Extract using unzip
unzip -o -q "$ARCHIVE" -d "$EXTRACT_ROOT" 2>/dev/null \
  || fail_extract "Theme ZIP extraction was blocked because an entry was unsafe or damaged."

[ -z "$(find "$EXTRACT_ROOT" -xdev -type l -print -quit)" ] \
  || fail_extract "Theme ZIP contains a symbolic link."
[ -z "$(find "$EXTRACT_ROOT" -xdev ! -type d ! -type f -print -quit)" ] \
  || fail_extract "Theme ZIP contains an unsupported filesystem entry."

# Remove macOS transport artifacts
rm -rf "$EXTRACT_ROOT/__MACOSX"
find "$EXTRACT_ROOT" -xdev -type f -name '.DS_Store' -delete 2>/dev/null || true

# Find theme root
SOURCE_ROOT=""
if [ -f "$EXTRACT_ROOT/theme.json" ]; then
  SOURCE_ROOT="$EXTRACT_ROOT"
else
  top_count=0
  while IFS= read -r -d '' item; do
    top_count=$((top_count + 1))
    if [ -d "$item" ] && [ -f "$item/theme.json" ]; then
      [ -z "$SOURCE_ROOT" ] \
        || fail_extract "Theme ZIP contains more than one candidate theme directory."
      SOURCE_ROOT="$item"
    fi
  done < <(find "$EXTRACT_ROOT" -xdev -mindepth 1 -maxdepth 1 -print0)
  [ "$top_count" -eq 1 ] && [ -n "$SOURCE_ROOT" ] \
    || fail_extract "Place theme.json and its image at ZIP root or inside one top-level theme folder."
fi

[ -z "$(find "$SOURCE_ROOT" -xdev -mindepth 1 -type d -print -quit)" ] \
  || fail_extract "The current theme format does not allow nested content directories."
source_file_count="$(find "$SOURCE_ROOT" -xdev -mindepth 1 -maxdepth 1 -type f \
  ! -name '.DS_Store' | wc -l | tr -d ' ')"
[ -f "$SOURCE_ROOT/theme.json" ] || fail_extract "Theme ZIP is missing theme.json."

if [ -f "$SOURCE_ROOT/manifest.json" ]; then
  official_backgrounds=0
  while IFS= read -r -d '' source_file; do
    source_name="$(basename "$source_file")"
    case "$source_name" in
      manifest.json|manifest.sig|theme.json|theme.css|LICENSE.txt) ;;
      background.webp|background.jpg|background.png)
        official_backgrounds=$((official_backgrounds + 1))
        ;;
      *) fail_extract "Official theme ZIP contains an unregistered file: $source_name" ;;
    esac
  done < <(find "$SOURCE_ROOT" -xdev -mindepth 1 -maxdepth 1 -type f -print0)
  [ "$official_backgrounds" -eq 1 ] \
    || fail_extract "Official theme ZIP must contain exactly one background.webp, background.jpg, or background.png."
  [ -f "$SOURCE_ROOT/theme.css" ] \
    || fail_extract "New official theme ZIP imports require theme.css and the safe-css capability."
else
  [ "$source_file_count" -eq 3 ] && [ -f "$SOURCE_ROOT/theme.css" ] \
    || fail_extract "A local simplified theme ZIP must contain exactly theme.json, theme.css, and one referenced image."
fi

while IFS= read -r -d '' source_file; do
  cp -p "$source_file" "$DESTINATION/"
done < <(find "$SOURCE_ROOT" -xdev -mindepth 1 -maxdepth 1 -type f -print0)
chmod 600 "$DESTINATION"/*

trap - EXIT
rm -rf "$EXTRACT_ROOT"
EXTRACT_ROOT=""
