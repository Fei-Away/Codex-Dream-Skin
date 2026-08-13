[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts\localization-windows.ps1')
$startPath = Join-Path $Root 'scripts\start-dream-skin.ps1'
$source = [System.IO.File]::ReadAllText($startPath)
$dotSourcePattern = '(?m)^\.\s+\(Join-Path \$PSScriptRoot ''(?:common-windows|theme-windows|localization-windows)\.ps1''\)\r?\n'
if ([regex]::Matches($source, $dotSourcePattern).Count -ne 3) {
  throw 'RecoverExisting fixture could not isolate the three runtime imports.'
}
$source = [regex]::Replace($source, $dotSourcePattern, '')
$source = $source.Replace(
  '$Injector = Join-Path $PSScriptRoot ''injector.mjs''',
  '$Injector = ''mock-injector.mjs'''
)
$source = $source.Replace('(Split-Path -Parent $PSScriptRoot)', '''mock-skill-root''')
if ($source.Contains('$PSScriptRoot')) {
  throw 'RecoverExisting fixture left a real script-root dependency in isolated source.'
}
$startBlock = [scriptblock]::Create($source)

$script:recoverScenario = $null
$script:identityCalls = 0
$script:lockEnters = 0
$script:lockExits = 0
$script:mutations = @()

function Enter-DreamSkinOperationLock {
  param([int]$TimeoutMilliseconds)
  $script:lockEnters += 1
  return 'mock-lock'
}
function Exit-DreamSkinOperationLock { param([object]$Mutex); $script:lockExits += 1 }
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
function Test-DreamSkinPaused { param([string]$StateRoot); return [bool]$script:recoverScenario.Paused }
function Read-DreamSkinState { param([string]$Path); return $script:recoverScenario.State }
function Get-DreamSkinCodexStatePathCandidate { param([object]$State); return $null }
function Get-DreamSkinCodexInstallFromState {
  param([object]$State)
  if ($null -eq $State) { return $null }
  return Get-DreamSkinCodexInstall
}
function Test-DreamSkinPathEqual { param([string]$Left, [string]$Right); return $true }
function Get-DreamSkinCodexProcesses { param([object]$Codex); return @() }
function Get-DreamSkinVerifiedCdpIdentity {
  param([int]$Port, [object]$Codex)
  $sequence = @($script:recoverScenario.Identities)
  $index = $script:identityCalls
  $script:identityCalls += 1
  if ($index -ge $sequence.Count) { $index = $sequence.Count - 1 }
  if ($index -lt 0) { return $null }
  $browserId = $sequence[$index]
  if ($null -eq $browserId) { return $null }
  return [pscustomobject]@{ BrowserId = "$browserId" }
}
function Get-DreamSkinVerifiedCdpIdentityForAnyRegistered { param([int]$Port); return $null }
function Test-DreamSkinRecordedInjectorRunning {
  param([object]$State)
  return [bool]$script:recoverScenario.WatcherRunning
}
function Test-DreamSkinPendingAppearanceTransaction {
  param([string]$BackupPath)
  return [bool]$script:recoverScenario.Pending
}
function Add-RecoverMutation { param([string]$Name); $script:mutations += $Name; throw "unexpected mutation: $Name" }
function Start-DreamSkinCodexForDebugging { Add-RecoverMutation -Name 'debug-launch' }
function Start-DreamSkinCodex { Add-RecoverMutation -Name 'codex-start' }
function Stop-DreamSkinCodex { Add-RecoverMutation -Name 'codex-stop' }
function Install-DreamSkinBaseTheme { Add-RecoverMutation -Name 'appearance-write' }
function Stop-DreamSkinRecordedInjector { Add-RecoverMutation -Name 'injector-stop' }
function Set-DreamSkinPaused { Add-RecoverMutation -Name 'pause-write' }
function Start-Process { Add-RecoverMutation -Name 'injector-start' }
function Write-DreamSkinState { Add-RecoverMutation -Name 'state-write' }
function Invoke-DreamSkinNative { Add-RecoverMutation -Name 'renderer-call' }

$completeState = [pscustomobject]@{
  schemaVersion = 3
  platform = 'windows'
  port = 9335
  injectorPid = 1234
  injectorStartedAt = '2026-08-13T00:00:00.0000000Z'
  injectorPath = 'mock-injector.mjs'
  nodePath = 'mock-node.exe'
  codexExe = 'C:\Program Files\WindowsApps\OpenAI.Codex\app\ChatGPT.exe'
  codexPackageRoot = 'C:\Program Files\WindowsApps\OpenAI.Codex'
  codexPackageFullName = 'OpenAI.Codex_fixture'
  codexPackageFamilyName = 'OpenAI.Codex_fixture'
  browserId = 'browser-original'
}

$scenarios = @(
  [pscustomobject]@{
    Name = 'restart-parameters'; State = $completeState; Paused = $false
    WatcherRunning = $false; Pending = $false; Identities = @('browser-reopened')
    ExtraArguments = @('-PromptRestart'); MessageKey = 'RecoverCannotRestart'
  },
  [pscustomobject]@{
    Name = 'paused'; State = $completeState; Paused = $true
    WatcherRunning = $false; Pending = $false; Identities = @('browser-reopened')
    ExtraArguments = @(); MessageKey = 'RecoverPaused'
  },
  [pscustomobject]@{
    Name = 'missing-state'; State = $null; Paused = $false
    WatcherRunning = $false; Pending = $false; Identities = @('browser-reopened')
    ExtraArguments = @(); MessageKey = 'RecoverNoState'
  },
  [pscustomobject]@{
    Name = 'watcher-running'; State = $completeState; Paused = $false
    WatcherRunning = $true; Pending = $false; Identities = @('browser-reopened')
    ExtraArguments = @(); MessageKey = 'RecoverWatcherRunning'
  },
  [pscustomobject]@{
    Name = 'same-browser'; State = $completeState; Paused = $false
    WatcherRunning = $false; Pending = $false; Identities = @('browser-original')
    ExtraArguments = @(); MessageKey = 'RecoverSameSession'
  },
  [pscustomobject]@{
    Name = 'pending-appearance'; State = $completeState; Paused = $false
    WatcherRunning = $false; Pending = $true; Identities = @('browser-reopened')
    ExtraArguments = @(); MessageKey = 'RecoverPendingAppearance'
  },
  [pscustomobject]@{
    Name = 'no-verified-session'; State = $completeState; Paused = $false
    WatcherRunning = $false; Pending = $false; Identities = @($null)
    ExtraArguments = @(); MessageKey = 'RecoverNoSession'
  },
  [pscustomobject]@{
    Name = 'session-closes-before-attach'; State = $completeState; Paused = $false
    WatcherRunning = $false; Pending = $false; Identities = @('browser-reopened', $null)
    ExtraArguments = @(); MessageKey = 'RecoverSessionClosed'
  },
  [pscustomobject]@{
    Name = 'session-closes-before-final-check'; State = $completeState; Paused = $false
    WatcherRunning = $false; Pending = $false
    Identities = @('browser-reopened', 'browser-reopened', $null)
    ExtraArguments = @(); MessageKey = 'RecoverSessionClosed'
  }
)

$originalLocalAppData = $env:LOCALAPPDATA
$originalLanguage = $env:DREAMSKIN_LANG
$env:LOCALAPPDATA = Join-Path ([System.IO.Path]::GetTempPath()) `
  ('dreamskin-recover-existing-' + [guid]::NewGuid().ToString('N'))
$env:DREAMSKIN_LANG = 'en-US'
try {
  foreach ($scenario in $scenarios) {
    $script:recoverScenario = $scenario
    $script:identityCalls = 0
    $script:lockEnters = 0
    $script:lockExits = 0
    $script:mutations = @()
    $failure = $null
    try {
      $invokeParameters = @{ Port = 9335; RecoverExisting = $true }
      foreach ($extraArgument in @($scenario.ExtraArguments)) {
        $invokeParameters[$extraArgument.TrimStart('-')] = $true
      }
      & $startBlock @invokeParameters
    } catch {
      $failure = $_
    }
    $expectedMessage = Get-DreamSkinText -Key $scenario.MessageKey -Language 'en-US'
    if ($null -eq $failure -or $failure.Exception.Message -cne $expectedMessage -or
      $script:mutations.Count -ne 0 -or $script:lockEnters -ne 1 -or $script:lockExits -ne 1) {
      throw "RecoverExisting scenario '$($scenario.Name)' did not fail closed: " +
        "message=$($failure.Exception.Message); mutations=$($script:mutations -join ','); " +
        "locks=$script:lockEnters/$script:lockExits"
    }
  }
} finally {
  $env:LOCALAPPDATA = $originalLocalAppData
  $env:DREAMSKIN_LANG = $originalLanguage
}

Write-Output 'PASS: RecoverExisting never starts, restarts, resumes, or mutates Codex on unsafe recovery inputs.'
