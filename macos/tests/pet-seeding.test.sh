#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-pet-tests.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

EXPECTED_SPRITESHEET_SHA256="305ae23112b82a2e46e3c20db302d6ab7faea88dbfa796195222a063c46a95d3"
ACTUAL_SPRITESHEET_SHA256="$(/usr/bin/shasum -a 256 \
  "$ROOT/pets/dream-skin-sky-garden-duo/spritesheet.webp" | /usr/bin/awk '{print $1}')"
[ "$ACTUAL_SPRITESHEET_SHA256" = "$EXPECTED_SPRITESHEET_SHA256" ] || {
  /usr/bin/printf 'Unexpected Sky Garden Duo spritesheet: %s\n' "$ACTUAL_SPRITESHEET_SHA256" >&2
  exit 1
}

/usr/bin/env HOME="$TMP/owned-home" /bin/bash -c '
  set -euo pipefail
  . "$1/scripts/common-macos.sh"
  pets="$HOME/.codex/pets"
  /bin/mkdir -p "$pets/unrelated-pet"
  /usr/bin/printf "%s\n" keep > "$pets/unrelated-pet/sentinel"
  seed_bundled_pets
  /usr/bin/printf "%s\n" stale > "$pets/dream-skin-sky-garden-duo/spritesheet.webp"
  seed_bundled_pets
  [ -f "$pets/dream-skin-sky-garden-duo/.codex-dream-skin-pet" ]
  [ -f "$pets/dream-skin-sky-garden-duo/pet.json" ]
  [ -s "$pets/dream-skin-sky-garden-duo/spritesheet.webp" ]
  ! /usr/bin/grep -F -q stale "$pets/dream-skin-sky-garden-duo/spritesheet.webp"
  [ -f "$pets/unrelated-pet/sentinel" ]
' _ "$ROOT"

/usr/bin/env HOME="$TMP/conflict-home" /bin/bash -c '
  set -euo pipefail
  . "$1/scripts/common-macos.sh"
  pet="$HOME/.codex/pets/dream-skin-sky-garden-duo"
  /bin/mkdir -p "$pet"
  /usr/bin/printf "%s\n" user-owned > "$pet/sentinel"
  seed_bundled_pets
  [ -f "$pet/sentinel" ]
  [ ! -e "$pet/.codex-dream-skin-pet" ]
  [ ! -e "$pet/pet.json" ]
' _ "$ROOT"

/usr/bin/printf '%s\n' 'PASS: bundled pet seeding is idempotent and preserves user-owned pets.'
