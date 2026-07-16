#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/macos/VERSION")"
OUTPUT="${1:-$ROOT/release/Codex-Dongge-Skin-Pack-v$VERSION.zip}"
TMP="$(/usr/bin/mktemp -d /tmp/codex-dongge-pack.XXXXXX)"
PACK="$TMP/Codex-Dongge-Skin-Pack-v$VERSION"
trap '/bin/rm -rf "$TMP"' EXIT

"$ROOT/macos/tests/run-tests.sh"

/bin/mkdir -p "$PACK"
/usr/bin/rsync -a --exclude '.DS_Store' --exclude 'release/' "$ROOT/macos/" "$PACK/macOS/"
/usr/bin/rsync -a --exclude '.DS_Store' "$ROOT/windows/" "$PACK/Windows/"
/bin/cp "$ROOT/README.md" "$PACK/README.md"
/bin/cp "$ROOT/themes/README.md" "$PACK/主题说明.md"
/usr/bin/printf '%s\n' \
  "栋哥 Codex 皮肤包 $VERSION" \
  '' \
  'macOS：进入 macOS，双击 Install Codex Dream Skin.command，先选择默认栋哥图片。安装后从“栋哥 Codex.app”打开。' \
  'Windows：进入 Windows，以 PowerShell 运行 scripts/install-dream-skin.ps1，先选择默认栋哥图片，之后从“栋哥 Codex”快捷方式打开。' \
  '注意：如果官方 Codex 已经打开，请先手动退出再打开栋哥 Codex；安装包不会自动关闭或重启宿主 app。' \
  '' \
  '内置：语言的用法 / 开源工作台 / 心理问题举牌，另保留经典白板兼容主题。' \
  'Restore 可恢复原版；不会修改官方 app.asar、WindowsApps 或模型供应商配置。' \
  > "$PACK/先看这里.txt"

/bin/chmod 755 "$PACK/macOS"/*.command "$PACK/macOS"/scripts/*.sh "$PACK/macOS"/tests/*.sh
/bin/mkdir -p "$(dirname "$OUTPUT")"
if [ -e "$OUTPUT" ]; then /bin/rm "$OUTPUT"; fi
COPYFILE_DISABLE=1 /usr/bin/ditto -c -k --keepParent --norsrc --noextattr "$PACK" "$OUTPUT"
SHA256="$(/usr/bin/shasum -a 256 "$OUTPUT" | /usr/bin/awk '{print $1}')"
/usr/bin/printf 'Created %s\nSHA-256 %s\n' "$OUTPUT" "$SHA256"
