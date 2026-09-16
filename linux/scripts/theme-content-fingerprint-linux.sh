#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

ensure_node_runtime
ensure_state_root

"$NODE" "$SCRIPT_DIR/../runtime/theme-content-fingerprint.mjs" "$@"
