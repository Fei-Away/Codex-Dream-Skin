#!/bin/bash

# SwiftBar plugin — dynamic theme list from themes/ + images/ drop folder.

# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
# <swiftbar.hideSwiftBar>false</swiftbar.hideSwiftBar>

set +e

ENGINE="${CODEX_DREAM_SKIN_ENGINE:-$HOME/.codex/codex-dream-skin-studio}"
if [ ! -d "$ENGINE/scripts" ]; then
  HERE="$(cd "$(dirname "$0")" && pwd -P)"
  [ -d "$HERE/../scripts" ] && ENGINE="$(cd "$HERE/.." && pwd -P)"
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
PRESETS_INDEX="$ENGINE/presets/index.json"
[ -x "$APPLY" ] || APPLY="$START"

STATE_ROOT="$HOME/Library/Application Support/CodexDreamSkinStudio"
THEMES_ROOT="$STATE_ROOT/themes"
IMAGES_DIR="$STATE_ROOT/images"
/bin/mkdir -p "$THEMES_ROOT" "$IMAGES_DIR" 2>/dev/null

if [ ! -x "$START" ] && [ ! -x "$APPLY" ]; then
  echo "Skin ?"
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

echo "$TITLE"
echo "---"
if [ -n "$THEME_LINE" ]; then
  echo "当前: $THEME_LINE | color=#888888"
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

# Built-in presets stay in manifest order and are separated from user themes.
builtin_ids=""
if [ -f "$PRESETS_INDEX" ]; then
  while IFS=$'\t' read -r collection tid; do
    if [ "$collection" = "COLLECTION" ]; then
      section="$tid"
      echo "$section"
      continue
    fi
    [ "$collection" = "THEME" ] || continue
    builtin_ids="${builtin_ids}|${tid}|"
    [ -f "$THEMES_ROOT/$tid/theme.json" ] || continue
    tname="$(/usr/bin/python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("name") or sys.argv[2])' "$THEMES_ROOT/$tid/theme.json" "$tid" 2>/dev/null)"
    tname="$(printf '%s' "${tname:-$tid}" | /usr/bin/tr '\n|' '  ')"
    mark=""
    [ "$tname" = "$THEME_LINE" ] && mark=" ✓"
    echo "-- $tname$mark | bash=\"$SWITCH\" param1=\"--id\" param2=\"$tid\" terminal=false refresh=true"
  done < <(/usr/bin/python3 - "$PRESETS_INDEX" <<'PY' 2>/dev/null
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    manifest = json.load(f)
for collection in manifest.get("collections", []):
    print("COLLECTION", collection.get("name", "内置主题"), sep="\t")
    for theme_id in collection.get("themes", []):
        print("THEME", theme_id, sep="\t")
PY
  )
fi

echo "我的主题"
custom_count=0
if [ -d "$THEMES_ROOT" ]; then
  for dir in "$THEMES_ROOT"/*; do
    [ -d "$dir" ] || continue
    [ -f "$dir/theme.json" ] || continue
    tid="$(/usr/bin/basename "$dir")"
    case "$tid" in ''|*[!a-zA-Z0-9._-]*) continue ;; esac
    case "$builtin_ids" in *"|$tid|"*) continue ;; esac
    tname="$(/usr/bin/python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("name") or sys.argv[2])' "$dir/theme.json" "$tid" 2>/dev/null)"
    tname="$(printf '%s' "${tname:-$tid}" | /usr/bin/tr '\n|' '  ')"
    mark=""
    [ "$tname" = "$THEME_LINE" ] && mark=" ✓"
    echo "-- $tname$mark | bash=\"$SWITCH\" param1=\"--id\" param2=\"$tid\" terminal=false refresh=true"
    custom_count=$((custom_count + 1))
  done
fi
if [ "$custom_count" -eq 0 ]; then
  echo "-- (换图后会自动保存到这里) | color=#888888"
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
    echo "-- $base | bash=\"$LOAD_IMG\" param1=\"--from-library\" param2=\"$base\" terminal=false refresh=true"
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
