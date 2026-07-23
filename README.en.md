# Codex Dream Skin

<p align="center">
  <a href="./README.md">中文</a> · <strong>English</strong>
</p>

<p align="center">
  <strong>Give Codex a face that breathes.</strong><br>
  External themes for the Codex desktop app · Local CDP inject · No official package mutation
</p>

<p align="center">
  One image, one mood · Code with atmosphere
</p>

<p align="center">
  Unofficial. Does not modify <code>.app</code> / <code>app.asar</code> / WindowsApps.
</p>

## Install directly

Ordinary users first install and quit the official Codex / ChatGPT app once,
then download from [GitHub Releases](https://github.com/Fei-Away/Codex-Dream-Skin/releases):

- macOS: open `CodexDreamSkin-vX.Y.Z.dmg` and drag the app to Applications.
- Windows: run `CodexDreamSkin-Setup-vX.Y.Z.exe` and follow the wizard.

No source checkout, Node.js install, `.sh`, or `.ps1` command is required. See
the [macOS guide](./docs/install-macos.md) or
[Windows guide](./docs/install-windows.md) for unsigned first-run approval,
updates, and uninstall steps.

## Sponsors

<p align="center">
  <a href="https://passion8.cc/register?aff=TuPe">
    <img src="docs/images/sponsor-passion8.png" alt="Passion8" height="72">
  </a>
</p>

<p align="center">
  <strong>Smarter Connections · Passionate Creation</strong><br>
  <sub>Connect AI · Power Creation</sub>
</p>

<p align="center">
  Thanks to <a href="https://passion8.cc/register?aff=TuPe"><strong>passion8.cc</strong></a> for sponsoring this project.<br>
  Full-power AI gateway: official models, no silent downgrades, no wrapper shells.<br>
  One-line setup for Codex / Claude Code / Grok.
</p>

<p align="center">
  <sub>
    Theme install and API config stay separate — this project never rewrites your provider settings.
  </sub>
</p>

## Tested featured presets

### Gothic Void Crusade / 哥特虚空远征

**Special thanks to [@seansong-ideogram](https://github.com/seansong-ideogram) for designing and contributing this striking, atmospheric original gothic science-fiction work to the community.** It leads the tested featured presets and is the default theme for fresh macOS installs.

<p align="center">
  <img src="docs/images/presets/gothic-void-crusade-preview.jpg" alt="Gothic Void Crusade theme running in Codex" width="900"><br>
  <sub>Real injected Codex home screen (preview only)</sub>
</p>

After installing on macOS, switch directly from **Saved Themes** in the menu bar.

### Sky Garden Duo / 天空花园双姝 (macOS)

This is a complete character UI theme rather than a wallpaper-only preset. It
adds a sidebar theme card, character navigation mascots, a foreground companion
pair, a reclining top companion, blink and leg motion, flowing light, and
falling petals. Decorations never receive pointer events and are removed on a
hot theme switch or pause without restarting Codex.

<p align="center">
  <img src="docs/images/presets/sky-garden-duo-home.jpg" alt="Sky Garden Duo running on the real Codex new-task page" width="900"><br>
  <sub>New-task page · real injected Codex screenshot; account name redacted (preview only)</sub>
</p>

<p align="center">
  <img src="docs/images/presets/sky-garden-duo-task.jpg" alt="Sky Garden Duo running on a regular Codex task page" width="900"><br>
  <sub>Regular task page · real injected Codex screenshot; account name redacted (preview only)</sub>
</p>

```bash
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh \
  --id preset-sky-garden-duo
```

The character pack is enabled only for the fixed bundled preset id. Imported
user themes keep the existing `theme.json + background.*` format and cannot
load arbitrary CSS or JavaScript.

### Arina Hashimoto / 桥本有菜

“Arina Hashimoto / 桥本有菜” has been verified on the real Codex home screen in
both light and dark appearances. The user-provided source PNG is `1672 × 941`;
the preset's `2560 × 1440` JPEG is a standardized derived export that preserves
the source's near-16:9 composition and does not add source detail. The sidebar,
cards, project picker, and composer
shown below are native Codex controls.

<p align="center">
  <img src="docs/images/presets/arina-hashimoto-light.jpg" alt="Arina Hashimoto theme tested in light appearance" width="900"><br>
  <sub>Light · real injected screenshot; unsent input hidden during capture (preview only)</sub>
</p>

<p align="center">
  <img src="docs/images/presets/arina-hashimoto-dark.jpg" alt="Arina Hashimoto theme tested in dark appearance" width="900"><br>
  <sub>Dark · real injected screenshot; unsent input hidden during capture (preview only)</sub>
</p>

This portrait material remains in the source repository for reference and
rights review; it is excluded from public DMG and Setup.exe assets. Public
installers seed only the redistributable Gothic Void Crusade preset. Users can
still choose **Change Background** to import UI-free artwork they are entitled
to use and save it for one-click switching.

> The downloadable user source is [`docs/images/presets/arina-hashimoto-source.png`](./docs/images/presets/arina-hashimoto-source.png) (`1672 × 941`); the source-only reference preset uses the normalized derived [`background.jpg`](./macos/presets/preset-arina-hashimoto/background.jpg) (`2560 × 1440`). Do not import either screenshot above: they contain real UI and are previews only. The background is a user-provided AI-generated example, not an official OpenAI/Codex visual or endorsement; do not put it in a public installer without confirmed likeness and asset rights.

## Concept gallery (not importable backgrounds)

These eight images communicate achievable visual directions, but they are
interface mockups rather than usable theme backgrounds. Generate a UI-free
`2560 × 1440` image with the copy-ready [reference prompt guide](./docs/reference-background-prompt-guide.en.md)
before importing a similar look. See the [concept prompt breakdown](./docs/background-generation-prompts.md)
for the eight individual styles.

<p align="center">
  <img src="docs/images/gallery/skin-01.jpg" alt="Pink Custom" width="900"><br>
  <sub>Pink Custom</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-02.jpg" alt="God of Wealth" width="900"><br>
  <sub>God of Wealth</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-03.jpg" alt="Red-White Sci-Fi" width="900"><br>
  <sub>Red-White Sci-Fi</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-04.jpg" alt="Clear Custom" width="900"><br>
  <sub>Clear Custom</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-05.jpg" alt="Inspiration" width="900"><br>
  <sub>Inspiration</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-06.jpg" alt="Purple Night" width="900"><br>
  <sub>Purple Night</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-07.jpg" alt="Cyan Virtual Singer" width="900"><br>
  <sub>Cyan Virtual Singer</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-08.jpg" alt="Stage Black-Gold" width="900"><br>
  <sub>Stage Black-Gold</sub>
</p>

## What it does

- **Real UI** — Sidebar, cards, project picker, and input stay native. Not a fake full-window screenshot.
- **Continuous wallpaper** — One 16:9 image spans the full window; adaptive focus, safe-area, and route treatment keep native content readable.
- **Swappable art** — Drop in a UI-free image you like and it becomes your theme.
- **Saved themes** — Switch local themes from the macOS menu bar or Windows system tray.
- **Restorable** — One-click restore to the stock look.
- **Safer path** — Local-loopback CDP inject only. No official binary or signature changes.

## Quick start

### For users: download an installer

You do not need to clone the repository, install Node.js, or run `.sh` / `.ps1`
files. Download the latest package for your platform from
[GitHub Releases](https://github.com/Fei-Away/Codex-Dream-Skin/releases), then
follow the graphical first-run guide:

| Platform | Download | Install guide |
|------|------|----------|
| macOS | `CodexDreamSkin-vX.Y.Z.dmg` | [`docs/install-macos.md`](./docs/install-macos.md) |
| Windows | `CodexDreamSkin-Setup-vX.Y.Z.exe` | [`docs/install-windows.md`](./docs/install-windows.md) |

After installation, use the menu bar (macOS) or system tray (Windows). Updates
are manual: download the new package and install over the existing one; themes
and images are preserved. Because the public packages are unsigned, a new
download may show a one-time OS security warning; the guides explain the safe
GUI approval path.

### For developers: run from source

Platform scripts are ready — different plumbing, same goal: theme Codex.

| Platform | Dir | Entry |
|------|------|------|
| Apple Silicon / Intel Mac | [`macos/`](./macos/) | Double-click `Install Codex Dream Skin.command` |
| Windows | [`windows/`](./windows/) | `scripts/install-dream-skin.ps1` → `start-dream-skin.ps1` |

More detail:

- Mac: [`macos/README.md`](./macos/README.md)
- Windows: [`windows/README.md`](./windows/README.en.md)
- Paths: [`docs/platforms.md`](./docs/platforms.md)
- Copy-ready reference prompt guide: [`docs/reference-background-prompt-guide.en.md`](./docs/reference-background-prompt-guide.en.md)
- Eight concept prompt breakdowns: [`docs/background-generation-prompts.md`](./docs/background-generation-prompts.md)
- Project notes: [`docs/PROJECT.md`](./docs/PROJECT.md)

## Feedback & contributions

- **Issues:** Use the [issue templates](./.github/ISSUE_TEMPLATE/) (bug / feature). Blank issues are disabled. Please try Verify / Restore self-checks before filing bugs.
- **PRs:** Follow the [PR template](./.github/pull_request_template.md) — describe the change and tick the self-checks you actually ran (e.g. `macos/tests/run-tests.sh`, verify / restore).

## Safety

- CDP binds `127.0.0.1` only — avoid untrusted local processes while the theme runs.
- Does not touch the official install directory or code signature.
- **Never** rewrites API Key / Base URL; relay and theme stay separate.

## License

- See [`macos/LICENSE`](./macos/LICENSE) (MIT) and [`macos/NOTICE.md`](./macos/NOTICE.md)
- Unofficial; Codex and related rights belong to their owners.
- People / IP material in bundled presets and previews is illustrative only — clear likeness, asset, and trademark rights before commercial redistribution.

---

Star it, pick a look, and make Codex yours for today.
