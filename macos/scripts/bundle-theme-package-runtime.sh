#!/bin/bash

set -euo pipefail

[ "$#" -eq 2 ] || { printf 'Usage: bundle-theme-package-runtime.sh <repository-root> <destination>\n' >&2; exit 2; }
REPOSITORY_ROOT="$(cd "$1" && pwd -P)"
DESTINATION="$2"
[ -f "$REPOSITORY_ROOT/tools/theme-package.mjs" ] || {
  printf 'Theme package tool is missing from %s\n' "$REPOSITORY_ROOT" >&2
  exit 1
}
[ -d "$REPOSITORY_ROOT/lib/theme-package" ] || {
  printf 'Theme package library is missing from %s\n' "$REPOSITORY_ROOT" >&2
  exit 1
}

/bin/mkdir -p "$DESTINATION/lib" "$DESTINATION/tools" "$DESTINATION/schemas" \
  "$DESTINATION/docs" "$DESTINATION/examples"
/usr/bin/rsync -a "$REPOSITORY_ROOT/lib/theme-package" "$DESTINATION/lib/"
/bin/cp "$REPOSITORY_ROOT/tools/theme-package.mjs" "$DESTINATION/tools/"
/usr/bin/rsync -a "$REPOSITORY_ROOT/schemas/" "$DESTINATION/schemas/"
/usr/bin/rsync -a "$REPOSITORY_ROOT/examples/theme-package" "$DESTINATION/examples/"
/bin/cp "$REPOSITORY_ROOT/docs/THEME_PACKAGE.md" \
  "$REPOSITORY_ROOT/docs/KIMI_THEME_AUTHORING_PROMPT.md" "$DESTINATION/docs/"
