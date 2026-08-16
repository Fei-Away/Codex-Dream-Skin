#!/bin/bash

# Dream Skin Linux main entry. No arguments: interactive menu.
# With arguments: subcommand dispatch. Sourceable for tests via --self-test-source.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
. "$SCRIPT_DIR/common-linux.sh"

resolve_command() {
  local input="${1:-}"
  case "$input" in
    start|1) printf 'start' ;;
    pause|2) printf 'pause' ;;
    bg|background|3) printf 'bg' ;;
    import|4) printf 'import' ;;
    theme|themes|5) printf 'theme' ;;
    folder|6) printf 'folder' ;;
    restore|7) printf 'restore' ;;
    gallery|8) printf 'gallery' ;;
    studio|9) printf 'studio' ;;
    autostart|a|A) printf 'autostart' ;;
    doctor|d|D) printf 'doctor' ;;
    update|u|U) printf 'update' ;;
    status) printf 'status' ;;
    community|protocol) printf 'community' ;;
    *) printf '' ;;
  esac
}

render_menu_item() {
  local key="$1"
  local command="$2"
  local label="$3"
  printf '%s' "$key"
}

menu_loop() {
  local choice=""
  local key=""
  while true; do
    printf '\n Dream Skin (Linux)  v%s\n' "$SKIN_VERSION"
    printf ' 1  启动 Codex 并应用换肤\n'
    printf ' 2  暂停换肤\n'
    printf ' 3  更换背景图…\n'
    printf ' 4  导入主题 ZIP…\n'
    printf ' 5  已保存主题\n'
    printf ' 6  打开主题文件夹\n'
    printf ' 7  一键恢复官方外观\n'
    printf ' 8  主题库 Gallery\n'
    printf ' 9  在线 Studio\n'
    printf ' A  开机自启（开/关）\n'
    printf ' D  诊断信息\n'
    printf ' U  检查更新\n'
    printf ' 0  退出\n'
    printf ' 选择 > '
    read -r choice || { printf '\n'; exit 0; }
    # 0 (and a bare Enter) exits the menu before dispatch; resolve_command has
    # no 0 case on purpose so 0 can never resolve to a subcommand.
    case "${choice:-}" in
      ''|0) printf '\n'; exit 0 ;;
    esac
    key="$(resolve_command "${choice:-}")"
    case "$key" in
      '') printf ' 无效选择：%s\n' "$choice"; continue ;;
    esac
    dispatch "$key" || continue
  done
}

dispatch() {
  local key="$1"
  shift || true
  case "$key" in
    start) exec "$SCRIPT_DIR/start-dream-skin-linux.sh" "$@" ;;
    pause) exec "$SCRIPT_DIR/pause-dream-skin-linux.sh" ;;
    bg)
      local image=""
      printf ' 背景图路径 > '
      read -r image || return 0
      [ -n "$image" ] || { printf ' 未提供路径，已取消。\n'; return 0; }
      # load-image-theme-linux.sh takes --file <image> (not --image).
      "$SCRIPT_DIR/load-image-theme-linux.sh" --file "$image" \
        && "$SCRIPT_DIR/start-dream-skin-linux.sh"
      ;;
    import)
      local zipfile=""
      printf ' 主题 ZIP 路径 > '
      read -r zipfile || return 0
      [ -n "$zipfile" ] || { printf ' 未提供路径，已取消。\n'; return 0; }
      "$SCRIPT_DIR/import-theme-zip-linux.sh" --file "$zipfile"
      ;;
    theme)
      local sub="${1:-list}"
      case "$sub" in
        list)
          # common-linux.sh does not resolve NODE at source time (only
          # ensure_node_runtime does, and it exits on failure). Resolve it
          # quietly here and fall back to a plain id listing when Node is
          # unavailable, so the interactive menu never dies on this branch.
          [ -n "${NODE:-}" ] && [ -x "$NODE" ] || NODE="$(command -v node 2>/dev/null || true)"
          if [ -d "$STATE_ROOT/themes" ]; then
            for d in "$STATE_ROOT"/themes/*/; do
              [ -d "$d" ] || continue
              [ -f "${d}theme.json" ] || continue
              local id="" name=""
              id="$(basename "$d")"
              if [ -n "$NODE" ] && [ -x "$NODE" ]; then
                name="$("$NODE" -e 'const fs=require("node:fs");try{const t=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(t.name||t.id||""))}catch{}' "${d}theme.json")"
              fi
              printf ' %s  %s\n' "$id" "$name"
            done
          else
            printf ' 还没有已保存的主题。先用菜单 4 导入一个。\n'
          fi
          ;;
        apply)
          local id="${2:-}"
          [ -n "$id" ] || { printf ' 用法：dreamskin theme apply <id>\n'; return 1; }
          "$SCRIPT_DIR/switch-theme-linux.sh" --id "$id" \
            && "$SCRIPT_DIR/start-dream-skin-linux.sh"
          ;;
        *) printf ' 用法：dreamskin theme list|apply <id>\n'; return 1 ;;
      esac
      ;;
    folder) xdg-open "$STATE_ROOT/themes" >/dev/null 2>&1 || printf ' 主题目录：%s\n' "$STATE_ROOT/themes" ;;
    restore) exec "$SCRIPT_DIR/restore-dream-skin-linux.sh" --restore-base-theme --restart-codex ;;
    gallery) xdg-open "https://dreamskin.cc/gallery" >/dev/null 2>&1 || true ;;
    studio) xdg-open "https://dreamskin.cc/studio" >/dev/null 2>&1 || true ;;
    autostart)
      local target="$HOME/.config/autostart/codex-dream-skin.desktop"
      if [ -f "$target" ]; then
        /bin/rm -f "$target"
        printf ' 开机自启已关闭。\n'
      else
        /bin/mkdir -p "$HOME/.config/autostart"
        /usr/bin/printf '%s\n' \
          '[Desktop Entry]' \
          'Type=Application' \
          'Name=Dream Skin' \
          "Exec=/bin/bash \"$SCRIPT_DIR/dreamskin.sh\" start" \
          'X-GNOME-Autostart-enabled=true' \
          > "$target"
        printf ' 开机自启已开启（%s）。\n' "$target"
      fi
      ;;
    # status-dream-skin-linux.sh has no --doctor flag (it rejects unknown
    # arguments); its default full report IS the diagnostic output.
    doctor) exec "$SCRIPT_DIR/status-dream-skin-linux.sh" ;;
    update) exec "$SCRIPT_DIR/check-update-linux.sh" ;;
    status) exec "$SCRIPT_DIR/status-dream-skin-linux.sh" ;;
    community) exec "$SCRIPT_DIR/community-apply-linux.sh" "$@" ;;
    *) return 1 ;;
  esac
}

main() {
  if [ "${1:-}" = "--self-test-source" ]; then
    return 0
  fi
  if [ "$#" -gt 0 ]; then
    local key=""
    # One-click dreamskin:// links bypass resolve_command so dispatch keeps
    # the URL as its argument (the desktop entry runs "dreamskin community %u",
    # but a bare "dreamskin dreamskin://apply?..." must work too).
    case "${1:-}" in
      dreamskin://*) dispatch community "$@" || exit 1; return 0 ;;
    esac
    key="$(resolve_command "$1")"
    [ -n "$key" ] || { printf '未知子命令：%s\n' "$1" >&2; exit 2; }
    dispatch "$key" "${@:2}" || exit 1
    return 0
  fi
  menu_loop
}

main "$@"
