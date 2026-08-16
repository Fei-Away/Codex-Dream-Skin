#!/bin/bash

# Full Linux release pipeline: sync shared assets, run the test suite,
# then build tar.gz and deb. Fails fast if anything is out of date.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
LINUX_ROOT="$ROOT/linux"

/usr/bin/node "$ROOT/tools/sync-runtime-assets.mjs"
/usr/bin/node "$ROOT/tools/sync-runtime-assets.mjs" --check \
  || { printf 'Shared runtime assets are out of date; sync them first.\n' >&2; exit 1; }

/bin/bash "$LINUX_ROOT/tests/run-tests.sh"

/bin/bash "$LINUX_ROOT/scripts/build-tarball.sh"
/bin/bash "$LINUX_ROOT/scripts/build-deb.sh"
/bin/bash "$LINUX_ROOT/tests/deb-content.test.sh" \
  "$LINUX_ROOT/release/codex-dream-skin_$(/usr/bin/tr -d '[:space:]' < "$LINUX_ROOT/VERSION")_amd64.deb"

( cd "$LINUX_ROOT/release" && /usr/bin/sha256sum *.deb *.tar.gz > SHA256SUMS.txt )
printf 'Linux release artifacts are ready in %s\n' "$LINUX_ROOT/release"
