#!/bin/bash

# One-click apply from DreamSkin.cc via dreamskin://apply?version=ver_...
# Strict: fixed official API host only, no redirects, size + SHA-256 verified,
# then reuses the exact ZIP/manifest/image/Safe-CSS import pipeline.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

URL="${1:-}"
case "$URL" in
  dreamskin://apply?version=*) ;;
  *) fail "Unsupported Dream Skin link." ;;
esac

ensure_node_runtime
ensure_state_root
# apply-community-theme-linux.sh validates that the transaction root sits in
# the reserved "$STATE_ROOT"/.community-apply-* namespace, so the template
# must carry the leading dot and the hyphen.
TRANSACTION_ROOT="$(/bin/mktemp -d "$STATE_ROOT/.community-apply-XXXXXX")"
cleanup() { /bin/rm -rf "$TRANSACTION_ROOT"; }
trap cleanup EXIT

"$NODE" "$SCRIPT_DIR/community-apply.mjs" "$URL" "$TRANSACTION_ROOT"

read_package_field() {
  "$NODE" -e '
    const fs = require("node:fs");
    process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[process.argv[2]] || ""));
  ' "$TRANSACTION_ROOT/community-package.json" "$1"
}

# Read one JSON field from stdin, accumulating chunks before parsing so a
# multi-chunk write cannot yield an empty value.
json_field_from_stdin() {
  "$NODE" -e '
    let body = "";
    process.stdin.on("data", (chunk) => { body += chunk.toString("utf8"); });
    process.stdin.on("end", () => {
      let value = "";
      try { value = String(JSON.parse(body)[process.argv[1]] || ""); } catch {}
      process.stdout.write(value);
    });
  ' "$1"
}

# Import validates the ZIP contract, manifest, image, Safe CSS and the exact
# downloaded byte identity; its JSON output carries the content fingerprint.
IMPORT_RESULT="$("$SCRIPT_DIR/import-theme-zip-linux.sh" \
  --file "$TRANSACTION_ROOT/package.zip" \
  --expected-sha256 "$(read_package_field packageSha256)" \
  --expected-bytes "$(read_package_field packageBytes)")"
THEME_ID="$(printf '%s' "$IMPORT_RESULT" | json_field_from_stdin id)"
FINGERPRINT="$(printf '%s' "$IMPORT_RESULT" | json_field_from_stdin contentFingerprint)"
ACTIVE_ID="$( "$SCRIPT_DIR/status-dream-skin-linux.sh" --json --deep 2>/dev/null | json_field_from_stdin appliedThemeId)"

"$SCRIPT_DIR/apply-community-theme-linux.sh" \
  --id "$THEME_ID" \
  --expect-fingerprint "$FINGERPRINT" \
  --expect-active-id "$ACTIVE_ID" \
  --transaction-root "$TRANSACTION_ROOT"
