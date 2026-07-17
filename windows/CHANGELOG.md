# Windows changelog

## 2.0.5 - 2026-07-17

- Revalidated the native Home route after the Microsoft Store Codex update to `OpenAI.Codex 26.715.2305.0`: all four native suggestion cards, the native composer, and the Miku illustration remain present with no horizontal overflow.
- Hardened live verification so Home can pass only when exactly four native suggestion cards are rendered, visible through their ancestor chain, inside the viewport, and unobstructed at their center point. The verifier now reports `homeScenario` and `visibleSuggestionCount` without removing existing fields.
- Made ordinary `--verify` use the same bounded retry loop as injection/reload, so asynchronous Codex SPA hydration cannot create a false failure while native component markers are still settling.
- Kept the compatibility claim deliberately narrow: this update rechecks Home, the active task shell/change summary, the thread summary output panel, and automatic startup on the new package; the broader Dark route matrix remains the previously recorded baseline until each route is revisited.

## 2.0.4 - 2026-07-17

- Fixed Windows Store launch failures by activating the current OpenAI.Codex package through its dynamically discovered AUMID and `IApplicationActivationManager`, while still passing the loopback-only CDP flags. The launcher no longer attempts to execute the access-controlled WindowsApps binary directly.
- Made Restore current-session safe: it removes the live skin and pauses the current official Codex process, keeps the limited AtLogOn Hook registered, and automatically resumes skinning after that process exits. A shared runtime-transition mutex and an internal Hook invocation guard prevent a polling race from reinjecting immediately after cleanup. Permanent Hook removal now requires `-DisableAutoHook`, `-Uninstall`, or the dedicated unregister script.
- Kept recovery responsive when a renderer is half-disconnected: target discovery HTTP is abortable, every CDP socket open/command has a bounded timeout, and the transition mutex is released after daemon state is committed, before foreground wait or verification. Foreground diagnostic watchers now persist the same recoverable identity as hidden daemons; their state is removed only after exit is confirmed, while cleanup and verification failures stop only the process whose full identity still matches.
- Clarified the Restore shortcut copy so it no longer implies that a current-session cleanup silently disables future automatic launches.
- Added regression contracts for Store activation, AUMID discovery, direct-WindowsApps launch rejection, pause lifecycle, and explicit Hook disablement.

## 2.0.3 - 2026-07-16

- Fixed installer safety: installation no longer writes Codex Appearance, code-theme, Diff, or custom chrome-theme keys. An existing config may be backed up once, but current settings remain untouched.
- Hardened Hook/daemon lifecycle against stale or reused PIDs. Before stopping or reusing a persisted PID, the scripts now require and verify the exact executable path, exact script argument, port, command line, process start time, and a 32-character instance token; missing identity fields fail closed.
- Re-registration now replaces a verified old Hook so port/tone/script updates converge; uninstall refuses the unsafe `-KeepAutoHook` combination.
- Scoped component 04 exclusively to the exact native Diff tabpanel with no broad fallback, and scoped component 08 exclusively to the native Quick Chat owner.
- Added art fingerprinting so a hot reapply updates changed illustration data and revokes the obsolete blob URL.
- Redacted raw renderer titles/URLs from verifier, audit, and watch output; removed the private generation-session URL from tracked metadata.
- Clarified that the 14 component-board manifest is an external metadata/hash snapshot. The component PNGs remain in the separate design source; this runtime repository validates its own hero PNG rather than claiming to re-hash absent boards.

## 2.0.2 - 2026-07-16

- Forked the upstream Windows loopback CDP engine into Codex Miku Stage.
- Replaced the single pink/Fiona composition with a manifest-driven 14-item Miku design contract.
- Added independent CSS sections for shell, task/composer, home, Diff, settings, plugins, automations, quick chat, popovers, split/terminal, output, analytics, Appearance/Pets, and shared states. Section presence is a static contract and does not by itself claim live selector coverage.
- Added locked dark/light tokens and a dedicated no-fake-UI Miku hero asset.
- Added explicit loopback binding, occupied-port rejection, safe default shortcuts, installed-runtime copying, optional config backup, and uninstall validation.
- Added an opt-in, limited-user logon hook that ignores the current process and automatically performs the one required CDP restart on future ordinary Codex launches.
- Added static contract tests covering the 14-board metadata/hash snapshot, the shipped hero PNG, CSS sections, Node/PowerShell syntax, loopback guards, and official-package mutation guards. Live coverage is tracked route-by-route as Unverified, Partial, or Verified from selector evidence, current screenshots, and interaction checks.
- Added a read-only live component audit and corrected the `task-output` marker ownership: the sidebar and composer map to components 01/02, the thread summary/output host maps to 11, and the sidebar resize separator remains part of 01 rather than being misclassified as split/terminal component 10.
- Stabilized the Home owner on the inner `[role="main"]` containing `home-icon`, and stabilized Diff on the native right-side `data-tab-id="diff"` tabpanel.
- Added native Settings General card contracts; the 2.0.2 baseline detects five `.miku-settings-card` surfaces instead of leaving dark native cards inside the themed shell.
- Fixed light-token bridging and Settings light surfaces, including white-on-white text, mixed dark cards, boundary tokens, and the doubled search focus ring.
- Kept one Auto Hook and one injector daemon active at a time so an older installed injector cannot overwrite the current stylesheet.
- Verified the Dark live route baseline for components 01–13 across Home, task/output, terminal, Diff, account popover, Settings, Plugins, Scheduled tasks, Quick Chat, Profile, Appearance, and Pets. Local runtime screenshots were visually reviewed and remain Git-ignored.
- Passed Light visual smoke on Home and Settings General. Shared hover/disabled/loading and other exhaustive component-14 states remain Partial rather than being reported as fully verified.
