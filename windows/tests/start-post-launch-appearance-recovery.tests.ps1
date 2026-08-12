[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts\localization-windows.ps1')
$startPath = Join-Path $Root 'scripts\start-dream-skin.ps1'
$source = [System.IO.File]::ReadAllText($startPath)
$dotSourcePattern = '(?m)^\.\s+\(Join-Path \$PSScriptRoot ''(?:common-windows|theme-windows|localization-windows)\.ps1''\)\r?\n'
if ([regex]::Matches($source, $dotSourcePattern).Count -ne 3) {
  throw 'Post-launch failure fixture could not isolate the three runtime imports.'
}
$source = [regex]::Replace($source, $dotSourcePattern, '')
$source = $source.Replace(
  '$Injector = Join-Path $PSScriptRoot ''injector.mjs''',
  '$Injector = ''mock-injector.mjs'''
)
$source = $source.Replace('(Split-Path -Parent $PSScriptRoot)', '''mock-skill-root''')
if ($source.Contains('$PSScriptRoot')) {
  throw 'Post-launch failure fixture left a real script-root dependency in isolated source.'
}
$startBlock = [scriptblock]::Create($source)

$script:scenario = ''
$script:cdpReady = $false
$script:events = @()
$script:installCalls = 0
$script:restoreCalls = 0
$script:lockEnters = 0
$script:lockExits = 0
$script:themeFingerprint = 'theme-before'

function Enter-DreamSkinOperationLock {
  param([int]$TimeoutMilliseconds)
  $script:lockEnters += 1
  return "mock-lock-$($script:lockEnters)"
}
function Exit-DreamSkinOperationLock {
  param([object]$Mutex)
  $script:lockExits += 1
}
function Assert-DreamSkinPort { param([int]$Port) }
function Get-DreamSkinNodeRuntime {
  return [pscustomobject]@{ Path = 'Invoke-MockForegroundInjector'; Version = '22.23.1' }
}
function Get-DreamSkinCodexInstall {
  return [pscustomobject]@{
    Executable = 'C:\Program Files\WindowsApps\OpenAI.Codex\app\ChatGPT.exe'
    PackageRoot = 'C:\Program Files\WindowsApps\OpenAI.Codex'
    PackageFullName = 'OpenAI.Codex_fixture'
    PackageFamilyName = 'OpenAI.Codex_fixture'
    Version = '26.803.5235.0'
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
function Get-DreamSkinCodexProcesses {
  param([object]$Codex)
  if ($script:cdpReady) { return @([pscustomobject]@{ ProcessId = 4242 }) }
  return @()
}
function Get-DreamSkinVerifiedCdpIdentity {
  param([int]$Port, [object]$Codex)
  if ($script:cdpReady) { return [pscustomobject]@{ BrowserId = 'fixture-browser' } }
  return $null
}
function Get-DreamSkinVerifiedCdpIdentityForAnyRegistered { param([int]$Port); return $null }
function Test-DreamSkinPortAvailable { param([int]$Port); return $true }
function Get-DreamSkinActiveThemeAppearance { param([string]$ThemeDirectory); return 'dark' }
function Get-DreamSkinThemeRuntimeContentFingerprint {
  param([string]$ThemeDirectory)
  return $script:themeFingerprint
}
function Install-DreamSkinBaseTheme {
  param(
    [string]$ConfigPath, [string]$BackupPath, [string]$AppearanceTheme,
    [switch]$PassThruTransaction
  )
  $script:installCalls += 1
  return [pscustomobject]@{ SchemaVersion = 1 }
}
function Start-DreamSkinCodexForDebugging {
  param([object]$Codex, [string[]]$Arguments, [int]$Port, [int[]]$PreserveProcessIds)
  $script:events += 'launch'
  $script:cdpReady = $true
  return [pscustomobject]@{ Strategy = 'package-activation' }
}
function Stop-DreamSkinRecordedInjector { param([object]$State); return $true }
function Set-DreamSkinPaused {
  param([bool]$Paused, [string]$StateRoot)
  if ($script:scenario -ceq 'pause' -and -not $Paused) {
    throw 'forced pause clear failure'
  }
  return $true
}
function Stop-DreamSkinCodex {
  param([object]$Codex, [int[]]$PreserveProcessIds, [switch]$AllowForce)
  $script:events += 'stop'
  $script:cdpReady = $false
}
function Restore-DreamSkinManagedAppearanceSnapshot {
  param([string]$ConfigPath, [string]$BackupPath, [object]$Transaction)
  $script:events += 'restore'
  $script:restoreCalls += 1
  return [pscustomobject]@{ ConflictedKeys = @(); MarkerStatus = 'restored' }
}
function Complete-DreamSkinAppearanceTransaction { param([string]$BackupPath, [object]$Transaction) }
function Start-DreamSkinCodex {
  param([object]$Codex)
  $script:events += 'start'
  return 909
}
function Invoke-MockForegroundInjector {
  if ($script:scenario -ceq 'foreground-superseded') {
    $script:themeFingerprint = 'theme-newer'
  }
  throw 'forced foreground injector failure'
}
function Remove-Item {
  [CmdletBinding()]
  param([string]$LiteralPath, [switch]$Force)
}
function Write-Host { param([Parameter(ValueFromRemainingArguments = $true)][object[]]$Object) }

function Invoke-PostLaunchFailureFixture {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('pause', 'foreground', 'foreground-superseded')]
    [string]$Scenario
  )
  $script:scenario = $Scenario
  $script:cdpReady = $false
  $script:events = @()
  $script:installCalls = 0
  $script:restoreCalls = 0
  $script:lockEnters = 0
  $script:lockExits = 0
  $script:themeFingerprint = 'theme-before'
  $failure = $null
  try {
    if ($Scenario.StartsWith('foreground', [System.StringComparison]::Ordinal)) {
      & $startBlock -Port 9335 -ForegroundInjector
    } else {
      & $startBlock -Port 9335
    }
  } catch {
    $failure = $_
  }
  return [pscustomobject]@{
    Failure = $failure
    Events = ($script:events -join ',')
    InstallCalls = $script:installCalls
    RestoreCalls = $script:restoreCalls
    LockEnters = $script:lockEnters
    LockExits = $script:lockExits
  }
}

$originalLocalAppData = $env:LOCALAPPDATA
$env:LOCALAPPDATA = Join-Path ([System.IO.Path]::GetTempPath()) `
  ('dreamskin-post-launch-failure-' + [guid]::NewGuid().ToString('N'))
try {
  $pause = Invoke-PostLaunchFailureFixture -Scenario 'pause'
  if ($null -eq $pause.Failure -or
    $pause.Failure.Exception.Message -cne 'forced pause clear failure' -or
    $pause.Events -cne 'launch,stop,restore,start' -or
    $pause.InstallCalls -ne 1 -or $pause.RestoreCalls -ne 1 -or
    $pause.LockEnters -ne 1 -or $pause.LockExits -ne 1) {
    throw 'Pause-clear failure did not close Codex, restore appearance, and reopen normally.'
  }

  $foreground = Invoke-PostLaunchFailureFixture -Scenario 'foreground'
  if ($null -eq $foreground.Failure -or
    $foreground.Failure.Exception.Message -cne 'forced foreground injector failure' -or
    $foreground.Events -cne 'launch,stop,restore,start' -or
    $foreground.InstallCalls -ne 1 -or $foreground.RestoreCalls -ne 1 -or
    $foreground.LockEnters -ne 2 -or $foreground.LockExits -ne 2) {
    throw 'Immediate foreground failure did not reacquire the lock and restore this launch.'
  }

  $superseded = Invoke-PostLaunchFailureFixture -Scenario 'foreground-superseded'
  if ($null -eq $superseded.Failure -or
    $superseded.Failure.Exception.Message -cne 'forced foreground injector failure' -or
    $superseded.Events -cne 'launch' -or
    $superseded.InstallCalls -ne 1 -or $superseded.RestoreCalls -ne 0 -or
    $superseded.LockEnters -ne 2 -or $superseded.LockExits -ne 2) {
    throw 'Foreground recovery overwrote a newer active-theme selection made while its lock was released.'
  }
} finally {
  $env:LOCALAPPDATA = $originalLocalAppData
}

Write-Output 'PASS: post-launch startup failures recover this attempt before normal reopen.'
