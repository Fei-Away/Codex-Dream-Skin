#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

IMAGE=""
THEME_NAME=""
TAGLINE=""
QUOTE=""
ACCENT="#7cff46"
SECONDARY="#36d7e8"
HIGHLIGHT="#642a8c"
APPLY_NOW="true"
RESET_DEMO="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --image) IMAGE="${2:-}"; shift 2 ;;
    --name) THEME_NAME="${2:-}"; shift 2 ;;
    --tagline) TAGLINE="${2:-}"; shift 2 ;;
    --quote) QUOTE="${2:-}"; shift 2 ;;
    --accent) ACCENT="${2:-}"; shift 2 ;;
    --secondary) SECONDARY="${2:-}"; shift 2 ;;
    --highlight) HIGHLIGHT="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    --reset-demo) RESET_DEMO="true"; shift ;;
    *) fail "Unknown customize argument: $1" ;;
  esac
done

discover_codex_app
require_macos_runtime
ensure_state_root

if [ "$RESET_DEMO" = "true" ]; then
  "$NODE" "$SCRIPT_DIR/write-theme.mjs" reset-demo --output-dir "$THEME_DIR"
else
  if [ -z "$IMAGE" ]; then
    if [ "$(dreamskin_language)" = "zh" ]; then
      IMAGE_PROMPT="选择一张主题图片（建议横向、宽度 2000px 以上）"
    else
      IMAGE_PROMPT="Choose a theme image (landscape, at least 2000 px wide recommended)"
    fi
    IMAGE="$(/usr/bin/osascript - "$IMAGE_PROMPT" <<'APPLESCRIPT'
on run argv
  POSIX path of (choose file with prompt (item 1 of argv) of type {"public.image"})
end run
APPLESCRIPT
)" \
      || fail "Image selection was cancelled."
  fi
  [ -f "$IMAGE" ] || fail "Selected image does not exist: $IMAGE"
  SOURCE_BYTES="$(/usr/bin/stat -f '%z' "$IMAGE")"
  [ "$SOURCE_BYTES" -le 52428800 ] || fail "Selected image is larger than 50 MB. Choose a smaller file."

  if [ -z "$THEME_NAME" ]; then
    if [ "$(dreamskin_language)" = "zh" ]; then
      NAME_PROMPT="给这套主题起个名字"
      DEFAULT_NAME="我的 Codex Dream Skin"
    else
      NAME_PROMPT="Name this theme"
      DEFAULT_NAME="My Codex Dream Skin"
    fi
    THEME_NAME="$(/usr/bin/osascript - "$NAME_PROMPT" "$DEFAULT_NAME" \
      "$(dreamskin_text cancel)" "$(dreamskin_text continue)" <<'APPLESCRIPT'
on run argv
  set promptText to item 1 of argv
  set defaultName to item 2 of argv
  set cancelLabel to item 3 of argv
  set continueLabel to item 4 of argv
  text returned of (display dialog promptText default answer defaultName buttons {cancelLabel, continueLabel} default button continueLabel cancel button cancelLabel)
end run
APPLESCRIPT
)" \
      || fail "Theme setup was cancelled."
  fi
  if [ -z "$TAGLINE" ]; then
    if [ "$(dreamskin_language)" = "zh" ]; then
      TAGLINE="把喜欢的画面变成可交互的 Codex 工作台。"
    else
      TAGLINE="Turn a favorite image into an interactive Codex workspace."
    fi
  fi
  if [ -z "$QUOTE" ]; then QUOTE="MAKE SOMETHING WONDERFUL"; fi

  /bin/mkdir -p "$THEME_DIR"
  /bin/chmod 700 "$THEME_DIR"
  image_name="background-$(/bin/date '+%Y%m%d-%H%M%S')-$$.jpg"
  temporary="$THEME_DIR/.${image_name}.tmp.jpg"
  prepared="$THEME_DIR/$image_name"
  cleanup_temporary() { /bin/rm -f "$temporary"; }
  trap cleanup_temporary EXIT
  /usr/bin/sips -s format jpeg -s formatOptions 84 -Z 3200 "$IMAGE" --out "$temporary" >/dev/null \
    || fail "macOS could not convert the selected image. Use PNG, JPEG, HEIC, TIFF, or WebP."
  [ -s "$temporary" ] || fail "The converted image is empty."
  PREPARED_BYTES="$(/usr/bin/stat -f '%z' "$temporary")"
  [ "$PREPARED_BYTES" -le 10485760 ] || fail "The prepared image is larger than 10 MB. Choose a simpler or smaller image."
  /bin/mv -f "$temporary" "$prepared"
  /bin/chmod 600 "$prepared"

  "$NODE" "$SCRIPT_DIR/write-theme.mjs" custom \
    --output-dir "$THEME_DIR" --image "$image_name" \
    --name "$THEME_NAME" --tagline "$TAGLINE" --quote "$QUOTE" \
    --accent "$ACCENT" --secondary "$SECONDARY" --highlight "$HIGHLIGHT"
  /usr/bin/find "$THEME_DIR" -maxdepth 1 -type f -name 'background-*' ! -name "$image_name" -delete
  trap - EXIT
fi

if [ "$APPLY_NOW" = "true" ]; then
  "$SCRIPT_DIR/start-dream-skin-macos.sh" --port 9341 --prompt-restart
fi

printf 'Codex Dream Skin Studio theme is ready.\n'
