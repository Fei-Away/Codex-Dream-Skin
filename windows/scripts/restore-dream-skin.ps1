[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$Uninstall,
  [switch]$RestoreBaseTheme
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$injector = Join-Path $PSScriptRoot 'injector.mjs'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$StatePath = Join-Path $StateRoot 'state.json'

if (Test-Path -LiteralPath $StatePath) {
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($state.injectorPid) { Stop-Process -Id ([int]$state.injectorPid) -Force -ErrorAction SilentlyContinue }
  } catch {}
  Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 250
try { & $node $injector --remove --port $Port --timeout-ms 3000 } catch {}

if ($Uninstall) {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  @(
    (Join-Path $desktop 'Codex Dream Skin.lnk'),
    (Join-Path $desktop 'Codex Dream Skin - Restore.lnk'),
    (Join-Path $startMenu 'Codex Dream Skin.lnk')
  ) | ForEach-Object { Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue }
}

if ($RestoreBaseTheme) {
  $backup = Join-Path $StateRoot 'config.before-dream-skin.toml'
  $config = Join-Path $HOME '.codex\config.toml'
  $themeConfigScript = Join-Path $PSScriptRoot 'theme-config.ps1'
  & $themeConfigScript restore $config $backup
}

Write-Host 'The live Dream Skin was removed.'
