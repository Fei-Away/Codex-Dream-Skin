---
name: codex-dream-skin
description: Apply, launch, verify, repair, update, or restore a full decorative skin for the Windows Codex desktop app. Use when the user asks for a Codex theme that goes beyond official color settings, wants the pink-purple Dream/Fiona-style interface, needs the skin reapplied after a Codex update, or needs a safe rollback without modifying WindowsApps or app.asar.
---

# Codex Dream Skin

Apply a reversible renderer skin through Chromium DevTools Protocol while launching the official Store-installed Codex executable. Never replace or take ownership of files under `WindowsApps`.

## Workflow

1. Run `scripts/install-dream-skin.ps1` once to set the matching official base colors and create launch/restore/theme shortcuts. Use `-SkipBaseTheme` if the user does not want `.codex/config.toml` touched.
2. Optional: run `scripts/set-dream-theme.ps1 -ImagePath <image> -Name <name> -Accent <#hex> -Apply` to save a custom Windows theme. The interactive shortcut uses the same script with `-Interactive`.
3. Run `scripts/start-dream-skin.ps1`. Add `-RestartExisting` only when the user authorized restarting an already-open Codex app.
4. Run `scripts/verify-dream-skin.ps1 -ScreenshotPath <absolute-path>` after launch. Treat a missing hero, native composer, sidebar skin, or injection marker as failure. The native suggestion count is responsive and may be two to four.
5. Inspect the screenshot against `references/qa-inventory.md`. Verify both the home screen and a normal task before signing off.
6. Run `scripts/restore-dream-skin.ps1` for live removal. Add `-Uninstall` to delete shortcuts; add `-RestoreBaseTheme` when the user also wants the pre-install config backup restored.

## Guardrails

- Preserve the official executable, package signature, user threads, pets, plugins, and authentication state.
- Do not use the full reference screenshot as a fake whole-window overlay. It is only a cropped hero/polaroid asset; all controls remain live Codex controls.
- Keep the reference image confined to the single top banner and decorative crop. Keep the cards below it as native Codex suggestion buttons with native labels/icons.
- Attach the "选择项目" treatment to Codex's real project-selector toolbar and keep the current project button clickable; never draw a disconnected replacement.
- Keep decorative layers `pointer-events: none` and keep real buttons, navigation, and composer above them.
- On app updates, rerun install and launch; the scripts discover the current Appx package dynamically.
- If port `9335` is occupied, choose another port consistently for start, verify, and restore.
- Keep the injection daemon running for navigation/reload resilience. Its state and logs live under `%LOCALAPPDATA%\CodexDreamSkin`.

## Resources

- `scripts/injector.mjs`: CDP connection, renderer injection, theme loading, verification, screenshot, and removal.
- `scripts/set-dream-theme.ps1`: Windows theme image/text/color customization.
- `assets/dream-skin.css`: full visual layer.
- `assets/renderer-inject.js`: idempotent DOM integration and cleanup.
- `assets/theme.json`: bundled fallback theme.
- `assets/dream-reference.png`: user-provided visual reference used only in cropped decorative regions.
- `references/qa-inventory.md`: required functional and visual signoff coverage.
- `references/runtime-notes.md`: troubleshooting and update behavior.
