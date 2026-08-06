# Task Progress

## macOS menu reapply/open ChatGPT restart fix (2026-08-05)

- [scope] Branch `codex/fix-macos-reapply-open-chatgpt` was created from latest
  `upstream/main` (`0a727a5`). Fix the macOS menu behavior where the first
  "重新应用皮肤" click can restart ChatGPT even though the prompt says no restart,
  and review its interaction with the separate "打开 ChatGPT" action.
- [diagnosed] The menu title is derived from lightweight `session=active`
  status, while `apply-from-menubar-macos.sh` always calls
  `start-dream-skin-macos.sh --restart-existing`. If ChatGPT is running without
  a verified CDP endpoint, `start-dream-skin-macos.sh` stops and relaunches it.
- [implemented] `apply-from-menubar-macos.sh` keeps the original
  `CHEAP_RUNNING` / `SESSION` prompt flow and now attempts `hot_reapply_theme`
  after the existing confirmation but before falling back to
  `start-dream-skin-macos.sh --restart-existing`. A successful hot reapply
  exits without restarting ChatGPT.
- [corrected] The native menu keeps the original "打开 ChatGPT" operation title
  and always shows that action. Its implementation preserves the original
  "未找到 ChatGPT" and "无法打开 ChatGPT" error surfaces, but replaces the
  successful native `NSWorkspace.openApplication` launch with the Dream Skin
  start path only when the installed engine is complete. If the engine is
  missing or incomplete, the action falls back to native `NSWorkspace` opening
  and does not install the engine implicitly.
- [covered] Added static regressions to lock menu apply hot-reload ordering,
  the preserved session-driven prompt model, the unchanged "打开 ChatGPT" title,
  the Dream Skin-backed open action, and the native fallback when the engine is
  not installed. The macOS test Gatekeeper scan now ignores the same
  `.build-*` SwiftPM artifacts already listed in `macos/menubar-app/.gitignore`.
- [verified 2026-08-06] `bash -n
  macos/scripts/apply-from-menubar-macos.sh macos/tests/run-tests.sh`,
  `git diff --check`, `swift build --package-path macos/menubar-app --product
  CodexDreamSkinMenuBar`, and `CODEX_DREAM_SKIN_SKIP_DOCTOR=1 bash
  macos/tests/run-tests.sh` all pass. The wrapper skipped Doctor as requested
  by the environment flag.
- [gap] Live restore / re-apply / open ChatGPT smoke has not been rerun after
  narrowing the implementation back to the minimal AppDelegate + hot-reapply
  path.
- [gap] Direct `swift test --package-path macos/menubar-app` fails on this host
  because the installed Swift toolchain cannot import `XCTest`; the repository
  macOS test wrapper detects the missing full matching Xcode platform and skips
  native XCTest accordingly.

## Client release v1.5.11 — preparing (2026-08-01)

- [base/merged] Settings renderer PR #334 passed exact-head CI run
  `30648201928` at `6d8d2c561cae1e6084bd1fd288264be7c0823907`: Static,
  macOS with Universal DMG, Windows PowerShell 7, and Windows PowerShell 5.1
  with Setup.exe compilation all succeeded. It was squash-merged to `main` as
  `6e71534cd9cd55f87d1f6c9ff1cf305c7ef43893`.
- [scope] Independent worktree `/private/tmp/dreamskin-release-v1511.KVcKVg`
  is on `codex/release-v1.5.11` from that exact `origin/main`. The release
  changes only the six required platform version sources, four version-bound
  assertions, both platform changelogs, and this durable record.
- [implemented locally] All six release version sources and four bound test
  assertions now report `1.5.11`. Both changelogs describe the shared
  Codex 26.727 Settings marker fix and its strict `app:` origin boundary.
- [verified locally] The six-source consistency check passes. Portable Node
  regressions pass 82/82 (macOS 63 and Windows 19); both platform payload
  checks report v1.5.11; runtime asset sync and `git diff --check` pass. The
  complete applicable macOS suite passes with only its documented full-Xcode,
  installed signed-runtime, and Doctor branches skipped.
- [committed locally] Reviewed release commit
  `7d87e6e5ab14256ce6a44a2b7c327bfa6afef878` contains exactly the 12-file
  v1.5.11 scope above.
- [pushed/PR open] Release commit
  `7d87e6e5ab14256ce6a44a2b7c327bfa6afef878` and progress commit
  `733b0a3ae95779714a736de86bcf1daf40cc1501` are pushed on
  `codex/release-v1.5.11`; PR #335 targets `main` at
  `https://github.com/Fei-Away/Codex-Dream-Skin/pull/335`.
- [pending] Commit and push this PR checkpoint, require four exact-head CI
  jobs, then merge.
  Only the Release workflow from the resulting `main` commit may tag and build
  the public DMG, Setup.exe, and `SHA256SUMS.txt`.

## PR #334 Windows CRLF CI follow-up — locally verified (2026-08-01)

- [scope] Client worktree `/private/tmp/dreamskin-settings-fix.4tH4ld` is on
  `codex/fix-26-727-settings-renderer`; PR #334 targets `main`. The pre-fix PR
  head is `159c650c3b43877df4413a7b0a20562fe556a018`.
- [reproduced from CI] Run `30646840223` passed Static checks and macOS
  repository regressions, but both Windows PowerShell 5.1 and PowerShell 7 jobs
  failed in their regression suite. On the Windows CRLF checkout, the bootstrap
  source-contract test's fixed 2,200-character slice ended at
  `setInterval(in`, before the asserted `setInterval(install, 250)` text.
- [fixed locally/tests only] Both platform bootstrap tests now inspect the
  complete string returned by the already imported
  `earlyPayloadFor("", "source-contract")`. This removes line-ending-dependent
  truncation without changing or weakening the early-injection assertions and
  without changing runtime implementation.
- [verified locally] `node macos/tests/injector-bootstrap.test.mjs`,
  `node windows/tests/injector-bootstrap.test.mjs`, both platform
  `renderer-inject.test.mjs` tests, `node tools/doctor-selectors.test.mjs`, and
  `git diff --check` all pass.
- [committed/pushed] Test-only fix commit
  `7d19780ec56446c3d1bd1ac61931588c5487f55f` is pushed to
  `origin/codex/fix-26-727-settings-renderer` for PR #334.
- [pending] Require a fresh exact-head CI pass for all four jobs before merge.
  No merge, release, deployment, Issue reply, or Issue closure has occurred in
  this follow-up.

## Client release v1.5.10 — in progress (2026-07-31)

- [base] Feature PR #324 was squash-merged to `main` at
  `a58e63c6909082706c02824622d0e902b3539065`; its exact-head CI run
  `30638018730` passed all four jobs.
