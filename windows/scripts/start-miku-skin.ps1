[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 9347,
  [ValidateSet('Dark', 'Light')]
  [string]$Tone = 'Dark',
  [switch]$RestartExisting,
  [ValidateRange(0, 2147483647)]
  [int]$RestartProcessId = 0,
  [string]$ProfilePath,
  [switch]$ForegroundInjector
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$Injector = Join-Path $PSScriptRoot 'injector.mjs'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexMikuSkin'
$StatePath = Join-Path $StateRoot 'state.json'
$StdoutPath = Join-Path $StateRoot 'injector.log'
$StderrPath = Join-Path $StateRoot 'injector-error.log'
$ProcessIdentity = Join-Path $PSScriptRoot 'process-identity.ps1'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

if (-not (Test-Path -LiteralPath $ProcessIdentity)) {
  throw "Miku process identity helper not found: $ProcessIdentity"
}
. $ProcessIdentity

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

function Test-LoopbackPort([int]$CandidatePort) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $CandidatePort)
    return $task.Wait(500) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $Injector)) {
  throw "Miku injector not found: $Injector"
}
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw 'Node.js is required by the CDP injector but node.exe was not found on PATH.'
}
$node = $nodeCommand.Source
$package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if (-not $package) { throw 'The OpenAI.Codex Store package is not installed.' }
$exe = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "Codex executable not found: $exe" }

$debugReady = Test-CodexDebugPort $Port
if (-not $debugReady -and (Test-LoopbackPort $Port)) {
  throw "Port $Port is already occupied by a non-Codex process. Choose another -Port value."
}

$mainProcesses = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object {
  if ($_.MainWindowHandle -eq 0) { return $false }
  try {
    return [string]::Equals(
      $_.Path,
      $exe,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  } catch {
    return $false
  }
})
if (-not $debugReady -and -not $ProfilePath -and $mainProcesses.Count -gt 0) {
  if (-not $RestartExisting -and $RestartProcessId -eq 0) {
    throw "Codex is already running without Miku CDP on port $Port. Close Codex first, or explicitly rerun with -RestartExisting."
  }
  $restartTargets = if ($RestartProcessId -gt 0) {
    @($mainProcesses | Where-Object { $_.Id -eq $RestartProcessId })
  } else {
    $mainProcesses
  }
  if ($RestartProcessId -gt 0 -and $restartTargets.Count -ne 1) {
    throw "RestartProcessId $RestartProcessId is not a main window of the official OpenAI.Codex Store package."
  }
  foreach ($process in $restartTargets) {
    [void]$process.CloseMainWindow()
  }
  Start-Sleep -Seconds 2
  foreach ($process in $restartTargets) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 600
}

$appProcess = $null
if (-not (Test-CodexDebugPort $Port)) {
  $arguments = @(
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=$Port"
  )
  if ($ProfilePath) {
    $resolvedProfile = [System.IO.Path]::GetFullPath($ProfilePath)
    New-Item -ItemType Directory -Force -Path $resolvedProfile | Out-Null
    $arguments += "--user-data-dir=$resolvedProfile"
    $ProfilePath = $resolvedProfile
  }
  $appProcess = Start-Process -FilePath $exe -ArgumentList $arguments -PassThru
}

$deadline = (Get-Date).AddSeconds(35)
while (-not (Test-CodexDebugPort $Port)) {
  if ((Get-Date) -ge $deadline) {
    throw "Codex did not expose loopback CDP on port $Port within 35 seconds."
  }
  Start-Sleep -Milliseconds 400
}

if (Test-Path -LiteralPath $StatePath) {
  try {
    $old = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($old.injectorPid) {
      $oldInjector = if ($old.injectorPath) {
        [string]$old.injectorPath
      } elseif ($old.skillRoot) {
        Join-Path ([string]$old.skillRoot) 'scripts\injector.mjs'
      } else {
        $Injector
      }
      $oldPort = if ($old.port) { [int]$old.port } else { $Port }
      $oldExecutable = if ($old.nodeExecutable) { [string]$old.nodeExecutable } else { '' }
      [void](Stop-MikuInjectorProcess `
        -ProcessId ([int]$old.injectorPid) `
        -InjectorPath $oldInjector `
        -ExecutablePath $oldExecutable `
        -Port $oldPort `
        -InstanceToken ([string]$old.instanceToken) `
        -StartedAt ([string]$(if ($old.injectorStartedAt) { $old.injectorStartedAt } else { $old.startedAt })))
    }
  } catch {}
}

$toneArgument = $Tone.ToLowerInvariant()
$instanceToken = [Guid]::NewGuid().ToString('N')
if ($ForegroundInjector) {
  & $node $Injector --watch --port $Port --tone $toneArgument --instance-token $instanceToken
  exit $LASTEXITCODE
}

$injectorArgs = @(
  '"' + $Injector + '"',
  '--watch',
  '--port',
  "$Port",
  '--tone',
  $toneArgument,
  '--instance-token',
  $instanceToken
)
$startInjector = @{
  FilePath = $node
  ArgumentList = $injectorArgs
  WindowStyle = 'Hidden'
  PassThru = $true
  RedirectStandardOutput = $StdoutPath
  RedirectStandardError = $StderrPath
}
$daemon = Start-Process @startInjector
$injectorStartedAt = $daemon.StartTime.ToUniversalTime().ToString('o')

@{
  port = $Port
  tone = $toneArgument
  injectorPid = $daemon.Id
  injectorStartedAt = $injectorStartedAt
  instanceToken = $instanceToken
  appProcessId = if ($appProcess) { $appProcess.Id } else { $null }
  startedAt = (Get-Date).ToString('o')
  skillRoot = $SkillRoot
  injectorPath = $Injector
  nodeExecutable = $node
  profilePath = $ProfilePath
  loopbackOnly = $true
} | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8

$verified = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
  Start-Sleep -Milliseconds 700
  & $node $Injector --verify --port $Port --tone $toneArgument *> $null
  if ($LASTEXITCODE -eq 0) {
    $verified = $true
    break
  }
}
if (-not $verified) {
  Stop-Process -Id $daemon.Id -Force -ErrorAction SilentlyContinue
  throw "Miku Stage launched but verification failed. Inspect $StderrPath and $StdoutPath."
}
Write-Host "Codex Miku Stage is active in $Tone mode on loopback port $Port."
