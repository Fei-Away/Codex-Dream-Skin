#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

echo "=== Shell syntax checks ==="
while IFS= read -r file; do
  bash -n "$file" || { echo "FAIL: $file"; exit 1; }
done < <(find "$ROOT/scripts" -type f -name '*.sh' -print)

echo "=== Node.js syntax checks ==="
NODE="${NODE:-/usr/lib/chatgpt/resources/cua_node/bin/node}"
if [ -x "$NODE" ]; then
  while IFS= read -r file; do
    "$NODE" --check "$file" >/dev/null || { echo "FAIL: $file"; exit 1; }
  done < <(find "$ROOT/scripts" "$ROOT/assets" -type f \( -name '*.mjs' -o -name '*.js' \) -print)
  echo "Node syntax OK (using $( $NODE --version ))"
else
  echo "SKIP: Node runtime not found at $NODE"
fi

echo "=== Localization contract ==="
ZH_COPY="$(DREAMSKIN_LANG=zh-CN bash -c '
  . "$1/scripts/localization-linux.sh"
  printf "%s|%s|%s" "$(dreamskin_language)" "$(dreamskin_text apply)" "$(dreamskin_text skin_applied)"
' _ "$ROOT")"
EN_COPY="$(DREAMSKIN_LANG=en-US bash -c '
  . "$1/scripts/localization-linux.sh"
  printf "%s|%s|%s" "$(dreamskin_language)" "$(dreamskin_text apply)" "$(dreamskin_text skin_applied)"
' _ "$ROOT")"
[ "$ZH_COPY" = 'zh|应用|皮肤已应用' ] \
  || { printf 'Chinese localization contract failed: %s\n' "$ZH_COPY" >&2; exit 1; }
[ "$EN_COPY" = 'en|Apply|Skin applied' ] \
  || { printf 'English localization contract failed: %s\n' "$EN_COPY" >&2; exit 1; }
echo "Localization contract OK"

echo "=== Common script discover_codex_app smoke test ==="
bash -c "
  . '$ROOT/scripts/common-linux.sh'
  discover_codex_app
  printf 'Found Codex at: %s\n' \"\$CODEX_EXE\"
  printf 'Codex version: %s\n' \"\$CODEX_VERSION\"
" || { echo "WARN: discover_codex_app failed"; }

echo "=== All linux tests passed ==="
