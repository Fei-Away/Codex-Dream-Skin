#!/bin/bash
set -euo pipefail
INSTALLED="$HOME/Library/Application Support/CodexDreamSkinStudio/engine/scripts/customize-theme-macos.sh"
if [ ! -x "$INSTALLED" ]; then
  /usr/bin/osascript -e 'display alert "请先双击 Install Codex Dream Skin.command 完成安装。" as warning' >/dev/null
  exit 1
fi
exec "$INSTALLED"
