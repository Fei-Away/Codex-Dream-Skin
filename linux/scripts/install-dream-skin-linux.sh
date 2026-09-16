#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

PORT=9335
CREATE_LAUNCHERS="true"
LAUNCH_AFTER_INSTALL="true"
IN_PLACE="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --no-launchers) CREATE_LAUNCHERS="false"; shift ;;
    --no-launch) LAUNCH_AFTER_INSTALL="false"; shift ;;
    --in-place) IN_PLACE="true"; shift ;;
    *) printf 'Unknown installer argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) printf 'Invalid port: %s\n' "$PORT" >&2; exit 2 ;; esac
[ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || { printf 'Port must be between 1024 and 65535.\n' >&2; exit 2; }

deploy_project() {
  local temporary="$INSTALL_ROOT.installing.$$"
  local previous="$INSTALL_ROOT.previous.$$"
  rm -rf "$temporary"
  mkdir -p "$temporary"
  rsync -a \
    --exclude '.git/' \
    --exclude '.DS_Store' \
    --exclude 'release/' \
    --exclude 'linux/' \
    --exclude 'runtime/' \
    --exclude 'tools/' \
    --exclude '.github/' \
    "$PROJECT_ROOT/" "$temporary/"
  chmod 700 "$temporary"/*.sh "$temporary"/scripts/*.sh 2>/dev/null || true
  rm -rf "$previous"
  if [ -e "$INSTALL_ROOT" ]; then mv "$INSTALL_ROOT" "$previous"; fi
  if ! mv "$temporary" "$INSTALL_ROOT"; then
    [ -e "$previous" ] && mv "$previous" "$INSTALL_ROOT"
    fail "Could not install the project at $INSTALL_ROOT"
  fi
  DEPLOY_PREVIOUS="$previous"
}

commit_deployed_project() {
  [ -n "${DEPLOY_PREVIOUS:-}" ] || return 0
  rm -rf "$DEPLOY_PREVIOUS" || true
  DEPLOY_PREVIOUS=""
}

rollback_deployed_project() {
  local status="$1"
  if [ -n "${DEPLOY_PREVIOUS:-}" ] && [ -d "$DEPLOY_PREVIOUS" ]; then
    rm -rf "$INSTALL_ROOT"
    mv "$DEPLOY_PREVIOUS" "$INSTALL_ROOT"
    printf 'Installation %s; rolled back to previous version.\n' "$status"
  else
    rm -rf "$INSTALL_ROOT"
    printf 'Installation %s; previous version not available for rollback.\n' "$status"
  fi
  DEPLOY_PREVIOUS=""
}

install_symlinks() {
  local bin_dir="/usr/local/bin"
  [ -d "$bin_dir" ] || bin_dir="$HOME/.local/bin"
  mkdir -p "$bin_dir"
  for cmd in dream-skin dream-skin-tray; do
    [ -f "$INSTALL_ROOT/linux/scripts/$cmd.sh" ] \
      && ln -sf "$INSTALL_ROOT/linux/scripts/$cmd.sh" "$bin_dir/$cmd"
  done
}

# Main
discover_codex_app
require_linux_runtime
ensure_state_root
seed_bundled_presets

if [ "$IN_PLACE" = "true" ]; then
  # In-place install: just make scripts executable and link
  chmod +x "$PROJECT_ROOT/linux/scripts/"*.sh 2>/dev/null || true
  install_symlinks
  printf 'Codex Dream Skin installed in-place at %s\n' "$PROJECT_ROOT"
  printf 'Symlinks created in %s\n' "$bin_dir"
else
  deploy_project
  install_symlinks
  # Symlink engine into well-known location
  local engine_link="$HOME/.codex/codex-dream-skin-studio"
  if [ -L "$engine_link" ] && [ ! -e "$engine_link" ]; then
    rm "$engine_link"
  elif [ -e "$engine_link" ]; then
    rm -rf "$engine_link"
  fi
  ln -sf "$INSTALL_ROOT" "$engine_link"
fi

if [ "$LAUNCH_AFTER_INSTALL" = "true" ]; then
  "$INSTALL_ROOT/linux/scripts/start-dream-skin-linux.sh" --port "$PORT" || true
fi

commit_deployed_project
printf 'Codex Dream Skin v%s installed successfully.\n' "$SKIN_VERSION"
