#!/bin/bash

set -euo pipefail
# Resolve symlinks so the script works when called via /usr/local/bin/dream-skin
_SCRIPT_REAL="$(readlink -f "$0" 2>/dev/null || printf '%s' "$0")"
. "$(cd "$(dirname "$_SCRIPT_REAL")" && pwd -P)/common-linux.sh"

ACTION="${1:-status}"
shift || true

case "$ACTION" in
  start)
    "$SCRIPT_DIR/start-dream-skin-linux.sh" "$@"
    ;;
  stop|restore)
    "$SCRIPT_DIR/restore-dream-skin-linux.sh" "$@"
    ;;
  pause)
    if [ -f "$STATE_PATH" ]; then
      "$NODE" "$INJECTOR" --pause --port "$(state_field port 2>/dev/null || echo 9335)" \
        2>>"$INJECTOR_ERROR_LOG" || true
      mark_state_stale || true
      printf 'Codex Dream Skin paused.\n'
    else
      printf 'Codex Dream Skin is not currently active.\n'
    fi
    ;;
  resume)
    if [ -f "$STATE_PATH" ]; then
      "$NODE" "$INJECTOR" --resume --port "$(state_field port 2>/dev/null || echo 9335)" \
        2>>"$INJECTOR_ERROR_LOG" || true
      mark_state_active || true
      printf 'Codex Dream Skin resumed.\n'
    else
      printf 'Codex Dream Skin is not currently active.\n'
    fi
    ;;
  status|"")
    "$SCRIPT_DIR/status-dream-skin-linux.sh" "$@"
    ;;
  verify)
    "$SCRIPT_DIR/verify-dream-skin-linux.sh" "$@"
    ;;
  *)
    printf 'Usage: dream-skin {start|stop|pause|resume|status|verify}\n' >&2
    exit 2
    ;;
esac
