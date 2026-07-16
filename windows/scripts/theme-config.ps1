[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('install', 'restore')]
  [string]$Mode,
  [Parameter(Mandatory = $true, Position = 1)]
  [string]$ConfigPath,
  [Parameter(Mandatory = $true, Position = 2)]
  [string]$BackupPath
)

$ErrorActionPreference = 'Stop'
$ThemeKey = 'appearanceLightChromeTheme'
$ThemeTablePattern = '(?ms)^\[desktop\.appearanceLightChromeTheme(?:\.[^\]\r\n]+)?\][^\r\n]*(?:\r?\n|$).*?(?=^\[|\z)'

function Get-NewLine([string]$Content) {
  if ($Content.Contains("`r`n")) { return "`r`n" }
  return "`n"
}

function Ensure-DesktopSection([string]$Content) {
  if ([regex]::IsMatch($Content, '(?m)^\[desktop\]\s*$')) { return $Content }
  $newline = Get-NewLine $Content
  return $Content.TrimEnd() + $newline + $newline + '[desktop]' + $newline
}

function Get-DesktopMatch([string]$Content) {
  return [regex]::Match($Content, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
}

function Get-DesktopSetting([string]$Content, [string]$Key) {
  $desktop = Get-DesktopMatch $Content
  if (-not $desktop.Success) { return $null }
  $pattern = "(?m)^$([regex]::Escape($Key))\s*=.*$"
  $setting = [regex]::Match($desktop.Groups['body'].Value, $pattern)
  if (-not $setting.Success) { return $null }
  return $setting.Value.TrimEnd("`r", "`n")
}

function Set-DesktopSetting(
  [string]$Content,
  [string]$Key,
  [AllowNull()][string]$Setting
) {
  $Content = Ensure-DesktopSection $Content
  $desktop = Get-DesktopMatch $Content
  if (-not $desktop.Success) { throw 'Could not locate the [desktop] table.' }

  $newline = Get-NewLine $Content
  $body = $desktop.Groups['body'].Value
  $pattern = "(?m)^$([regex]::Escape($Key))\s*=.*(?:\r?\n)?"
  if ([regex]::IsMatch($body, $pattern)) {
    $replacement = if ($null -eq $Setting) { '' } else { $Setting + $newline }
    $body = [regex]::Replace($body, $pattern, $replacement, 1)
  } elseif ($null -ne $Setting) {
    $body = $body.TrimEnd() + $newline + $Setting + $newline
  }

  return $Content.Substring(0, $desktop.Groups['body'].Index) + $body +
    $Content.Substring($desktop.Groups['body'].Index + $desktop.Groups['body'].Length)
}

function Get-ThemeSnapshot([string]$Content) {
  $inline = Get-DesktopSetting $Content $ThemeKey
  $sections = [regex]::Matches($Content, $ThemeTablePattern)
  if ($inline -and $sections.Count -gt 0) {
    throw 'The saved config defines appearanceLightChromeTheme as both an inline value and tables.'
  }
  if ($inline) {
    return [pscustomobject]@{ Mode = 'inline'; Text = $inline }
  }
  if ($sections.Count -gt 0) {
    $newline = Get-NewLine $Content
    $text = (($sections | ForEach-Object { $_.Value.Trim() }) -join ($newline + $newline))
    return [pscustomobject]@{ Mode = 'sections'; Text = $text }
  }
  return [pscustomobject]@{ Mode = 'none'; Text = '' }
}

function Remove-ThemeConfig([string]$Content) {
  $Content = Set-DesktopSetting $Content $ThemeKey $null
  return [regex]::Replace($Content, $ThemeTablePattern, '')
}

function Add-ThemeSnapshot([string]$Content, [object]$Snapshot) {
  if ($Snapshot.Mode -eq 'inline') {
    return Set-DesktopSetting $Content $ThemeKey $Snapshot.Text
  }
  if ($Snapshot.Mode -eq 'sections') {
    $newline = Get-NewLine $Content
    return $Content.TrimEnd() + $newline + $newline + $Snapshot.Text.Trim() + $newline
  }
  return $Content
}

function Write-AtomicUtf8([string]$Path, [string]$Content) {
  $temporary = "$Path.$PID.tmp"
  try {
    Set-Content -LiteralPath $temporary -Value $Content -Encoding utf8 -NoNewline
    Move-Item -LiteralPath $temporary -Destination $Path -Force
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Codex config not found: $ConfigPath"
}

$content = Get-Content -LiteralPath $ConfigPath -Raw
if ($Mode -eq 'install') {
  if (-not (Test-Path -LiteralPath $BackupPath)) {
    Copy-Item -LiteralPath $ConfigPath -Destination $BackupPath
  }

  $content = Set-DesktopSetting $content 'appearanceTheme' 'appearanceTheme = "light"'
  $content = Set-DesktopSetting $content 'appearanceLightCodeThemeId' 'appearanceLightCodeThemeId = "codex"'
  $content = Remove-ThemeConfig $content
  $newline = Get-NewLine $content
  $theme = @(
    '[desktop.appearanceLightChromeTheme]'
    'accent = "#B65CFF"'
    'contrast = 64'
    'ink = "#4A235F"'
    'opaqueWindows = true'
    'surface = "#FFF4FA"'
    ''
    '[desktop.appearanceLightChromeTheme.fonts]'
    'code = "Cascadia Code"'
    'ui = "Microsoft YaHei UI"'
    ''
    '[desktop.appearanceLightChromeTheme.semanticColors]'
    'diffAdded = "#BCE8CF"'
    'diffRemoved = "#F7B8CE"'
    'skill = "#C47BFF"'
  ) -join $newline
  $content = $content.TrimEnd() + $newline + $newline + $theme + $newline
  Write-AtomicUtf8 $ConfigPath $content
  Write-Host 'Saved the base-theme backup and applied the Dream Skin base theme.'
  exit 0
}

if (-not (Test-Path -LiteralPath $BackupPath)) {
  throw 'No pre-install config backup is available.'
}

$backup = Get-Content -LiteralPath $BackupPath -Raw
$snapshot = Get-ThemeSnapshot $backup
$content = Set-DesktopSetting $content 'appearanceTheme' (Get-DesktopSetting $backup 'appearanceTheme')
$content = Set-DesktopSetting $content 'appearanceLightCodeThemeId' (Get-DesktopSetting $backup 'appearanceLightCodeThemeId')
$content = Remove-ThemeConfig $content
$content = Add-ThemeSnapshot $content $snapshot
Write-AtomicUtf8 $ConfigPath $content
Write-Host 'Restored the saved base-theme settings.'
