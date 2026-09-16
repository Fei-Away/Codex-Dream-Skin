#!/bin/bash
#
# build-deb.sh -- Standalone script to build the Codex Dream Skin .deb package.
# Usage: bash build-deb.sh [version]
#   version: optional, defaults to 1.5.18
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$ROOT/.." && pwd -P)"
RELEASE_DIR="$ROOT/release"
mkdir -p "$RELEASE_DIR"

# Determine version
if [ "$#" -gt 0 ]; then
    VERSION="$1"
else
    VERSION=""
    for vfile in "$ROOT/VERSION" "$REPO_ROOT/VERSION"; do
        if [ -f "$vfile" ]; then
            VERSION="$(tr -d '[:space:]' < "$vfile")"
            break
        fi
    done
    VERSION="${VERSION:-1.5.18}"
fi

DEB="$RELEASE_DIR/codex-dream-skin-v${VERSION}-linux.deb"
STAGING="/tmp/codex-dream-skin-deb-build-${VERSION}"
PKG="$STAGING/codex-dream-skin-${VERSION}"
RUNTIME_DIR="$REPO_ROOT/runtime"

echo "Building codex-dream-skin v${VERSION}..."

# Clean staging
rm -rf "$STAGING"

# Directory layout
mkdir -p \
  "$PKG/usr/share/codex-dream-skin/scripts" \
  "$PKG/usr/share/codex-dream-skin/runtime" \
  "$PKG/usr/share/codex-dream-skin/tray-app" \
  "$PKG/usr/share/codex-dream-skin/assets" \
  "$PKG/usr/share/codex-dream-skin/presets" \
  "$PKG/usr/local/bin" \
  "$PKG/usr/share/applications" \
  "$PKG/usr/share/icons/hicolor/48x48/apps" \
  "$PKG/etc/xdg/autostart" \
  "$PKG/usr/share/systemd/user" \
  "$PKG/DEBIAN"

# Copy scripts
cp -r "$ROOT/scripts/"* "$PKG/usr/share/codex-dream-skin/scripts/"

# Copy runtime from repo root
if [ -d "$RUNTIME_DIR" ]; then
  cp -r "$RUNTIME_DIR/"* "$PKG/usr/share/codex-dream-skin/runtime/"
fi

# Copy tray app
if [ -d "$ROOT/tray-app" ]; then
  cp "$ROOT/tray-app/tray.py" "$PKG/usr/share/codex-dream-skin/tray-app/"
  cp "$ROOT/tray-app/"*.png "$PKG/usr/share/codex-dream-skin/tray-app/" 2>/dev/null || true
fi

# Copy presets
if [ -d "$ROOT/presets" ]; then
  cp -r "$ROOT/presets/"* "$PKG/usr/share/codex-dream-skin/presets/" 2>/dev/null || true
fi

# Icons — generate 16/24/32/48px versions from source (16x16)
for name in active paused inactive; do
  src="$ROOT/scripts/icon-status-${name}.png"
  [ -f "$src" ] || continue
  for size in 16 24 32 48; do
    dst="$PKG/usr/share/icons/hicolor/${size}x${size}/apps/codex-dream-skin-${name}.png"
    mkdir -p "$(dirname "$dst")"
    convert "$src" -resize ${size}x${size} "$dst" 2>/dev/null       || cp "$src" "$dst"
  done
done

# Desktop / autostart / systemd
INSTALLER_DIR="$ROOT/installer"
[ -d "$INSTALLER_DIR" ] || mkdir -p "$INSTALLER_DIR"
cp "$INSTALLER_DIR/codex-dream-skin.desktop" \
   "$PKG/usr/share/applications/" 2>/dev/null || true
cp "$INSTALLER_DIR/codex-dream-skin-autostart.desktop" \
   "$PKG/etc/xdg/autostart/" 2>/dev/null || true
cp "$INSTALLER_DIR/codex-dream-skin-injector.service" \
   "$PKG/usr/share/systemd/user/" 2>/dev/null || true

# Symlinks
ln -sf /usr/share/codex-dream-skin/scripts/dream-skin.sh \
       "$PKG/usr/local/bin/dream-skin"
