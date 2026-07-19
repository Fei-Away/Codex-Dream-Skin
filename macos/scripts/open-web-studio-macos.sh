#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

discover_codex_app
require_macos_runtime
ensure_state_root

PORT="$(select_available_port 9460)"
READY_DIR="$(/usr/bin/mktemp -d /tmp/codex-dream-web-ready.XXXXXX)"
/bin/chmod 700 "$READY_DIR"
FIFO="$READY_DIR/ready.fifo"
/usr/bin/mkfifo -m 600 "$FIFO"
ERROR_LOG="$STATE_ROOT/web-studio-server-error.log"
SERVER_LOG="$STATE_ROOT/web-studio-server.log"

cleanup() {
  /bin/rm -f "$FIFO"
  /bin/rmdir "$READY_DIR" 2>/dev/null || true
}

show_server_error() {
  /usr/bin/osascript -e \
    'display alert "Codex 主题控制台启动失败" message "请查看日志：~/Library/Application Support/CodexDreamSkinStudio/web-studio-server-error.log" as warning' \
    >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM
exec 3<> "$FIFO"

/usr/bin/nohup "$NODE" "$SCRIPT_DIR/web-studio-server.mjs" \
  --port "$PORT" \
  --ready-fifo "$FIFO" \
  --source-root "$PROJECT_ROOT" \
  --idle-ms 1800000 \
  >>"$SERVER_LOG" 2>>"$ERROR_LOG" 3>&- &
SERVER_PID=$!

if ! IFS= read -r -t 20 READY_URL <&3; then
  /bin/kill -TERM "$SERVER_PID" 2>/dev/null || true
  show_server_error
  fail "Local control service did not become ready within 20 seconds. See $ERROR_LOG"
fi
exec 3>&-
cleanup
trap - EXIT INT TERM

case "$READY_URL" in
  "http://127.0.0.1:"*"/#token="*) ;;
  *)
    /bin/kill -TERM "$SERVER_PID" 2>/dev/null || true
    show_server_error
    fail "Local control service returned an invalid URL."
    ;;
esac

if ! /usr/bin/open "$READY_URL"; then
  /bin/kill -TERM "$SERVER_PID" 2>/dev/null || true
  show_server_error
  fail "Could not open the local control page."
fi
