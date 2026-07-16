#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
exec "$ROOT/scripts/build-unified-release.sh" "$HOME/Desktop/Codex-Dongge-Skin-Pack.zip"
