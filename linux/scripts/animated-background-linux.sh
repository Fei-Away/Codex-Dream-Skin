#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
. "$SCRIPT_DIR/common-linux.sh"
. "$SCRIPT_DIR/theme-switch-lock-linux.sh"
ensure_node_runtime

command="${1:-status}"
case "$command" in
  status) ;;
  on|off|preset|power|reset)
    # Check redirects before the shared lock creates files in the state root.
    "$NODE" "$SCRIPT_DIR/animation-settings.mjs" --state-root "$STATE_ROOT" check-root
    acquire_theme_switch_lock "$(new_operation_token)"
    trap 'release_theme_switch_lock' EXIT
    ;;
  *) printf '用法：dreamskin animation status|on|off|preset aurora|starfield|power auto|low|reset\n' >&2; exit 2 ;;
esac
"$NODE" "$SCRIPT_DIR/animation-settings.mjs" --state-root "$STATE_ROOT" "$@"
if [ "$command" != "status" ]; then
  printf '动画设置已保存。正在换肤时自动应用；暂停时保持暂停，下次启动时生效。\n'
fi
