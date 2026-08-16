#!/bin/bash

# Expand one ordinary ZIP theme package into an empty staging directory.
# The caller still validates theme.json and the referenced image before publish.

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
  [ -z "${PROBE_COUNT_FILE:-}" ] || /bin/rm -f "$PROBE_COUNT_FILE"
  [ -z "${EXTRACT_ROOT:-}" ] || /bin/rm -rf "$EXTRACT_ROOT"
}
trap cleanup_extract EXIT

[ -n "$ARCHIVE" ] && [ -n "$DESTINATION" ] \
  || fail_extract "Usage: extract-theme-zip-linux.sh <theme.zip> <empty-stage-dir>"
[ -f "$ARCHIVE" ] || fail_extract "Theme ZIP not found: $ARCHIVE"
archive_name="$(/usr/bin/basename "$ARCHIVE")"
archive_lower="$(LC_ALL=C /usr/bin/printf '%s' "$archive_name" | /usr/bin/tr '[:upper:]' '[:lower:]')"
case "$archive_lower" in
  *.zip) ;;
  *) fail_extract "Only ordinary .zip theme packages are supported; .dreamskin files are not accepted." ;;
esac

[ -d "$DESTINATION" ] || fail_extract "Theme import stage does not exist: $DESTINATION"
[ ! -L "$DESTINATION" ] || fail_extract "Theme import stage must not be a symbolic link."
[ -z "$(/usr/bin/find "$DESTINATION" -mindepth 1 -maxdepth 1 -print -quit)" ] \
  || fail_extract "Theme import stage must be empty."

archive_bytes="$(/usr/bin/stat -c '%s' "$ARCHIVE")"
case "$archive_bytes" in ''|*[!0-9]*) fail_extract "Could not read theme ZIP size." ;; esac
[ "$archive_bytes" -gt 0 ] || fail_extract "Theme ZIP is empty."
[ "$archive_bytes" -le "$MAX_ARCHIVE_BYTES" ] \
  || fail_extract "Theme ZIP exceeds the 32 MB archive limit."

# Read only central-directory metadata here. Content integrity is checked later
# by a bounded expansion probe, so a compression bomb cannot consume unbounded
# CPU before its declared entry count and expanded size have been rejected.
# zipinfo -v lists metadata without decrypting, so an encrypted entry is
# rejected here without ever prompting for a passphrase.
set +e
LC_ALL=C /usr/bin/zipinfo -v "$ARCHIVE" </dev/null 2>/dev/null \
  | LC_ALL=C /usr/bin/awk '
    /file security status:/ {
      value = $0
      sub(/^.*file security status:[[:space:]]*/, "", value)
      sub(/[[:space:]]*$/, "", value)
      if (value == "encrypted") encrypted = 1
    }
    END { exit encrypted ? 42 : 0 }
  '
metadata_status=("${PIPESTATUS[@]}")
set -e
[ "${metadata_status[0]:-1}" -eq 0 ] \
  || fail_extract "Theme package is not a readable ZIP archive."
case "${metadata_status[1]:-1}" in
  0) ;;
  42) fail_extract "Encrypted theme ZIP content is not supported." ;;
  *) fail_extract "Theme ZIP security metadata could not be inspected." ;;
esac
# GNU tar cannot read ZIP archives, so the directory listing uses zipinfo.
# Entry lines carry a 10-character permission column (type + mode); MS-DOS
# entries without permission bits show "?" in place of the type and are
# regular files, exactly as macOS bsdtar lists them. The name starts at $9
# (fixed perms/version/host/size/compress/method/date/time columns).
listing="$(LC_ALL=C /usr/bin/zipinfo "$ARCHIVE")" \
  || fail_extract "Theme ZIP directory could not be inspected."
[ -n "$listing" ] || fail_extract "Theme ZIP contains no entries."

