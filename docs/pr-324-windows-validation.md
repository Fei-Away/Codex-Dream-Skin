# PR #324 Windows validation

This document is for the Windows machine or AI validating PR #324. Test the
PR branch only. Do not merge it, publish a Release, or test a binary from an
older workflow run.

## Scope

PR #324 addresses three community-theme failures while keeping macOS and
Windows behavior aligned:

- #318: importing a newer ZIP with the same `theme.json.id` updates the saved
  theme in place instead of creating another `-2` entry.
- #320: shared Safe CSS can reach the registered main, sidebar, home, and
  composer parts on newer renderer DOMs. This applies to every community theme,
  not only colors-only themes.
- #322/#326: Codex `26.727.40816` replaced the legacy main/header classes with
  app-shell data attributes and CSS Module classes. The shared selector and CSS
  contract now recognizes the current main surface, header, and top-fade while
  retaining the legacy anchors. A visible current Codex `app://` renderer can
  pass target verification when it has both Codex/ChatGPT identity evidence and
  the required structure; unrelated targets still fail closed.

The import repair is deliberately conservative. A legacy `id-2`/`id-3`
directory is removed only when its stored suffix identity and semantic
fingerprint both prove that it is the same package. A matching display name is
not evidence. Ambiguous directories, unrelated numeric-suffix themes, files,
junctions, and reparse points must be preserved and rejected rather than
overwritten.

## Checkout and automated checks

Record the exact commit before testing:

```powershell
git fetch origin pull/324/head:pr-324
git switch pr-324
git rev-parse HEAD
node --version
```

Use `RemoteSigned`; do not use `ExecutionPolicy Bypass` and do not change the
machine or user execution policy. A normal Git clone should not carry browser
download zone marks. If Windows says a cloned test file is blocked, unblock
only this checkout before retrying:

```powershell
Get-ChildItem -LiteralPath . -Recurse -File | Unblock-File
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
  -File .\windows\tests\run-tests.ps1
```

Also run the portable parity checks:

```powershell
node .\tools\sync-runtime-assets.mjs --check
node .\tools\renderer-runtime.test.mjs
node .\windows\tests\injector-bootstrap.test.mjs
node .\windows\tests\injector-window-readiness.test.mjs
```

If PowerShell 7 is installed, repeat the Windows suite without replacing the
required Windows PowerShell 5.1 run:

```powershell
pwsh.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
  -File .\windows\tests\run-tests.ps1
```

All commands must exit `0`. Keep the complete failure output if one does not.

The automated generic renderer fixture is deliberately minimal: it contains
only structural anchors such as main, sidebar, composer, and the registered
Codex identity marker. Its typography, native form controls, placeholder copy,
and layout are not product UI and are not visual acceptance evidence. Do not
return a screenshot of that fixture as proof that #320 or #322 is fixed; the
manual checks below must use the real current Codex app.

## Manual import checks (#318)

Use ZIPs that contain non-empty `theme.json`, `theme.css`, and one registered
background image. Importing a ZIP must not change the currently active theme.

1. Import version A, then import a modified version B with the same
   `theme.json.id`.
2. Confirm the second notification says that the saved theme was updated.
3. Confirm the Gallery has one entry for that ID and
   `%LOCALAPPDATA%\CodexDreamSkin\themes\` has no newly-created `id-2` folder.
4. Import version B again. It must report an exact duplicate and write nothing.
5. Reproduce an old exact `id` plus `id-2` duplicate, then import that same
   semantic package. It must consolidate to the canonical `id` directory.
6. Create an independent `id-2` theme with different content, even with the
   same display name. Importing `id` must preserve the independent `id-2`.
7. Put a normal file at a candidate canonical theme path. Import must fail and
   leave that file byte-for-byte unchanged.

After each case, confirm there are no hidden `.theme-import-*`,
`.theme-replace-*`, `.theme-legacy-cleanup-*`, or `.theme-failed-*` residues.
If an import fails, the previous canonical theme must still open and its
semantic fingerprint must be unchanged. Any rollback or cleanup failure must
be reported explicitly; it must not be silently swallowed.

## Renderer and target checks (#320/#322)

Build or install from this exact PR commit, then launch the current official
Microsoft Store Codex through DreamSkin. Do not test an older Setup.exe.

1. Apply at least three complete community themes with different Safe CSS,
   backgrounds, and token sets. Do not limit this to colors-only themes.
2. Check Home and a normal task view. Main content, sidebar, home surface, and
   composer must receive the intended shared styling without styling search,
   settings, modal, or unrelated textbox containers as the composer.
3. On Codex `26.727.40816` or newer, confirm the real outer main surface has the
   theme background from the very top of the window. There must be no native
   white strip or white top-fade left behind. The header controls must remain
   visible and keep their native fixed position while scrolling.
4. Confirm the installed verification output reports `scope.level` as `L1` and
   an empty `missingL1` list on Home. A report that only says injection succeeded
   is insufficient if `shell-main` or `header-tint` is still missing.
5. Confirm sidebar navigation, project selection, task content, composer input,
   and send controls remain interactive and readable.
6. Run the installed verification script and save its screenshot:

   ```powershell
   powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
     -File "$env:LOCALAPPDATA\CodexDreamSkin\engine\scripts\verify-dream-skin.ps1" `
     -ScreenshotPath "$env:TEMP\dreamskin-pr324.png"
   ```

7. Restart Codex, reapply a theme, and verify again. A visible real Codex
   `app://` renderer must pass exact payload, theme ID, and revision checks.
8. The automated bootstrap negative fixture must still reject an unbranded
   `app://` page with only generic main/input structure. Loopback endpoints not
   owned by the verified Codex package must also remain rejected.

Windows confirms the shared runtime and Windows adapter. It does not by itself
prove the macOS-specific issue report on Codex 26.727.40816; that remains a
separate macOS/user acceptance check before release.

## Result to return

Report all of the following:

- exact PR commit SHA;
- Windows edition/build, Codex version, and Node version;
- Windows PowerShell 5.1 result and optional PowerShell 7 result;
- first import, same-ID update, exact duplicate, legacy cleanup, independent
  suffix preservation, file-collision, and rollback results;
- the names of the three non-colors-only themes used for renderer testing;
- verification output, screenshot path, and whether restart/reapply passed;
- confirmation that the screenshot came from the real Codex app, not the
  generic renderer fixture;
- sanitized `injector.log`, `injector-error.log`, and `verify.log` excerpts for
  any failure. Remove tokens, private paths, and conversation content.
