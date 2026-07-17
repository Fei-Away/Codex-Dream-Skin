#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
[ -x "$NODE" ] || { printf 'Codex bundled Node.js was not found: %s\n' "$NODE" >&2; exit 1; }

while IFS= read -r file; do /bin/bash -n "$file"; done < <(
  /usr/bin/find "$ROOT" -type f \( -name '*.sh' -o -name '*.command' \) \
    ! -path '*/release/*' -print
)
while IFS= read -r file; do "$NODE" --check "$file" >/dev/null; done < <(
  /usr/bin/find "$ROOT/scripts" "$ROOT/assets" -type f \( -name '*.mjs' -o -name '*.js' \) -print
)

if /usr/bin/grep -R -n -E 'dream-skin-skin|DREAM_SKIN_SKIN|1\.0\.0-rc2' \
  "$ROOT/scripts" "$ROOT/assets" >/dev/null; then
  printf 'Legacy release-candidate identifiers remain in runtime files.\n' >&2
  exit 1
fi
if /usr/bin/grep -R -n -E '(writeFile|rename|copyFile|rm).*app\.asar' "$ROOT/scripts" >/dev/null; then
  printf 'A runtime script appears to mutate app.asar.\n' >&2
  exit 1
fi

"$NODE" "$ROOT/scripts/injector.mjs" --check-payload >/dev/null

MIKU_PAYLOAD_JSON="$("$NODE" "$ROOT/scripts/injector.mjs" --check-payload --theme-dir "$ROOT/themes/miku-dream")"
"$NODE" -e '
  const value = JSON.parse(process.argv[1]);
  if (!value.pass || value.version !== "1.5.2" || value.themeId !== "miku-dream" || value.themeName !== "Miku Dream" || value.imageBytes < 1) process.exit(1);
' "$MIKU_PAYLOAD_JSON"

TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-tests.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

PLIST="$TMP/codex-dream-skin-autoload.plist"
"$NODE" "$ROOT/scripts/write-autoload-plist.mjs" \
  --output "$PLIST" \
  --label com.openai.codex-dream-skin-studio.autoload \
  --supervisor "$ROOT/scripts/supervise-dream-skin-macos.sh" \
  --stdout "$TMP/autoload.log" \
  --stderr "$TMP/autoload-error.log" >/dev/null
/usr/bin/plutil -lint "$PLIST" >/dev/null
[ "$(/usr/bin/plutil -extract Label raw -o - "$PLIST")" = "com.openai.codex-dream-skin-studio.autoload" ]
[ "$(/usr/bin/plutil -extract RunAtLoad raw -o - "$PLIST")" = "true" ]
[ "$(/usr/bin/plutil -extract KeepAlive raw -o - "$PLIST")" = "true" ]
[ "$(/usr/bin/plutil -extract LimitLoadToSessionType raw -o - "$PLIST")" = "Aqua" ]

/bin/mkdir -p "$TMP/theme"
/bin/cp "$ROOT/assets/portal-hero.png" "$TMP/theme/background.png"
"$NODE" "$ROOT/scripts/write-theme.mjs" custom --output-dir "$TMP/theme" \
  --image background.png --name '测试主题' --tagline '测试口号' --quote 'TEST' \
  --accent '#11aa55' --secondary '#22bbcc' --highlight '#663399' >/dev/null
PAYLOAD_JSON="$("$NODE" "$ROOT/scripts/injector.mjs" --check-payload --theme-dir "$TMP/theme")"
"$NODE" -e '
  const value = JSON.parse(process.argv[1]);
  if (!value.pass || value.themeName !== "测试主题" || value.imageBytes < 1) process.exit(1);
' "$PAYLOAD_JSON"
"$NODE" "$ROOT/scripts/write-theme.mjs" reset-demo --output-dir "$TMP/theme" >/dev/null
[ ! -e "$TMP/theme" ]

CONFIG="$TMP/config.toml"
BACKUP="$TMP/theme-backup.json"
/usr/bin/printf '%s\n' \
  'model = "gpt-5"' \
  '' \
  '[desktop]' \
  'appearanceTheme = "system"' \
  'appearanceDarkCodeThemeId = "vscode-dark"' \
  'keepMe = true' > "$CONFIG"
/bin/cp "$CONFIG" "$TMP/original.toml"
"$NODE" "$ROOT/scripts/theme-config.mjs" install "$CONFIG" "$BACKUP" >/dev/null
/usr/bin/grep -q 'appearanceTheme = "system"' "$CONFIG"
"$NODE" "$ROOT/scripts/theme-config.mjs" restore "$CONFIG" "$BACKUP" >/dev/null
/usr/bin/cmp -s "$CONFIG" "$TMP/original.toml"

/usr/bin/env -u HOME /bin/bash -c '. "$1/scripts/common-macos.sh"; [ -n "$HOME" ] && [ "$SKIN_VERSION" = "1.5.2" ]' _ "$ROOT"
"$ROOT/scripts/doctor-macos.sh" >/dev/null

printf 'PASS: syntax, bundled-theme, payload, custom-theme, config round-trip, HOME recovery, signature, and doctor checks.\n'
