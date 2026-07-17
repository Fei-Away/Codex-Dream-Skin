#!/bin/bash

# Reversible saved-theme preview with explicit keep/cancel and stale recovery.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

ACTION="preview"
THEME_ID=""
APPLY_NOW="true"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --action) ACTION="${2:-}"; shift 2 ;;
    --id) THEME_ID="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Unknown theme preview argument: $1" ;;
  esac
done
case "$ACTION" in
  preview|begin|commit|cancel|recover-stale) ;;
  *) fail "Invalid theme preview action: $ACTION" ;;
esac

ensure_state_root
ensure_node_runtime
PREVIEW_CORE="$SCRIPT_DIR/theme-preview.mjs"
PREVIEW_DIR="$STATE_ROOT/theme-preview"
PREVIEW_STATE="$PREVIEW_DIR/preview.json"
THEMES_ROOT="$STATE_ROOT/themes"

progress() {
  printf '%s\n' "$*" >&2
  notify_user "$*"
}

preview_state_field() {
  "$NODE" -e '
    const fs = require("fs");
    const [file, field] = process.argv.slice(1);
    const value = JSON.parse(fs.readFileSync(file, "utf8"))[field];
    if (value === undefined || value === null) process.exit(1);
    process.stdout.write(String(value));
  ' "$PREVIEW_STATE" "$1"
}

preview_owner_alive() {
  [ -f "$PREVIEW_STATE" ] || return 1
  local owner_pid owner_started actual_started
  owner_pid="$(preview_state_field ownerPid 2>/dev/null)" || return 1
  owner_started="$(preview_state_field ownerStartedAt 2>/dev/null)" || return 1
  case "$owner_pid" in ''|*[!0-9]*) return 1 ;; esac
  [ "$owner_pid" -gt 0 ] || return 1
  actual_started="$(LC_ALL=C process_started_at "$owner_pid")"
  [ -n "$actual_started" ] && [ "$actual_started" = "$owner_started" ]
}

preview_port() {
  local port=9341
  if [ -f "$STATE_PATH" ]; then
    local saved
    saved="$(state_field port 2>/dev/null || true)"
    [ -n "${saved:-}" ] && port="$saved"
  fi
  printf '%s\n' "$port"
}

apply_active_theme() {
  local port
  port="$(preview_port)"
  if hot_reapply_theme "$port" 8000; then
    return 0
  fi
  "$SCRIPT_DIR/start-dream-skin-macos.sh" --port "$port" --restart-existing
}

recover_stale_preview() {
  [ -d "$PREVIEW_DIR" ] || return 0
  if preview_owner_alive; then
    return 0
  fi
  progress "Recovering the theme that was active before the interrupted preview..."
  "$NODE" "$PREVIEW_CORE" cancel --state-root "$STATE_ROOT" >/dev/null
  if [ "$APPLY_NOW" = "true" ]; then
    local port
    port="$(preview_port)"
    hot_reapply_theme "$port" 8000 || true
  fi
}

validate_theme_id() {
  [ -n "$THEME_ID" ] || fail "Pass --id <saved-theme-id>."
  case "$THEME_ID" in
    *[!A-Za-z0-9_-]*|'') fail "Theme id may contain only letters, numbers, underscores, and hyphens." ;;
  esac
  [ "${#THEME_ID}" -le 80 ] || fail "Theme id is too long."
}

begin_preview() {
  validate_theme_id
  recover_stale_preview
  [ ! -e "$PREVIEW_DIR" ] || fail "Another theme preview is still in progress."
  local source owner_started
  source="$THEMES_ROOT/$THEME_ID"
  [ -d "$source" ] || fail "Theme not found: $THEME_ID"
  [ -f "$source/theme.json" ] || fail "theme.json missing in $THEME_ID"
  owner_started="$(LC_ALL=C process_started_at "$$")"
  [ -n "$owner_started" ] || fail "Could not record the preview process identity."
  "$NODE" "$PREVIEW_CORE" begin \
    --state-root "$STATE_ROOT" \
    --source "$source" \
    --owner-pid "$$" \
    --owner-started-at "$owner_started" >/dev/null
}

cancel_preview() {
  [ -d "$PREVIEW_DIR" ] || fail "No theme preview is in progress."
  "$NODE" "$PREVIEW_CORE" cancel --state-root "$STATE_ROOT" >/dev/null
  if [ "$APPLY_NOW" = "true" ]; then
    apply_active_theme
  fi
}

commit_preview() {
  [ -d "$PREVIEW_DIR" ] || fail "No theme preview is in progress."
  "$NODE" "$PREVIEW_CORE" commit --state-root "$STATE_ROOT" >/dev/null
}

case "$ACTION" in
  recover-stale)
    recover_stale_preview
    exit 0
    ;;
  begin)
    begin_preview
    if [ "$APPLY_NOW" = "true" ]; then apply_active_theme; fi
    progress "Theme preview is ready."
    exit 0
    ;;
  cancel)
    cancel_preview
    progress "The previous theme was restored."
    exit 0
    ;;
  commit)
    commit_preview
    progress "The previewed theme was kept."
    exit 0
    ;;
esac

PREVIEW_RESOLVED="false"
rollback_unresolved_preview() {
  local code=$?
  if [ "$PREVIEW_RESOLVED" != "true" ] && [ -d "$PREVIEW_DIR" ]; then
    "$NODE" "$PREVIEW_CORE" cancel --state-root "$STATE_ROOT" >/dev/null 2>&1 || true
    port="$(preview_port)"
    hot_reapply_theme "$port" 8000 || true
  fi
  return "$code"
}
trap rollback_unresolved_preview EXIT

begin_preview
progress "Previewing theme..."
apply_active_theme
THEME_NAME="$("$NODE" -e '
  const theme = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.stdout.write(theme.name || theme.id || "Theme");
' "$THEME_DIR/theme.json")"

if DECISION="$(/usr/bin/osascript - "$THEME_NAME" <<'APPLESCRIPT'
on run argv
  set themeName to item 1 of argv
  set choice to display dialog "正在安全试穿：" & themeName & return & return & "保留这套主题，还是恢复试穿前的主题？" buttons {"恢复原主题", "保留此主题"} default button "恢复原主题" cancel button "恢复原主题" with title "Codex Dream Skin · 安全试穿"
  return button returned of choice
end run
APPLESCRIPT
)"; then
  :
else
  DECISION="恢复原主题"
fi

if [ "$DECISION" = "保留此主题" ]; then
  commit_preview
  PREVIEW_RESOLVED="true"
  progress "Done: ${THEME_NAME}"
else
  cancel_preview
  PREVIEW_RESOLVED="true"
  progress "The previous theme was restored."
fi
trap - EXIT
