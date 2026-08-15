#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-$(command -v node)}"
[ -x "$NODE" ] || { printf 'node was not found. Install nodejs (>= 18) first.\n' >&2; exit 1; }

while IFS= read -r file; do /bin/bash -n "$file"; done < <(
  find "$ROOT" -type f -name '*.sh' ! -path '*/release/*' -print
)
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
