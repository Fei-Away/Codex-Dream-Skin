#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PET_DIR="$HOME/.codex/pets/dream-skin-sky-garden-duo"
MARKER="$PET_DIR/.codex-dream-skin-pet"
if [ ! -e "$PET_DIR" ]; then
  printf 'Sky Garden Duo is not installed.\n'
  exit 0
fi
[ -f "$MARKER" ] || fail "Refusing to remove a pet directory not owned by Dream Skin: $PET_DIR"
/bin/rm -rf "$PET_DIR"
printf 'Removed the Dream Skin managed Sky Garden Duo pet. The theme remains installed.\n'
