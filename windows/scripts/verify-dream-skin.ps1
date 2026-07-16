[CmdletBinding()]
param(
  [int]$Port = 9335,
  [string]$ThemeDir,
  [string]$ScreenshotPath
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$injector = Join-Path $PSScriptRoot 'injector.mjs'
$arguments = @($injector, '--verify', '--port', "$Port")
if ($ThemeDir) { $arguments += @('--theme-dir', $ThemeDir) }
if ($ScreenshotPath) { $arguments += @('--screenshot', $ScreenshotPath) }
& $node @arguments
exit $LASTEXITCODE
