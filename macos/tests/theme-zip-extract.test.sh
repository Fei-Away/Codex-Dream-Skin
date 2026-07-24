#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
EXTRACTOR="$ROOT/scripts/extract-theme-zip-macos.sh"
TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-zip-extract.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

expect_rejected() {
  local archive="$1"
  local label="$2"
  local destination="$TMP/rejected-$label"
  /bin/mkdir -p "$destination"
  if "$EXTRACTOR" "$archive" "$destination" >/dev/null 2>&1; then
    printf 'Theme ZIP extractor unexpectedly accepted %s.\n' "$label" >&2
    exit 1
  fi
  if [ -n "$(/usr/bin/find "$destination" -mindepth 1 -print -quit)" ]; then
    printf 'Rejected theme ZIP wrote staged output for %s.\n' "$label" >&2
    exit 1
  fi
}

make_theme_json() {
  /usr/bin/printf '%s\n' \
    '{"schemaVersion":1,"id":"test-theme","name":"Test Theme","image":"background.jpg"}' \
    > "$1"
}

/bin/mkdir -p "$TMP/root-pack" "$TMP/root-out"
make_theme_json "$TMP/root-pack/theme.json"
/usr/bin/printf 'fake-image-bytes\n' > "$TMP/root-pack/background.jpg"
(
  cd "$TMP/root-pack"
  /usr/bin/zip -q "$TMP/root.zip" theme.json background.jpg
)
"$EXTRACTOR" "$TMP/root.zip" "$TMP/root-out"
/usr/bin/cmp -s "$TMP/root-pack/theme.json" "$TMP/root-out/theme.json"
/usr/bin/cmp -s "$TMP/root-pack/background.jpg" "$TMP/root-out/background.jpg"

/bin/mkdir -p "$TMP/wrapped/theme-folder" "$TMP/wrapped-out"
make_theme_json "$TMP/wrapped/theme-folder/theme.json"
/bin/cp "$TMP/root-pack/background.jpg" "$TMP/wrapped/theme-folder/background.jpg"
(
  cd "$TMP/wrapped"
  /usr/bin/zip -qr "$TMP/wrapped.zip" theme-folder
)
"$EXTRACTOR" "$TMP/wrapped.zip" "$TMP/wrapped-out"
/usr/bin/cmp -s "$TMP/wrapped/theme-folder/theme.json" "$TMP/wrapped-out/theme.json"

/bin/mkdir -p "$TMP/official-pack" "$TMP/official-out"
make_theme_json "$TMP/official-pack/theme.json"
/bin/cp "$TMP/root-pack/background.jpg" "$TMP/official-pack/background.jpg"
/usr/bin/printf '%s\n' '{"packageVersion":1}' > "$TMP/official-pack/manifest.json"
(
  cd "$TMP/official-pack"
  /usr/bin/zip -q "$TMP/official.zip" manifest.json theme.json background.jpg
)
"$EXTRACTOR" "$TMP/official.zip" "$TMP/official-out"
/usr/bin/cmp -s "$TMP/official-pack/manifest.json" "$TMP/official-out/manifest.json"

/bin/cp "$TMP/root.zip" "$TMP/legacy.dreamskin"
expect_rejected "$TMP/legacy.dreamskin" dreamskin-extension

/bin/mkdir -p "$TMP/nested"
make_theme_json "$TMP/nested/theme.json"
/usr/bin/printf 'nested\n' > "$TMP/nested/payload.txt"
(
  cd "$TMP/nested"
  /usr/bin/zip -q inner.zip payload.txt
  /usr/bin/zip -q "$TMP/nested.zip" theme.json inner.zip
)
expect_rejected "$TMP/nested.zip" nested-archive

/bin/mkdir -p "$TMP/link-pack"
make_theme_json "$TMP/link-pack/theme.json"
/bin/ln -s "$TMP/root-pack/background.jpg" "$TMP/link-pack/background.jpg"
(
  cd "$TMP/link-pack"
  /usr/bin/zip -yq "$TMP/link.zip" theme.json background.jpg
)
expect_rejected "$TMP/link.zip" symbolic-link

/bin/mkdir -p "$TMP/traversal/work"
/usr/bin/printf 'escape\n' > "$TMP/traversal/outside.jpg"
(
  cd "$TMP/traversal/work"
  /usr/bin/zip -q "$TMP/traversal.zip" ../outside.jpg
)
expect_rejected "$TMP/traversal.zip" path-traversal

/bin/mkdir -p "$TMP/large-pack"
make_theme_json "$TMP/large-pack/theme.json"
/usr/sbin/mkfile 65m "$TMP/large-pack/background.jpg"
(
  cd "$TMP/large-pack"
  /usr/bin/zip -q "$TMP/expanded-limit.zip" theme.json background.jpg
)
expect_rejected "$TMP/expanded-limit.zip" expanded-size

(
  cd "$TMP/root-pack"
  /usr/bin/zip -P test-password -q "$TMP/encrypted.zip" theme.json background.jpg
)
encrypted_destination="$TMP/rejected-encrypted-content"
/bin/mkdir -p "$encrypted_destination"
if encrypted_output="$($EXTRACTOR "$TMP/encrypted.zip" "$encrypted_destination" 2>&1)"; then
  printf 'Theme ZIP extractor unexpectedly accepted encrypted content.\n' >&2
  exit 1
fi
case "$encrypted_output" in
  *'Enter passphrase:'*) printf 'Encrypted ZIP reached an interactive passphrase prompt.\n' >&2; exit 1 ;;
esac
[ -z "$(/usr/bin/find "$encrypted_destination" -mindepth 1 -print -quit)" ] \
  || { printf 'Rejected encrypted ZIP wrote staged output.\n' >&2; exit 1; }

(
  cd "$TMP/root-pack"
  /usr/bin/zip -0q "$TMP/damaged-crc.zip" theme.json background.jpg
)
LC_ALL=C LANG=C /usr/bin/perl -0777 -pi -e 's/fake-image-bytes/fake-Xmage-bytes/' "$TMP/damaged-crc.zip"
expect_rejected "$TMP/damaged-crc.zip" damaged-crc

/bin/mkdir -p "$TMP/count-pack"
for index in $(/usr/bin/jot 33 1); do
  /usr/bin/printf '%s\n' "$index" > "$TMP/count-pack/file-$index.txt"
done
(
  cd "$TMP/count-pack"
  /usr/bin/zip -q "$TMP/entry-limit.zip" ./*.txt
)
expect_rejected "$TMP/entry-limit.zip" entry-count

/bin/mkdir -p "$TMP/unknown-pack"
/bin/cp "$TMP/official-pack/"* "$TMP/unknown-pack/"
/usr/bin/printf 'unknown\n' > "$TMP/unknown-pack/notes.txt"
(
  cd "$TMP/unknown-pack"
  /usr/bin/zip -q "$TMP/unknown.zip" ./*
)
expect_rejected "$TMP/unknown.zip" unregistered-official-file

printf 'PASS: macOS ZIP extraction rejects links, traversal, nesting, legacy extensions, and archive abuse.\n'
