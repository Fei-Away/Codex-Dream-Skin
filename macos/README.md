# Codex Dream Skin Studio

Unofficial macOS theme studio for the **official Codex Desktop** app.

Turn an image you like into one continuous full-window Codex theme. The same wallpaper runs beneath the native sidebar and main surface, while route-aware translucency keeps home, task, plugin, scheduled-task, and pull-request controls fully interactive and readable.

This project injects through **local loopback CDP**. It does **not** modify the official `.app`, `app.asar`, or code signature.

> Not affiliated with OpenAI. Codex is a trademark of its respective owners.

## Requirements

- macOS
- Official Codex Desktop installed and launched at least once (`~/.codex/config.toml` exists)
- No global Node.js install required (uses Codex’s signed bundled Node after validation)

## Quick start (from this repo)

```bash
# 1) Optional checks (needs the installed Codex/ChatGPT.app bundled Node)
./tests/run-tests.sh

# 2) Install to the stable path and create Desktop launchers
./scripts/install-dream-skin-macos.sh --no-launch

# 3) Switch to the tested featured preset, or import your own pure background
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh --id preset-arina-hashimoto
# ~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh

# 4) Start/re-apply, verify, or restore via Desktop:
#    Codex Dream Skin.command
#    Codex Dream Skin - Customize.command
#    Codex Dream Skin - Verify.command
#    Codex Dream Skin - Restore.command

# 5) Optional: menu bar (SwiftBar) — apply, pause, import, and switch
./Install\ Menu\ Bar.command
# Look for 🎨 Skin in the top-right menu bar
```

Install location after step 2:

| Item | Path |
| --- | --- |
| Engine | `~/.codex/codex-dream-skin-studio` |
| State / logs / user images | `~/Library/Application Support/CodexDreamSkinStudio` |
| Theme backup | under Application Support (`theme-backup.json`) |

## Customer ZIP (optional packaging)

To build the “double-click install” folder layout for non-git users:

```bash
./scripts/build-client-release.sh "$HOME/Desktop/Codex 主题编辑器.zip"
```

That ZIP contains a visible installer plus a hidden `.codex-dream-skin-studio` engine. Do not ship only CSS/images.

## How it works (security boundary)

1. Discover `com.openai.codex` and validate signature / Team ID / arch / bundled Node.
2. Start Codex via user `launchd` with CDP bound to `127.0.0.1` only.
3. Accept the debug port only when it belongs to Codex (or a legitimate child).
4. Inject only into expected `app://` renderer targets.
5. Resolve the selected theme and image to real paths, then enforce 16 MB,
   `16384px`-per-side, and 50-megapixel limits before injection.
6. Keep a small injector alive across reloads and route changes.
7. Pause/Restore stops the injector only when PID, executable, script path, and
   start time match the recorded job; a stop failure preserves state and aborts.
8. Config backup/restore requires Codex to be closed, strict UTF-8, an operation
   lock, same-directory atomic replacement, and an unchanged-byte check.

CDP is powerful and unauthenticated on loopback. Prefer Restore when you are done theming.

## Bundled presets

A fresh install seeds two tested presets into your theme library:
**Gothic Void Crusade** and **桥本有菜 / Arina Hashimoto**. Gothic Void Crusade
is the default when no active theme exists. Switch to Arina Hashimoto with:

```bash
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh --id preset-arina-hashimoto
```

The user-provided source PNG is `1672 × 941`. Its pack contains a standardized
derived `2560 × 1440` JPEG plus theme metadata; the derived export does not add
source detail. The byte-identical source PNG is archived at
[`docs/images/presets/arina-hashimoto-source.png`](../docs/images/presets/arina-hashimoto-source.png).
The [light](../docs/images/presets/arina-hashimoto-light.jpg) and
[dark](../docs/images/presets/arina-hashimoto-dark.jpg) images are real injected
Codex screenshots for preview only — never import either screenshot as a
background. The artwork is a user-provided AI-generated example, not an
official OpenAI/Codex visual or endorsement; confirm likeness and asset rights
before redistributing it.

Seeding is idempotent. Upgrades remove only retired bundled preset IDs; your
own `custom-*` themes from “换一张图” and the currently active theme copy are
never touched.

To contribute a preset, see [`presets/README.md`](./presets/README.md).

## Image guidelines

- PNG / JPEG / HEIC / TIFF / WebP (macOS readable)
- Source ≤ 50 MB; prepared file ≤ 16 MB, ≤ 16384 px per side, and ≤ 50 MP
- `2560 × 1440` (16:9) is the recommended master size; width ≥ 2000 px minimum
- Keep roughly the left 50%–58% calm and low-contrast for native home content;
  place the subject in the right 58%–88% without touching the edge
- Use pure edge-to-edge background art only: no window chrome, sidebar, cards,
  buttons, composer, readable text, logo, or watermark
- The prompt-ready composition template and negative prompt live in
  [`docs/reference-background-prompt-guide.md`](../docs/reference-background-prompt-guide.md)

## Adaptive image themes

The renderer treats every image as a theme input instead of assuming a fixed
character palette. It downsamples the image in a local Canvas to estimate
brightness, accent color, visual focus, left/right safe area, and aspect ratio.
The pixels stay in the Codex renderer; there is no upload or external API call.
If Canvas analysis is unavailable, the theme falls back to a safe default and
the detected Codex shell/OS appearance.

Theme metadata is optional. The defaults are deliberately adaptive:

```json
{
  "appearance": "auto",
  "art": {
    "focusX": 0.72,
    "focusY": 0.45,
    "safeArea": "auto",
    "taskMode": "auto"
  }
}
```

- `appearance`: `auto`, `light`, or `dark`. `auto` follows the native
  Codex/ChatGPT or OS appearance; an explicit value wins. Image luminance
  still informs palette and composition, but never overrides the user's UI mode.
- `art.focusX` / `art.focusY`: normalized `0..1` coordinates used for
  `background-position` (left/top is `0`, right/bottom is `1`).
- `art.safeArea`: `auto`, `left`, `right`, `center`, or `none`. Automatic mode
  finds the lower-information side so native home content does not cover the
  subject. Use `none` when the artwork should fill the composition evenly.
- `art.taskMode`: `auto`, `ambient`, `banner`, or `off`. Ultra-wide art
  automatically uses a full-width task banner with a vertical fade; standard
  art uses a quieter ambient layer. `off` removes the task-page artwork while
  leaving the rest of the theme active.

The image-derived palette is used unless a theme explicitly supplies color
fields. Explicit art metadata (`focusX`, `focusY`, `safeArea`, `taskMode`) has
the same priority over automatic inference. The home route remains expressive;
task routes keep native content, cards, composer, and code readable above the
image layer.

CLI example:

```bash
~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh \
  --image "/path/to/image.png" \
  --name "My theme" \
  --accent "#7cff46" \
  --secondary "#36d7e8" \
  --highlight "#642a8c"
```

To tune composition without changing the image, pass the adaptive fields to
the image loader:

```bash
~/.codex/codex-dream-skin-studio/scripts/load-image-theme-macos.sh \
  --file "/path/to/image.png" \
  --appearance auto \
  --focus-x 0.72 --focus-y 0.45 \
  --safe-area left --task-mode banner
```

Reset to the bundled abstract demo:

```bash
~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh --reset-demo
```

## License

MIT — see `LICENSE`. Additional notices in `NOTICE.md` cover trademarks,
runtime Node, user-provided artwork, third-party rights, and assets that are not
licensed under the software license.

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
