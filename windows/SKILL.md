---
name: codex-miku-stage
description: Use this skill to install, launch, verify, repair, or restore the reversible Windows Codex Miku Stage skin while preserving the official Store package and native controls.
---

# Codex Miku Stage

Apply the 14-component Miku Stage visual system through loopback Chromium DevTools Protocol (CDP). The skin decorates live Codex DOM; it never replaces the window with a screenshot and never edits WindowsApps, app.asar, signatures, user tasks, plugins, pets, or authentication data.

## Workflow

1. Run scripts/install-miku-skin.ps1 to copy the runtime into %LOCALAPPDATA%\CodexMikuSkin\engine and create safe shortcuts. If config.toml exists the installer may preserve one read-only backup, but it must not change Codex Appearance, code-theme, or Diff settings. Add -EnableAutoHook only when the user wants ordinary future Codex launches intercepted and restarted once with CDP.
2. Close an already-running Codex window, then run scripts/start-miku-skin.ps1. The launcher must activate the current Store package by its manifest AUMID through `IApplicationActivationManager`; never execute the WindowsApps binary directly. Use -RestartExisting only after explicit authorization.
3. Run scripts/verify-miku-skin.ps1 -ScreenshotPath <absolute-path> and inspect references/qa-inventory.md for the relevant routes.
4. Run scripts/restore-miku-skin.ps1 for current-session live removal. It pauses reinjection for the current official Codex process and resumes the Hook after that process exits. Add -DisableAutoHook only for explicit permanent Hook removal, -RestoreBaseTheme only to recover from an older build that changed appearance keys, or -Uninstall to remove the installed engine and shortcuts. Never combine -Uninstall or -DisableAutoHook with -KeepAutoHook.

## Required checks

- Treat failure of tests/test-windows-skin.ps1 as a release blocker.
- Keep CDP on 127.0.0.1; if the selected port is occupied, stop and choose another port.
- Keep the auto hook user-level and limited; never use IFEO, admin elevation, package mutation, or binary interception.
- Keep all decorative layers pointer-events: none.
- Verify real sidebar, composer, menus, Diff, terminal, and utility panels remain readable and interactive.
- After Codex updates, rerun install, launch, static tests, and route-level screenshot QA.

Read references/runtime-notes.md only for CDP lifecycle, security, and troubleshooting. Read references/component-matrix.md only when changing component coverage or visual semantics.
