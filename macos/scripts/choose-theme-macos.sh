#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

ensure_state_root
ensure_node_runtime

THEMES_ROOT="$STATE_ROOT/themes"
LIBRARY="$SCRIPT_DIR/theme-library.mjs"
ids=()
labels=()

while IFS=$'\t' read -r id name collection bundled; do
  [ -n "$id" ] || continue
  ids+=("$id")
  labels+=("$collection · $name")
done < <("$NODE" "$LIBRARY" list --themes-dir "$THEMES_ROOT" --format tsv)

[ "${#ids[@]}" -gt 0 ] || fail "No themes are installed. Re-run the Dream Skin installer."

selection="$(/usr/bin/osascript - "${labels[@]}" <<'APPLESCRIPT' || true
on run choices
  set picked to choose from list choices with prompt "选择一套 Codex 主题" with title "Codex Dream Skin" OK button name "应用" cancel button name "取消"
  if picked is false then return ""
  set selectedName to item 1 of picked
  repeat with itemIndex from 1 to count choices
    if item itemIndex of choices is selectedName then return itemIndex as text
  end repeat
  return ""
end run
APPLESCRIPT
)"

[ -n "$selection" ] || exit 0
case "$selection" in ''|*[!0-9]*) fail "The theme chooser returned an invalid selection." ;; esac
[ "$selection" -ge 1 ] && [ "$selection" -le "${#ids[@]}" ] || fail "The selected theme is out of range."

exec "$SCRIPT_DIR/switch-theme-macos.sh" --id "${ids[$((selection - 1))]}"
