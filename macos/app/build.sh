#!/bin/bash

set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")" && pwd -P)"
MACOS_ROOT="$(cd "$APP_ROOT/.." && pwd -P)"
BUILD_ROOT="$APP_ROOT/build"
APP="$BUILD_ROOT/Codex Dream Skin.app"
DMG="$BUILD_ROOT/Codex-Dream-Skin-1.0.0.dmg"
STAGING="$BUILD_ROOT/dmg-root"

/bin/rm -rf "$BUILD_ROOT"
/bin/mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/Engine"

/usr/bin/swiftc \
  -swift-version 5 \
  -parse-as-library \
  -warnings-as-errors \
  -O \
  -framework SwiftUI \
  -framework AppKit \
  -o "$APP/Contents/MacOS/CodexDreamSkin" \
  "$APP_ROOT/Sources"/*.swift

/bin/cp "$APP_ROOT/Info.plist" "$APP/Contents/Info.plist"
/bin/cp "$APP_ROOT/Assets/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
/usr/bin/rsync -a \
  --exclude '.DS_Store' \
  --exclude 'app/' \
  --exclude 'release/' \
  --exclude 'runtime/' \
  "$MACOS_ROOT/" "$APP/Contents/Resources/Engine/"
/bin/chmod 700 "$APP/Contents/Resources/Engine"/*.command
/bin/chmod 700 "$APP/Contents/Resources/Engine/scripts"/*.sh

/usr/bin/codesign --force --deep --sign - "$APP"
/usr/bin/codesign --verify --deep --strict "$APP"

/bin/mkdir -p "$STAGING"
/bin/cp -R "$APP" "$STAGING/"
/bin/cp "$APP_ROOT/README.md" "$STAGING/使用说明.md"
/bin/ln -s /Applications "$STAGING/Applications"
/usr/bin/hdiutil create -quiet -volname "Codex Dream Skin" -srcfolder "$STAGING" -ov -format UDZO "$DMG"
/bin/rm -rf "$STAGING"

/usr/bin/printf 'Created:\n%s\n%s\n' "$APP" "$DMG"
