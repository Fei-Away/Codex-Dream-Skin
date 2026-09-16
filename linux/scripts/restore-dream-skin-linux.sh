#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

# Restore the original Codex appearance by removing the injected CSS and stopping the injector.
# This does NOT modify the official app bundle or app.asar.

discover_codex_app
require_linux_runtime
ensure_state_root

stop_recorded_injector || true

# Sync Codex appearance back to original (if backup exists)
if [ -f "$CONFIG_PATH" ] && [ -f "$THEME_BACKUP_PATH" ]; then
  "$NODE" "$SCRIPT_DIR/theme-config.mjs" restore "$CONFIG_PATH" "$THEME_BACKUP_PATH" 2>/dev/null || true
fi

# Clean up state
rm -f "$STATE_PATH"
rm -f "$OPERATION_STATE_PATH"
rm -f "$STATE_ROOT/operation-control-ack.json"
rm -f "$INJECTOR_LOG" "$INJECTOR_ERROR_LOG"

printf 'Codex Dream Skin has been restored. Original appearance is active.\n'