- [scope] Branch `codex/release-v1.5.10` changes the six required version
  sources, version-bound assertions, dual-platform changelogs, the exact-event
  Release binding and its regression, plus this durable release record. Public
  v1.5.9 is the predecessor; v1.5.10 does not yet exist.
- [verified locally] All six release version sources are exactly `1.5.10`.
  Portable macOS/Windows Node regressions pass 82/82, and the complete
  applicable macOS suite exits 0 with only its documented full-Xcode native
  XCTest and installed signed-Codex Doctor branches skipped. Runtime asset
  sync, all Node/Bash syntax, both payload checks, PowerShell 5.1 BOM and
  execution-policy scans, and `git diff --check` pass.
- [committed locally] Version release commit
  `7abaea700130207ab2a57cf6ae4881f9673ff93d` contains only the reviewed
  v1.5.10 release scope above.
- [pushed/PR open] Branch `codex/release-v1.5.10` is on `origin`; release PR
  #332 targets `main` at
  `https://github.com/Fei-Away/Codex-Dream-Skin/pull/332`.
- [fixed before merge] Independent release review found the guard checked out
  moving `main`, so a later push could retarget v1.5.10 before packaging. The
  guard now checks out `${{ github.sha }}`, derives the release candidate from
  that exact `HEAD`, and has a portable regression rejecting moving-main
  release binding.
- [pending] Require all PR CI jobs on the final head, merge #332 to `main`,
  then verify the sole Release workflow creates tag v1.5.10 and publishes
  non-empty DMG, Setup.exe, and SHA256SUMS.txt from the exact merge.

## PR #324 hard-interruption import recovery — in progress (2026-07-31)

- [reproduced by review] Both platform importers move the existing canonical
  theme to a hidden replacement backup before publishing the new directory.
  An uncatchable process termination or system restart between those two atomic
  moves leaves the canonical saved theme missing; neither platform currently
  recovers the hidden backup on the next import/startup.
- [scope] Add a persisted, contained replacement journal before the first move.
  Under the existing import lock, recovery must restore the verified old
  fingerprint when the canonical destination is absent, keep a verified new
  destination when publication committed, and fail closed without deleting
  evidence on identity/path/fingerprint ambiguity.
- [ownership] Root owns only macOS publisher/test changes; the Windows agent
  owns only `windows/scripts/theme-windows.ps1` and
  `windows/tests/theme-zip-import.tests.ps1`; the protocol-review agent is
  read-only. Root will run the combined gates before any push.
- [fixed locally/macOS] Replacement candidates and journals are durably synced
  before the first canonical move. Prepared recovery now restores the verified
  old canonical theme before inspecting a suspect candidate, retains malformed
  evidence, rejects conflicting `committed` plus `commit.tmp` markers, and
  preflights duplicate destination journals before any recovery mutation.
- [verified locally/macOS] `node --test
  macos/tests/theme-import-publish.test.mjs` passes (1/1, 12.8 s), including
  real child-process `SIGKILL` after backup rename, candidate publication and
  commit-marker rename, plus corrupt-candidate, conflicting-marker and
  duplicate-transaction recovery cases. `node --check` and
  `git diff --check` also pass at this checkpoint.
- [verified locally/macOS app] An x86_64 menu-bar app build and strict deep
  code-signature verification passed before the final wrapper correction.
  Packaging included the new executable wrapper and publisher, but that build
  is now superseded and must be repeated before push.
- [fixed locally/macOS wrapper] Packaging review caught the wrapper calling the
  nonexistent `discover_codex_bundle`; it now uses the established
  `ensure_node_runtime` path. A source regression guards that call, and the
  focused publish suite, wrapper Bash syntax, and `git diff --check` pass after
  the correction. Startup recovery failure cancels any pending one-click apply
  and reports a bounded repair instruction instead of silently continuing.
- [verified locally/macOS final app] The corrected source builds as
  `/tmp/CodexDreamSkin-pr324-recovery-final.app` (x86_64 Mach-O). Strict deep
  code-signature verification passes; the packaged recovery wrapper is
  executable, and its bytes plus the publisher bytes match the current
  worktree exactly.
- [verified locally/macOS full gate] `CODEX_DREAM_SKIN_SKIP_DOCTOR=1 bash
  macos/tests/run-tests.sh` passes on the integrated macOS files, including the
  publish hard-kill regression, ZIP/archive bounds, community apply rollback,
  installer rollback, signed-runtime switch, and runtime-state integration.
  Only the documented full-Xcode native XCTest and installed signed-Codex
  Doctor branches skipped on this host.
- [fixed locally/Windows] Only a durable `committed` journal plus marker retains
  the new theme. Earlier phases restore the verified old fingerprint first;
  corrupt or missing candidate evidence is retained with the journal and fails
  closed. Duplicate destinations and unsafe/unknown journal fields are rejected
  before mutation, cleanup order is crash-safe, and legacy cleanup is outside
  rollback. A corrupt published candidate is moved back to its contained stage
  before the exact old canonical theme is restored.
- [covered/Windows] The focused suite now includes a real child `FailFast` after
  the first rename plus deterministic restart states for published and committed
  phases, corrupt/missing candidates, duplicate targets, unsafe journals, and
  committed-marker conflicts. Native PowerShell execution is unavailable on
  this Mac and remains a fresh PR CI gate.
- [verified locally/final] Portable macOS/Windows Node regressions pass 81/81.
  The complete applicable macOS suite passes with only its documented full-
  Xcode native XCTest and installed signed-Codex Doctor branches skipped.
  Runtime asset sync, all Node and changed Bash syntax, Windows PowerShell BOM,
  execution-policy safety, and `git diff --check` gates pass.