ln -sf /usr/share/codex-dream-skin/tray-app/tray.py \
       "$PKG/usr/local/bin/dream-skin-tray"
ln -sf /usr/share/codex-dream-skin/tray-app/tray.py \
       "$PKG/usr/local/bin/dream-skin-launcher"

# Make .sh files executable
chmod +x "$PKG/usr/share/codex-dream-skin/scripts/"*.sh 2>/dev/null || true
# Make tray.py executable
chmod +x "$PKG/usr/share/codex-dream-skin/tray-app/tray.py" 2>/dev/null || true

# Control file
cat > "$PKG/DEBIAN/control" << EOF
Package: codex-dream-skin
Section: misc
Priority: optional
Maintainer: Fei-Away <fei-away@example.com>
Architecture: all
Version: ${VERSION}-1
Replaces: codex-dream-skin
Depends: chatgpt (>= 26.700), python3, python3-gi, libgtk-3-0,
 libayatana-appindicator3-1, libnotify4, xdg-utils, ca-certificates,
 imagemagick, zenity
Description: Adaptive theme injector for Codex Desktop on Linux
 Codex Dream Skin injects adaptive CSS themes into the official
 ChatGPT/Codex Linux desktop application via the Chromium DevTools
 Protocol. It does not modify the official .app bundle or app.asar.
 .
 Features:
  * Full system tray integration with GTK3 + libayatana-appindicator
  * Theme import from ZIP packages (zenity dialog, Wayland-compatible)
  * Automatic theme switching and appearance sync
  * Safe CSS policy enforcement
  * One-click restore to original appearance
EOF

# Syntax checks
echo "Running syntax checks..."
while IFS= read -r file; do
  bash -n "$file" || { echo "FAIL: $file"; exit 1; }
done < <(find "$ROOT" -type f -name '*.sh' -print)

NODE="/usr/lib/chatgpt/resources/cua_node/bin/node"
if [ -x "$NODE" ]; then
  while IFS= read -r file; do
    "$NODE" --check "$file" >/dev/null || { echo "FAIL: $file"; exit 1; }
  done < <(find "$ROOT" -type f \( -name '*.mjs' -o -name '*.js' \) -print)
fi

python3 -c "import py_compile; py_compile.compile('$ROOT/tray-app/tray.py', doraise=True)" 2>/dev/null \
  || echo "  (skipping tray.py compile check)"

# Post-install script (must be before dpkg-deb build)
cat > "$PKG/DEBIAN/postinst" << 'POSTINST'
#!/bin/sh
set -e
# Update icon cache
if [ -d /usr/share/icons/hicolor ]; then
    gtk-update-icon-cache /usr/share/icons/hicolor/48x48/apps/ 2>/dev/null || true
    gtk-update-icon-cache /usr/share/icons/hicolor/ 2>/dev/null || true
fi
# Create desktop shortcut on user's desktop if it doesn't exist
if [ -d "$HOME/Desktop" ] && [ ! -f "$HOME/Desktop/codex-dream-skin.desktop" ]; then
    cp /usr/share/applications/codex-dream-skin.desktop "$HOME/Desktop/" 2>/dev/null || true
    chmod +x "$HOME/Desktop/codex-dream-skin.desktop" 2>/dev/null || true
fi
if [ -d "$HOME/桌面" ] && [ ! -f "$HOME/桌面/codex-dream-skin.desktop" ]; then
    cp /usr/share/applications/codex-dream-skin.desktop "$HOME/桌面/" 2>/dev/null || true
    chmod +x "$HOME/桌面/codex-dream-skin.desktop" 2>/dev/null || true
fi
exit 0
POSTINST
chmod +x "$PKG/DEBIAN/postinst"

# Build deb
echo "Building deb: $DEB"
dpkg-deb --build "$PKG" "$DEB" 2>&1

# Verify
test -s "$DEB" || { echo "ERROR: deb was not created"; exit 1; }
echo ""
echo "=== Build complete ==="
echo "Package: $DEB"
echo "Size:    $(du -h "$DEB" | cut -f1)"
dpkg-deb --info "$DEB" | head -8
