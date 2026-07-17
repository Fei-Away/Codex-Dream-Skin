#!/bin/bash

# Install the SwiftBar plugin and optionally install SwiftBar itself.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

INSTALL_SWIFTBAR="true"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-brew) INSTALL_SWIFTBAR="false"; shift ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

PLUGIN_SRC="$PROJECT_ROOT/menubar/codex_dream_skin.10s.sh"
[ -f "$PLUGIN_SRC" ] || fail "Plugin source missing: $PLUGIN_SRC"

# Prefer installed engine when this tree is the repo and engine already exists.
ENGINE_ROOT="$PROJECT_ROOT"
if [ -d "$INSTALL_ROOT/scripts" ]; then
  ENGINE_ROOT="$INSTALL_ROOT"
fi

PLUGIN_DIR="$STATE_ROOT/menubar"
ensure_state_root
/bin/mkdir -p "$PLUGIN_DIR"

PLUGIN_DST="$PLUGIN_DIR/codex_dream_skin.10s.sh"
{
  printf '%s\n' '#!/bin/bash'
  printf 'export CODEX_DREAM_SKIN_ENGINE=%q\n' "$ENGINE_ROOT"
  # Skip the original shebang line from the template.
  /usr/bin/tail -n +2 "$PLUGIN_SRC"
} > "$PLUGIN_DST"
/bin/chmod 755 "$PLUGIN_DST"

# Keep a copy inside the engine tree when installed separately from this tree.
if [ -d "$INSTALL_ROOT" ] && [ "$PROJECT_ROOT" != "$INSTALL_ROOT" ]; then
  /bin/mkdir -p "$INSTALL_ROOT/menubar" "$INSTALL_ROOT/scripts"
  /bin/cp -f "$PLUGIN_SRC" "$INSTALL_ROOT/menubar/codex_dream_skin.10s.sh"
  /bin/chmod 755 "$INSTALL_ROOT/menubar/codex_dream_skin.10s.sh"
  for name in pause-dream-skin-macos.sh status-dream-skin-macos.sh apply-from-menubar-macos.sh \
    switch-theme-macos.sh load-image-theme-macos.sh install-menubar-macos.sh; do
    if [ -f "$PROJECT_ROOT/scripts/$name" ]; then
      /bin/cp -f "$PROJECT_ROOT/scripts/$name" "$INSTALL_ROOT/scripts/$name"
      /bin/chmod 755 "$INSTALL_ROOT/scripts/$name"
    fi
  done
fi

/bin/chmod 755 \
  "$PROJECT_ROOT/scripts/pause-dream-skin-macos.sh" \
  "$PROJECT_ROOT/scripts/status-dream-skin-macos.sh" \
  "$PROJECT_ROOT/scripts/apply-from-menubar-macos.sh" \
  "$PROJECT_ROOT/scripts/switch-theme-macos.sh" \
  "$PROJECT_ROOT/scripts/load-image-theme-macos.sh" \
  "$PROJECT_ROOT/scripts/install-menubar-macos.sh" \
  "$PROJECT_ROOT/Install Menu Bar.command" 2>/dev/null || true

SWIFTBAR_APP=""
for candidate in "/Applications/SwiftBar.app" "$HOME/Applications/SwiftBar.app"; do
  if [ -d "$candidate" ]; then SWIFTBAR_APP="$candidate"; break; fi
done

if [ -z "$SWIFTBAR_APP" ] && [ "$INSTALL_SWIFTBAR" = "true" ]; then
  if command -v brew >/dev/null 2>&1; then
    printf 'Installing SwiftBar via Homebrew…\n'
    brew install --cask swiftbar || fail "brew install --cask swiftbar failed. Install SwiftBar manually, then rerun with --no-brew."
  else
    fail "SwiftBar is not installed and Homebrew was not found. Install SwiftBar from https://github.com/swiftbar/SwiftBar/releases then rerun with --no-brew."
  fi
  for candidate in "/Applications/SwiftBar.app" "$HOME/Applications/SwiftBar.app"; do
    if [ -d "$candidate" ]; then SWIFTBAR_APP="$candidate"; break; fi
  done
fi

[ -n "$SWIFTBAR_APP" ] || fail "SwiftBar.app not found. Install it, then rerun this script."

/usr/bin/defaults write com.ameba.SwiftBar PluginDirectory -string "$PLUGIN_DIR" 2>/dev/null || true

/usr/bin/open -a "$SWIFTBAR_APP" || true
/bin/sleep 1
/usr/bin/open "swiftbar://refreshall" 2>/dev/null || true

printf '\n'
printf 'Menu bar plugin installed.\n'
printf '  Plugin folder: %s\n' "$PLUGIN_DIR"
printf '  Engine:        %s\n' "$ENGINE_ROOT"
printf '  SwiftBar:      %s\n' "$SWIFTBAR_APP"
printf '\n'
printf 'Look at the top-right menu bar for 🎨 Skin.\n'
printf 'If missing: SwiftBar → Preferences → Plugin Folder → %s\n' "$PLUGIN_DIR"
