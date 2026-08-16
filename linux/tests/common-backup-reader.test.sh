#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$ROOT/scripts/common-linux.sh"

TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-backup-reader.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT
THEME_BACKUP_PATH="$TMP/theme-backup.json"

expect_present() {
  local label="$1"
  backup_value_present appearanceTheme && return 0
  printf 'backup_value_present (%s): expected a recorded value, got none.\n' "$label" >&2
  exit 1
}

expect_absent() {
  local label="$1"
  backup_value_present appearanceTheme || return 0
  printf 'backup_value_present (%s): expected no recorded value, but one matched.\n' "$label" >&2
  exit 1
}

# theme-config.mjs pretty-prints theme-backup.json (2-space indent, one key
# per line), so the anchor expects the key at the start of a line. Real
# recorded lines carry escaped quotes inside the value; presence must still
# match them.
/usr/bin/printf '%s\n' \
  '{' \
  '  "appearanceTheme": "appearanceDarkCodeThemeId = \"night-owl\"",' \
  '  "appearanceDarkCodeThemeId": "night-owl"' \
  '}' \
  > "$THEME_BACKUP_PATH"
expect_present escaped-quote-value

# The sibling key must not satisfy a query for appearanceTheme alone.
/usr/bin/printf '%s\n' \
  '{' \
  '  "appearanceDarkCodeThemeId": "night-owl"' \
  '}' \
  > "$THEME_BACKUP_PATH"
expect_absent prefix-sibling-key

# A recorded null means "no override recorded", exactly like a missing field.
/usr/bin/printf '%s\n' \
  '{' \
  '  "appearanceTheme": null' \
  '}' \
  > "$THEME_BACKUP_PATH"
expect_absent null-value

/usr/bin/printf '%s\n' \
  '{' \
  '  "otherField": "x"' \
  '}' \
  > "$THEME_BACKUP_PATH"
expect_absent absent-field

# Malformed lines (unquoted key, missing value) must never match.
/usr/bin/printf '%s\n' 'appearanceTheme: "unquoted-key"' > "$THEME_BACKUP_PATH"
expect_absent malformed-unquoted-key
/usr/bin/printf '%s\n' '"appearanceTheme":' > "$THEME_BACKUP_PATH"
expect_absent malformed-missing-value

# A missing backup file is absent, not an error.
/bin/rm -f "$THEME_BACKUP_PATH"
expect_absent missing-backup-file

printf 'PASS: common backup reader distinguishes recorded, null, and missing config values.\n'
