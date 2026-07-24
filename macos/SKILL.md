---
name: codex-dream-skin-studio
description: Install, customize, launch, verify, repair, update, or restore Codex Dream Skin Studio on macOS. Use when a user wants to turn a personal image into one continuous full-window Codex wallpaper with adaptive readability layers while preserving the native interface, or needs safe CDP theme troubleshooting and rollback.
compatibility: macOS, official Codex Desktop app, signed bundled Node.js 20 or newer
---

# Codex Dream Skin Studio

This file is an optional Codex capability entry. The delivery is a complete standalone project; users do not need to install it as a Skill.

## Workflow

1. Run `Install Codex Dream Skin.command` from the complete project folder.
2. Run `Customize Codex Dream Skin.command`, choose an image in Finder, and enter a theme name.
3. To add a complete downloaded pack, use the native menu's “导入主题 ZIP…”. Accept ordinary `.zip` only. Official Studio packs contain `manifest.json`, `theme.json`, exactly one registered background, and optional registered files; the trusted local simplified format contains exactly `theme.json` and its referenced image. Import into saved themes without changing the active theme. A manually extracted complete directory may instead be moved into the saved themes folder.
4. Verify the live result with `Verify Codex Dream Skin.command`. A pass requires a visible native sidebar and composer, no horizontal overflow, non-interactive decoration, and—on the home route—a continuous wallpaper with live native heading, project controls, and any suggestion cards exposed by the current Codex version.
5. Restore the official appearance with `Restore Codex Dream Skin.command`.

## Guardrails

- Never modify the official `.app`, `app.asar`, or its code signature.
- Use the official Codex app's signed Node.js runtime only after validating its signature, Team ID, architecture, and minimum version.
- Bind CDP to loopback, verify that the listener belongs to Codex, and reject non-Codex renderer targets.
- Preserve all native cards, navigation, project selectors, task content, composer controls, and keyboard focus.
- Theme images must be UI-free wallpapers. Paint one 16:9 image continuously across the window; keep home expressive and task routes quieter. `appearance: auto` follows Codex/native or system appearance rather than image brightness.
- Theme-pack import does not support `.dreamskin`; reject traversal, links, nested archives, ambiguous roots, size/count abuse, and packs that fail the existing theme/image payload checks.
- Keep decoration at `pointer-events: none`.
- Require explicit authorization before restarting an already-running Codex instance.
- Stop an injector only when its recorded PID, executable, command line, and start time all match.

## Key resources

- `README.md`: user installation and customization guide.
- `scripts/injector.mjs`: CDP connection, injection, removal, verification, and screenshots.
- `assets/dream-skin.css`: live native interface styling.
- `assets/renderer-inject.js`: idempotent DOM integration and cleanup.
- `scripts/doctor-macos.sh`: signed-runtime, payload, and optional live-session self-check.
- `references/qa-inventory.md`: release and visual acceptance criteria.
