#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
[ -x "$NODE" ] || { printf 'Codex bundled Node.js was not found: %s\n' "$NODE" >&2; exit 1; }
EXPECTED_VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
PACKAGE_VERSION="$("$NODE" -p 'require(process.argv[1]).version' "$ROOT/package.json")"
[ "$PACKAGE_VERSION" = "$EXPECTED_VERSION" ] || {
  printf 'package.json version %s does not match VERSION %s.\n' "$PACKAGE_VERSION" "$EXPECTED_VERSION" >&2
  exit 1
}

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
if /usr/bin/grep -n -E 'verified_cdp_endpoint[^|]*\|\|[[:space:]]*cdp_http_ready|\*ChatGPT\*\|\*Codex\*\|\*codex\*' \
  "$ROOT/scripts/common-macos.sh" >/dev/null; then
  printf 'The macOS runtime contains a soft CDP identity bypass.\n' >&2
  exit 1
fi
if /usr/bin/grep -n -F 'Input.dispatchKeyEvent' "$ROOT/scripts/injector.mjs" >/dev/null; then
  printf 'Screenshot capture must not dispatch keyboard input.\n' >&2
  exit 1
fi

"$NODE" "$ROOT/scripts/injector.mjs" --check-payload >/dev/null
"$NODE" "$ROOT/scripts/injector.mjs" --self-test >/dev/null

TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-tests.XXXXXX)"
STRANGER_PID=""
cleanup() {
  if [ -n "$STRANGER_PID" ]; then
    /bin/kill -TERM "$STRANGER_PID" 2>/dev/null || true
    wait "$STRANGER_PID" 2>/dev/null || true
  fi
  /bin/rm -rf "$TMP"
}
trap cleanup EXIT

RUNTIME_HOME="$TMP/runtime-home"
RUNTIME_STATE_ROOT="$RUNTIME_HOME/Library/Application Support/CodexDreamSkinStudio"
RUNTIME_STATE="$RUNTIME_STATE_ROOT/state.json"
STATE_EVAL_MARKER="$TMP/state-eval-marker"
EXPECTED_BUNDLE="/Applications/Codex \$(touch \"$STATE_EVAL_MARKER\").app"
EXPECTED_EXE="$EXPECTED_BUNDLE/Contents/MacOS/ChatGPT; touch \"$STATE_EVAL_MARKER\""
MALICIOUS_VERSION='1.1.2 "nightly"'
MALICIOUS_TEAM_ID="TEAM'ID"
/bin/mkdir -p "$RUNTIME_STATE_ROOT"
"$NODE" -e '
  const fs = require("node:fs");
  const [file, codexBundle, codexExe, codexVersion, codexTeamId] = process.argv.slice(1);
  fs.writeFileSync(file, `${JSON.stringify({ codexBundle, codexExe, codexVersion, codexTeamId })}\n`);
' "$RUNTIME_STATE" "$EXPECTED_BUNDLE" "$EXPECTED_EXE" "$MALICIOUS_VERSION" "$MALICIOUS_TEAM_ID"
/usr/bin/env HOME="$RUNTIME_HOME" NODE="$TMP/untrusted-node" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  TRUSTED_NODE="$2"
  VALIDATION_MARKER="$3"
  discover_codex_app() {
    CODEX_BUNDLE="/Applications/Codex.app"
    CODEX_EXE="/Applications/Codex.app/Contents/MacOS/ChatGPT"
    CODEX_VERSION="test"
    printf "discover\n" >> "$VALIDATION_MARKER"
  }
  require_macos_node_runtime() {
    NODE="$TRUSTED_NODE"
    NODE_VERSION="v22.0.0"
    CODEX_TEAM_ID="2DC432GLL2"
    export NODE NODE_VERSION CODEX_TEAM_ID
    printf "validate\n" >> "$VALIDATION_MARKER"
  }
  ensure_node_runtime
  [ "$NODE" = "$TRUSTED_NODE" ]
' _ "$ROOT" "$NODE" "$TMP/runtime-validation"
/usr/bin/grep -q '^discover$' "$TMP/runtime-validation"
/usr/bin/grep -q '^validate$' "$TMP/runtime-validation"
[ ! -e "$STATE_EVAL_MARKER" ] || {
  printf 'Runtime state values were evaluated as shell code.\n' >&2
  exit 1
}

