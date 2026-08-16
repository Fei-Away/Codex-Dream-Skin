#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
DEB="${1:-}"

# With no argument, build the deb from the tree under test so the suite stays
# self-contained (dpkg-deb over ~40 files); with an argument, assert against
# that prebuilt deb instead (CI can pass its own artifact).
if [ -z "$DEB" ]; then
  /bin/bash "$ROOT/scripts/build-deb.sh"
  VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
  DEB="$ROOT/release/codex-dream-skin_${VERSION}_amd64.deb"
fi
[ -f "$DEB" ] || { printf 'deb not found: %s\n' "$DEB" >&2; exit 1; }

CONTENTS="$(dpkg-deb -c "$DEB")"
for required in \
  'opt/codex-dream-skin/scripts/dreamskin.sh' \
  'opt/codex-dream-skin/scripts/injector.mjs' \
  'opt/codex-dream-skin/scripts/common-linux.sh' \
  'opt/codex-dream-skin/scripts/linux-launch.sh' \
  'opt/codex-dream-skin/assets/renderer-inject.js' \
  'opt/codex-dream-skin/assets/theme-package-validator.mjs' \
  'opt/codex-dream-skin/assets/safe-css-validator.mjs' \
  'opt/codex-dream-skin/assets/safe-css-policy.json' \
  'usr/bin/dreamskin' \
  'usr/share/applications/codex-dream-skin.desktop'; do
  case "$CONTENTS" in
    *"$required"*) ;;
    *) printf 'missing from deb: %s\n' "$required" >&2; exit 1 ;;
  esac
done

INFO="$(dpkg-deb -f "$DEB" Package Depends Architecture)"
case "$INFO" in
  *"codex-dream-skin"*) ;;
  *) printf 'bad package name\n' >&2; exit 1 ;;
esac
case "$INFO" in
  *"nodejs"*) ;;
  *) printf 'nodejs dependency missing\n' >&2; exit 1 ;;
esac
printf 'deb content tests passed\n'
