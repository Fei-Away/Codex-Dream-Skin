[CmdletBinding()]
param(
  [string]$ImagePath,
  [string]$Name,
  [string]$BrandSubtitle,
  [string]$Tagline,
  [string]$ProjectPrefix,
  [string]$ProjectLabel,
  [string]$Quote,
  [string]$Signature,
  [AllowNull()][ValidateScript({ -not $_ -or $_ -match '^#[0-9A-Fa-f]{6}$' })][string]$Background,
  [AllowNull()][ValidateScript({ -not $_ -or $_ -match '^#[0-9A-Fa-f]{6}$' })][string]$Panel,
  [AllowNull()][ValidateScript({ -not $_ -or $_ -match '^#[0-9A-Fa-f]{6}$' })][string]$PanelAlt,
  [AllowNull()][ValidateScript({ -not $_ -or $_ -match '^#[0-9A-Fa-f]{6}$' })][string]$Accent,
  [AllowNull()][ValidateScript({ -not $_ -or $_ -match '^#[0-9A-Fa-f]{6}$' })][string]$AccentAlt,
  [AllowNull()][ValidateScript({ -not $_ -or $_ -match '^#[0-9A-Fa-f]{6}$' })][string]$Secondary,
  [AllowNull()][ValidateScript({ -not $_ -or $_ -match '^#[0-9A-Fa-f]{6}$' })][string]$Highlight,
  [AllowNull()][ValidateScript({ -not $_ -or $_ -match '^#[0-9A-Fa-f]{6}$' })][string]$Text,
  [AllowNull()][ValidateScript({ -not $_ -or $_ -match '^#[0-9A-Fa-f]{6}$' })][string]$Muted,
  [int]$Port = 9335,
  [switch]$Reset,
  [switch]$Interactive,
  [switch]$Apply,
  [switch]$RestartExisting
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$AssetsRoot = Join-Path $SkillRoot 'assets'
$DefaultThemePath = Join-Path $AssetsRoot 'theme.json'
$DefaultImagePath = Join-Path $AssetsRoot 'dream-reference.png'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$ThemeDir = Join-Path $StateRoot 'theme'
$ThemePath = Join-Path $ThemeDir 'theme.json'

function Assert-ThemeDir {
  $stateFull = [System.IO.Path]::GetFullPath($StateRoot)
  $themeFull = [System.IO.Path]::GetFullPath($ThemeDir)
  if (-not $themeFull.StartsWith($stateFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Theme directory is outside the expected state root: $ThemeDir"
  }
}

function Read-JsonFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json
}

function Get-TextValue([object]$Provided, [object]$Current, [object]$Default, [int]$MaxLength) {
  $value = $null
  if ($null -ne $Provided -and "$Provided".Trim().Length -gt 0) { $value = "$Provided" }
  elseif ($null -ne $Current -and "$Current".Trim().Length -gt 0) { $value = "$Current" }
  else { $value = "$Default" }
  if ($value.Length -gt $MaxLength) { return $value.Substring(0, $MaxLength) }
  return $value
}

function Get-ColorValue([object]$Provided, [object]$CurrentColors, [object]$DefaultColors, [string]$Name) {
  if ($null -ne $Provided -and "$Provided".Length -gt 0) { return "$Provided".ToLowerInvariant() }
  $currentProperty = if ($CurrentColors) { $CurrentColors.PSObject.Properties[$Name] } else { $null }
  if ($currentProperty -and "$($currentProperty.Value)".Length -gt 0) { return "$($currentProperty.Value)" }
  $defaultProperty = $DefaultColors.PSObject.Properties[$Name]
  return "$($defaultProperty.Value)"
}

function Convert-HexToRgba([string]$Hex, [double]$Alpha) {
  $red = [Convert]::ToInt32($Hex.Substring(1, 2), 16)
  $green = [Convert]::ToInt32($Hex.Substring(3, 2), 16)
  $blue = [Convert]::ToInt32($Hex.Substring(5, 2), 16)
  return "rgba($red, $green, $blue, $Alpha)"
}

function Read-OptionalValue([string]$Prompt, [string]$Current) {
  $value = Read-Host "$Prompt [$Current]"
  if ($value.Trim().Length -gt 0) { return $value.Trim() }
  return $Current
}

function Read-OptionalColor([string]$Prompt, [string]$Current) {
  while ($true) {
    $value = Read-Host "$Prompt [$Current]"
    if ($value.Trim().Length -eq 0) { return $Current }
    if ($value -match '^#[0-9A-Fa-f]{6}$') { return $value.ToLowerInvariant() }
    Write-Host 'Use a six-digit hex color, for example #b65cff.'
  }
}

Assert-ThemeDir
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

if ($Interactive -and -not $Reset) {
  $defaultThemeForPrompt = Read-JsonFile $DefaultThemePath
  $currentThemeForPrompt = Read-JsonFile $ThemePath
  if (-not $currentThemeForPrompt) { $currentThemeForPrompt = $defaultThemeForPrompt }

  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = 'Choose a Codex Dream Skin image'
  $dialog.Filter = 'Images (*.png;*.jpg;*.jpeg;*.webp)|*.png;*.jpg;*.jpeg;*.webp|All files (*.*)|*.*'
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $ImagePath = $dialog.FileName
  }

  $Name = Read-OptionalValue 'Theme name' "$($currentThemeForPrompt.name)"
  $Tagline = Read-OptionalValue 'Hero tagline' "$($currentThemeForPrompt.tagline)"
  $Quote = Read-OptionalValue 'Ribbon quote' "$($currentThemeForPrompt.quote)"
  $Signature = Read-OptionalValue 'Signature' "$($currentThemeForPrompt.signature)"
  $Accent = Read-OptionalColor 'Accent color' "$($currentThemeForPrompt.colors.accent)"
  $Secondary = Read-OptionalColor 'Secondary color' "$($currentThemeForPrompt.colors.secondary)"
  $Highlight = Read-OptionalColor 'Highlight color' "$($currentThemeForPrompt.colors.highlight)"
  $applyAnswer = Read-Host 'Apply now? [Y/n]'
  if ($applyAnswer.Trim().Length -eq 0 -or $applyAnswer -match '^(y|yes)$') { $Apply = $true }
}

