#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

choice="$(/usr/bin/osascript <<'APPLESCRIPT'
set picked to choose from list {"语言的用法", "开源工作台", "心理问题举牌"} with title "栋哥 Codex" with prompt "选择一个风格" default items {"语言的用法"}
if picked is false then return ""
return item 1 of picked
APPLESCRIPT
)"

case "$choice" in
  语言的用法) id="dongge-marginalia" ;;
  开源工作台) id="dongge-blueprint" ;;
  心理问题举牌) id="dongge-placard" ;;
  *) exit 0 ;;
esac

exec "$SCRIPT_DIR/switch-theme-macos.sh" --id "$id"
