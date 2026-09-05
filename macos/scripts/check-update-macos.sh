#!/bin/bash

set -euo pipefail
export LC_ALL=C
export LANG=C

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$ROOT/scripts/localization-macos.sh"
VERSION_PATH="$ROOT/VERSION"
REPOSITORY="Fei-Away/Codex-Dream-Skin"
RELEASES_ORIGIN="https://github.com/$REPOSITORY/releases"
API_ORIGIN="https://api.github.com/repos/$REPOSITORY/releases"
MAX_RESPONSE_BYTES=1048576
MAX_CHECKSUM_BYTES=65536
MAX_DMG_BYTES=536870912
JSON="false"
INTERACTIVE="false"
DOWNLOAD_VERSION=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --json) JSON="true"; shift ;;
    --interactive) INTERACTIVE="true"; shift ;;
    --download)
      [ -z "$DOWNLOAD_VERSION" ] || { printf 'Duplicate --download argument.\n' >&2; exit 2; }
      DOWNLOAD_VERSION="${2:-}"
      [ -n "$DOWNLOAD_VERSION" ] || { printf 'Missing --download version.\n' >&2; exit 2; }
      shift 2
      ;;
    *) printf 'Unknown update argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done
[ -z "$DOWNLOAD_VERSION" ] || [ "$INTERACTIVE" = "false" ] \
  || { printf '%s\n' '--download and --interactive cannot be used together.' >&2; exit 2; }

fail() {
  printf 'Codex Dream Skin update check: %s\n' "$*" >&2
  exit 1
}

normalize_version() {
  local value="$1"
  value="${value#v}"
  value="${value#V}"
  printf '%s' "$value" | /usr/bin/grep -Eq \
    '^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$' \
    || return 1
  printf '%s\n' "$value"
}

version_is_newer() {
  local latest="$1"
  local current="$2"
  local latest_major latest_minor latest_patch
  local current_major current_minor current_patch
  IFS=. read -r latest_major latest_minor latest_patch <<< "$latest"
  IFS=. read -r current_major current_minor current_patch <<< "$current"
  if [ "$latest_major" -ne "$current_major" ]; then
    [ "$latest_major" -gt "$current_major" ]
  elif [ "$latest_minor" -ne "$current_minor" ]; then
    [ "$latest_minor" -gt "$current_minor" ]
  else
    [ "$latest_patch" -gt "$current_patch" ]
  fi
}

plist_value() {
  local key="$1"
  local type="$2"
  local value
  value="$(/usr/bin/plutil -extract "$key" raw -expect "$type" -o - "$RESPONSE" 2>/dev/null)" \
    || fail "GitHub response has an invalid or missing $key field."
  printf '%s\n' "$value"
}

require_sha256_digest() {
  printf '%s' "$1" | /usr/bin/grep -Eq '^sha256:[0-9a-f]{64}$' \
    || fail "$2 does not have a valid GitHub SHA-256 digest."
}

require_regular_file() {
  [ -f "$1" ] && [ ! -L "$1" ] || fail "$2 is not a regular file."
}

decimal_between_one_and_limit() {
  local value="$1"
  local limit="$2"
  case "$value" in ''|*[!0-9]*|0) return 1 ;; esac
  if [ "${#value}" -lt "${#limit}" ]; then
    return 0
  fi
  [ "${#value}" -eq "${#limit}" ] || return 1
  [[ "$value" < "$limit" || "$value" = "$limit" ]]
}

ensure_private_directory() {
  local path="$1"
  if [ -e "$path" ]; then
    [ -d "$path" ] && [ ! -L "$path" ] || fail "Update cache path is not a regular directory: $path"
  else
    /bin/mkdir "$path" || fail "Could not create the update cache directory: $path"
  fi
  /bin/chmod 700 "$path"
}

file_size() {
  /usr/bin/stat -f '%z' "$1"
}

file_sha256() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