HOME="$RUNTIME_HOME" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  verified_cdp_endpoint() { return 1; }
  if wait_for_cdp 9341 1; then
    printf "An unverified CDP endpoint was accepted.\n" >&2
    exit 1
  fi
' _ "$ROOT"
HOME="$RUNTIME_HOME" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  CODEX_EXE="/bin/bash"
  listener_pids() { printf "%s\n" "$$"; }
  port_belongs_to_codex 9341
  process_executable_path() { printf "/bin/zsh\n"; }
  ! port_belongs_to_codex 9341

  CODEX_EXE="/Applications/Codex.app/Contents/MacOS/ChatGPT"
  listener_pids() { printf "999999\n"; }
  pid_is_codex_descendant() { return 0; }
  port_belongs_to_codex 9341
  pid_is_codex_descendant() { return 1; }
  ! port_belongs_to_codex 9341
' _ "$ROOT"

STRANGER_PID="$("$NODE" -e '
  const { spawn } = require("node:child_process");
  const child = spawn("/bin/sleep", ["30"], { detached: true, stdio: "ignore" });
  child.unref();
  process.stdout.write(String(child.pid));
')"
"$NODE" -e '
  const fs = require("node:fs");
  fs.writeFileSync(process.argv[1], JSON.stringify({ injectorPid: Number(process.argv[2]) }));
' "$RUNTIME_STATE" "$STRANGER_PID"
HOME="$RUNTIME_HOME" NODE="$NODE" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  stop_recorded_injector
' _ "$ROOT"
/bin/kill -0 "$STRANGER_PID"
/bin/kill -TERM "$STRANGER_PID"
STRANGER_PID=""

WATCH_FIXTURE_DIR="$TMP/watch fixture"
WATCH_FIXTURE="$WATCH_FIXTURE_DIR/injector.mjs"
WATCH_PORT=49341
/bin/mkdir -p "$WATCH_FIXTURE_DIR"
/usr/bin/printf '%s\n' 'setInterval(() => {}, 1000);' > "$WATCH_FIXTURE"
STRANGER_PID="$("$NODE" -e '
  const { spawn } = require("node:child_process");
  const [node, script, port] = process.argv.slice(1);
  const child = spawn(node, [script, "--watch", "--port", port], { detached: true, stdio: "ignore" });
  child.unref();
  process.stdout.write(String(child.pid));
' "$NODE" "$WATCH_FIXTURE" "$WATCH_PORT")"
WATCH_STARTED_AT=""
for _ in 1 2 3 4 5; do
  WATCH_STARTED_AT="$(/bin/ps -p "$STRANGER_PID" -o lstart= 2>/dev/null | /usr/bin/awk '{$1=$1; print}')"
  [ -n "$WATCH_STARTED_AT" ] && break
  /bin/sleep 0.1
done
[ -n "$WATCH_STARTED_AT" ]
"$NODE" -e '
  const fs = require("node:fs");
  const [file, pid, startedAt, nodePath, injectorPath, port] = process.argv.slice(1);
  fs.writeFileSync(file, JSON.stringify({
    injectorPid: Number(pid), injectorStartedAt: startedAt, nodePath, injectorPath, port: Number(port),
  }));
' "$RUNTIME_STATE" "$STRANGER_PID" "$WATCH_STARTED_AT" "$NODE" "$WATCH_FIXTURE" "$WATCH_PORT"
HOME="$RUNTIME_HOME" NODE="$NODE" /bin/bash -c '
  . "$1/scripts/common-macos.sh"
  INJECTOR="$2"
  INJECTOR_JOB_LABEL="com.openai.codex-dream-skin-studio.test.$3"
  stop_recorded_injector
' _ "$ROOT" "$WATCH_FIXTURE" "$$"
if /bin/kill -0 "$STRANGER_PID" 2>/dev/null; then
  printf 'A fully verified injector fixture was not stopped.\n' >&2
  exit 1
fi
STRANGER_PID=""

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

/usr/bin/env -u HOME /bin/bash -c '. "$1/scripts/common-macos.sh"; [ -n "$HOME" ] && [ "$SKIN_VERSION" = "$2" ]' _ "$ROOT" "$EXPECTED_VERSION"
"$ROOT/scripts/doctor-macos.sh" >/dev/null

printf 'PASS: syntax, payload, CDP identity, PID safety, runtime validation, custom-theme, config round-trips, version, signature, and doctor checks.\n'
