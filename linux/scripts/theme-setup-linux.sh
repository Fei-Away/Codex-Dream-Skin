#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

ACTION="${1:-}"
shift || true

# Reuse macOS theme-config.mjs for the TOML manipulation
CONFIGURE_NODE="$NODE"
CONFIG_PATH_ARG="${CONFIG_PATH}"
BACKUP_PATH_ARG="${THEME_BACKUP_PATH}"

case "$ACTION" in
  backup)
    # Save current appearance settings before they get modified
    if [ -f "$CONFIG_PATH_ARG" ]; then
      python3 -c "
import json, re
config = open('$CONFIG_PATH_ARG').read()
backup = {}
for key in ['appearanceTheme', 'appearanceDarkCodeThemeId']:
    m = re.search(r'^' + key + r'\s*=\s*[\"']([^\"']*)[\"']', config, re.MULTILINE)
    backup[key] = m.group(1) if m else None
open('$BACKUP_PATH_ARG', 'w').write(json.dumps(backup))
" 2>/dev/null || true
      chmod 600 "$BACKUP_PATH_ARG"
      printf 'Appearance settings backed up to %s\n' "$BACKUP_PATH_ARG"
    else
      printf 'Codex config not found at %s\n' "$CONFIG_PATH_ARG"
    fi
    ;;
  *)
    printf 'Usage: theme-setup {backup}\n' >&2
    exit 2
    ;;
esac
