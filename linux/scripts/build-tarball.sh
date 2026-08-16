#!/bin/bash

# Portable tarball: CodexDreamSkin-v<version>-linux-amd64.tar.gz
# Contains the engine tree plus install.sh, usable without root.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
case "$VERSION" in
  ''|*[!0-9.]*) printf 'Invalid version: %s\n' "$VERSION" >&2; exit 1 ;;
esac

STAGE="$(/bin/mktemp -d /tmp/dreamskin-tar.XXXXXX)"
trap '/bin/rm -rf "$STAGE"' EXIT
/usr/bin/mkdir -p "$STAGE/codex-dream-skin"
/usr/bin/rsync -a --exclude 'installer/' --exclude 'tests/' --exclude 'release/' \
  --exclude '.gitattributes' \
  --exclude 'scripts/build-deb.sh' --exclude 'scripts/build-tarball.sh' \
  --exclude 'scripts/build-release-linux.sh' \
  "$ROOT/" "$STAGE/codex-dream-skin/"

/usr/bin/printf '%s\n' \
  '#!/bin/bash' \
  'set -euo pipefail' \
  'SRC="$(cd "$(dirname "$0")" && pwd -P)"' \
  "exec \"\$SRC/scripts/install-dream-skin-linux.sh\" --no-launch \"\$@\"" \
  > "$STAGE/codex-dream-skin/install.sh"
/bin/chmod 755 "$STAGE/codex-dream-skin/install.sh"

OUT_DIR="$ROOT/release"
/usr/bin/mkdir -p "$OUT_DIR"
/usr/bin/tar -C "$STAGE" -czf \
  "$OUT_DIR/CodexDreamSkin-v${VERSION}-linux-amd64.tar.gz" codex-dream-skin
printf 'built %s\n' "$OUT_DIR/CodexDreamSkin-v${VERSION}-linux-amd64.tar.gz"
