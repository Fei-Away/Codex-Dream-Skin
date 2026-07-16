#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

discover_codex_app
ensure_state_root
APP_ROOT="$HOME/Applications/栋哥 Codex.app"
MACOS_DIR="$APP_ROOT/Contents/MacOS"
RESOURCES_DIR="$APP_ROOT/Contents/Resources"
PLIST="$APP_ROOT/Contents/Info.plist"

/bin/rm -rf "$APP_ROOT"
/bin/mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"
/usr/bin/printf '%s\n' \
  '#!/bin/bash' \
  'set -euo pipefail' \
  'STATE="$HOME/Library/Application Support/CodexDreamSkinStudio"' \
  'ENGINE="$STATE/engine"' \
  'if [ ! -x "$ENGINE/scripts/start-dream-skin-macos.sh" ]; then' \
  '  /usr/bin/osascript -e '\''display alert "栋哥 Codex" message "皮肤引擎未安装，请先运行安装程序。"'\'' >/dev/null' \
  '  exit 1' \
  'fi' \
  '/bin/mkdir -p "$STATE"' \
  '"$ENGINE/scripts/start-dream-skin-macos.sh" --port 9341 >>"$STATE/launcher.log" 2>>"$STATE/launcher-error.log" || {' \
  '  /usr/bin/osascript -e '\''display alert "栋哥 Codex" message "如果官方 Codex 已经打开，请先手动退出，再重新打开栋哥 Codex。"'\'' >/dev/null' \
  '  exit 1' \
  '}' \
  > "$MACOS_DIR/launch"
/bin/chmod 755 "$MACOS_DIR/launch"

/usr/bin/plutil -create xml1 "$PLIST"
/usr/bin/plutil -insert CFBundleIdentifier -string com.feiaway.codex-dream-skin.launcher "$PLIST"
/usr/bin/plutil -insert CFBundleName -string '栋哥 Codex' "$PLIST"
/usr/bin/plutil -insert CFBundleDisplayName -string '栋哥 Codex' "$PLIST"
/usr/bin/plutil -insert CFBundleExecutable -string launch "$PLIST"
/usr/bin/plutil -insert CFBundlePackageType -string APPL "$PLIST"
/usr/bin/plutil -insert CFBundleShortVersionString -string "$SKIN_VERSION" "$PLIST"
/usr/bin/plutil -insert CFBundleVersion -string "${SKIN_VERSION//./}" "$PLIST"
/usr/bin/plutil -insert NSHighResolutionCapable -bool true "$PLIST"

icon="$(/usr/bin/find "$CODEX_BUNDLE/Contents/Resources" -maxdepth 1 -name '*.icns' -print | /usr/bin/head -n 1)"
if [ -n "$icon" ]; then
  /bin/cp "$icon" "$RESOURCES_DIR/AppIcon.icns"
  /usr/bin/plutil -insert CFBundleIconFile -string AppIcon "$PLIST"
fi

LSREGISTER='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
[ ! -x "$LSREGISTER" ] || "$LSREGISTER" -f "$APP_ROOT" >/dev/null 2>&1 || true

desktop_link="$HOME/Desktop/栋哥 Codex.app"
if [ -L "$desktop_link" ]; then /bin/rm "$desktop_link"; fi
if [ ! -e "$desktop_link" ]; then /bin/ln -s "$APP_ROOT" "$desktop_link"; fi

printf 'Created %s\n' "$APP_ROOT"
