#!/bin/bash

set -euo pipefail
# NOTE: This file does NOT source common-linux.sh to avoid circular dependency.
# common-linux.sh sources this file. Scripts that need localization functions
# source common-linux.sh, which in turn sources this file.

DREAMSKIN_LANG="${DREAMSKIN_LANG:-en}"

dreamskin_language() {
  if [ -n "${DREAMSKIN_RESOLVED_LANG:-}" ]; then
    printf '%s' "$DREAMSKIN_RESOLVED_LANG"
    return 0
  fi
  local requested="$DREAMSKIN_LANG"
  case "$requested" in
    zh|zh-*|zh_*|chinese) DREAMSKIN_RESOLVED_LANG="zh" ;;
    en|en-*|en_*|english) DREAMSKIN_RESOLVED_LANG="en" ;;
    *)
      local locale=""
      locale="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
      case "$locale" in
        zh|zh-*|zh_*|Chinese*) DREAMSKIN_RESOLVED_LANG="zh" ;;
        *) DREAMSKIN_RESOLVED_LANG="en" ;;
      esac
      ;;
  esac
  printf '%s' "$DREAMSKIN_RESOLVED_LANG"
}

_dreamskin_text_zh() {
  case "$1" in
    apply) printf '%s' "应用";;
    skin_applied) printf '%s' "皮肤已应用";;
    skin_removed) printf '%s' "皮肤已移除";;
    applying_selected_theme) printf '%s' "正在应用所选主题…";;
    cancelled_unchanged) printf '%s' "操作已取消";;
    apply_unconfirmed) printf '%s' "应用未确认";;
    update_available) printf '%s' "发现新版本";;
    codex_not_found) printf '%s' "未找到官方 ChatGPT 桌面客户端";;
    codex_not_running) printf '%s' "ChatGPT 未运行";;
    cdp_not_ready) printf '%s' "CDP 调试端口未就绪";;
    injection_failed) printf '%s' "注入失败";;
    theme_imported) printf '%s' "主题已导入";;
    theme_switched) printf '%s' "主题已切换";;
    theme_paused) printf '%s' "主题已暂停";;
    theme_restored) printf '%s' "已恢复原始外观";;
    status_active) printf '%s' "活跃";;
    status_paused) printf '%s' "已暂停";;
    status_inactive) printf '%s' "未激活";;
    status_unknown) printf '%s' "未知";;
    *) printf '%s' "$1";;
  esac
}

_dreamskin_text_en() {
  case "$1" in
    apply) printf '%s' "Apply";;
    skin_applied) printf '%s' "Skin applied";;
    skin_removed) printf '%s' "Skin removed";;
    applying_selected_theme) printf '%s' "Applying selected theme…";;
    cancelled_unchanged) printf '%s' "Operation cancelled";;
    apply_unconfirmed) printf '%s' "Apply unconfirmed";;
    update_available) printf '%s' "New version available";;
    codex_not_found) printf '%s' "Official ChatGPT desktop client not found";;
    codex_not_running) printf '%s' "ChatGPT is not running";;
    cdp_not_ready) printf '%s' "CDP debug port not ready";;
    injection_failed) printf '%s' "Injection failed";;
    theme_imported) printf '%s' "Theme imported";;
    theme_switched) printf '%s' "Theme switched";;
    theme_paused) printf '%s' "Theme paused";;
    theme_restored) printf '%s' "Original appearance restored";;
    status_active) printf '%s' "Active";;
    status_paused) printf '%s' "Paused";;
    status_inactive) printf '%s' "Inactive";;
    status_unknown) printf '%s' "Unknown";;
    *) printf '%s' "$1";;
  esac
}

dreamskin_text() {
  local lang
  lang="$(dreamskin_language)"
  case "$lang" in
    zh) _dreamskin_text_zh "$1" ;;
    *) _dreamskin_text_en "$1" ;;
  esac
}