download_asset() {
  local url="$1"
  local destination="$2"
  local expected_size="$3"
  local label="$4"
  local effective_url

  if [ "${CODEX_DREAM_SKIN_TEST_MODE:-0}" = "1" ]; then
    [ -d "$ROOT/tests/fixtures" ] \
      || fail "Update test mode is unavailable outside the source test tree."
    local source=""
    case "$label" in
      checksum) source="${CODEX_DREAM_SKIN_TEST_CHECKSUM_FILE:-}" ;;
      DMG) source="${CODEX_DREAM_SKIN_TEST_DMG_FILE:-}" ;;
      *) fail "Unknown test asset label: $label" ;;
    esac
    [ -n "$source" ] || fail "Update test asset is missing for $label."
    require_regular_file "$source" "Update test asset for $label"
    /bin/cp "$source" "$destination"
    return
  fi

  effective_url="$(/usr/bin/curl \
    --proto '=https' --proto-redir '=https' --tlsv1.2 \
    --fail --silent --show-error --location --max-redirs 5 \
    --connect-timeout 10 --max-time 600 --max-filesize "$expected_size" \
    --header 'Accept: application/octet-stream' \
    --user-agent 'CodexDreamSkin-GuidedUpdate' \
    --output "$destination" --write-out '%{url_effective}' "$url")" \
    || fail "Could not download the $label asset from GitHub."
  case "$effective_url" in
    "$url"|https://release-assets.githubusercontent.com/github-production-release-asset/*) ;;
    *) fail "GitHub redirected the $label asset to an unapproved origin." ;;
  esac
}

json_escape() {
  if printf '%s' "$1" | /usr/bin/grep -q '[[:cntrl:]]'; then
    fail "A local path contains unsupported control characters."
  fi
  printf '%s' "$1" | /usr/bin/sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

[ -f "$VERSION_PATH" ] || fail "Installed VERSION file is missing: $VERSION_PATH"
CURRENT_RAW="$(/usr/bin/tr -d '[:space:]' < "$VERSION_PATH")"
CURRENT_VERSION="$(normalize_version "$CURRENT_RAW")" \
  || fail "Installed version is invalid: $CURRENT_RAW"

REQUESTED_VERSION=""
if [ -n "$DOWNLOAD_VERSION" ]; then
  REQUESTED_VERSION="$(normalize_version "$DOWNLOAD_VERSION")" \
    || fail "Requested update version is invalid: $DOWNLOAD_VERSION"
  [ "$DOWNLOAD_VERSION" = "$REQUESTED_VERSION" ] || [ "$DOWNLOAD_VERSION" = "v$REQUESTED_VERSION" ] \
    || fail "Requested update version must be an exact semantic version."
fi

TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-update.XXXXXX)"
MOUNT_POINT=""
cleanup() {
  if [ -n "$MOUNT_POINT" ]; then
    /usr/bin/hdiutil detach "$MOUNT_POINT" -quiet >/dev/null 2>&1 \
      || /usr/bin/hdiutil detach "$MOUNT_POINT" -force -quiet >/dev/null 2>&1 \
      || true
  fi
  /bin/rm -rf "$TMP"
}
trap cleanup EXIT
RESPONSE="$TMP/release.json"
if [ -n "${CODEX_DREAM_SKIN_TEST_RESPONSE_FILE:-}" ]; then
  if [ -n "$REQUESTED_VERSION" ] && [ "${CODEX_DREAM_SKIN_TEST_MODE:-0}" != "1" ]; then
    fail "A local release response cannot drive a production update download."
  fi
  require_regular_file "$CODEX_DREAM_SKIN_TEST_RESPONSE_FILE" "Test response"
  /bin/cp "$CODEX_DREAM_SKIN_TEST_RESPONSE_FILE" "$RESPONSE"
else
  if [ -n "$REQUESTED_VERSION" ]; then
    API_URL="$API_ORIGIN/tags/v$REQUESTED_VERSION"
  else
    API_URL="$API_ORIGIN/latest"
  fi
  /usr/bin/curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
    --connect-timeout 5 --max-time 12 --max-filesize "$MAX_RESPONSE_BYTES" \
    --header 'Accept: application/vnd.github+json' \
    --header 'X-GitHub-Api-Version: 2022-11-28' \
    --user-agent 'CodexDreamSkin-UpdateCheck' \
    "$API_URL" --output "$RESPONSE" \
    || fail "Could not connect to GitHub."
fi

require_regular_file "$RESPONSE" "GitHub response"
RESPONSE_BYTES="$(file_size "$RESPONSE")"
[ "$RESPONSE_BYTES" -gt 0 ] && [ "$RESPONSE_BYTES" -le "$MAX_RESPONSE_BYTES" ] \
  || fail "GitHub returned an invalid response size."

LATEST_TAG="$(plist_value tag_name string)"
LATEST_VERSION="$(normalize_version "$LATEST_TAG")" \
  || fail "GitHub returned an unsupported release tag: $LATEST_TAG"
[ "$LATEST_TAG" = "v$LATEST_VERSION" ] \
  || fail "GitHub release tag is not canonical: $LATEST_TAG"
if [ -n "$REQUESTED_VERSION" ]; then
  [ "$LATEST_VERSION" = "$REQUESTED_VERSION" ] \
    || fail "GitHub returned a different release than requested."
