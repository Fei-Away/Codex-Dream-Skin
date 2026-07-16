[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$RestartExisting,
  [string]$ProfilePath,
  [switch]$ForegroundInjector
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$Injector = Join-Path $PSScriptRoot 'injector.mjs'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$StatePath = Join-Path $StateRoot 'state.json'
$StdoutPath = Join-Path $StateRoot 'injector.log'
$StderrPath = Join-Path $StateRoot 'injector-error.log'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

function Test-CodexDebugPort([int]$CandidatePort) {
  try {
    $targets = Invoke-RestMethod "http://127.0.0.1:$CandidatePort/json/list" -TimeoutSec 1
    return [bool]($targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://*' })
  } catch {
    return $false
  }
}

$node = (Get-Command node -ErrorAction Stop).Source
$debugReady = Test-CodexDebugPort $Port
$mainProcesses = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })

if (-not $debugReady -and -not $ProfilePath -and $mainProcesses.Count -gt 0) {
  if (-not $RestartExisting) {
    throw "Codex is already running without dream-skin debugging on port $Port. Close Codex or rerun with -RestartExisting."
  }
  foreach ($process in $mainProcesses) { [void]$process.CloseMainWindow() }
  Start-Sleep -Seconds 2
  Get-Process ChatGPT -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Milliseconds 600
}

if (-not (Test-CodexDebugPort $Port)) {
  $package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
  if (-not $package) { throw 'The OpenAI.Codex Store package is not installed.' }
  # Launch via the shell AppX activator (shell:AppsFolder\<AUMID>) instead of
  # running ChatGPT.exe directly. On current Windows builds the packaged binary
  # requires package identity, so Start-Process on the exe fails with Access
  # Denied for every caller (admin, standard, even ShellExecute). Activating by
  # AppUserModelId uses the same path as the Start Menu and forwards
  # --remote-debugging-port (and --user-data-dir) through to the process.
  $manifest = Get-AppxPackageManifest $package
  $appId = $manifest.Package.Applications.Application.Id
  $aumid = "$($package.PackageFamilyName)!$appId"
  $arguments = @("--remote-debugging-port=$Port")
  if ($ProfilePath) {
    New-Item -ItemType Directory -Force -Path $ProfilePath | Out-Null
    $arguments += "--user-data-dir=$ProfilePath"
  }
  Start-Process -FilePath "shell:AppsFolder\$aumid" -ArgumentList $arguments
}

$deadline = (Get-Date).AddSeconds(30)
while (-not (Test-CodexDebugPort $Port)) {
  if ((Get-Date) -ge $deadline) { throw "Codex did not expose CDP on port $Port within 30 seconds." }
  Start-Sleep -Milliseconds 400
}

if (Test-Path -LiteralPath $StatePath) {
  try {
    $old = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($old.injectorPid) { Stop-Process -Id ([int]$old.injectorPid) -Force -ErrorAction SilentlyContinue }
  } catch {}
}

if ($ForegroundInjector) {
  & $node $Injector --watch --port $Port
  exit $LASTEXITCODE
}

$injectorArgs = @("`"$Injector`"", '--watch', '--port', "$Port")
$daemon = Start-Process -FilePath $node -ArgumentList $injectorArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
@{
  port = $Port
  injectorPid = $daemon.Id
  startedAt = (Get-Date).ToString('o')
  skillRoot = $SkillRoot
  profilePath = $ProfilePath
} | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding utf8

$verified = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
  Start-Sleep -Milliseconds 700
  & $node $Injector --verify --port $Port *> $null
  if ($LASTEXITCODE -eq 0) { $verified = $true; break }
}
if (-not $verified) { throw 'Dream skin launched but verification failed. See injector logs.' }
Write-Host "Codex Dream Skin is active on port $Port."
