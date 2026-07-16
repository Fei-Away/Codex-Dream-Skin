# Agent notes — Codex Dream Skin

Instructions for AI / human maintainers working in this repo.

## Changelog (required)

- Keep **`macos/CHANGELOG.md`** as the user-facing release notes (Chinese is fine; match existing tone).
- On any user-visible macOS change (features, UX, safety, install paths, visual shell), **update the changelog in the same PR/commit** when possible.
- Bump **`macos/VERSION`** when shipping a release-worthy set of changes:
  - **patch** `x.y.Z` — fixes, small hardening, copy
  - **minor** `x.Y.0` — new capabilities (menu bar, hot switch, auto light/dark, etc.)
  - **major** `X.0.0` — breaking install paths / security model / remove public APIs
- Prefer a new `## x.y.z — YYYY-MM-DD` section; use `## Unreleased` only if you intentionally batch before tagging.
- Write for **users**, not as a dump of commit hashes:
  - **新增 / 改进 / 修复 / 说明** (or English Added / Changed / Fixed)
  - Short bullets; link to docs paths if needed
  - Call out security-relevant behavior (CDP loopback, no asar edits, no silent API hijack)
- Do **not** replace a detailed git commit message with only “update changelog”; keep commits descriptive **and** keep CHANGELOG in sync for releases.

## Scope reminders

- External theme via **loopback CDP**; never modify official `.app` / `app.asar` / signatures.
- `docs/images/gallery/*` are **preview composites**, not pure banner assets for `theme/`.
- Pure backgrounds go through customize / `images/` / `themes/`; inject reads active `theme.json` + image.
- CSS: dark portal base + optional light shell via `data-dream-shell`; do not force `appearanceTheme=dark` on install.
- Prefer hot reapply when CDP is already up; never restart an already-running host app during QA or normal theme application.

## Windows

- When Windows gains parity features, add or extend a changelog under `windows/` (or a root CHANGELOG section) using the same user-facing style; keep platform labels clear.
