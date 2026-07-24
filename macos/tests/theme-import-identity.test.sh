#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
TMP="$(/usr/bin/mktemp -d /tmp/dreamskin-import-identity.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

ARCHIVE="$TMP/community.zip"
/usr/bin/printf 'PK\003\004identity-fixture' > "$ARCHIVE"
BYTES="$(/usr/bin/stat -f '%z' "$ARCHIVE")"
WRONG_SHA="0000000000000000000000000000000000000000000000000000000000000000"

if /usr/bin/env HOME="$TMP/home" NODE="$NODE" \
  "$ROOT/scripts/import-theme-zip-macos.sh" --file "$ARCHIVE" \
  --expected-sha256 "$WRONG_SHA" --expected-bytes "$BYTES" \
  >"$TMP/hash-output" 2>&1; then
  printf 'community import unexpectedly accepted a mismatched approved SHA-256.\n' >&2
  exit 1
fi
/usr/bin/grep -F -q 'private import snapshot no longer matches the approved package SHA-256' \
  "$TMP/hash-output"

ACTUAL_SHA="$(LC_ALL=C /usr/bin/shasum -a 256 "$ARCHIVE" | /usr/bin/awk '{print $1}')"
if /usr/bin/env HOME="$TMP/home" NODE="$NODE" \
  "$ROOT/scripts/import-theme-zip-macos.sh" --file "$ARCHIVE" \
  --expected-sha256 "$ACTUAL_SHA" --expected-bytes "$((BYTES + 1))" \
  >"$TMP/bytes-output" 2>&1; then
  printf 'community import unexpectedly accepted a mismatched approved byte count.\n' >&2
  exit 1
fi
/usr/bin/grep -F -q 'private import snapshot no longer matches the approved package byte count' \
  "$TMP/bytes-output"

STATE_ROOT="$TMP/home/Library/Application Support/CodexDreamSkinStudio"
[ -z "$(/usr/bin/find "$STATE_ROOT" -maxdepth 1 -name '.theme-import-work.*' -print -quit 2>/dev/null)" ]
printf 'PASS: community import rechecks approved bytes and SHA-256 on its private ZIP snapshot.\n'
