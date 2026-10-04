# Native Windows theme manager

Open **Codex Dream Skin** from the desktop or Start Menu, or double-click its tray
icon. All entries open the same native manager; repeat launches activate the
existing window. The former PowerShell theme-selection window is removed. The window
adjusts the current theme's transparency (0–100%) and can restore **Follow theme**.
The existing renderer observes `theme-preferences.json`; authored alpha is used
when there is no local override, with 30% as the default.

Select an inactive saved theme and choose **Move to Recycle Bin…** to remove its
local directory after confirmation. The active theme must be switched from the
existing tray first. Source ZIPs, active snapshots and recovery files are kept.
The manager uses the same per-user Operation and ThemeImport mutexes as the
existing runtime and rejects linked or redirected paths.

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

These check mutex contention and recycle an isolated generated fixture, then
confirm that it appears in the real Recycle Bin with its original location.
The fixture remains in the test user's Recycle Bin. The normal test project
checks preference preservation, alpha precedence, atomic writes, and deletion
boundaries without moving any user theme.

Manual Windows acceptance still covers launching the packaged shortcut, keyboard
and display scaling, 0/100% and Follow theme in a live Codex window, external
active-theme changes, cancel/confirm deletion, and restoration from Recycle Bin.
