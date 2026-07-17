[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 9347,
  [ValidateSet('Dark', 'Light')]
  [string]$Tone = 'Dark',
  [switch]$NoShortcuts,
  [switch]$EnableAutoHook
)

$ErrorActionPreference = 'Stop'
$SourceRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexMikuSkin'
$InstallRoot = Join-Path $StateRoot 'engine'
$InstallStatePath = Join-Path $StateRoot 'install-state.json'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

$manifestPath = Join-Path $SourceRoot 'assets\miku-stage-theme.json'
$heroPath = Join-Path $SourceRoot 'assets\miku-stage-hero.png'
$cssPath = Join-Path $SourceRoot 'assets\miku-stage.css'
foreach ($required in @($manifestPath, $heroPath, $cssPath)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required Miku Stage asset not found: $required"
  }
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.components.Count -ne 14) {
  throw "Expected 14 component contracts, found $($manifest.components.Count)."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is required by the CDP injector but node.exe was not found on PATH.'
}

$sourceFull = [System.IO.Path]::GetFullPath($SourceRoot).TrimEnd('\')
$installFull = [System.IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
if (-not [string]::Equals($sourceFull, $installFull, [System.StringComparison]::OrdinalIgnoreCase)) {
  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
  foreach ($directory in @('assets', 'scripts', 'references', 'agents', 'tests')) {
    $sourceDirectory = Join-Path $SourceRoot $directory
    if (-not (Test-Path -LiteralPath $sourceDirectory)) { continue }
    $destinationDirectory = Join-Path $InstallRoot $directory
    New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
    Get-ChildItem -LiteralPath $sourceDirectory -Force | Copy-Item -Destination $destinationDirectory -Recurse -Force
  }
  Copy-Item -LiteralPath (Join-Path $SourceRoot 'SKILL.md') -Destination (Join-Path $InstallRoot 'SKILL.md') -Force
}

$userProfile = [Environment]::GetFolderPath('UserProfile')
$ConfigPath = Join-Path $userProfile '.codex\config.toml'
$BackupPath = Join-Path $StateRoot 'config.before-miku-stage.toml'
$configBackupAvailable = $false
if ((Test-Path -LiteralPath $ConfigPath) -and -not (Test-Path -LiteralPath $BackupPath)) {
  Copy-Item -LiteralPath $ConfigPath -Destination $BackupPath
}
$appearance = $Tone.ToLowerInvariant()
$configBackupAvailable = Test-Path -LiteralPath $BackupPath

$installedScripts = Join-Path $InstallRoot 'scripts'
$startScript = Join-Path $installedScripts 'start-miku-skin.ps1'
$restoreScript = Join-Path $installedScripts 'restore-miku-skin.ps1'
if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
  $package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
  $iconPath = if ($package) { Join-Path $package.InstallLocation 'app\ChatGPT.exe' } else { $powershell }
  foreach ($folder in @($desktop, $startMenu)) {
    $shortcut = $shell.CreateShortcut((Join-Path $folder 'Codex Miku Stage.lnk'))
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments =
      '-NoProfile -ExecutionPolicy Bypass -File "' + $startScript + '" -Port ' + $Port + ' -Tone ' + $Tone
    $shortcut.WorkingDirectory = $InstallRoot
    $shortcut.IconLocation = $iconPath
    $shortcut.Description = 'Launch Codex with the reversible Miku Stage CDP skin'
    $shortcut.Save()
  }
  $restore = $shell.CreateShortcut((Join-Path $desktop 'Codex Miku Stage - Restore.lnk'))
  $restore.TargetPath = $powershell
  $restore.Arguments =
    '-NoProfile -ExecutionPolicy Bypass -File "' + $restoreScript + '" -Port ' + $Port
  $restore.WorkingDirectory = $InstallRoot
  $restore.IconLocation = $iconPath
  $restore.Description = 'Remove Miku from the current session; the auto hook resumes on the next launch'
  $restore.Save()
}

@{
  version = [string]$manifest.version
  installedAt = (Get-Date).ToString('o')
  installedFrom = $SourceRoot
  installRoot = $InstallRoot
  configPath = $ConfigPath
  configBackup = if ($configBackupAvailable) { $BackupPath } else { $null }
  configModified = $false
  port = $Port
  tone = $appearance
  shortcutCreated = -not $NoShortcuts
  autoHookRequested = [bool]$EnableAutoHook
  componentCount = $manifest.components.Count
} | ConvertTo-Json | Set-Content -LiteralPath $InstallStatePath -Encoding utf8

if ($EnableAutoHook) {
  $registerHook = Join-Path $installedScripts 'register-miku-hook.ps1'
  if (-not (Test-Path -LiteralPath $registerHook)) {
    throw "Installed hook registration script not found: $registerHook"
  }
  & $registerHook -Port $Port -Tone $Tone -StartNow $true
}

Write-Host "Codex Miku Stage $($manifest.version) installed at $InstallRoot."
Write-Host 'Codex appearance settings were not modified.'
if (-not $NoShortcuts) {
  Write-Host 'Use the Codex Miku Stage shortcut after closing the currently running Codex window.'
}
