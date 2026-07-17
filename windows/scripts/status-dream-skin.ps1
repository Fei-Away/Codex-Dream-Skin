[CmdletBinding()]
param([switch]$Json)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
$state = Read-DreamSkinState
$package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
$port = if ($state -and $state.port) { [int]$state.port } else { 9335 }
$injectorAlive = $false
if ($state -and $state.injectorPid) { $injectorAlive = [bool](Get-Process -Id ([int]$state.injectorPid) -ErrorAction SilentlyContinue) }
$session = if ($injectorAlive) { 'active' } elseif ($state -and $state.session -eq 'paused') { 'paused' } elseif ($state) { 'stale' } else { 'off' }
$theme = $null
try { $theme = Get-Content -LiteralPath (Join-Path $Script:CurrentThemeRoot 'theme.json') -Raw | ConvertFrom-Json } catch {}
$themeName = if ($theme) { $theme.name } else { '' }
$codexVersion = if ($package) { "$($package.Version)" } else { '' }
$codexBundle = if ($package) { $package.InstallLocation } else { '' }
$result = [ordered]@{
  session = $session
  port = $port
  injectorAlive = $injectorAlive
  cdpOk = (Test-CodexDebugPort $port)
  codexRunning = [bool](Get-Process ChatGPT -ErrorAction SilentlyContinue)
  themeName = $themeName
  codexVersion = $codexVersion
  codexInstalled = [bool]$package
  codexBundle = $codexBundle
}
if ($Json) { $result | ConvertTo-Json -Depth 4 } else { $result.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" } }
