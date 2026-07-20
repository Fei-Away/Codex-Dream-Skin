#!/bin/bash

set -euo pipefail
export LC_ALL=C
export LANG=C
export LC_CTYPE=C
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
RELEASE_DIR="$ROOT/release"
DMG="$RELEASE_DIR/CodexDreamSkin-v$VERSION.dmg"
SKIP_TESTS="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-tests) SKIP_TESTS="true"; shift ;;
    *) printf 'Unknown DMG build argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

if [ "$SKIP_TESTS" != "true" ]; then
  "$ROOT/tests/run-tests.sh"
fi

TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-dmg.XXXXXX)"
MOUNT=""
cleanup() {
  if [ -n "$MOUNT" ] && /sbin/mount | /usr/bin/grep -F -q " on $MOUNT "; then
    /usr/bin/hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 \
      || /usr/bin/hdiutil detach "$MOUNT" -force -quiet >/dev/null 2>&1 \
      || true
  fi
  /bin/rm -rf "$TMP"
}
trap cleanup EXIT
APP="$TMP/Codex Dream Skin.app"
STAGE="$TMP/stage"
/bin/mkdir -p "$STAGE" "$RELEASE_DIR"
"$ROOT/scripts/build-menubar-app.sh" --skip-tests --output "$APP"
/usr/bin/ditto "$APP" "$STAGE/Codex Dream Skin.app"
/bin/ln -s /Applications "$STAGE/Applications"

/bin/rm -f "$DMG" "$DMG.sha256"
LC_ALL=C LANG=C /usr/bin/hdiutil create -quiet -ov -format UDZO \
  -volname "Codex Dream Skin" -srcfolder "$STAGE" "$DMG"
[ -s "$DMG" ] || { printf 'DMG was not created: %s\n' "$DMG" >&2; exit 1; }

MOUNT="$TMP/mount"
/bin/mkdir -p "$MOUNT"
/usr/bin/hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT" "$DMG" >/dev/null
MOUNTED_APP="$MOUNT/Codex Dream Skin.app"
[ -d "$MOUNTED_APP" ] || { printf 'DMG does not contain the app bundle.\n' >&2; exit 1; }
[ -L "$MOUNT/Applications" ] \
  && [ "$(/usr/bin/readlink "$MOUNT/Applications")" = "/Applications" ] \
  || { printf 'DMG does not contain the Applications link.\n' >&2; exit 1; }
/usr/bin/codesign --verify --deep --strict "$MOUNTED_APP"
[ "$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$MOUNTED_APP/Contents/Info.plist")" = "$VERSION" ] \
  || { printf 'Mounted app version does not match VERSION.\n' >&2; exit 1; }
[ "$(/usr/bin/tr -d '[:space:]' < "$MOUNTED_APP/Contents/Resources/engine/VERSION")" = "$VERSION" ] \
  || { printf 'Mounted engine version does not match VERSION.\n' >&2; exit 1; }
[ -f "$MOUNTED_APP/Contents/Resources/LICENSE.txt" ] \
  && [ -f "$MOUNTED_APP/Contents/Resources/NOTICE.md" ] \
  || { printf 'Mounted app is missing license notices.\n' >&2; exit 1; }
[ -f "$MOUNTED_APP/Contents/Resources/engine/presets/preset-gothic-void-crusade/theme.json" ] \
  || { printf 'Mounted app is missing the public release preset.\n' >&2; exit 1; }
[ -f "$MOUNTED_APP/Contents/Resources/engine/presets/preset-cyan-virtual-diva/theme.json" ] \
  || { printf 'Mounted app is missing the Cyan Virtual Diva preset.\n' >&2; exit 1; }
[ ! -e "$MOUNTED_APP/Contents/Resources/engine/presets/preset-arina-hashimoto" ] \
  || { printf 'Mounted app contains a rights-restricted preset.\n' >&2; exit 1; }
for excluded in build-client-release.sh build-dmg.sh build-menubar-app.sh build-release.sh \
  generate-app-icon.sh install-menubar-macos.sh prepare-standalone-docs.sh; do
  [ ! -e "$MOUNTED_APP/Contents/Resources/engine/scripts/$excluded" ] \
    || { printf 'Mounted runtime contains build-only script: %s\n' "$excluded" >&2; exit 1; }
done
MOUNTED_ARCHS="$(/usr/bin/lipo -archs "$MOUNTED_APP/Contents/MacOS/CodexDreamSkinMenuBar")"
read -r -a EXPECTED_ARCHS <<< "${DREAMSKIN_ARCHS:-arm64 x86_64}"
for arch in "${EXPECTED_ARCHS[@]}"; do
  case " $MOUNTED_ARCHS " in
    *" $arch "*) ;;
    *) printf 'Mounted app is missing architecture %s: %s\n' "$arch" "$MOUNTED_ARCHS" >&2; exit 1 ;;
  esac
done
/usr/bin/hdiutil detach "$MOUNT" -quiet
MOUNT=""

SHA256="$(/usr/bin/shasum -a 256 "$DMG" | /usr/bin/awk '{print $1}')"
/usr/bin/printf '%s  %s\n' "$SHA256" "$(basename "$DMG")" > "$DMG.sha256"
/usr/bin/printf 'Created %s\nSHA-256 %s\n' "$DMG" "$SHA256"
