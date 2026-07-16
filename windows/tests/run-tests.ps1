[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ThemeConfig = Join-Path $Root 'windows\scripts\theme-config.ps1'
$TemporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) "codex-dream-skin-tests-$PID"

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "Assertion failed: $Message" }
}

function Count-Matches([string]$Content, [string]$Pattern) {
  return [regex]::Matches($Content, $Pattern).Count
}

try {
  New-Item -ItemType Directory -Force -Path $TemporaryRoot | Out-Null
  $config = Join-Path $TemporaryRoot 'config.toml'
  $backup = Join-Path $TemporaryRoot 'backup.toml'
  $original = @'
model = "gpt-5.6"

[desktop]
appearanceTheme = "system"
appearanceLightCodeThemeId = "one"
localeOverride = "zh-CN"

[desktop.appearanceLightChromeTheme]
accent = "#526fff"
contrast = 45
ink = "#383a42"
opaqueWindows = true
surface = "#fafafa"

[desktop.appearanceLightChromeTheme.fonts]
code = "FiraCode Nerd Font"
ui = "Noto Sans CJK SC"

[desktop.appearanceLightChromeTheme.semanticColors]
diffAdded = "#3bba54"
diffRemoved = "#e45649"
skill = "#526fff"

[windows]
sandbox = "unelevated"
'@
  Set-Content -LiteralPath $config -Value $original -Encoding utf8 -NoNewline

  & $ThemeConfig install $config $backup
  $installed = Get-Content -LiteralPath $config -Raw
  Assert-True ((Count-Matches $installed '(?m)^appearanceLightChromeTheme\s*=') -eq 0) 'install removes the conflicting inline key'
  Assert-True ((Count-Matches $installed '(?m)^\[desktop\.appearanceLightChromeTheme\]$') -eq 1) 'install writes one parent theme table'
  Assert-True ((Count-Matches $installed '(?m)^\[desktop\.appearanceLightChromeTheme\.fonts\]$') -eq 1) 'install writes one fonts table'
  Assert-True ((Count-Matches $installed '(?m)^\[desktop\.appearanceLightChromeTheme\.semanticColors\]$') -eq 1) 'install writes one semantic colors table'
  Assert-True ($installed.Contains('sandbox = "unelevated"')) 'install preserves unrelated Windows settings'
  Assert-True ($installed.Contains('localeOverride = "zh-CN"')) 'install preserves unrelated desktop settings'

  & $ThemeConfig install $config $backup
  $installedAgain = Get-Content -LiteralPath $config -Raw
  Assert-True ($installedAgain -eq $installed) 'install is idempotent'

  $installedAgain = $installedAgain.Replace('localeOverride = "zh-CN"', 'localeOverride = "zh-TW"')
  Set-Content -LiteralPath $config -Value $installedAgain -Encoding utf8 -NoNewline
  & $ThemeConfig restore $config $backup
  $restored = Get-Content -LiteralPath $config -Raw
  Assert-True ($restored.Contains('accent = "#526fff"')) 'restore recovers the original section-form theme'
  Assert-True ($restored.Contains('code = "FiraCode Nerd Font"')) 'restore recovers nested theme tables'
  Assert-True ($restored.Contains('appearanceTheme = "system"')) 'restore recovers the original appearance mode'
  Assert-True ($restored.Contains('localeOverride = "zh-TW"')) 'restore preserves unrelated changes made after install'

  $inlineRoot = Join-Path $TemporaryRoot 'inline'
  New-Item -ItemType Directory -Force -Path $inlineRoot | Out-Null
  $inlineConfig = Join-Path $inlineRoot 'config.toml'
  $inlineBackup = Join-Path $inlineRoot 'backup.toml'
  $inlineTheme = 'appearanceLightChromeTheme = { accent = "#112233", contrast = 50, fonts = { code = "Consolas", ui = "Segoe UI" }, ink = "#223344", opaqueWindows = true, semanticColors = { diffAdded = "#00aa00", diffRemoved = "#aa0000", skill = "#0000aa" }, surface = "#ffffff" }'
  Set-Content -LiteralPath $inlineConfig -Encoding utf8 -NoNewline -Value "[desktop]`r`nappearanceTheme = `"system`"`r`n$inlineTheme`r`n`r`n[windows]`r`nsandbox = `"unelevated`"`r`n"
  & $ThemeConfig install $inlineConfig $inlineBackup
  & $ThemeConfig restore $inlineConfig $inlineBackup
  $inlineRestored = Get-Content -LiteralPath $inlineConfig -Raw
  Assert-True ($inlineRestored.Contains($inlineTheme)) 'restore preserves an original inline theme representation'
  Assert-True ((Count-Matches $inlineRestored '(?m)^\[desktop\.appearanceLightChromeTheme(?:\.|\])') -eq 0) 'inline restore removes generated section tables'

  $emptyRoot = Join-Path $TemporaryRoot 'empty-theme'
  New-Item -ItemType Directory -Force -Path $emptyRoot | Out-Null
  $emptyConfig = Join-Path $emptyRoot 'config.toml'
  $emptyBackup = Join-Path $emptyRoot 'backup.toml'
  Set-Content -LiteralPath $emptyConfig -Encoding utf8 -NoNewline -Value "[desktop]`r`nlocaleOverride = `"zh-CN`"`r`n`r`n[windows]`r`nsandbox = `"unelevated`"`r`n"
  & $ThemeConfig install $emptyConfig $emptyBackup
  & $ThemeConfig restore $emptyConfig $emptyBackup
  $emptyRestored = Get-Content -LiteralPath $emptyConfig -Raw
  Assert-True (-not $emptyRestored.Contains('appearanceTheme =')) 'restore removes an appearance mode that was absent before install'
  Assert-True (-not $emptyRestored.Contains('appearanceLightCodeThemeId =')) 'restore removes a code theme that was absent before install'
  Assert-True ((Count-Matches $emptyRestored '(?m)^\[desktop\.appearanceLightChromeTheme(?:\.|\])') -eq 0) 'restore removes a chrome theme that was absent before install'
  Assert-True ($emptyRestored.Contains('localeOverride = "zh-CN"')) 'empty-theme restore preserves unrelated desktop settings'

  Write-Host 'Windows theme config tests passed.'
} finally {
  Remove-Item -LiteralPath $TemporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
