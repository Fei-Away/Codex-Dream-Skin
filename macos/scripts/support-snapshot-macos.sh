#!/bin/bash

# Emit a local-only, manually shareable support summary. It never connects to
# CDP, reads logs, writes files, or includes paths, ports, identities, or user content.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

[ "$#" -eq 0 ] || {
  printf 'Usage: support-snapshot-macos.sh\n' >&2
  exit 2
}

emit_fallback() {
  /usr/bin/printf '%s\n' '{
  "schemaVersion": 1,
  "kind": "codex-dream-skin-support-snapshot",
  "product": "Codex Dream Skin",
  "platform": "macos",
  "collection": {
    "networkAccessed": false,
    "cdpAccessed": false,
    "writesPerformed": false
  },
  "privacy": {
    "manualSharingRequired": true,
    "redacted": [
      "paths",
      "ports",
      "processIds",
      "browserIds",
      "logs",
      "screenshots",
      "themeMetadata",
      "configContents",
      "environment",
      "credentials",
      "chatAndTaskContent"
    ]
  },
  "runtime": {
    "officialAppDetected": false,
    "officialAppValidated": false,
    "nodeRuntimeValidated": false,
    "codexVersion": null,
    "nodeVersion": null
  },
  "payload": {
    "attempted": false,
    "valid": false,
    "skinVersion": null
  },
  "configuration": {
    "present": false
  },
  "state": {
    "present": false,
    "readable": false,
    "session": "unavailable"
  },
  "liveVerification": "notChecked"
}'
}

# fail normally records a launcher error. Snapshot failure must stay read-only,
# so the isolated probe replaces it with a quiet nonzero exit.
snapshot="$(
  (
    fail() { exit 1; }
    discover_codex_app
    require_macos_runtime
    payload_json="$("$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" 2>/dev/null)"
    "$NODE" -e '
      const fs = require("node:fs");
      const redacted = [
        "paths", "ports", "processIds", "browserIds", "logs", "screenshots",
        "themeMetadata", "configContents", "environment", "credentials", "chatAndTaskContent",
      ];
      const cleanVersion = (value) => {
        const candidate = String(value || "").trim();
        return /^[v]?[0-9][0-9A-Za-z.+-]{0,63}$/.test(candidate) ? candidate : null;
      };
      const present = (file) => {
        try { return fs.statSync(file).isFile(); } catch { return false; }
      };
      const state = { present: present(process.argv[5]), readable: false, session: "unavailable" };
      if (state.present) {
        try {
          const parsed = JSON.parse(fs.readFileSync(process.argv[5], "utf8"));
          state.readable = true;
          state.session = ["active", "paused"].includes(parsed?.session) ? parsed.session : "unknown";
        } catch {}
      }
      let payload = null;
      try { payload = JSON.parse(process.argv[1]); } catch {}
      const snapshot = {
        schemaVersion: 1,
        kind: "codex-dream-skin-support-snapshot",
        product: "Codex Dream Skin",
        platform: "macos",
        collection: { networkAccessed: false, cdpAccessed: false, writesPerformed: false },
        privacy: { manualSharingRequired: true, redacted },
        runtime: {
          officialAppDetected: true,
          officialAppValidated: true,
          nodeRuntimeValidated: true,
          codexVersion: cleanVersion(process.argv[3]),
          nodeVersion: cleanVersion(process.argv[4]),
        },
        payload: {
          attempted: true,
          valid: payload?.pass === true,
          skinVersion: cleanVersion(process.argv[2]),
        },
        configuration: { present: present(process.argv[6]) },
        state,
        liveVerification: "notChecked",
      };
      process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    ' "$payload_json" "$SKIN_VERSION" "$CODEX_VERSION" "$NODE_VERSION" "$STATE_PATH" "$CONFIG_PATH"
  ) 2>/dev/null
)" || true

if [ -n "$snapshot" ]; then
  printf '%s\n' "$snapshot"
else
  emit_fallback
fi
