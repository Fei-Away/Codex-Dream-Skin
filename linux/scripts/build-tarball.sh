#!/bin/bash

# Portable tarball: CodexDreamSkin-v<version>-linux-amd64.tar.gz
# Contains the engine tree plus install.sh, usable without root.

set -euo pipefail
# Deterministic archive modes: new files below inherit 022; the staged tree
# is normalized again before tar because rsync -a preserves source modes.
umask 022
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
case "$VERSION" in
  ''|*[!0-9.]*) printf 'Invalid version: %s\n' "$VERSION" >&2; exit 1 ;;
esac

STAGE="$(/bin/mktemp -d /tmp/dreamskin-tar.XXXXXX)"
trap '/bin/rm -rf "$STAGE"' EXIT
/usr/bin/mkdir -p "$STAGE/codex-dream-skin"
/bin/chmod 755 "$STAGE/codex-dream-skin"
# Public release parity with the macOS packages: the Arina preset is a
# separately recorded distribution exception and never enters the tarball.
/usr/bin/rsync -a --exclude 'installer/' --exclude 'tests/' --exclude 'release/' \
  --exclude 'presets/preset-arina-hashimoto/' \
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

# rsync -a preserves source-tree modes, which vary with the build host;
# normalize so the archive never embeds group/world-writable entries.
# install.sh is written before this loop so the *.sh rule sets its mode.
/usr/bin/find "$STAGE/codex-dream-skin" -type d -exec /bin/chmod 755 {} +
/usr/bin/find "$STAGE/codex-dream-skin" -type f -exec /bin/chmod 644 {} +
/usr/bin/find "$STAGE/codex-dream-skin" -type f -name '*.sh' -exec /bin/chmod 755 {} +

# Post-stage verification (mirrors the macOS release builds): fail the build
# if the restricted preset or any of its assets reached the staged tree.
[ ! -e "$STAGE/codex-dream-skin/presets/preset-arina-hashimoto" ] \
  || { printf 'Restricted Arina preset entered the Linux tarball.\n' >&2; exit 1; }
if /usr/bin/find "$STAGE" -type f -name 'arina-hashimoto-*' -print -quit | /usr/bin/grep -q .; then
  printf 'Restricted Arina asset entered the Linux tarball.\n' >&2
  exit 1
fi

OUT_DIR="$ROOT/release"
/usr/bin/mkdir -p "$OUT_DIR"
TARBALL="$OUT_DIR/CodexDreamSkin-v${VERSION}-linux-amd64.tar.gz"
/usr/bin/tar -C "$STAGE" -czf "$TARBALL" codex-dream-skin
# Cheap content assertions guard against exclude-pattern regressions: the
# wrapper and the version file are the tarball's entry points. grep runs
# without -q so it reads the whole listing: with -q it exits on the first
# match and pipefail then surfaces tar's SIGPIPE as a false failure.
ENTRIES="$(/usr/bin/tar -tzf "$TARBALL")"
/usr/bin/printf '%s\n' "$ENTRIES" | /usr/bin/grep -x 'codex-dream-skin/install.sh' >/dev/null \
  || { printf 'tarball is missing codex-dream-skin/install.sh\n' >&2; exit 1; }
/usr/bin/printf '%s\n' "$ENTRIES" | /usr/bin/grep -x 'codex-dream-skin/VERSION' >/dev/null \
  || { printf 'tarball is missing codex-dream-skin/VERSION\n' >&2; exit 1; }
printf 'built %s\n' "$TARBALL"
