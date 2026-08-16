#!/bin/bash

# Build codex-dream-skin_<version>_amd64.deb with dpkg-deb (no extra tooling).
# Usage: build-deb.sh [--version X.Y.Z]  (defaults to linux/VERSION)

set -euo pipefail
# Deterministic package modes: dpkg-deb requires the DEBIAN dir to be 0755,
# and directory modes otherwise inherit the caller's umask.
umask 022
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) [ "$#" -ge 2 ] || { printf '--version requires a value\n' >&2; exit 2; }; VERSION="$2"; shift 2 ;;
    *) printf 'Unknown build-deb argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done
case "$VERSION" in
  ''|*[!0-9.]*) printf 'Invalid version: %s\n' "$VERSION" >&2; exit 1 ;;
esac

STAGE="$(/bin/mktemp -d /tmp/dreamskin-deb.XXXXXX)"
trap '/bin/rm -rf "$STAGE"' EXIT
/bin/chmod 755 "$STAGE"

/usr/bin/mkdir -p "$STAGE/opt/codex-dream-skin" "$STAGE/usr/bin" \
  "$STAGE/usr/share/applications" "$STAGE/DEBIAN"
# Stage the engine (scripts + assets + presets; exclude packaging-only dirs).
/usr/bin/rsync -a --exclude 'installer/' --exclude 'tests/' --exclude 'release/' \
  --exclude '.gitattributes' --exclude 'scripts/build-*.sh' \
  "$ROOT/" "$STAGE/opt/codex-dream-skin/"
/usr/bin/ln -s /opt/codex-dream-skin/scripts/dreamskin.sh "$STAGE/usr/bin/dreamskin"

/usr/bin/sed "s/^Version: .*/Version: $VERSION/" "$ROOT/installer/control" \
  > "$STAGE/DEBIAN/control"
/usr/bin/cp "$ROOT/installer/postinst" "$ROOT/installer/prerm" "$ROOT/installer/postrm" \
  "$STAGE/DEBIAN/"
/bin/chmod 755 "$STAGE/DEBIAN/postinst" "$STAGE/DEBIAN/prerm" "$STAGE/DEBIAN/postrm"
/usr/bin/cp "$ROOT/installer/codex-dream-skin.desktop" "$STAGE/usr/share/applications/"

/usr/bin/find "$STAGE/opt" -type f -exec /bin/chmod 644 {} \;
/usr/bin/find "$STAGE/opt" -type f -name '*.sh' -exec /bin/chmod 755 {} \;
# rsync -a preserves source-tree directory modes, which vary with the build
# host; normalize so the package never embeds group/world-writable dirs.
/usr/bin/find "$STAGE/opt" -type d -exec /bin/chmod 755 {} \;

OUT_DIR="$ROOT/release"
/usr/bin/mkdir -p "$OUT_DIR"
/usr/bin/dpkg-deb --root-owner-group --build "$STAGE" \
  "$OUT_DIR/codex-dream-skin_${VERSION}_amd64.deb"
printf 'built %s\n' "$OUT_DIR/codex-dream-skin_${VERSION}_amd64.deb"
