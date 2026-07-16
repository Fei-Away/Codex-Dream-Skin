#!/bin/bash

# Menu-bar apply with visible progress notifications.

set +e
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
UI_SCRIPT="$SCRIPT_DIR/ui-macos.applescript"
STATE_ROOT="${HOME}/Library/Application Support/CodexDreamSkinStudio"
LOG_OUT="${STATE_ROOT}/menubar-apply.log"

/bin/mkdir -p "$STATE_ROOT" 2>/dev/null
{
  echo "==== $(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ') apply start ===="
} >>"$LOG_OUT" 2>/dev/null

progress() {
  printf '[progress] %s\n' "$*" >>"$LOG_OUT" 2>/dev/null
  /usr/bin/osascript "$UI_SCRIPT" notify "$*" >/dev/null 2>&1 &
}

alert() {
  /usr/bin/osascript "$UI_SCRIPT" alert "$1" >/dev/null 2>&1 || true
}

confirm() {
  local message="$1"
  local ok_label="${2:-继续}"
  /usr/bin/osascript "$UI_SCRIPT" confirm "$message" "$ok_label" >/dev/null 2>&1
}

progress "已收到点击…"

# shellcheck source=/dev/null
. "$SCRIPT_DIR/common-macos.sh" >>"$LOG_OUT" 2>&1 || {
  alert "无法加载引擎脚本"
  exit 1
}

PORT=9341
if [ -f "$STATE_PATH" ]; then
  saved_port="$(state_field port 2>/dev/null || true)"
  [ -n "${saved_port:-}" ] && PORT="$saved_port"
fi

CHEAP_RUNNING="false"
/usr/bin/pgrep -x ChatGPT >/dev/null 2>&1 && CHEAP_RUNNING="true"

if [ "$CHEAP_RUNNING" = "false" ]; then
  if ! confirm "Codex 未打开。
将启动并应用皮肤（约 10–30 秒，右上角会有进度通知）。" "启动并应用"; then
    progress "已取消"
    exit 0
  fi
else
  if ! confirm "应用当前皮肤？
右上角会显示进度通知。" "应用"; then
    progress "已取消"
    exit 0
  fi
fi

progress "检查 Codex…"
if ! discover_codex_app >>"$LOG_OUT" 2>&1; then
  alert "未找到官方 Codex。"
  exit 1
fi
if ! require_macos_runtime >>"$LOG_OUT" 2>&1; then
  alert "Codex 运行时校验失败。"
  exit 1
fi

ensure_state_root
progress "启动/连接调试口（可能 10–30 秒）…"

"$SCRIPT_DIR/start-dream-skin-macos.sh" --port "$PORT" --restart-existing >>"$LOG_OUT" 2>&1
code=$?

if [ "$code" -eq 0 ]; then
  progress "完成：皮肤已应用"
  exit 0
fi

detail="$(/usr/bin/tail -n 5 "$LOG_OUT" 2>/dev/null | /usr/bin/tr '\n' ' ' | /usr/bin/cut -c1-350)"
alert "应用失败（$code）。$detail"
progress "失败，见通知弹窗"
exit "$code"
