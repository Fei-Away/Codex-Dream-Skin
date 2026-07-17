[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$TaskName = 'Codex Miku Stage Auto Hook'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexMikuSkin'
$HookStatePath = Join-Path $StateRoot 'hook-state.json'
$RegistrationPath = Join-Path $StateRoot 'hook-registration.json'
$HookPausePath = Join-Path $StateRoot 'hook-pause.json'
$ProcessIdentity = Join-Path $PSScriptRoot 'process-identity.ps1'

if (-not (Test-Path -LiteralPath $ProcessIdentity)) {
  throw "Miku process identity helper not found: $ProcessIdentity"
}
. $ProcessIdentity

$registration = $null
if (Test-Path -LiteralPath $RegistrationPath) {
  try {
    $registration = Get-Content -LiteralPath $RegistrationPath -Raw | ConvertFrom-Json
  } catch {}
}

if (Test-Path -LiteralPath $HookStatePath) {
  try {
    $state = Get-Content -LiteralPath $HookStatePath -Raw | ConvertFrom-Json
    if ($state.hookPid) {
      $hookScript = if ($state.hookScript) {
        [string]$state.hookScript
      } elseif ($registration -and $registration.engineRoot) {
        Join-Path ([string]$registration.engineRoot) 'scripts\hook-miku-skin.ps1'
      } else {
        Join-Path (Join-Path $StateRoot 'engine') 'scripts\hook-miku-skin.ps1'
      }
      $hookPort = if ($state.port) {
        [int]$state.port
      } elseif ($registration -and $registration.port) {
        [int]$registration.port
      } else {
        9347
      }
      $hookExecutable = if ($state.hookExecutable) {
        [string]$state.hookExecutable
      } elseif ($registration -and $registration.hookExecutable) {
        [string]$registration.hookExecutable
      } else {
        ''
      }
      [void](Stop-MikuHookProcess `
        -ProcessId ([int]$state.hookPid) `
        -HookScriptPath $hookScript `
        -ExecutablePath $hookExecutable `
        -Port $hookPort `
        -InstanceToken ([string]$state.instanceToken) `
        -StartedAt ([string]$(if ($state.hookStartedAt) { $state.hookStartedAt } else { $state.startedAt })))
    }
  } catch {}
  Remove-Item -LiteralPath $HookStatePath -Force -ErrorAction SilentlyContinue
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Remove-Item -LiteralPath $RegistrationPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $HookPausePath -Force -ErrorAction SilentlyContinue
Write-Host 'Codex Miku Stage auto hook was unregistered.'
