#!/usr/bin/env python3
"""
Codex Dream Skin — Linux system tray application.
Uses GTK3 + libayatana-appindicator for system tray integration.
Provides: start/stop/pause/resume theme, switch themes, import ZIP, check update, open theme folder.
"""

import os
import sys
import subprocess
import json
import threading
import tempfile
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('AyatanaAppIndicator3', '0.1')
gi.require_version('Notify', '0.7')
from gi.repository import Gtk, AyatanaAppIndicator3 as AppIndicator3, GLib, Notify

# Paths
INSTALL_ROOT = os.path.expanduser("~/.codex/codex-dream-skin-studio")
STATE_ROOT = os.path.join(os.path.expanduser("~"), ".local", "share", "codex-dream-skin")
STATE_PATH = os.path.join(STATE_ROOT, "state.json")
# tray-app/ is one level below the install root; scripts/ sits next to tray-app/
_SCRIPTS_DIR_CANDIDATE = os.path.join(os.path.dirname(os.path.realpath(__file__)), "scripts")
if os.path.isdir(_SCRIPTS_DIR_CANDIDATE):
    SCRIPTS_DIR = _SCRIPTS_DIR_CANDIDATE
else:
    SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.realpath(__file__))), "scripts")

SKIN_VERSION = "1.5.19"
CODEX_EXE = "/usr/lib/chatgpt/ChatGPT"
NODE_RUNTIME = "/usr/lib/chatgpt/resources/cua_node/bin/node"


def run_script(script_name, *args):
    """Run a linux script and return (stdout, stderr, returncode)."""
    script_path = os.path.join(SCRIPTS_DIR, script_name)
    if not os.path.exists(script_path):
        return "", f"Script not found: {script_path}", 1
    env = os.environ.copy()
    env["HOME"] = os.path.expanduser("~")
    try:
        result = subprocess.run(
            ["bash", script_path] + list(args),
            capture_output=True, text=True, timeout=30, env=env
        )
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except subprocess.TimeoutExpired:
        return "", "Timeout", 1
    except Exception as e:
        return "", str(e), 1


def get_state():
    """Read current state from state.json."""
    if not os.path.exists(STATE_PATH):
        return None
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except Exception:
        return None


def notify(message, icon_name="dialog-information"):
    """Show desktop notification."""
    Notify.init("Codex Dream Skin")
    n = Notify.Notification.new("Codex Dream Skin", message, icon_name)
    n.set_timeout(3000)
    n.show()


