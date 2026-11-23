#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

if [ "$(/usr/bin/uname -s)" != "Darwin" ]; then
  printf 'SKIP: installer launch-failure integration requires macOS.\n'
  exit 0
fi

TMP="$(/usr/bin/mktemp -d /tmp/dreamskin-installer-launch.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

# A stub project around the real installer: only common-macos.sh and the
# scripts it calls are replaced, so the outer deploy/commit/rollback flow and
# the inner in-place install are the shipped code.
PROJECT="$TMP/project"
/bin/mkdir -p "$PROJECT/scripts"
/bin/cp "$ROOT/scripts/install-dream-skin-macos.sh" "$PROJECT/scripts/"
/usr/bin/printf '%s\n' 'new-engine' > "$PROJECT/engine-marker"
/bin/cat > "$PROJECT/scripts/common-macos.sh" <<'STUB'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
INJECTOR="$SCRIPT_DIR/injector.mjs"
INSTALL_ROOT="$HOME/.codex/codex-dream-skin-studio"
STATE_ROOT="$HOME/state"
THEME_DIR="$STATE_ROOT/theme"
CONFIG_PATH="$HOME/.codex/config.toml"
NODE=/usr/bin/true
SKIN_VERSION=test CODEX_VERSION=test NODE_VERSION=test
fail() { printf '%s\n' "$*" >&2; exit 1; }
discover_codex_app() { :; }
codex_is_running() { return 1; }
require_macos_runtime() { :; }
ensure_state_root() { /bin/mkdir -p "$THEME_DIR"; }
seed_bundled_presets() { :; }
sync_appearance_pin() {
  [ -z "${STUB_FAIL_INSTALL:-}" ] || fail "stub install failure"
  /usr/bin/printf '%s\n' 'pinned' >> "$CONFIG_PATH"
}
STUB
/usr/bin/printf '%s\n' '#!/bin/bash' 'exit 0' > "$PROJECT/scripts/switch-theme-macos.sh"
/usr/bin/printf '%s\n' '#!/bin/bash' \
  '/usr/bin/printf "%s\n" "$0" > "$HOME/start-called"' \
  'exit 7' > "$PROJECT/scripts/start-dream-skin-macos.sh"
/bin/chmod 700 "$PROJECT"/scripts/*.sh

new_home() {
  TEST_HOME="$TMP/home-$1"
  ENGINE="$TEST_HOME/.codex/codex-dream-skin-studio"
  /bin/mkdir -p "$TEST_HOME/.codex"
  /usr/bin/printf '%s\n' 'model = "gpt-5"' > "$TEST_HOME/.codex/config.toml"
}

no_leftovers() {
  [ -z "$(/usr/bin/find "$TEST_HOME/.codex" -maxdepth 1 \
    \( -name 'codex-dream-skin-studio.installing.*' \
    -o -name 'codex-dream-skin-studio.previous.*' \
    -o -name 'codex-dream-skin-studio.broken.*' \) -print -quit)" ]
}

# A launch failure after a successful install must keep the new engine: the
# install already pinned config.toml, and Restore lives in that engine.
new_home launch
status=0
HOME="$TEST_HOME" "$PROJECT/scripts/install-dream-skin-macos.sh" --no-launchers \
  >"$TMP/launch.txt" 2>&1 || status=$?
[ "$status" -eq 7 ] \
  || { printf 'Launch failure exit status was %s, expected 7.\n' "$status" >&2; exit 1; }
[ -f "$ENGINE/engine-marker" ] \
  || { printf 'A failed post-install launch rolled back the installed engine.\n' >&2; exit 1; }
[ "$(/bin/cat "$TEST_HOME/start-called")" = "$ENGINE/scripts/start-dream-skin-macos.sh" ]
/usr/bin/grep -F -q 'pinned' "$TEST_HOME/.codex/config.toml"
no_leftovers

# A failed install still rolls back to the previous engine and never launches.
new_home install
/bin/mkdir -p "$ENGINE"
/usr/bin/printf '%s\n' 'previous-engine' > "$ENGINE/old-engine-marker"
if STUB_FAIL_INSTALL=1 HOME="$TEST_HOME" "$PROJECT/scripts/install-dream-skin-macos.sh" \
  --no-launchers >"$TMP/install.txt" 2>&1; then
  printf 'A failed in-place install reported success.\n' >&2
  exit 1
fi
[ -f "$ENGINE/old-engine-marker" ]
[ ! -f "$ENGINE/engine-marker" ]
[ ! -e "$TEST_HOME/start-called" ]
no_leftovers

printf 'PASS: macOS installer keeps the installed engine when only the post-install launch fails.\n'
