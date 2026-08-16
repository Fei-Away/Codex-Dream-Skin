#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

PORT=9341
CREATE_LAUNCHERS="true"
LAUNCH_AFTER_INSTALL="true"
IN_PLACE="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --no-launchers) CREATE_LAUNCHERS="false"; shift ;;
    --no-launch) LAUNCH_AFTER_INSTALL="false"; shift ;;
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
  /bin/rm -rf "$previous"
  if [ -e "$INSTALL_ROOT" ]; then /bin/mv "$INSTALL_ROOT" "$previous"; fi
  if ! /bin/mv "$temporary" "$INSTALL_ROOT"; then
    [ -e "$previous" ] && /bin/mv "$previous" "$INSTALL_ROOT"
    fail "Could not install the project at $INSTALL_ROOT"
  fi
  DEPLOY_PREVIOUS="$previous"
}

commit_deployed_project() {
  [ -n "${DEPLOY_PREVIOUS:-}" ] || return 0
  /bin/rm -rf "$DEPLOY_PREVIOUS" || true
  DEPLOY_PREVIOUS=""
}

rollback_deployed_project() {
  local status="$1"
  local broken="$INSTALL_ROOT.broken.$$"
  # Swap with renames only: `rm -rf` on the live root is not atomic, and an
  # interrupted deletion leaves a mixed-version engine behind.  Deleting the
  # detached broken tree afterwards is safe to interrupt.
  if [ -e "$INSTALL_ROOT" ]; then
    /bin/mv "$INSTALL_ROOT" "$broken" \
      || fail "Installation failed and the broken engine could not be moved aside."
  fi
  if [ -n "${DEPLOY_PREVIOUS:-}" ] && [ -e "$DEPLOY_PREVIOUS" ]; then
    /bin/mv "$DEPLOY_PREVIOUS" "$INSTALL_ROOT" \
      || fail "Installation failed and the previous engine could not be restored."
  fi
  /bin/rm -rf "$broken" 2>/dev/null || true
  DEPLOY_PREVIOUS=""
  return "$status"
}

DEPLOY_PREVIOUS=""

discover_codex_app
if [ "$IN_PLACE" = "false" ] && [ "$PROJECT_ROOT" != "$INSTALL_ROOT" ]; then
  # Run the cheap precondition before any engine bytes move: aborting after
  # the copy forces a rollback of a perfectly good previous engine, and an
  # interrupted rollback is how a mixed-version tree ships.
  codex_is_running && fail "Close Codex before installation so config.toml cannot be rewritten while the app is saving it."
  /bin/mkdir -p "$(dirname "$INSTALL_ROOT")"
  deploy_project
  install_args=(--in-place --port "$PORT")
  [ "$CREATE_LAUNCHERS" = "true" ] || install_args+=(--no-launchers)
  [ "$LAUNCH_AFTER_INSTALL" = "true" ] || install_args+=(--no-launch)
  if "$INSTALL_ROOT/scripts/install-dream-skin-linux.sh" "${install_args[@]}"; then
    commit_deployed_project
    exit 0
  else
    status=$?
    rollback_deployed_project "$status"
    exit "$status"
  fi
fi

require_linux_runtime
ensure_state_root
codex_is_running && fail "Close Codex before installation so config.toml cannot be rewritten while the app is saving it."
seed_bundled_presets
if [ ! -f "$THEME_DIR/theme.json" ]; then
  "$SCRIPT_DIR/switch-theme-linux.sh" --id preset-gothic-void-crusade --no-apply >/dev/null
else
  # Re-stage official presets so metadata upgrades (e.g. the #183 appearance
  # pin) reach an active copy staged by an older engine.
  ACTIVE_THEME_ID="$("$NODE" -e '
const fs = require("node:fs");
let id = "";
try { id = String(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).id ?? ""); } catch {}
process.stdout.write(/^preset-[A-Za-z0-9_-]{1,72}$/.test(id) ? id : "");
' "$THEME_DIR/theme.json")"
  if [ -n "$ACTIVE_THEME_ID" ] && [ -d "$STATE_ROOT/themes/$ACTIVE_THEME_ID" ]; then
    "$SCRIPT_DIR/switch-theme-linux.sh" --id "$ACTIVE_THEME_ID" --no-apply >/dev/null
  fi
fi
[ -f "$CONFIG_PATH" ] || fail "Codex config not found: $CONFIG_PATH. Launch Codex once, close it, and rerun the installer."
"$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >/dev/null
sync_appearance_pin

if [ "$CREATE_LAUNCHERS" = "true" ]; then
  /bin/mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
  if [ -e "$HOME/.local/bin/dreamskin" ] && [ ! -L "$HOME/.local/bin/dreamskin" ]; then
    printf 'Skipping launcher link: %s exists and is not a symbolic link.\n' \
      "$HOME/.local/bin/dreamskin" >&2
  else
    /bin/ln -sf "$SCRIPT_DIR/dreamskin.sh" "$HOME/.local/bin/dreamskin"
  fi
  /usr/bin/printf '%s\n' \
    '[Desktop Entry]' \
    'Type=Application' \
    'Name=Dream Skin' \
    'Comment=External themes for Codex desktop' \
    "Exec=$SCRIPT_DIR/dreamskin.sh community %u" \
    'Terminal=true' \
    'Categories=Utility;Development;' \
    'MimeType=x-scheme-handler/dreamskin;' \
    > "$HOME/.local/share/applications/codex-dream-skin.desktop"
  if command -v xdg-mime >/dev/null 2>&1; then
    xdg-mime default codex-dream-skin.desktop x-scheme-handler/dreamskin >/dev/null 2>&1 || true
  fi
fi

printf 'Codex Dream Skin Studio %s installed at %s for Codex %s using its signed Node.js %s.\n' \
  "$SKIN_VERSION" "$PROJECT_ROOT" "$CODEX_VERSION" "$NODE_VERSION"
printf 'Run "dreamskin" from a terminal (or the Dream Skin desktop entry) to open the menu.\n'
printf 'Bundled presets are ready in your theme library — pick one from the saved-themes list or switch-theme.\n'

if [ "$LAUNCH_AFTER_INSTALL" = "true" ]; then
  "$SCRIPT_DIR/start-dream-skin-linux.sh" --port "$PORT" --prompt-restart
fi
