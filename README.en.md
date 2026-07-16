# Codex Miku Stage

<p align="center">
  <a href="./README.md">中文</a> · <strong>English</strong>
</p>

A reversible Hatsune Miku skin for the Windows Codex desktop app. It reuses the local CDP injection architecture from Codex Dream Skin while rebuilding the theme as fourteen independent component contracts with dark/light tokens, dedicated art, installation, restore, and verification.

![Miku Stage hero](windows/assets/miku-stage-hero.png)

## Windows quick start

    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\install-miku-skin.ps1 -EnableAutoHook

The optional user-level logon hook ignores the currently running Codex process. On future normal Codex launches it detects a process without CDP, performs one controlled restart with loopback CDP, and injects the skin. It uses a limited scheduled task, not administrator privileges, IFEO, or binary interception.

Installation does not change Codex Appearance, code-theme, or Diff settings. If `config.toml` already exists, the installer may preserve one read-only backup for compatibility with older test builds.

Static and live verification:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\test-windows-skin.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\verify-miku-skin.ps1 -ScreenshotPath C:\Temp\miku-stage.png

Live removal:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\restore-miku-skin.ps1

## Architecture and safety

The launcher starts the official Store package with a loopback-only Chromium remote-debugging endpoint. The Node injector discovers app:// renderer targets, sends CDP messages over WebSocket, uses Runtime.evaluate to install the CSS/DOM layer, listens for Page.loadEventFired to reapply it, and can use Page.captureScreenshot for verification.

CDP flags must exist at Chromium process creation time, so a Codex instance started from the stock icon cannot be attached in place; the hook must restart that new instance once.

CDP is a powerful debugging surface, not an official Codex theme API. Keep it on 127.0.0.1, avoid untrusted local software while it runs, and repeat route-level QA after Codex updates. The project never edits WindowsApps, app.asar, signatures, user tasks, plugins, pets, or authentication data.

The Miku Stage implementation is Windows-focused. The inherited macos/ directory is unchanged upstream code and does not implement this fourteen-component system.

See windows/NOTICE.md for derivation and character-rights notices and windows/LICENSE for the MIT License.
