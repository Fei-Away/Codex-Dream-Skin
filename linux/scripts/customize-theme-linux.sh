#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

# Create a theme from a selected image using the built-in image analyzer.
# Usage: customize-theme-linux.sh [--name NAME] IMAGE_PATH
NAME=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --name) NAME="${2:-}"; shift 2 ;;
    *) IMAGE_PATH="$1"; shift ;;
  esac
done

[ -n "${IMAGE_PATH:-}" ] || { printf 'Usage: customize-theme-linux.sh [--name NAME] IMAGE_PATH\n' >&2; exit 2; }
[ -f "$IMAGE_PATH" ] || { printf 'Image file not found: %s\n' "$IMAGE_PATH" >&2; exit 2; }

ensure_node_runtime
ensure_state_root

if [ -z "$NAME" ]; then
  NAME="$(basename "$IMAGE_PATH" | sed 's/\.[^.]*$//')"
fi

# Use the shared image-metadata + stage-theme pipeline
"$NODE" "$SCRIPT_DIR/../runtime/image-metadata.mjs" "$IMAGE_PATH" > /dev/null 2>&1 \
  || { printf 'Failed to read image metadata: %s\n' "$IMAGE_PATH" >&2; exit 1; }

"$NODE" "$SCRIPT_DIR/stage-theme.mjs" --name "$NAME" --image "$IMAGE_PATH" \
  --theme-dir "$THEME_DIR" --state-path "$STATE_PATH" \
  --injector "$INJECTOR" --node "$NODE" --skin-version "$SKIN_VERSION" \
  2>>"$START_ERROR_LOG" || {
    printf 'Failed to stage theme from image: %s\n' "$IMAGE_PATH" >&2
    exit 1
  }

printf 'Theme "%s" created from %s\n' "$NAME" "$IMAGE_PATH"
