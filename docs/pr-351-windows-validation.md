# PR #351 Windows Validation

This is the complete Windows handoff for
[PR #351](https://github.com/Fei-Away/Codex-Dream-Skin/pull/351). A Windows
agent should pull that PR and validate the exact PR head. Do not test the
published v1.5.12 installer: it predates every change in this PR.

The PR combines three related candidate areas that need one real-Windows pass:

1. Windows client localization and language persistence (`System`, `English`,
   and `中文`), including tray actions, dialogs, notifications, installer
   payload repair, update checks, theme import/apply, and restore paths.
2. Shared renderer/runtime changes used by both macOS and Windows.
3. Issue #337: PowerShell 5.1 must preserve a bundled Node executable path
   when Inno Setup extracts it below a non-ASCII temporary directory. The old
   failure text was `Node.js executable path could not be validated`.

This document authorizes validation only. The Windows agent must not merge the
PR, bump a version, create a tag or Release, publish an installer, upload its
local build, edit WindowsApps ACLs, modify `app.asar`, disable Defender, or use
`ExecutionPolicy Bypass`.

## 1. Check Out The Exact PR Head

Use a fresh clone or a clean worktree. These commands deliberately detach at
the current PR head so the tested commit cannot move locally during the run:

```powershell
git fetch origin pull/351/head
git switch --detach FETCH_HEAD

$candidateSha = (git rev-parse HEAD).Trim()
$onlineSha = (gh pr view 351 --repo Fei-Away/Codex-Dream-Skin `
  --json headRefOid --jq .headRefOid).Trim()
if ($candidateSha -cne $onlineSha) {
  throw "PR head changed during checkout: local=$candidateSha online=$onlineSha"
}
if (git status --porcelain) {
  throw 'The validation worktree is dirty.'
}
"CANDIDATE_SHA=$candidateSha"
```

Record the printed full SHA. Before sending the final report, run the online
SHA comparison again. If the PR moved, stop and rerun against its new head.

## 2. Record The Host

Use a real Windows 10/11 x64 host with the official Microsoft Store Codex
package installed for the current user. Record:

```powershell
$PSVersionTable | Format-List PSVersion, PSEdition, OS, OSVersion
[Environment]::OSVersion.Version
node --version
git --version
gh --version
Get-AppxPackage OpenAI.Codex | Select-Object Name, Version, Architecture
```

Windows PowerShell 5.1 is mandatory. PowerShell 7 is an additional gate when
available; it cannot replace the 5.1 result.

## 3. Run Automated Gates

Run from the repository root. Every command must exit `0`:

```powershell
node .\tools\sync-runtime-assets.mjs --check

$portableTests = @(
  Get-ChildItem .\macos\tests\*.test.mjs,
    .\windows\tests\*.test.mjs,
    .\tools\*.test.mjs
) | ForEach-Object FullName
node --test @portableTests

powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
  -File .\windows\tests\run-tests.ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
  -File .\windows\tests\installer-static.tests.ps1
```

When `pwsh.exe` is installed, rerun both PowerShell test entry points with it:

```powershell
pwsh.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
  -File .\windows\tests\run-tests.ps1
pwsh.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
  -File .\windows\tests\installer-static.tests.ps1
```

Preserve full output for any failure. Do not weaken or skip a failing test.

## 4. Build The Candidate Setup

Use Inno Setup 6.7.1. Confirm `ISCC.exe` exists, then build from this exact
detached PR tree:

```powershell
$iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
if (-not (Test-Path -LiteralPath $iscc -PathType Leaf)) {
  $iscc = Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'
}
if (-not (Test-Path -LiteralPath $iscc -PathType Leaf)) {
  throw 'Install official Inno Setup 6.7.1 before continuing.'
}

$candidateOutput = Join-Path $env:LOCALAPPDATA 'DreamSkin-PR351-Build'
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
  -File .\windows\installer\build-release.ps1 `
  -OutputDirectory $candidateOutput -IsccPath $iscc

$candidateSetup = Join-Path $candidateOutput 'CodexDreamSkin-Setup-v1.5.12.exe'
if (-not (Test-Path -LiteralPath $candidateSetup -PathType Leaf) -or
    (Get-Item -LiteralPath $candidateSetup).Length -le 0) {
  throw 'The candidate Setup.exe was not built.'
}
Get-FileHash -LiteralPath $candidateSetup -Algorithm SHA256
```

The `v1.5.12` filename identifies the unchanged candidate base only. This
local file is not the public v1.5.12 asset and must not be distributed.

## 5. Exercise Issue #337 With A Real CJK Temp Path

Exit Codex and the Dream Skin tray. Start the candidate Setup from a process
whose real `TEMP` and `TMP` point to a CJK path. Keep the Inno log for evidence:

