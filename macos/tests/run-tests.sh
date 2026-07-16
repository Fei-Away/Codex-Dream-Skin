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
if /usr/bin/grep -n -E '/usr/bin/python3|(^|[[:space:]])eval([[:space:]]|$)' \
  "$ROOT/scripts/common-macos.sh" >/dev/null; then
  printf 'The shared macOS runtime must parse state with the bundled Node.js, without python3 or eval.\n' >&2
  exit 1
fi

"$NODE" "$ROOT/scripts/injector.mjs" --check-payload >/dev/null

TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-tests.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT
RUNTIME_HOME="$TMP/runtime-home"
RUNTIME_STATE_ROOT="$RUNTIME_HOME/Library/Application Support/CodexDreamSkinStudio"
RUNTIME_STATE="$RUNTIME_STATE_ROOT/state.json"
STATE_EVAL_MARKER="$TMP/state-eval-marker"
EXPECTED_BUNDLE="/Applications/Codex \$(touch \"$STATE_EVAL_MARKER\").app"
EXPECTED_EXE="$EXPECTED_BUNDLE/Contents/MacOS/ChatGPT; touch \"$STATE_EVAL_MARKER\""
EXPECTED_VERSION='1.1.2 "nightly"'
EXPECTED_TEAM_ID="TEAM'ID"
/bin/mkdir -p "$RUNTIME_STATE_ROOT"
"$NODE" -e '
  const fs = require("node:fs");
  const [file, codexBundle, codexExe, codexVersion, codexTeamId] = process.argv.slice(1);
  fs.writeFileSync(file, `${JSON.stringify({ codexBundle, codexExe, codexVersion, codexTeamId })}\n`);
' "$RUNTIME_STATE" "$EXPECTED_BUNDLE" "$EXPECTED_EXE" "$EXPECTED_VERSION" "$EXPECTED_TEAM_ID"
/usr/bin/env -u NODE -u NODE_VERSION HOME="$RUNTIME_HOME" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  ensure_node_runtime
  [ "$CODEX_BUNDLE" = "$2" ]
  [ "$CODEX_EXE" = "$3" ]
  [ "$CODEX_VERSION" = "$4" ]
  [ "$CODEX_TEAM_ID" = "$5" ]
' _ "$ROOT" "$EXPECTED_BUNDLE" "$EXPECTED_EXE" "$EXPECTED_VERSION" "$EXPECTED_TEAM_ID"
[ ! -e "$STATE_EVAL_MARKER" ] || {
  printf 'Runtime state values were evaluated as shell code.\n' >&2
  exit 1
}

LIBRARY_JSON="$("$NODE" "$ROOT/scripts/theme-library.mjs" validate)"
"$NODE" -e '
  const value = JSON.parse(process.argv[1]);
  if (!value.pass || value.collectionCount !== 2 || value.themeCount !== 13) process.exit(1);
' "$LIBRARY_JSON"
while IFS= read -r preset; do
  PAYLOAD_JSON="$("$NODE" "$ROOT/scripts/injector.mjs" --check-payload --theme-dir "$preset")"
  "$NODE" -e '
    const value = JSON.parse(process.argv[1]);
    if (!value.pass || value.imageBytes < 1) process.exit(1);
  ' "$PAYLOAD_JSON"
  image="$("$NODE" -e 'const p=require("path"),fs=require("fs");const d=process.argv[1],t=JSON.parse(fs.readFileSync(p.join(d,"theme.json"),"utf8"));process.stdout.write(p.join(d,t.image))' "$preset")"
  width="$(/usr/bin/sips -g pixelWidth "$image" 2>/dev/null | /usr/bin/awk '/pixelWidth/{print $2}')"
  height="$(/usr/bin/sips -g pixelHeight "$image" 2>/dev/null | /usr/bin/awk '/pixelHeight/{print $2}')"
  [ "$width" -ge 2000 ] && [ "$height" -ge 650 ] && [ "$((width * 10))" -ge "$((height * 28))" ] \
    || { printf 'Preset is not a sufficiently wide banner: %s (%sx%s)\n' "$preset" "$width" "$height" >&2; exit 1; }
done < <(/usr/bin/find "$ROOT/presets" -mindepth 1 -maxdepth 1 -type d -print | /usr/bin/sort)

THEMES_ROOT="$TMP/themes"
CUSTOM_THEME="$THEMES_ROOT/custom-keep"
/bin/mkdir -p "$CUSTOM_THEME"
/bin/cp "$ROOT/assets/portal-hero.png" "$CUSTOM_THEME/background.png"
"$NODE" "$ROOT/scripts/write-theme.mjs" custom --output-dir "$CUSTOM_THEME" \
  --image background.png --name '保留的用户主题' >/dev/null
