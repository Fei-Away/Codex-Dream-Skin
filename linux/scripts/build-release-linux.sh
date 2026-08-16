#!/bin/bash

# Full Linux release pipeline: fail fast on uncommitted runtime-asset
# drift, regenerate deterministically, run the test suite, then build
# tar.gz and deb with a fresh checksum file.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
LINUX_ROOT="$ROOT/linux"

# CI runners get node from setup-node's toolcache (PATH only, no /usr/bin/node);
# user machines get it from the nodejs package. Resolve either way.
NODE="${NODE:-$(command -v node || true)}"
[ -n "$NODE" ] || { printf 'node is required to build Linux releases.\n' >&2; exit 1; }

# The gate fires before any regeneration so an out-of-date platform copy
# aborts the build instead of being silently rewritten.
"$NODE" "$ROOT/tools/sync-runtime-assets.mjs" --check \
  || { printf 'Shared runtime assets are out of date; run sync and commit the regeneration.\n' >&2; exit 1; }

"$NODE" "$ROOT/tools/sync-runtime-assets.mjs"

/bin/bash "$LINUX_ROOT/tests/run-tests.sh"

# Drop stale artifacts (and any stale SHA256SUMS.txt) so the checksum file
# only ever covers the two artifacts built below.
/bin/rm -f "$LINUX_ROOT"/release/*.deb "$LINUX_ROOT"/release/*.tar.gz \
  "$LINUX_ROOT"/release/SHA256SUMS.txt

/bin/bash "$LINUX_ROOT/scripts/build-tarball.sh"
/bin/bash "$LINUX_ROOT/scripts/build-deb.sh"
/bin/bash "$LINUX_ROOT/tests/deb-content.test.sh" \
  "$LINUX_ROOT/release/codex-dream-skin_$(/usr/bin/tr -d '[:space:]' < "$LINUX_ROOT/VERSION")_amd64.deb"

( cd "$LINUX_ROOT/release" && /usr/bin/sha256sum *.deb *.tar.gz > SHA256SUMS.txt )
printf 'Linux release artifacts are ready in %s\n' "$LINUX_ROOT/release"
