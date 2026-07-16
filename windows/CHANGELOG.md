# Windows changelog

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
