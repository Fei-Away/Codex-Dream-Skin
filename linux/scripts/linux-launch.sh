#!/bin/bash

# Linux-only helpers: locate and verify the official Codex desktop app,
# assemble Electron renderer flags, and launch it with CDP enabled.
# Sourced by common-linux.sh; do not execute directly.

# Testable pure helpers (kept free of side effects so tests can source this file).
session_type_of() {
  local xdg="${1:-}"
  local wayland_display="${2:-}"
  case "$xdg" in
    wayland) printf 'wayland' ;;
    x11) printf 'x11' ;;
    *)
      # Only trust the fallback display when it looks like a Wayland socket
      # (e.g. wayland-0); anything else means an X11 session.
      case "$wayland_display" in
        wayland*) printf 'wayland' ;;
        *) printf 'x11' ;;
      esac
      ;;
  esac
}

is_nvidia_present() {
  local root="${1:-/}"
  if [ -d "$root/sys/module/nvidia" ] && [ -d "$root/sys/module/nvidia_drm" ]; then
    printf 'true'
  else
    printf 'false'
  fi
}

assemble_renderer_flags() {
  local session="${1:-x11}"
  local nvidia="${2:-false}"
  local override="${3:-}"
  if [ -n "$override" ]; then
    case "$override" in
      wayland|x11) ;;
      *) fail "Unknown renderer override: $override" ;;
    esac
    session="$override"
  fi
  case "$session" in
    x11) printf -- '--ozone-platform=x11\n' ;;
    wayland)
      if [ "$nvidia" = "true" ]; then
        printf -- '--ozone-platform=x11\n'
      else
        printf -- '--ozone-platform=wayland\n'
        printf -- '--enable-wayland-ime\n'
      fi
      ;;
    *) fail "Unknown session type: $session" ;;
  esac
}

appimage_approval_path() {
  local sha="$1"
  local appimage_path="$2"
  local canonical=""
  canonical="$(cd "$(dirname "$appimage_path")" 2>/dev/null && pwd -P)/$(basename "$appimage_path")" \
    || canonical="$appimage_path"
  local suffix=""
  suffix="$(/usr/bin/printf '%s\n%s' "$canonical" "$sha" | /usr/bin/sha256sum | /usr/bin/cut -c1-24)"
  /usr/bin/printf '%s/appimage-approval-%s.json' "${STATE_ROOT:-/tmp}" "$suffix"
}

require_linux_runtime() {
  local verification_mode="${1:-deep}"
  case "$verification_mode" in deep|quick) ;; *) fail "Unknown runtime verification mode: $verification_mode" ;; esac
  discover_codex_app
  ensure_node_runtime
  verify_codex_install
}

discover_codex_app() {
  local candidate=""
  local configured="${CODEX_APP_IMAGE:-}"
  local pkg=""
  local pkg_status=""

  CODEX_EXE=""
  CODEX_VERSION=""
  CODEX_LAUNCH_KIND=""

  # 1. dpkg-installed package (preferred: officially signed repository)
  for pkg in codex-desktop chatgpt-desktop chatgpt; do
    pkg_status="$(/usr/bin/dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null || true)"
    case "$pkg_status" in
      "install ok installed")
        candidate="$(/usr/bin/dpkg-query -L "$pkg" 2>/dev/null \
          | /usr/bin/grep -E '/(bin|lib)/[^/]*(codex|chatgpt)[^/]*$' | /usr/bin/grep -v -E '\.(so|1)$' \
          | /usr/bin/head -n 1 || true)"
        if [ -n "$candidate" ] && [ -x "$candidate" ]; then
          # Resolve the launcher symlink (e.g. /usr/bin/codex-desktop) to the
          # real binary so /proc/pid/exe canonical comparisons match.
          CODEX_EXE="$(readlink -f "$candidate")"
          CODEX_VERSION="$(/usr/bin/dpkg-query -W -f='${Version}' "$pkg" 2>/dev/null || true)"
          CODEX_PACKAGE="$pkg"
          CODEX_LAUNCH_KIND="deb"
          break
        fi
        ;;
    esac
  done

  # 2. PATH binary (AppImage / manually added)
  if [ -z "${CODEX_EXE:-}" ]; then
    candidate="$(command -v codex-desktop 2>/dev/null || command -v chatgpt-desktop 2>/dev/null || true)"
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      CODEX_EXE="$(readlink -f "$candidate")"
      CODEX_VERSION="unknown"
      CODEX_LAUNCH_KIND="binary"
    fi
  fi

  # 3. AppImage search (configured path wins, then ~/Applications)
  if [ -z "${CODEX_EXE:-}" ]; then
    for candidate in "$configured" "$HOME/Applications"/Codex*.AppImage "$HOME/Applications"/ChatGPT*.AppImage; do
      [ -n "$candidate" ] || continue
      [ -f "$candidate" ] || continue
      CODEX_EXE="$(cd "$(dirname "$candidate")" && pwd -P)/$(basename "$candidate")"
      CODEX_VERSION="unknown"
      CODEX_LAUNCH_KIND="appimage"
      break
    done
  fi

  [ -n "${CODEX_EXE:-}" ] || fail "Could not find the official Codex desktop app. Install it from OpenAI's apt repository (codex-desktop) or download the AppImage."
  [ -x "$CODEX_EXE" ] || fail "Codex executable is missing or not executable: $CODEX_EXE"
  export CODEX_EXE CODEX_VERSION CODEX_PACKAGE CODEX_LAUNCH_KIND
}

