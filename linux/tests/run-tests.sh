#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-$(command -v node)}"
[ -x "$NODE" ] || { printf 'node was not found. Install nodejs (>= 18) first.\n' >&2; exit 1; }
NODE_MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]' || printf 0)"
[ "$NODE_MAJOR" -ge 18 ] || { printf 'node >= 18 is required (deb Depends: nodejs >= 18), found: %s\n' "$("$NODE" --version)" >&2; exit 1; }

while IFS= read -r file; do /bin/bash -n "$file"; done < <(
  find "$ROOT" -type f -name '*.sh' ! -path '*/release/*' -print
)
# Installer maintenance scripts carry no .sh extension, so the find above
# misses them; keep them syntax-checked alongside the rest. Extend the glob
# when new maintainer scripts (e.g. preinst) land.
for file in "$ROOT"/installer/{postinst,prerm,postrm,preinst}; do
  [ -f "$file" ] || continue
  /bin/bash -n "$file"
done
while IFS= read -r file; do "$NODE" --check "$file" >/dev/null; done < <(
  find "$ROOT/scripts" "$ROOT/assets" -type f \( -name '*.mjs' -o -name '*.js' \) -print
)
for test in "$ROOT"/tests/*.test.sh "$ROOT"/tests/*.test.mjs; do
  [ -f "$test" ] || continue
  case "$test" in
    *.test.sh) /bin/bash "$test" ;;
    *.test.mjs) "$NODE" "$test" ;;
  esac
done
printf 'linux tests passed\n'
