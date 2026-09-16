# Codex Dream Skin — Linux Platform

> **Requires:** [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin) ≥ v1.5.18 on Linux + [ChatGPT/Linux](https://github.com/openai/chatgpt-linux) ≥ 26.700.

Adaptive theme injector for the official ChatGPT Desktop on Linux. Injects CSS into the renderer via the Chromium DevTools Protocol — does not modify the official `.app`, `app.asar`, or system binaries.

## Quick start

```bash
# Install from repo source
bash linux/scripts/install-dream-skin-linux.sh

# Start the theme injector
dream-skin start

# Or use the system tray app (recommended)
dream-skin-tray &

# Check status
dream-skin status

# Restore original appearance
dream-skin stop
```

## Package installation

A `.deb` package is available on [GitHub Releases](https://github.com/Fei-Away/Codex-Dream-Skin/releases):

```bash
sudo dpkg -i codex-dream-skin-vX.Y.Z-linux.deb
dream-skin-tray &   # or enable autostart
```

The package installs:
- `/usr/share/codex-dream-skin/` — full engine
- `/usr/local/bin/dream-skin` — CLI wrapper
- `/usr/local/bin/dream-skin-tray` — system tray application
- `/etc/xdg/autostart/codex-dream-skin-autostart.desktop` — login start
- `codex-dream-skin-injector.service` — optional systemd user service

## System requirements

| Dependency | Minimum version | Notes |
|---|---|---|
| `chatgpt` | 26.700 | Official ChatGPT Linux desktop app |
| `python3` | 3.8 | Tray application runtime |
| `libgtk-3-0` | 3.24 | Tray app UI framework |
| `libayatana-appindicator3-1` | 0.5 | System tray icon integration |
| `xdg-utils` | — | Desktop integration (`xdg-open`) |
| `curl` | — | Update check, ZIP download |

## Commands

| Command | Description |
|---|---|
| `dream-skin start` | Launch Codex with CDP, inject theme, verify |
| `dream-skin stop` | Stop injector, restore original appearance |
| `dream-skin pause` | Pause theme injection (keeps CDP open) |
| `dream-skin resume` | Resume active theme injection |
| `dream-skin status` | Show current state, port, theme, version |
| `dream-skin verify` | Run live renderer verification |
| `dream-skin-tray` | Launch system tray application |

## Theme management

```bash
# List saved themes
bash linux/scripts/theme-manager-linux.sh list

# Switch theme
bash linux/scripts/switch-theme-linux.sh <theme-id>

# Import a ZIP package
bash linux/scripts/import-theme-zip-linux.sh path/to/theme.zip

# Customize from an image
bash linux/scripts/customize-theme-linux.sh --name "My Theme" path/to/image.jpg
```

## File layout

```
~/.local/share/codex-dream-skin/
  state.json              # Current session state
  theme/                  # Active theme directory
  themes/*/               # Saved theme library
  injector.log            # Injector stdout
  injector-error.log      # Injector stderr
  operation-state.json    # Pending operation tracking

/usr/share/codex-dream-skin/
  scripts/                # Shell launcher scripts
  assets/                 # CSS, JS, validator shared assets
  presets/                # Bundled reference themes
  runtime/                # Shared Node.js modules
  tray-app/               # Python tray application
```

## Security notes

- CDP is bound to `127.0.0.1` (loopback only).
- The injected CSS passes through the same Safe CSS policy as macOS/Windows.
- No modification of `app.asar`, electron binaries, or system ACLs.
- The bundled Node.js is the official OpenAI-signed runtime from `/usr/lib/chatgpt/resources/cua_node/`.