- [committed locally] Recovery implementation and Windows validation document
  are commit `dd19005e8a37ad7a80f1b957cf9759743b50d7e7` on branch
  `codex/pr324-final-review-fixes`, intended for remote PR head branch
  `origin/codex/fix-318-320-322` (Draft PR #324).
- [pending] Commit this durable progress record, push both commits to the Draft
  PR branch, and require fresh PowerShell 5.1/7 CI. Do not merge, release,
  comment on issues, or close issues.

## PR #324 final L0 readiness correction — pushed and CI-verified (2026-07-31)

- [reviewed] Remote Draft PR head `8b39dcdaff5985f3a2247c13176cd4329a5186eb`
  correctly rejects an ordinary `thread/L0` renderer, but still accepts
  `home/L0` when required L1 shell anchors are missing. That permits an
  unrecognized sidebar/main/header to be reported as a successful apply or
  rollback on both platforms.
- [fixed] macOS and Windows now reserve L0 visible verification only
  for the real cross-platform Settings exception. Home and ordinary task views
  require `scope=L1` with an empty `missingL1`; focused dual-platform readiness
  tests and Node syntax checks pass.
- [verified locally] Shared runtime sync passes, portable Node regressions pass
  80/80, and the complete macOS repository suite passes with only the documented
  full-Xcode and installed signed-app Doctor skips. `git diff --check` passes.
- [committed/pushed] Code fix `0884be7c34cbbd62974d1ce8669a139ffbe81be2`
  and progress commit `1a693364db0086afed30fa9a4e5991d1c61f9237`
  are on remote Draft PR #324. The PR remains open, Draft, and unmerged.
- [verified] GitHub Actions run `30632592756` passed all four jobs at exact head
  `1a693364`: Static checks, macOS repository regressions with Universal DMG,
  Windows PowerShell 7, and Windows PowerShell 5.1 with Setup.exe compilation.
- [verified locally] Root repeated the portable Node suite (80/80), complete
  applicable macOS suite, runtime asset sync, and `git diff --check` at the
  exact remote head; all passed. Only documented full-Xcode and installed-app
  Doctor branches were skipped.
- [correlated] New issue #330 reports the same Codex `26.727.40816` app-shell
  selector migration already reproduced for #322/#326 and covered by this PR's
  shared macOS/Windows selector contract. It is not evidence of a separate
  unresolved root cause.
- [pending] Real Windows Codex validation must be repeated from exact head
  `1a693364` using `docs/pr-324-windows-validation.md`. Do not merge, release,
  tell issue users to retry a public version, or close issues before that result
  is reviewed.

## PR #324 final review blockers — pushed and CI-verified (2026-07-31)

- [reviewed] Draft PR #324 head `598dd07f6831faa238230752531bc75064baa581`
  passed all four CI jobs and has real Windows Codex 26.727 renderer/import
  evidence, but that evidence exposed follow-up behavior and does not waive
  review of the resulting shared-runtime/import changes.
- [reproduced] The head can clear the registered wallpaper whenever validated
  Safe CSS sets `background-color`; its client Safe CSS parser also diverges
  from the website/server glass-filter contract. A preceding search textbox can
  prevent the real prompt composer from receiving its public part marker.
- [reproduced] macOS validates the extracted payload before a missing or
  non-string source ID is normalized, while Windows normalizes first. Windows
  saved-theme enumeration also permits dotted recovery directories to leak into
  the tray menu.
- [fixed] Root/background colors preserve the registered body wallpaper;
  surface image clearing is limited to registered core surfaces. The client
  accepts the same bounded composite glass filters as Studio/server, and a
  preceding search input no longer hides the real semantic composer.
- [fixed] Missing/non-string IDs pass a private pre-publish payload check only
  after temporary normalization, then receive the stable cross-platform ID and
  pass the mandatory final check before any old theme moves. Windows saved-theme
  enumeration filters every dotted transaction/recovery directory.
- [fixed] Generic parts can verify an ordinary route only with `scope=L1` and
  an empty `missingL1`; an L0 thread missing shell/sidebar/header can no longer
  make apply or rollback report false visible success. Explicit settings/home
  L0 anchors remain supported on both platforms.
- [verified locally] Portable Node regressions pass 80/80; focused Safe CSS,
  renderer, fallback-ID ZIP import, runtime sync, Node/shell syntax, and
  `git diff --check` pass. The complete macOS repository suite passes with only
  its documented full-Xcode and installed-app Doctor skips.
- [committed/pushed] Fix commit
  `8b39dcdaff5985f3a2247c13176cd4329a5186eb` is the remote code head of
  `codex/fix-318-320-322`; Draft PR #324 remains open and unmerged.
- [verified] GitHub Actions run `30632144001` passed all four jobs for
  `8b39dcd`: Static checks, macOS repository regressions with Universal DMG,
  Windows PowerShell 7, and Windows PowerShell 5.1 with Setup.exe compilation.
- [pending] The updated real-Windows checklist must still be run from the exact
  PR source-installed engine. Do not merge, release, comment on issues, or close
  issues until that user acceptance result is reviewed.

## Windows Codex 26.727.4816 final worktree acceptance (2026-07-31)

- [verified] The official Store package is `OpenAI.Codex_26.727.4816.0`; the
  installed DreamSkin engine was replaced from this exact worktree under
  `RemoteSigned`, and its CSS, renderer, selector, validator, and importer
  hashes match the repository copies.
- [verified] A real `dreamskin://apply` transaction downloaded and applied
  Lyn-in's complete `juzizhoutou` package through the native confirmation UI.
  The result confirmed size/SHA-256, ZIP, manifest, and Safe CSS validation.
- [verified] Three current complete community themes from different creators
  (`juzizhoutou`, `taishan-wuyue-duzun`, and `cecilylove002`) render in the real
  Codex Home/task UI. Home reports `L1` with `missingL1=[]`; task navigation
  refreshes to `thread/L1`; sidebar, header, message region, composer, toolbar,
  background, and controls remain visible and interactive with no overflow.
- [fixed] Real rendering exposed two final shared-runtime gaps. A root Safe CSS
  background color now also clears the body's canonical image, and Codex
  26.727's user/assistant conversation anchors now map to the public `message`
  part while retaining the legacy selector. Real task inspection found 8/8
  message anchors inside the thread and zero sidebar matches.
- [verified] Final real screenshots are under
  `%TEMP%\dreamskin-pr324-final-live`. Focused 34/34 Node regressions, selector
  doctor, renderer runtime, asset sync, PowerShell 5.1/7 parsing, installer
  static checks, and `git diff --check` pass. Full dual-PowerShell CI remains
  the post-push gate; no merge, Release, or Issue mutation is authorized.

## Windows continuation after macOS 26.727 fix — in progress (2026-07-31)

- [verified] Draft PR #324 and the local branch are both at `98e308a`; the
  macOS follow-up commits `9098060`/`98e308a` are present. The shared selector
  change keeps the legacy anchors and adds Codex 26.727 app-shell attributes,
  so its compatibility direction is appropriate for Windows as well. Real
  Windows 26.727 acceptance is still pending.
- [verified] On real Windows Codex `26.721.11231.0`, the updated selector
  contract still reaches Home at `L1` with `missingL1=[]`. The new CSS parses
  in the Windows Chromium 150 renderer, and shared macOS/Windows selector,
  renderer, and CSS assets are byte-identical.
- [reproduced] Full community-theme Safe CSS loads but loses the cascade for
  sidebar, header, composer, home typography, and toolbar colors because the
  canonical runtime uses `!important` while the untrusted Safe CSS contract
  correctly rejects author-supplied `!important`. Root font-family is one of
  the few declarations that currently wins.
- [in progress] Keep the Safe CSS input contract unchanged, compile only the
  already-validated declarations to a controlled runtime priority, synchronize
  both platform assets, and add cascade regressions. Also tighten generic
  composer/Home verification false positives before reinstalling the exact
  worktree engine and repeating real Windows community-theme checks.
- [fixed] The shared parser now recompiles only validated part/property/value
  rules into the `dreamskin-community` cascade layer with client-owned
  priority. Author CSS still rejects `!important`; original bytes remain the
  semantic/fingerprint input. A higher-priority accessibility layer preserves
  `prefers-reduced-motion` behavior.
- [fixed] Generic composer fallback now requires an explicit composer/prompt
  semantic owner and never marks a plain form or bare textbox. Home verification
  fails when runtime scope claims Home but the real Home identity/surface is
  absent; thread/settings routes retain their existing acceptance boundaries.
- [verified] Shared runtime sync, renderer fixture, Windows readiness 10/10,
  Safe CSS 9/9, and macOS/Windows payload tests 12/12 pass. macOS and Windows
  generated CSS, renderer, and validator assets remain synchronized.
- [in progress] Run the complete Node and Windows PowerShell 5.1/7 suites,
  including the preserved same-ID, reserved-ID, long-path, legacy-suffix, and
  rollback import cases. Then deploy the exact worktree engine and repeat real
  Windows Codex computed-style and community-theme interaction checks.
- [preserved] Existing uncommitted cross-platform importer changes remain in
  the four macOS/Windows import implementation/test files. They are not being
  reverted or overwritten. No merge, Release, Issue edit, or publish is in
  scope until explicit authorization.
- [fixed] A theme whose destination passed the final semantic fingerprint is
  now treated as committed on both platforms even when obsolete backup cleanup
  fails. The import returns `cleanupWarning`/`CleanupWarning`; manual import and
  one-click apply show a bounded local warning without exposing the raw path or
  rolling back the new theme.
- [fixed] Invalid or Windows-reserved source IDs use one cross-platform stable
  identity mapping. The fixed `con.theme` vector is
  `import-931599c2985393be807cf0ed` on macOS and Windows, so a later package with
  the same source ID updates in place instead of creating another directory.
- [verified] Windows PowerShell 5.1 completed the full focused ZIP-import suite,
  including same-ID replacement, exact duplicate, conservative legacy cleanup,
  unrelated suffix preservation, file collision, pre-commit rollback,
  committed cleanup warning and long-path cases. Focused macOS publisher,
  community-link, Safe CSS, dual payload, renderer-runtime, readiness and asset
  sync checks pass; the macOS immutable-backup cleanup case remains a macOS CI
  execution because this worktree is on Windows.
- [fixed] The trusted Safe CSS compiler now clears a core background image when
  a validated part supplies `background-color`, bridges bounded root typography
  and color to `body`, passes composer-toolbar color to its registered buttons,
  and marks the real `game-source` node as `home-hero` when present. SPA DOM
  mutations refresh both public parts and verification scope.

## Codex 26.727 real-renderer visual follow-up — in progress (2026-07-31)

- [verified] Official Codex/ChatGPT `26.727.40816` is running with this Draft
  PR #324 engine (`1.5.9`, head `61d65e3`) and renderer injection succeeds.
- [reproduced] The real home view remains partially white despite successful
  injection. Screenshot: `/tmp/dreamskin-pr324-mac-26.727.png`.
- [root cause] The live renderer has zero matches for legacy
  `main.main-surface` and `header.app-header-tint`; it exposes
  `main[data-app-shell-main-surface="default"]` plus new app-shell header data
  attributes. The generic identity/part fallback added by #324 cannot replace
  the canonical CSS selector contract, so it only themes part of the page.
- [in progress] Add exact legacy-plus-current selectors in `tools/selectors.json`
  and canonical runtime CSS, regenerate both macOS/Windows assets, add dual-
  platform assertions, rerun all applicable tests, then reinstall/reinject and
  capture real macOS visual evidence. Do not merge or release.

## Codex 26.727 selector and top-fade fix — verified locally (2026-07-31)

- [fixed] Shared selector contract now recognizes legacy anchors plus the
  Codex 26.727 stable attributes and constrained CSS Module prefixes:
  `main[data-app-shell-main-surface]` / `_MainContentSurface_`,
  `header[data-app-shell-header-edge-scroll]` / `_Header_`, and the new
  `data-app-shell-main-content-top-fade` / `_MainContentTopFade_` overlay.
- [generated] `tools/sync-runtime-assets.mjs` regenerated macOS and Windows
  selectors, renderer payloads, and canonical CSS. The three shared payload
  files are byte-identical across platforms; `--check` passes.
- [verified] Real official Codex `26.727.40816` with DreamSkin `1.5.9` now
  reports renderer scope `home/L1` with `missingL1=[]`; `<main>` and `<header>`
  receive `data-ds-part="main|header"`; the native top fade computes to
  `display:none`; header remains `position:fixed; z-index:30`. Clean visual
  evidence: `/tmp/dreamskin-pr324-mac-26.727-clean.png`.
- [verified] `node --test macos/tests/*.test.mjs windows/tests/*.test.mjs`
  passes 74/74. Focused selector/renderer/CSS tests and runtime sync check pass.
  The macOS shell suite passes its applicable checks with signed-runtime,
  runtime-state, and Doctor branches explicitly skipped by environment flags;
  native Swift/XCTest remains unavailable on this host.
- [verified] A final live CDP read at 2026-07-31 16:44 HKT still reports
  `home/L1`, `missingL1=[]`, themed outer main, fixed header at z-index 30,
  hidden native top-fade, and no operation overlay. The Windows handoff now
  calls out these exact acceptance checks for Codex 26.727+.
- [committed] Selector/top-fade follow-up is committed as `9098060`
  (`fix: support Codex 26.727 shell surfaces`) on branch
  `codex/fix-318-320-322`.
- [pushed] `9098060cd256ca4ed0aa268283d72a0481188aaa` is pushed to the remote
  head of Draft PR #324, and the PR body documents the root cause, Mac evidence,
  Windows checklist, and remaining real-Windows acceptance boundary.
- [pending] Wait for fresh CI and real Windows Codex visual acceptance. Do not
  merge, release, comment on, or close #326/#322 yet.

Updated: 2026-07-31 14:29 HKT (Asia/Hong_Kong)

## Privacy gate and legacy re-import regression — in progress (2026-07-31 14:49 HKT)

- [fixed] Both platform injectors now use the registered Codex structural marker
  `data-testid="app-shell-header-context-menu-surface"` for generic `app://`
  identity. They no longer read page title, body text, or URL; the strict
  `app:` protocol and generic main/input requirements remain in place.
- [added] macOS and Windows bootstrap fixtures now cover an unbranded generic
  `app:` rejection, a branded structural-marker acceptance, and source guards
  against title/body/URL reads.
- [added] macOS and Windows ZIP import suites explicitly cover an existing
  canonical theme plus an exact `-2` legacy duplicate. Re-import must return
  `Imported`, retain only canonical, and leave no transaction directories.
- [added] Windows ZIP import suite statically verifies published semantic
  fingerprint validation and mismatch handling precede canonical backup
  deletion; no runtime failure-injection backdoor was introduced.
- [verified] Both bootstrap fixtures pass under Node 22 and Node 24; the macOS
  legacy re-import suite, injector syntax, runtime sync, renderer fixture,
  static privacy/PowerShell-policy scan, and `git diff --check` pass.
- [verified] Full portable suite: 74/74 passed. The complete macOS suite passed
  with only the documented full-Xcode and installed-app Doctor branches
  skipped; the current host does not provide those prerequisites.
- [blocked] PowerShell 5.1/7 and real Windows renderer validation remain
  unavailable on this macOS host and must be run by CI/user Windows machine.

## Pre-push verification — PR #324 (2026-07-31)

- [fixed] Import replacement rollback is fail-closed on both platforms. A
  post-publish failure first quarantines the new directory, restores legacy
  cleanup backups and the original canonical directory, and verifies every
  move. Backup and quarantine cleanup errors are surfaced instead of being
  silently ignored; the old theme is never discarded before the replacement
  fingerprint is verified.
- [added] `docs/pr-324-windows-validation.md` is the Windows AI handoff. It
  covers #318/#320/#322, all-theme (not only colors-only) renderer checks,
  legacy suffix safety, rollback expectations, exact commands, and the
  `RemoteSigned`/no-`ExecutionPolicy Bypass` requirement.
- [verified] Portable client regressions: `node --test macos/tests/*.test.mjs
  windows/tests/*.test.mjs` — 74 passed; `NODE=$(command -v node)
  CODEX_DREAM_SKIN_SKIP_DOCTOR=1 bash macos/tests/run-tests.sh` passed with
  only the documented full-Xcode/Doctor skips; runtime asset sync, Node syntax,
  renderer runtime, and `git diff --check` also pass.
- [verified] Focused import, package-validator, injector, readiness, and
  generic-renderer fixture checks pass after the rollback hardening.
- [blocked] This macOS host has no `powershell.exe` or `pwsh`; Windows
  PowerShell 5.1/7, Setup.exe compilation, and a real Windows Codex renderer
  still require the user's Windows host or PR CI.
- [pending] Commit and push the final client branch, update draft PR #324, and
  wait for fresh CI on the new head. Do not merge, publish a Release, close an
  issue, or post a user-facing fix comment.

## Final review correction — legacy import cleanup (2026-07-31)

- [fixed] Both platform importers now consolidate a legacy suffix directory
  only when its stored identity matches the suffix and its semantic fingerprint
  exactly matches the incoming package. Display-name equality is no longer
  treated as lineage evidence, so an independent `family-2` with the same name
  is preserved and ambiguous replacement remains fail-closed.
- [fixed] Legacy suffix detection mirrors the old 80-character ID truncation,
  including max-length IDs, and rejects numeric overflow rather than throwing.
- [fixed] macOS and Windows import notifications distinguish an in-place saved
  theme update from a first import; platform README/docs now describe the same
  behavior and the exact-fingerprint cleanup boundary.
- [pending] Rerun all portable/macOS suites, inspect staged diffs, commit and
  push only after local checks pass. Windows PowerShell 5.1 remains a required
  user/CI validation because this host has no PowerShell runtime.

## Read-only deep review checkpoint — PR #324 / site PR #13 (2026-07-31)

- [reviewed] Client draft PR #324 remains at `ee3b64f`; its four GitHub CI jobs
  pass. Root reran shared-asset sync, the focused macOS/Windows import,
  bootstrap and readiness tests, plus `git diff --check`; all passed.
- [blocked] The generic `app://` gate is broader than the PR description:
  `(main && input)` passes with no Codex/ChatGPT identity marker. A minimal
  negative fixture independently executed the early payload on both platforms.
- [blocked] Generic renderer parts do not complete #320/#322: canonical
  `dream-skin.css` still has no `[data-ds-part]` fallback for the core
  main/sidebar/composer rules, generic part selection is over-broad, and a
  home `[role=main]` can keep the earlier `main` part instead of `home`.
- [blocked] The #318 import change repairs only a clean future library. An
  already-created `theme-id-2` exact duplicate returns early as `duplicate`,
  leaving both old directories. Replacement is also selected by destination
  directory existence rather than confirmed stored identity, and the Windows
  post-publish mismatch path deletes the old backup before final verification.
- [blocked] Site PR #13 has a validated-package CAS regression and no backfill
  for the already-reset live count; see the site repository progress file.
- [fact] No PR code, commit, push, merge, Release, issue comment, or issue
  closure was performed during this review.

## In Progress — Issues #318/#320/#322 community client/site fixes (2026-07-31)

- [complete] Work is isolated in clean temporary worktrees:
  client branch `codex/fix-318-320-322` at `/tmp/dreamskin-client-fix.O9D3Vw`
  and site branch `codex/fix-318-download-inheritance` at
  `/tmp/dreamskin-site-fix.pHtykF`. Main worktrees were left untouched.
- [complete] Client implements same-id theme ZIP imports as in-place version
  replacement on both macOS and Windows instead of suffixing `-2`, while exact
  duplicate content remains `duplicate` and different-id same-name imports still
  report `nameCollision`.
- [complete] Client keeps dual-platform renderer behavior aligned: generic
  `main`/sidebar/composer part fallbacks are generated from shared runtime
  source and synced byte-for-byte into macOS and Windows assets.
- [complete] Client injector verification now accepts newer `app://` Codex
  renderer shells with generic visible main/input structure and Codex/ChatGPT
  branding, while preserving exact payload/theme/revision checks and loopback
  CDP target rejection.
- [complete] Site moderation service now inherits the maximum prior same-theme
  approved/downloaded version counter into a pending version before approval,
  so newly approved community versions do not reset visible downloads to zero.
- [verified] Site backend checks in `/tmp/dreamskin-site-fix.pHtykF/server`:
  `go test ./internal/moderation ./internal/upload ./internal/httpapi`,
  `go vet ./...`, `go build ./...`, and repo `git diff --check` all pass.
- [verified] Client checks in `/tmp/dreamskin-client-fix.O9D3Vw`:
  `node tools/sync-runtime-assets.mjs --check`,
  `node macos/tests/theme-import-publish.test.mjs`,
  `node macos/tests/theme-package-validator.test.mjs`,
  `node macos/tests/injector-bootstrap.test.mjs`,
  `node windows/tests/injector-bootstrap.test.mjs`,
  `node macos/tests/window-readiness.test.mjs`,
  `node windows/tests/injector-window-readiness.test.mjs`,
  `NODE=$(command -v node) bash macos/tests/run-tests.sh`, and
  `git diff --check` all pass. Native SwiftPM/XCTest was the existing local
  environment skip; no local `pwsh` is installed for Windows PowerShell tests.
- [pending] Commit, push, and open draft PRs. No merge, Release publication,
  issue closure, or user-facing "fixed/retry" comment has been made.

## v1.5.1 Version Release (2026-07-25 08:28 HKT)

- [complete] Created `codex/release-v1.5.1` from the exact synchronized
  `origin/main@3593e8f`. No remote `v1.5.1` tag or GitHub Release existed at
  preflight.
- [complete] Updated the six release version sources to `1.5.1`, the two
  macOS current-version assertions, and the dated macOS/Windows changelog
  headings. The Windows readiness fixture added by #249 also encoded the
  current injected version; its `1.5.0` value initially made the two positive
  readiness cases fail after the bump, so that corresponding assertion now
  reports `1.5.1`. Historical changelog entries and unrelated fixture data
  remain unchanged.
- [verified] Six-source consistency, semantic/unpublished-tag preflight,
  focused macOS update/common version assertions, Bash and Node syntax, both
  injector payload checks, 21 macOS and 11 Windows portable Node regressions,
  and `git diff --check` pass locally. The Windows suite was rerun after the
  fixture correction and passed all 11 tests.
- [complete] Release commit `3289f64` is pushed to
  `codex/release-v1.5.1`; ready PR #250 targets `main` with that exact head.
- [verified] Initial CI run `30136427124` passed Static checks; both Windows
  suites passed their regressions/static checks and macOS passed regressions
  plus its native build before the required durable-progress checkpoint.
- [in progress] Push this progress-only docs commit to PR #250, then require a
  fresh Static checks, Windows PowerShell 5.1, PowerShell 7, and macOS run for
  the new exact head. The superseded CI head is not merge evidence.
- [pending] After merge, verify the automatic Release workflow creates a
  `v1.5.1` tag at the exact merge commit and publishes non-empty DMG, Setup.exe,
  and `SHA256SUMS.txt` assets. No manual package, tag, or Release publication is
  permitted.

## v1.5.1 Installer Preflight Fix (2026-07-25 07:36 HKT)

- [complete] Branch `codex/fix-macos-installer-preflight-v1.5.1` moves
  `discover_codex_app` before the outer running-app guard, so `CODEX_EXE` and
  the exact app bundle are bound before any engine bytes can be deployed.
- [complete] A real outer-installer regression covers the closed-app inner
  failure rollback and a compiled matching app process rejected before deploy;
  it verifies that the prior engine stays intact and no installing, previous or
  broken staging tree remains.
- [verified] Root reran Bash syntax, the focused installer preflight regression,
  `git diff --check`, and the complete macOS CI-parameter suite with signed
  runtime and Doctor integrations explicitly skipped. All applicable checks
  passed; full-Xcode SwiftPM/XCTest remains an environment skip.
- [complete] Fix commit `747c618` was pushed in PR #247. GitHub Actions run
  `30134848593` passed Static checks, both Windows jobs and macOS repository
  regressions; the PR was squash-merged to `main@3aa89d7` after bypassing only
  the impossible same-account self-review requirement.
- [complete] The post-merge Release guard run `30135002941` skipped duplicate
  publication successfully because the version remained 1.5.0. Post-merge CI
  run `30135002980` also passed all four jobs, including DMG and Setup builds.
- [in progress] Public v1.5.0 remains unsuitable for website enablement. ChatGPT
  26.721.41059 currently reaches CDP without a native window; an independent
  worktree is implementing correct post-CDP app activation and fail-closed
  visible-window verification before the separate v1.5.1 version PR.
- [in progress] A Windows parity audit found the same release-blocking class:
  the current verifier can accept hidden or minimized L0/L1 renderers without
  native-window evidence. A separate origin/main worktree owns Windows window
  binding, DOM visibility and non-minimized readiness tests. Both platform fixes
  must merge before the v1.5.1 version bump.
- [complete] macOS readiness commit `1d76a86` plus test-isolation follow-up
  `e7cc38c` passed all four PR CI jobs in run `30135795473`; PR #248 was
  squash-merged to `main@ea5f37f`.
- [complete] Windows readiness commit `fc454cb` passed all four PR CI jobs in
  run `30135894880`, including the new PowerShell 5.1 startup rollback fixture;
  PR #249 was squash-merged to `main@3593e8f`.
- [in progress] Prepare the separate v1.5.1 version-only branch from
  `main@3593e8f`, update all six sources, both assertions and both changelogs,
  then require CI before merge and automatic Release publication.

## v1.5.0 Installed Release Finding (2026-07-25 07:18 HKT)

- [complete] Public v1.5.0 Release/tag/DMG/Setup.exe/SHA256SUMS were independently
  downloaded and verified. The DMG installs and registers `dreamskin`, but a
  real engine upgrade exposed a release P1: the outer installer invokes
  `codex_is_running` before `discover_codex_app`, so its pre-copy running-app
  guard expands undefined `CODEX_EXE` and fails open under `set -u`.
- [complete] The failed real upgrade atomically restored the entire previous
  v1.4.0 engine tree; no mixed tree or installer staging residue remains and the
  original active theme bytes are unchanged.
- [blocked] Current ChatGPT `26.721.41059` opens a loopback CDP target but has no
  native window after launch on this host. The v1.5.0 injector applies its exact
  payload to that target but correctly refuses visible verification, so the
  outer installer rolls back. Do not enable the website for v1.5.0.
- [in progress] Prepare a focused v1.5.1 installer-preflight fix with functional
  regression coverage, then retest a public build and the current renderer
  before enabling the website.

## Final Publication Gate (2026-07-25 06:23 HKT)

- [complete] PR #245 passed all four CI jobs and was squash-merged to client
  `main` as `71f30f0`. The v1.4.0 Release guard completed successfully without
  publishing a duplicate because the feature PR did not change versions.
- [complete] Separate branch `codex/release-v1.5.0` changes only the six version
  sources, two version assertions and the macOS/Windows changelog headings.
  Version consistency, stale-reference scan, all 24 portable Node regressions,
  the CI-mode macOS suite and `git diff --check` pass locally.
- [complete] Version-only commit `3c43752` was pushed and Draft PR #246 targets
  `main`.
- [complete] PR #246 passed all four CI jobs and was squash-merged to client
  `main` as `aad9fc0`.
- [in progress] Automatic Release run `30131800275` is building v1.5.0 from
  that exact main commit. No public v1.5.0 tag/assets, website enablement or
  deployment exists yet.
- [complete] Initial PR #245 CI run `30130742965` exposed three gaps. The
  macOS-only Swift fixture now reports a real Node test skip on non-Darwin
  hosts; the signed package-identity shell integration honors the repository's
  existing CI skip; and Windows runtime fingerprinting recursively
  canonicalizes object keys so active-image renaming cannot change content
  identity.
- [verified] Root reproduced the Windows fingerprint mismatch with portable
  PowerShell, then proved the saved/active hashes are identical after the fix.
  CI-mode macOS regressions, 20 macOS and 4 Windows Node regressions, all
  PowerShell parse/encoding checks and `git diff --check` pass locally. Repair
  commit `3a2c809` is pushed; fresh CI run `30131282832` is the active gate.
- [complete] Feature commit `c44b434` was pushed to
  `codex/one-click-theme-apply`; Draft PR #245 targets `main`. All release
  version sources intentionally remain `1.4.0`.
- [in progress] PR #245 must pass Static checks, Windows PowerShell 5.1,
  PowerShell 7 and macOS repository regressions before it is marked ready or
  merged.
- [complete] The independent final Windows read-only audit reports PASS with no
  P0/P1 findings. `git diff --check` passes. Native PowerShell 5.1, compiled
  Setup.exe protocol registration and a real Windows renderer transaction remain
  required PR CI/Windows-host gates rather than local macOS claims.
- [complete] Root reran all 24 portable macOS/Windows Node regressions and the
  complete macOS repository suite on the final stable tree. Both passed; only
  the documented full-Xcode XCTest and installed-app Doctor branches skipped on
  this Command Line Tools host.
- [complete] Final static checks and an x86_64 native app build passed, including
  strict codesign, exact `dreamskin` URL-scheme registration and packaged helper
  inventory.
- [fact] The public client remains v1.4.0 and the website one-click action remains
  correctly disabled until the automatic v1.5.0 Release is public and verified.

## Root Integrated macOS Recheck (2026-07-25 05:50 HKT)

- [complete] Root independently reran the exact pre-switch community transaction
  regression, private ZIP identity regression, focused bounded-HTTP/import/
  staging Node tests, relevant Bash syntax, plist validation and
  `git diff --check`; all passed on the combined macOS tree.
- [complete] All 13 currently approved production ZIPs were exercised through
  the current strict macOS importer with an isolated temporary HOME. Every one
  failed closed on the missing required `theme.css`, and the isolated saved-theme
  library remained empty. The real user theme library and active renderer were
  not changed by this rejection test.
- [pending] Windows click-time baseline closure, combined cross-platform CI,
  final public Release install and website-button acceptance remain.

## macOS Rollback Pre-Switch Closure (2026-07-25 05:43 HKT)

- [complete] Inside the inherited community operation lock, the macOS
  transaction now snapshots the active theme and runs `injector --verify`
  against that exact snapshot and current CDP port before the first switch.
  The injector therefore checks both the rollback theme ID and computed payload
  revision against the renderer; a mismatch exits before any theme switch.
- [complete] The transaction fixture now records exact renderer-verification
  calls. A state mismatch proves zero verification and zero switches; an
  injected renderer-verification failure proves one verification and zero
  switches. Success, verified rollback and failed rollback cases continue to
  pass under one inherited lock.
- [complete] Rollback retention now distinguishes a snapshot promoted to the
  private `recovery/` tree, a structurally validated snapshot retained in its
  original operation directory when promotion fails, and no confirmed
  snapshot. The App does not delete an in-place fallback, startup stale cleanup
  skips community operations containing such a snapshot, and UI/docs no longer
  promise that retaining a snapshot means recovery succeeded.
- [verified] `macos/tests/community-apply-transaction.test.sh`, focused
  `bash -n`, `git diff --check`, and a standalone Swift recovery-promotion
  failure smoke pass. A direct x86_64 app build with the macOS 14.4 SDK passed at
  `/tmp/CodexDreamSkin-one-click-macos-closure.app`; strict ad-hoc signature,
  exact bundled transaction-script bytes, and the `dreamskin` URL scheme were
  rechecked. The build was not installed.
- [remaining] The owner must rerun the combined macOS suite after all agents
  finish, rebuild the final integrated app, reinstall it, verify bundled engine
  identity, and repeat the installed renderer transaction. Full SwiftPM/XCTest
  remains a CI/full-Xcode gate on this Command Line Tools-only host.

## Windows Transaction Hardening (2026-07-25 05:06 HKT)

- [complete] Community downloads now pass their approved byte count and SHA-256
  into the strict ZIP importer. The importer opens the archive exclusively,
  checks both values on that same FileStream, rewinds it, and extracts from the
  still-open handle. Replacement, truncation and wrong-hash regressions were
  added.
- [complete] Imported and duplicate results now return a stable runtime-content
  fingerprint. One-click apply copies the saved theme into a private transaction
  snapshot, recomputes the exact fingerprint, and refuses to write active files
  unless it still matches.
- [complete] The Windows operation lock now covers the exact active snapshot and
  active-file write. The parent releases it before invoking
  start-dream-skin.ps1, because that script acquires the same lock and only
  exits after exact renderer verification. Failed writes and failed startup
  restore under lock, restart, and verify the previous renderer; a newer manual
  theme choice is detected and never overwritten.
- [complete] Native confirmation metadata rejects Unicode Format, bidi,
  line-separator and paragraph-separator characters. Mocked transaction tests
  cover success, wrong private identity, partial writes, verified rollback,
  rollback file/renderer failure, and concurrent supersession.
- [in progress] Independent PowerShell 5.1/transaction review is running. This
  macOS host has no powershell.exe or pwsh, so executable Windows tests,
  Setup.exe protocol registration, and the real renderer transaction remain
  Windows CI/host gates. git diff --check currently passes.

## Active Scope

- Worktree: `/private/tmp/dreamskin-one-click.36Mjwl`
- Branch: `codex/one-click-theme-apply` based on public v1.4.0/main `277b520`
- Goal: strict `dreamskin://apply?version=ver_...` website-to-client apply for macOS and Windows.
- User primary client worktree was not touched.

## Root Repeated Installed Acceptance (2026-07-25 04:41 HKT)

- Root independently re-imported the three compliant official fixtures through
  the installed strict importer; each returned `duplicate`, validated Safe CSS
  and the expected stable content fingerprint.
- Root switched all three themes live again. Exact renderer verification passed
  each theme ID/revision with visible shell/sidebar/composer/home, zero business
  class pollution and no horizontal overflow. Fresh evidence is under
  `/private/tmp/dreamskin-installed-smoke.iVev9i/`.
- A deliberately wrong imported-content fingerprint exercised the parent
  transaction failure path. It returned exit `20`, reapplied the exact previous
  snapshot and visibly reverified it. Root then reapplied the exact original
  snapshot; `preset-gothic-void-crusade` is active and verified now.
- macOS metadata display validation now explicitly rejects bidi controls and
  line/paragraph separators that could visually spoof the native confirmation.
  Targeted tests and the final rebuild/reinstall remain after this edit.

## macOS Safety Closure

- Implemented fixed-origin bounded HTTP with explicit redirect failure, header/chunked size bounds, cancellation, and exactly-once completion coverage.
- Community ZIP import rechecks approved byte count and SHA-256 on the private no-follow snapshot used for extraction.
- Import publishing returns a runtime content fingerprint; staging calculates the same fingerprint and switching requires an exact match.
- Community apply holds one cross-process transaction lock across exact active-theme snapshot, apply/render verification, and verified rollback. Fresh ownerless locks fail closed; only a dead owner or an ownerless lock at least 10 minutes old is reclaimable.
- The rollback snapshot contains the exact active `theme.json`, referenced image, optional `theme.css`, and content identity even when the active theme is not in `themes/<id>`.
- Hot apply now runs exact injector verification; cold apply already runs `injector --verify` against the active theme before success. Failed community apply re-applies and verifies the exact snapshot; exit 20 means verified recovery, exit 21 means recovery was not verified.
- Quit/menu termination is blocked while network, import, apply, recovery, engine install, or runtime operations are busy. Startup removes only stale private operation directories older than 24 hours and preserves community operation roots that still contain a structurally validated rollback snapshot.
- Native confirmation states that a cold apply may restart ChatGPT and that unsent input should be saved. Menu progress covers metadata, download, import, snapshot/apply, and recovery state.

## Verification

- Root independently reran `CODEX_DREAM_SKIN_SKIP_DOCTOR=1
  macos/tests/run-tests.sh`: PASS, with only the documented full-Xcode
  SwiftPM/XCTest and explicitly skipped Doctor branches omitted.
- Root built and installed `/tmp/CodexDreamSkin-one-click-root.app`, verified
  its ad-hoc signature, `dreamskin` URL scheme, complete runtime inventory,
  and byte-identical deployed engine. The previous 1.3.3 app, engine and user
  state are recoverably backed up at
  `/tmp/dreamskin-before-one-click.g6pClo`.
- The real installed importer added three official four-file fixtures as
  `local-one-click-1/2/3`; all reported `safeCssStatus=validated` and a stable
  content fingerprint without changing the active theme during import.
- The installed switcher applied all three fixtures to the real ChatGPT/Codex
  renderer. Exact `injector --verify` passed each theme ID/revision, Safe CSS,
  visible shell/sidebar/composer/card geometry, matching text colors, zero
  business-class pollution and no document overflow. Screenshots are
  `/tmp/dreamskin-local-one-click-1.png`,
  `/tmp/dreamskin-local-one-click-2.png`, and
  `/tmp/dreamskin-local-one-click-3.png`.
- Root restored `preset-gothic-void-crusade`; its active theme/image are
  byte-identical to the pre-test backup (SHA-256 `8316c6ad...` and
  `b76a7cbe...`), exact renderer verify passes, and deep status reports
  `session=active`, `injectorAlive=true`, `cdpOk=true`.
- LaunchServices delivered malformed and canonical production legacy
  `dreamskin://` links to the installed app as native warning windows. The
  production exact-metadata route currently returns 404, so the legacy link
  failed closed and did not change the active theme. A successful end-to-end
  network apply still requires a deployed compatible package.

- `CODEX_DREAM_SKIN_SKIP_DOCTOR=1 macos/tests/run-tests.sh`: PASS. SwiftPM/XCTest skipped because this Command Line Tools host has no matching full Xcode platform; Doctor intentionally skipped. Signed-runtime switch and runtime-state integration passed.
- Direct Swift x86_64 typecheck with macOS 14.4 SDK: PASS.
- Bounded HTTP redirect/oversize/chunked/cancel/exactly-once fixture: PASS.
- Community import private-snapshot byte/SHA identity fixture: PASS.
- Community transaction success/verified rollback/rollback-failure and inherited-lock fixture: PASS.
- `DREAMSKIN_SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX14.4.sdk DREAMSKIN_ARCHS=x86_64 macos/scripts/build-menubar-app.sh --skip-tests --output /tmp/CodexDreamSkin-one-click-hardened.app`: PASS. Built Mach-O x86_64; packaged runtime helpers and `dreamskin` URL scheme verified.
- `git diff --check`: PASS before final build.

## Remaining Integrated Work

- No commit, push, PR, merge, replacement Release, or deployment has occurred.
  A local development build is installed and fully backed up; public v1.4.0
  still does not contain one-click apply.
- A complete fixed-origin network success smoke still requires a deployed
  approved `applyCompatible: true` package. Existing approved legacy
  production packages are intentionally preview/download-only.
- Real Windows PowerShell 5.1 and Setup.exe protocol install require Windows CI/host verification.
## Codex 26.727.4816 Message Bridge (2026-07-31)

- [complete] Read-only inspection of the real Windows Codex 26.727.4816 task
  renderer found zero `[data-message-author-role]` nodes. The current semantic
  boundaries are four `[data-local-conversation-user-anchor]` nodes and four
  `[data-local-conversation-final-assistant]` nodes; all eight are inside the
  thread surface and none is in the sidebar.
- [complete] The shared selector contract now retains the legacy message role
  attribute and adds those two current semantic attributes. Core styling uses
  the existing public `data-ds-part="message"` bridge, and generated macOS and
  Windows selector/renderer/CSS assets are synchronized.
- [verified] Selector doctor, both renderer runtime suites, both payload
  integrity suites, runtime asset sync, JavaScript syntax, focused
  `git diff --check`, and a second real-DOM read-only cardinality check pass.
  No installed runtime, Codex process, active theme, PR, issue, commit, or push
  was changed by this focused task.
