#!/bin/bash

# Menu-bar apply with visible progress notifications.

set +e
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
. "$SCRIPT_DIR/localization-macos.sh"
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
  local ok_label="${2:-$(dreamskin_text continue)}"
  local cancel_label="$(dreamskin_text cancel)"
  /usr/bin/osascript - "$message" "$ok_label" "$cancel_label" >/dev/null 2>&1 <<'APPLESCRIPT'
on run argv
  set promptText to item 1 of argv
  set okLabel to item 2 of argv
  set cancelLabel to item 3 of argv
  display dialog promptText buttons {cancelLabel, okLabel} default button okLabel cancel button cancelLabel with title "ChatGPT Dream Skin"
end run
APPLESCRIPT
}

progress "$(dreamskin_text click_received)"

# shellcheck source=/dev/null
. "$SCRIPT_DIR/common-macos.sh" >>"$LOG_OUT" 2>&1 || {
  alert "$(dreamskin_text engine_script_missing)"
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
[ -n "$THEME_NAME" ] || THEME_NAME="$(dreamskin_text selected_theme)"

if [ "$(dreamskin_language)" = "zh" ]; then
  if [ "$CHEAP_RUNNING" = "false" ]; then
    PROMPT="打开 ChatGPT 并应用「${THEME_NAME}」？
首次启动通常需要 10–30 秒。"
  elif [ "$SESSION" = "active" ]; then
    PROMPT="重新应用「${THEME_NAME}」？
ChatGPT 无需重启，适合界面未更新时使用。"
  elif [ "$SESSION" = "stale" ] || [ "$SESSION" = "unknown" ]; then
    PROMPT="修复连接并应用「${THEME_NAME}」？
ChatGPT 无需重启，通常几秒完成。"
  else
    PROMPT="将「${THEME_NAME}」应用到 ChatGPT？
ChatGPT 无需重启，通常几秒完成。"
  fi
else
  if [ "$CHEAP_RUNNING" = "false" ]; then
    PROMPT="Open ChatGPT and apply “${THEME_NAME}”?
The first launch usually takes 10–30 seconds."
  elif [ "$SESSION" = "active" ]; then
    PROMPT="Reapply “${THEME_NAME}”?
ChatGPT does not need to restart. Use this when the interface did not update."
  elif [ "$SESSION" = "stale" ] || [ "$SESSION" = "unknown" ]; then
    PROMPT="Repair the connection and apply “${THEME_NAME}”?
ChatGPT does not need to restart; this usually takes a few seconds."
  else
    PROMPT="Apply “${THEME_NAME}” to ChatGPT?
ChatGPT does not need to restart; this usually takes a few seconds."
  fi
fi
if [ "$CHEAP_RUNNING" = "false" ]; then
  OK_LABEL="$(dreamskin_text open_and_apply)"
elif [ "$SESSION" = "active" ]; then
  OK_LABEL="$(dreamskin_text reapply)"
elif [ "$SESSION" = "stale" ] || [ "$SESSION" = "unknown" ]; then
  OK_LABEL="$(dreamskin_text repair_and_apply)"
else
  OK_LABEL="$(dreamskin_text apply)"
fi

if ! confirm "$PROMPT" "$OK_LABEL"; then
  OPERATION_TOKEN="$(new_operation_token)"
  if write_operation_state cancelled "$(dreamskin_text cancelled_unchanged)" \
    "$OPERATION_TOKEN" idle; then
    (
      ensure_node_runtime
      finish_client_operation "$PORT" cancelled "$(dreamskin_text cancelled_unchanged)" \
        "$OPERATION_TOKEN" 1500 >/dev/null 2>&1
    ) >/dev/null 2>&1 || true
  fi
  progress "$(dreamskin_text cancelled_progress)"
  exit 0
fi

if [ "$CHEAP_RUNNING" = "false" ]; then
  notify_progress "$(dreamskin_text opening_and_applying)"
fi

progress "$(dreamskin_text checking_chatgpt)"
ensure_state_root
progress "$(dreamskin_text hot_reload)"

if hot_reapply_theme "$PORT" 8000; then
  progress "$(dreamskin_text apply_complete)"
  exit 0
fi

progress "$(dreamskin_text connecting_debug)"

"$SCRIPT_DIR/start-dream-skin-macos.sh" --restart-existing >>"$LOG_OUT" 2>&1
code=$?

if [ "$code" -eq 0 ]; then
  progress "$(dreamskin_text apply_complete)"
  exit 0
fi

detail="$(/usr/bin/tail -n 5 "$LOG_OUT" 2>/dev/null | /usr/bin/tr '\n' ' ' | /usr/bin/cut -c1-350)"
if [ "$(dreamskin_language)" = "zh" ]; then
  alert "应用失败（${code}）。$detail"
else
  alert "Apply failed (exit ${code}). $detail"
fi
progress "$(dreamskin_text apply_failed)"
exit "$code"
