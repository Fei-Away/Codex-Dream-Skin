#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
EXTRACTOR="$ROOT/scripts/extract-theme-zip-linux.sh"
NODE="${NODE:-$(command -v node)}"
[ -x "$NODE" ] || { printf 'node was not found. Install nodejs (>= 18) first.\n' >&2; exit 1; }
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

make_safe_css() {
  /usr/bin/printf '%s\n' \
    '[data-ds-part="root"] { color: var(--ds-theme-color-text); }' \
    > "$1"
}

# zip reads files at creation time, so a mode-0 entry cannot be zipped
# directly; rewrite the named entries' external attributes in the central
# directory afterwards. unzip then restores the stored mode-0 permissions.
# Only the permission bits are zeroed (the Unix regular-file type bit stays),
# matching what a real archive with a 000-mode file would carry.
zero_zip_entries() {
  local archive="$1"
  shift
  "$NODE" -e '
const fs = require("node:fs");
const [archive, ...targets] = process.argv.slice(1);
const bytes = fs.readFileSync(archive);
for (let e = 0; e + 46 <= bytes.length; e++) {
  if (bytes.readUInt32LE(e) !== 0x02014b50) continue;
  const madeBy = bytes.readUInt16LE(e + 4);
  if ((madeBy >> 8) !== 3) continue; // unix host (Info-ZIP writes 0x031e)
  const nameLen = bytes.readUInt16LE(e + 28);
  const extraLen = bytes.readUInt16LE(e + 30);
  const commentLen = bytes.readUInt16LE(e + 32);
  if (nameLen < 1 || nameLen > 200 || e + 46 + nameLen + extraLen + commentLen > bytes.length) continue;
  const name = bytes.subarray(e + 46, e + 46 + nameLen).toString("utf8");
  if (targets.includes(name)) bytes.writeUInt32LE(0x80000000, e + 38); // S_IFREG | mode 000
}
fs.writeFileSync(archive, bytes);
' "$archive" "$@"
}

/bin/mkdir -p "$TMP/root-pack" "$TMP/root-out"
make_theme_json "$TMP/root-pack/theme.json"
make_safe_css "$TMP/root-pack/theme.css"
/usr/bin/printf 'fake-image-bytes\n' > "$TMP/root-pack/background.jpg"
(
  cd "$TMP/root-pack"
  /usr/bin/zip -q "$TMP/root.zip" theme.json theme.css background.jpg
)
"$EXTRACTOR" "$TMP/root.zip" "$TMP/root-out"
/usr/bin/cmp -s "$TMP/root-pack/theme.json" "$TMP/root-out/theme.json"
/usr/bin/cmp -s "$TMP/root-pack/theme.css" "$TMP/root-out/theme.css"
/usr/bin/cmp -s "$TMP/root-pack/background.jpg" "$TMP/root-out/background.jpg"

/bin/mkdir -p "$TMP/wrapped/theme-folder" "$TMP/wrapped-out"
make_theme_json "$TMP/wrapped/theme-folder/theme.json"
/bin/cp "$TMP/root-pack/theme.css" "$TMP/wrapped/theme-folder/theme.css"
/bin/cp "$TMP/root-pack/background.jpg" "$TMP/wrapped/theme-folder/background.jpg"
(
  cd "$TMP/wrapped"
  /usr/bin/zip -qr "$TMP/wrapped.zip" theme-folder
)
"$EXTRACTOR" "$TMP/wrapped.zip" "$TMP/wrapped-out"
/usr/bin/cmp -s "$TMP/wrapped/theme-folder/theme.json" "$TMP/wrapped-out/theme.json"

/bin/mkdir -p "$TMP/official-pack" "$TMP/official-out"
make_theme_json "$TMP/official-pack/theme.json"
/bin/cp "$TMP/root-pack/theme.css" "$TMP/official-pack/theme.css"
/bin/cp "$TMP/root-pack/background.jpg" "$TMP/official-pack/background.jpg"
/usr/bin/printf '%s\n' '{"packageVersion":1}' > "$TMP/official-pack/manifest.json"
(
  cd "$TMP/official-pack"
  /usr/bin/zip -q "$TMP/official.zip" manifest.json theme.json theme.css background.jpg
)
"$EXTRACTOR" "$TMP/official.zip" "$TMP/official-out"
/usr/bin/cmp -s "$TMP/official-pack/manifest.json" "$TMP/official-out/manifest.json"

(
  cd "$TMP/official-pack"
  /usr/bin/zip -q "$TMP/official-without-css.zip" manifest.json theme.json background.jpg
)
expect_rejected "$TMP/official-without-css.zip" official-without-css

(
  cd "$TMP/root-pack"
  /usr/bin/zip -q "$TMP/simple-without-css.zip" theme.json background.jpg
)
expect_rejected "$TMP/simple-without-css.zip" simple-without-css

