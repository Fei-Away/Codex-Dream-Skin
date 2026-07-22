# Notices

Codex Dream Skin Studio is an **unofficial** customization project and is **not affiliated with, endorsed by, or sponsored by OpenAI**.

## Software license

The MIT License in `LICENSE` applies to the **software source code** in this repository (scripts, CSS, injectors, docs that describe the software, and the abstract demo asset generated for this repo).

It does **not** grant rights to:

- OpenAI or Codex trademarks, product names, logos, or trade dress
- Official Codex / ChatGPT application binaries, `.app` bundles, or `app.asar`
- Any user-supplied images or third-party artwork you drop into a theme
- Character likenesses, franchise art, or celebrity imagery

## Demo artwork

`assets/portal-hero.png` is original abstract geometric art generated for this open-source repository (no characters). Replace it with your own image before shipping a branded theme to customers.

## Gothic Void Crusade

`presets/preset-gothic-void-crusade/background.jpg` was created and contributed
by [seansong-ideogram](https://github.com/seansong-ideogram) through pull request
[#134](https://github.com/Fei-Away/Codex-Dream-Skin/pull/134) for inclusion in
this MIT-licensed project. It is the redistributable default artwork included in
the public macOS and Windows installers. Its name and artwork do not imply
OpenAI/Codex affiliation or endorsement.

## Caishen Readable generated artwork

The following generated files are included as public-safe theme preset artwork:

- `presets/preset-caishen-readable/background.jpg`
- `../windows/presets/preset-caishen-readable/background.jpg`

They contain original generated Caishen-themed workspace art for a readable Codex skin preset. They are not official OpenAI/Codex artwork and contain no private Codex screenshots, task names, chats, file paths, or recognizable real person. Downstream branded or commercial redistribution should still perform its own rights review.

## Arina Hashimoto reference material

The following user/maintainer-supplied files are excluded from the MIT software license:

- `presets/preset-arina-hashimoto/background.jpg`
- `../windows/assets/dream-reference.jpg`
- `../docs/images/presets/arina-hashimoto-source.png`
- `../docs/images/presets/arina-hashimoto-light.jpg`
- `../docs/images/presets/arina-hashimoto-dark.jpg`

They are included in the source repository at the maintainer's direction as a
local reference preset, source archive, and real runtime previews. They are
excluded from the public v1.3+ DMG and Setup.exe assets. They are not official
OpenAI/Codex artwork. The preset name is a maintainer label and does not imply
the named person's participation, approval, or endorsement. Their repository
inclusion does not certify or grant third-party likeness, model-output, or
redistribution rights. Downstream redistribution and commercial use require an
independent rights review; the two runtime screenshots are documentation
previews and must never be imported as wallpapers.

## Runtime

- The macOS package does not redistribute Node.js. It validates and uses the
  Node.js executable already signed and bundled inside the user's official
  Codex desktop application.
- The Windows Setup.exe redistributes only `node.exe` and `LICENSE` from the
  pinned official Node.js v22.23.1 win-x64 archive after verifying its published
  SHA-256. Node.js is distributed under its own license; that license is kept
  beside the bundled executable in `runtime/node/LICENSE`.

## Inno Setup Simplified Chinese messages

The Windows installer is compiled with Inno Setup. Its Simplified Chinese
messages file is vendored unchanged from the official Inno Setup source tag
`is-6_7_1` at
`windows/installer/languages/ChineseSimplified.isl`, maintained by Zhenghan
Yang and distributed under the Inno Setup License. The full license is retained
at `windows/installer/languages/Inno-Setup-License.txt`.

## Security model

Themes are applied through Chromium DevTools Protocol on **loopback only**. While a themed session is running, treat the local debugging port as sensitive: do not run untrusted local software that could attach to it. Use the Restore launcher to tear down the themed session and debugging port.
