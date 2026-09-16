#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

ensure_node_runtime
ensure_state_root

ACTION="${1:-}"
shift || true

case "$ACTION" in
  pause)
    write_operation_state pausing "$(dreamskin_text theme_paused)" "" || true
    "$NODE" "$INJECTOR" --pause --port "$(state_field port 2>/dev/null || echo 9335)" \
      2>>"$INJECTOR_ERROR_LOG" || true
    mark_state_stale || true
    printf 'Codex Dream Skin paused.\n'
    ;;
  resume)
    "$NODE" "$INJECTOR" --resume --port "$(state_field port 2>/dev/null || echo 9335)" \
      2>>"$INJECTOR_ERROR_LOG" || true
    mark_state_active || true
    printf 'Codex Dream Skin resumed.\n'
    ;;
  *)
    printf 'Usage: pause-dream-skin-linux.sh {pause|resume}\n' >&2
    exit 2
    ;;
esac
