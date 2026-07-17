#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9341
CREATE_LAUNCHERS="true"
LAUNCH_AFTER_INSTALL="true"
AUTO_LOAD="true"
IN_PLACE="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --no-launchers) CREATE_LAUNCHERS="false"; shift ;;
    --no-launch) LAUNCH_AFTER_INSTALL="false"; shift ;;
    --no-auto-load) AUTO_LOAD="false"; shift ;;
    --auto-load) AUTO_LOAD="true"; shift ;;
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
  [ "$CREATE_LAUNCHERS" = "true" ] || install_args+=(--no-launchers)
  [ "$LAUNCH_AFTER_INSTALL" = "true" ] || install_args+=(--no-launch)
  [ "$AUTO_LOAD" = "true" ] || install_args+=(--no-auto-load)
  exec "$INSTALL_ROOT/scripts/install-dream-skin-macos.sh" "${install_args[@]}"
fi

discover_codex_app
require_macos_runtime
ensure_state_root
codex_is_running && fail "Close Codex before installation so config.toml cannot be rewritten while the app is saving it."
seed_bundled_presets

seed_bundled_themes() {
  local bundled_root="$PROJECT_ROOT/themes"
  local themes_root="$STATE_ROOT/themes"
  local source theme_id destination temporary
  [ -d "$bundled_root" ] || return 0
  /bin/mkdir -p "$themes_root"
  /bin/chmod 700 "$themes_root"
  for source in "$bundled_root"/*; do
    [ -d "$source" ] || continue
    [ -f "$source/theme.json" ] || continue
    theme_id="${source##*/}"
    destination="$themes_root/$theme_id"
    [ -e "$destination" ] && continue
    "$NODE" "$INJECTOR" --check-payload --theme-dir "$source" >/dev/null
    temporary="$themes_root/.${theme_id}.installing.$$"
    /bin/rm -rf "$temporary"
    /bin/mkdir -p "$temporary"
    /usr/bin/rsync -a "$source/" "$temporary/"
    /bin/chmod 600 "$temporary"/* 2>/dev/null || true
    /bin/mv "$temporary" "$destination"
  done
}

seed_bundled_themes
if [ ! -f "$THEME_DIR/theme.json" ]; then
  "$SCRIPT_DIR/switch-theme-macos.sh" --id preset-midnight-aurora --no-apply >/dev/null
fi
[ -f "$CONFIG_PATH" ] || fail "Codex config not found: $CONFIG_PATH. Launch Codex once, close it, and rerun the installer."
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
  customize_script="$(shell_quote "$SCRIPT_DIR/customize-theme-macos.sh")"
  verify_script="$(shell_quote "$SCRIPT_DIR/verify-dream-skin-macos.sh")"
  restore_script="$(shell_quote "$SCRIPT_DIR/restore-dream-skin-macos.sh")"
  autoload_script="$(shell_quote "$SCRIPT_DIR/autoload-dream-skin-macos.sh")"
  studio_script="$(shell_quote "$SCRIPT_DIR/start-theme-studio-macos.sh")"
  screenshot="$(shell_quote "$HOME/Desktop/Codex Dream Skin Verification.png")"
  write_launcher "$HOME/Desktop/Codex Dream Skin.command" "exec $start_script --port $PORT --prompt-restart"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Customize.command" "exec $customize_script"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Verify.command" "$verify_script --screenshot $screenshot && /usr/bin/open $screenshot"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Restore.command" "exec $restore_script --restore-base-theme --restart-codex"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Enable Auto Load.command" "exec $autoload_script enable --port $PORT"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Disable Auto Load.command" "exec $autoload_script disable"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Auto Load Status.command" "exec $autoload_script status"
  write_launcher "$HOME/Desktop/Codex Dream Skin - Theme Studio.command" "exec $studio_script"
fi

printf 'Codex Dream Skin Studio %s installed at %s for Codex %s using its signed Node.js %s.\n' \
  "$SKIN_VERSION" "$PROJECT_ROOT" "$CODEX_VERSION" "$NODE_VERSION"
printf 'Use the Desktop launchers to customize, start, verify, restore, or control automatic loading.\n'
printf 'Bundled presets are ready in your theme library — pick one from the menu bar (已保存的主题) or switch-theme.\n'

if [ "$AUTO_LOAD" = "true" ]; then
  auto_args=(enable --port "$PORT")
  [ "$LAUNCH_AFTER_INSTALL" = "true" ] || auto_args+=(--no-start)
  "$SCRIPT_DIR/autoload-dream-skin-macos.sh" "${auto_args[@]}"
else
  "$SCRIPT_DIR/autoload-dream-skin-macos.sh" disable --keep-live >/dev/null 2>&1 || true
  if [ "$LAUNCH_AFTER_INSTALL" = "true" ]; then
    "$SCRIPT_DIR/start-dream-skin-macos.sh" --port "$PORT" --prompt-restart
  fi
fi
