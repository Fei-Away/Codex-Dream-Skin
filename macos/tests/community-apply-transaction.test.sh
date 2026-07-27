#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
TMP="$(/usr/bin/mktemp -d /tmp/dreamskin-community-transaction.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT
ENGINE="$TMP/engine"
SCRIPTS="$ENGINE/scripts"
/bin/mkdir -p "$SCRIPTS"
/bin/cp "$ROOT/scripts/apply-community-theme-macos.sh" "$SCRIPTS/"
/bin/cp "$ROOT/scripts/theme-switch-lock-macos.sh" "$SCRIPTS/"

/usr/bin/printf '%s\n' \
  '#!/bin/bash' \
  'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"' \
  'STATE_ROOT="$HOME/state"' \
  'STATE_PATH="$STATE_ROOT/state.json"' \
  'NODE="${NODE:?}"' \
  'INJECTOR="$SCRIPT_DIR/injector.mjs"' \
  'fail() { printf "fixture failure: %s\n" "$*" >&2; exit 1; }' \
  'ensure_state_root() { /bin/mkdir -p "$STATE_ROOT"; /bin/chmod 700 "$STATE_ROOT"; }' \
  'new_operation_token() { printf "123:1234567890123:1\n"; }' \
  'operation_token_is_valid() { printf "%s" "$1" | /usr/bin/grep -Eq "^[0-9]{1,12}:[0-9]{13}:[0-9]{1,8}$"; }' \
  'ensure_node_runtime() { [ -x "$NODE" ]; }' \
  > "$SCRIPTS/common-macos.sh"

/usr/bin/printf '%s\n' \
  '#!/bin/bash' \
  'mode="$(cat "$HOME/state/test-mode")"' \
  'if [ "$mode" = "preflight-mismatch" ]; then' \
  '  printf "%s\n" "{\"session\":\"paused\",\"operation\":\"\",\"port\":9341,\"injectorAlive\":true,\"cdpOk\":true,\"codexRunning\":true,\"themeId\":\"old-theme\",\"appliedThemeId\":\"\"}"' \
  'else' \
  '  printf "%s\n" "{\"session\":\"active\",\"operation\":\"\",\"port\":9341,\"injectorAlive\":true,\"cdpOk\":true,\"codexRunning\":true,\"themeId\":\"old-theme\",\"appliedThemeId\":\"old-theme\"}"' \
  'fi' \
  > "$SCRIPTS/status-dream-skin-macos.sh"

/usr/bin/printf '%s\n' \
  '#!/bin/bash' \
  'set -euo pipefail' \
  'destination=""; token=""' \
  'while [ "$#" -gt 0 ]; do case "$1" in --destination) destination="$2"; shift 2;; --lock-token) token="$2"; shift 2;; *) exit 2;; esac; done' \
  '[ "$(cat "$HOME/state/.theme-switch.lock/owner")" = "$PPID" ]' \
  '[ "$(cat "$HOME/state/.theme-switch.lock/token")" = "$token" ]' \
  '/bin/mkdir "$destination"' \
  'printf "%s\n" "{\"contentFingerprint\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}"' \
  > "$SCRIPTS/snapshot-active-theme-macos.sh"

/usr/bin/printf '%s\n' \
  'import fs from "node:fs";' \
  'import path from "node:path";' \
  'const args = process.argv.slice(2);' \
  'const home = process.env.HOME;' \
  'const mode = fs.readFileSync(path.join(home, "state/test-mode"), "utf8").trim();' \
  'const countPath = path.join(home, "state/verify-count");' \
  'const count = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, "utf8")) : 0;' \
  'fs.writeFileSync(countPath, `${count + 1}\n`);' \
  'const valueAfter = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : ""; };' \
  'const expectedSnapshot = path.join(home, `state/.community-apply-${mode}/active-before`);' \
  'if (!args.includes("--verify") || valueAfter("--port") !== "9341"' \
  '    || valueAfter("--theme-dir") !== expectedSnapshot || valueAfter("--timeout-ms") !== "12000") process.exit(7);' \
  'if (mode === "verify-fail") process.exit(8);' \
  > "$SCRIPTS/injector.mjs"

