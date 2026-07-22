#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
OUTPUT="${1:-$ROOT/menubar-app/Resources/DreamSkin.icns}"
TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-icon.XXXXXX)"
# Preserve the real exit status: with a plain cleanup trap, bash 3.2 reports
# the trap command's status instead, so fatal errors leave exit code 0 and
# the DMG build keeps going without an icon.
trap 'status=$?; /bin/rm -rf "$TMP"; exit "$status"' EXIT

ICONSET="$TMP/DreamSkin.iconset"
SOURCE="$TMP/icon-1024.png"
/bin/mkdir -p "$ICONSET" "$(dirname "$OUTPUT")"
# No array here: expanding an empty array under `set -u` is fatal on the
# /bin/bash 3.2 this shebang resolves to.
if [ -n "${DREAMSKIN_SDK:-}" ]; then
  /usr/bin/xcrun swift -sdk "$DREAMSKIN_SDK" \
    "$ROOT/menubar-app/Tools/generate-icon.swift" "$SOURCE"
else
  /usr/bin/xcrun swift \
    "$ROOT/menubar-app/Tools/generate-icon.swift" "$SOURCE"
fi

make_icon() {
  local pixels="$1"
  local name="$2"
  /usr/bin/sips -z "$pixels" "$pixels" "$SOURCE" --out "$ICONSET/$name" >/dev/null
}

make_icon 16 icon_16x16.png
make_icon 32 icon_16x16@2x.png
make_icon 32 icon_32x32.png
make_icon 64 icon_32x32@2x.png
make_icon 128 icon_128x128.png
make_icon 256 icon_128x128@2x.png
make_icon 256 icon_256x256.png
make_icon 512 icon_256x256@2x.png
make_icon 512 icon_512x512.png
/bin/cp "$SOURCE" "$ICONSET/icon_512x512@2x.png"
/usr/bin/iconutil --convert icns --output "$OUTPUT" "$ICONSET"
[ -s "$OUTPUT" ] \
  || { printf 'Icon generation produced no output: %s\n' "$OUTPUT" >&2; exit 1; }
/usr/bin/printf 'Created %s\n' "$OUTPUT"
