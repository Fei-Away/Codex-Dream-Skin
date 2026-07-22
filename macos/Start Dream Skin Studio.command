#!/bin/bash
set -euo pipefail

SERVER="$HOME/.codex/codex-dream-skin-studio/studio/server.mjs"
NODE="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
PORT="${DREAM_SKIN_STUDIO_PORT:-8765}"

if [ ! -f "$SERVER" ]; then
  /usr/bin/osascript -e 'display alert "请先安装 Codex Dream Skin，再打开 Studio。" as warning' >/dev/null 2>&1 || true
  exit 1
fi

if [ ! -x "$NODE" ]; then
  NODE="$(command -v node || true)"
fi
[ -x "$NODE" ] || { /usr/bin/osascript -e 'display alert "未找到可用的 Node.js 运行时。" as warning' >/dev/null 2>&1 || true; exit 1; }

if ! /usr/bin/curl --noproxy '*' --silent --fail --max-time 1 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  STATE_ROOT="$HOME/Library/Application Support/CodexDreamSkinStudio"
  /bin/mkdir -p "$STATE_ROOT"
  DREAM_SKIN_STUDIO_PORT="$PORT" /usr/bin/nohup "$NODE" "$SERVER" >"$STATE_ROOT/studio.log" 2>"$STATE_ROOT/studio-error.log" < /dev/null &
  for _ in $(/usr/bin/seq 1 20); do
    /usr/bin/curl --noproxy '*' --silent --fail --max-time 1 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1 && break
    /bin/sleep 0.25
  done
fi

/usr/bin/open "http://127.0.0.1:${PORT}/"
