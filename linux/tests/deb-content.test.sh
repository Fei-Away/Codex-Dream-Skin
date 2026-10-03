#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
DEB="${1:-}"

# With no argument, build the deb from the tree under test so the suite stays
# self-contained (dpkg-deb over ~40 files); with an argument, assert against
# that prebuilt deb instead (CI can pass its own artifact).
if [ -z "$DEB" ]; then
  command -v dpkg-deb >/dev/null 2>&1 && command -v rsync >/dev/null 2>&1 \
    || { printf 'skip: dpkg-deb/rsync not available; deb content assertions skipped\n' >&2; exit 0; }
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
  'usr/share/applications/codex-dream-skin.desktop' \
  'usr/share/applications/codex-dream-skin-url.desktop'; do
  case "$CONTENTS" in
    *"./$required"*) ;;
    *) printf 'missing from deb: %s\n' "$required" >&2; exit 1 ;;
  esac
done

APP_DESKTOP="$(dpkg-deb --fsys-tarfile "$DEB" | tar -xO ./usr/share/applications/codex-dream-skin.desktop)"
case "$APP_DESKTOP" in
  *$'Exec=dreamskin\n'*) ;;
  *) printf 'app desktop entry must launch the interactive dreamskin menu\n' >&2; exit 1 ;;
esac
case "$APP_DESKTOP" in
  *$'Terminal=true\n'*) ;;
  *) printf 'app desktop entry must open a terminal for the menu\n' >&2; exit 1 ;;
esac
case "$APP_DESKTOP" in
  *'MimeType=x-scheme-handler/dreamskin;'*)
    printf 'app desktop entry must not own the Dream Skin URL scheme\n' >&2
    exit 1
    ;;
esac
URL_DESKTOP="$(dpkg-deb --fsys-tarfile "$DEB" | tar -xO ./usr/share/applications/codex-dream-skin-url.desktop)"
for required_line in \
  'Exec=dreamskin community %u' \
  'Terminal=false' \
  'NoDisplay=true' \
  'MimeType=x-scheme-handler/dreamskin;'; do
  printf '%s\n' "$URL_DESKTOP" | grep -Fqx "$required_line" \
    || { printf 'URL desktop entry is missing: %s\n' "$required_line" >&2; exit 1; }
done

# Type check: usr/bin/dreamskin must be a symlink to the real launcher. The
# symlink's -> target contains the dreamskin.sh path, so an ln -> cp
# regression would still satisfy the path checks above.
case "$CONTENTS" in
  *"lrwxrwxrwx root/root"*"./usr/bin/dreamskin -> /opt/codex-dream-skin/scripts/dreamskin.sh"*) ;;
  *) printf 'usr/bin/dreamskin is not a symlink to scripts/dreamskin.sh\n' >&2; exit 1 ;;
esac

# Public release parity: the deb ships exactly one bundled preset (gothic),
# and the separately recorded Arina preset must never enter the package.
case "$CONTENTS" in
  *"./opt/codex-dream-skin/presets/preset-gothic-void-crusade/theme.json"*) ;;
  *) printf 'bundled gothic preset missing from deb\n' >&2; exit 1 ;;
esac
case "$CONTENTS" in
  *"preset-arina-hashimoto"*) printf 'Restricted Arina preset entered the deb package.\n' >&2; exit 1 ;;
esac

INFO="$(dpkg-deb -f "$DEB" Package Depends Architecture)"
RECOMMENDS="$(dpkg-deb -f "$DEB" Recommends)"
case "$INFO" in
  *"codex-dream-skin"*) ;;
  *) printf 'bad package name\n' >&2; exit 1 ;;
esac
case "$INFO" in
  *"nodejs (>= 22.0)"*) ;;
  *) printf 'nodejs >= 22.0 dependency missing\n' >&2; exit 1 ;;
esac
case "$INFO" in
  *"file"*) ;;
  *) printf 'file runtime dependency missing\n' >&2; exit 1 ;;
esac
case "$INFO" in
  *"procps"*) ;;
  *) printf 'procps runtime dependency missing\n' >&2; exit 1 ;;
esac
case "$RECOMMENDS" in
  *"ffmpeg"*"zenity"*) ;;
  *) printf 'ffmpeg and zenity recommended dependencies missing\n' >&2; exit 1 ;;
esac
printf 'deb content tests passed\n'
