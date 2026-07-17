# Codex Dream Skin Studio

Unofficial macOS theme studio for the **official Codex Desktop** app.

Turn an image you like into a Codex theme: a dedicated home banner, a low-noise task background, and frosted content layers — while **keeping native sidebar, suggestion cards, project picker, task content, menus, and composer** fully interactive.

This project injects through **local loopback CDP**. It does **not** modify the official `.app`, `app.asar`, or code signature.

> Not affiliated with OpenAI. Codex is a trademark of its respective owners.

## Requirements

- macOS
- Official Codex Desktop installed and launched at least once (`~/.codex/config.toml` exists)
- No global Node.js install required (uses Codex’s signed bundled Node after validation)

## Quick start (from this repo)

```bash
# 1) Optional static checks (needs Codex.app present for bundled Node path)
./tests/run-tests.sh

# 2) Install to the stable path, create Desktop launchers, and enable macOS auto-load
./scripts/install-dream-skin-macos.sh --no-launch

# 3) Customize with your image (Finder picker if you omit flags)
~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh

# 4) Start / re-apply, verify, or restore via Desktop:
#    Codex Dream Skin.command
#    Codex Dream Skin - Customize.command
#    Codex Dream Skin - Verify.command
#    Codex Dream Skin - Restore.command
#    Codex Dream Skin - Enable Auto Load.command
#    Codex Dream Skin - Disable Auto Load.command
#    Codex Dream Skin - Auto Load Status.command
#    Codex Dream Skin - Theme Studio.command

# 5) Optional: menu bar (SwiftBar) — apply / pause / change image
./Install\ Menu\ Bar.command
# Look for 🎨 Skin in the top-right menu bar
```

Install location after step 2:

| Item | Path |
| --- | --- |
| Engine | `~/.codex/codex-dream-skin-studio` |
| State / logs / user images | `~/Library/Application Support/CodexDreamSkinStudio` |
| Theme backup | under Application Support (`theme-backup.json`) |

Automatic loading is enabled by default. It registers the per-user LaunchAgent
`com.openai.codex-dream-skin-studio.autoload`, starts the official Codex with a
loopback CDP port, and keeps the injector attached after Codex exits or its
renderer reloads. Use `--no-auto-load` during installation to keep manual mode.

The injector also watches the installed theme configuration, background image,
CSS, and renderer script. When any of them changes, it reloads the newest
payload into the current Codex renderer automatically. A partially written
theme is ignored until the next valid update; Codex itself does not need to
restart.

CLI controls:

```bash
~/.codex/codex-dream-skin-studio/scripts/autoload-dream-skin-macos.sh enable
~/.codex/codex-dream-skin-studio/scripts/autoload-dream-skin-macos.sh disable
~/.codex/codex-dream-skin-studio/scripts/autoload-dream-skin-macos.sh status
```

`pause` and `restore` disable the auto-load supervisor before removing the
theme. If Codex is already running without a verified CDP endpoint when auto
load is enabled, the tool asks for one explicit restart confirmation.

Theme Studio provides a local browser interface for changing the background,
appearance mode, theme copy, accent colors, and auto-load state. Open it from
`Codex Dream Skin - Theme Studio.command`; the service binds to `127.0.0.1`
only and uses the existing signed Codex Node runtime.

The installer also seeds bundled theme packs into the user theme library. To
switch to the included pastel Miku theme:

```bash
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh --id miku-dream
```

Existing user themes with the same ID are never overwritten during install.

## Customer ZIP (optional packaging)

To build the “double-click install” folder layout for non-git users:

```bash
./scripts/build-client-release.sh "$HOME/Desktop/Codex 主题编辑器.zip"
```

That ZIP contains a visible installer plus a hidden `.codex-dream-skin-studio` engine. Do not ship only CSS/images.

## How it works (security boundary)

1. Discover `com.openai.codex` and validate signature / Team ID / arch / bundled Node.
2. Start Codex via a per-user LaunchAgent with CDP bound to `127.0.0.1` only.
3. Accept the debug port only when it belongs to Codex (or a legitimate child).
4. Inject only into expected `app://` renderer targets.
5. Keep a small injector alive across reloads and route changes.
6. Restore stops the injector only when PID, path, and start time match the recorded job.

CDP is powerful and unauthenticated on loopback. Prefer Restore when you are done theming.

## Image guidelines

- PNG / JPEG / HEIC / TIFF / WebP (macOS readable)
- Source ≤ 50 MB; prepared file ≤ 16 MB
- Wide images work best (width ≥ 2000 px recommended)
- Keep the left side relatively calm for native home titles
- Image is banner + background only — never a full-window fake UI overlay

CLI example:

```bash
~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh \
  --image "/path/to/image.png" \
  --name "My theme" \
  --accent "#7cff46" \
  --secondary "#36d7e8" \
  --highlight "#642a8c"
```

Reset to the bundled abstract demo:

```bash
~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh --reset-demo
```

## License

MIT — see `LICENSE`. Additional notices in `NOTICE.md` (trademarks, demo asset, runtime Node).

## Sponsors

Thanks to **[passion8.cc](https://passion8.cc/register?aff=TuPe)** for sponsoring this project.

<p align="center">
  <a href="https://passion8.cc/register?aff=TuPe">
    <img src="../docs/images/sponsor-passion8.png" alt="Passion8" height="96">
  </a>
</p>

<p align="center">
  <a href="https://passion8.cc/register?aff=TuPe"><strong>Passion8｜感谢 passion8.cc 赞助本项目</strong></a><br>
  AI API 中转站，支持 Codex / Claude Code / Grok 等工具接入。主题与 API 配置互相独立。
</p>

## What this is not

- Not an OpenAI product and not a fork of Codex source
- Not a way to patch or rebrand the official binary
- Not a Windows build (see `../windows/`)
- Not an API proxy: theming does not change model providers or API keys

If you use a third-party API relay, configure it separately — keep theme install and API config as two explicit steps.
