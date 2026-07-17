[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 9347,
  [ValidateSet('Dark', 'Light')]
  [string]$Tone = 'Dark',
  [ValidateRange(500, 10000)]
  [int]$PollMilliseconds = 900,
  [switch]$IgnoreExisting,
  [string]$InstanceToken = ''
)

$ErrorActionPreference = 'Stop'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexMikuSkin'
$HookStatePath = Join-Path $StateRoot 'hook-state.json'
$RuntimeStatePath = Join-Path $StateRoot 'state.json'
$HookPausePath = Join-Path $StateRoot 'hook-pause.json'
$LogPath = Join-Path $StateRoot 'auto-hook.log'
$StartScript = Join-Path $PSScriptRoot 'start-miku-skin.ps1'
$ProcessIdentity = Join-Path $PSScriptRoot 'process-identity.ps1'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

if (-not (Test-Path -LiteralPath $ProcessIdentity)) {
  throw "Miku process identity helper not found: $ProcessIdentity"
}
. $ProcessIdentity
if ([string]::IsNullOrWhiteSpace($InstanceToken)) {
  $InstanceToken = [Guid]::NewGuid().ToString('N')
} elseif ($InstanceToken -notmatch '^[a-fA-F0-9]{32}$') {
  throw 'Invalid hook instance token.'
}

function Write-HookLog([string]$Message) {
  $line = (Get-Date).ToString('o') + ' ' + $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding utf8
}

function Test-CodexDebugPort([int]$CandidatePort) {
  try {
    $targets = Invoke-RestMethod "http://127.0.0.1:$CandidatePort/json/list" -TimeoutSec 1
    return [bool]($targets | Where-Object {
      $_.type -eq 'page' -and
      $_.url -like 'app://*' -and
      $_.webSocketDebuggerUrl -like "ws://127.0.0.1:$CandidatePort/*"
    })
  } catch {
    return $false
  }
}

function Get-CodexMainProcesses([string]$ExecutablePath) {
  return @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object {
    if ($_.MainWindowHandle -eq 0) { return $false }
    try {
      return [string]::Equals(
        $_.Path,
        $ExecutablePath,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    } catch {
      return $false
    }
  })
}

function Test-InjectorAlive([int]$ExpectedPort) {
  if (-not (Test-Path -LiteralPath $RuntimeStatePath)) { return $false }
  try {
    $state = Get-Content -LiteralPath $RuntimeStatePath -Raw | ConvertFrom-Json
    if ([int]$state.port -ne $ExpectedPort -or -not $state.injectorPid) { return $false }
    $stateInjector = if ($state.injectorPath) {
      [string]$state.injectorPath
    } elseif ($state.skillRoot) {
      Join-Path ([string]$state.skillRoot) 'scripts\injector.mjs'
    } else {
      Join-Path $PSScriptRoot 'injector.mjs'
    }
    $stateExecutable = if ($state.nodeExecutable) { [string]$state.nodeExecutable } else { '' }
    return Test-MikuInjectorProcess `
      -ProcessId ([int]$state.injectorPid) `
      -InjectorPath $stateInjector `
      -ExecutablePath $stateExecutable `
      -Port $ExpectedPort `
      -InstanceToken ([string]$state.instanceToken) `
      -StartedAt ([string]$(if ($state.injectorStartedAt) { $state.injectorStartedAt } else { $state.startedAt }))
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $StartScript)) {
  throw "Miku start script not found: $StartScript"
}
$package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if (-not $package) { throw 'The OpenAI.Codex Store package is not installed.' }
$CodexExe = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
if (-not (Test-Path -LiteralPath $CodexExe)) { throw "Codex executable not found: $CodexExe" }

$createdNew = $false
$mutex = [System.Threading.Mutex]::new(
  $true,
  'Local\CodexMikuSkinAutoHook',
  [ref]$createdNew
)
if (-not $createdNew) {
  $mutex.Dispose()
  exit 0
}

$ignoredPids = [System.Collections.Generic.HashSet[int]]::new()
if ($IgnoreExisting) {
  foreach ($process in (Get-CodexMainProcesses $CodexExe)) {
    [void]$ignoredPids.Add([int]$process.Id)
  }
}

