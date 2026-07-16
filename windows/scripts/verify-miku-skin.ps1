[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 9347,
  [ValidateSet('Dark', 'Light')]
  [string]$Tone = 'Dark',
  [string]$ScreenshotPath,
  [switch]$Reload
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$injector = Join-Path $PSScriptRoot 'injector.mjs'
if (-not (Test-Path -LiteralPath $injector)) {
  throw "Miku injector not found: $injector"
}
$arguments = @(
  $injector,
  '--verify',
  '--port',
  "$Port",
  '--tone',
  $Tone.ToLowerInvariant()
)
if ($ScreenshotPath) {
  $arguments += @('--screenshot', [System.IO.Path]::GetFullPath($ScreenshotPath))
}
if ($Reload) { $arguments += '--reload' }
& $node @arguments
exit $LASTEXITCODE
