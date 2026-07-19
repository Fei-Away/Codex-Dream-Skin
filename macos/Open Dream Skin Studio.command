#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
INSTALLED="$HOME/.codex/codex-dream-skin-studio/scripts/open-web-studio-macos.sh"
if [ -x "$INSTALLED" ]; then exec "$INSTALLED"; fi
exec "$ROOT/scripts/open-web-studio-macos.sh"
