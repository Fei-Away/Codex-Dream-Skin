#!/bin/bash

# Menu-bar apply with visible progress notifications.

set +e
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
STATE_ROOT="${HOME}/Library/Application Support/CodexDreamSkinStudio"
LOG_OUT="${STATE_ROOT}/menubar-apply.log"

/bin/mkdir -p "$STATE_ROOT" 2>/dev/null
{
  echo "==== $(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ') apply start ===="
} >>"$LOG_OUT" 2>/dev/null

progress() {
  printf '[progress] %s\n' "$*" >>"$LOG_OUT" 2>/dev/null
}

notify_progress() {
  /usr/bin/osascript - "$*" >/dev/null 2>&1 <<'APPLESCRIPT' &
on run argv
  display notification (item 1 of argv) with title "ChatGPT Dream Skin"
end run
APPLESCRIPT
}

alert() {
  /usr/bin/osascript - "$1" >/dev/null 2>&1 <<'APPLESCRIPT' || true
on run argv
  display alert "ChatGPT Dream Skin" message (item 1 of argv)
end run
APPLESCRIPT
}

confirm() {
  local message="$1"
  local ok_label="${2:-继续}"
  /usr/bin/osascript - "$message" "$ok_label" >/dev/null 2>&1 <<'APPLESCRIPT'
on run argv
  set promptText to item 1 of argv
  set okLabel to item 2 of argv
  display dialog promptText buttons {"取消", okLabel} default button okLabel with title "ChatGPT Dream Skin"
end run
APPLESCRIPT
}

progress "已收到点击…"

# shellcheck source=/dev/null
. "$SCRIPT_DIR/common-macos.sh" >>"$LOG_OUT" 2>&1 || {
  alert "无法加载引擎脚本"
  exit 1
}
# common-macos.sh enables errexit for engine entry points. This wrapper needs
# the command status below so it can show an actionable failure alert.
set +e

CHEAP_RUNNING="false"
/usr/bin/pgrep -x ChatGPT >/dev/null 2>&1 && CHEAP_RUNNING="true"
SESSION="off"
THEME_NAME=""
PORT="9341"
if [ -x "$SCRIPT_DIR/status-dream-skin-macos.sh" ]; then
  while IFS= read -r line; do
    case "$line" in
      session=*) SESSION="${line#session=}" ;;
      theme=*) THEME_NAME="${line#theme=}" ;;
      port=*) PORT="${line#port=}" ;;
    esac
  done < <("$SCRIPT_DIR/status-dream-skin-macos.sh" 2>/dev/null)
fi
[ -n "$THEME_NAME" ] || THEME_NAME="已选主题"

if [ "$CHEAP_RUNNING" = "false" ]; then
  PROMPT="打开 ChatGPT 并应用「${THEME_NAME}」？
首次启动通常需要 10–30 秒。"
  OK_LABEL="打开并应用"
elif [ "$SESSION" = "active" ]; then
  PROMPT="重新应用「${THEME_NAME}」？
ChatGPT 无需重启，适合界面未更新时使用。"
  OK_LABEL="重新应用"
elif [ "$SESSION" = "stale" ] || [ "$SESSION" = "unknown" ]; then
  PROMPT="修复连接并应用「${THEME_NAME}」？
ChatGPT 无需重启，通常几秒完成。"
  OK_LABEL="修复并应用"
else
  PROMPT="将「${THEME_NAME}」应用到 ChatGPT？
ChatGPT 无需重启，通常几秒完成。"
  OK_LABEL="应用"
fi

if ! confirm "$PROMPT" "$OK_LABEL"; then
  OPERATION_TOKEN="$(new_operation_token)"
  if write_operation_state cancelled "操作已取消，原皮肤保持不变" \
    "$OPERATION_TOKEN" idle; then
    (
      ensure_node_runtime
      finish_client_operation "$PORT" cancelled "操作已取消，原皮肤保持不变" \
        "$OPERATION_TOKEN" 1500 >/dev/null 2>&1
    ) >/dev/null 2>&1 || true
  fi
  progress "已取消，原皮肤保持不变"
  exit 0
fi

if [ "$CHEAP_RUNNING" = "false" ]; then
  notify_progress "正在打开 ChatGPT 并应用皮肤…"
fi

progress "检查 ChatGPT…"
ensure_state_root
progress "启动/连接调试口…"

"$SCRIPT_DIR/start-dream-skin-macos.sh" --restart-existing >>"$LOG_OUT" 2>&1
code=$?

if [ "$code" -eq 0 ]; then
  progress "完成：皮肤已应用"
  exit 0
fi

detail="$(/usr/bin/tail -n 5 "$LOG_OUT" 2>/dev/null | /usr/bin/tr '\n' ' ' | /usr/bin/cut -c1-350)"
alert "应用失败（$code）。$detail"
progress "应用失败"
exit "$code"
