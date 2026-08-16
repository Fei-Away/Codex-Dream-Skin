#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-$(command -v node)}"
[ -x "$NODE" ] || { printf 'node was not found. Install nodejs (>= 18) first.\n' >&2; exit 1; }
TMP="$(/usr/bin/mktemp -d /tmp/dreamskin-first-run.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

# The lazy first-run seed guard lives in common-linux.sh so it can be
# sourced and called directly. STATE_ROOT is derived from XDG_STATE_HOME at
# source time, so pointing it at a temp tree keeps the guard, its seeding,
# and the switch-theme staging it invokes (--no-apply: stages only, never
# launches Codex) fully hermetic.
run_guard() {
  local output="$1"
  XDG_STATE_HOME="$TMP/state" NODE="$NODE" /bin/bash -c '
    set -euo pipefail
    . "$1/scripts/common-linux.sh"
    ensure_first_run_theme
  ' _ "$ROOT" >"$output" 2>&1
}

STATE_ROOT="$TMP/state/codex-dream-skin"

# First call on a fresh state tree: seeds bundled presets into the theme
# library and stages the default preset as the active theme.
run_guard "$TMP/guard-1.log"
[ -f "$STATE_ROOT/themes/preset-gothic-void-crusade/theme.json" ]
[ -f "$STATE_ROOT/theme/theme.json" ]

# Re-run is idempotent and must not disturb existing user themes: a user
# edit marker inside a seeded preset and a custom pack both survive.
/usr/bin/mkdir -p "$STATE_ROOT/themes/custom-evening"
/usr/bin/printf '{}\n' > "$STATE_ROOT/themes/custom-evening/theme.json"
/usr/bin/printf 'user-edit\n' > "$STATE_ROOT/themes/preset-gothic-void-crusade/USER_EDIT"
run_guard "$TMP/guard-2.log"
[ -d "$STATE_ROOT/themes/custom-evening" ]
[ -f "$STATE_ROOT/themes/custom-evening/theme.json" ]
[ -f "$STATE_ROOT/themes/preset-gothic-void-crusade/USER_EDIT" ]

# With every preset and the active stage removed (simulating a state tree
# that never got an install-time seed), the guard seeds and stages again.
/usr/bin/rm -rf "$STATE_ROOT/themes"/preset-* "$STATE_ROOT/theme"
run_guard "$TMP/guard-3.log"
[ -f "$STATE_ROOT/themes/preset-gothic-void-crusade/theme.json" ]
[ -f "$STATE_ROOT/theme/theme.json" ]

printf 'first-run theme tests passed\n'