verify_codex_install() {
  case "${CODEX_LAUNCH_KIND:-}" in
    deb)
      if command -v apt-cache >/dev/null 2>&1; then
        apt-cache policy "$CODEX_PACKAGE" 2>/dev/null \
          | /usr/bin/grep -qi 'platform\.openai\.com' \
          || fail "The installed Codex package does not come from the official OpenAI repository. Restore or reinstall the official app before continuing."
      fi
      local integrity_output=""
      integrity_output="$(/usr/bin/dpkg -V "$CODEX_PACKAGE" 2>/dev/null || true)"
      if [ -n "$integrity_output" ]; then
        fail "The installed Codex package files fail the dpkg integrity check. Reinstall the official app before continuing."
      fi
      ;;
    appimage|binary)
      verify_appimage_approval || fail "AppImage/binary Codex installs cannot be verified. Run this tool with --allow-unsigned once after confirming the file is the official OpenAI download."
      ;;
    *)
      fail "Unknown Codex launch kind: ${CODEX_LAUNCH_KIND:-missing}"
      ;;
  esac
}

verify_appimage_approval() {
  [ -n "${CODEX_EXE:-}" ] || return 1
  local sha=""
  sha="$("$NODE" -e 'const c=require("node:crypto");const fs=require("node:fs");process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$CODEX_EXE" 2>/dev/null || true)"
  [ -n "$sha" ] || return 1
  local approval_file=""
  approval_file="$(appimage_approval_path "$sha" "$CODEX_EXE")"
  [ -f "$approval_file" ]
}

record_appimage_approval() {
  ensure_state_root
  local sha=""
  sha="$("$NODE" -e 'const c=require("node:crypto");const fs=require("node:fs");process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$CODEX_EXE" 2>/dev/null || true)"
  [ -n "$sha" ] || fail "Could not hash $CODEX_EXE"
  local approval_file=""
  approval_file="$(appimage_approval_path "$sha" "$CODEX_EXE")"
  "$NODE" -e '
    const fs = require("node:fs");
    const [file, exe, sha] = process.argv.slice(1);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({ exe, sha256: sha, approvedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  ' "$approval_file" "$CODEX_EXE" "$sha"
  printf 'Recorded one-time approval for unsigned Codex install: %s\n' "$CODEX_EXE" >&2
}

listener_pids() {
  local port="$1"
  local pids=""
  local lsof_bin=""
  if command -v ss >/dev/null 2>&1; then
    pids="$(/usr/bin/ss -ltnHp "sport = :$port" 2>/dev/null \
      | /usr/bin/sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | /usr/bin/sort -u || true)"
  fi
  # Debian/Ubuntu ship lsof at /usr/bin (not /usr/sbin); resolve it instead
  # of hardcoding a path and only run it when the resolver found a binary.
  lsof_bin="$(command -v lsof 2>/dev/null || true)"
  if [ -z "$pids" ] && [ -n "$lsof_bin" ]; then
    pids="$( "$lsof_bin" -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | /usr/bin/sort -u || true)"
  fi
  printf '%s\n' "$pids"
}

process_executable_path() {
  readlink -f "/proc/$1/exe" 2>/dev/null || true
}

electron_flags_lines() {
  local session=""
  local nvidia="false"
  local override="${CODEX_RENDERER:-}"
  session="$(session_type_of "${XDG_SESSION_TYPE:-}" "${WAYLAND_DISPLAY:-}")"
  nvidia="$(is_nvidia_present)"
  if [ -f "$ELECTRON_FLAGS_PATH" ]; then
    /usr/bin/grep -v -E '^\s*#|^\s*$' "$ELECTRON_FLAGS_PATH" || true
    printf '\n'
  fi
  assemble_renderer_flags "$session" "$nvidia" "$override"
}

launch_codex_with_cdp() {
  local port="$1"
  local flags=""
  : > "$APP_LOG"
  : > "$APP_ERROR_LOG"
  flags="$(electron_flags_lines)"
  # Disable pathname expansion for the flag list (word splitting only), so a
  # user flag can never be interpreted as a glob pattern.
  ( set -f
    /usr/bin/nohup "$CODEX_EXE" \
      --remote-debugging-address=127.0.0.1 \
      --remote-debugging-port="$port" \
      $flags \
      >>"$APP_LOG" 2>>"$APP_ERROR_LOG" &
  )
}

launch_codex_normally() {
  /usr/bin/nohup "$CODEX_EXE" >>"$APP_LOG" 2>>"$APP_ERROR_LOG" &
}

release_codex_launchd_job() {
  return 0
}
