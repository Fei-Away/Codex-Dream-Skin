# Notices

Codex Dream Skin Studio is an **unofficial** customization project and is **not affiliated with, endorsed by, or sponsored by OpenAI**.

## Software license

The MIT License in `LICENSE` applies to the **software source code** in this repository (scripts, CSS, injectors, docs that describe the software, and the abstract demo asset generated for this repo).

It does **not** grant rights to:

- OpenAI or Codex trademarks, product names, logos, or trade dress
- Official Codex / ChatGPT application binaries, `.app` bundles, or `app.asar`
- Any user-supplied images or third-party artwork you drop into a theme
- Character likenesses, franchise art, or celebrity imagery

## Bundled artwork

`assets/portal-hero.png` is original abstract geometric art generated for this open-source repository (no characters). Replace it with your own image before shipping a branded theme to customers.

The backgrounds under `presets/` are newly generated environment concept art created for this repository. They do not contain copied film frames, posters, character art, or official studio assets. Their film titles are used only to describe unofficial fan-theme inspiration. Studio Ghibli, Hayao Miyazaki, Makoto Shinkai, the named films, their characters, and related marks and copyrights belong to their respective rights holders; no endorsement or affiliation is implied.

To the extent the project maintainers hold rights in the generated preset backgrounds, those rights are offered under the repository's MIT License. That license does not grant rights in any third-party title, character, trademark, or underlying work. See `references/asset-provenance.md` for hashes and generation records.

## Runtime

This project does not redistribute Node.js. At runtime it validates and uses the Node.js executable already signed and bundled inside the user's official Codex desktop application.

## Security model

Themes are applied through Chromium DevTools Protocol on **loopback only**. While a themed session is running, treat the local debugging port as sensitive: do not run untrusted local software that could attach to it. Use the Restore launcher to tear down the themed session and debugging port.
