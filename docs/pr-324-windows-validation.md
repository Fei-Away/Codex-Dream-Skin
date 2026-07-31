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

The final review also covers regressions found after the first Windows pass:

- Missing, non-string, or Windows-reserved source IDs are normalized to the
  same stable cross-platform ID before the mandatory final payload check. That
  check must finish before an existing saved theme is moved or replaced.
- Hidden transaction/recovery directories are never listed as saved themes,
  even if an obsolete backup cannot be deleted immediately.
- Validated Safe CSS keeps the website/server glass-filter contract (blur up
  to 30 px plus bounded saturate/brightness/contrast), does not erase the
  registered wallpaper merely because a root or surface sets a background
  color, and still reaches the real composer when a search input appears first.

The import repair is deliberately conservative. A legacy `id-2`/`id-3`
directory is removed only when its stored suffix identity and semantic
fingerprint both prove that it is the same package. A matching display name is
not evidence. Ambiguous directories, unrelated numeric-suffix themes, files,
junctions, and reparse points must be preserved and rejected rather than
overwritten.

## Crash and restart recovery gate

The replacement protocol is shared with macOS and must be checked as a
transaction, not only through the normal `catch` rollback path:

```text
journal -> durable backup -> publish candidate -> verify fingerprint
        -> durable committed marker -> cleanup
```

Run the complete Windows ZIP-import suite in both PowerShell 5.1 and 7. It
contains a real process-termination/restart test for the first uncatchable
window and deterministic restart-state coverage for all three windows:

1. after the old canonical directory is moved to its backup;
2. after the candidate is published at the canonical path; and
3. after the durable `committed` marker is published.

The first two states are uncommitted and must restore the exact old semantic
fingerprint on the next importer/store invocation. The third state is committed
and must retain the verified new fingerprint. Every recovery must remove its
transaction files after successful verification and must never show dotted
transaction directories in the tray menu.

The suite also has fail-closed cases for a corrupt candidate, a malformed or
path-conflicting journal, duplicate journals targeting one destination, and an
impossible committed-plus-temporary marker. In those cases the verified old
theme (when available) stays visible, the journal and suspicious payload remain
for diagnosis, and no cleanup or overwrite is attempted. A legacy cleanup
failure after commit is only a bounded warning; it must not roll back the new
canonical theme.

When reporting results, distinguish the exact phase tested (`prepared`,
`old-moved`, `new-published`, or `committed`) and state whether it used the real
FailFast child process or a deterministic restart-state fixture.

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

Before manual renderer testing, close Codex and exit the Dream Skin tray, then
install the runtime from this checkout. Do not reuse the engine left by an
older PR head or Release:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
  -File .\windows\scripts\install-dream-skin.ps1

$engine = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\engine'
foreach ($relative in @(
  'assets\dream-skin.css',
  'assets\renderer-inject.js',
  'assets\safe-css-validator.mjs',
  'scripts\injector.mjs',
  'scripts\theme-windows.ps1'
)) {
  $source = Join-Path (Resolve-Path .\windows) $relative
  $installed = Join-Path $engine $relative
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -cne
      (Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash) {
    throw "Installed engine does not match PR source: $relative"
  }
}
```

Record `git rev-parse HEAD` after installation. If any hash differs, stop; the
manual result belongs to another build and is not evidence for this PR head.

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
8. Import packages whose source ID is missing, non-string, or Windows-reserved.
   Each must receive the documented stable fallback ID and a later equivalent
   package must update that same directory. Invalid payloads must fail before
   the existing canonical directory is moved.
9. Simulate or retain an obsolete hidden `.theme-replace-*` recovery copy.
   The committed new theme may report a cleanup warning, but no dotted
   transaction directory may appear in the tray's saved-theme menu.

After each case, confirm there are no hidden `.theme-import-*`,
`.theme-replace-*`, `.theme-legacy-cleanup-*`, or `.theme-failed-*` residues.
If an import fails, the previous canonical theme must still open and its
semantic fingerprint must be unchanged. Any rollback or cleanup failure must
be reported explicitly; it must not be silently swallowed.

## Renderer and target checks (#320/#322)

Use the source-installed engine verified above, then launch the current official
Microsoft Store Codex through DreamSkin. Do not test an older Setup.exe.

1. Apply at least three complete community themes with different Safe CSS,
   backgrounds, and token sets. Do not limit this to colors-only themes.
2. Check Home and a normal task view. Main content, sidebar, home surface, and
   composer must receive the intended shared styling without styling search,
   settings, modal, or unrelated textbox containers as the composer.
   Include a view where a search textbox occurs in DOM order before the prompt
   composer; the prompt composer must still receive `data-ds-part="composer"`.
3. On Codex `26.727.40816` or newer, confirm the real outer main surface has the
   theme background from the very top of the window. There must be no native
   white strip or white top-fade left behind. The header controls must remain
   visible and keep their native fixed position while scrolling.
4. Confirm the installed verification output reports `scope.level` as `L1` and
   an empty `missingL1` list on both Home and the normal task view. A report that
   only says injection succeeded is insufficient if any required L1 anchor is
   missing. `L0` is accepted only while the Settings route is visibly replacing
   the normal shell; it is never a successful Home or task-view result.
5. Confirm sidebar navigation, project selection, task content, composer input,
   and send controls remain interactive and readable.
6. Include at least one full-wallpaper theme whose Safe CSS sets a root or main
   `background-color`. Its registered wallpaper must remain visible. Also test
   a theme using `blur(21px..30px)` with bounded `saturate`, `brightness`, or
   `contrast`; it must import and render instead of being rejected by the
   client validator.
7. Run the installed verification script and save its screenshot:

   ```powershell
   powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
     -File "$env:LOCALAPPDATA\CodexDreamSkin\engine\scripts\verify-dream-skin.ps1" `
     -ScreenshotPath "$env:TEMP\dreamskin-pr324.png"
   ```

8. Restart Codex, reapply a theme, and verify again. A visible real Codex
   `app://` renderer must pass exact payload, theme ID, and revision checks.
9. The automated bootstrap negative fixture must still reject an unbranded
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
  suffix preservation, file-collision, fallback-ID, rollback, cleanup-warning,
  and hidden-directory menu-filter results;
- the names of the three non-colors-only themes used for renderer testing;
- wallpaper-preservation, composite-filter, and search-before-composer results;
- verification output, screenshot path, and whether restart/reapply passed;
- confirmation that the screenshot came from the real Codex app, not the
  generic renderer fixture;
- sanitized `injector.log`, `injector-error.log`, and `verify.log` excerpts for
  any failure. Remove tokens, private paths, and conversation content.
