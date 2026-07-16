---
name: codex-dream-skin
description: Apply, switch, launch, verify, repair, update, or restore the Dongge three-theme pack for the Windows Codex desktop app.
---

# Codex Dream Skin

Apply a reversible renderer skin through Chromium DevTools Protocol while launching the official Store-installed Codex executable. Never replace or take ownership of files under `WindowsApps`.

## Workflow

1. Run `scripts/install-dream-skin.ps1` once to choose the default Dongge image, install the themes, and create the `栋哥 Codex` launch/restore shortcuts. For unattended install, pass `-ThemeId dongge-blueprint`.
2. Reopen through the `栋哥 Codex` shortcut so the CDP port and injector start together.
3. Switch with `scripts/switch-theme.ps1 -Id dongge-marginalia|dongge-blueprint|dongge-placard|dongge-light`.
4. Run `scripts/verify-dream-skin.ps1 -ScreenshotPath <absolute-path>` after launch. Treat a missing hero, native composer, sidebar skin, or injection marker as failure. The native suggestion count is responsive and may be two to four.
5. Inspect the screenshot against `references/qa-inventory.md`. Verify both the home screen and a normal task before signing off.
6. Run `scripts/restore-dream-skin.ps1` for live removal. Add `-Uninstall` to delete shortcuts; add `-RestoreBaseTheme` when the user also wants the pre-install config backup restored.

## Guardrails

- Preserve the official executable, package signature, user threads, pets, plugins, and authentication state.
- Do not use the full reference screenshot as a fake whole-window overlay. The Dongge image is only the live home hero background; all controls remain native Codex controls.
- Keep the reference image confined to the top banner. Keep the cards below it as native Codex suggestion buttons with native labels/icons.
- Attach the "选择项目" treatment to Codex's real project-selector toolbar and keep the current project button clickable; never draw a disconnected replacement.
- Keep decorative layers `pointer-events: none` and keep real buttons, navigation, and composer above them.
- On app updates, rerun install and launch; the scripts discover the current Appx package dynamically.
- If port `9335` is occupied, choose another port consistently for start, verify, and restore.
- Keep the injection daemon running for navigation/reload resilience. Its state and logs live under `%LOCALAPPDATA%\CodexDreamSkin`.

## Resources

- `scripts/injector.mjs`: CDP connection, renderer injection, verification, screenshot, and removal.
- `assets/dream-skin.css`: full visual layer.
- `assets/renderer-inject.js`: idempotent DOM integration and cleanup.
- `themes/`: the three new 3:1 Dongge themes plus the classic compatibility preset.
- `references/qa-inventory.md`: required functional and visual signoff coverage.
- `references/runtime-notes.md`: troubleshooting and update behavior.
