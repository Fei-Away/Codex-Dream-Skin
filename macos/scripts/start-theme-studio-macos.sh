#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

discover_codex_app
require_macos_runtime
ensure_state_root
PORT="$(select_available_port 9342)"
exec "$NODE" "$SCRIPT_DIR/theme-studio-server.mjs" \
  --port "$PORT" \
  --root "$PROJECT_ROOT" \
  --state-root "$STATE_ROOT" \
  --open
