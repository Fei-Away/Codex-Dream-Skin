#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$ROOT/scripts/dreamskin.sh" --self-test-source 2>/dev/null || true

# resolve_command table
[ "$(resolve_command start)" = "start" ]
[ "$(resolve_command 1)" = "start" ]
[ "$(resolve_command bg)" = "bg" ]
[ "$(resolve_command theme)" = "theme" ]
[ "$(resolve_command import)" = "import" ]
[ "$(resolve_command restore)" = "restore" ]
[ "$(resolve_command autostart)" = "autostart" ]
[ "$(resolve_command nonsense)" = "" ]

# menu line rendering (no exec when --self-test-source)
[ "$(render_menu_item 1 start '启动 Codex 并应用换肤')" = "1" ]

# piped-stdin menu exit paths: 0, bare Enter, and invalid-then-0 all exit 0
printf '0\n' | /bin/bash "$ROOT/scripts/dreamskin.sh" >/dev/null 2>&1
printf '\n' | /bin/bash "$ROOT/scripts/dreamskin.sh" >/dev/null 2>&1
menu_out="$(printf 'zzz\n0\n' | /bin/bash "$ROOT/scripts/dreamskin.sh" 2>&1)"
[ "$(printf '%s\n' "$menu_out" | LC_ALL=C /usr/bin/grep -c '无效选择')" -eq 1 ]

# unknown subcommand exits 2
unknown_rc=0
"$ROOT/scripts/dreamskin.sh" nonsense >/dev/null 2>&1 && unknown_rc=0 || unknown_rc=$?
[ "$unknown_rc" -eq 2 ]

# interface regression guards: import must pass --file, doctor must pass no flag
/usr/bin/grep -q 'import-theme-zip-linux.sh" --file "$zipfile"' "$ROOT/scripts/dreamskin.sh"
/usr/bin/grep -Eq 'doctor\) exec .*status-dream-skin-linux\.sh" ;;' "$ROOT/scripts/dreamskin.sh"
# one-click dreamskin:// links must route to the community pipeline with the
# URL intact (resolve_command has no such case and dispatch would drop $1).
/usr/bin/grep -F -q 'dreamskin://*) dispatch community "$@"' "$ROOT/scripts/dreamskin.sh"
printf 'dreamskin dispatch tests passed\n'
