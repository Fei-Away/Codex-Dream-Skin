#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

ZH_COPY="$(DREAMSKIN_LANG=zh-CN /bin/bash -c '
  . "$1/scripts/localization-linux.sh"
  printf "%s|%s|%s" "$(dreamskin_language)" "$(dreamskin_text apply)" "$(dreamskin_text skin_applied)"
' _ "$ROOT")"
EN_COPY="$(DREAMSKIN_LANG=en-US /bin/bash -c '
  . "$1/scripts/localization-linux.sh"
  printf "%s|%s|%s" "$(dreamskin_language)" "$(dreamskin_text apply)" "$(dreamskin_text skin_applied)"
' _ "$ROOT")"
[ "$ZH_COPY" = 'zh|应用|皮肤已应用' ] \
  || { printf 'Chinese runtime localization contract failed: %s\n' "$ZH_COPY" >&2; exit 1; }
[ "$EN_COPY" = 'en|Apply|Skin applied' ] \
  || { printf 'English runtime localization contract failed: %s\n' "$EN_COPY" >&2; exit 1; }

# Fallback follows LANG when DREAMSKIN_LANG is unset
LANG_COPY="$(LANG=zh_CN.UTF-8 /bin/bash -c '
  . "$1/scripts/localization-linux.sh"
  dreamskin_language
' _ "$ROOT")"
[ "$LANG_COPY" = 'zh' ] || { printf 'LANG fallback failed: %s\n' "$LANG_COPY" >&2; exit 1; }