summary="$(LC_ALL=C /usr/bin/printf '%s\n' "$listing" | /usr/bin/awk '
  NF && $1 ~ /^[-dl?].{9}$/ {
    count += 1
    type = substr($1, 1, 1)
    if (type == "?") type = "-"
    if (type != "-" && type != "d") unsafe = 1
    if ($4 !~ /^[0-9]+$/) invalid = 1
    total += $4
    name = $9
    for (i = 10; i <= NF; i++) name = name " " $i
    if (name ~ /(^|\/)\.\.(\/|$)/ || name ~ /^\//) unsafe_path = 1
  }
  END { printf "%d %d %d %d %d\n", count, total, unsafe, invalid, unsafe_path }
')"
read -r entry_count expanded_bytes unsafe_type invalid_size unsafe_path <<EOF
$summary
EOF
[ "$invalid_size" -eq 0 ] || fail_extract "Theme ZIP contains an unreadable entry size."
[ "$unsafe_type" -eq 0 ] \
  || fail_extract "Theme ZIP may contain only regular files and directories; links are rejected."
# Linux unzip silently strips "../" components instead of refusing the archive
# the way macOS bsdtar does, so traversal and absolute entries are rejected
# here from the declared names before any content is written.
[ "$unsafe_path" -eq 0 ] \
  || fail_extract "Theme ZIP extraction was blocked because an entry was unsafe or damaged."
[ "$entry_count" -le "$MAX_ENTRIES" ] \
  || fail_extract "Theme ZIP exceeds the 32-entry limit."
[ "$expanded_bytes" -le "$MAX_EXPANDED_BYTES" ] \
  || fail_extract "Theme ZIP exceeds the 64 MB expanded-size limit."

destination_parent="$(cd "$(dirname "$DESTINATION")" && pwd -P)"
EXTRACT_ROOT="$(/usr/bin/mktemp -d "$destination_parent/.theme-zip-extract.XXXXXX")"
/bin/chmod 700 "$EXTRACT_ROOT"
PROBE_COUNT_FILE="$(/usr/bin/mktemp "$EXTRACT_ROOT/.expanded-byte-count.XXXXXX")"
/bin/chmod 600 "$PROBE_COUNT_FILE"

# Validate CRC/encryption and measure actual output before writing archive
# content to disk. head closes after MAX+1 bytes; a compression bomb therefore
# cannot make unzip expand beyond the single-byte-over-limit proof boundary.
set +e
LC_ALL=C /usr/bin/unzip -p "$ARCHIVE" </dev/null 2>/dev/null \
  | /usr/bin/head -c "$((MAX_EXPANDED_BYTES + 1))" \
  | /usr/bin/wc -c > "$PROBE_COUNT_FILE"
probe_status=("${PIPESTATUS[@]}")
set -e
probe_bytes="$(LC_ALL=C /usr/bin/tr -d '[:space:]' < "$PROBE_COUNT_FILE")"
case "$probe_bytes" in ''|*[!0-9]*) fail_extract "Could not measure expanded theme ZIP content." ;; esac
if [ "$probe_bytes" -gt "$MAX_EXPANDED_BYTES" ]; then
  fail_extract "Theme ZIP exceeds the 64 MB expanded-size limit."
fi
[ "${probe_status[0]:-1}" -eq 0 ] \
  && [ "${probe_status[1]:-1}" -eq 0 ] \
  && [ "${probe_status[2]:-1}" -eq 0 ] \
  || fail_extract "Theme ZIP content is encrypted, damaged, or unreadable."
/bin/rm -f "$PROBE_COUNT_FILE"
PROBE_COUNT_FILE=""

# macOS bsdtar/libarchive refuses absolute paths and .. components itself; the
# Linux listing pass above rejects those declared names first, and unzip runs
# as the current user into this private directory without restoring ownership.
# Symlinks are rejected by the listing pass and re-checked below.
LC_ALL=C /usr/bin/unzip -q -d "$EXTRACT_ROOT" "$ARCHIVE" </dev/null >/dev/null \
  || fail_extract "Theme ZIP extraction was blocked because an entry was unsafe or damaged."

[ -z "$(/usr/bin/find "$EXTRACT_ROOT" -xdev -type l -print -quit)" ] \
  || fail_extract "Theme ZIP contains a symbolic link."
[ -z "$(/usr/bin/find "$EXTRACT_ROOT" -xdev ! -type d ! -type f -print -quit)" ] \
  || fail_extract "Theme ZIP contains an unsupported filesystem entry."

