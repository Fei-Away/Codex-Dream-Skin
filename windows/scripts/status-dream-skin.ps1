[CmdletBinding()]
param([switch]$Json)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
$stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$statePath = Join-Path $stateRoot 'state.json'
$themePaths = Get-DreamSkinThemePaths -StateRoot $stateRoot
$state = Read-DreamSkinState -Path $statePath
$package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
$port = if ($state -and $state.port) { [int]$state.port } else { 9335 }
$injectorAlive = $false
if ($state -and $state.injectorPid) { $injectorAlive = [bool](Get-Process -Id ([int]$state.injectorPid) -ErrorAction SilentlyContinue) }
$paused = Test-DreamSkinPaused -StateRoot $stateRoot
$session = if ($injectorAlive -and -not $paused) { 'active' } elseif ($paused) { 'paused' } elseif ($state) { 'stale' } else { 'off' }
$theme = $null
try { $theme = (Read-DreamSkinTheme -ThemeDirectory $themePaths.Active -SkipImageMetadata).Theme } catch {}
$themeName = if ($theme) { $theme.name } else { '' }
$codexVersion = if ($package) { "$($package.Version)" } else { '' }
$codexBundle = if ($package) { $package.InstallLocation } else { '' }
$cdpOk = $false
if ($package) {
  try { $cdpOk = Test-DreamSkinCodexCdpEndpoint -Port $port -Codex (Get-DreamSkinCodexInstall) } catch {}
}
$result = [ordered]@{
  session = $session
  port = $port
  injectorAlive = $injectorAlive
  cdpOk = $cdpOk
  codexRunning = [bool](Get-Process ChatGPT -ErrorAction SilentlyContinue)
  themeName = $themeName
  codexVersion = $codexVersion
  codexInstalled = [bool]$package
  codexBundle = $codexBundle
}
if ($Json) { $result | ConvertTo-Json -Depth 4 } else { $result.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" } }
