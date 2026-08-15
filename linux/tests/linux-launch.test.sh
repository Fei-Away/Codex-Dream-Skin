#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$ROOT/scripts/linux-launch.sh"

# session_type detection
[ "$(session_type_of x11 wayland)" = "x11" ]
[ "$(session_type_of wayland x11)" = "wayland" ]
[ "$(session_type_of '' wayland)" = "wayland" ]
[ "$(session_type_of bogus x11)" = "x11" ]

# nvidia detection is rooted at a caller-supplied base (testable anywhere)
NV_ROOT="$(mktemp -d /tmp/dreamskin-nv.XXXXXX)"
trap 'rm -rf "$NV_ROOT"' EXIT
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

printf 'linux-launch tests passed\n'
