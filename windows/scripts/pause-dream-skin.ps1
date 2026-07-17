[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
$stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
Set-DreamSkinPaused -Paused $true -StateRoot $stateRoot | Out-Null
Write-Host 'Codex Dream Skin is paused.'
