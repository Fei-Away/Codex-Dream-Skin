[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

# A verify can fail while the theme is demonstrably on screen: the renderer
# reports the document visible, the viewport sized and the shell structure
# present, and only Browser.getWindowForTarget -- which some Codex builds never
# resolve for a real window -- comes back false. Startup used to force-restart
# Codex in that state, taking a working skinned window away from the user and
# returning them to the stock appearance about 90 seconds after they applied a
# theme (#267). Startup must leave Codex alone when the skin is rendered, and
# must still restart it when the renderer reports a genuinely broken session.

$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts\localization-windows.ps1')
# This lifecycle fixture stubs config I/O; never resolve the real user home.
function Resolve-DreamSkinConfigPaths {
  param([string]$StateRoot, [switch]$BindBackup)
  return [pscustomobject]@{
    ConfigPath = (Join-Path $StateRoot 'fixture-config.toml')
    BackupPath = (Join-Path $StateRoot 'fixture-backup.toml')
  }
}
$startPath = Join-Path $Root 'scripts\start-dream-skin.ps1'
$rawSource = [System.IO.File]::ReadAllText($startPath)
$dotSourcePattern = '(?m)^\.\s+\(Join-Path \$PSScriptRoot ''(?:common-windows|theme-windows|localization-windows)\.ps1''\)\r?\n'
if ([regex]::Matches($rawSource, $dotSourcePattern).Count -ne 3) {
  throw 'Preserved-skin fixture could not isolate the three runtime imports.'
}
$rawSource = [regex]::Replace($rawSource, $dotSourcePattern, '')
$rawSource = $rawSource.Replace(". (Join-Path (Split-Path -Parent `$Injector) 'apply-community-theme.ps1') -FunctionsOnly", '')
$rawSource = $rawSource.Replace('exit 0', 'return')
$rawSource = $rawSource.Replace(
  '$Injector = Join-Path $PSScriptRoot ''injector.mjs''',
  '$Injector = ''mock-injector.mjs'''
)
$rawSource = $rawSource.Replace(
  '(Split-Path -Parent $PSScriptRoot)',
  '''mock-skill-root'''
)
if ($rawSource.Contains('$PSScriptRoot')) {
  throw 'Preserved-skin fixture left a real script-root dependency in the isolated source.'
}

function Invoke-DreamSkinStartupFixture {
  param(
    [Parameter(Mandatory = $true)][string[]]$VerifyPayloads,
    [Parameter(Mandatory = $true)][string]$OncePayload,
    [switch]$ReuseExistingCdp,
    [switch]$WithResultToken,
    [switch]$ExplicitRestart,
    [switch]$PromptForRestart,
    [switch]$DeclineRestart,
    [switch]$ChangeIdentityAfterConsent,
    [switch]$SelectTheme,
    [switch]$SupersedeTheme,
    [switch]$WriteThemeFailure,
    [switch]$SuccessfulVerification
  )

  $script:daemon = [pscustomobject]@{ Id = 4242; HasExited = $false }
  $script:daemon | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {
    param([int]$Milliseconds)
    return $this.HasExited
  }
  $script:dateCall = 0
  $script:codexStopped = $false
  $script:codexStarted = $false
  $script:cdpReady = [bool]$ReuseExistingCdp
  $script:codexProcessRunning = [bool]$ReuseExistingCdp
  $script:appearanceInstallCalls = 0
  $script:appearanceRestoreCalls = 0
  $script:removeCalls = 0
  $script:verifyPayloads = @($VerifyPayloads)
  $script:verifyPayloadIndex = 0
  $script:oncePayload = $OncePayload
  $script:lastError = '(no error)'
  $script:resultAppearanceRecovery = $null
  $script:restartPromptCalls = 0
  $script:browserId = 'fixture-browser'
  $script:themeFingerprint = 'previous'
  $script:themeWriteCalls = 0
  $script:themeRestoreCalls = 0
  $script:snapshotRemoved = $false

  function Confirm-DreamSkinRestart {
    param([string]$Message)
    $script:restartPromptCalls += 1
    if ($ChangeIdentityAfterConsent) { $script:browserId = 'replacement-browser' }
    return -not $DeclineRestart
  }
  function Get-DreamSkinThemeRuntimeContentFingerprint {
    param([string]$ThemeDirectory)
    if ([IO.Path]::GetFileName($ThemeDirectory).StartsWith('.tray-apply-')) { return 'previous' }
    return $script:themeFingerprint
  }
  function Copy-DreamSkinActiveThemeSnapshot { param($Paths, $Destination) }
  function Use-DreamSkinSavedTheme {
    param($ThemeDirectory, $StateRoot)
    $script:themeWriteCalls += 1
    $script:themeFingerprint = 'selected'
    if ($WriteThemeFailure) { throw 'fixture-theme-write-failure' }
  }
  function Restore-DreamSkinActiveThemeSnapshot {
    param($SnapshotDirectory, $StateRoot, $ExpectedContentFingerprint)
    $script:themeRestoreCalls += 1
    $script:themeFingerprint = $ExpectedContentFingerprint
  }
  function Remove-DreamSkinManagedDirectoryVerified {
    param($Path, $Root)
    $script:snapshotRemoved = $true
  }

  function Enter-DreamSkinOperationLock { param([int]$TimeoutMilliseconds); return 'mock-lock' }
  function Exit-DreamSkinOperationLock { param([object]$Mutex) }
  function Assert-DreamSkinPort { param([int]$Port) }
  function Get-DreamSkinNodeRuntime {
    return [pscustomobject]@{ Path = 'mock-node.exe'; Version = '22.23.1' }
  }
  function Get-DreamSkinCodexInstall {
    return [pscustomobject]@{
      Executable = 'C:\Program Files\WindowsApps\OpenAI.Codex\app\ChatGPT.exe'
      PackageRoot = 'C:\Program Files\WindowsApps\OpenAI.Codex'
      PackageFullName = 'OpenAI.Codex_fixture'
      PackageFamilyName = 'OpenAI.Codex_fixture'
      Version = '26.707.9981.0'
    }
  }
  function Get-DreamSkinThemePaths {
    param([string]$StateRoot)
    return [pscustomobject]@{
      Root = $StateRoot
      Active = (Join-Path $StateRoot 'active-theme')
      PauseFile = (Join-Path $StateRoot 'paused')
    }
  }
  function Ensure-DreamSkinManagedDirectory { param([string]$Path, [string]$Root) }
  function Initialize-DreamSkinThemeStore {
    param([string]$SkillRoot, [string]$StateRoot)
    return Get-DreamSkinThemePaths -StateRoot $StateRoot
  }
  function Test-DreamSkinPaused { param([string]$StateRoot); return $false }
  function Test-DreamSkinPendingAppearanceTransaction { param([string]$BackupPath); return $false }
  function Read-DreamSkinState { param([string]$Path); return $null }
  function Get-DreamSkinCodexStatePathCandidate { param([object]$State); return $null }
  function Get-DreamSkinCodexInstallFromState { param([object]$State); return $null }
  function Test-DreamSkinPathEqual { param([string]$Left, [string]$Right); return $true }
  function Stop-DreamSkinRecordedInjector { param([object]$State); return $true }
  function Set-DreamSkinPaused { param([bool]$Paused, [string]$StateRoot); return $true }
  function Invoke-DreamSkinCodexWindowActivation { param([object]$Codex); return $true }
  function ConvertTo-DreamSkinProcessArgument { param([string]$Value); return $Value }
  function Get-DreamSkinProcessStartedAt { param([int]$ProcessId); return '2026-07-25T00:00:00.0000000Z' }
  function Write-DreamSkinState { param([string]$Path, [object]$State) }
  function Write-DreamSkinUtf8FileAtomically { param([string]$Path, [string]$Content) }

  # No Codex is running yet, so startup launches it with the debug port itself.
  # That is the branch that used to force-restart on any verify failure.
  function Get-DreamSkinCodexProcesses {
    param([object]$Codex)
    if ($script:codexProcessRunning) { return @([pscustomobject]@{ ProcessId = 909 }) }
    return @()
  }
  function Get-DreamSkinVerifiedCdpIdentity {
    param([int]$Port, [object]$Codex)
    if (-not $script:cdpReady) { return $null }
    return [pscustomobject]@{ BrowserId = $script:browserId }
  }
  function Get-DreamSkinVerifiedCdpIdentityForAnyRegistered { param([int]$Port); return $null }
  function Test-DreamSkinPortAvailable { param([int]$Port); return $true }
  function Get-DreamSkinActiveThemeAppearance { param([string]$ThemeDirectory); return 'dark' }
  function Install-DreamSkinBaseTheme {
    param(
      [string]$ConfigPath, [string]$BackupPath, [string]$AppearanceTheme,
      [switch]$PassThruTransaction
    )
    $script:appearanceInstallCalls += 1
    return [pscustomobject]@{ SchemaVersion = 1 }
  }
  function Restore-DreamSkinManagedAppearanceSnapshot {
    param([string]$ConfigPath, [string]$BackupPath, [object]$Transaction)
    $script:appearanceRestoreCalls += 1
    return [pscustomobject]@{ ConflictedKeys = @(); MarkerStatus = 'restored' }
  }
  function Complete-DreamSkinAppearanceTransaction { param([string]$BackupPath, [object]$Transaction) }
  function Start-DreamSkinCodexForDebugging {
    param([object]$Codex, [string[]]$Arguments, [int]$Port, [int[]]$PreserveProcessIds)
    $script:cdpReady = $true
    $script:codexProcessRunning = $true
    return [pscustomobject]@{ Strategy = 'package-activation' }
  }
  function Stop-DreamSkinCodex {
    param([object]$Codex, [int[]]$PreserveProcessIds, [switch]$AllowForce)
    $script:codexStopped = $true
    $script:cdpReady = $false
    $script:codexProcessRunning = $false
  }
  function Start-DreamSkinCodex {
    param([object]$Codex)
    $script:codexStarted = $true
    $script:codexProcessRunning = $true
    return [pscustomobject]@{ Id = 909 }
  }
  function Get-DreamSkinStartFailureCategory {
    param([System.Exception]$Exception, [string]$FallbackCategory)
    return $FallbackCategory
  }
  function Write-DreamSkinStartResult {
    param(
      [string]$StateRoot, [string]$Token, [string]$Outcome,
      [string]$Category, [string]$AppearanceRecovery
    )
    $script:resultAppearanceRecovery = $AppearanceRecovery
  }

  function Invoke-DreamSkinNative {
    param([string]$FilePath, [object[]]$ArgumentList, [switch]$DiscardStderr)
    if ($ArgumentList -contains '--verify') {
      if ($SupersedeTheme -and $script:themeWriteCalls -gt 0) { $script:themeFingerprint = 'newer' }
      $index = [Math]::Min($script:verifyPayloadIndex, $script:verifyPayloads.Count - 1)
      $script:verifyPayloadIndex += 1
      $verifyCode = if ($SuccessfulVerification) { 0 } else { 2 }
      return [pscustomobject]@{ ExitCode = $verifyCode; Output = @($script:verifyPayloads[$index]) }
    }
    if ($ArgumentList -contains '--once') {
      return [pscustomobject]@{ ExitCode = 2; Output = @($script:oncePayload) }
    }
    if ($ArgumentList -contains '--remove') {
      $script:removeCalls += 1
      return [pscustomobject]@{ ExitCode = 0; Output = @() }
    }
    throw 'The preserved-skin fixture received an unexpected native command.'
  }
  function Start-Process {
    [CmdletBinding()]
    param(
      [string]$FilePath,
      [object[]]$ArgumentList,
      [string]$WindowStyle,
      [switch]$PassThru,
      [string]$RedirectStandardOutput,
      [string]$RedirectStandardError
    )
    return $script:daemon
  }
  function Stop-Process {
    [CmdletBinding()]
    param([object]$InputObject, [switch]$Force)
    $InputObject.HasExited = $true
  }
  function Remove-Item {
    [CmdletBinding()]
    param([string]$LiteralPath, [switch]$Force)
  }
  function Write-Host {
    param([Parameter(ValueFromRemainingArguments = $true)][object[]]$Object)
  }
  # The launch and verify deadlines share the first two timestamps. Permit one
  # retry at +30 seconds, then cross the 90-second verification deadline.
  function Get-Date {
    $script:dateCall += 1
    $offsets = @(0, 0, 30, 120)
    $index = [Math]::Min($script:dateCall - 1, $offsets.Count - 1)
    return [DateTime]::new(2026, 7, 25, 0, 0, 0, [DateTimeKind]::Utc).AddSeconds($offsets[$index])
  }
  function Start-Sleep { param([int]$Milliseconds, [int]$Seconds) }

  $originalLocalAppData = $env:LOCALAPPDATA
  $env:LOCALAPPDATA = Join-Path ([System.IO.Path]::GetTempPath()) 'dreamskin-preserved-skin-fixture'
  $failed = $false
  try {
    $startBlock = [scriptblock]::Create($rawSource)
    try {
      $startParameters = @{ Port = 9335; RestartExisting = $ExplicitRestart; PromptRestart = $PromptForRestart }
      if ($WithResultToken) { $startParameters.ResultToken = '0123456789abcdef0123456789abcdef' }
      if ($SelectTheme) { $startParameters.SavedThemeDirectory = 'fixture-saved-theme' }
      & $startBlock @startParameters
    } catch {
      $script:lastError = $_.Exception.Message
      $failed = $_.Exception.Message -like 'Dream Skin verification failed.*'
    }
  } finally {
    $env:LOCALAPPDATA = $originalLocalAppData
  }

  return [pscustomobject]@{
    Failed = $failed
    CodexStopped = $script:codexStopped
    CodexStarted = $script:codexStarted
    AppearanceInstallCalls = $script:appearanceInstallCalls
    AppearanceRestoreCalls = $script:appearanceRestoreCalls
    RemoveCalls = $script:removeCalls
    ResultAppearanceRecovery = $script:resultAppearanceRecovery
    LastError = $script:lastError
    RestartPromptCalls = $script:restartPromptCalls
    ThemeFingerprint = $script:themeFingerprint
    ThemeWriteCalls = $script:themeWriteCalls
    ThemeRestoreCalls = $script:themeRestoreCalls
    SnapshotRemoved = $script:snapshotRemoved
  }
}

# The exact renderer output from #267: theme installed and painted, every
# readiness signal true except the native-window probe.
$renderedPayload = @'
{"mode":"verify","port":9335,"targets":[{"targetId":"fixture-target","result":{
"installed":true,"version":"1.5.11","stylePresent":true,"homePresent":true,
"nativeWindow":{"pass":false,"bound":false,"reason":"target-window-unavailable"},
"documentVisibility":"visible","documentHidden":false,"viewport":{"width":1289,"height":829},
"readiness":{"windowPass":false,"documentPass":true,"viewportPass":true,"structurePass":true},
"pass":false}}]}
'@
$hiddenPayload = @'
{"mode":"verify","port":9335,"targets":[{"targetId":"fixture-target","result":{
"installed":true,"stylePresent":true,
"documentVisibility":"hidden","documentHidden":true,
"readiness":{"windowPass":false,"documentPass":false,"viewportPass":true,"structurePass":true},
"pass":false}}]}
'@
$malformedPayload = '{not-json'

$rendered = Invoke-DreamSkinStartupFixture `
  -VerifyPayloads @($renderedPayload, $malformedPayload) -OncePayload $malformedPayload
if (-not $rendered.Failed) {
  throw 'A failed verify must still abort startup even when the skin is rendered.'
}
if ($rendered.CodexStopped -or $rendered.CodexStarted) {
  throw 'Startup force-restarted Codex even though the renderer reported a visible, structurally complete skin.'
}
if ($rendered.AppearanceInstallCalls -ne 1 -or $rendered.AppearanceRestoreCalls -ne 0) {
  throw 'Rendered-but-unverified startup did not retain its applied appearance transaction.'
}

$onceRendered = Invoke-DreamSkinStartupFixture `
  -VerifyPayloads @($malformedPayload, $malformedPayload) -OncePayload $renderedPayload
if (-not $onceRendered.Failed -or $onceRendered.CodexStopped -or
  $onceRendered.AppearanceRestoreCalls -ne 0) {
  throw 'Visible evidence returned by the one-shot injection was not latched.'
}

$communityRendered = Invoke-DreamSkinStartupFixture `
  -VerifyPayloads @($renderedPayload, $malformedPayload) -OncePayload $malformedPayload `
  -WithResultToken
if (-not $communityRendered.Failed -or -not $communityRendered.CodexStopped -or
  -not $communityRendered.CodexStarted -or $communityRendered.AppearanceRestoreCalls -ne 1 -or
  "$($communityRendered.ResultAppearanceRecovery)" -cne 'restored') {
  throw 'A one-click rendered-but-unverified session was not closed and appearance-restored before parent rollback.'
}

$broken = Invoke-DreamSkinStartupFixture `
  -VerifyPayloads @($hiddenPayload, $malformedPayload) -OncePayload $hiddenPayload
if (-not $broken.Failed -or -not $broken.CodexStopped -or -not $broken.CodexStarted -or
  $broken.AppearanceRestoreCalls -ne 1) {
  throw 'A genuinely hidden renderer no longer closes Codex and restores appearance.'
}

$reused = Invoke-DreamSkinStartupFixture `
  -VerifyPayloads @($renderedPayload, $malformedPayload) -OncePayload $malformedPayload `
  -ReuseExistingCdp
if (-not $reused.Failed -or $reused.CodexStopped -or $reused.CodexStarted -or
  $reused.AppearanceInstallCalls -ne 0 -or $reused.AppearanceRestoreCalls -ne 0 -or
  $reused.RemoveCalls -ne 0) {
  throw 'A visible reused CDP session was removed or treated as a new appearance transaction.'
}

$reusedHidden = Invoke-DreamSkinStartupFixture `
  -VerifyPayloads @($hiddenPayload, $malformedPayload) -OncePayload $hiddenPayload `
  -ReuseExistingCdp
if (-not $reusedHidden.Failed -or $reusedHidden.CodexStopped -or
  $reusedHidden.CodexStarted -or $reusedHidden.AppearanceInstallCalls -ne 0 -or
  $reusedHidden.AppearanceRestoreCalls -ne 0 -or $reusedHidden.RemoveCalls -ne 1) {
  throw 'A hidden reused CDP session did not remove only its failed live injection.'
}
$explicitRestart = Invoke-DreamSkinStartupFixture `
  -VerifyPayloads @($renderedPayload, $malformedPayload) -OncePayload $malformedPayload `
  -ReuseExistingCdp -ExplicitRestart
if (-not $explicitRestart.Failed -or -not $explicitRestart.CodexStopped -or
  $explicitRestart.AppearanceInstallCalls -ne 1) {
  throw "Explicit restart was ignored for a still-live CDP session: $($explicitRestart.LastError)"
}
$promptedHidden = Invoke-DreamSkinStartupFixture -VerifyPayloads @($hiddenPayload, $renderedPayload) `
  -OncePayload $renderedPayload -ReuseExistingCdp -PromptForRestart -SelectTheme -SuccessfulVerification
if ($promptedHidden.RestartPromptCalls -ne 1 -or -not $promptedHidden.CodexStopped -or
  $promptedHidden.ThemeFingerprint -cne 'selected' -or -not $promptedHidden.SnapshotRemoved) {
  throw "Hidden manager apply did not recover with consent: $($promptedHidden.LastError)"
}
$declined = Invoke-DreamSkinStartupFixture -VerifyPayloads @($hiddenPayload) `
  -OncePayload $hiddenPayload -ReuseExistingCdp -PromptForRestart -DeclineRestart -SelectTheme
if ($declined.RestartPromptCalls -ne 1 -or $declined.CodexStopped -or $declined.ThemeWriteCalls -ne 0) {
  throw 'Declining hidden-session recovery mutated the theme or stopped Codex.'
}
$replaced = Invoke-DreamSkinStartupFixture -VerifyPayloads @($hiddenPayload) `
  -OncePayload $hiddenPayload -ReuseExistingCdp -PromptForRestart -ChangeIdentityAfterConsent -SelectTheme
if ($replaced.RestartPromptCalls -ne 1 -or $replaced.CodexStopped -or $replaced.ThemeWriteCalls -ne 0 -or
  $replaced.LastError -notlike '*session changed*') {
  throw 'A replacement CDP session was stopped after consent for another identity.'
}
foreach ($probe in @($renderedPayload, $malformedPayload, '{"targets":[]}',
  ('{"targets":[' + ((ConvertFrom-Json $hiddenPayload).targets[0] | ConvertTo-Json -Depth 8 -Compress) + ',{}]}'))) {
  $visibleApply = Invoke-DreamSkinStartupFixture -VerifyPayloads @($probe, $renderedPayload) `
    -OncePayload $renderedPayload -ReuseExistingCdp -PromptForRestart -SuccessfulVerification
  if ($visibleApply.RestartPromptCalls -ne 0 -or $visibleApply.CodexStopped) {
    throw 'Visible, malformed, empty or mixed target evidence triggered a restart prompt.'
  }
}
$failedSelection = Invoke-DreamSkinStartupFixture -VerifyPayloads @($hiddenPayload) `
  -OncePayload $hiddenPayload -ReuseExistingCdp -SelectTheme -WithResultToken
if (-not $failedSelection.Failed -or $failedSelection.ThemeFingerprint -cne 'previous' -or
  $failedSelection.ThemeRestoreCalls -ne 1 -or -not $failedSelection.SnapshotRemoved) {
  throw "Failed verification did not roll back its selection: $($failedSelection.LastError)"
}
$supersededSelection = Invoke-DreamSkinStartupFixture -VerifyPayloads @($hiddenPayload) `
  -OncePayload $hiddenPayload -ReuseExistingCdp -SelectTheme -SupersedeTheme
if ($supersededSelection.ThemeFingerprint -cne 'newer' -or $supersededSelection.ThemeRestoreCalls -ne 0) {
  throw 'Theme rollback overwrote a newer theme change.'
}
$partialWrite = Invoke-DreamSkinStartupFixture -VerifyPayloads @($hiddenPayload) `
  -OncePayload $hiddenPayload -ReuseExistingCdp -SelectTheme -WriteThemeFailure
if ($partialWrite.LastError -cne 'fixture-theme-write-failure' -or
  $partialWrite.ThemeFingerprint -cne 'previous' -or $partialWrite.ThemeRestoreCalls -ne 1) {
  throw 'A failed theme write was not restored inside its original operation lock.'
}

# The user-facing warning is asserted statically rather than through the
# fixture: Write-Warning resolves to the real cmdlet inside the script block, so
# a mock defined out here never sees it, and a fixture that silently captures
# nothing would pass no matter what the script does.
$startSource = [System.IO.File]::ReadAllText($startPath)
if (-not $startSource.Contains('the theme is rendered')) {
  throw 'Startup no longer explains why Codex was left running unverified.'
}

$startSource = [System.IO.File]::ReadAllText($startPath)
if (-not $startSource.Contains('$launchedWithCdp -and -not $skinLooksRendered')) {
  throw 'Startup no longer restarts Codex when the skin is not rendered.'
}
foreach ($required in @('$payload.targets', '$result.installed', '$result.stylePresent',
  '$readiness.documentPass', '$readiness.viewportPass', '$readiness.structurePass')) {
  if (-not $startSource.Contains($required)) {
    throw "The rendered-skin check no longer requires $required, so a broken session could be mistaken for a working one."
  }
}

Write-Output 'PASS: visible renderer evidence is latched for new and reused CDP sessions.'
