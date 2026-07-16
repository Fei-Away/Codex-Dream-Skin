#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9341
CREATE_LAUNCHERS="true"
CREATE_LAUNCHER_APP="true"
LAUNCH_AFTER_INSTALL="false"
IN_PLACE="false"
THEME_ID=""
PROMPT_THEME="true"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --theme-id) THEME_ID="${2:-}"; PROMPT_THEME="false"; shift 2 ;;
    --no-theme-prompt) PROMPT_THEME="false"; shift ;;
    --no-launchers) CREATE_LAUNCHERS="false"; shift ;;
    --no-launcher-app) CREATE_LAUNCHER_APP="false"; shift ;;
    --no-launch) LAUNCH_AFTER_INSTALL="false"; shift ;;
    --launch) LAUNCH_AFTER_INSTALL="true"; shift ;;
    --in-place) IN_PLACE="true"; shift ;;
    *) fail "Unknown installer argument: $1" ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) fail "Invalid port: $PORT" ;; esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || fail "Port must be between 1024 and 65535."

deploy_project() {
  local temporary="$INSTALL_ROOT.installing.$$"
  local previous="$INSTALL_ROOT.previous.$$"
  /bin/rm -rf "$temporary"
  /bin/mkdir -p "$temporary"
  /usr/bin/rsync -a \
    --exclude '.git/' \
    --exclude '.DS_Store' \
    --exclude 'release/' \
    --exclude 'runtime/' \
    "$PROJECT_ROOT/" "$temporary/"
  /bin/chmod 700 "$temporary"/*.command "$temporary"/scripts/*.sh 2>/dev/null || true
  if [ -e "$INSTALL_ROOT" ]; then /bin/mv "$INSTALL_ROOT" "$previous"; fi
  if ! /bin/mv "$temporary" "$INSTALL_ROOT"; then
    [ -e "$previous" ] && /bin/mv "$previous" "$INSTALL_ROOT"
    fail "Could not install the project at $INSTALL_ROOT"
  fi
  /bin/rm -rf "$previous"
}

if [ "$IN_PLACE" = "false" ] && [ "$PROJECT_ROOT" != "$INSTALL_ROOT" ]; then
  /bin/mkdir -p "$(dirname "$INSTALL_ROOT")"
  deploy_project
  install_args=(--in-place --port "$PORT")
  [ -z "$THEME_ID" ] || install_args+=(--theme-id "$THEME_ID")
  [ "$PROMPT_THEME" = "true" ] || install_args+=(--no-theme-prompt)
  [ "$CREATE_LAUNCHERS" = "true" ] || install_args+=(--no-launchers)
  [ "$CREATE_LAUNCHER_APP" = "true" ] || install_args+=(--no-launcher-app)
  [ "$LAUNCH_AFTER_INSTALL" = "true" ] && install_args+=(--launch)
  exec "$INSTALL_ROOT/scripts/install-dream-skin-macos.sh" "${install_args[@]}"
fi

discover_codex_app
require_macos_runtime
ensure_state_root
[ -f "$CONFIG_PATH" ] || fail "Codex config not found: $CONFIG_PATH. Launch Codex once, close it, and rerun the installer."

install_bundled_themes() {
  local source="$PROJECT_ROOT/bundled-themes"
  local target="$STATE_ROOT/themes"
  local theme
  [ -d "$source" ] || fail "Bundled themes are missing: $source"
  /bin/mkdir -p "$target"
  for theme in "$source"/*; do
    [ -d "$theme" ] || continue
    [ -f "$theme/theme.json" ] || continue
    /bin/mkdir -p "$target/$(/usr/bin/basename "$theme")"
    /usr/bin/rsync -a --delete "$theme/" "$target/$(/usr/bin/basename "$theme")/"
  done
  /bin/chmod 700 "$target" "$THEME_DIR"
  /usr/bin/find "$target" "$THEME_DIR" -type f -exec /bin/chmod 600 {} +
}

choose_initial_theme() {
  case "$THEME_ID" in
    dongge-marginalia|dongge-blueprint|dongge-placard|dongge-light) return 0 ;;
    "") ;;
    *) fail "Unknown theme id: $THEME_ID" ;;
  esac

  if [ "$PROMPT_THEME" = "true" ]; then
    local choice
    choice="$(/usr/bin/osascript <<'APPLESCRIPT' 2>/dev/null || true
set picked to choose from list {"语言的用法", "开源工作台", "心理问题举牌", "经典白板"} with title "栋哥 Codex" with prompt "选择默认栋哥图片" default items {"语言的用法"}
if picked is false then return ""
return item 1 of picked
APPLESCRIPT
)"
    case "$choice" in
      语言的用法) THEME_ID="dongge-marginalia" ;;
      开源工作台) THEME_ID="dongge-blueprint" ;;
      心理问题举牌) THEME_ID="dongge-placard" ;;
      经典白板) THEME_ID="dongge-light" ;;
      *) THEME_ID="dongge-marginalia" ;;
    esac
  fi

  [ -n "$THEME_ID" ] || THEME_ID="dongge-marginalia"
}

install_active_theme() {
  local source="$STATE_ROOT/themes/$THEME_ID"
  [ -f "$source/theme.json" ] || fail "Bundled theme is missing: $THEME_ID"
  /bin/mkdir -p "$THEME_DIR"
  /usr/bin/rsync -a --delete "$source/" "$THEME_DIR/"
  /bin/chmod 700 "$THEME_DIR"
  /usr/bin/find "$THEME_DIR" -type f -exec /bin/chmod 600 {} +
}

install_bundled_themes
choose_initial_theme
install_active_theme
"$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >/dev/null
"$NODE" "$SCRIPT_DIR/theme-config.mjs" install "$CONFIG_PATH" "$THEME_BACKUP_PATH"

shell_quote() {
  "$NODE" -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

write_launcher() {
  local target="$1"
  local command="$2"
  if [ -e "$target" ] && ! /usr/bin/grep -q '^# CodexDreamSkinStudio launcher$' "$target" 2>/dev/null; then
    fail "Refusing to overwrite an unrelated Desktop file: $target"
  fi
  /usr/bin/printf '%s\n' \
    '#!/bin/bash' \
    '# CodexDreamSkinStudio launcher' \
    'set -e' \
    "$command" > "$target"
  /bin/chmod 700 "$target"
}

if [ "$CREATE_LAUNCHERS" = "true" ]; then
  /bin/mkdir -p "$HOME/Desktop"
  start_script="$(shell_quote "$SCRIPT_DIR/start-dream-skin-macos.sh")"
  choose_script="$(shell_quote "$SCRIPT_DIR/choose-theme-macos.sh")"
  customize_script="$(shell_quote "$SCRIPT_DIR/customize-theme-macos.sh")"
  verify_script="$(shell_quote "$SCRIPT_DIR/verify-dream-skin-macos.sh")"
  restore_script="$(shell_quote "$SCRIPT_DIR/restore-dream-skin-macos.sh")"
  screenshot="$(shell_quote "$HOME/Desktop/Codex Dream Skin Verification.png")"
  write_launcher "$HOME/Desktop/Codex Dream Skin.command" "exec $start_script --port $PORT"
  write_launcher "$HOME/Desktop/栋哥 Codex - 切换风格.command" "exec $choose_script"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Customize.command" "exec $customize_script"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Verify.command" "$verify_script --screenshot $screenshot && /usr/bin/open $screenshot"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Restore.command" "exec $restore_script --restore-base-theme"
fi

if [ "$CREATE_LAUNCHER_APP" = "true" ]; then
  "$SCRIPT_DIR/create-launcher-app-macos.sh"
fi

printf 'Codex Dream Skin Studio %s installed at %s for Codex %s using its signed Node.js %s.\n' \
  "$SKIN_VERSION" "$PROJECT_ROOT" "$CODEX_VERSION" "$NODE_VERSION"
printf 'Default Dongge theme: %s\n' "$THEME_ID"
printf 'Open “栋哥 Codex.app” from Desktop or ~/Applications. If official Codex is already open, quit it manually first.\n'

if [ "$LAUNCH_AFTER_INSTALL" = "true" ]; then
  "$SCRIPT_DIR/start-dream-skin-macos.sh" --port "$PORT"
fi
