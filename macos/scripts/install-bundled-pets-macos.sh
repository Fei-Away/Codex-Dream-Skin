#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

seed_bundled_pets
printf 'Bundled Codex pets are installed under %s. Refresh Settings > Pets to discover them.\n' \
  "$HOME/.codex/pets"
