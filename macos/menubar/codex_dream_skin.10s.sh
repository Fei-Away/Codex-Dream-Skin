#!/bin/bash

# SwiftBar plugin — dynamic theme list from themes/ + images/ drop folder.

# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.hideSwiftBar>false</swiftbar.hideSwiftBar>

set +e

menu_text() {
  LC_ALL=C /usr/bin/printf '%s' "$1" \
    | LC_ALL=C /usr/bin/tr '\000-\037\177|' ' ' \
    | /usr/bin/cut -c1-120
}

swiftbar_attribute_path_safe() {
  case "$1" in
    ''|*'|'*|*'"'*|*'\'*) return 1 ;;
  esac
  if LC_ALL=C /usr/bin/printf '%s' "$1" | LC_ALL=C /usr/bin/grep -q '[[:cntrl:]]'; then
    return 1
  fi
  return 0
}

ENGINE="${CODEX_DREAM_SKIN_ENGINE:-$HOME/.codex/codex-dream-skin-studio}"
if [ ! -d "$ENGINE/scripts" ]; then
  HERE="$(cd "$(dirname "$0")" && pwd -P)"
  [ -d "$HERE/../scripts" ] && ENGINE="$(cd "$HERE/.." && pwd -P)"
fi
if ! swiftbar_attribute_path_safe "$ENGINE"; then
  echo "Skin ? | sfimage=paintpalette.fill"
  echo "---"
  echo "Engine path contains unsupported SwiftBar characters"
  exit 0
fi

SCRIPTS="$ENGINE/scripts"
APPLY="$SCRIPTS/apply-from-menubar-macos.sh"
START="$SCRIPTS/start-dream-skin-macos.sh"
PAUSE="$SCRIPTS/pause-dream-skin-macos.sh"
CUSTOMIZE="$SCRIPTS/customize-theme-macos.sh"
RESTORE="$SCRIPTS/restore-dream-skin-macos.sh"
STATUS="$SCRIPTS/status-dream-skin-macos.sh"
SWITCH="$SCRIPTS/switch-theme-macos.sh"
LOAD_IMG="$SCRIPTS/load-image-theme-macos.sh"
[ -x "$APPLY" ] || APPLY="$START"

STATE_ROOT="$HOME/Library/Application Support/CodexDreamSkinStudio"
THEMES_ROOT="$STATE_ROOT/themes"
IMAGES_DIR="$STATE_ROOT/images"
/bin/mkdir -p "$THEMES_ROOT" "$IMAGES_DIR" 2>/dev/null

if [ ! -x "$START" ] && [ ! -x "$APPLY" ]; then
  echo "Skin ? | sfimage=paintpalette.fill"
  echo "---"
  echo "Engine missing"
  exit 0
fi

TITLE="Skin 关"
THEME_LINE=""
CODEX_LINE="false"
SESSION_LINE="off"

if [ -x "$STATUS" ]; then
  while IFS= read -r line; do
    case "$line" in
      session=*) SESSION_LINE="${line#session=}" ;;
      codex=*) CODEX_LINE="${line#codex=}" ;;
      theme=*) THEME_LINE="${line#theme=}" ;;
    esac
  done < <("$STATUS" 2>/dev/null)
  case "$SESSION_LINE" in
    active) TITLE="Skin ON" ;;
    paused) TITLE="Skin 暂停" ;;
    stale|unknown) TITLE="Skin ?" ;;
    *) TITLE="Skin 关" ;;
  esac
fi
THEME_MENU_LINE="$(menu_text "$THEME_LINE")"

echo "$TITLE | sfimage=paintpalette.fill"
echo "---"
if [ -n "$THEME_MENU_LINE" ]; then
  /usr/bin/printf '%s\n' "当前: $THEME_MENU_LINE | color=#888888"
else
  echo "当前: (未设置) | color=#888888"
fi
if [ "$CODEX_LINE" = "true" ]; then
  echo "Codex: 已打开 | color=#888888"
else
  echo "Codex: 未打开 | color=#c45c26"
fi

echo "---"
echo "应用皮肤 | bash=\"$APPLY\" terminal=false refresh=true"
echo "暂停皮肤 | bash=\"$PAUSE\" terminal=false refresh=true"
echo "换一张图… | bash=\"$CUSTOMIZE\" terminal=false refresh=true"

# Dynamic: saved theme packs
echo "已保存的主题"
theme_count=0
if [ -d "$THEMES_ROOT" ]; then
  for dir in "$THEMES_ROOT"/*; do
    [ -d "$dir" ] || continue
    [ -f "$dir/theme.json" ] || continue
    tid="$(/usr/bin/basename "$dir")"
    case "$tid" in *[!A-Za-z0-9_-]*|'') continue ;; esac
    [ "${#tid}" -le 80 ] || continue
    tname="$(/usr/bin/plutil -extract name raw -o - "$dir/theme.json" 2>/dev/null)"
    [ -n "$tname" ] || tname="$tid"
    mark=""
    [ "$tname" = "$THEME_LINE" ] && mark=" ✓"
    tname="$(menu_text "$tname")"
    /usr/bin/printf '%s\n' \
      "-- $tname$mark | bash=\"$SWITCH\" param1=\"--id\" param2=\"$tid\" terminal=false refresh=true"
    theme_count=$((theme_count + 1))
  done
fi
if [ "$theme_count" -eq 0 ]; then
  echo "-- (还没有，换图后会自动出现) | color=#888888"
fi

# Dynamic: pure images dropped into images/
echo "图片文件夹"
img_count=0
if [ -d "$IMAGES_DIR" ]; then
  # shellcheck disable=SC2012
  for img in "$IMAGES_DIR"/*; do
    [ -f "$img" ] || continue
    case "$img" in
      *.png|*.PNG|*.jpg|*.JPG|*.jpeg|*.JPEG|*.webp|*.WEBP) ;;
      *) continue ;;
    esac
    base="$(/usr/bin/basename "$img")"
    swiftbar_attribute_path_safe "$base" || continue
    display_base="$(menu_text "$base")"
    /usr/bin/printf '%s\n' \
      "-- $display_base | bash=\"$LOAD_IMG\" param1=\"--from-library\" param2=\"$base\" terminal=false refresh=true"
    img_count=$((img_count + 1))
  done
fi
if [ "$img_count" -eq 0 ]; then
  echo "-- (把纯背景图放进 images 文件夹) | color=#888888"
fi
echo "-- 打开图片文件夹 | bash=\"/usr/bin/open\" param1=\"$IMAGES_DIR\" terminal=false"

echo "---"
echo "完全恢复 | bash=\"$RESTORE\" param1=\"--restore-base-theme\" param2=\"--restart-codex\" terminal=false refresh=true"
echo "---"
echo "刷新 | refresh=true"
