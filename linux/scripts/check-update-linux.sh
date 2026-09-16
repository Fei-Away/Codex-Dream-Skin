#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

CHECK_ONLY="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --check-only) CHECK_ONLY="true"; shift ;;
    *) printf 'Unknown check-update argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

discover_codex_app 2>/dev/null || true
ensure_node_runtime

# Fetch latest version from GitHub API
LATEST_VERSION=""
if command -v curl >/dev/null 2>&1; then
  LATEST_VERSION="$(curl --noproxy '*' -sSL --max-time 10 \
    "https://api.github.com/repos/Fei-Away/Codex-Dream-Skin/releases/latest" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('tag_name','')[1:])" 2>/dev/null || true)"
fi

[ -n "$LATEST_VERSION" ] || {
  printf 'Could not check for updates (network unavailable).\n'
  exit 1
}

CURRENT_VERSION="$(tr -d '[:space:]' < "$PROJECT_ROOT/VERSION" 2>/dev/null || echo "$SKIN_VERSION")"

if [ "$LATEST_VERSION" = "$CURRENT_VERSION" ]; then
  printf 'Codex Dream Skin is up to date (v%s).\n' "$CURRENT_VERSION"
  exit 0
fi

printf 'A new version of Codex Dream Skin is available: v%s (current: v%s)\n' \
  "$LATEST_VERSION" "$CURRENT_VERSION"
printf 'Download from: https://github.com/Fei-Away/Codex-Dream-Skin/releases\n'

if [ "$CHECK_ONLY" != "true" ]; then
  # Attempt to update via the install script
  if [ -d "$PROJECT_ROOT" ]; then
    printf 'Running in-place update check...\n'
    git -C "$PROJECT_ROOT" fetch origin main 2>/dev/null || true
    latest_commit="$(git -C "$PROJECT_ROOT" rev-parse origin/main 2>/dev/null || true)"
    current_commit="$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || true)"
    if [ "$latest_commit" = "$current_commit" ]; then
      printf 'Already up to date in source tree.\n'
    else
      printf 'New commit available in source tree; run git pull to update.\n'
    fi
  fi
fi
