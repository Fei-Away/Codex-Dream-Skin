#!/bin/bash

# Dynamically load one pure image as the active theme.
# Hot-applies when CDP is already open (fast).

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
UI_SCRIPT="$SCRIPT_DIR/ui-macos.applescript"

IMAGE=""
THEME_NAME=""
FROM_LIBRARY=""
APPLY_NOW="true"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --file) IMAGE="${2:-}"; shift 2 ;;
    --from-library) FROM_LIBRARY="${2:-}"; shift 2 ;;
    --name) THEME_NAME="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

ensure_state_root
IMAGES_DIR="$STATE_ROOT/images"
THEMES_ROOT="$STATE_ROOT/themes"
/bin/mkdir -p "$IMAGES_DIR" "$THEMES_ROOT" "$THEME_DIR"

if [ -n "$FROM_LIBRARY" ]; then
  IMAGE="$IMAGES_DIR/$FROM_LIBRARY"
fi

[ -n "$IMAGE" ] || fail "Pass --file <image> or --from-library <name-in-images-dir>"
[ -f "$IMAGE" ] || fail "Image not found: $IMAGE"

case "$IMAGE" in
  *.png|*.PNG|*.jpg|*.JPG|*.jpeg|*.JPEG|*.webp|*.WEBP|*.heic|*.HEIC|*.tif|*.tiff|*.TIF|*.TIFF) ;;
  *) fail "Unsupported image type: $IMAGE" ;;
esac

SOURCE_BYTES="$(/usr/bin/stat -f '%z' "$IMAGE")"
[ "$SOURCE_BYTES" -le 52428800 ] || fail "Image larger than 50 MB."

if [ -z "$THEME_NAME" ]; then
  base="$(/usr/bin/basename "$IMAGE")"
  THEME_NAME="${base%.*}"
fi
THEME_NAME="$(printf '%s' "$THEME_NAME" | /usr/bin/tr -d '\n' | /usr/bin/cut -c1-80)"
[ -n "$THEME_NAME" ] || THEME_NAME="我的主题"

theme_id="img-$(/bin/date '+%Y%m%d%H%M%S')-$$"

progress() {
  printf '%s\n' "$*" >&2
  /usr/bin/osascript "$UI_SCRIPT" notify "$*" >/dev/null 2>&1 || true
}

progress "Loading image..."

# Fast Node for write-theme (avoid full codesign when possible)
ensure_node_runtime

image_name="background.jpg"
temporary="$THEME_DIR/.${image_name}.tmp.jpg"
prepared="$THEME_DIR/$image_name"
/bin/rm -f "$THEME_DIR"/background.* "$THEME_DIR"/.*.tmp.jpg 2>/dev/null || true

# Prefer copying already-JPEG; sips only when needed (large PNG conversion is the slow part)
ext="$(printf '%s' "$IMAGE" | /usr/bin/tr '[:upper:]' '[:lower:]')"
case "$ext" in
  *.jpg|*.jpeg)
    /bin/cp -f "$IMAGE" "$prepared"
    /bin/chmod 600 "$prepared"
    ;;
  *)
    /usr/bin/sips -s format jpeg -s formatOptions 82 -Z 2400 "$IMAGE" --out "$temporary" >/dev/null \
      || fail "Could not convert image. Use PNG/JPEG/HEIC/TIFF/WebP."
    [ -s "$temporary" ] || fail "Converted image is empty."
    PREPARED_BYTES="$(/usr/bin/stat -f '%z' "$temporary")"
    [ "$PREPARED_BYTES" -le 16777216 ] || fail "Prepared image larger than 16 MB."
    /bin/mv -f "$temporary" "$prepared"
    /bin/chmod 600 "$prepared"
    ;;
esac

"$NODE" "$SCRIPT_DIR/write-theme.mjs" custom \
  --output-dir "$THEME_DIR" --image "$image_name" \
  --name "$THEME_NAME" \
  --tagline "dynamic pure background" \
  --quote "MAKE SOMETHING WONDERFUL" \
  --accent "#E25563" --secondary "#F3A8AF" --highlight "#C93D4C" >/dev/null

lib_dir="$THEMES_ROOT/$theme_id"
/bin/mkdir -p "$lib_dir"
/bin/cp -f "$THEME_DIR/$image_name" "$THEME_DIR/theme.json" "$lib_dir/"
/bin/chmod 600 "$lib_dir/"* 2>/dev/null || true

dest_lib_img="$IMAGES_DIR/$(/usr/bin/basename "$IMAGE")"
src_dir="$(cd "$(dirname "$IMAGE")" && pwd -P)"
img_dir="$(cd "$IMAGES_DIR" && pwd -P)"
if [ "$src_dir/$(/usr/bin/basename "$IMAGE")" != "$img_dir/$(/usr/bin/basename "$IMAGE")" ]; then
  /bin/cp -f "$IMAGE" "$dest_lib_img" 2>/dev/null || true
fi

if [ "$APPLY_NOW" != "true" ]; then
  progress "Ready: ${THEME_NAME} (not applied)"
  exit 0
fi

PORT=9341
if [ -f "$STATE_PATH" ]; then
  saved="$(state_field port 2>/dev/null || true)"
  [ -n "${saved:-}" ] && PORT="$saved"
fi

progress "Hot reapply..."
if hot_reapply_theme "$PORT" 8000; then
  progress "Done: ${THEME_NAME}"
  exit 0
fi

progress "CDP not ready, full start..."
if "$SCRIPT_DIR/start-dream-skin-macos.sh" --port "$PORT" --restart-existing; then
  progress "Done: ${THEME_NAME}"
  exit 0
fi

/usr/bin/osascript "$UI_SCRIPT" alert "Image saved but inject failed. Click Apply Skin." >/dev/null 2>&1 || true
exit 1
