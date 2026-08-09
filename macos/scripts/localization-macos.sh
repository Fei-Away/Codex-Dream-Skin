#!/bin/bash

# Shared user-facing language resolver for macOS runtime scripts. Callers may
# set DREAMSKIN_LANG to zh-CN or en-US; otherwise the current macOS language is
# used. Machine-readable output must never depend on these strings.

dreamskin_language() {
  if [ -n "${DREAMSKIN_RESOLVED_LANG:-}" ]; then
    /usr/bin/printf '%s' "$DREAMSKIN_RESOLVED_LANG"
    return 0
  fi

  local requested="${DREAMSKIN_LANG:-}"
  local locale=""
  case "$requested" in
    zh|zh-*|zh_*|chinese) DREAMSKIN_RESOLVED_LANG="zh" ;;
    en|en-*|en_*|english) DREAMSKIN_RESOLVED_LANG="en" ;;
    *)
      locale="${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}"
      case "$locale" in
        zh|zh-*|zh_*|Chinese*) DREAMSKIN_RESOLVED_LANG="zh" ;;
        *)
          if /usr/bin/defaults read -g AppleLanguages 2>/dev/null \
            | /usr/bin/head -n 2 | /usr/bin/grep -Eiq '(^|[^A-Za-z])zh([-_]|[^A-Za-z]|$)'; then
            DREAMSKIN_RESOLVED_LANG="zh"
          else
            DREAMSKIN_RESOLVED_LANG="en"
          fi
          ;;
      esac
      ;;
  esac
  /usr/bin/printf '%s' "$DREAMSKIN_RESOLVED_LANG"
}