# unzip restores stored Unix modes. A valid pack whose theme.json is stored
# mode-0 must still import cleanly (the extractor normalizes modes like
# bsdtar's --no-same-permissions), with exactly three staged files and no
# partial output.
/bin/mkdir -p "$TMP/mode-pack" "$TMP/mode-mixed-out"
make_theme_json "$TMP/mode-pack/theme.json"
/bin/cp "$TMP/root-pack/theme.css" "$TMP/mode-pack/theme.css"
/bin/cp "$TMP/root-pack/background.jpg" "$TMP/mode-pack/background.jpg"
(
  cd "$TMP/mode-pack"
  /usr/bin/zip -q "$TMP/mode-mixed.zip" theme.json theme.css background.jpg
)
zero_zip_entries "$TMP/mode-mixed.zip" theme.json
"$EXTRACTOR" "$TMP/mode-mixed.zip" "$TMP/mode-mixed-out"
/usr/bin/cmp -s "$TMP/mode-pack/theme.json" "$TMP/mode-mixed-out/theme.json"
/usr/bin/cmp -s "$TMP/mode-pack/theme.css" "$TMP/mode-mixed-out/theme.css"
/usr/bin/cmp -s "$TMP/mode-pack/background.jpg" "$TMP/mode-mixed-out/background.jpg"
[ "$(/usr/bin/find "$TMP/mode-mixed-out" -mindepth 1 -maxdepth 1 -type f | /usr/bin/wc -l | /usr/bin/tr -d ' ')" = 3 ] \
  || { printf 'Mode-0 pack staged extra or partial output.\n' >&2; exit 1; }

# A rejected all-mode-0 pack must leave its destination completely empty;
# mode-0 files must not be able to hide partial staging behind a failed copy.
/bin/mkdir -p "$TMP/mode-zero-pack"
make_theme_json "$TMP/mode-zero-pack/theme.json"
/usr/bin/printf 'img\n' > "$TMP/mode-zero-pack/background.jpg"
(
  cd "$TMP/mode-zero-pack"
  /usr/bin/zip -q "$TMP/mode-zero.zip" theme.json background.jpg
)
zero_zip_entries "$TMP/mode-zero.zip" theme.json background.jpg
expect_rejected "$TMP/mode-zero.zip" mode-zero-missing-css

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

/bin/mkdir -p "$TMP/traversal"
/usr/bin/printf 'escape\n' > "$TMP/traversal/outside.jpg"
# Info-ZIP zip refuses to store "../" entries on Linux, so the traversal
# fixture is written directly in the ZIP container format with node. The
# assertion below still requires the extractor to reject the archive before
# staging anything.
"$NODE" -e '
const fs = require("node:fs");
function crc32(buf) { let c; const table = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; } let crc = 0xffffffff; for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
const [archive, payloadFile] = process.argv.slice(1);
const name = Buffer.from("../outside.jpg", "utf8");
const data = fs.readFileSync(payloadFile);
const crc = crc32(data);
const local = Buffer.alloc(30);
local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
local.writeUInt16LE(0, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
const central = Buffer.alloc(46);
central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6);
central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(crc, 14);
central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
central.writeUInt16LE(name.length, 28);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
end.writeUInt32LE(central.length + name.length, 12);
end.writeUInt32LE(local.length + name.length + data.length, 16);
fs.writeFileSync(archive, Buffer.concat([local, name, data, central, name, end]));
' "$TMP/traversal.zip" "$TMP/traversal/outside.jpg"
expect_rejected "$TMP/traversal.zip" path-traversal

# macOS used mkfile to preallocate the over-limit fixture; Linux truncate
# creates the same 65 MB sparse file without a macOS-only tool.
/bin/mkdir -p "$TMP/large-pack"
make_theme_json "$TMP/large-pack/theme.json"
/usr/bin/truncate -s 65m "$TMP/large-pack/background.jpg"
(
  cd "$TMP/large-pack"
  /usr/bin/zip -q "$TMP/expanded-limit.zip" theme.json background.jpg
)
expect_rejected "$TMP/expanded-limit.zip" expanded-size

(
  cd "$TMP/root-pack"
  /usr/bin/zip -P test-password -q "$TMP/encrypted.zip" theme.json theme.css background.jpg
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
  /usr/bin/zip -0q "$TMP/damaged-crc.zip" theme.json theme.css background.jpg
)
LC_ALL=C LANG=C /usr/bin/perl -0777 -pi -e 's/fake-image-bytes/fake-Xmage-bytes/' "$TMP/damaged-crc.zip"
expect_rejected "$TMP/damaged-crc.zip" damaged-crc

/bin/mkdir -p "$TMP/count-pack"
for index in $(/usr/bin/seq 33); do
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

printf 'PASS: Linux ZIP extraction rejects links, traversal, nesting, legacy extensions, and archive abuse.\n'
