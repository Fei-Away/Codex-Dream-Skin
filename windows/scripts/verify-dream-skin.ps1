[CmdletBinding()]
param(
  [int]$Port = 9335,
  [string]$ScreenshotPath
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$injector = Join-Path $PSScriptRoot 'injector.mjs'
$themeDir = Join-Path (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin') 'theme'
$arguments = @($injector, '--verify', '--port', "$Port", '--theme-dir', $themeDir)
if ($ScreenshotPath) { $arguments += @('--screenshot', $ScreenshotPath) }
& $node @arguments
exit $LASTEXITCODE
