#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

REQUIRE_LIVE="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --require-live) REQUIRE_LIVE="true"; shift ;;
    *) printf 'Unknown doctor argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

discover_codex_app 2>/dev/null || true
ensure_node_runtime

printf 'Codex Dream Skin Doctor — v%s\n' "$SKIN_VERSION"
printf '========================================\n\n'

# Check Codex binary
if [ -n "${CODEX_EXE:-}" ] && [ -x "$CODEX_EXE" ]; then
  printf '[OK] Codex executable: %s\n' "$CODEX_EXE"
else
  printf '[WARN] Codex executable not found or not executable\n'
fi
printf '[OK] Codex version: %s\n' "${CODEX_VERSION:-unknown}"

# Check Node runtime
if [ -n "${RUNTIME_NODE:-}" ] && [ -x "$RUNTIME_NODE" ]; then
  printf '[OK] Node runtime: %s (%s)\n' "$RUNTIME_NODE" "$NODE_VERSION"
else
  printf '[WARN] Node runtime not validated\n'
fi

# Locate runtime assets by searching multiple candidate paths.
# Source tree: runtime/ is at repo root (parent of linux/), injector is in linux/scripts/
# Installed:   runtime/ and scripts/ are both under /usr/share/codex-dream-skin/
ASSETS_HINT=""
REPO_ROOT="$(cd "$PROJECT_ROOT/.." && pwd -P)"
for candidate in \
  "/usr/share/codex-dream-skin" \
  "$PROJECT_ROOT" \
  "$REPO_ROOT"; do
  [ -d "$candidate" ] || continue
  # Installed layout: runtime/ and scripts/ both under candidate/
  if [ -f "$candidate/runtime/dream-skin.css" ] && [ -f "$candidate/scripts/injector.mjs" ]; then
    ASSETS_HINT="installed:$candidate"; break
  fi
  # Source layout: runtime/ at repo root, injector in linux/scripts/
  if [ -f "$candidate/runtime/dream-skin.css" ] && [ -f "$candidate/linux/scripts/injector.mjs" ]; then
    ASSETS_HINT="source:$candidate"; break
  fi
done

if [ -z "$ASSETS_HINT" ]; then
  printf '[WARN] Could not locate runtime assets directory\n'
else
  if [[ "$ASSETS_HINT" == installed:* ]]; then
    BASE="${ASSETS_HINT#installed:}"
    css_dir="$BASE/runtime"
    inj_dir="$BASE/scripts"
  else
    # source:REPO_ROOT or empty
    BASE="${ASSETS_HINT#source:}"
    css_dir="$BASE/runtime"
    inj_dir="$BASE/linux/scripts"
  fi
  for required_file in dream-skin.css renderer-inject.js safe-css-policy.json \
    safe-css-validator.mjs theme-package-validator.mjs \
    validate-safe-css-file.mjs; do
    if [ -s "$css_dir/$required_file" ]; then
      printf '[OK] %s\n' "$required_file"
    else
      printf '[FAIL] Missing or empty: %s\n' "$required_file"
    fi
  done
  # selectors.json lives in scripts/ (shared with injector), not in runtime/
  if [ -s "$inj_dir/selectors.json" ] || [ -s "$css_dir/selectors.json" ]; then
    printf '[OK] selectors.json\n'
  else
    printf '[FAIL] Missing or empty: selectors.json\n'
  fi
  # injector.mjs is in the scripts dir
  if [ -s "$inj_dir/injector.mjs" ]; then
    printf '[OK] injector.mjs\n'
  else
    printf '[FAIL] Missing or empty: injector.mjs\n'
  fi
fi

# Check state
if [ -f "$STATE_PATH" ]; then
  printf '\n[State]\n'
  local_port session theme_id
  local_port="$(state_field port 2>/dev/null || echo '')"
  session="$(state_field session 2>/dev/null || echo '')"
  theme_id="$(state_field appliedThemeId 2>/dev/null || echo '')"
  printf '  Port:     %s\n' "${local_port:-<none>}"
  printf '  Session:  %s\n' "${session:-<none>}"
  printf '  Theme:    %s\n' "${theme_id:-<none>}"

  if [ -n "$local_port" ] && verified_cdp_endpoint "$local_port" 2>/dev/null; then
    printf '\n[CDP]\n'
    printf '  [OK] Debug port %s is reachable and belongs to Codex\n' "$local_port"
    if [ "$REQUIRE_LIVE" = "true" ]; then
      "$NODE" "$INJECTOR" --verify --port "$local_port" --theme-dir "$THEME_DIR" --timeout-ms 12000 \
        >/dev/null 2>&1 && printf '  [OK] Theme injection verified live\n' \
        || printf '  [FAIL] Live theme verification failed\n'
    fi
  else
    printf '\n[CDP]\n'
    printf '  [WARN] No active CDP session on port %s\n' "${local_port:-9335}"
  fi
else
  printf '\n[State] No state file found — Dream Skin not installed or not running.\n'
fi

printf '\n========================================\n'
printf 'Doctor check complete.\n'