fi
[ "$(plist_value draft bool)" = "false" ] || fail "GitHub release is still a draft."
[ "$(plist_value prerelease bool)" = "false" ] || fail "GitHub release is a prerelease."
TAG_RELEASE_URL="$RELEASES_ORIGIN/tag/v$LATEST_VERSION"
[ "$(plist_value html_url string)" = "$TAG_RELEASE_URL" ] \
  || fail "GitHub release page URL does not match the exact tag."

DMG_NAME="CodexDreamSkin-v$LATEST_VERSION.dmg"
CHECKSUM_NAME="SHA256SUMS.txt"
DMG_URL="$RELEASES_ORIGIN/download/v$LATEST_VERSION/$DMG_NAME"
CHECKSUM_URL="$RELEASES_ORIGIN/download/v$LATEST_VERSION/$CHECKSUM_NAME"
ASSET_COUNT="$(plist_value assets array)"
case "$ASSET_COUNT" in ''|*[!0-9]*) fail "GitHub release asset count is invalid." ;; esac
[ "${#ASSET_COUNT}" -le 2 ] && [ "$ASSET_COUNT" -ge 2 ] && [ "$ASSET_COUNT" -le 16 ] \
  || fail "GitHub release contains an unsupported number of assets."

DMG_MATCHES=0
CHECKSUM_MATCHES=0
DMG_SIZE=0
CHECKSUM_SIZE=0
DMG_API_DIGEST=""
CHECKSUM_API_DIGEST=""
i=0
while [ "$i" -lt "$ASSET_COUNT" ]; do
  name="$(plist_value "assets.$i.name" string)"
  api_url="$(plist_value "assets.$i.url" string)"
  browser_url="$(plist_value "assets.$i.browser_download_url" string)"
  size="$(plist_value "assets.$i.size" integer)"
  digest="$(plist_value "assets.$i.digest" string)"
  printf '%s' "$api_url" | /usr/bin/grep -Eq \
    '^https://api\.github\.com/repos/Fei-Away/Codex-Dream-Skin/releases/assets/[1-9][0-9]*$' \
    || fail "GitHub asset API URL is outside the expected repository."
  case "$size" in ''|*[!0-9]*) fail "GitHub asset size is invalid." ;; esac
  require_sha256_digest "$digest" "GitHub asset $name"
  if [ "$name" = "$DMG_NAME" ]; then
    DMG_MATCHES=$((DMG_MATCHES + 1))
    [ "$browser_url" = "$DMG_URL" ] || fail "DMG download URL does not match the exact tag."
    decimal_between_one_and_limit "$size" "$MAX_DMG_BYTES" \
      || fail "DMG asset size is outside the approved limit."
    DMG_SIZE="$size"
    DMG_API_DIGEST="${digest#sha256:}"
  elif [ "$name" = "$CHECKSUM_NAME" ]; then
    CHECKSUM_MATCHES=$((CHECKSUM_MATCHES + 1))
    [ "$browser_url" = "$CHECKSUM_URL" ] \
      || fail "Checksum download URL does not match the exact tag."
    decimal_between_one_and_limit "$size" "$MAX_CHECKSUM_BYTES" \
      || fail "Checksum asset size is outside the approved limit."
    CHECKSUM_SIZE="$size"
    CHECKSUM_API_DIGEST="${digest#sha256:}"
  fi
  i=$((i + 1))
done
[ "$DMG_MATCHES" -eq 1 ] || fail "GitHub release must contain exactly one $DMG_NAME asset."
[ "$CHECKSUM_MATCHES" -eq 1 ] \
  || fail "GitHub release must contain exactly one $CHECKSUM_NAME asset."

UPDATE_AVAILABLE="false"
if version_is_newer "$LATEST_VERSION" "$CURRENT_VERSION"; then
  UPDATE_AVAILABLE="true"
fi

