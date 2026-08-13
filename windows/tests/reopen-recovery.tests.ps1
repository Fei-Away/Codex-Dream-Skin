[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts\common-windows.ps1')

$currentProcess = Get-Process -Id $PID -ErrorAction Stop
try {
  $currentStartedAt = $currentProcess.StartTime.ToUniversalTime().ToString('o')
  $liveState = [pscustomobject]@{
    injectorPid = $PID
    injectorStartedAt = $currentStartedAt
  }
  if (-not (Test-DreamSkinRecordedInjectorRunning -State $liveState)) {
    throw 'The recorded injector liveness check rejected an exact PID and process start time.'
  }
  $reusedPidState = $liveState.PSObject.Copy()
  $reusedPidState.injectorStartedAt = ([datetime]::Parse($currentStartedAt)).AddSeconds(-1).ToString('o')
  if (Test-DreamSkinRecordedInjectorRunning -State $reusedPidState) {
    throw 'The recorded injector liveness check accepted a reused PID with a different start time.'
  }
} finally {
  $currentProcess.Dispose()
}

$realRecordedInjectorProbe = (
  Get-Command Test-DreamSkinRecordedInjectorRunning -CommandType Function
).ScriptBlock
$realPortAvailabilityProbe = (Get-Command Test-DreamSkinPortAvailable -CommandType Function).ScriptBlock
$realStateInstallProbe = (Get-Command Get-DreamSkinCodexInstallFromState -CommandType Function).ScriptBlock
$realIdentityProbe = (Get-Command Get-DreamSkinVerifiedCdpIdentity -CommandType Function).ScriptBlock
$realRegisteredIdentityProbe = (
  Get-Command Get-DreamSkinVerifiedCdpIdentityForAnyRegistered -CommandType Function
).ScriptBlock
$script:recoveryProbe = @{
  InjectorRunning = $false
  PortAvailable = $false
  Identity = [pscustomobject]@{ BrowserId = 'browser-reopened' }
  RegisteredIdentity = $null
}
try {
  function Test-DreamSkinRecordedInjectorRunning {
    param([AllowNull()][object]$State)
    return [bool]$script:recoveryProbe.InjectorRunning
  }
  function Test-DreamSkinPortAvailable {
    param([int]$Port)
    return [bool]$script:recoveryProbe.PortAvailable
  }
  function Get-DreamSkinCodexInstallFromState {
    param([AllowNull()][object]$State)
    return [pscustomobject]@{ Executable = 'official-codex-fixture.exe' }
  }
  function Get-DreamSkinVerifiedCdpIdentity {
    param([int]$Port, [Parameter(Mandatory = $true)][object]$Codex)
    return $script:recoveryProbe.Identity
  }
  function Get-DreamSkinVerifiedCdpIdentityForAnyRegistered {
    param([int]$Port)
    return $script:recoveryProbe.RegisteredIdentity
  }

  $recoveryState = [pscustomobject]@{
    schemaVersion = 3
    port = 9335
    injectorPid = 1234
    injectorStartedAt = '2026-08-13T00:00:00.0000000Z'
    browserId = 'browser-original'
  }
  $recoveryContext = Get-DreamSkinInjectorRecoveryContext -State $recoveryState
  if ($null -eq $recoveryContext -or $recoveryContext.Port -ne 9335 -or
    "$($recoveryContext.BrowserId)" -cne 'browser-reopened') {
    throw 'A stopped injector with a replacement verified official Codex endpoint was not recoverable.'
  }

  $script:recoveryProbe.InjectorRunning = $true
  if ($null -ne (Get-DreamSkinInjectorRecoveryContext -State $recoveryState)) {
    throw 'Tray recovery would start a second injector while the recorded watcher is alive.'
  }
  $script:recoveryProbe.InjectorRunning = $false

  $script:recoveryProbe.Identity = [pscustomobject]@{ BrowserId = 'browser-original' }
  if ($null -ne (Get-DreamSkinInjectorRecoveryContext -State $recoveryState)) {
    throw 'Tray recovery accepted the original Browser identity instead of a replacement endpoint.'
  }

  $script:recoveryProbe.Identity = [pscustomobject]@{ BrowserId = 'browser-reopened' }
  $script:recoveryProbe.PortAvailable = $true
  if ($null -ne (Get-DreamSkinInjectorRecoveryContext -State $recoveryState)) {
    throw 'Tray recovery would run after the saved CDP port closed.'
  }
  $script:recoveryProbe.PortAvailable = $false

  $script:recoveryProbe.Identity = $null
  if ($null -ne (Get-DreamSkinInjectorRecoveryContext -State $recoveryState)) {
    throw 'Tray recovery accepted an endpoint without official Codex ownership.'
  }

  $script:recoveryProbe.RegisteredIdentity = [pscustomobject]@{
    Codex = [pscustomobject]@{ Executable = 'updated-official-codex-fixture.exe' }
    Identity = [pscustomobject]@{ BrowserId = 'browser-store-updated' }
  }
  $updatedContext = Get-DreamSkinInjectorRecoveryContext -State $recoveryState
  if ($null -eq $updatedContext -or
    "$($updatedContext.BrowserId)" -cne 'browser-store-updated') {
    throw 'Tray recovery lost the registered-package fallback used after Store updates.'
  }
} finally {
  Set-Item -Path Function:\Test-DreamSkinRecordedInjectorRunning -Value $realRecordedInjectorProbe
  Set-Item -Path Function:\Test-DreamSkinPortAvailable -Value $realPortAvailabilityProbe
  Set-Item -Path Function:\Get-DreamSkinCodexInstallFromState -Value $realStateInstallProbe
  Set-Item -Path Function:\Get-DreamSkinVerifiedCdpIdentity -Value $realIdentityProbe
  Set-Item -Path Function:\Get-DreamSkinVerifiedCdpIdentityForAnyRegistered `
    -Value $realRegisteredIdentityProbe
}

$commonSource = [System.IO.File]::ReadAllText((Join-Path $Root 'scripts\common-windows.ps1'))
$recoveryStart = $commonSource.IndexOf(
  'function Get-DreamSkinInjectorRecoveryContext',
  [System.StringComparison]::Ordinal
)
$recoveryEnd = $commonSource.IndexOf(
  'function Stop-DreamSkinRecordedInjector',
  $recoveryStart,
  [System.StringComparison]::Ordinal
)
if ($recoveryStart -lt 0 -or $recoveryEnd -le $recoveryStart) {
  throw 'The injector recovery context could not be isolated for safety checks.'
}
$recoverySource = $commonSource.Substring($recoveryStart, $recoveryEnd - $recoveryStart)
if ($recoverySource.Contains('CommandLine') -or $recoverySource.Contains('[regex]')) {
  throw 'The recovery monitor brought back raw command-line process matching instead of PID/start-time liveness.'
}

$traySource = [System.IO.File]::ReadAllText((Join-Path $Root 'scripts\tray-dream-skin.ps1'))
foreach ($requiredTrayRecovery in @(
  'Get-DreamSkinInjectorRecoveryContext',
  '[System.Windows.Forms.Timer]::new()',
  "'-RecoverExisting'",
  '-PassThru'
)) {
  if (-not $traySource.Contains($requiredTrayRecovery)) {
    throw "The single-instance tray recovery monitor is missing: $requiredTrayRecovery"
  }
}

Write-Output 'PASS: reopen recovery requires a stopped watcher and a replacement official Browser identity.'
