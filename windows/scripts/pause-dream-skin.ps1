[CmdletBinding()]
param([int]$Port = 9335)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
$state = Read-DreamSkinState
if ($state -and $state.port) { $Port = [int]$state.port }
if (Test-CodexDebugPort $Port) {
  $node = Get-CodexNode
  & $node $Script:InjectorPath --remove --port $Port --theme-dir $Script:CurrentThemeRoot *> $null
}
if ($state -and $state.injectorPid) { Stop-Process -Id ([int]$state.injectorPid) -Force -ErrorAction SilentlyContinue }
Save-DreamSkinState @{ port = $Port; injectorPid = 0; session = 'paused'; pausedAt = (Get-Date).ToString('o') }
Write-Host 'Codex Dream Skin is paused.'
