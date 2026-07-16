[CmdletBinding()]
param(
  [ValidateSet('dongge-marginalia', 'dongge-blueprint', 'dongge-placard', 'dongge-light')]
  [string]$Id,
  [int]$Port = 9335,
  [switch]$NoApply
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$ThemesRoot = Join-Path $SkillRoot 'themes'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$ThemeDir = Join-Path $StateRoot 'theme'

if (-not $Id) {
  Write-Host '1. 语言的用法'
  Write-Host '2. 开源工作台'
  Write-Host '3. 心理问题举牌'
  $selection = Read-Host '选择风格 (1-3)'
  $Id = switch ($selection) {
    '1' { 'dongge-marginalia' }
    '2' { 'dongge-blueprint' }
    '3' { 'dongge-placard' }
    default { throw '请选择 1、2 或 3。' }
  }
}

$source = Join-Path $ThemesRoot $Id
if (-not (Test-Path -LiteralPath (Join-Path $source 'theme.json'))) { throw "Theme not found: $Id" }
New-Item -ItemType Directory -Force -Path $ThemeDir | Out-Null
Get-ChildItem -LiteralPath $ThemeDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $source '*') -Destination $ThemeDir -Recurse -Force

if (-not $NoApply) {
  & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -Port $Port
}

Write-Host "Theme ready: $Id"