class TrayApp(Gtk.Window):
    def __init__(self):
        super().__init__()
        self.set_title("Codex Dream Skin")
        self.hide()

        # System tray indicator
        self.indicator = AppIndicator3.Indicator.new(
            "codex-dream-skin",
            "dialog-information",
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS
        )
        self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        # Force visible even on desktops without native tray support
        self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        self.indicator.set_menu(self._build_menu())

        # Load theme icons
        self.icon_paths = {
            "active": self._find_icon("status-active"),
            "paused": self._find_icon("status-paused"),
            "inactive": self._find_icon("status-inactive"),
        }
        self._update_icon()

        # Store status label reference for lightweight updates
        self._status_item = None
        # Timer to refresh status (lightweight: only updates label+icon, not full menu)
        GLib.timeout_add_seconds(10, self._refresh_status)

    def _find_icon(self, state):
        """Find icon path for state."""
        candidates = [
            os.path.join(SCRIPTS_DIR, f"icon-{state}.png"),
            os.path.join(SCRIPTS_DIR, f"icon-{state}.svg"),
            os.path.join(SCRIPTS_DIR, "..", "assets", f"icon-{state}.png"),
        ]
        for p in candidates:
            if os.path.exists(p):
                return p
        return ""

    def _update_icon(self):
        """Update tray icon based on current state."""
        state = get_state()
        if state and state.get("session") == "active":
            icon = "status-active"
        elif state and state.get("session") == "paused":
            icon = "status-paused"
        else:
            icon = "status-inactive"
        icon_path = self._find_icon(icon)
        if icon_path:
            self.indicator.set_icon_full(icon_path, icon)

    def _build_menu(self):
        menu = Gtk.Menu()

        # Status label
        state = get_state()
        session = state.get("session", "inactive") if state else "inactive"
        port = state.get("port", "") if state else ""
        theme_name = state.get("appliedThemeName", "") if state else ""

        status_item = Gtk.Label()
        status_item.set_sensitive(False)
        if session == "active":
            status_item.set_label(f"Active· Port {port}" if port else "Active")
        elif session == "paused":
            status_item.set_label(_t("status_paused"))
        else:
            status_item.set_label(_t("status_inactive"))
        # Wrap in MenuItem so it can be added to the menu
        status_menu_item = Gtk.MenuItem()
        status_menu_item.add(status_item)
        self._status_item = status_item
        menu.append(status_menu_item)
        menu.append(Gtk.SeparatorMenuItem())

        # Start
        start_item = Gtk.MenuItem(label=_t("start"))
        start_item.connect("activate", self._on_start)
        menu.append(start_item)

        # Stop
        stop_item = Gtk.MenuItem(label=_t("stop"))
        stop_item.connect("activate", self._on_stop)
        menu.append(stop_item)

        # Pause/Resume
        if session == "active":
            pause_item = Gtk.MenuItem(label=_t("pause"))
            pause_item.connect("activate", self._on_pause)
            menu.append(pause_item)
        elif session == "paused":
            resume_item = Gtk.MenuItem(label=_t("resume"))
            resume_item.connect("activate", self._on_resume)
            menu.append(resume_item)

        menu.append(Gtk.SeparatorMenuItem())

        # Switch theme
        themes_menu = Gtk.Menu()
        themes_dir = os.path.join(STATE_ROOT, "themes")
        if os.path.isdir(themes_dir):
            for tname in sorted(os.listdir(themes_dir)):
                tpath = os.path.join(themes_dir, tname)
                if os.path.isdir(tpath):
                    tjson = os.path.join(tpath, "theme.json")
                    if os.path.exists(tjson):
                        try:
                            with open(tjson) as f:
                                td = json.load(f)
                            label = td.get("name", tname)
                        except Exception:
                            label = tname
                    else:
                        label = tname
                    item = Gtk.MenuItem(label=label)
                    item.connect("activate", self._on_switch_theme, tname)
                    themes_menu.append(item)
        else:
            no_themes_label = Gtk.Label(label=_t("no_themes"))
            no_themes_label.set_sensitive(False)
            no_themes_item = Gtk.MenuItem()
            no_themes_item.add(no_themes_label)
            themes_menu.append(no_themes_item)
        themes_menu_item = Gtk.MenuItem(label=_t("switch_theme"))
        themes_menu_item.set_submenu(themes_menu)
        menu.append(themes_menu_item)

        # Import theme
        import_item = Gtk.MenuItem(label=_t("import_theme"))
        import_item.connect("activate", self._on_import_theme)
        menu.append(import_item)

        menu.append(Gtk.SeparatorMenuItem())

        # Open theme folder
        open_folder = Gtk.MenuItem(label=_t("open_theme_folder"))
        open_folder.connect("activate", self._on_open_theme_folder)
        menu.append(open_folder)

        # Check update
        check_update = Gtk.MenuItem(label=_t("check_update"))
        check_update.connect("activate", self._on_check_update)
        menu.append(check_update)

        menu.append(Gtk.SeparatorMenuItem())

        # Quit
        quit_item = Gtk.MenuItem(label=_t("quit"))
        quit_item.connect("activate", self._on_quit)
        menu.append(quit_item)

        menu.show_all()
        return menu

    def _refresh_status(self):
        # Lightweight: only update status label text and icon, not the full menu
        if self._status_item:
            state = get_state()
            session = state.get("session", "inactive") if state else "inactive"
            port = state.get("port", "") if state else ""
            if session == "active":
                self._status_item.set_label(f"Active· Port {port}" if port else "Active")
            elif session == "paused":
                self._status_item.set_label(_t("status_paused"))
            else:
                self._status_item.set_label(_t("status_inactive"))
        self._update_icon()
        return True  # Keep the timer running

    def _on_start(self, widget):
        def worker():
            state = get_state()
            port = state.get("port", "") if state else ""
            if not port:
                try:
                    res = subprocess.run(
                        ["bash", "-c",
                         "grep -oP 'remote-debugging-port=\\K[0-9]+' /proc/$(pgrep -f '/usr/lib/chatgpt/ChatGPT' | head -1)/cmdline 2>/dev/null || echo ''"],
                        capture_output=True, text=True, timeout=5
                    )
                    port = res.stdout.strip()
                except Exception:
                    port = ""
            if not port:
                port = "9335"  # fallback
            stdout, stderr, code = run_script("start-dream-skin-linux.sh", "--port", str(port))
            GLib.idle_add(self._on_start_done, stdout, stderr, code)
        threading.Thread(target=worker, daemon=True).start()

    def _on_start_done(self, stdout, stderr, code):
        if code == 0:
            notify(_t("notify_started"))
        else:
            notify(f"Start failed: {stderr[:80]}", "dialog-error")
        self.indicator.set_menu(self._build_menu())
        self._update_icon()

    def _on_stop(self, widget):
        def worker():
            stdout, stderr, code = run_script("restore-dream-skin-linux.sh")
            GLib.idle_add(self._on_stop_done, stdout, stderr, code)
        threading.Thread(target=worker, daemon=True).start()

    def _on_stop_done(self, stdout, stderr, code):
        if code == 0:
            notify(_t("notify_stop"))
        else:
            notify(f"Restore failed: {stderr[:80]}", "dialog-error")
        self.indicator.set_menu(self._build_menu())
        self._update_icon()

    def _on_pause(self, widget):
        def worker():
            run_script("pause-dream-skin-linux.sh", "pause")
            GLib.idle_add(self._on_pause_done)
        threading.Thread(target=worker, daemon=True).start()

    def _on_pause_done(self):
        self.indicator.set_menu(self._build_menu())
        self._update_icon()

    def _on_resume(self, widget):
        def worker():
            run_script("pause-dream-skin-linux.sh", "resume")
            GLib.idle_add(self._on_pause_done)
        threading.Thread(target=worker, daemon=True).start()

    def _on_switch_theme(self, widget, theme_id):
        def worker():
            stdout, stderr, code = run_script("switch-theme-linux.sh", theme_id)
            GLib.idle_add(self._on_switch_done, stdout, stderr, code, theme_id)
        threading.Thread(target=worker, daemon=True).start()

    def _on_switch_done(self, stdout, stderr, code, theme_id):
        if code == 0:
            notify(f"Theme switched to {stdout.split(chr(10))[-1] if stdout else theme_id}")
        else:
            notify(f"Switch failed: {stderr[:80]}", "dialog-error")
        self.indicator.set_menu(self._build_menu())
        self._update_icon()

    def _on_import_theme(self, widget):
        def worker():
            chosen_path = None
            home_dir = os.path.expanduser("~")

            # Try zenity first (Wayland/X11 portal compatible)
            if subprocess.run(["which", "zenity"], capture_output=True).returncode == 0:
                try:
                    result = subprocess.run(
                        ["zenity", "--file-selection", "--title=导入主题 ZIP",
                         f"--filename={home_dir}/",
                         "--file-filter=ZIP files (*.zip) | *.zip *.ZIP",
                         "--file-filter=All files | *"],
                        capture_output=True, text=True, timeout=180
                    )
                    if result.returncode == 0:
                        chosen_path = result.stdout.strip()
                except Exception:
                    pass
            elif subprocess.run(["which", "kdialog"], capture_output=True).returncode == 0:
                try:
                    result = subprocess.run(
                        ["kdialog", "--getopenfilename", home_dir, "*.zip *.ZIP|ZIP files (*.zip)"],
                        capture_output=True, text=True, timeout=180
                    )
                    if result.returncode == 0:
                        chosen_path = result.stdout.strip()
                except Exception:
                    pass

            if not chosen_path:
                return

            stdout, stderr, code = run_script("import-theme-zip-linux.sh", "--file", chosen_path)
            GLib.idle_add(self._on_import_done, stdout, stderr, code)

        threading.Thread(target=worker, daemon=True).start()

    def _on_import_done(self, stdout, stderr, code):
        if code == 0:
            notify(_t("notify_import"))
            self.indicator.set_menu(self._build_menu())
            self._update_icon()
        else:
            notify(f"Import failed: {stderr[:80]}", "dialog-error")

    def _on_open_theme_folder(self, widget):
        subprocess.Popen(["xdg-open", STATE_ROOT])

    def _on_check_update(self, widget):
        def worker():
            stdout, stderr, code = run_script("check-update-linux.sh", "--check-only")
            GLib.idle_add(self._on_check_update_done, stdout, stderr, code)
        threading.Thread(target=worker, daemon=True).start()

    def _on_check_update_done(self, stdout, stderr, code):
        msg = stdout if code == 0 else stderr
        notify(msg[:100] if msg else "Update check complete")

    def _on_quit(self, widget):
        Gtk.main_quit()