/usr/bin/printf '%s\n' \
  '#!/bin/bash' \
  'set -euo pipefail' \
  'kind=""; token=""' \
  'while [ "$#" -gt 0 ]; do case "$1" in --id) kind="apply"; shift 2;; --snapshot-dir) kind="rollback"; shift 2;; --expect-fingerprint) shift 2;; --lock-token) token="$2"; shift 2;; *) exit 2;; esac; done' \
  '[ "$(cat "$HOME/state/.theme-switch.lock/owner")" = "$PPID" ]' \
  '[ "$(cat "$HOME/state/.theme-switch.lock/token")" = "$token" ]' \
  '[ "$(cat "$HOME/state/verify-count")" = "1" ]' \
  'count=0; [ ! -f "$HOME/state/switch-count" ] || count="$(cat "$HOME/state/switch-count")"' \
  'count=$((count + 1)); printf "%s\n" "$count" > "$HOME/state/switch-count"' \
  'mode="$(cat "$HOME/state/test-mode")"' \
  '[ "$mode" != "fail-all" ] || exit 9' \
  '[ "$mode" != "recover" ] || [ "$kind" = "rollback" ] || exit 8' \
  'exit 0' \
  > "$SCRIPTS/switch-theme-macos.sh"
/bin/chmod 755 "$SCRIPTS/"*.sh

run_case() {
  local mode="$1"
  local expected_status="$2"
  local expected_switches="$3"
  local expected_verifications="$4"
  local home="$TMP/home-$mode"
  local transaction="$home/state/.community-apply-$mode"
  /bin/mkdir -p "$transaction"
  /usr/bin/printf '%s\n' "$mode" > "$home/state/test-mode"
  /usr/bin/printf '%s\n' \
    '{"session":"active","appliedThemeId":"old-theme","verifiedAt":"2026-07-25T00:00:00Z"}' \
    > "$home/state/state.json"
  set +e
  HOME="$home" NODE="$NODE" "$SCRIPTS/apply-community-theme-macos.sh" \
    --id imported-theme \
    --expect-fingerprint bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    --expect-active-id old-theme \
    --transaction-root "$transaction" >"$home/output" 2>&1
  status="$?"
  set -e
  if [ "$status" -ne "$expected_status" ]; then
    /bin/cat "$home/output" >&2
    /usr/bin/printf 'case %s: expected exit %s, got %s\n' "$mode" "$expected_status" "$status" >&2
    return 1
  fi
  actual_switches=0
  [ ! -f "$home/state/switch-count" ] || actual_switches="$(cat "$home/state/switch-count")"
  if [ "$actual_switches" -ne "$expected_switches" ]; then
    /bin/cat "$home/output" >&2
    /usr/bin/printf 'case %s: expected %s switches, got %s\n' \
      "$mode" "$expected_switches" "$actual_switches" >&2
    return 1
  fi
  actual_verifications=0
  [ ! -f "$home/state/verify-count" ] || actual_verifications="$(cat "$home/state/verify-count")"
  if [ "$actual_verifications" -ne "$expected_verifications" ]; then
    /bin/cat "$home/output" >&2
    /usr/bin/printf 'case %s: expected %s verifications, got %s\n' \
      "$mode" "$expected_verifications" "$actual_verifications" >&2
    return 1
  fi
  [ ! -e "$home/state/.theme-switch.lock" ]
}

run_case success 0 1 1
run_case recover 20 2 1
run_case fail-all 21 2 1
run_case preflight-mismatch 1 0 0
run_case verify-fail 1 0 1
printf 'PASS: community apply verifies the exact rollback renderer before any switch and reports success, verified rollback, or rollback failure.\n'
