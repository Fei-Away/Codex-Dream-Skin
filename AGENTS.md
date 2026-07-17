# Repository Guidelines

## Project Structure & Module Organization

- `macos/` is the primary product: shell launchers, `scripts/` runtime logic, `assets/` CSS/injection payloads, `menubar/` SwiftBar integration, and `tests/` checks.
- `windows/` contains PowerShell launch/install/restore scripts, Node CDP injection, platform assets, references, and Windows-specific tests.
- `docs/` holds platform notes, project history, promotional copy, and preview images. Files under `docs/images/gallery/` are composites, not theme backgrounds.
- `.github/` contains issue and pull-request templates. Keep platform behavior documented in `docs/platforms.md`.

## Build, Test, and Development Commands

- `cd macos && npm test`: run shell/JavaScript syntax, payload, configuration round-trip, signature, and doctor checks.
- `macos/scripts/doctor-macos.sh`: validate the installed Codex app, signed bundled Node runtime, theme payload, and optional live session.
- `macos/scripts/build-release.sh`: test and build the macOS release ZIP plus SHA-256 file.
- `macos/scripts/build-client-release.sh <output.zip>`: create the customer-facing double-click package.
- `powershell -File windows/tests/run-tests.ps1`: run Windows configuration and static regression checks.

Do not bypass failing checks. Document platform-only test blockers in the PR.

## Coding Style & Naming Conventions

Use two-space indentation in shell, PowerShell, JavaScript, JSON, and CSS. Shell entry points use `set -euo pipefail`; Node files use ESM. Follow existing kebab-case script names such as `start-dream-skin-macos.sh`. Prefer existing platform helpers over new dependencies. Keep comments short and focused on safety or non-obvious behavior.

## Testing Guidelines

Tests must cover changed install, start, inject, verify, pause, and restore behavior. For renderer or CSS changes, run live verification and inspect both home and task routes. Configuration tests must include Chinese/non-ASCII project names and prove unrelated TOML content survives install/restore. Never rewrite `config.toml` through an encoding-dependent API; require strict UTF-8, atomic writes, and a recoverable backup.

## Commit & Pull Request Guidelines

Prefer `type(scope): summary`, for example `fix(windows): preserve UTF-8 config on restore`. Complete the PR template with platform, rationale, actual test results, linked issues, and screenshots for visual changes. Do not include private chats, API keys, `auth.json`, or customer data.

## Security & Release Notes

CDP must remain loopback-only. Never modify official `.app`, WindowsApps, `app.asar`, signatures, API keys, or Base URLs. Update `macos/CHANGELOG.md` for user-visible macOS changes and bump `macos/VERSION` for release-worthy work. Maintain a clearly labeled Windows changelog as parity features and fixes ship.
