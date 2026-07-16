[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 9347,
  [ValidateSet('Dark', 'Light')]
  [string]$Tone = 'Dark',
  [bool]$StartNow = $true
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Codex Miku Stage Auto Hook'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexMikuSkin'
$EngineRoot = Join-Path $StateRoot 'engine'
$HookScript = Join-Path $EngineRoot 'scripts\hook-miku-skin.ps1'
$HookStatePath = Join-Path $StateRoot 'hook-state.json'
$RegistrationPath = Join-Path $StateRoot 'hook-registration.json'
$ProcessIdentity = Join-Path $PSScriptRoot 'process-identity.ps1'
if (-not (Test-Path -LiteralPath $HookScript)) {
  throw "Installed hook not found: $HookScript. Run install-miku-skin.ps1 first."
}
if (-not (Test-Path -LiteralPath $ProcessIdentity)) {
  throw "Miku process identity helper not found: $ProcessIdentity"
}
. $ProcessIdentity

if (Test-Path -LiteralPath $HookStatePath) {
  try {
    $existing = Get-Content -LiteralPath $HookStatePath -Raw | ConvertFrom-Json
    if ($existing.hookPid) {
      $existingScript = if ($existing.hookScript) {
        [string]$existing.hookScript
      } else {
        $HookScript
      }
      $existingPort = if ($existing.port) { [int]$existing.port } else { $Port }
      $existingExecutable = if ($existing.hookExecutable) {
        [string]$existing.hookExecutable
      } else {
        ''
      }
      $stoppedExistingHook = Stop-MikuHookProcess `
        -ProcessId ([int]$existing.hookPid) `
        -HookScriptPath $existingScript `
        -ExecutablePath $existingExecutable `
        -Port $existingPort `
        -InstanceToken ([string]$existing.instanceToken) `
        -StartedAt ([string]$(if ($existing.hookStartedAt) { $existing.hookStartedAt } else { $existing.startedAt }))
      if ($stoppedExistingHook) {
        $stopDeadline = (Get-Date).AddSeconds(4)
        while ((Get-MikuProcessRecord -ProcessId ([int]$existing.hookPid)) -and
               (Get-Date) -lt $stopDeadline) {
          Start-Sleep -Milliseconds 100
        }
      }
    }
  } catch {}
  Remove-Item -LiteralPath $HookStatePath -Force -ErrorAction SilentlyContinue
}

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$hookToken = [Guid]::NewGuid().ToString('N')
$arguments =
  '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' +
  $HookScript +
  '" -Port ' +
  $Port +
  ' -Tone ' +
  $Tone +
  ' -InstanceToken ' +
  $hookToken
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $EngineRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principalArgs = @{
  UserId = $userId
  LogonType = 'Interactive'
  RunLevel = 'Limited'
}
$principal = New-ScheduledTaskPrincipal @principalArgs
$settingsArgs = @{
  AllowStartIfOnBatteries = $true
  DontStopIfGoingOnBatteries = $true
  ExecutionTimeLimit = [TimeSpan]::Zero
  MultipleInstances = 'IgnoreNew'
  RestartCount = 3
  RestartInterval = (New-TimeSpan -Minutes 1)
}
$settings = New-ScheduledTaskSettingsSet @settingsArgs
$taskArgs = @{
  Action = $action
  Trigger = $trigger
  Principal = $principal
  Settings = $settings
  Description = 'Watch for the official Windows Codex process and apply the loopback Miku Stage CDP skin.'
}
$task = New-ScheduledTask @taskArgs
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

@{
  taskName = $TaskName
  registeredAt = (Get-Date).ToString('o')
  user = $userId
  port = $Port
  tone = $Tone.ToLowerInvariant()
  engineRoot = $EngineRoot
  startNow = $StartNow
  currentProcessIgnored = $StartNow
  instanceToken = $hookToken
  hookExecutable = $powershell
} | ConvertTo-Json | Set-Content -LiteralPath $RegistrationPath -Encoding utf8

if ($StartNow) {
  $liveArguments =
    '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' +
    $HookScript +
    '" -Port ' +
    $Port +
    ' -Tone ' +
    $Tone +
    ' -InstanceToken ' +
    $hookToken +
    ' -IgnoreExisting'
  $startArgs = @{
    FilePath = $powershell
    ArgumentList = $liveArguments
    WorkingDirectory = $EngineRoot
    WindowStyle = 'Hidden'
  }
  Start-Process @startArgs | Out-Null
  $deadline = (Get-Date).AddSeconds(8)
  while (-not (Test-Path -LiteralPath $HookStatePath)) {
    if ((Get-Date) -ge $deadline) {
      throw "The scheduled hook was registered, but the live hook did not create $HookStatePath."
    }
    Start-Sleep -Milliseconds 250
  }
}

Write-Host "Codex Miku Stage auto hook registered for $userId."
if ($StartNow) {
  Write-Host 'The current Codex process was ignored; the next normal Codex launch will be restarted once with CDP and skinned automatically.'
}