"$NODE" "$ROOT/scripts/theme-library.mjs" install --themes-dir "$THEMES_ROOT" >/dev/null
[ -f "$CUSTOM_THEME/theme.json" ]
[ "$(/usr/bin/find "$THEMES_ROOT" -mindepth 1 -maxdepth 1 -type d ! -name '.*' | /usr/bin/wc -l | /usr/bin/tr -d ' ')" -eq 14 ]
/usr/bin/touch "$THEMES_ROOT/miyazaki-totoro/stale-file"
"$NODE" "$ROOT/scripts/theme-library.mjs" install --themes-dir "$THEMES_ROOT" >/dev/null
[ ! -e "$THEMES_ROOT/miyazaki-totoro/stale-file" ]
[ -f "$CUSTOM_THEME/theme.json" ]
THEME_LIST="$("$NODE" "$ROOT/scripts/theme-library.mjs" list --themes-dir "$THEMES_ROOT")"
"$NODE" -e '
  const themes = JSON.parse(process.argv[1]);
  if (themes.length !== 14) process.exit(1);
  if (themes.filter((theme) => theme.bundled).length !== 13) process.exit(1);
  if (!themes.some((theme) => theme.name === "保留的用户主题" && !theme.bundled)) process.exit(1);
' "$THEME_LIST"

MENU_HOME="$TMP/menu-home"
MENU_THEMES="$MENU_HOME/Library/Application Support/CodexDreamSkinStudio/themes"
"$NODE" "$ROOT/scripts/theme-library.mjs" install --themes-dir "$MENU_THEMES" >/dev/null
MENU_OUTPUT="$(HOME="$MENU_HOME" CODEX_DREAM_SKIN_ENGINE="$ROOT" /bin/bash "$ROOT/menubar/codex_dream_skin.10s.sh")"
[ "$(printf '%s\n' "$MENU_OUTPUT" | /usr/bin/grep -Ec 'param2="(miyazaki|shinkai)-')" -eq 13 ]
printf '%s\n' "$MENU_OUTPUT" | /usr/bin/grep -q '^宫崎骏导演长篇$'
printf '%s\n' "$MENU_OUTPUT" | /usr/bin/grep -q '^特别收录$'

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
/bin/mkdir -p "$TMP/missing-theme"
if MISSING_THEME_OUTPUT="$(
  "$NODE" "$ROOT/scripts/injector.mjs" --check-payload --theme-dir "$TMP/missing-theme" 2>&1
)"; then
  printf 'Explicit theme directory without theme.json unexpectedly passed.\n' >&2
  exit 1
fi
/usr/bin/printf '%s\n' "$MISSING_THEME_OUTPUT" | /usr/bin/grep -F -q \
  "Explicit theme directory is missing theme.json: $TMP/missing-theme/theme.json"
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
/usr/bin/cmp -s "$CONFIG" "$TMP/original.toml"
"$NODE" -e '
  const backup = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (backup.values.appearanceTheme !== `appearanceTheme = "system"`) process.exit(1);
  if (backup.values.appearanceDarkCodeThemeId !== `appearanceDarkCodeThemeId = "vscode-dark"`) process.exit(1);
' "$BACKUP"
"$NODE" "$ROOT/scripts/theme-config.mjs" restore "$CONFIG" "$BACKUP" >/dev/null
/usr/bin/cmp -s "$CONFIG" "$TMP/original.toml"

NO_DESKTOP_CONFIG="$TMP/config-without-desktop.toml"
NO_DESKTOP_BACKUP="$TMP/theme-backup-without-desktop.json"
/usr/bin/printf '%s\n' 'model = "gpt-5"' 'keepMe = true' > "$NO_DESKTOP_CONFIG"
/bin/cp "$NO_DESKTOP_CONFIG" "$TMP/original-without-desktop.toml"
"$NODE" "$ROOT/scripts/theme-config.mjs" install "$NO_DESKTOP_CONFIG" "$NO_DESKTOP_BACKUP" >/dev/null
"$NODE" "$ROOT/scripts/theme-config.mjs" restore "$NO_DESKTOP_CONFIG" "$NO_DESKTOP_BACKUP" >/dev/null
/usr/bin/cmp -s "$NO_DESKTOP_CONFIG" "$TMP/original-without-desktop.toml"

/usr/bin/env -u HOME /bin/bash -c '. "$1/scripts/common-macos.sh"; [ -n "$HOME" ] && [ "$SKIN_VERSION" = "1.1.2" ]' _ "$ROOT"
DOCTOR_HOME="$TMP/doctor-home"
DOCTOR_THEME="$DOCTOR_HOME/Library/Application Support/CodexDreamSkinStudio/theme"
/bin/mkdir -p "$DOCTOR_HOME/.codex" "$DOCTOR_THEME"
/usr/bin/printf '%s\n' 'model = "gpt-5"' > "$DOCTOR_HOME/.codex/config.toml"
/bin/cp "$ROOT/assets/portal-hero.png" "$DOCTOR_THEME/background.png"
"$NODE" "$ROOT/scripts/write-theme.mjs" custom --output-dir "$DOCTOR_THEME" \
  --image background.png --name 'Doctor 测试主题' >/dev/null
HOME="$DOCTOR_HOME" "$ROOT/scripts/doctor-macos.sh" >/dev/null

printf 'PASS: syntax, 13 presets, library install preservation, payload, runtime-state safety, custom-theme, config round-trips, HOME recovery, signature, and doctor checks.\n'
