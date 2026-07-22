[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Id, [switch]$NoApply, [int]$Port = 9335)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
if ($Id -notmatch '^[.a-zA-Z0-9_-]+$' -or $Id -match '\.\.') { throw 'Theme ID is invalid.' }
$stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$themePaths = Get-DreamSkinThemePaths -StateRoot $stateRoot
$source = Join-Path $themePaths.Saved $Id
if (-not (Test-Path -LiteralPath (Join-Path $source 'theme.json'))) { throw "Theme not found: $Id" }
$null = Use-DreamSkinSavedTheme -ThemeDirectory $source -StateRoot $stateRoot
if (-not $NoApply) { & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -Port $Port -PromptRestart }
