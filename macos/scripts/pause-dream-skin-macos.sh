#!/bin/bash

# Soft-off: remove the live skin and stop the injector. Does not restart Codex
# and does not restore the official base theme backup.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9341
PORT_EXPLICIT="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; PORT_EXPLICIT="true"; shift 2 ;;
    *) fail "Unknown pause argument: $1" ;;
  esac
done

discover_codex_app
require_macos_runtime
ensure_state_root

if [ "$PORT_EXPLICIT" = "false" ] && [ -f "$STATE_PATH" ]; then
  saved_port="$(state_field port 2>/dev/null || true)"
  [ -n "${saved_port:-}" ] && PORT="$saved_port"
fi

REMOVED="false"
# Drop any launchd job that would relaunch Codex with CDP after quit / quitting the menu bar.
release_codex_launchd_job || true
if [ -f "$STATE_PATH" ]; then
  stop_recorded_injector \
    || fail "Could not stop the recorded injector; pause state was not written."
fi

DEBUG_READY="false"
if verified_cdp_endpoint "$PORT" 2>/dev/null; then
  DEBUG_READY="true"
fi

if [ "$DEBUG_READY" = "true" ]; then
  "$NODE" "$INJECTOR" --remove --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 8000 >/dev/null \
    || fail "Could not remove the live skin from Codex."
  REMOVED="true"
fi

"$NODE" -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const port = Number(process.argv[2]);
  const themeDir = process.argv[3];
  const root = process.argv[4];
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const state = {
    ...prev,
    schemaVersion: 4,
    session: "paused",
    port,
    injectorPid: 0,
    injectorStartedAt: "",
    themeDir,
    projectRoot: root,
    pausedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
' "$STATE_PATH" "$PORT" "$THEME_DIR" "$PROJECT_ROOT"

if [ "$REMOVED" = "true" ]; then
  printf 'Codex Dream Skin paused (skin removed; Codex left running). Port %s may still be in debug mode.\n' "$PORT"
elif codex_is_running; then
  printf 'Codex Dream Skin paused (injector stopped). Live remove skipped: CDP on port %s not verified.\n' "$PORT"
else
  printf 'Codex Dream Skin paused (Codex is not running).\n'
fi
