# Notices

Codex Miku Stage is a Windows-focused derivative of Codex Dream Skin:

- Upstream repository: https://github.com/Fei-Away/Codex-Dream-Skin
- Upstream base commit: d985269db99d30fd39b42aaba392aeff670b5d3a
- Reused portion: loopback CDP target discovery, Runtime.evaluate injection lifecycle, reload watcher, screenshot verification, and reversible launcher/restore structure.
- Rebuilt portion: Windows theme manifest, 14-component CSS system, renderer DOM integration, Miku artwork, installer, restore flow, tests, documentation, naming, and safety checks.

The source code is distributed under the MIT License in LICENSE.

This is not an OpenAI product. Codex, ChatGPT, and related marks belong to their respective owners. Hatsune Miku and related character rights belong to their respective rights holders. The included generated fan-art asset is intended for the user's private local theme. Public redistribution or commercial use requires an independent rights review.

The skin uses a local Chromium DevTools Protocol debugging endpoint. CDP grants powerful renderer control; use it only on loopback and do not run untrusted local software while the skin is active.