dreamskin_text() {
  local key="${1:-}"
  local language=""
  language="$(dreamskin_language)"
  case "$language:$key" in
    zh:operation_timeout) /usr/bin/printf '%s' '操作超时，请重试' ;;
    en:operation_timeout) /usr/bin/printf '%s' 'Operation timed out. Try again.' ;;
    zh:skin_applying_label) /usr/bin/printf '%s' 'Skin 应用中' ;;
    en:skin_applying_label) /usr/bin/printf '%s' 'Skin applying' ;;
    zh:skin_pausing_label) /usr/bin/printf '%s' 'Skin 暂停中' ;;
    en:skin_pausing_label) /usr/bin/printf '%s' 'Skin pausing' ;;
    zh:skin_unavailable) /usr/bin/printf '%s' 'Skin 异常' ;;
    en:skin_unavailable) /usr/bin/printf '%s' 'Skin unavailable' ;;
    zh:operation_failed_short) /usr/bin/printf '%s' '操作失败' ;;
    en:operation_failed_short) /usr/bin/printf '%s' 'operation failed' ;;
    zh:cancelled_short) /usr/bin/printf '%s' '已取消' ;;
    en:cancelled_short) /usr/bin/printf '%s' 'cancelled' ;;
    zh:applying_selected_theme) /usr/bin/printf '%s' '正在应用已选主题' ;;
    en:applying_selected_theme) /usr/bin/printf '%s' 'Applying selected theme' ;;
    zh:skin_applied) /usr/bin/printf '%s' '皮肤已应用' ;;
    en:skin_applied) /usr/bin/printf '%s' 'Skin applied' ;;
    zh:theme_switch_unconfirmed) /usr/bin/printf '%s' '主题切换未完成，应用结果未确认' ;;
    en:theme_switch_unconfirmed) /usr/bin/printf '%s' 'Theme switch did not finish; the result is unconfirmed' ;;
    zh:switching_theme) /usr/bin/printf '%s' '正在切换主题' ;;
    en:switching_theme) /usr/bin/printf '%s' 'Switching theme' ;;
    zh:apply_unconfirmed) /usr/bin/printf '%s' '应用失败，应用结果未确认' ;;
    en:apply_unconfirmed) /usr/bin/printf '%s' 'Apply failed; the result is unconfirmed' ;;
    zh:applying_skin) /usr/bin/printf '%s' '正在应用皮肤' ;;
    en:applying_skin) /usr/bin/printf '%s' 'Applying skin' ;;
    zh:cancelled_unchanged) /usr/bin/printf '%s' '操作已取消，原皮肤保持不变' ;;
    en:cancelled_unchanged) /usr/bin/printf '%s' 'Operation cancelled; the previous skin is unchanged' ;;
    zh:pause_failed) /usr/bin/printf '%s' '暂停失败，原状态可能未改变' ;;
    en:pause_failed) /usr/bin/printf '%s' 'Pause failed; the previous state may be unchanged' ;;
    zh:pause_failed_alert) /usr/bin/printf '%s' '暂停失败，请重新打开菜单查看状态。' ;;
    en:pause_failed_alert) /usr/bin/printf '%s' 'Pause failed. Reopen the menu to check the current state.' ;;
    zh:pausing_skin) /usr/bin/printf '%s' '正在暂停皮肤' ;;
    en:pausing_skin) /usr/bin/printf '%s' 'Pausing skin' ;;
    zh:skin_paused) /usr/bin/printf '%s' '皮肤已暂停' ;;
    en:skin_paused) /usr/bin/printf '%s' 'Skin paused' ;;
    zh:selected_theme) /usr/bin/printf '%s' '已选主题' ;;
    en:selected_theme) /usr/bin/printf '%s' 'Selected theme' ;;
    zh:continue) /usr/bin/printf '%s' '继续' ;;
    en:continue) /usr/bin/printf '%s' 'Continue' ;;
    zh:cancel) /usr/bin/printf '%s' '取消' ;;
    en:cancel) /usr/bin/printf '%s' 'Cancel' ;;
    zh:restart_prompt) /usr/bin/printf '%s' 'ChatGPT 需要重启一次才能启用皮肤。通常会在 10–30 秒内完成。' ;;
    en:restart_prompt) /usr/bin/printf '%s' 'ChatGPT must restart once to enable the skin. This usually takes 10–30 seconds.' ;;
    zh:restart_and_apply) /usr/bin/printf '%s' '重启并应用' ;;
    en:restart_and_apply) /usr/bin/printf '%s' 'Restart and apply' ;;
    zh:open_and_apply) /usr/bin/printf '%s' '打开并应用' ;;
    en:open_and_apply) /usr/bin/printf '%s' 'Open and apply' ;;
    zh:reapply) /usr/bin/printf '%s' '重新应用' ;;
    en:reapply) /usr/bin/printf '%s' 'Reapply' ;;
    zh:repair_and_apply) /usr/bin/printf '%s' '修复并应用' ;;
    en:repair_and_apply) /usr/bin/printf '%s' 'Repair and apply' ;;
    zh:apply) /usr/bin/printf '%s' '应用' ;;
    en:apply) /usr/bin/printf '%s' 'Apply' ;;
    zh:click_received) /usr/bin/printf '%s' '已收到点击…' ;;
    en:click_received) /usr/bin/printf '%s' 'Request received…' ;;
    zh:engine_script_missing) /usr/bin/printf '%s' '无法加载引擎脚本' ;;
    en:engine_script_missing) /usr/bin/printf '%s' 'Could not load the engine script' ;;
    zh:cancelled_progress) /usr/bin/printf '%s' '已取消，原皮肤保持不变' ;;
    en:cancelled_progress) /usr/bin/printf '%s' 'Cancelled; the previous skin is unchanged' ;;
    zh:opening_and_applying) /usr/bin/printf '%s' '正在打开 ChatGPT 并应用皮肤…' ;;
    en:opening_and_applying) /usr/bin/printf '%s' 'Opening ChatGPT and applying the skin…' ;;
    zh:checking_chatgpt) /usr/bin/printf '%s' '检查 ChatGPT…' ;;
    en:checking_chatgpt) /usr/bin/printf '%s' 'Checking ChatGPT…' ;;
    zh:hot_reload) /usr/bin/printf '%s' '尝试热重载皮肤…' ;;
    en:hot_reload) /usr/bin/printf '%s' 'Trying a live skin reload…' ;;
    zh:apply_complete) /usr/bin/printf '%s' '完成：皮肤已应用' ;;
    en:apply_complete) /usr/bin/printf '%s' 'Complete: skin applied' ;;
    zh:connecting_debug) /usr/bin/printf '%s' '启动/连接调试口…' ;;
    en:connecting_debug) /usr/bin/printf '%s' 'Starting or connecting to the debug port…' ;;
    zh:apply_failed) /usr/bin/printf '%s' '应用失败' ;;
    en:apply_failed) /usr/bin/printf '%s' 'Apply failed' ;;
    zh:default_theme_name) /usr/bin/printf '%s' '我的主题' ;;
    en:default_theme_name) /usr/bin/printf '%s' 'My Theme' ;;
    zh:loading_image) /usr/bin/printf '%s' '正在加载图片…' ;;
    en:loading_image) /usr/bin/printf '%s' 'Loading image…' ;;
    zh:theme_ready_not_applied) /usr/bin/printf '%s' '主题已就绪（未应用）' ;;
    en:theme_ready_not_applied) /usr/bin/printf '%s' 'Theme ready (not applied)' ;;
    zh:starting_chatgpt_for_apply) /usr/bin/printf '%s' '当前会话不可用，正在启动 ChatGPT 并应用主题…' ;;
    en:starting_chatgpt_for_apply) /usr/bin/printf '%s' 'The current session is unavailable; starting ChatGPT and applying the theme…' ;;
    zh:image_saved_apply_failed) /usr/bin/printf '%s' '图片已保存，但皮肤应用失败。请点“应用皮肤”重试。' ;;
    en:image_saved_apply_failed) /usr/bin/printf '%s' 'The image was saved, but applying the skin failed. Click Apply Skin to retry.' ;;
    zh:validating_theme_content) /usr/bin/printf '%s' '正在验证主题内容…' ;;
    en:validating_theme_content) /usr/bin/printf '%s' 'Validating theme content…' ;;
    zh:publishing_validated_theme) /usr/bin/printf '%s' '正在发布已验证的主题…' ;;
    en:publishing_validated_theme) /usr/bin/printf '%s' 'Publishing the validated theme…' ;;
    zh:applying_theme_to_chatgpt) /usr/bin/printf '%s' '正在将主题应用到 ChatGPT…' ;;
    en:applying_theme_to_chatgpt) /usr/bin/printf '%s' 'Applying the theme to ChatGPT…' ;;
    zh:verifying_rendered_theme) /usr/bin/printf '%s' '正在验证主题渲染…' ;;
    en:verifying_rendered_theme) /usr/bin/printf '%s' 'Verifying the rendered theme…' ;;
    zh:restarting_chatgpt_for_apply) /usr/bin/printf '%s' '正在重启 ChatGPT 并验证主题应用…' ;;
    en:restarting_chatgpt_for_apply) /usr/bin/printf '%s' 'Restarting ChatGPT to apply and verify the theme…' ;;
    zh:theme_switch_apply_failed) /usr/bin/printf '%s' '主题已切换，但皮肤应用失败。请点“应用皮肤”重试。' ;;
    en:theme_switch_apply_failed) /usr/bin/printf '%s' 'The theme was switched, but applying the skin failed. Click Apply Skin to retry.' ;;
    zh:ok) /usr/bin/printf '%s' '好' ;;
    en:ok) /usr/bin/printf '%s' 'OK' ;;
    *) return 1 ;;
  esac
}
