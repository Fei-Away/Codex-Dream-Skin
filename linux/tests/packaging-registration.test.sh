#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TMP="$(/usr/bin/mktemp -d /tmp/dreamskin-registration.XXXXXX)"
trap '/bin/rm -rf "$TMP"' EXIT

# Debian maintainer scripts run as root and must not write a desktop user's
# MIME defaults. Registration belongs in the user-invoked launcher instead.
if /usr/bin/grep -q 'xdg-mime default' "$ROOT/installer/postinst"; then
  printf 'postinst must not set root-owned MIME defaults\n' >&2
  exit 1
fi
if /usr/bin/grep -Eq 'ln -s[f ]+.*usr/bin/dreamskin' "$ROOT/installer/postinst"; then
  printf 'postinst must not recreate a symlink already owned by the package\n' >&2
  exit 1
fi
if /usr/bin/grep -q 'xdg-mime uninstall' "$ROOT/installer/prerm"; then
  printf 'prerm must not attempt the unsupported MIME uninstall operation\n' >&2
  exit 1
fi
if /usr/bin/grep -Eq 'rm -rf /opt/codex-dream-skin|rm -f /usr/bin/dreamskin' "$ROOT/installer/postrm"; then
  printf 'postrm must let dpkg remove package-owned paths without recursive cleanup\n' >&2
  exit 1
fi
if /usr/bin/grep -R -q '/usr/bin/shasum' "$ROOT/scripts"; then
  printf 'Linux runtime must use coreutils sha256sum instead of an undeclared Perl tool\n' >&2
  exit 1
fi

/usr/bin/mkdir -p "$TMP/bin"
/usr/bin/cat > "$TMP/bin/xdg-mime" <<'FAKE'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "$DREAMSKIN_XDG_MIME_LOG"
if [ "${1:-}" = "query" ]; then printf 'other.desktop\n'; fi
FAKE
/bin/chmod 755 "$TMP/bin/xdg-mime"

export DREAMSKIN_XDG_MIME_LOG="$TMP/xdg-mime.log"
PATH="$TMP/bin:$PATH" /bin/bash -c '
  set -euo pipefail
  . "$1/scripts/dreamskin.sh" --self-test-source
  ensure_user_scheme_handler
' _ "$ROOT"

/usr/bin/grep -Fxq 'query default x-scheme-handler/dreamskin' "$DREAMSKIN_XDG_MIME_LOG"
/usr/bin/grep -Fxq 'default codex-dream-skin.desktop x-scheme-handler/dreamskin' "$DREAMSKIN_XDG_MIME_LOG"
/usr/bin/grep -q 'ensure_user_scheme_handler' "$ROOT/scripts/dreamskin.sh"

# A caller-provided NODE must still pass the declared major-version floor.
/usr/bin/cat > "$TMP/bin/node16" <<'FAKE'
#!/bin/bash
if [ "${1:-}" = "--version" ]; then printf 'v16.20.2\n'; exit 0; fi
exit 0
FAKE
/bin/chmod 755 "$TMP/bin/node16"
if NODE="$TMP/bin/node16" /bin/bash -c '
  set -euo pipefail
  . "$1/scripts/common-linux.sh"
  ensure_node_runtime
' _ "$ROOT" >/dev/null 2>&1; then
  printf 'ensure_node_runtime accepted a caller-provided Node 16 binary\n' >&2
  exit 1
fi

CI_WORKFLOW="$ROOT/../.github/workflows/ci.yml"
/usr/bin/grep -Eq 'node: \[18, 20, 22\]' "$CI_WORKFLOW" \
  || { printf 'Linux CI matrix must exercise Node 18, 20, and 22\n' >&2; exit 1; }

printf 'packaging registration tests passed\n'
