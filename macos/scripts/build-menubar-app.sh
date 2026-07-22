#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
PACKAGE_ROOT="$ROOT/menubar-app"
VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
OUTPUT_APP="$ROOT/release/Codex Dream Skin.app"
SKIP_TESTS="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-tests) SKIP_TESTS="true"; shift ;;
    --output) OUTPUT_APP="${2:-}"; shift 2 ;;
    *) printf 'Unknown app build argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

printf '%s' "$VERSION" | /usr/bin/grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || { printf 'Invalid VERSION: %s\n' "$VERSION" >&2; exit 1; }
[ -n "$OUTPUT_APP" ] || { printf 'Output app path cannot be empty.\n' >&2; exit 1; }
case "$(/usr/bin/basename "$OUTPUT_APP")" in
  *.app) ;;
  *) printf 'Output path must end in an .app bundle name: %s\n' "$OUTPUT_APP" >&2; exit 1 ;;
esac
[ ! -L "$OUTPUT_APP" ] || { printf 'Refusing to replace a symbolic-link output: %s\n' "$OUTPUT_APP" >&2; exit 1; }

if [ "$SKIP_TESTS" != "true" ]; then
  /usr/bin/swift test --package-path "$PACKAGE_ROOT"
fi

TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-app.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT
ARCH_TEXT="${DREAMSKIN_ARCHS:-arm64 x86_64}"
read -r -a ARCHS <<< "$ARCH_TEXT"
[ "${#ARCHS[@]}" -gt 0 ] || { printf 'No build architectures selected.\n' >&2; exit 1; }

