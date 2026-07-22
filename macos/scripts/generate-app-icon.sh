#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
OUTPUT="${1:-$ROOT/menubar-app/Resources/DreamSkin.icns}"
TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-icon.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

ICONSET="$TMP/DreamSkin.iconset"
SOURCE="$TMP/icon-1024.png"
/bin/mkdir -p "$ICONSET" "$(dirname "$OUTPUT")"
SWIFT_ARGS=()
if [ -n "${DREAMSKIN_SDK:-}" ]; then
  SWIFT_ARGS+=( -sdk "$DREAMSKIN_SDK" )
fi
/usr/bin/xcrun swift "${SWIFT_ARGS[@]}" \
  "$ROOT/menubar-app/Tools/generate-icon.swift" "$SOURCE"

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
/usr/bin/printf 'Created %s\n' "$OUTPUT"
