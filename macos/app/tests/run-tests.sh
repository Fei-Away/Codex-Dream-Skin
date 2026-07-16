#!/bin/bash

set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-app-tests.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

/bin/bash -n "$APP_ROOT/build.sh"
/usr/bin/plutil -lint "$APP_ROOT/Info.plist" >/dev/null
[ "$(/usr/bin/plutil -extract CFBundleIconFile raw -o - "$APP_ROOT/Info.plist")" = "AppIcon" ]
[ -s "$APP_ROOT/Assets/AppIcon.icns" ]
[ "$(/usr/bin/sips -g pixelWidth "$APP_ROOT/Assets/AppIcon-1024.png" | /usr/bin/awk '/pixelWidth/{print $2}')" = "1024" ]
[ "$(/usr/bin/sips -g pixelHeight "$APP_ROOT/Assets/AppIcon-1024.png" | /usr/bin/awk '/pixelHeight/{print $2}')" = "1024" ]
/usr/bin/swiftc \
  -swift-version 5 \
  -parse-as-library \
  -warnings-as-errors \
  -typecheck \
  -framework SwiftUI \
  -framework AppKit \
  "$APP_ROOT/Sources"/*.swift

/usr/bin/swiftc \
  -swift-version 5 \
  -parse-as-library \
  -warnings-as-errors \
  -o "$TMP/process-runner-tests" \
  "$APP_ROOT/Sources/ProcessRunner.swift" \
  "$APP_ROOT/tests/ProcessRunnerTests.swift"
"$TMP/process-runner-tests"

/usr/bin/printf 'PASS: macOS app plist, icon, Swift typecheck, and process-runner regressions.\n'