$hookProcess = Get-MikuProcessRecord -ProcessId $PID
$hookStartedAt = if ($hookProcess -and $hookProcess.CreationDate) {
  ([DateTime]$hookProcess.CreationDate).ToUniversalTime().ToString('o')
} else {
  (Get-Date).ToUniversalTime().ToString('o')
}
$hookExecutable = if ($hookProcess -and $hookProcess.ExecutablePath) {
  [System.IO.Path]::GetFullPath([string]$hookProcess.ExecutablePath)
} else {
  [System.IO.Path]::GetFullPath([string](Get-Process -Id $PID -ErrorAction Stop).Path)
}

@{
  hookPid = $PID
  port = $Port
  tone = $Tone.ToLowerInvariant()
  startedAt = (Get-Date).ToString('o')
  ignoreExisting = [bool]$IgnoreExisting
  ignoredProcessIds = @($ignoredPids)
  executable = $CodexExe
  hookScript = [System.IO.Path]::GetFullPath($PSCommandPath)
  hookExecutable = $hookExecutable
  hookStartedAt = $hookStartedAt
  instanceToken = $InstanceToken
} | ConvertTo-Json | Set-Content -LiteralPath $HookStatePath -Encoding utf8

Write-HookLog "hook-start pid=$PID port=$Port tone=$Tone ignored=$(@($ignoredPids) -join ',')"
$lastAttempt = [DateTime]::MinValue
try {
  while ($true) {
    try {
      $pauseActive = $false
      $pauseTransition = Enter-MikuRuntimeTransition
      try {
        $processes = @(Get-CodexMainProcesses $CodexExe)
        $currentIds = @($processes | ForEach-Object { [int]$_.Id })
        if (Test-Path -LiteralPath $HookPausePath) {
          $pausedProcessIds = @()
          try {
            $pauseState = Get-Content -LiteralPath $HookPausePath -Raw | ConvertFrom-Json
            $pausedProcessIds = @($pauseState.processIds | ForEach-Object { [int]$_ })
          } catch {
            Write-HookLog 'pause-state-invalid action=clear'
          }
          $activePausedIds = @($pausedProcessIds | Where-Object { $_ -in $currentIds })
          if ($activePausedIds.Count -gt 0) {
            $pauseActive = $true
          } else {
            Remove-Item -LiteralPath $HookPausePath -Force -ErrorAction SilentlyContinue
            Write-HookLog 'pause-complete action=resume-next-launch'
          }
        }
      } finally {
        Exit-MikuRuntimeTransition -Mutex $pauseTransition
      }
      if ($pauseActive) {
        Start-Sleep -Milliseconds $PollMilliseconds
        continue
      }

      foreach ($ignoredId in @($ignoredPids)) {
        if ($ignoredId -notin $currentIds) {
          [void]$ignoredPids.Remove($ignoredId)
        }
      }

      if (Test-CodexDebugPort $Port) {
        if (-not (Test-InjectorAlive $Port)) {
          if (((Get-Date) - $lastAttempt).TotalSeconds -ge 10) {
            $lastAttempt = Get-Date
            Write-HookLog 'cdp-ready injector-missing action=start-injector'
            & $StartScript -Port $Port -Tone $Tone -HookInvocation
          }
        }
      } else {
        $unskinned = @($processes | Where-Object {
          -not $ignoredPids.Contains([int]$_.Id)
        })
        if ($unskinned.Count -gt 0 -and ((Get-Date) - $lastAttempt).TotalSeconds -ge 10) {
          $lastAttempt = Get-Date
          $ids = @($unskinned | ForEach-Object { $_.Id }) -join ','
          Write-HookLog "unskinned-codex detected=$ids action=controlled-restart"
          $targetPid = [int]$unskinned[0].Id
          & $StartScript -Port $Port -Tone $Tone -RestartProcessId $targetPid -HookInvocation
        }
      }
    } catch {
      Write-HookLog ("loop-error " + $_.Exception.Message.Replace([Environment]::NewLine, ' '))
      Start-Sleep -Seconds 5
    }
    Start-Sleep -Milliseconds $PollMilliseconds
  }
} finally {
  try {
    if (Test-Path -LiteralPath $HookStatePath) {
      $state = Get-Content -LiteralPath $HookStatePath -Raw | ConvertFrom-Json
      if ([int]$state.hookPid -eq $PID) {
        Remove-Item -LiteralPath $HookStatePath -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}
  Write-HookLog "hook-stop pid=$PID"
  try { $mutex.ReleaseMutex() } catch {}
  $mutex.Dispose()
}