# macOS Finder or Windows Explorer may add these transport-only entries.
# They are never theme content.
/bin/rm -rf "$EXTRACT_ROOT/__MACOSX"
/usr/bin/find "$EXTRACT_ROOT" -xdev -type f -name '.DS_Store' -delete

actual_count=0
actual_bytes=0
while IFS= read -r -d '' entry; do
  actual_count=$((actual_count + 1))
  [ "$actual_count" -le "$MAX_ENTRIES" ] \
    || fail_extract "Theme ZIP exceeds the 32-entry limit after extraction."
  if [ -f "$entry" ]; then
    relative="${entry#"$EXTRACT_ROOT"/}"
    if LC_ALL=C /usr/bin/printf '%s' "$relative" | LC_ALL=C /usr/bin/grep -q '[[:cntrl:]]'; then
      fail_extract "Theme ZIP contains a control character in a filename."
    fi
    entry_bytes="$(/usr/bin/stat -c '%s' "$entry")"
    actual_bytes=$((actual_bytes + entry_bytes))
    [ "$actual_bytes" -le "$MAX_EXPANDED_BYTES" ] \
      || fail_extract "Theme ZIP exceeds the 64 MB expanded-size limit."
    lower="$(LC_ALL=C /usr/bin/printf '%s' "$relative" | /usr/bin/tr '[:upper:]' '[:lower:]')"
    case "$lower" in
      *.zip|*.dreamskin|*.7z|*.rar|*.tar|*.tar.gz|*.tgz|*.gz|*.bz2|*.xz)
        fail_extract "Nested compressed archives are not allowed inside a theme ZIP."
        ;;
    esac
  fi
done < <(/usr/bin/find "$EXTRACT_ROOT" -xdev -mindepth 1 -print0)

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
  done < <(/usr/bin/find "$EXTRACT_ROOT" -xdev -mindepth 1 -maxdepth 1 -print0)
  [ "$top_count" -eq 1 ] && [ -n "$SOURCE_ROOT" ] \
    || fail_extract "Place theme.json and its image at ZIP root or inside one top-level theme folder."
fi

[ -z "$(/usr/bin/find "$SOURCE_ROOT" -xdev -mindepth 1 -type d -print -quit)" ] \
  || fail_extract "The current theme format does not allow nested content directories."
source_file_count="$(/usr/bin/find "$SOURCE_ROOT" -xdev -mindepth 1 -maxdepth 1 -type f \
  ! -name '.DS_Store' | /usr/bin/wc -l | /usr/bin/tr -d ' ')"
[ -f "$SOURCE_ROOT/theme.json" ] || fail_extract "Theme ZIP is missing theme.json."

if [ -f "$SOURCE_ROOT/manifest.json" ]; then
  official_backgrounds=0
  while IFS= read -r -d '' source_file; do
    source_name="$(/usr/bin/basename "$source_file")"
    case "$source_name" in
      manifest.json|manifest.sig|theme.json|theme.css|LICENSE.txt) ;;
      background.webp|background.jpg|background.png)
        official_backgrounds=$((official_backgrounds + 1))
        ;;
      *) fail_extract "Official theme ZIP contains an unregistered file: $source_name" ;;
    esac
  done < <(/usr/bin/find "$SOURCE_ROOT" -xdev -mindepth 1 -maxdepth 1 -type f -print0)
  [ "$official_backgrounds" -eq 1 ] \
    || fail_extract "Official theme ZIP must contain exactly one background.webp, background.jpg, or background.png."
  [ -f "$SOURCE_ROOT/theme.css" ] \
    || fail_extract "New official theme ZIP imports require theme.css and the safe-css capability."
else
  [ "$source_file_count" -eq 3 ] && [ -f "$SOURCE_ROOT/theme.css" ] \
    || fail_extract "A local simplified theme ZIP must contain exactly theme.json, theme.css, and one referenced image."
fi

while IFS= read -r -d '' source_file; do
  /bin/cp -p "$source_file" "$DESTINATION/"
done < <(/usr/bin/find "$SOURCE_ROOT" -xdev -mindepth 1 -maxdepth 1 -type f -print0)
/bin/chmod 600 "$DESTINATION"/*

trap - EXIT
/bin/rm -rf "$EXTRACT_ROOT"
EXTRACT_ROOT=""
