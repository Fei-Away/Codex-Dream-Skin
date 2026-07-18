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

## Arina Hashimoto reference material

The following user/maintainer-supplied files are excluded from the MIT software license:

- `presets/preset-arina-hashimoto/background.jpg`
- `../windows/assets/dream-reference.jpg`
- `../docs/images/presets/arina-hashimoto-source.png`
- `../docs/images/presets/arina-hashimoto-light.jpg`
- `../docs/images/presets/arina-hashimoto-dark.jpg`

They are included at the maintainer's direction as a local theme preset, source archive, and real runtime previews. They are not official OpenAI/Codex artwork. The preset name is a maintainer label and does not imply the named person's participation, approval, or endorsement. Their inclusion does not certify or grant third-party likeness, model-output, or redistribution rights. Downstream redistribution and commercial use require an independent rights review; the two runtime screenshots are documentation previews and must never be imported as wallpapers.

## Runtime

This project does not redistribute Node.js. At runtime it validates and uses the Node.js executable already signed and bundled inside the user's official Codex desktop application.

## Security model

Themes are applied through Chromium DevTools Protocol on **loopback only**. While a themed session is running, treat the local debugging port as sensitive: do not run untrusted local software that could attach to it. Use the Restore launcher to tear down the themed session and debugging port.
