---
name: codex-dream-skin-linux
description: Install, customize, launch, verify, repair, update, or restore Codex Dream Skin on Linux. Use when a user wants to theme the official ChatGPT/Codex Linux desktop app with adaptive CSS backgrounds and colors while preserving the native interface.
compatibility: Linux, official ChatGPT Linux app (chatgpt package ≥ 26.700), bundled Node.js 20+
---

# Codex Dream Skin — Linux

This file is an optional Codex capability entry. The delivery is a complete standalone project; users do not need to install it as a Skill.

## Workflow

1. Install from repo: `bash linux/scripts/install-dream-skin-linux.sh` or from `.deb`: `sudo dpkg -i codex-dream-skin-vX.Y.Z-linux.deb`.
2. Launch the tray app: `dream-skin-tray &` or via desktop autostart.
3. To customize, use the tray menu → "Import Theme ZIP…" (accepts ordinary `.zip` only) or right-click tray → "Switch Theme".
4. Verify the result: `dream-skin verify`. A pass requires a visible native sidebar and composer, no horizontal overflow, non-interactive decoration, and a continuous wallpaper with live native heading.
5. Restore original appearance: `dream-skin stop`.

## Guardrails

- Never modify the official `ChatGPT` binary, `app.asar`, or its file permissions.
- Use the bundled Node.js from `/usr/lib/chatgpt/resources/cua_node/bin/node` after verifying it exists and is executable.
- Bind CDP to `127.0.0.1` loopback only; reject non-loopback endpoints.
- Preserve all native cards, navigation, project selectors, task content, composer controls, and keyboard focus.
- Theme-pack import accepts only ordinary `.zip`; reject traversal, links, nested archives, ambiguous roots, size/count abuse, and packs that fail theme/image checks.
- Keep decoration at `pointer-events: none`.
- Require explicit authorization before restarting an already-running Codex instance.
- Stop the injector only when its recorded PID and command line match.
