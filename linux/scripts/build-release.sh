#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
RELEASE_DIR="$ROOT/release"
DEB="$RELEASE_DIR/CodexDreamSkin-v${VERSION}-linux.deb"
SKIP_TESTS="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-tests) SKIP_TESTS="true"; shift ;;
    *) printf 'Unknown DMG build argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

if [ "$SKIP_TESTS" != "true" ]; then
  # Run shell syntax checks
  while IFS= read -r file; do
    bash -n "$file"
  done < <(find "$ROOT" -type f -name '*.sh' -print)
  # Run Node syntax checks
  while IFS= read -r file; do
    /usr/lib/chatgpt/resources/cua_node/bin/node --check "$file" >/dev/null
  done < <(find "$ROOT" -type f \( -name '*.mjs' -o -name '*.js' \) -print)
fi

# Build the .deb package
cd "$ROOT"
fakeroot debian/rules binary 2>&1 || {
  printf 'Debian build failed. Check dpkg-buildpackage output above.\n' >&2
  exit 1
}

# Verify artifact
test -s "$DEB" || { printf 'Debian package was not created: %s\n' "$DEB" >&2; exit 1; }
dpkg-deb --info "$DEB" | head -20
printf '\nBuilt: %s\n' "$DEB"
