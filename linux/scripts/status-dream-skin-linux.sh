#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

discover_codex_app 2>/dev/null || true
if [ -f "$STATE_PATH" ]; then
  PORT="$(state_field port 2>/dev/null || echo "")"
  SESSION="$(state_field session 2>/dev/null || echo "")"
  THEME_ID="$(state_field appliedThemeId 2>/dev/null || echo "")"
  THEME_NAME="$(state_field appliedThemeName 2>/dev/null || echo "")"
  INJECTOR_PID="$(state_field injectorPid 2>/dev/null || echo "")"
  SKIN_VERSION="$(state_field skinVersion 2>/dev/null || echo "$SKIN_VERSION")"
else
  PORT=""
  SESSION="inactive"
  THEME_ID=""
  THEME_NAME=""
  INJECTOR_PID=""
  SKIN_VERSION="$SKIN_VERSION"
fi

# Check live status
LIVE="false"
if [ -n "$PORT" ] && verified_cdp_endpoint "$PORT" 2>/dev/null; then
  LIVE="true"
fi
if [ -z "$PORT" ] && [ -n "${CODEX_EXE:-}" ]; then
  if codex_is_running 2>/dev/null; then
    # Try to find CDP port from state or probe defaults
    for probe_port in 9335 9341; do
      if verified_cdp_endpoint "$probe_port" 2>/dev/null; then
        PORT="$probe_port"
        LIVE="true"
        break
      fi
    done
  fi
fi

case "$SESSION" in
  active) printf 'Status: %s\n' "$(dreamskin_text status_active)";;
  paused) printf 'Status: %s\n' "$(dreamskin_text status_paused)";;
  stale|*)  printf 'Status: %s\n' "$(dreamskin_text status_inactive)";;
esac
[ -n "$PORT" ] && printf 'Port:    %s\n' "$PORT"
[ -n "$LIVE" ] && [ "$LIVE" = "true" ] && printf 'Live:    yes\n'
[ -n "$THEME_NAME" ] && printf 'Theme:   %s (%s)\n' "$THEME_NAME" "$THEME_ID"
[ -n "$SKIN_VERSION" ] && printf 'Version: %s\n' "$SKIN_VERSION"
[ -n "$INJECTOR_PID" ] && [ "$INJECTOR_PID" != "0" ] && \
  [ -d "/proc/$INJECTOR_PID" ] && printf 'Injector: running (PID %s)\n' "$INJECTOR_PID" \
  || printf 'Injector: stopped\n'
