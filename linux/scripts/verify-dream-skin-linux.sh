#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

discover_codex_app 2>/dev/null || true
if [ ! -f "$STATE_PATH" ]; then
  printf 'No active Dream Skin session.\n'
  exit 1
fi

PORT="$(state_field port 2>/dev/null || echo "")"
[ -n "$PORT" ] || { printf 'State file is damaged; missing port.\n' >&2; exit 1; }

"$NODE" "$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 12000
verify_exit=$?

if [ "$verify_exit" -ne 0 ]; then
  printf 'Verification failed (exit %s).\n' "$verify_exit" >&2
  exit "$verify_exit"
fi

# Check document readiness markers
PASS="$("$NODE" "$INJECTOR" --check-payload --port "$PORT" --theme-dir "$THEME_DIR" 2>/dev/null || true)"
if [ -z "$PASS" ]; then
  printf 'Theme payload verification passed.\n'
else
  printf '%s\n' "$PASS"
fi
printf 'Codex Dream Skin v%s verification passed.\n' "$SKIN_VERSION"
