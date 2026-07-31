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

PROJECT_ROOT="$(cd "$ROOT/.." && pwd -P)"
FALLBACK_HOME="$TMP/fallback-home"
FALLBACK_STATE_ROOT="$FALLBACK_HOME/Library/Application Support/CodexDreamSkinStudio"

make_fallback_archive() {
  local source_dir="$1"
  local archive_path="$2"
  local id_kind="$3"
  local invalid_appearance="${4:-false}"
  /bin/mkdir -p "$source_dir"
  /bin/cp "$PROJECT_ROOT/docs/images/gallery/skin-01.jpg" "$source_dir/background.jpg"
  "$NODE" -e '
    const fs = require("node:fs");
    const [file, idKind, invalidAppearance] = process.argv.slice(1);
    const theme = {
      schemaVersion: 1,
      name: "Cross-platform & '\'' Fallback ID",
      image: "background.jpg",
      appearance: invalidAppearance === "true" ? 42 : "auto",
      art: { focusX: 1e-7, safeArea: "auto", taskMode: "auto" },
      quote: "CROSS PLATFORM FALLBACK",
    };
    if (idKind === "non-string") theme.id = 42;
    fs.writeFileSync(file, `${JSON.stringify(theme, null, 2)}\n`, "utf8");
  ' "$source_dir/theme.json" "$id_kind" "$invalid_appearance"
  /usr/bin/printf '%s\n' \
    '[data-ds-part="root"] { color: var(--ds-theme-color-text); }' \
    > "$source_dir/theme.css"
  (
    cd "$source_dir"
    /usr/bin/zip -q "$archive_path" theme.json theme.css background.jpg
  )
}

MISSING_ARCHIVE="$TMP/missing-id.zip"
NON_STRING_ARCHIVE="$TMP/non-string-id.zip"
INVALID_ARCHIVE="$TMP/non-string-invalid-field.zip"
make_fallback_archive "$TMP/missing-id-source" "$MISSING_ARCHIVE" missing
make_fallback_archive "$TMP/non-string-id-source" "$NON_STRING_ARCHIVE" non-string
make_fallback_archive "$TMP/non-string-invalid-source" "$INVALID_ARCHIVE" non-string true

/usr/bin/env HOME="$FALLBACK_HOME" NODE="$NODE" \
  "$ROOT/scripts/import-theme-zip-macos.sh" --file "$MISSING_ARCHIVE" \
  >"$TMP/missing-id-output"
MISSING_RESULT="$("$NODE" -e '
  const fs = require("node:fs");
  const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(`${value.status}:${value.id}`);
' "$TMP/missing-id-output")"
[ "$MISSING_RESULT" = 'imported:import-b009c788e6a9307c35ed281e' ] || {
  printf 'missing source theme id did not use the stable cross-platform fallback id.\n' >&2
  exit 1
}

/usr/bin/env HOME="$FALLBACK_HOME" NODE="$NODE" \
  "$ROOT/scripts/import-theme-zip-macos.sh" --file "$NON_STRING_ARCHIVE" \
  >"$TMP/non-string-id-output"
NON_STRING_RESULT="$("$NODE" -e '
  const fs = require("node:fs");
  const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(`${value.status}:${value.id}`);
' "$TMP/non-string-id-output")"
[ "$NON_STRING_RESULT" = 'duplicate:import-b009c788e6a9307c35ed281e' ] || {
  printf 'semantically identical non-string source id did not resolve as a stable duplicate.\n' >&2
  exit 1
}

if /usr/bin/env HOME="$FALLBACK_HOME" NODE="$NODE" \
  "$ROOT/scripts/import-theme-zip-macos.sh" --file "$INVALID_ARCHIVE" \
  >"$TMP/non-string-invalid-output" 2>&1; then
  printf 'non-string source id bypassed another invalid theme payload field.\n' >&2
  exit 1
fi
/usr/bin/grep -F -q 'Theme ZIP failed theme.json or image validation' \
  "$TMP/non-string-invalid-output"

[ -z "$(/usr/bin/find "$FALLBACK_STATE_ROOT" -maxdepth 1 -name '.theme-import-work.*' -print -quit 2>/dev/null)" ]
[ -z "$(/usr/bin/find "$FALLBACK_STATE_ROOT/themes" -maxdepth 1 -name '.theme-*' -print -quit 2>/dev/null)" ]
[ "$(/usr/bin/find "$FALLBACK_STATE_ROOT/themes" -mindepth 1 -maxdepth 1 -type d ! -name '.*' | /usr/bin/wc -l | /usr/bin/tr -d ' ')" = 1 ]

printf 'PASS: community import rechecks package identity and preserves stable fallback IDs.\n'
