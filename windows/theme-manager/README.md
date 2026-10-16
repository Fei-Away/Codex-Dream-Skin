# Native Windows theme manager

Open **Codex Dream Skin** from the desktop or Start Menu, or double-click its tray
icon. These management entries open the same native manager; repeat launches activate the
existing window. **Codex Dream Skin** is the management entry; use **Codex Dream
Skin - Launch** to start Codex directly with the saved theme and background.
The former PowerShell theme-selection window is removed.

The window has **Theme and startup** and **Logs** tabs. Select the current startup
snapshot or a saved theme, choose a PNG/JPEG/WebP background, and inspect the
background preview. These choices are a draft: selecting a row or picture never
changes startup settings. The preview is illustrative, not proof of Codex rendering.
WebP files remain selectable if Windows lacks a decoder; the panel explicitly
reports that a visual preview is unavailable and the backend validates them on save.

**Save startup settings** validates and commits the combination without launching
Codex. An existing watcher may also update the currently visible skin. **Apply /
reapply and launch Codex** uses the managed startup transaction and only reports
success after a matching verified operation result. **Create / repair launch
shortcut** creates **Codex Dream Skin - Launch** on the desktop. This entry reads
the latest saved startup snapshot on every launch; it does not implicitly save a
draft. Saving a different theme or background does not require a new shortcut.
Changes preserve the source theme and Safe CSS.

Buttons and operation messages follow the manager's Chinese or English language
preference. The launch shortcut filename remains
`Codex Dream Skin - Launch.lnk` in both languages. Shortcut repair migrates the
older `Codex · 默认主题启动.lnk` only after checking that it belongs to Dream Skin;
unrelated same-name entries are preserved. The dedicated shortcut does not alter
the official Codex entry or enable Windows sign-in startup.

The window also adjusts the current active theme's transparency (0–100%) immediately
and can restore **Follow theme**. This section explicitly operates on the active
theme, independent of the selected draft.
The existing renderer observes `theme-preferences.json`; authored alpha is used
when there is no local override, with 30% as the default.

Select an inactive saved theme and choose **Move to Recycle Bin…** to remove its
local directory after confirmation. The active theme must be switched first using
the panel or existing tray. Source ZIPs, active snapshots and recovery files are kept.
The manager uses the same per-user Operation and ThemeImport mutexes as the
existing runtime and rejects linked or redirected paths.

The Logs tab reads bounded recent JSON Lines events from the user data root's
`logs/operations.jsonl` and its four rotations, including operations started when
the panel was closed. Filter failures, cancellations and repeated/busy requests,
select an event for details, refresh, open the logs folder, or export/copy redacted
diagnostics. Original injector/error/verify logs remain accessible separately.
Malformed records and unfinished writes do not discard valid events. Recovery
results distinguish disk settings from verified visible appearance. Runtime logs
are not stored in the executable or included in builds.

Operations run asynchronously through `scripts/panel-operation.ps1` with separate
arguments, the system PowerShell host and `RemoteSigned`. No command expressions
are constructed. During a transaction conflicting controls are disabled, and the
panel waits for restart confirmation rather than terminating a pending transaction.
The parent never holds an operation mutex while waiting for the child.

## Build and checks

Requires .NET SDK 8 or newer and Node.js for the packaging helper. No installed
.NET runtime is required by the published self-contained `win-x64` executable.

```sh
dotnet run --project windows/theme-manager/Tests/DreamSkin.ThemeManager.Tests.csproj -c Release
node tools/build-theme-manager.mjs
```

The helper writes `windows/assets/theme-manager/DreamSkin.ThemeManager.exe` so the
existing installer assets stage includes it. Set `DOTNET` to an absolute SDK
executable path when it is not on PATH.

On Windows, run the native integration checks under the test user's session:

```sh
dotnet run --project windows/theme-manager/NativeTests/DreamSkin.ThemeManager.NativeTests.csproj -c Release
```

These check mutex contention, render both tabs against isolated generated theme
and log fixtures at normal/minimum sizes into `.local-evidence/panel-*.png`, and
recycle an isolated generated fixture, then
confirm that it appears in the real Recycle Bin with its original location.
The fixture remains in the test user's Recycle Bin. The normal test project
checks preference preservation, alpha precedence, atomic writes, deletion
boundaries, token/action/schema-bound results, recovery enums, bounded image
metadata, log rotation/tail/malformed records and redacted diagnostic output without
moving any user theme.

Manual Windows acceptance still covers launching the packaged shortcut, keyboard
and display scaling, 0/100% and Follow theme in a live Codex window, external
active-theme changes, cancel/confirm deletion, and restoration from Recycle Bin.