if [ -n "$REQUESTED_VERSION" ]; then
  [ "$UPDATE_AVAILABLE" = "true" ] \
    || fail "Refusing to download an update that is not newer than the installed version."
  CHECKSUM_FILE="$TMP/$CHECKSUM_NAME"
  DMG_FILE="$TMP/$DMG_NAME"
  download_asset "$CHECKSUM_URL" "$CHECKSUM_FILE" "$CHECKSUM_SIZE" checksum
  download_asset "$DMG_URL" "$DMG_FILE" "$DMG_SIZE" DMG
  require_regular_file "$CHECKSUM_FILE" "Downloaded checksum"
  require_regular_file "$DMG_FILE" "Downloaded DMG"
  [ "$(file_size "$CHECKSUM_FILE")" -eq "$CHECKSUM_SIZE" ] \
    || fail "Downloaded checksum size does not match GitHub metadata."
  [ "$(file_size "$DMG_FILE")" -eq "$DMG_SIZE" ] \
    || fail "Downloaded DMG size does not match GitHub metadata."
  [ "$(file_sha256 "$CHECKSUM_FILE")" = "$CHECKSUM_API_DIGEST" ] \
    || fail "Downloaded checksum does not match the GitHub API digest."
  DMG_ACTUAL_DIGEST="$(file_sha256 "$DMG_FILE")"
  [ "$DMG_ACTUAL_DIGEST" = "$DMG_API_DIGEST" ] \
    || fail "Downloaded DMG does not match the GitHub API digest."
  MANIFEST_DIGEST="$(/usr/bin/awk -v expected="$DMG_NAME" '
    NF == 2 && length($1) == 64 && $1 ~ /^[0-9A-Fa-f]+$/ && $2 == expected {
      count += 1
      digest = tolower($1)
    }
    END {
      if (count != 1) exit 1
      print digest
    }
  ' "$CHECKSUM_FILE")" || fail "Checksum manifest must contain exactly one canonical DMG entry."
  [ "$DMG_ACTUAL_DIGEST" = "$MANIFEST_DIGEST" ] \
    || fail "Downloaded DMG does not match SHA256SUMS.txt."
  /usr/bin/hdiutil verify "$DMG_FILE" >/dev/null 2>&1 \
    || fail "Downloaded DMG failed hdiutil integrity verification."

  MOUNT_POINT="$TMP/mount"
  /bin/mkdir "$MOUNT_POINT"
  /usr/bin/hdiutil attach -readonly -nobrowse -noautoopen \
    -mountpoint "$MOUNT_POINT" "$DMG_FILE" >/dev/null 2>&1 \
    || fail "Downloaded DMG could not be mounted read-only."
  APP_LIST="$TMP/root-apps.txt"
  /usr/bin/find "$MOUNT_POINT" -mindepth 1 -maxdepth 1 -type d -name '*.app' -print > "$APP_LIST"
  APP_COUNT="$(/usr/bin/wc -l < "$APP_LIST" | /usr/bin/tr -d '[:space:]')"
  [ "$APP_COUNT" = "1" ] || fail "Downloaded DMG must contain exactly one root-level app bundle."
  MOUNTED_APP="$(/usr/bin/sed -n '1p' "$APP_LIST")"
  [ -d "$MOUNTED_APP" ] && [ ! -L "$MOUNTED_APP" ] \
    || fail "Downloaded DMG contains an invalid app bundle entry."
  for required_directory in \
    "$MOUNTED_APP/Contents" \
    "$MOUNTED_APP/Contents/Resources" \
    "$MOUNTED_APP/Contents/Resources/engine"; do
    [ -d "$required_directory" ] && [ ! -L "$required_directory" ] \
      || fail "Downloaded app contains a redirected required directory."
  done
  INFO_PLIST="$MOUNTED_APP/Contents/Info.plist"
  ENGINE_VERSION="$MOUNTED_APP/Contents/Resources/engine/VERSION"
  require_regular_file "$INFO_PLIST" "Downloaded app Info.plist"
  require_regular_file "$ENGINE_VERSION" "Downloaded embedded engine VERSION"
  [ "$(/usr/bin/plutil -extract CFBundleIdentifier raw -expect string -o - "$INFO_PLIST" 2>/dev/null)" \
      = "cc.dreamskin.menubar" ] \
    || fail "Downloaded app bundle identifier is invalid."
  [ "$(/usr/bin/plutil -extract CFBundleShortVersionString raw -expect string -o - "$INFO_PLIST" 2>/dev/null)" \
      = "$LATEST_VERSION" ] \
    || fail "Downloaded app version does not match the requested release."
  [ "$(/bin/cat "$ENGINE_VERSION")" = "$LATEST_VERSION" ] \
    || fail "Downloaded embedded engine version does not match the requested release."
  /usr/bin/codesign --verify --deep --strict "$MOUNTED_APP" >/dev/null 2>&1 \
    || fail "Downloaded app failed code-signature integrity verification."
  /usr/bin/hdiutil detach "$MOUNT_POINT" -quiet >/dev/null 2>&1 \
    || fail "Downloaded DMG could not be detached after verification."
  MOUNT_POINT=""

  if [ "${CODEX_DREAM_SKIN_TEST_MODE:-0}" = "1" ]; then
    CACHE_ROOT="${CODEX_DREAM_SKIN_TEST_CACHE_ROOT:-$TMP/cache}"
    if [ -e "$CACHE_ROOT" ]; then
      [ -d "$CACHE_ROOT" ] && [ ! -L "$CACHE_ROOT" ] \
        || fail "Update test cache root is invalid."
    else
      /bin/mkdir -p "$CACHE_ROOT"
    fi
    /bin/chmod 700 "$CACHE_ROOT"
  else
    [ -d "$HOME" ] && [ ! -L "$HOME" ] \
      || fail "User home directory is unavailable or redirected."
    [ -d "$HOME/Library" ] && [ ! -L "$HOME/Library" ] \
      || fail "User Library directory is unavailable or redirected."
    [ -d "$HOME/Library/Caches" ] && [ ! -L "$HOME/Library/Caches" ] \
      || fail "User Caches directory is unavailable or redirected."
    CACHE_BASE="$HOME/Library/Caches/CodexDreamSkin"
    ensure_private_directory "$CACHE_BASE"
    CACHE_ROOT="$CACHE_BASE/Updates"
    ensure_private_directory "$CACHE_ROOT"
  fi
  FINAL_DMG="$CACHE_ROOT/$DMG_NAME"
  if [ -e "$FINAL_DMG" ]; then
    [ -f "$FINAL_DMG" ] && [ ! -L "$FINAL_DMG" ] \
      || fail "Refusing to replace a non-regular update cache file."
  fi
  /bin/chmod 600 "$DMG_FILE"
  /bin/mv -f "$DMG_FILE" "$FINAL_DMG"
  require_regular_file "$FINAL_DMG" "Verified cached DMG"
  [ "$(file_sha256 "$FINAL_DMG")" = "$DMG_ACTUAL_DIGEST" ] \
    || fail "Verified DMG changed while moving into the update cache."

  ESCAPED_PATH="$(json_escape "$FINAL_DMG")"
  printf '{"currentVersion":"v%s","latestVersion":"v%s","updateAvailable":true,"releaseUrl":"%s","downloadPath":"%s","downloadSha256":"%s"}\n' \
    "$CURRENT_VERSION" "$LATEST_VERSION" "$TAG_RELEASE_URL" "$ESCAPED_PATH" "$DMG_ACTUAL_DIGEST"
  exit 0