# ── Localization ─────────────────────────────────────────────────────────────
_SUPPORTED_LOCALES = ("zh", "en")

def _detect_locale():
    for env_key in ("DREAMSKIN_LANG", "LC_ALL", "LC_MESSAGES", "LANG"):
        val = os.environ.get(env_key, "")
        if not val:
            continue
        low = val.lower()
        if low.startswith(("zh", "chinese")):
            return "zh"
        if low.startswith("en"):
            return "en"
    return "en"

_LOCALE = _detect_locale()

def _t(key):
    _ZH = {
        "status_inactive": "○ 未激活",
        "status_active":   "✓ 活跃",
        "status_paused":   "⏸ 已暂停",
        "start":           "启动",
        "stop":            "停止 / 恢复",
        "pause":           "暂停",
        "resume":          "恢复",
        "switch_theme":    "切换主题",
        "no_themes":       "暂无已保存主题",
        "import_theme":    "导入主题 ZIP…",
        "open_theme_folder": "打开主题文件夹",
        "check_update":    "检查更新",
        "quit":            "退出",
        "notify_started":  "Dream Skin 已启动",
        "notify_stop":     "已恢复原始外观",
        "notify_start_fail": "启动失败",
        "notify_switch_fail": "切换失败",
        "notify_import":   "主题导入成功",
        "notify_import_fail": "导入失败",
        "notify_update":   "检查更新完成",
        "notify_icon":     "系统托盘运行中，点击图标打开菜单。",
    }
    _EN = {
        "status_inactive": "○ Inactive",
        "status_active":   "✓ Active",
        "status_paused":   "⏸ Paused",
        "start":           "Start",
        "stop":            "Stop / Restore",
        "pause":           "Pause",
        "resume":          "Resume",
        "switch_theme":    "Switch Theme",
        "no_themes":       "No themes saved",
        "import_theme":    "Import Theme ZIP…",
        "open_theme_folder": "Open Theme Folder",
        "check_update":    "Check for Updates",
        "quit":            "Quit",
        "notify_started":  "Dream Skin started successfully",
        "notify_stop":     "Original appearance restored",
        "notify_start_fail": "Start failed",
        "notify_switch_fail": "Switch failed",
        "notify_import":   "Theme imported successfully",
        "notify_import_fail": "Import failed",
        "notify_update":   "Update check complete",
        "notify_icon":     "System tray running. Click the tray icon for menu.",
    }
    d = _ZH if _LOCALE == "zh" else _EN
    return d.get(key, _EN.get(key, key))


def main():
    # Ensure state root exists
    os.makedirs(STATE_ROOT, exist_ok=True)
    os.makedirs(SCRIPTS_DIR, exist_ok=True)

    # Init notifications
    Notify.init("Codex Dream Skin")

    app = TrayApp()

    # Show a notification so the user knows the app started
    Notify.Notification.new(
        "Codex Dream Skin",
        _t("notify_icon"),
        "dialog-information"
    ).show()

    Gtk.main()


if __name__ == "__main__":
    main()
