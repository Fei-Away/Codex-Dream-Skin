#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$ROOT/scripts/linux-launch.sh"

# session_type detection
[ "$(session_type_of x11 wayland)" = "x11" ]
[ "$(session_type_of wayland x11)" = "wayland" ]
[ "$(session_type_of '' wayland)" = "wayland" ]
[ "$(session_type_of '' wayland-0)" = "wayland" ]
[ "$(session_type_of '' bogus)" = "x11" ]
[ "$(session_type_of bogus x11)" = "x11" ]

# nvidia detection is rooted at a caller-supplied base (testable anywhere)
NV_ROOT="$(mktemp -d /tmp/dreamskin-nv.XXXXXX)"
FLAGS_FILE="$(mktemp /tmp/dreamskin-flags.XXXXXX)"
trap 'rm -rf "$NV_ROOT" "$FLAGS_FILE"' EXIT
mkdir -p "$NV_ROOT/sys/module/nvidia" "$NV_ROOT/sys/module/nvidia_drm"
[ "$(is_nvidia_present "$NV_ROOT")" = "true" ]
[ "$(is_nvidia_present "$NV_ROOT/empty")" = "false" ]

# flags assembly
FLAGS_X11="$(assemble_renderer_flags x11 false)"
case "$FLAGS_X11" in *"--ozone-platform=x11"*) ;; *) exit 1 ;; esac
FLAGS_WL_NVIDIA="$(assemble_renderer_flags wayland true)"
case "$FLAGS_WL_NVIDIA" in *"--ozone-platform=x11"*) ;; *) exit 1 ;; esac
FLAGS_WL="$(assemble_renderer_flags wayland false)"
case "$FLAGS_WL" in *"--enable-wayland-ime"*) ;; *) exit 1 ;; esac
case "$FLAGS_WL" in *"ozone-platform=x11"*) exit 1 ;; esac

# renderer override wins
case "$(assemble_renderer_flags x11 true x11)" in *"--ozone-platform=x11"*) ;; *) exit 1 ;; esac
case "$(assemble_renderer_flags wayland false wayland)" in *"--ozone-platform=wayland"*) ;; *) exit 1 ;; esac

# appimage approval path is a pure string helper
[ -n "$(appimage_approval_path sha256sum /tmp/Foo.AppImage)" ]
case "$(appimage_approval_path sha256sum /tmp/Foo.AppImage)" in *.json) ;; *) exit 1 ;; esac
[ "$(appimage_approval_path sha256sum /tmp/Foo.AppImage)" = "$(appimage_approval_path sha256sum /tmp/Foo.AppImage)" ]
[ "$(appimage_approval_path sha256sum /tmp/Foo.AppImage)" != "$(appimage_approval_path sha256dead /tmp/Foo.AppImage)" ]

# official repo origin detection (codex_origin_is_official returns the grep
# exit code, so these are asserted in if-form under set -e)
if ! codex_origin_is_official '500 https://platform.openai.com/codex/debian stable main amd64 Packages'; then exit 1; fi
if ! codex_origin_is_official '500 https://persistent.oaistatic.com/codex-app-prod/linux/deb stable/main amd64 Packages'; then exit 1; fi
if codex_origin_is_official '500 http://evil.example.com/repo stable main amd64 Packages'; then exit 1; fi
if codex_origin_is_official '500 https://evil.example.com/x/platform.openai.com/codex stable main amd64 Packages'; then exit 1; fi
if codex_origin_is_official '500 https://platform.openai.com.evil.com/codex/ stable main amd64 Packages'; then exit 1; fi
if codex_origin_is_official ''; then exit 1; fi

# electron_flags_lines integration: source common-linux.sh in a subshell so
# the test stays hermetic (ELECTRON_FLAGS_PATH is reset at source time, so the
# env overrides are applied on the call itself).
printf -- '--disable-gpu-compositing\n' > "$FLAGS_FILE"
FLAGS_X11_LINES="$(/bin/bash -c '
  . "$1/scripts/common-linux.sh"
  XDG_SESSION_TYPE=x11 ELECTRON_FLAGS_PATH="$2" electron_flags_lines
' _ "$ROOT" "$FLAGS_FILE")"
case "$FLAGS_X11_LINES" in *"--disable-gpu-compositing"*) ;; *) exit 1 ;; esac
case "$FLAGS_X11_LINES" in *"--ozone-platform=x11"*) ;; *) exit 1 ;; esac
FLAGS_WL_OVERRIDE="$(/bin/bash -c '
  . "$1/scripts/common-linux.sh"
  is_nvidia_present() { printf "false"; }
  XDG_SESSION_TYPE=x11 CODEX_RENDERER=wayland ELECTRON_FLAGS_PATH="$2" electron_flags_lines
' _ "$ROOT" "$FLAGS_FILE")"
case "$FLAGS_WL_OVERRIDE" in *"--ozone-platform=wayland"*) ;; *) exit 1 ;; esac
case "$FLAGS_WL_OVERRIDE" in *"ozone-platform=x11"*) exit 1 ;; esac

# invalid renderer override must fail; fail() is normally provided by
# common-linux.sh, so stub it while sourcing linux-launch.sh alone. The call
# runs in a subshell because fail() exits the shell it runs in.
if ! command -v fail >/dev/null 2>&1; then
  fail() { printf 'Dream Skin: %s\n' "$*" >&2; exit 1; }
fi
if ( assemble_renderer_flags wayland false bogus 2>/dev/null ); then exit 1; fi

# deb discovery must prefer the real ELF binary: the official chatgpt deb
# ships /usr/lib/chatgpt (dir), /usr/lib/chatgpt/codex-launcher (sh wrapper
# exec'ing the ELF), and /usr/lib/chatgpt/ChatGPT (the ELF). Picking the dir
# or the wrapper breaks launch and /proc/pid/exe identity. Real-machine
# regression: the installed package's first match in dpkg -L order was the
# directory, and nohup died with permission denied on it.
LAUNCHER_STUB="$(mktemp /tmp/dreamskin-launcher.XXXXXX)"
printf '#!/bin/sh\nexec /usr/lib/chatgpt/ChatGPT "$@"\n' > "$LAUNCHER_STUB"
/bin/chmod 755 "$LAUNCHER_STUB"
if codex_candidate_is_binary /usr/lib/chatgpt; then exit 1; fi
if codex_candidate_is_binary "$LAUNCHER_STUB"; then exit 1; fi
codex_candidate_is_binary /bin/bash \
  || { printf 'ELF detection rejected a real binary\n' >&2; exit 1; }
/bin/rm -f "$LAUNCHER_STUB"

printf 'linux-launch tests passed\n'
