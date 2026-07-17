#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
[ -x "$NODE" ] || { printf 'Node.js was not found: %s\n' "$NODE" >&2; exit 1; }

/usr/bin/grep -F -q 'theme-preview-macos.sh' \
  "$ROOT/menubar/codex_dream_skin.10s.sh"
/usr/bin/grep -F -q 'theme-preview-macos.sh" --action recover-stale --no-apply' \
  "$ROOT/scripts/start-dream-skin-macos.sh"
/usr/bin/grep -F -q 'default button "恢复原主题"' \
  "$ROOT/scripts/theme-preview-macos.sh"
for preview_runtime in theme-preview-macos.sh theme-preview.mjs stage-theme.mjs; do
  /usr/bin/grep -F -q "$preview_runtime" "$ROOT/scripts/install-menubar-macos.sh"
done

TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-preview-shell.XXXXXX)"
cleanup_preview_tests() { /bin/rm -rf "$TMP"; }
trap cleanup_preview_tests EXIT

PREVIEW_HOME="$TMP/home"
PREVIEW_STATE="$PREVIEW_HOME/Library/Application Support/CodexDreamSkinStudio"
PREVIEW_THEME="$PREVIEW_STATE/themes/preset-preview-fixture"
/bin/mkdir -p "$PREVIEW_STATE/theme" "$PREVIEW_THEME"
/bin/cp "$ROOT/assets/portal-hero.png" "$PREVIEW_STATE/theme/original.png"
/usr/bin/printf '%s\n' \
  '{"schemaVersion":1,"id":"original","name":"原主题","image":"original.png"}' \
  > "$PREVIEW_STATE/theme/theme.json"
/bin/cp "$ROOT/presets/preset-gothic-void-crusade/background.jpg" \
  "$PREVIEW_THEME/background.jpg"
/bin/cp "$ROOT/presets/preset-gothic-void-crusade/theme.json" \
  "$PREVIEW_THEME/theme.json"

if /usr/bin/env HOME="$PREVIEW_HOME" NODE="$NODE" \
  "$ROOT/scripts/theme-preview-macos.sh" --action begin \
    --id '../escape' --no-apply >/dev/null 2>&1; then
  printf 'Safe preview unexpectedly accepted a path traversal theme id.\n' >&2
  exit 1
fi

/usr/bin/env HOME="$PREVIEW_HOME" NODE="$NODE" \
  "$ROOT/scripts/theme-preview-macos.sh" --action begin \
    --id preset-preview-fixture --no-apply >/dev/null
[ -f "$PREVIEW_STATE/theme-preview/backup/theme.json" ]
[ -f "$PREVIEW_STATE/theme-preview/candidate/theme.json" ]
"$NODE" -e '
  const theme = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (theme.id !== "preset-gothic-void-crusade") process.exit(1);
' "$PREVIEW_STATE/theme/theme.json"

/usr/bin/env HOME="$PREVIEW_HOME" NODE="$NODE" \
  "$ROOT/scripts/theme-preview-macos.sh" --action cancel --no-apply >/dev/null
"$NODE" -e '
  const theme = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (theme.id !== "original") process.exit(1);
' "$PREVIEW_STATE/theme/theme.json"
[ ! -e "$PREVIEW_STATE/theme-preview" ]

/usr/bin/env HOME="$PREVIEW_HOME" NODE="$NODE" \
  "$ROOT/scripts/theme-preview-macos.sh" --action begin \
    --id preset-preview-fixture --no-apply >/dev/null
/usr/bin/env HOME="$PREVIEW_HOME" NODE="$NODE" \
  "$ROOT/scripts/theme-preview-macos.sh" --action commit --no-apply >/dev/null
"$NODE" -e '
  const theme = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (theme.id !== "preset-gothic-void-crusade") process.exit(1);
' "$PREVIEW_STATE/theme/theme.json"
[ ! -e "$PREVIEW_STATE/theme-preview" ]

/bin/cp "$ROOT/assets/portal-hero.png" "$PREVIEW_STATE/theme/original.png"
/usr/bin/printf '%s\n' \
  '{"schemaVersion":1,"id":"original","name":"原主题","image":"original.png"}' \
  > "$PREVIEW_STATE/theme/theme.json"
/usr/bin/env HOME="$PREVIEW_HOME" NODE="$NODE" \
  "$ROOT/scripts/theme-preview-macos.sh" --action begin \
    --id preset-preview-fixture --no-apply >/dev/null
"$NODE" -e '
  const fs = require("fs");
  const [file, livePid] = process.argv.slice(1);
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  state.ownerPid = Number(livePid);
  state.ownerStartedAt = "stale-owner";
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
' "$PREVIEW_STATE/theme-preview/preview.json" "$$"
/usr/bin/env HOME="$PREVIEW_HOME" NODE="$NODE" \
  "$ROOT/scripts/theme-preview-macos.sh" --action recover-stale --no-apply >/dev/null
"$NODE" -e '
  const theme = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (theme.id !== "original") process.exit(1);
' "$PREVIEW_STATE/theme/theme.json"
[ ! -e "$PREVIEW_STATE/theme-preview" ]

/usr/bin/env HOME="$PREVIEW_HOME" NODE="$NODE" \
  "$ROOT/scripts/theme-preview-macos.sh" --action begin \
    --id preset-preview-fixture --no-apply >/dev/null
/bin/mv "$PREVIEW_STATE/theme-preview/backup" \
  "$PREVIEW_STATE/theme-preview/backup-real"
/bin/ln -s "$PREVIEW_STATE/theme-preview/candidate" \
  "$PREVIEW_STATE/theme-preview/backup"
if /usr/bin/env HOME="$PREVIEW_HOME" NODE="$NODE" \
  "$ROOT/scripts/theme-preview-macos.sh" --action cancel --no-apply >/dev/null 2>&1; then
  printf 'Safe preview accepted a symlinked recovery snapshot.\n' >&2
  exit 1
fi
[ -L "$PREVIEW_STATE/theme-preview/backup" ]
[ -d "$PREVIEW_STATE/theme-preview/backup-real" ]

printf 'PASS: macOS preview wrapper keeps, cancels, recovers, and installs its runtime.\n'