```powershell
$cjkTemp = Join-Path $env:LOCALAPPDATA 'DreamSkin-验证-临时目录'
$setupLog = Join-Path $env:LOCALAPPDATA 'DreamSkin-PR351-Setup.log'
New-Item -ItemType Directory -Path $cjkTemp -Force | Out-Null
$oldTemp = $env:TEMP
$oldTmp = $env:TMP
try {
  $env:TEMP = $cjkTemp
  $env:TMP = $cjkTemp
  $process = Start-Process -FilePath $candidateSetup `
    -ArgumentList "/LOG=$setupLog" -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Candidate Setup exited with $($process.ExitCode)."
  }
} finally {
  $env:TEMP = $oldTemp
  $env:TMP = $oldTmp
}
```

In the GUI, complete a normal current-user install. Pass only when all of these
are true:

- Setup reaches completion without
  `Node.js executable path could not be validated`.
- The sanitized Inno log proves its temporary extraction path was below the
  exact CJK directory above. If it used another directory, this test did not
  exercise #337 and must be repeated.
- No administrator elevation, ACL change, security bypass, or untrusted Node
  fallback was needed.
- The installed engine contains the exact PR sources below:

```powershell
$sourceRoot = (Resolve-Path .\windows).Path
$engineRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\engine'
foreach ($relative in @(
  'VERSION',
  'assets\renderer-inject.js',
  'scripts\common-windows.ps1',
  'scripts\localization-windows.ps1',
  'scripts\injector.mjs',
  'scripts\theme-windows.ps1',
  'scripts\tray-dream-skin.ps1'
)) {
  $source = Join-Path $sourceRoot $relative
  $installed = Join-Path $engineRoot $relative
  if (-not (Test-Path -LiteralPath $installed -PathType Leaf)) {
    throw "Installed engine is missing: $relative"
  }
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -cne
      (Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash) {
    throw "Installed engine differs from PR head: $relative"
  }
}
'ENGINE_HASH_BINDING=PASS'
```

## 6. Validate The Windows Language Workflows

Use the tray UI for the primary test. Do not substitute an environment
variable for the menu selection.

1. Select `Language / 语言` -> `English`. Close and reopen the tray. Confirm the
   checked selection persists and the status, apply/reapply, pause/resume,
   background, import, saved themes, links, update, restore, and exit labels
   are English.
2. Select `Language / 语言` -> `中文`. Reopen the tray and repeat the same check
   in Chinese.
3. Select `System / 系统`. Reopen the tray and confirm it follows Windows UI
   culture. The preference override must be removed when System is selected.
4. In both English and Chinese, exercise apply/reapply, pause/resume, background
   picker cancellation, invalid-image failure, theme ZIP import, duplicate or
   update result, save/switch theme, update check, and restore cancellation.
5. Confirm cancellation is never reported as success and a failure does not
   leave a false active state. Machine-readable status/state JSON must remain
   unchanged; only human-facing copy is localized.
6. Apply one test theme with an explicit white accent and one with an explicit
   black accent. On both light and dark Codex appearances, accent-filled
   controls must remain readable: black text on white and white text on black.
   Reapply an adaptive/default accent afterward and confirm no stale explicit
   foreground remains.

Also test one normal apply and one restore against the real Store Codex app.
Run the installed verifier on Home and one normal task route:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned `
  -File "$engineRoot\scripts\verify-dream-skin.ps1" `
  -ScreenshotPath "$env:TEMP\dreamskin-pr351-real-codex.png"
```

Pass only with `scope.level=L1`, an empty `missingL1`, an interactive real
`app://` Codex renderer, no horizontal overflow, and no console/runtime error
introduced by this PR. The screenshot must be from the real installed Codex
app, not a fixture.

## 7. Return One Result

Return exactly one consolidated report to the PR owner:

```text
PR: #351
CANDIDATE_SHA: <40-character SHA>
HOST: <Windows edition/build; x64>
CODEX: <Store package version>
POWERSHELL_5_1: PASS|FAIL <version>
POWERSHELL_7: PASS|FAIL|NOT_INSTALLED <version>
PORTABLE_TESTS: PASS|FAIL <count>
INSTALLER_STATIC: PASS|FAIL
SETUP_BUILD: PASS|FAIL <SHA-256>
CJK_TEMP_SETUP_337: PASS|FAIL
ENGINE_HASH_BINDING: PASS|FAIL
LANGUAGE_SYSTEM: PASS|FAIL
LANGUAGE_ENGLISH: PASS|FAIL
LANGUAGE_CHINESE: PASS|FAIL
REAL_CODEX_L1: PASS|FAIL <scope.level; missingL1>
SCREENSHOT: <local path>
SANITIZED_FAILURES: <none or exact excerpts without private paths/tokens>
FINAL: PASS|FAIL
```

Any mandatory failure makes `FINAL: FAIL`. Include sanitized excerpts from the
Setup log and `%LOCALAPPDATA%\CodexDreamSkin\logs` for failures, but redact user
names and private paths. Do not post secrets or upload the locally built Setup.
