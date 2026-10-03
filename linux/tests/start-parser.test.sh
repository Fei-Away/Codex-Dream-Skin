#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TMP="$(/usr/bin/mktemp -d /tmp/dreamskin-start-parser.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

# start-dream-skin-linux.sh parses its arguments before touching any state or
# Codex install, so an out-of-range port proves the whole argument vector
# parsed without anything being launched. XDG_STATE_HOME points at a temp
# tree so the fail() log write stays hermetic. --allow-unsigned must be
# accepted: AppImage/binary users can only pass install verification after
# this flag records a one-time approval for the discovered executable.
# Port 80 is below the 1024 floor, so the script exits at port validation
# (the first check after parsing) and never reaches discovery or launch.
start_rc=0
start_out="$(XDG_STATE_HOME="$TMP/state" /bin/bash "$ROOT/scripts/start-dream-skin-linux.sh" \
  --allow-unsigned --port 80 2>&1)" && start_rc=0 || start_rc=$?
[ "$start_rc" -eq 1 ]
case "$start_out" in
  *"Port must be between 1024 and 65535"*) ;;
  *) printf '%s\n' "--allow-unsigned did not reach port validation: $start_out" >&2; exit 1 ;;
esac

# Unknown flags must still be rejected by the parser itself, not downstream.
unknown_rc=0
unknown_out="$(XDG_STATE_HOME="$TMP/state" /bin/bash "$ROOT/scripts/start-dream-skin-linux.sh" \
  --unsigned-something --port 80 2>&1)" && unknown_rc=0 || unknown_rc=$?
[ "$unknown_rc" -eq 1 ]
case "$unknown_out" in
  *"Unknown start argument: --unsigned-something"*) ;;
  *) printf 'unknown flag was not rejected by the parser: %s\n' "$unknown_out" >&2; exit 1 ;;
esac

# Wiring guard: the flag must flow into the recorded approval for the exact
# discovered executable, gated to the appimage|binary launch kinds and placed
# after discovery / before verify_codex_install.
/usr/bin/grep -Fq -- '--allow-unsigned) ALLOW_UNSIGNED="true"; shift ;;' \
  "$ROOT/scripts/start-dream-skin-linux.sh"
/usr/bin/grep -Fq 'record_appimage_approval' "$ROOT/scripts/start-dream-skin-linux.sh"
/usr/bin/grep -Fq 'appimage|binary) record_appimage_approval' \
  "$ROOT/scripts/start-dream-skin-linux.sh"

printf 'start parser tests passed\n'
