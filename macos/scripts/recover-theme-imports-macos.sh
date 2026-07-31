#!/bin/bash

# Recover or finish a journaled saved-theme replacement before menus enumerate it.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

ensure_state_root
THEMES_ROOT="$STATE_ROOT/themes"
/bin/mkdir -p "$THEMES_ROOT"
/bin/chmod 700 "$THEMES_ROOT"
ensure_node_runtime
"$NODE" "$SCRIPT_DIR/publish-theme-import.mjs" --recover "$THEMES_ROOT"
