# External `.dreamskin` Package Implementation Plan

> Status: approved for implementation. This is the single execution plan for the external theme-package feature. Product, business, and target architecture authority remain in `docs/PRD.md`, `docs/BUSINESS.md`, and `docs/TECHNICAL.md`.

## Goal and boundaries

Let an external AI or developer produce a declarative, offline `.dreamskin` package that Dream Skin can validate, install, and optionally apply on macOS and Windows.

Included: ZIP v1 package contract, authoring tools, shared validation and import core, atomic theme-library installation, platform entry points, documentation, release packaging, and automated security fixtures.

Excluded: model APIs, URL import, a theme marketplace, arbitrary CSS or executable code, author signatures/reputation, cloud sync, and new renderer capabilities.

## Fixed public seams

- Author CLI: `node tools/theme-package.mjs validate <source-dir>`, `pack <source-dir> --output <file.dreamskin>`, and `inspect <file.dreamskin>`.
- Artifact: one local `.dreamskin` ZIP v1 file containing only the documented allowlist.
- Import core: `import <file.dreamskin> --platform <macos|windows> --dream-skin-version <semver> --dry-run`, or `--install --state-root <dir> [--replace]`, with machine-readable reports and stable error codes. `--replace` is an upper-layer confirmation result, never an automatic policy.
- Platform entry points: macOS command/menu and Windows PowerShell/tray actions call the same contract rather than maintaining independent validators.
- Runtime safety: normalized themes pass the existing platform payload/image validators before an active theme can change.

New public seams or package fields require updating the contract, fixtures, and both platform mappings before implementation.

## Module 1 — Package contract and author kit

Status: implemented and reviewed.

Scope:

- Prove the archive implementation against valid and hostile fixtures.
- Freeze the v1 manifest, portable theme model, capability matrix, limits, identity rules, and error codes.
- Implement deterministic `validate`, `pack`, and `inspect` commands without network or user-state writes.
- Publish JSON Schemas, a source example, a cross-platform golden package, and a Kimi/general-agent authoring prompt.
- Carry PR #123 payload-string hardening or an equivalent regression into this branch before accepting free external strings.

Non-goals: theme-library writes, platform UI, automatic apply.

Completion criteria:

- The valid example validates, packs reproducibly, and inspects to the same package identity.
- Invalid fixtures for unknown files, path traversal, duplicate/encrypted/link entries, limits, schema, hashes, images, compatibility, and forbidden code return stable error codes.
- Node 22 tests run in CI; tools are offline and leave no partial output on failure.
- `docs/THEME_PACKAGE.md`, Schemas, examples, prompt, and implementation agree.

QA boundary: public CLI behavior and artifact bytes only; no platform importer fallback counts as passing.

## Module 2 — Shared import core and atomic transactions

Status: implemented; shared and macOS regression gates pass locally.

Scope:

- Add bounded entry streaming, schema/hash/compatibility validation, platform normalization, and machine-readable import reports.
- Add adapter boundaries for platform archive access and managed theme stores.
- Implement dry-run, idempotency, explicit same-ID conflict decisions, staging/backup/final publication, rollback, and cleanup.
- Add `docs/VALIDATION.md` and shared golden fixtures.

Non-goals: file pickers, menus, tray UI, visual confirmation windows, launching Codex.

Completion criteria:

- Hostile archives, source-file replacement, size limits, rename/disk failures, duplicates, conflicts, and cross-platform compiler cases are mechanically tested.
- Every pre-commit failure leaves the theme library and active store byte-identical; every injected post-backup failure restores the old theme or preserves a recoverable backup.
- Dry-run never mutates the theme library and reports the same package identity on both platforms.

QA boundary: isolated temporary state roots and fault injection; do not read or modify the user's real theme library.

## Module 3 — macOS entry point and apply flow

Status: implemented; final macOS regression gate is part of this branch handoff.

Scope:

- Add a macOS CLI and SwiftBar menu action with system file selection, summary, compatibility warnings, conflict confirmation, and immediate/later apply choice.
- Connect the shared import core to the existing managed theme library and switch/injection path.
- Include the author/import runtime in macOS release artifacts and document the workflow.

Non-goals: modifying the official Codex app, a resident network service, or a separate marketplace app.

Completion criteria:

- Under an isolated home/state root, valid import, cancel, duplicate, conflict, replace, rollback, and delayed apply all pass.
- The installed release is self-contained and does not depend on a repository checkout.
- Real macOS verification covers the Codex home and task routes; package installation and live apply are reported separately.

QA boundary: automation uses isolated state; real Codex interaction happens only at the final integration gate.

## Module 4 — Windows entry point and cross-platform release

Status: implemented; native Windows PowerShell 5.1/7 CI remains the release evidence gate.

Scope:

- Add PowerShell CLI/tray import, Windows file and confirmation UI, conflict handling, managed-store installation, and immediate/later apply.
- Package the shared runtime and author documentation; update README, platform docs, changelogs, release scripts, and CI.

Non-goals: a Windows theme marketplace, Store distribution changes, or a platform-specific package format.

Completion criteria:

- The same golden package produces the same package ID, version, content hash, and contract result on macOS and Windows.
- Windows PowerShell 5.1 and 7 native suites cover import, update, apply, recovery, and release self-containment.
- Platform capability differences are explicit warnings or rejections, never silent field loss.
- Full macOS, Windows, shared Node, release, documentation-link, and payload regression suites pass.

QA boundary: macOS PowerShell parsing is not evidence of Windows behavior; final Windows acceptance requires a native runner.

## Cross-module gates

- Security: package paths never become extraction paths; executable content and arbitrary CSS are rejected even when unreferenced.
- Data safety: no package operation reads credentials, uploads data, writes Codex configuration, or mutates the official application.
- Payload: external strings containing replacement-like or shell-like characters survive exact round trips and cannot alter generated JavaScript structure.
- Documentation: implementation changes that alter a contract update `docs/PRD.md`, `docs/BUSINESS.md`, `docs/TECHNICAL.md`, or `docs/THEME_PACKAGE.md` at the owning layer.
- Review: each completed module passes scope review and repository-standard review before the next module is considered complete.

## Known external evidence gates

- Module-one hostile fixtures selected a repository-owned pure Node ZIP route; module two must still prove file-handle streaming and bounded abort behavior before platform import.
- Windows behavior is not declared complete without native PowerShell 5.1/7 evidence.
- If a third-party archive dependency is introduced, add `docs/CAPABILITIES.md` with version, license, supply-chain, and release-bundling evidence before adoption.
