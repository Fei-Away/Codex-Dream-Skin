[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = 'Stop'
$startPath = Join-Path $Root 'scripts\start-dream-skin.ps1'
$source = [System.IO.File]::ReadAllText($startPath)
$dotSourcePattern = '(?m)^\.\s+\(Join-Path \$PSScriptRoot ''(?:common-windows|theme-windows)\.ps1''\)\r?\n'
if ([regex]::Matches($source, $dotSourcePattern).Count -ne 2) {
  throw 'Start readiness fixture could not isolate the two runtime imports.'
}
$source = [regex]::Replace($source, $dotSourcePattern, '')
$source = $source.Replace(
  '$Injector = Join-Path $PSScriptRoot ''injector.mjs''',
  '$Injector = ''mock-injector.mjs'''
)
$source = $source.Replace(
  '(Split-Path -Parent $PSScriptRoot)',
  '''mock-skill-root'''
)
if ($source.Contains('$PSScriptRoot')) {
  throw 'Start readiness fixture left a real script-root dependency in the isolated source.'
}

$script:daemon = [pscustomobject]@{ Id = 4242; HasExited = $false }
$script:daemon | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {
  param([int]$Milliseconds)
  return $this.HasExited
}
$script:dateCall = 0
$script:verifyCalls = 0
$script:onceCalls = 0
$script:removeCalls = 0
$script:stateWritten = $false
$script:stateRemoved = $false
$script:daemonStopped = $false
$script:lockExited = $false
$script:hostMessages = @()

function Enter-DreamSkinOperationLock {
  param([int]$TimeoutMilliseconds)
  return 'mock-lock'
}
function Exit-DreamSkinOperationLock {
  param([object]$Mutex)
  if ($Mutex -eq 'mock-lock') { $script:lockExited = $true }
}
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
    Version = '26.721.1.0'
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
function Read-DreamSkinState { param([string]$Path); return $null }
function Get-DreamSkinCodexStatePathCandidate { param([object]$State); return $null }
function Get-DreamSkinCodexInstallFromState { param([object]$State); return $null }
function Get-DreamSkinCodexProcesses { param([object]$Codex); return @() }
function Test-DreamSkinPathEqual { param([string]$Left, [string]$Right); return $true }
function Get-DreamSkinVerifiedCdpIdentity {
  param([int]$Port, [object]$Codex)
  return [pscustomobject]@{ BrowserId = 'fixture-browser' }
}
function Stop-DreamSkinRecordedInjector { param([object]$State); return $true }
function Set-DreamSkinPaused { param([bool]$Paused, [string]$StateRoot); return $true }
function Invoke-DreamSkinCodexWindowActivation { param([object]$Codex); return $true }
function ConvertTo-DreamSkinProcessArgument { param([string]$Value); return $Value }
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
function Get-DreamSkinProcessStartedAt { param([int]$ProcessId); return '2026-07-25T00:00:00.0000000Z' }
function Write-DreamSkinState {
  param([string]$Path, [object]$State)
  $script:stateWritten = $true
}
function Invoke-DreamSkinNative {
  param([string]$FilePath, [object[]]$ArgumentList, [switch]$DiscardStderr)
  if ($ArgumentList -contains '--verify') {
    $script:verifyCalls += 1
    return [pscustomobject]@{ ExitCode = 2; Output = @('{"pass":false}') }
  }
  if ($ArgumentList -contains '--once') {
    $script:onceCalls += 1
    return [pscustomobject]@{ ExitCode = 2; Output = @('{"mode":"once","targets":[]}') }
  }
  if ($ArgumentList -contains '--remove') {
    $script:removeCalls += 1
    return [pscustomobject]@{ ExitCode = 0; Output = @() }
  }
  throw 'The startup fixture received an unexpected native command.'
}
function Write-DreamSkinUtf8FileAtomically { param([string]$Path, [string]$Content) }
function Get-Date {
  $script:dateCall += 1
  return [DateTime]::new(2026, 7, 25, 0, 0, 0, [DateTimeKind]::Utc).AddSeconds(120 * $script:dateCall)
}
function Start-Sleep { param([int]$Milliseconds, [int]$Seconds) }
function Stop-Process {
  [CmdletBinding()]
  param([object]$InputObject, [switch]$Force)
  $InputObject.HasExited = $true
  $script:daemonStopped = $true
}
function Remove-Item {
  [CmdletBinding()]
  param([string]$LiteralPath, [switch]$Force)
  if ([System.IO.Path]::GetFileName($LiteralPath) -ceq 'state.json') {
    $script:stateRemoved = $true
  }
}
function Write-Host {
  param([Parameter(ValueFromRemainingArguments = $true)][object[]]$Object)
  $script:hostMessages += ($Object -join ' ')
}

$originalLocalAppData = $env:LOCALAPPDATA
$env:LOCALAPPDATA = Join-Path ([System.IO.Path]::GetTempPath()) 'dreamskin-start-readiness-fixture'
$failed = $false
try {
  $startBlock = [scriptblock]::Create($source)
  try {
    & $startBlock -Port 9335
  } catch {
    $failed = $_.Exception.Message -like 'Dream Skin verification failed.*'
  }
} finally {
  $env:LOCALAPPDATA = $originalLocalAppData
}

$announcedActive = @($script:hostMessages | Where-Object {
  $_ -like 'Codex Dream Skin is active*'
}).Count -gt 0
if (-not $failed -or $script:verifyCalls -ne 1 -or $script:onceCalls -ne 1 -or
  $script:removeCalls -ne 1 -or
  -not $script:stateWritten -or -not $script:stateRemoved -or
  -not $script:daemonStopped -or -not $script:daemon.HasExited -or
  -not $script:lockExited -or $announcedActive) {
  throw 'A failed renderer readiness check did not stop startup and run the existing rollback path.'
}

Write-Output 'PASS: renderer readiness failure stops Windows startup and clears transient state.'
