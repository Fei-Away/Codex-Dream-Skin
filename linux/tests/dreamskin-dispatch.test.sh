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
printf 'dreamskin dispatch tests passed\n'
