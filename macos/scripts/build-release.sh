#!/bin/bash

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
RELEASE_DIR="$ROOT/release"
ARCHIVE="$RELEASE_DIR/codex-dream-skin-studio-v$VERSION.zip"
TMP="$(/usr/bin/mktemp -d /tmp/codex-dream-skin-release.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

if [ "${1:-}" != "--skip-tests" ]; then "$ROOT/tests/run-tests.sh"; fi

/bin/mkdir -p "$TMP/codex-dream-skin-studio" "$RELEASE_DIR"
/usr/bin/rsync -a \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'release/' \
  "$ROOT/" "$TMP/codex-dream-skin-studio/"

# Bundle the shared, offline package importer so the standalone macOS archive
# does not depend on a repository checkout after installation.
REPOSITORY_ROOT="$(cd "$ROOT/.." && pwd -P)"
if [ -f "$REPOSITORY_ROOT/tools/theme-package.mjs" ]; then
  /bin/mkdir -p "$TMP/codex-dream-skin-studio/lib" \
    "$TMP/codex-dream-skin-studio/tools" "$TMP/codex-dream-skin-studio/schemas" \
    "$TMP/codex-dream-skin-studio/docs" "$TMP/codex-dream-skin-studio/examples"
  /usr/bin/rsync -a "$REPOSITORY_ROOT/lib/theme-package" "$TMP/codex-dream-skin-studio/lib/"
  /bin/cp "$REPOSITORY_ROOT/tools/theme-package.mjs" "$TMP/codex-dream-skin-studio/tools/"
  /usr/bin/rsync -a "$REPOSITORY_ROOT/schemas/" "$TMP/codex-dream-skin-studio/schemas/"
  /usr/bin/rsync -a "$REPOSITORY_ROOT/examples/theme-package" "$TMP/codex-dream-skin-studio/examples/"
  /bin/cp "$REPOSITORY_ROOT/docs/THEME_PACKAGE.md" \
    "$REPOSITORY_ROOT/docs/KIMI_THEME_AUTHORING_PROMPT.md" \
    "$TMP/codex-dream-skin-studio/docs/"
fi

# The macOS tree is also published as a standalone ZIP. Bundle prompt guides
# and their referenced images, then translate repository paths for this root.
"$ROOT/scripts/prepare-standalone-docs.sh" "$TMP/codex-dream-skin-studio"
rewrite_standalone_links() {
  local file="$1"
  local temporary="${file}.standalone"
  /usr/bin/sed \
    -e 's#\.\./docs/#docs/#g' \
    -e 's#\.\./windows/#https://github.com/Fei-Away/Codex-Dream-Skin/tree/main/windows/#g' \
    "$file" > "$temporary"
  /bin/mv "$temporary" "$file"
}
rewrite_standalone_links "$TMP/codex-dream-skin-studio/README.md"
PRESET_README="$TMP/codex-dream-skin-studio/presets/README.md"
if [ -f "$PRESET_README" ]; then
  temporary="${PRESET_README}.standalone"
  /usr/bin/sed -e 's#\.\./\.\./docs/#../docs/#g' "$PRESET_README" > "$temporary"
  /bin/mv "$temporary" "$PRESET_README"
fi
/usr/bin/find "$TMP/codex-dream-skin-studio" -type f \( -name '.DS_Store' -o -name '._*' \) -delete
/bin/chmod 755 "$TMP/codex-dream-skin-studio"/*.command
/bin/chmod 755 "$TMP/codex-dream-skin-studio"/scripts/*.sh "$TMP/codex-dream-skin-studio"/tests/*.sh
/bin/rm -f "$ARCHIVE"
COPYFILE_DISABLE=1 /usr/bin/ditto -c -k --keepParent --norsrc --noextattr \
  "$TMP/codex-dream-skin-studio" "$ARCHIVE"
SHA256="$(/usr/bin/shasum -a 256 "$ARCHIVE" | /usr/bin/awk '{print $1}')"
/usr/bin/printf '%s  %s\n' "$SHA256" "$(basename "$ARCHIVE")" > "$RELEASE_DIR/SHA256SUMS.txt"
/usr/bin/printf 'Created %s\nSHA-256 %s\n' "$ARCHIVE" "$SHA256"