if ($Reset) {
  if (Test-Path -LiteralPath $ThemeDir) {
    Remove-Item -LiteralPath $ThemeDir -Recurse -Force
  }
  if ($Apply) {
    $start = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
    $arguments = @('-Port', "$Port")
    if ($RestartExisting) { $arguments += '-RestartExisting' }
    & $start @arguments
  }
  Write-Host 'Codex Dream Skin theme reset to bundled defaults.'
  exit 0
}

$defaultTheme = Read-JsonFile $DefaultThemePath
if (-not $defaultTheme) { throw "Default theme not found: $DefaultThemePath" }
$currentTheme = Read-JsonFile $ThemePath
if (-not $currentTheme) { $currentTheme = $defaultTheme }

New-Item -ItemType Directory -Force -Path $ThemeDir | Out-Null

$imageName = $null
if ($ImagePath) {
  $resolvedImage = Resolve-Path -LiteralPath $ImagePath -ErrorAction Stop
  $source = Get-Item -LiteralPath $resolvedImage.ProviderPath
  if (-not $source.PSIsContainer) {
    $extension = $source.Extension.ToLowerInvariant()
    if ($extension -notin @('.png', '.jpg', '.jpeg', '.webp')) {
      throw 'Theme image must be PNG, JPEG, or WebP.'
    }
    if ($source.Length -le 0 -or $source.Length -gt 16777216) {
      throw 'Theme image must be non-empty and no larger than 16 MB.'
    }
    $imageName = "background-$((Get-Date).ToString('yyyyMMdd-HHmmss'))$extension"
    Copy-Item -LiteralPath $source.FullName -Destination (Join-Path $ThemeDir $imageName) -Force
  } else {
    throw "Theme image is a directory: $($source.FullName)"
  }
} else {
  $candidate = if ($currentTheme.image) { [System.IO.Path]::GetFileName("$($currentTheme.image)") } else { $null }
  if ($candidate -and (Test-Path -LiteralPath (Join-Path $ThemeDir $candidate))) {
    $imageName = $candidate
  } else {
    $imageName = 'dream-reference.png'
    Copy-Item -LiteralPath $DefaultImagePath -Destination (Join-Path $ThemeDir $imageName) -Force
  }
}

Get-ChildItem -LiteralPath $ThemeDir -File -Filter 'background-*' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ne $imageName } |
  Remove-Item -Force

$colors = [ordered]@{
  background = Get-ColorValue $Background $currentTheme.colors $defaultTheme.colors 'background'
  panel = Get-ColorValue $Panel $currentTheme.colors $defaultTheme.colors 'panel'
  panelAlt = Get-ColorValue $PanelAlt $currentTheme.colors $defaultTheme.colors 'panelAlt'
  accent = Get-ColorValue $Accent $currentTheme.colors $defaultTheme.colors 'accent'
  accentAlt = Get-ColorValue $AccentAlt $currentTheme.colors $defaultTheme.colors 'accentAlt'
  secondary = Get-ColorValue $Secondary $currentTheme.colors $defaultTheme.colors 'secondary'
  highlight = Get-ColorValue $Highlight $currentTheme.colors $defaultTheme.colors 'highlight'
  text = Get-ColorValue $Text $currentTheme.colors $defaultTheme.colors 'text'
  muted = Get-ColorValue $Muted $currentTheme.colors $defaultTheme.colors 'muted'
  line = Convert-HexToRgba (Get-ColorValue $Secondary $currentTheme.colors $defaultTheme.colors 'secondary') 0.42
}

$theme = [ordered]@{
  schemaVersion = 1
  name = Get-TextValue $Name $currentTheme.name $defaultTheme.name 80
  brandSubtitle = Get-TextValue $BrandSubtitle $currentTheme.brandSubtitle $defaultTheme.brandSubtitle 80
  tagline = Get-TextValue $Tagline $currentTheme.tagline $defaultTheme.tagline 160
  projectPrefix = Get-TextValue $ProjectPrefix $currentTheme.projectPrefix $defaultTheme.projectPrefix 40
  projectLabel = Get-TextValue $ProjectLabel $currentTheme.projectLabel $defaultTheme.projectLabel 40
  statusText = Get-TextValue $null $currentTheme.statusText $defaultTheme.statusText 80
  quote = Get-TextValue $Quote $currentTheme.quote $defaultTheme.quote 100
  signature = Get-TextValue $Signature $currentTheme.signature $defaultTheme.signature 80
  image = $imageName
  colors = $colors
}

($theme | ConvertTo-Json -Depth 6) + "`n" | Set-Content -LiteralPath $ThemePath -Encoding utf8

if ($Apply) {
  $start = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
  $arguments = @('-Port', "$Port")
  if ($RestartExisting) { $arguments += '-RestartExisting' }
  & $start @arguments
}

Write-Host "Codex Dream Skin theme saved: $($theme.name)"