BINARIES=()
for arch in "${ARCHS[@]}"; do
  case "$arch" in arm64|x86_64) ;; *) printf 'Unsupported architecture: %s\n' "$arch" >&2; exit 1 ;; esac
  triple="${arch}-apple-macosx13.0"
  if [ -n "${DREAMSKIN_SDK:-}" ]; then
    direct="$TMP/direct-$arch"
    /bin/mkdir -p "$direct"
    /usr/bin/swiftc -O -sdk "$DREAMSKIN_SDK" -target "$triple" \
      -parse-as-library -emit-module -emit-library -static -module-name DreamSkinCore \
      "$PACKAGE_ROOT"/Sources/DreamSkinCore/*.swift \
      -emit-module-path "$direct/DreamSkinCore.swiftmodule" \
      -o "$direct/libDreamSkinCore.a"
    /usr/bin/swiftc -O -sdk "$DREAMSKIN_SDK" -target "$triple" \
      -I "$direct" -L "$direct" -lDreamSkinCore \
      "$PACKAGE_ROOT"/Sources/CodexDreamSkinMenuBar/*.swift \
      -o "$direct/CodexDreamSkinMenuBar"
    binary="$direct/CodexDreamSkinMenuBar"
  else
    scratch="$PACKAGE_ROOT/.build-$arch"
    /usr/bin/swift build --package-path "$PACKAGE_ROOT" --scratch-path "$scratch" \
      --configuration release --triple "$triple" --product CodexDreamSkinMenuBar
    binary_dir="$(/usr/bin/swift build --package-path "$PACKAGE_ROOT" \
      --scratch-path "$scratch" --configuration release --triple "$triple" \
      --show-bin-path)"
    binary="$binary_dir/CodexDreamSkinMenuBar"
  fi
  [ -x "$binary" ] || { printf 'Built executable missing: %s\n' "$binary" >&2; exit 1; }
  /bin/cp "$binary" "$TMP/CodexDreamSkinMenuBar-$arch"
  BINARIES+=("$TMP/CodexDreamSkinMenuBar-$arch")
done

APP="$TMP/Codex Dream Skin.app"
CONTENTS="$APP/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"
ENGINE="$RESOURCES/engine"
/bin/mkdir -p "$MACOS_DIR" "$ENGINE" "$(dirname "$OUTPUT_APP")"

if [ "${#BINARIES[@]}" -eq 1 ]; then
  /bin/cp "${BINARIES[0]}" "$MACOS_DIR/CodexDreamSkinMenuBar"
else
  /usr/bin/lipo -create "${BINARIES[@]}" -output "$MACOS_DIR/CodexDreamSkinMenuBar"
fi
/bin/chmod 755 "$MACOS_DIR/CodexDreamSkinMenuBar"

/usr/bin/sed "s/__VERSION__/$VERSION/g" \
  "$PACKAGE_ROOT/Resources/Info.plist.template" > "$CONTENTS/Info.plist"
/usr/bin/plutil -lint "$CONTENTS/Info.plist" >/dev/null

RUNTIME_SCRIPTS=(
  apply-from-menubar-macos.sh
  check-update-macos.sh
  common-macos.sh
  customize-theme-macos.sh
  doctor-macos.sh
  image-metadata.mjs
  injector.mjs
  install-dream-skin-macos.sh
  load-image-theme-macos.sh
  pause-dream-skin-macos.sh
  restore-dream-skin-macos.sh
  stage-theme.mjs
  start-dream-skin-macos.sh
  status-dream-skin-macos.sh
  switch-theme-macos.sh
  theme-config.mjs
  verify-dream-skin-macos.sh
  write-theme.mjs
)
/bin/mkdir -p "$ENGINE/scripts"
for name in "${RUNTIME_SCRIPTS[@]}"; do
  [ -f "$ROOT/scripts/$name" ] || { printf 'Runtime script missing: %s\n' "$name" >&2; exit 1; }
  /bin/cp "$ROOT/scripts/$name" "$ENGINE/scripts/$name"
done
[ -d "$ROOT/assets" ] || { printf 'Engine directory missing: assets\n' >&2; exit 1; }
/usr/bin/rsync -a "$ROOT/assets/" "$ENGINE/assets/"
PUBLIC_PRESET="preset-gothic-void-crusade"
PUBLIC_PRESET_SHA256="b76a7cbe2ff9d923846e931984d243a7ba1f25de8d190b5c6412c809c41aee42"
PUBLIC_PRESET_THEME_SHA256="fd250dc6c0ec1eea724f59a86c7c126a6bd9b90798289483a00948d57e23e52e"
[ -d "$ROOT/presets/$PUBLIC_PRESET" ] \
  || { printf 'Public release preset missing: %s\n' "$PUBLIC_PRESET" >&2; exit 1; }
actual_public_preset_sha256="$(LC_ALL=C /usr/bin/shasum -a 256 \
  "$ROOT/presets/$PUBLIC_PRESET/background.jpg" | /usr/bin/awk '{print $1}')"
[ "$actual_public_preset_sha256" = "$PUBLIC_PRESET_SHA256" ] \
  || { printf 'Reviewed public preset hash changed: %s\n' "$actual_public_preset_sha256" >&2; exit 1; }
actual_public_preset_theme_sha256="$(LC_ALL=C /usr/bin/shasum -a 256 \
  "$ROOT/presets/$PUBLIC_PRESET/theme.json" | /usr/bin/awk '{print $1}')"
[ "$actual_public_preset_theme_sha256" = "$PUBLIC_PRESET_THEME_SHA256" ] \
  || { printf 'Reviewed public preset metadata hash changed: %s\n' "$actual_public_preset_theme_sha256" >&2; exit 1; }
/bin/mkdir -p "$ENGINE/presets/$PUBLIC_PRESET"
/usr/bin/rsync -a "$ROOT/presets/$PUBLIC_PRESET/" "$ENGINE/presets/$PUBLIC_PRESET/"
/bin/cp "$ROOT/VERSION" "$ENGINE/VERSION"
/bin/cp "$ROOT/LICENSE" "$RESOURCES/LICENSE.txt"
/bin/cp "$ROOT/NOTICE.md" "$RESOURCES/NOTICE.md"
/bin/chmod 755 "$ENGINE/scripts/"*.sh
/bin/chmod 644 "$ENGINE/scripts/"*.mjs
/bin/chmod 644 "$ENGINE/VERSION"
[ ! -e "$ENGINE/presets/preset-arina-hashimoto" ] \
  || { printf 'Rights-restricted preset entered the public app bundle.\n' >&2; exit 1; }

"$ROOT/scripts/generate-app-icon.sh" "$RESOURCES/DreamSkin.icns"
/usr/bin/codesign --force --deep --sign - --timestamp=none "$APP"
/usr/bin/codesign --verify --deep --strict "$APP"

/bin/rm -rf "$OUTPUT_APP"
/usr/bin/ditto "$APP" "$OUTPUT_APP"
/usr/bin/codesign --verify --deep --strict "$OUTPUT_APP"
/usr/bin/printf 'Created %s\n' "$OUTPUT_APP"
/usr/bin/file "$OUTPUT_APP/Contents/MacOS/CodexDreamSkinMenuBar"
ACTUAL_ARCHS="$(/usr/bin/lipo -archs "$OUTPUT_APP/Contents/MacOS/CodexDreamSkinMenuBar")"
for arch in "${ARCHS[@]}"; do
  case " $ACTUAL_ARCHS " in
    *" $arch "*) ;;
    *) printf 'Built app is missing architecture %s: %s\n' "$arch" "$ACTUAL_ARCHS" >&2; exit 1 ;;
  esac
done
