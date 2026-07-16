[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$NoShortcuts,
  [switch]$SkipBaseTheme
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
if (-not $SkipBaseTheme) {
  $ConfigPath = Join-Path $HOME '.codex\config.toml'
  $BackupPath = Join-Path $StateRoot 'config.before-dream-skin.toml'
  if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Codex config not found: $ConfigPath" }
  if (-not (Test-Path -LiteralPath $BackupPath)) { Copy-Item -LiteralPath $ConfigPath -Destination $BackupPath }

  $content = Get-Content -LiteralPath $ConfigPath -Raw
  $desktopMatch = [regex]::Match($content, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
  if (-not $desktopMatch.Success) {
    $content = $content.TrimEnd() + "`r`n`r`n[desktop]`r`n"
    $desktopMatch = [regex]::Match($content, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
  }
  $body = $desktopMatch.Groups['body'].Value
  $settings = [ordered]@{
    appearanceTheme = 'appearanceTheme = "light"'
    appearanceLightCodeThemeId = 'appearanceLightCodeThemeId = "codex"'
    appearanceLightChromeTheme = 'appearanceLightChromeTheme = { accent = "#B65CFF", contrast = 64, fonts = { code = "Cascadia Code", ui = "Microsoft YaHei UI" }, ink = "#4A235F", opaqueWindows = true, semanticColors = { diffAdded = "#BCE8CF", diffRemoved = "#F7B8CE", skill = "#C47BFF" }, surface = "#FFF4FA" }'
  }
  foreach ($key in $settings.Keys) {
    $pattern = "(?m)^$([regex]::Escape($key))\s*=.*$"
    if ([regex]::IsMatch($body, $pattern)) { $body = [regex]::Replace($body, $pattern, $settings[$key]) }
    else { $body = $body.TrimEnd() + "`r`n" + $settings[$key] + "`r`n" }
  }
  $content = $content.Substring(0, $desktopMatch.Groups['body'].Index) + $body + $content.Substring($desktopMatch.Groups['body'].Index + $desktopMatch.Groups['body'].Length)
  Set-Content -LiteralPath $ConfigPath -Value $content -Encoding utf8
}

if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $powershell = (Get-Command powershell.exe).Source
  $startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
  $restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
  $themeScript = Join-Path $PSScriptRoot 'set-dream-theme.ps1'
  foreach ($folder in @($desktop, $startMenu)) {
    $shortcut = $shell.CreateShortcut((Join-Path $folder 'Codex Dream Skin.lnk'))
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Port $Port"
    $shortcut.WorkingDirectory = $SkillRoot
    $shortcut.Description = 'Launch Codex with the Dream Skin interface theme'
    $shortcut.Save()
  }
  $restore = $shell.CreateShortcut((Join-Path $desktop 'Codex Dream Skin - Restore.lnk'))
  $restore.TargetPath = $powershell
  $restore.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$restoreScript`" -Port $Port -RestoreBaseTheme"
  $restore.WorkingDirectory = $SkillRoot
  $restore.Description = 'Remove the live Codex Dream Skin'
  $restore.Save()

  $theme = $shell.CreateShortcut((Join-Path $desktop 'Codex Dream Skin - Theme.lnk'))
  $theme.TargetPath = $powershell
  $theme.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$themeScript`" -Interactive"
  $theme.WorkingDirectory = $SkillRoot
  $theme.Description = 'Open the guided Codex Dream Skin theme editor'
  $theme.Save()
}

Write-Host 'Codex Dream Skin installed. Launch it with the created shortcut or start-dream-skin.ps1.'
Write-Host 'Customize it with set-dream-theme.ps1 -ImagePath <file> -Name <name> -Accent #b65cff -Apply.'
