[CmdletBinding()]
param(
  [int]$Port = 9335,
  [string]$ThemeId = '',
  [switch]$NoThemePrompt,
  [switch]$NoShortcuts
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
$ThemesRoot = Join-Path $StateRoot 'themes'
$ThemeDir = Join-Path $StateRoot 'theme'
$BundledThemes = Join-Path $SkillRoot 'themes'
$validThemes = @('dongge-marginalia', 'dongge-blueprint', 'dongge-placard', 'dongge-light')
if (-not (Test-Path -LiteralPath $BundledThemes)) { throw "Bundled themes not found: $BundledThemes" }
New-Item -ItemType Directory -Force -Path $ThemesRoot | Out-Null
Get-ChildItem -LiteralPath $BundledThemes -Directory | ForEach-Object {
  $target = Join-Path $ThemesRoot $_.Name
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
}
if ($ThemeId -and ($validThemes -notcontains $ThemeId)) { throw "Unknown theme id: $ThemeId" }
if (-not $ThemeId -and -not $NoThemePrompt) {
  Write-Host '选择默认栋哥图片：'
  Write-Host '1. 语言的用法'
  Write-Host '2. 开源工作台'
  Write-Host '3. 心理问题举牌'
  Write-Host '4. 经典白板'
  $selection = Read-Host '输入 1-4，直接回车默认 1'
  $ThemeId = switch ($selection) {
    '2' { 'dongge-blueprint' }
    '3' { 'dongge-placard' }
    '4' { 'dongge-light' }
    default { 'dongge-marginalia' }
  }
}
if (-not $ThemeId) { $ThemeId = 'dongge-marginalia' }
$SelectedTheme = Join-Path $ThemesRoot $ThemeId
if (-not (Test-Path -LiteralPath (Join-Path $SelectedTheme 'theme.json'))) { throw "Bundled theme is missing: $ThemeId" }
New-Item -ItemType Directory -Force -Path $ThemeDir | Out-Null
Get-ChildItem -LiteralPath $ThemeDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $SelectedTheme '*') -Destination $ThemeDir -Recurse -Force
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
  appearanceLightChromeTheme = 'appearanceLightChromeTheme = { accent = "#B9453E", contrast = 64, fonts = { code = "Cascadia Code", ui = "Microsoft YaHei UI" }, ink = "#292722", opaqueWindows = true, semanticColors = { diffAdded = "#C7DDCF", diffRemoved = "#E7C3BE", skill = "#A14B43" }, surface = "#F7F3EC" }'
}
foreach ($key in $settings.Keys) {
  $pattern = "(?m)^$([regex]::Escape($key))\s*=.*$"
  if ([regex]::IsMatch($body, $pattern)) { $body = [regex]::Replace($body, $pattern, $settings[$key]) }
  else { $body = $body.TrimEnd() + "`r`n" + $settings[$key] + "`r`n" }
}
$content = $content.Substring(0, $desktopMatch.Groups['body'].Index) + $body + $content.Substring($desktopMatch.Groups['body'].Index + $desktopMatch.Groups['body'].Length)
Set-Content -LiteralPath $ConfigPath -Value $content -Encoding utf8

if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $powershell = (Get-Command powershell.exe).Source
  $startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
  $switchScript = Join-Path $PSScriptRoot 'switch-theme.ps1'
  $restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
  foreach ($folder in @($desktop, $startMenu)) {
    $shortcut = $shell.CreateShortcut((Join-Path $folder '栋哥 Codex.lnk'))
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Port $Port"
    $shortcut.WorkingDirectory = $SkillRoot
    $shortcut.Description = 'Launch Codex with the active Dongge theme'
    $shortcut.Save()
  }
  $switchShortcut = $shell.CreateShortcut((Join-Path $desktop '栋哥 Codex - 选择风格.lnk'))
  $switchShortcut.TargetPath = $powershell
  $switchShortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$switchScript`" -Port $Port"
  $switchShortcut.WorkingDirectory = $SkillRoot
  $switchShortcut.Description = 'Choose one of the bundled Dongge themes'
  $switchShortcut.Save()
  $restore = $shell.CreateShortcut((Join-Path $desktop 'Codex Dream Skin - Restore.lnk'))
  $restore.TargetPath = $powershell
  $restore.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$restoreScript`" -Port $Port"
  $restore.WorkingDirectory = $SkillRoot
  $restore.Description = 'Remove the live Codex Dream Skin'
  $restore.Save()
}

Write-Host "Dongge Codex theme pack installed. Default theme: $ThemeId. Open it with the Dongge Codex shortcut. If official Codex is already open, close it manually first."
