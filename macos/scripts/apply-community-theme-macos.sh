#!/bin/bash

# Hold one cross-process lock across snapshot, apply, and verified rollback.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"
. "$SCRIPT_DIR/theme-switch-lock-macos.sh"

THEME_ID=""
EXPECTED_CONTENT_FINGERPRINT=""
EXPECTED_ACTIVE_THEME_ID=""
TRANSACTION_ROOT=""

finish_transaction() {
  release_theme_switch_lock
}
trap finish_transaction EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --id) THEME_ID="${2:-}"; shift 2 ;;
    --expect-fingerprint) EXPECTED_CONTENT_FINGERPRINT="${2:-}"; shift 2 ;;
    --expect-active-id) EXPECTED_ACTIVE_THEME_ID="${2:-}"; shift 2 ;;
    --transaction-root) TRANSACTION_ROOT="${2:-}"; shift 2 ;;
    *) fail "Unknown community apply argument: $1" ;;
  esac
done

case "$THEME_ID" in
  ''|.*|*[!A-Za-z0-9._-]*) fail "Community theme id is invalid." ;;
esac
[ "${#THEME_ID}" -le 80 ] || fail "Community theme id is invalid."
case "$EXPECTED_CONTENT_FINGERPRINT" in
  ''|*[!0-9a-f]*) fail "Community theme content fingerprint is invalid." ;;
esac
[ "${#EXPECTED_CONTENT_FINGERPRINT}" -eq 64 ] \
  || fail "Community theme content fingerprint is invalid."
case "$EXPECTED_ACTIVE_THEME_ID" in
  ''|.*|*[!A-Za-z0-9._-]*) fail "Expected active theme id is invalid." ;;
esac
[ "${#EXPECTED_ACTIVE_THEME_ID}" -le 80 ] || fail "Expected active theme id is invalid."

ensure_state_root
case "$TRANSACTION_ROOT" in
  "$STATE_ROOT"/.community-apply-*) ;;
  *) fail "Community apply transaction root escapes its reserved namespace." ;;
esac
[ -d "$TRANSACTION_ROOT" ] && [ ! -L "$TRANSACTION_ROOT" ] \
  || fail "Community apply transaction root is missing or invalid."
transaction_root_real="$(cd "$TRANSACTION_ROOT" && pwd -P)"
state_root_real="$(cd "$STATE_ROOT" && pwd -P)"
case "$transaction_root_real/" in "$state_root_real/.community-apply-"*/) ;; *) fail "Community apply transaction root escapes its reserved namespace." ;; esac

LOCK_TOKEN="$(new_operation_token)"
acquire_theme_switch_lock "$LOCK_TOKEN"
ensure_node_runtime
STATUS_RESULT="$("$SCRIPT_DIR/status-dream-skin-macos.sh" --json --deep)" \
  || fail "The current skin state could not be checked before community apply."
ROLLBACK_PORT="$("$NODE" -e '
const fs = require("fs");
const [statusJSON, statePath, expectedThemeID] = process.argv.slice(1);
const status = JSON.parse(statusJSON);
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
if (status.session !== "active"
    || status.operation !== ""
    || status.injectorAlive !== true
    || status.cdpOk !== true
    || status.codexRunning !== true
    || status.themeId !== expectedThemeID
    || status.appliedThemeId !== expectedThemeID
    || state.session !== "active"
    || state.appliedThemeId !== expectedThemeID
    || typeof state.verifiedAt !== "string"
    || state.verifiedAt.length === 0
    || !Number.isInteger(status.port)
    || status.port < 1
    || status.port > 65535) process.exit(1);
process.stdout.write(String(status.port));
' "$STATUS_RESULT" "$STATE_PATH" "$EXPECTED_ACTIVE_THEME_ID")" \
  || fail "The visible skin changed or is no longer verified; community apply was cancelled before changing it."
ROLLBACK_SNAPSHOT="$TRANSACTION_ROOT/active-before"

/usr/bin/printf '%s\n' 'Saving the exact active theme for rollback...' >&2
SNAPSHOT_RESULT="$(
  "$SCRIPT_DIR/snapshot-active-theme-macos.sh" \
    --destination "$ROLLBACK_SNAPSHOT" \
    --lock-token "$LOCK_TOKEN"
)" || fail "The active theme could not be captured before community apply."
ROLLBACK_FINGERPRINT="$("$NODE" -e '
const value = JSON.parse(process.argv[1]);
if (!/^[0-9a-f]{64}$/.test(value.contentFingerprint ?? "")) process.exit(1);
process.stdout.write(value.contentFingerprint);
' "$SNAPSHOT_RESULT")" || fail "The rollback snapshot identity is invalid."

/usr/bin/printf '%s\n' 'Verifying the rollback snapshot against the current visible renderer...' >&2
"$NODE" "$INJECTOR" --verify \
  --port "$ROLLBACK_PORT" \
  --theme-dir "$ROLLBACK_SNAPSHOT" \
  --timeout-ms 12000 >/dev/null \
  || fail "The rollback snapshot does not exactly match the current visible renderer; community apply was cancelled before switching themes."

/usr/bin/printf '%s\n' 'Applying the imported community theme...' >&2
if "$SCRIPT_DIR/switch-theme-macos.sh" \
  --id "$THEME_ID" \
  --expect-fingerprint "$EXPECTED_CONTENT_FINGERPRINT" \
  --lock-token "$LOCK_TOKEN"; then
  /usr/bin/printf '%s\n' 'Community theme applied and visibly verified.' >&2
  exit 0
else
  apply_code="$?"
fi

/usr/bin/printf 'Community theme apply failed with exit %s; restoring the exact active snapshot...\n' \
  "$apply_code" >&2
if "$SCRIPT_DIR/switch-theme-macos.sh" \
  --snapshot-dir "$ROLLBACK_SNAPSHOT" \
  --expect-fingerprint "$ROLLBACK_FINGERPRINT" \
  --lock-token "$LOCK_TOKEN"; then
  /usr/bin/printf '%s\n' 'The previous active theme was reapplied and visibly verified.' >&2
  exit 20
fi

/usr/bin/printf '%s\n' 'The previous active theme could not be reapplied and visibly verified.' >&2
exit 21
