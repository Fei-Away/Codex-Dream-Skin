#!/bin/bash

# Dynamically load one pure image as the active theme.
# Hot-applies when CDP is already open (fast).

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

IMAGE=""
THEME_NAME=""
FROM_LIBRARY=""
APPLY_NOW="true"
APPEARANCE="auto"
SAFE_AREA="auto"
TASK_MODE="auto"
FOCUS_X=""
FOCUS_Y=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --file) IMAGE="${2:-}"; shift 2 ;;
    --from-library) FROM_LIBRARY="${2:-}"; shift 2 ;;
    --name) THEME_NAME="${2:-}"; shift 2 ;;
    --appearance) APPEARANCE="${2:-}"; shift 2 ;;
    --safe-area) SAFE_AREA="${2:-}"; shift 2 ;;
    --task-mode) TASK_MODE="${2:-}"; shift 2 ;;
    --focus-x) FOCUS_X="${2:-}"; shift 2 ;;
    --focus-y) FOCUS_Y="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

case "$APPEARANCE" in auto|light|dark) ;; *) fail "Invalid appearance: $APPEARANCE" ;; esac
case "$SAFE_AREA" in auto|left|right|center|none) ;; *) fail "Invalid safe area: $SAFE_AREA" ;; esac
case "$TASK_MODE" in auto|ambient|banner|off) ;; *) fail "Invalid task mode: $TASK_MODE" ;; esac

ensure_state_root
IMAGES_DIR="$STATE_ROOT/images"
THEMES_ROOT="$STATE_ROOT/themes"
/bin/mkdir -p "$IMAGES_DIR" "$THEMES_ROOT" "$THEME_DIR"

if [ -n "$FROM_LIBRARY" ]; then
  [ "$(/usr/bin/basename "$FROM_LIBRARY")" = "$FROM_LIBRARY" ] \
    || fail "Library image must be a filename, not a path."
  case "$FROM_LIBRARY" in
    *$'\n'*|*$'\r'*|*'|'*|*'"'*|*'\'*) fail "Unsafe library image filename." ;;
  esac
  IMAGE="$IMAGES_DIR/$FROM_LIBRARY"
fi

[ -n "$IMAGE" ] || fail "Pass --file <image> or --from-library <name-in-images-dir>"
[ -f "$IMAGE" ] || fail "Image not found: $IMAGE"

case "$IMAGE" in
  *.png|*.PNG|*.jpg|*.JPG|*.jpeg|*.JPEG|*.webp|*.WEBP|*.heic|*.HEIC|*.tif|*.tiff|*.TIF|*.TIFF) ;;
  *) fail "Unsupported image type: $IMAGE" ;;
esac

SOURCE_BYTES="$(/usr/bin/stat -c '%s' "$IMAGE")"
[ "$SOURCE_BYTES" -le 52428800 ] || fail "Image larger than 50 MB."

if [ -z "$THEME_NAME" ]; then
  base="$(/usr/bin/basename "$IMAGE")"
  THEME_NAME="${base%.*}"
fi
[ -n "$THEME_NAME" ] || THEME_NAME="$(dreamskin_text default_theme_name)"

theme_id="img-$(/bin/date '+%Y%m%d%H%M%S')-$$"

progress() {
  printf '%s\n' "$*" >&2
  notify_user "$*"
}

progress "$(dreamskin_text loading_image)"

# Fast Node for write-theme (avoid full launch verification when possible)
ensure_node_runtime

# Reject decompression bombs before `sips -Z` rasterizes the full source image.
"$NODE" "$SCRIPT_DIR/check-image-dimensions.mjs" "$IMAGE" \
  || fail "Image dimensions are invalid or exceed the safe pixel budget (max 16384 px per side / 50 megapixels)."

image_name="background.jpg"
temporary="$THEME_DIR/.background.$$.tmp.jpg"
prepared="$THEME_DIR/$image_name"
cleanup_temporary() { /bin/rm -f "$temporary"; }
trap cleanup_temporary EXIT

# Prefer copying already-JPEG; ffmpeg only when needed (large PNG conversion is the slow part)
ext="$(printf '%s' "$IMAGE" | /usr/bin/tr '[:upper:]' '[:lower:]')"
case "$ext" in
  *.jpg|*.jpeg)
    /bin/cp -f "$IMAGE" "$temporary"
    ;;
  *)
    # macOS resamples with `sips -Z 2400 -s formatOptions 82`; this ffmpeg
    # equivalent caps every orientation at 2400 px (square images included)
    # without upscaling smaller sources and encodes JPEG in the same
    # high-quality band. The min() caps make force_original_aspect_ratio
    # decrease-only instead of filling a 2400x2400 box upward.
    [ -x /usr/bin/ffmpeg ] \
      || fail "ffmpeg is required to load custom images. Install it with: sudo apt install ffmpeg"
    /usr/bin/ffmpeg -y -loglevel error -i "$IMAGE" \
      -vf "scale='min(2400,iw)':'min(2400,ih)':force_original_aspect_ratio=decrease" \
      -q:v 3 "$temporary" >/dev/null \
      || fail "Could not convert image. Use PNG/JPEG/HEIC/TIFF/WebP."
    [ -s "$temporary" ] || fail "Converted image is empty."
    ;;
esac
[ -s "$temporary" ] || fail "Prepared image is empty."
PREPARED_BYTES="$(/usr/bin/stat -c '%s' "$temporary")"
[ "$PREPARED_BYTES" -le 10485760 ] || fail "Prepared image larger than 10 MB."
/bin/chmod 600 "$temporary"
/bin/mv -f "$temporary" "$prepared"

theme_args=(
  custom
  --output-dir "$THEME_DIR"
  --image "$image_name"
  --name "$THEME_NAME"
  --tagline "Make something wonderful."
  --quote "MAKE SOMETHING WONDERFUL"
  --appearance "$APPEARANCE"
  --safe-area "$SAFE_AREA"
  --task-mode "$TASK_MODE"
)
[ -n "$FOCUS_X" ] && theme_args+=(--focus-x "$FOCUS_X")
[ -n "$FOCUS_Y" ] && theme_args+=(--focus-y "$FOCUS_Y")
"$NODE" "$SCRIPT_DIR/write-theme.mjs" "${theme_args[@]}" >/dev/null
/usr/bin/find "$THEME_DIR" -maxdepth 1 -type f -name 'background.*' ! -name "$image_name" -delete
trap - EXIT

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
  progress "$(dreamskin_text theme_ready_not_applied): ${THEME_NAME}"
  exit 0
fi

PORT=9341
if [ -f "$STATE_PATH" ]; then
  saved="$(state_field port 2>/dev/null || true)"
  [ -n "${saved:-}" ] && PORT="$saved"
fi

progress "$(dreamskin_text hot_reload)"
if hot_reapply_theme "$PORT" 8000; then
  progress "$(dreamskin_text skin_applied): ${THEME_NAME}"
  exit 0
fi

progress "$(dreamskin_text starting_chatgpt_for_apply)"
if "$SCRIPT_DIR/start-dream-skin-linux.sh" --port "$PORT" --restart-existing; then
  progress "$(dreamskin_text skin_applied): ${THEME_NAME}"
  exit 0
fi

alert_user "$(dreamskin_text image_saved_apply_failed)"
exit 1
