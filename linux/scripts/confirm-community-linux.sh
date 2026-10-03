#!/bin/bash

# A browser protocol permission is not approval to change the active theme.
# Require a separate local confirmation; headless invocations fail closed.
confirm_community_theme() {
  local name="$1"
  local version="$2"
  local answer=""
  if [ -t 0 ]; then
    printf 'Apply Dream Skin theme "%s" (v%s)? [y/N] ' "$name" "$version" >&2
    read -r answer || return 1
    case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
  fi
  if command -v zenity >/dev/null 2>&1; then
    zenity --question --default-cancel --no-markup --title="Dream Skin" \
      --text="Apply theme \"$name\" (v$version) to Codex?" \
      --ok-label="Apply" --cancel-label="Cancel"
    return $?
  fi
  printf 'Theme not applied: local confirmation requires a terminal or zenity.\n' >&2
  return 1
}
