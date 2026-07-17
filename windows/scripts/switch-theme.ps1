[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Id, [switch]$NoApply, [int]$Port = 9335)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
if ($Id -notmatch '^[.a-zA-Z0-9_-]+$' -or $Id -match '\.\.') { throw 'Theme ID is invalid.' }
$source = Join-Path $Script:ThemeRoot $Id
if (-not (Test-Path -LiteralPath (Join-Path $source 'theme.json'))) { throw "Theme not found: $Id" }
New-Item -ItemType Directory -Force -Path $Script:CurrentThemeRoot | Out-Null
Get-ChildItem -LiteralPath $Script:CurrentThemeRoot -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $source '*') -Destination $Script:CurrentThemeRoot -Force
if (-not $NoApply) { & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -Port $Port -RestartExisting }