fi

if [ "$JSON" = "true" ]; then
  printf '{"currentVersion":"v%s","latestVersion":"v%s","updateAvailable":%s,"releaseUrl":"%s"}\n' \
    "$CURRENT_VERSION" "$LATEST_VERSION" "$UPDATE_AVAILABLE" "$TAG_RELEASE_URL"
fi

if [ "$INTERACTIVE" = "true" ]; then
  if [ "$UPDATE_AVAILABLE" = "true" ]; then
    if [ "$(dreamskin_language)" = "zh" ]; then
      UPDATE_MESSAGE="发现新版本 v${LATEST_VERSION}

当前版本为 v${CURRENT_VERSION}。"
      DOWNLOAD_LABEL="前往下载"
      LATER_LABEL="稍后"
    else
      UPDATE_MESSAGE="New version v${LATEST_VERSION} is available.

You are running v${CURRENT_VERSION}."
      DOWNLOAD_LABEL="Download"
      LATER_LABEL="Later"
    fi
    if /usr/bin/osascript - "$UPDATE_MESSAGE" "$LATER_LABEL" "$DOWNLOAD_LABEL" <<'APPLESCRIPT' >/dev/null
on run argv
  set promptText to item 1 of argv
  set laterLabel to item 2 of argv
  set downloadLabel to item 3 of argv
  display dialog promptText buttons {laterLabel, downloadLabel} default button downloadLabel cancel button laterLabel with title "Codex Dream Skin"
end run
APPLESCRIPT
    then
      /usr/bin/open "$TAG_RELEASE_URL"
    fi
  else
    if [ "$(dreamskin_language)" = "zh" ]; then
      CURRENT_MESSAGE="当前已是最新版本 v${CURRENT_VERSION}"
    else
      CURRENT_MESSAGE="Codex Dream Skin v${CURRENT_VERSION} is up to date."
    fi
    /usr/bin/osascript - "$CURRENT_MESSAGE" "$(dreamskin_text ok 2>/dev/null || /usr/bin/printf OK)" <<'APPLESCRIPT' >/dev/null
on run argv
  display alert "Codex Dream Skin" message (item 1 of argv) buttons {(item 2 of argv)}
end run
APPLESCRIPT
  fi
fi

if [ "$JSON" != "true" ] && [ "$INTERACTIVE" != "true" ]; then
  printf 'v%s -> v%s; update=%s\n' "$CURRENT_VERSION" "$LATEST_VERSION" "$UPDATE_AVAILABLE"
fi
