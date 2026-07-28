[CmdletBinding()]
param([int]$Port = 9335)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

Assert-DreamSkinPort -Port $Port
$stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$trayScript = Join-Path $PSScriptRoot 'tray-dream-skin.ps1'
$startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'

# Login startup is an explicit opt-in. Start the tray first, then open a real
# Dream Skin session so a later click on the ordinary Codex shortcut reuses the
# already-running CDP-enabled app instead of creating an unskinned session.
if (-not (Test-DreamSkinTrayActive)) {
  $trayToken = ConvertTo-DreamSkinProcessArgument -Value $trayScript
  $trayArguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File $trayToken -Port $Port"
  Start-Process -FilePath $powershell -ArgumentList $trayArguments -WindowStyle Hidden | Out-Null
}

# Pausing is persistent and must remain authoritative across sign-in.
if (Test-DreamSkinPaused -StateRoot $stateRoot) { exit 0 }

& $startScript -Port $Port -PromptRestart -RequireUnpaused `
  -OperationLockTimeoutMilliseconds 30000
