#!/bin/bash

# Dynamically load one pure image as the active theme.
# Hot-applies when CDP is already open (fast).

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

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
  case "$FROM_LIBRARY" in
    */*|.|..) fail "Invalid image library name: $FROM_LIBRARY" ;;
  esac
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
  /usr/bin/osascript -e "display notification \"$*\" with title \"Codex Dream Skin\"" >/dev/null 2>&1 || true
}

progress "Loading image..."

# Fast Node for write-theme (avoid full codesign when possible)
ensure_node_runtime

image_name="background.jpg"
staged="$(/usr/bin/mktemp -d "$STATE_ROOT/theme.import.XXXXXX")"
previous="$(/usr/bin/mktemp -d "$STATE_ROOT/theme.previous.XXXXXX")"
/bin/rmdir "$previous"
temporary="$staged/.${image_name}.tmp.jpg"
prepared="$staged/$image_name"
cleanup_import() {
  /bin/rm -rf "$staged" "$previous"
}
trap cleanup_import EXIT

# Prefer copying already-JPEG; sips only when needed (large PNG conversion is the slow part)
ext="$(printf '%s' "$IMAGE" | /usr/bin/tr '[:upper:]' '[:lower:]')"
case "$ext" in
  *.jpg|*.jpeg)
    /bin/cp -f "$IMAGE" "$prepared"
    ;;
  *)
    /usr/bin/sips -s format jpeg -s formatOptions 82 -Z 2400 "$IMAGE" --out "$temporary" >/dev/null \
      || fail "Could not convert image. Use PNG/JPEG/HEIC/TIFF/WebP."
    [ -s "$temporary" ] || fail "Converted image is empty."
    /bin/mv -f "$temporary" "$prepared"
    ;;
esac

PREPARED_BYTES="$(/usr/bin/stat -f '%z' "$prepared")"
[ "$PREPARED_BYTES" -le 16777216 ] || fail "Prepared image larger than 16 MB."
/bin/chmod 600 "$prepared"

"$NODE" "$SCRIPT_DIR/write-theme.mjs" custom \
  --output-dir "$staged" --image "$image_name" \
  --name "$THEME_NAME" \
  --tagline "dynamic pure background" \
  --quote "MAKE SOMETHING WONDERFUL" \
  --accent "#E25563" --secondary "#F3A8AF" --highlight "#C93D4C" >/dev/null
"$NODE" "$INJECTOR" --check-payload --theme-dir "$staged" >/dev/null

dest_lib_img="$IMAGES_DIR/$(/usr/bin/basename "$IMAGE")"
src_dir="$(cd "$(dirname "$IMAGE")" && pwd -P)"
img_dir="$(cd "$IMAGES_DIR" && pwd -P)"
if [ "$src_dir/$(/usr/bin/basename "$IMAGE")" != "$img_dir/$(/usr/bin/basename "$IMAGE")" ]; then
  /bin/cp -f "$IMAGE" "$dest_lib_img" 2>/dev/null || true
fi

if [ -e "$THEME_DIR" ]; then /bin/mv "$THEME_DIR" "$previous"; fi
if ! /bin/mv "$staged" "$THEME_DIR"; then
  [ ! -e "$previous" ] || /bin/mv "$previous" "$THEME_DIR"
  fail "Could not activate imported image theme."
fi
/bin/rm -rf "$previous"
trap - EXIT

lib_dir="$THEMES_ROOT/$theme_id"
/bin/mkdir -p "$lib_dir"
/bin/cp -f "$THEME_DIR/$image_name" "$THEME_DIR/theme.json" "$lib_dir/"
/bin/chmod 600 "$lib_dir/"* 2>/dev/null || true

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

/usr/bin/osascript -e 'display alert "Codex Dream Skin" message "Image saved but inject failed. Click Apply Skin."' >/dev/null 2>&1 || true
exit 1
