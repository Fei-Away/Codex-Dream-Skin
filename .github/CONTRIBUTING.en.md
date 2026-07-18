# Contributing guide

<p align="center">
  <a href="./CONTRIBUTING.md">中文</a> · <strong>English</strong>
</p>

Thanks for contributing to Codex Dream Skin. The project loads external themes into the official Codex desktop app through loopback CDP. macOS and Windows have separate install, injection, and restore paths, so choose the target platform before changing files.

## Before you start

1. Read the [project README](../README.en.md) and [platform reference](../docs/platforms.md). macOS usage is documented in [`macos/README.md`](../macos/README.md), while Windows implementation constraints live in [`windows/SKILL.md`](../windows/SKILL.md).
2. Search the [existing issues](https://github.com/Fei-Away/Codex-Dream-Skin/issues) and [open pull requests](https://github.com/Fei-Away/Codex-Dream-Skin/pulls). If an active change already touches the same files, add to that discussion or split out a smaller change with no overlap.
3. Create a branch from the latest upstream `main`. Keep each pull request focused on one problem. Do not mix a new theme, a runtime fix, and unrelated cleanup.

## Filing an issue

Use the repository's [bug or feature request forms](./ISSUE_TEMPLATE/) and search for duplicates first.

A bug report should include:

- The target platform, operating system version, and Codex installation source.
- Stable reproduction steps, plus the expected and actual results.
- Relevant logs or screenshots. Remove keys, `auth.json`, relay tokens, user-specific paths, and private conversations.
- The last known working version or commit, when you can identify it.

A feature request should explain the use case, expected behavior, alternatives considered, and whether it targets macOS, Windows, or both.

## Development and verification

Fork the repository and base your branch on the latest upstream `main`. Reuse existing scripts and platform helpers where possible. A small change should not require a new dependency.

### macOS

Run the full test suite:

```bash
(cd macos && npm test)
```

Check the environment and installation:

```bash
macos/scripts/doctor-macos.sh
```

For injection, CSS, launch, or restore changes, also run `macos/scripts/verify-dream-skin-macos.sh` and inspect both the home and normal task routes.

### Windows

Run the Windows regression suite:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\run-tests.ps1
```

For install, launch, injection, or restore changes, exercise the affected scripts and `windows/scripts/verify-dream-skin.ps1`. Include the Windows version and Codex source in the pull request.

### Documentation or repository metadata only

Review every new or changed link and command, then run:

```bash
git diff --check
```

## Change constraints

- Use two-space indentation in shell, PowerShell, JavaScript, JSON, and CSS. Keep `set -euo pipefail` in shell entry points, use ESM for Node files, and name scripts in kebab-case.
- Add tests for affected install, start, inject, verify, pause, or restore behavior. Configuration changes must cover Chinese or other non-ASCII project names and preserve unrelated TOML content.
- Read `config.toml` as strict UTF-8, write it atomically, and keep a recoverable backup. Do not rewrite it through an API that depends on the system's default encoding.
- CDP must bind only to loopback. Do not modify the official `.app`, WindowsApps, `app.asar`, code signatures, API keys, or Base URLs.
- Commit only files required by the change. Keep logs, temporary directories, build output, private screenshots, and local configuration out of the pull request.

## Opening a pull request

1. Use a `type(scope): summary` title, such as `fix(windows): preserve UTF-8 config on restore`.
2. Complete the [pull request template](./pull_request_template.md) and check only the verification you completed. If a platform check is blocked by the environment, name the specific blocker in Notes and include the available static or fixture evidence.
3. Link the issue with `Closes #123`. Visual changes need screenshots of the home and task routes with private conversations and credentials removed.
4. User-visible macOS changes should update [`macos/CHANGELOG.md`](../macos/CHANGELOG.md). Update `macos/VERSION` when the change warrants a release. User-visible Windows changes should update [`windows/CHANGELOG.md`](../windows/CHANGELOG.md).
5. Before submitting, review the diff, test output, and branch history against upstream `main`. Remove unrelated commits from the pull request.

Maintainers may ask for a smaller scope, more evidence, or resolution of overlap with another open pull request. Continue updating the original pull request instead of opening duplicates for the same change.
