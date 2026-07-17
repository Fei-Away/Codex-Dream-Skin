#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

REQUIRE_LIVE="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --require-live) REQUIRE_LIVE="true"; shift ;;
    *) fail "Unknown doctor argument: $1" ;;
  esac
done

discover_codex_app
require_macos_runtime
[ -f "$CONFIG_PATH" ] || fail "Codex config not found: $CONFIG_PATH"
for required in \
  "$PROJECT_ROOT/assets/dream-skin.css" \
  "$PROJECT_ROOT/assets/renderer-inject.js" \
  "$PROJECT_ROOT/assets/theme.json" \
  "$PROJECT_ROOT/scripts/injector.mjs"; do
  [ -s "$required" ] || fail "Required project file is missing or empty: $required"
done

if [ -f "$THEME_DIR/theme.json" ]; then
  PAYLOAD_JSON="$("$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR")"
else
  PAYLOAD_JSON="$("$NODE" "$INJECTOR" --check-payload)"
fi
RECOVERY_ENABLED="false"
RECOVERY_PLIST_VALID="false"
if [ -f "$RECOVERY_ENABLED_PATH" ]; then
  RECOVERY_ENABLED="true"
  [ -f "$RECOVERY_PLIST_PATH" ] || fail "Reopen recovery is enabled but its LaunchAgent plist is missing."
  recovery_arg0="$(/usr/bin/plutil -extract ProgramArguments.0 raw -o - "$RECOVERY_PLIST_PATH" 2>/dev/null)" \
    || fail "Reopen recovery LaunchAgent is invalid or unsafe."
  recovery_arg1="$(/usr/bin/plutil -extract ProgramArguments.1 raw -o - "$RECOVERY_PLIST_PATH" 2>/dev/null)" \
    || fail "Reopen recovery LaunchAgent is invalid or unsafe."
  recovery_arg2="$(/usr/bin/plutil -extract ProgramArguments.2 raw -o - "$RECOVERY_PLIST_PATH" 2>/dev/null)" \
    || fail "Reopen recovery LaunchAgent is invalid or unsafe."
  [ "$recovery_arg0" = "/bin/bash" ] \
    || fail "Reopen recovery LaunchAgent is invalid or unsafe."
  [ "$recovery_arg1" = "$PROJECT_ROOT/scripts/watch-dream-skin-macos.sh" ] \
    || [ "$recovery_arg1" = "$INSTALL_ROOT/scripts/watch-dream-skin-macos.sh" ] \
    || fail "Reopen recovery LaunchAgent is invalid or unsafe."
  [ "$recovery_arg2" = "--watch" ] \
    || fail "Reopen recovery LaunchAgent is invalid or unsafe."
  if /usr/bin/plutil -extract ProgramArguments.3 raw -o - "$RECOVERY_PLIST_PATH" >/dev/null 2>&1; then
    fail "Reopen recovery LaunchAgent is invalid or unsafe."
  fi
  case "$recovery_arg0 $recovery_arg1 $recovery_arg2" in
    *remote-debugging*|*ChatGPT*|*Codex.app*) fail "Reopen recovery LaunchAgent is invalid or unsafe." ;;
  esac
  RECOVERY_PLIST_VALID="true"
fi
PORT=9341
if [ -f "$STATE_PATH" ]; then
  PORT="$(state_field port)"
fi
LIVE="false"
if [ -f "$STATE_PATH" ] && verified_cdp_endpoint "$PORT"; then
  if [ -f "$THEME_DIR/theme.json" ]; then
    "$NODE" "$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 12000 >/dev/null
  else
    "$NODE" "$INJECTOR" --verify --port "$PORT" --timeout-ms 12000 >/dev/null
  fi
  LIVE="true"
fi
[ "$REQUIRE_LIVE" = "false" ] || [ "$LIVE" = "true" ] || fail "No verified live Dream Skin session is active."

"$NODE" -e '
  const payload = JSON.parse(process.argv[1]);
  const result = {
    pass: true,
    product: "Codex Dream Skin Studio",
    version: process.argv[2],
    platform: `darwin-${process.argv[3]}`,
    codexVersion: process.argv[4],
    codexTeamId: process.argv[5],
    nodeVersion: process.argv[6],
    officialAppSignatureValid: true,
    modifiesAppAsar: false,
    live: process.argv[7] === "true",
    port: Number(process.argv[8]),
    theme: {
      id: payload.themeId,
      name: payload.themeName,
      imageBytes: payload.imageBytes,
      payloadBytes: payload.payloadBytes,
    },
    reopenRecovery: {
      enabled: process.argv[9] === "true",
      plistValid: process.argv[10] === "true",
    },
  };
  console.log(JSON.stringify(result, null, 2));
' "$PAYLOAD_JSON" "$SKIN_VERSION" "$(/usr/bin/uname -m)" "$CODEX_VERSION" "$CODEX_TEAM_ID" "$NODE_VERSION" "$LIVE" "$PORT" "$RECOVERY_ENABLED" "$RECOVERY_PLIST_VALID"
