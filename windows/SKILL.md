---
name: codex-dream-skin
description: Apply, launch, verify, repair, update, or restore a full decorative skin for the Windows Codex desktop app. Use when the user asks for a Codex theme that goes beyond official color settings, wants the pink-purple Dream/Fiona-style interface, needs the skin reapplied after a Codex update, or needs a safe rollback without modifying WindowsApps or app.asar.
---

# Codex Dream Skin

Apply a reversible renderer skin through Chromium DevTools Protocol while launching the official Store-installed Codex executable. Never replace or take ownership of files under `WindowsApps`.

## Workflow

1. Install Node.js 22 or newer, close Codex, then run `scripts/install-dream-skin.ps1` once. The installer preserves the user's native appearance settings, seeds the Arina Hashimoto theme, copies the runtime to `%LOCALAPPDATA%\CodexDreamSkin\engine`, and creates launch/restore/tray shortcuts that do not depend on the source checkout.
2. Use the `Codex Dream Skin` shortcut, or run `%LOCALAPPDATA%\CodexDreamSkin\engine\scripts\start-dream-skin.ps1`. The shortcut asks before restarting an already-open Codex app; CLI callers must explicitly add `-RestartExisting`.
3. Run `scripts/verify-dream-skin.ps1 -ScreenshotPath <absolute-path>` after launch. Treat a missing continuous wallpaper, home shell, native composer, sidebar layer, or injection marker as failure. The native suggestion count is responsive and may be two to four.
4. Inspect the screenshot against `references/qa-inventory.md`. Verify both the home screen and a normal task before signing off.
5. Run `scripts/restore-dream-skin.ps1` to remove the live skin, close the saved CDP session, and reopen Codex normally. Add `-RestoreBaseTheme` to restore only saved appearance keys, `-RecoverConfigBackup` for explicit byte-for-byte recovery of a damaged config, or `-Uninstall` to delete shortcuts. A completed config restore archives that install's backup so a later install captures a fresh baseline.

## Guardrails

- Preserve the official executable, package signature, user threads, pets, plugins, and authentication state.
- Theme images must be UI-free wallpapers. Never import a README screenshot, fake window, sidebar, card, composer, logo, or text baked into the bitmap.
- Paint one continuous 16:9 wallpaper across the full Codex window. Let the sidebar, main area, header, and composer act as coordinated readability layers; keep the home route expressive and task routes quieter.
- `appearance: auto` follows the native computed `color-scheme` first and the system appearance only as a fallback. Image brightness may tune color and composition, but must not flip the user's shell mode; explicit `light` and `dark` remain authoritative.
- Attach the "选择项目" treatment to Codex's real project-selector toolbar and keep the current project button clickable; never draw a disconnected replacement.
- Keep decorative layers `pointer-events: none` and keep real buttons, navigation, and composer above them.
- On app updates, rerun install and launch; the scripts discover the current Appx package dynamically. Saved paths are never trusted for process control unless they still match a registered package identity.
- The default launcher scans for a free port when `9335` is occupied. An explicitly requested occupied port fails closed.
- Keep the injection daemon running for navigation/reload resilience. Its state and logs live under `%LOCALAPPDATA%\CodexDreamSkin`.
- The watcher registers a generation-checked early payload for connected renderers so reload/navigation can paint the skin before the normal load-event fallback; unsupported CDP targets fall back safely.
- The active theme, saved themes, imported images, pause marker, and tray controls live under `%LOCALAPPDATA%\CodexDreamSkin`. Reject empty or over-16 MB images before copying or encoding them.
- Every managed-store write rejects junctions and other reparse points in every existing path component. Imports also use the bundled Node metadata parser before copying to reject dimensions above 16384px or 50MP.
- CDP targets must use a same-port loopback WebSocket, belong to the current Store package, retain the launch-time Browser ID, and expose expected Codex renderer markers.
- Loopback prevents LAN exposure, but Chromium CDP has no same-user authentication. Run only trusted local software while the skin is active, and use restore to close the debug session when it is no longer needed.
- Preserve `config.toml` as strict UTF-8. Never use encoding-dependent whole-file PowerShell reads/writes, silently transcode UTF-16, or overwrite a file that changed after it was read. Ambiguous TOML shapes must fail before writing rather than receive a best-effort rewrite.
- Keep install/start/restore/verify serialized with the per-user operation lock in `common-windows.ps1`.
- Treat `%LOCALAPPDATA%\CodexDreamSkin\engine` as an installer-managed runtime. Exit the Dream Skin tray before reinstalling so the installer can replace that runtime atomically and update every shortcut to the same copy.

## Checks

```powershell
powershell -NoProfile -File tests\run-tests.ps1
node --check scripts\injector.mjs
node --check assets\renderer-inject.js
```

## Resources

- `scripts/injector.mjs`: CDP connection, renderer injection, verification, screenshot, and removal.
- `scripts/common-windows.ps1`: Store-package discovery, Node validation, managed runtime installation, port ownership, state, and process identity safety.
- `scripts/config-utf8.ps1`: atomic UTF-8 configuration backup, selective restore, and explicit recovery.
- `assets/dream-skin.css`: full visual layer.
- `assets/renderer-inject.js`: idempotent DOM integration and cleanup.
- `assets/dream-reference.jpg`: pure 2560 × 1440 Arina Hashimoto wallpaper seeded as the default and as a saved theme; it contains no Codex UI.
- `assets/theme.json`: shared adaptive theme contract for the seeded preset.
- `scripts/theme-windows.ps1`: persistent active/saved theme store, safe image import, pause state, and preset seeding.
- `scripts/tray-dream-skin.ps1`: Windows Forms tray for apply, pause, import, save, switch, and complete restore.
- `references/qa-inventory.md`: required functional and visual signoff coverage.
- `references/runtime-notes.md`: troubleshooting and update behavior.
- `tests/run-tests.ps1`: managed runtime, configuration, state, recovery, payload, and CDP validation regression checks. Use `-EngineOnly` for the source-independence contract.
