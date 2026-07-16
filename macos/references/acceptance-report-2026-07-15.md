# Acceptance report — 2026-07-15

## Result

Codex Dream Skin Studio `1.0.0` passed its macOS release checks on the live Codex desktop app during the original private release validation.

- macOS architecture: `arm64`
- Codex version: `26.707.72221`
- Codex signing Team ID: `2DC432GLL2`
- Codex bundled Node.js: `v24.14.0`
- CDP endpoint: loopback port `9341`
- Official app deep signature after installation: valid
- `app.asar` modification: none

## Automated result

`tests/run-tests.sh` passed syntax, default and custom payload, exact TOML theme-setting round trip, missing-`HOME` recovery, signed runtime, and doctor checks.

Live doctor returned `pass: true`, `officialAppSignatureValid: true`, `modifiesAppAsar: false`, and `live: true`.

Live renderer verification returned `pass: true` after `Page.reload`:

- injected version `1.0.0`;
- style and decorative chrome present;
- decorative chrome `pointer-events: none`;
- native sidebar and composer visible;
- no horizontal document overflow;
- home banner visible with native suggestion cards and project selector.

## Evidence note (open-source tree)

Private release builds included CDP screenshots under `docs/screenshots/`. Those captures may contain third-party UI chrome and demo art and are **not** shipped in this public tree. Reproduce evidence on your machine:

```bash
"$HOME/Library/Application Support/CodexDreamSkinStudio/engine/scripts/verify-dream-skin-macos.sh" \
  --reload --screenshot "$HOME/Desktop/Codex Dream Skin Verification.png"
```
