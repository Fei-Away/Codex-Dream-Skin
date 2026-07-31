if (-not (Get-Command Read-DreamSkinUtf8File -ErrorAction SilentlyContinue)) {
  . (Join-Path $PSScriptRoot 'config-utf8.ps1')
}

$script:DreamSkinMaxImageBytes = 10 * 1024 * 1024
$script:DreamSkinMaxThemeArchiveBytes = 32 * 1024 * 1024
$script:DreamSkinMaxThemeArchiveExpandedBytes = 64 * 1024 * 1024
$script:DreamSkinMaxThemeArchiveEntries = 32
$script:DreamSkinCommunityApiOrigin = 'https://api.dreamskin.cc'
$script:DreamSkinMaxCommunityMetadataBytes = 64 * 1024
$script:DreamSkinThemeReplacementCommitText = 'dreamskin-theme-replace-commit/1'

function Test-DreamSkinCommunityVersionId {
  param([AllowNull()][string]$Value)
  return [bool]($Value -and [regex]::IsMatch(
    $Value,
    '\Aver_[a-z0-9]{8,64}\z',
    [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
  ))
}

function Resolve-DreamSkinCommunityApplyUri {
  param([Parameter(Mandatory = $true)][string]$Uri)
  $match = [regex]::Match(
    $Uri,
    '\Adreamskin://apply/?\?version=(ver_[a-z0-9]{8,64})\z',
    [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
  )
  if (-not $match.Success) {
    throw 'Only a canonical dreamskin://apply?version=ver_... link is accepted.'
  }
  $versionId = $match.Groups[1].Value
  if (-not (Test-DreamSkinCommunityVersionId -Value $versionId)) {
    throw 'The community theme version id is invalid.'
  }
  return $versionId
}

function Get-DreamSkinCommunityThemeEndpoints {
  param([Parameter(Mandatory = $true)][string]$VersionId)
  if (-not (Test-DreamSkinCommunityVersionId -Value $VersionId)) {
    throw 'The community theme version id is invalid.'
  }
  $metadataUri = "$script:DreamSkinCommunityApiOrigin/v1/themes/$VersionId"
  return [pscustomobject]@{
    MetadataUri = $metadataUri
    DownloadUri = "$metadataUri/download"
  }
}

function Get-DreamSkinCommunityMetadataProperty {
  param(
    [Parameter(Mandatory = $true)][object]$Metadata,
    [Parameter(Mandatory = $true)][string]$Name
  )
  $properties = @($Metadata.PSObject.Properties | Where-Object { $_.Name -ceq $Name })
  if ($properties.Count -ne 1) {
    throw "Community theme metadata is missing the exact $Name field."
  }
  return $properties[0].Value
}

function Get-DreamSkinUnicodeScalarCount {
  param([Parameter(Mandatory = $true)][string]$Value)
  $count = 0
  for ($index = 0; $index -lt $Value.Length; $index++) {
    $character = $Value[$index]
    if ([char]::IsHighSurrogate($character)) {
      if ($index + 1 -ge $Value.Length -or -not [char]::IsLowSurrogate($Value[$index + 1])) {
        return -1
      }
      $index += 1
    } elseif ([char]::IsLowSurrogate($character)) {
      return -1
    }
    $count += 1
  }
  return $count
}

function Test-DreamSkinCommunityDisplayTextHasForbiddenUnicode {
  param([Parameter(Mandatory = $true)][string]$Value)
  for ($index = 0; $index -lt $Value.Length; $index++) {
    $category = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($Value, $index)
    if ($category -in @(
      [System.Globalization.UnicodeCategory]::Format,
      [System.Globalization.UnicodeCategory]::LineSeparator,
      [System.Globalization.UnicodeCategory]::ParagraphSeparator
    )) {
      return $true
    }
    if ([char]::IsHighSurrogate($Value[$index])) { $index += 1 }
  }
  return $false
}

function Assert-DreamSkinCommunityDisplayText {
  param(
    [AllowNull()][object]$Value,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][int]$MaximumLength
  )
  if ($Value -isnot [string]) {
    throw "Community theme metadata contains an invalid $Name field."
  }
  $scalarCount = Get-DreamSkinUnicodeScalarCount -Value $Value
  if ($scalarCount -lt 1 -or $scalarCount -gt $MaximumLength -or
    $Value -cne $Value.Trim() -or $Value -match '[\u0000-\u001f\u007f-\u009f]' -or
    (Test-DreamSkinCommunityDisplayTextHasForbiddenUnicode -Value $Value)) {
    throw "Community theme metadata contains an invalid $Name field."
  }
  return $Value
}

function ConvertFrom-DreamSkinCommunityThemeMetadata {
  param(
    [Parameter(Mandatory = $true)][string]$Json,
    [Parameter(Mandatory = $true)][string]$ExpectedVersionId
  )
  if (-not (Test-DreamSkinCommunityVersionId -Value $ExpectedVersionId)) {
    throw 'The expected community theme version id is invalid.'
  }
  $jsonBytes = [System.Text.Encoding]::UTF8.GetByteCount($Json)
  if ($jsonBytes -lt 1 -or $jsonBytes -gt $script:DreamSkinMaxCommunityMetadataBytes) {
    throw 'Community theme metadata is empty or exceeds the 64 KiB limit.'
  }
  $trimmedJson = $Json.Trim()
  if (-not $trimmedJson.StartsWith('{', [System.StringComparison]::Ordinal) -or
    -not $trimmedJson.EndsWith('}', [System.StringComparison]::Ordinal)) {
    throw 'Community theme metadata must be a JSON object.'
  }
  try { $metadata = $Json | ConvertFrom-Json -ErrorAction Stop } catch {
    throw 'Community theme metadata is not valid JSON.'
  }
  if ($null -eq $metadata -or $metadata -is [string] -or $metadata -is [array] -or
    $metadata -is [System.ValueType]) {
    throw 'Community theme metadata must be a JSON object.'
  }

  $id = Get-DreamSkinCommunityMetadataProperty -Metadata $metadata -Name 'id'
  if ($id -isnot [string] -or $id -cne $ExpectedVersionId) {
    throw 'Community theme metadata does not match the requested version id.'
  }
  $applyCompatible = Get-DreamSkinCommunityMetadataProperty `
    -Metadata $metadata -Name 'applyCompatible'
  if ($applyCompatible -isnot [bool] -or -not $applyCompatible) {
    throw 'Community theme metadata does not mark this version as apply-compatible.'
  }
  $themeId = Assert-DreamSkinCommunityDisplayText `
    -Value (Get-DreamSkinCommunityMetadataProperty -Metadata $metadata -Name 'themeId') `
    -Name 'themeId' -MaximumLength 80
  $name = Assert-DreamSkinCommunityDisplayText `
    -Value (Get-DreamSkinCommunityMetadataProperty -Metadata $metadata -Name 'name') `
    -Name 'name' -MaximumLength 120
  $author = Assert-DreamSkinCommunityDisplayText `
    -Value (Get-DreamSkinCommunityMetadataProperty -Metadata $metadata -Name 'authorDisplayName') `
    -Name 'authorDisplayName' -MaximumLength 120
  $license = Assert-DreamSkinCommunityDisplayText `
    -Value (Get-DreamSkinCommunityMetadataProperty -Metadata $metadata -Name 'license') `
    -Name 'license' -MaximumLength 80
  $version = Get-DreamSkinCommunityMetadataProperty -Metadata $metadata -Name 'version'
  if ($version -isnot [string] -or $version.Length -gt 32 -or -not [regex]::IsMatch(
    $version,
    '\A(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\z',
    [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
  )) {
    throw 'Community theme metadata contains an invalid semantic version.'
  }
  $sha256 = Get-DreamSkinCommunityMetadataProperty -Metadata $metadata -Name 'packageSha256'
  if ($sha256 -isnot [string] -or -not [regex]::IsMatch(
    $sha256,
    '\A[a-f0-9]{64}\z',
    [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
  )) {
    throw 'Community theme metadata contains an invalid SHA-256 value.'
  }
  $packageBytesValue = Get-DreamSkinCommunityMetadataProperty -Metadata $metadata -Name 'packageBytes'
  if ($packageBytesValue -isnot [int] -and $packageBytesValue -isnot [long]) {
    throw 'Community theme metadata packageBytes must be an integer.'
  }
  $packageBytes = [int64]$packageBytesValue
  if ($packageBytes -lt 1 -or $packageBytes -gt $script:DreamSkinMaxThemeArchiveBytes) {
    throw 'Community theme package size must be between 1 byte and 32 MiB.'
  }

  return [pscustomobject]@{
    Id = $id
    ApplyCompatible = $applyCompatible
    ThemeId = $themeId
    Name = $name
    Version = $version
    AuthorDisplayName = $author
    License = $license
    PackageSha256 = $sha256
    PackageBytes = $packageBytes
  }
}

function Assert-DreamSkinNoReparseComponents {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetPathRoot($fullPath)
  $current = $fullPath
  while ($true) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Managed Dream Skin path contains a junction or symbolic link: $current"
      }
    }
    $currentNormalized = $current.TrimEnd('\')
    $rootNormalized = $root.TrimEnd('\')
    if ($currentNormalized.Equals($rootNormalized, [System.StringComparison]::OrdinalIgnoreCase)) { break }
    $parent = [System.IO.Path]::GetDirectoryName($current)
    if (-not $parent -or $parent.Equals($current, [System.StringComparison]::OrdinalIgnoreCase)) { break }
    $current = $parent
  }
}

function Ensure-DreamSkinManagedDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
  if (-not ($fullPath.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $fullPath.StartsWith($fullRoot + '\', [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "Managed Dream Skin path escaped its state root: $fullPath"
  }
  Assert-DreamSkinNoReparseComponents -Path $fullPath
  if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
    throw "Managed Dream Skin path is a file, not a directory: $fullPath"
  }
  New-Item -ItemType Directory -Force -Path $fullPath | Out-Null
  Assert-DreamSkinNoReparseComponents -Path $fullPath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Container)) {
    throw "Managed Dream Skin directory could not be created: $fullPath"
  }
}

function Remove-DreamSkinManagedDirectoryVerified {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
  if (-not ($fullPath.StartsWith($fullRoot + '\', [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "Managed Dream Skin cleanup escaped its state root: $fullPath"
  }
  if (-not (Test-Path -LiteralPath $fullPath -ErrorAction Stop)) { return }
  Assert-DreamSkinNoReparseComponents -Path $fullPath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Container -ErrorAction Stop)) {
    throw "Managed Dream Skin cleanup target is not a directory: $fullPath"
  }
  # Windows PowerShell 5.1's FileSystem provider cannot reliably recurse past
  # MAX_PATH. Directory.Delete uses the framework's long-path support after the
  # containment and reparse checks above have bound the exact managed target.
  [System.IO.Directory]::Delete($fullPath, $true)
  if (Test-Path -LiteralPath $fullPath -ErrorAction Stop) {
    throw "Managed Dream Skin cleanup was not verified: $fullPath"
  }
}

function Assert-DreamSkinRestoredThemeFingerprint {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ExpectedFingerprint,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Container -ErrorAction Stop)) {
    throw "$Label was not restored as a directory."
  }
  $actualFingerprint = Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $Path
  if ($actualFingerprint -cne $ExpectedFingerprint) {
    throw "$Label fingerprint does not match the pre-import record."
  }
}

function Get-DreamSkinValidatedImageMetadata {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Get-Command Get-DreamSkinNodeRuntime -ErrorAction SilentlyContinue)) {
    throw 'Node.js runtime validation is unavailable for image metadata checks.'
  }
  $node = Get-DreamSkinNodeRuntime
  $metadataScript = Join-Path $PSScriptRoot 'image-metadata.mjs'
  $output = @(& $node.Path $metadataScript '--check' ([System.IO.Path]::GetFullPath($Path)) 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Image metadata is invalid or exceeds the 16384px / 50MP safety limit: $Path"
  }
  try { $metadata = ($output -join "`n") | ConvertFrom-Json -ErrorAction Stop } catch {
    throw "Image metadata helper returned invalid output: $Path"
  }
  if ($null -eq $metadata -or $null -eq $metadata.width -or $null -eq $metadata.height) {
    throw "Image metadata is invalid or exceeds the 16384px / 50MP safety limit: $Path"
  }
}

function Assert-DreamSkinImageFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$SkipImageMetadata
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Image does not exist: $fullPath"
  }
  $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
  if ($extension -notin @('.png', '.jpg', '.jpeg', '.webp')) {
    throw "Unsupported image format: $extension"
  }
  $length = (Get-Item -LiteralPath $fullPath -Force).Length
  if ($length -lt 1) { throw 'Theme image cannot be empty.' }
  if ($length -gt $script:DreamSkinMaxImageBytes) {
    throw 'Theme image exceeds the 10 MiB limit.'
  }
  if (-not $SkipImageMetadata) {
    Get-DreamSkinValidatedImageMetadata -Path $fullPath
  }
}

function Assert-DreamSkinSafeCssFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  Assert-DreamSkinNoReparseComponents -Path $fullPath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "Theme Safe CSS does not exist: $fullPath"
  }
  if (-not (Get-Command Get-DreamSkinNodeRuntime -ErrorAction SilentlyContinue)) {
    throw 'Node.js runtime validation is unavailable for Safe CSS checks.'
  }
  $node = Get-DreamSkinNodeRuntime
  $validator = Join-Path $PSScriptRoot 'validate-safe-css-file.mjs'
  if (-not (Test-Path -LiteralPath $validator -PathType Leaf)) {
    throw 'Safe CSS validator is missing from the runtime engine.'
  }
  $output = @(& $node.Path $validator $fullPath 2>&1)
  if ($LASTEXITCODE -ne 0) {
    $detail = ($output -join "`n").Trim()
    throw $(if ($detail) { $detail } else { 'Theme Safe CSS failed validation.' })
  }
}

function Get-DreamSkinThemePaths {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))
  $fullRoot = [System.IO.Path]::GetFullPath($StateRoot)
  return [pscustomobject]@{
    Root = $fullRoot
    Active = Join-Path $fullRoot 'active-theme'
    Saved = Join-Path $fullRoot 'themes'
    Images = Join-Path $fullRoot 'images'
    PauseFile = Join-Path $fullRoot 'paused'
    State = Join-Path $fullRoot 'state.json'
  }
}

function Test-DreamSkinThemePathWithin {
  param([string]$Path, [string]$Root)
  if (-not $Path -or -not $Root) { return $false }
  try {
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
    $inside = $fullPath.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $fullPath.StartsWith($fullRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $inside) { return $false }

    $current = $fullPath.TrimEnd('\')
    while ($true) {
      if (-not (Test-Path -LiteralPath $current)) { return $false }
      $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        return $false
      }
      if ($current.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
      }
      $parent = [System.IO.Path]::GetDirectoryName($current)
      if (-not $parent -or $parent.Equals($current, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $false
      }
      $current = $parent.TrimEnd('\')
    }
  } catch {
    return $false
  }
}

function Read-DreamSkinTheme {
  param(
    [Parameter(Mandatory = $true)][string]$ThemeDirectory,
    [switch]$SkipImageMetadata
  )
  $directory = [System.IO.Path]::GetFullPath($ThemeDirectory)
  Assert-DreamSkinNoReparseComponents -Path $directory
  $themePath = Join-Path $directory 'theme.json'
  Assert-DreamSkinNoReparseComponents -Path $themePath
  if (-not (Test-Path -LiteralPath $themePath -PathType Leaf)) {
    throw "Theme metadata is missing: $themePath"
  }
  try {
    $theme = (Read-DreamSkinUtf8File -Path $themePath) | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Theme metadata is invalid JSON: $themePath"
  }
  if ($null -eq $theme -or $theme -is [string] -or $theme -is [array] -or -not $theme.image) {
    throw "Theme metadata must be an object with a relative image path: $themePath"
  }
  $image = "$($theme.image)"
  if ([System.IO.Path]::IsPathRooted($image)) { throw 'Theme image path must be relative.' }
  $imagePath = [System.IO.Path]::GetFullPath((Join-Path $directory $image))
  if (-not (Test-DreamSkinThemePathWithin -Path $imagePath -Root $directory) -or
    -not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
    throw 'Theme image must remain inside its theme directory and exist.'
  }
  Assert-DreamSkinImageFile -Path $imagePath -SkipImageMetadata:$SkipImageMetadata
  return [pscustomobject]@{
    Directory = $directory
    ThemePath = $themePath
    ImagePath = $imagePath
    Theme = Normalize-DreamSkinThemeContract -Theme $theme
  }
}

function Normalize-DreamSkinThemeContract {
  param([Parameter(Mandatory = $true)][object]$Theme)
  if ($null -eq $Theme -or $Theme -is [string] -or $Theme -is [array]) {
    throw 'Theme contract must be a JSON object.'
  }
  if (-not $Theme.PSObject.Properties['id'] -or -not $Theme.PSObject.Properties['id'].Value) {
    $Theme | Add-Member -NotePropertyName id -NotePropertyValue 'custom' -Force
  }
  if (-not $Theme.PSObject.Properties['appearance'] -or -not $Theme.PSObject.Properties['appearance'].Value) {
    $Theme | Add-Member -NotePropertyName appearance -NotePropertyValue 'auto' -Force
  }
  if (-not $Theme.PSObject.Properties['art'] -or -not $Theme.PSObject.Properties['art'].Value) {
    $Theme | Add-Member -NotePropertyName art -NotePropertyValue `
      ([pscustomobject]@{ focusX = $null; focusY = $null; safeArea = 'auto'; taskMode = 'auto' }) -Force
  }
  return $Theme
}

function Write-DreamSkinTheme {
  param(
    [Parameter(Mandatory = $true)][string]$ThemeDirectory,
    [Parameter(Mandatory = $true)][object]$Theme
  )
  Assert-DreamSkinNoReparseComponents -Path $ThemeDirectory
  New-Item -ItemType Directory -Force -Path $ThemeDirectory | Out-Null
  Assert-DreamSkinNoReparseComponents -Path $ThemeDirectory
  $Theme = Normalize-DreamSkinThemeContract -Theme $Theme
  $json = $Theme | ConvertTo-Json -Depth 8
  $themePath = Join-Path $ThemeDirectory 'theme.json'
  Assert-DreamSkinNoReparseComponents -Path $themePath
  Write-DreamSkinUtf8FileAtomically -Path $themePath -Content ($json + "`r`n")
}

function Get-DreamSkinActiveThemeAppearance {
  param([Parameter(Mandatory = $true)][string]$ThemeDirectory)
  try {
    $appearance = "$((Read-DreamSkinTheme -ThemeDirectory $ThemeDirectory).Theme.appearance)"
    if ($appearance -in @('light', 'dark')) { return $appearance }
  } catch {}
  return 'auto'
}

function Initialize-DreamSkinThemeStore {
  param(
    [Parameter(Mandatory = $true)][string]$SkillRoot,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  foreach ($directory in @($paths.Root, $paths.Active, $paths.Saved, $paths.Images)) {
    Ensure-DreamSkinManagedDirectory -Path $directory -Root $paths.Root
  }
  Invoke-DreamSkinThemeReplacementRecovery -Paths $paths
  $assetRoot = Join-Path $SkillRoot 'assets'
  $bundledTheme = Read-DreamSkinTheme -ThemeDirectory $assetRoot
  $assetImage = $bundledTheme.ImagePath
  $assetImageName = [System.IO.Path]::GetFileName($assetImage)
  $bundledPresetId = "$($bundledTheme.Theme.id)"
  if ($bundledPresetId -cnotmatch '^preset-[A-Za-z0-9_-]{1,72}$') {
    throw "Bundled theme id must be a safe preset id: $bundledPresetId"
  }
  $activeTheme = Join-Path $paths.Active 'theme.json'
  Assert-DreamSkinNoReparseComponents -Path $activeTheme
  if (-not (Test-Path -LiteralPath $activeTheme -PathType Leaf)) {
    Ensure-DreamSkinManagedDirectory -Path $paths.Active -Root $paths.Root
    Assert-DreamSkinNoReparseComponents -Path (Join-Path $paths.Active $assetImageName)
    $activeImage = Join-Path $paths.Active $assetImageName
    Copy-Item -LiteralPath $assetImage -Destination $activeImage -Force
    Assert-DreamSkinNoReparseComponents -Path $activeImage
    Assert-DreamSkinImageFile -Path $activeImage
    $imageArchive = Join-Path $paths.Images $assetImageName
    Assert-DreamSkinNoReparseComponents -Path $imageArchive
    Copy-Item -LiteralPath $assetImage -Destination $imageArchive -Force
    Assert-DreamSkinNoReparseComponents -Path $imageArchive
    Assert-DreamSkinImageFile -Path $imageArchive
    Assert-DreamSkinNoReparseComponents -Path $activeTheme
    Copy-Item -LiteralPath (Join-Path $assetRoot 'theme.json') -Destination $activeTheme -Force
  }
  $retiredPresetDirectory = Join-Path $paths.Saved 'preset-romantic-rose'
  Assert-DreamSkinNoReparseComponents -Path $retiredPresetDirectory
  if (Test-Path -LiteralPath $retiredPresetDirectory) {
    Remove-Item -LiteralPath $retiredPresetDirectory -Recurse -Force
  }
  $presetDirectory = Join-Path $paths.Saved $bundledPresetId
  $presetTheme = Join-Path $presetDirectory 'theme.json'
  Assert-DreamSkinNoReparseComponents -Path $presetDirectory
  Assert-DreamSkinNoReparseComponents -Path $presetTheme
  # Refresh the saved copy on every run (matching macOS seeding) so preset
  # metadata upgrades — e.g. the #183 appearance pin — reach existing installs.
  Ensure-DreamSkinManagedDirectory -Path $presetDirectory -Root $paths.Root
  $presetImage = Join-Path $presetDirectory $assetImageName
  Assert-DreamSkinNoReparseComponents -Path $presetImage
  Copy-Item -LiteralPath $assetImage -Destination $presetImage -Force
  Assert-DreamSkinNoReparseComponents -Path $presetImage
  Assert-DreamSkinImageFile -Path $presetImage
  Assert-DreamSkinNoReparseComponents -Path $presetTheme
  Copy-Item -LiteralPath (Join-Path $assetRoot 'theme.json') -Destination $presetTheme -Force
  # Bundled Gothic Void Crusade (same pack as macOS presets/).
  $gothicSource = Join-Path $SkillRoot 'presets\preset-gothic-void-crusade'
  $gothicDirectory = Join-Path $paths.Saved 'preset-gothic-void-crusade'
  $gothicTheme = Join-Path $gothicDirectory 'theme.json'
  $gothicSourceTheme = Join-Path $gothicSource 'theme.json'
  $gothicSourceImage = Join-Path $gothicSource 'background.jpg'
  Assert-DreamSkinNoReparseComponents -Path $gothicDirectory
  Assert-DreamSkinNoReparseComponents -Path $gothicTheme
  if ((Test-Path -LiteralPath $gothicSourceTheme -PathType Leaf) -and
    (Test-Path -LiteralPath $gothicSourceImage -PathType Leaf)) {
    Ensure-DreamSkinManagedDirectory -Path $gothicDirectory -Root $paths.Root
    $gothicImage = Join-Path $gothicDirectory 'background.jpg'
    Assert-DreamSkinNoReparseComponents -Path $gothicImage
    Assert-DreamSkinImageFile -Path $gothicSourceImage
    Copy-Item -LiteralPath $gothicSourceImage -Destination $gothicImage -Force
    Assert-DreamSkinNoReparseComponents -Path $gothicImage
    Assert-DreamSkinImageFile -Path $gothicImage
    Assert-DreamSkinNoReparseComponents -Path $gothicTheme
    Copy-Item -LiteralPath $gothicSourceTheme -Destination $gothicTheme -Force
  }
  # Refresh the staged active copy of official presets too; otherwise metadata
  # staged by an older engine (e.g. pre-#183 appearance "auto") keeps steering
  # the appearanceTheme pin after upgrades.
  if (Test-Path -LiteralPath $activeTheme -PathType Leaf) {
    $activeId = ''
    try {
      $activeId = "$((Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata).Theme.id)"
    } catch {}
    $refreshSource = $null
    if ($activeId -ceq $bundledPresetId) { $refreshSource = $assetRoot }
    elseif ($activeId -ceq 'preset-gothic-void-crusade' -and
      (Test-Path -LiteralPath $gothicSourceTheme -PathType Leaf)) { $refreshSource = $gothicSource }
    if ($null -ne $refreshSource) {
      $sourcePack = Read-DreamSkinTheme -ThemeDirectory $refreshSource
      $sourceJson = Read-DreamSkinUtf8File -Path $sourcePack.ThemePath
      $activeJson = Read-DreamSkinUtf8File -Path $activeTheme
      if ($sourceJson -cne $activeJson) {
        $sourceImageName = [System.IO.Path]::GetFileName($sourcePack.ImagePath)
        $refreshedImage = Join-Path $paths.Active $sourceImageName
        Assert-DreamSkinNoReparseComponents -Path $refreshedImage
        Copy-Item -LiteralPath $sourcePack.ImagePath -Destination $refreshedImage -Force
        Assert-DreamSkinNoReparseComponents -Path $refreshedImage
        Assert-DreamSkinImageFile -Path $refreshedImage
        Copy-Item -LiteralPath $sourcePack.ThemePath -Destination $activeTheme -Force
      }
    }
  }
  $null = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  return $paths
}

function New-DreamSkinThemeImageName {
  param([Parameter(Mandatory = $true)][string]$Extension)
  return 'art-' + (Get-Date).ToString('yyyyMMdd-HHmmss-fff') + '-' +
    [guid]::NewGuid().ToString('N').Substring(0, 8) + $Extension.ToLowerInvariant()
}

function Set-DreamSkinActiveTheme {
  param(
    [Parameter(Mandatory = $true)][string]$ImagePath,
    [AllowNull()][object]$Theme,
    [string]$Name,
    [AllowNull()][string]$SafeCssPath,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $paths.Root -Root $paths.Root
  Ensure-DreamSkinManagedDirectory -Path $paths.Active -Root $paths.Root
  Ensure-DreamSkinManagedDirectory -Path $paths.Images -Root $paths.Root
  $source = [System.IO.Path]::GetFullPath($ImagePath)
  Assert-DreamSkinImageFile -Path $source
  $extension = [System.IO.Path]::GetExtension($source).ToLowerInvariant()
  $oldImage = $null
  try { $oldImage = (Read-DreamSkinTheme -ThemeDirectory $paths.Active).ImagePath } catch {}
  if ($null -eq $Theme) {
    $Theme = [pscustomobject]@{
      id = 'custom'
      name = '自定义主题'
      appearance = 'auto'
      art = [pscustomobject]@{ focusX = $null; focusY = $null; safeArea = 'auto'; taskMode = 'auto' }
    }
  }
  $imageName = New-DreamSkinThemeImageName -Extension $extension
  $target = Join-Path $paths.Active $imageName
  $temporary = Join-Path $paths.Active ('.dream-tmp-' + [guid]::NewGuid().ToString('N') + $extension)
  $temporaryCss = $null
  try {
    if ($SafeCssPath) {
      $safeCssSource = [System.IO.Path]::GetFullPath($SafeCssPath)
      Assert-DreamSkinSafeCssFile -Path $safeCssSource
      $temporaryCss = Join-Path $paths.Active ('.dream-tmp-' + [guid]::NewGuid().ToString('N') + '.css')
      Assert-DreamSkinNoReparseComponents -Path $temporaryCss
      Copy-Item -LiteralPath $safeCssSource -Destination $temporaryCss -Force
      Assert-DreamSkinSafeCssFile -Path $temporaryCss
    }
    Assert-DreamSkinNoReparseComponents -Path $target
    Assert-DreamSkinNoReparseComponents -Path $temporary
    Copy-Item -LiteralPath $source -Destination $temporary -Force
    Assert-DreamSkinNoReparseComponents -Path $temporary
    Assert-DreamSkinImageFile -Path $temporary
    Move-Item -LiteralPath $temporary -Destination $target -Force
    Assert-DreamSkinNoReparseComponents -Path $target
    Assert-DreamSkinImageFile -Path $target
    $Theme | Add-Member -NotePropertyName image -NotePropertyValue $imageName -Force
    if ($Name) { $Theme | Add-Member -NotePropertyName name -NotePropertyValue $Name -Force }
    $Theme = Normalize-DreamSkinThemeContract -Theme $Theme
    $activeCss = Join-Path $paths.Active 'theme.css'
    Assert-DreamSkinNoReparseComponents -Path $activeCss
    if ($temporaryCss) {
      Move-Item -LiteralPath $temporaryCss -Destination $activeCss -Force
      $temporaryCss = $null
      Assert-DreamSkinSafeCssFile -Path $activeCss
    } else {
      Remove-Item -LiteralPath $activeCss -Force -ErrorAction SilentlyContinue
    }
    Write-DreamSkinTheme -ThemeDirectory $paths.Active -Theme $Theme
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    if ($temporaryCss) { Remove-Item -LiteralPath $temporaryCss -Force -ErrorAction SilentlyContinue }
  }
  $sameImage = $oldImage -and ([System.IO.Path]::GetFullPath($oldImage) -ieq [System.IO.Path]::GetFullPath($target))
  if ($oldImage -and -not $sameImage -and
    (Test-DreamSkinThemePathWithin -Path $oldImage -Root $paths.Active)) {
    Remove-Item -LiteralPath $oldImage -Force -ErrorAction SilentlyContinue
  }
  $imageArchive = Join-Path $paths.Images $imageName
  Assert-DreamSkinNoReparseComponents -Path $imageArchive
  Copy-Item -LiteralPath $target -Destination $imageArchive -Force
  Assert-DreamSkinNoReparseComponents -Path $imageArchive
  Assert-DreamSkinImageFile -Path $imageArchive
  return Read-DreamSkinTheme -ThemeDirectory $paths.Active
}

function Save-DreamSkinCurrentTheme {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $trimmed = $Name.Trim()
  if (-not $trimmed -or $trimmed.Length -gt 80 -or $trimmed -match '[\u0000-\u001f]') {
    throw 'Theme name must be between 1 and 80 visible characters.'
  }
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $paths.Root -Root $paths.Root
  Ensure-DreamSkinManagedDirectory -Path $paths.Saved -Root $paths.Root
  $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  $id = (Get-Date).ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
  $destination = Join-Path $paths.Saved $id
  Ensure-DreamSkinManagedDirectory -Path $destination -Root $paths.Root
  $extension = [System.IO.Path]::GetExtension($active.ImagePath).ToLowerInvariant()
  $imageName = 'art' + $extension
  $destinationImage = Join-Path $destination $imageName
  Assert-DreamSkinNoReparseComponents -Path $destinationImage
  Copy-Item -LiteralPath $active.ImagePath -Destination $destinationImage -Force
  Assert-DreamSkinNoReparseComponents -Path $destinationImage
  Assert-DreamSkinImageFile -Path $destinationImage
  $theme = $active.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $theme.id = $id
  $theme.name = $trimmed
  $theme.image = $imageName
  Write-DreamSkinTheme -ThemeDirectory $destination -Theme $theme
  $activeCss = Join-Path $paths.Active 'theme.css'
  if (Test-Path -LiteralPath $activeCss -PathType Leaf) {
    Assert-DreamSkinSafeCssFile -Path $activeCss
    $savedCss = Join-Path $destination 'theme.css'
    Copy-Item -LiteralPath $activeCss -Destination $savedCss -Force
    Assert-DreamSkinSafeCssFile -Path $savedCss
  }
  return Read-DreamSkinTheme -ThemeDirectory $destination
}

function Get-DreamSkinThemeSemanticFingerprint {
  param([Parameter(Mandatory = $true)][string]$ThemeDirectory)
  $loaded = Read-DreamSkinTheme -ThemeDirectory $ThemeDirectory -SkipImageMetadata
  $semanticTheme = $loaded.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $semanticTheme.PSObject.Properties.Remove('id')
  $themeJson = $semanticTheme | ConvertTo-Json -Depth 8 -Compress
  $themeBytes = [System.Text.Encoding]::UTF8.GetBytes($themeJson)
  $themeHasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $themeHash = ([System.BitConverter]::ToString($themeHasher.ComputeHash($themeBytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $themeHasher.Dispose()
  }
  $imageHash = (Get-FileHash -LiteralPath $loaded.ImagePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $combined = $themeHash + "`0" + $imageHash
  $cssPath = Join-Path $loaded.Directory 'theme.css'
  if (Test-Path -LiteralPath $cssPath -PathType Leaf) {
    Assert-DreamSkinNoReparseComponents -Path $cssPath
    if ((Get-Item -LiteralPath $cssPath -Force).Length -gt 256KB) {
      throw 'Saved theme CSS exceeds the 256 KB limit.'
    }
    $combined += "`0theme.css`0" + (Get-FileHash -LiteralPath $cssPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $licensePath = Join-Path $loaded.Directory 'LICENSE.txt'
  if (Test-Path -LiteralPath $licensePath -PathType Leaf) {
    Assert-DreamSkinNoReparseComponents -Path $licensePath
    if ((Get-Item -LiteralPath $licensePath -Force).Length -gt 64KB) {
      throw 'Saved theme license exceeds the 64 KB limit.'
    }
    $combined += "`0LICENSE.txt`0" + (Get-FileHash -LiteralPath $licensePath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $combinedBytes = [System.Text.Encoding]::UTF8.GetBytes($combined)
  $combinedHasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($combinedHasher.ComputeHash($combinedBytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $combinedHasher.Dispose()
  }
}

function Test-DreamSkinThemeDirectoryHasOnlyRuntimeFiles {
  param([Parameter(Mandatory = $true)][string]$ThemeDirectory)
  $loaded = Read-DreamSkinTheme -ThemeDirectory $ThemeDirectory -SkipImageMetadata
  $allowed = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  foreach ($name in @('theme.json', [System.IO.Path]::GetFileName($loaded.ImagePath),
      'theme.css', 'LICENSE.txt')) {
    $null = $allowed.Add($name)
  }
  foreach ($entry in Get-ChildItem -LiteralPath $loaded.Directory -Force -ErrorAction Stop) {
    Assert-DreamSkinNoReparseComponents -Path $entry.FullName
    if ($entry.PSIsContainer -or -not $allowed.Contains($entry.Name)) { return $false }
  }
  return $true
}

function ConvertTo-DreamSkinCanonicalJsonValue {
  param([AllowNull()][object]$Value)
  if ($null -eq $Value -or $Value -is [string] -or $Value -is [char] -or
    $Value -is [System.ValueType]) {
    return $Value
  }
  if ($Value -is [System.Collections.IDictionary]) {
    $canonicalDictionary = [ordered]@{}
    [string[]]$keys = @($Value.Keys | ForEach-Object { "$_" })
    [System.Array]::Sort($keys, [System.StringComparer]::Ordinal)
    foreach ($key in $keys) {
      $canonicalDictionary[$key] = ConvertTo-DreamSkinCanonicalJsonValue -Value $Value[$key]
    }
    return [pscustomobject]$canonicalDictionary
  }
  if ($Value -is [System.Collections.IEnumerable]) {
    $canonicalItems = @()
    foreach ($item in $Value) {
      $canonicalItems += ,(ConvertTo-DreamSkinCanonicalJsonValue -Value $item)
    }
    return ,$canonicalItems
  }
  $canonicalObject = [ordered]@{}
  [string[]]$propertyNames = @($Value.PSObject.Properties | ForEach-Object Name)
  [System.Array]::Sort($propertyNames, [System.StringComparer]::Ordinal)
  foreach ($propertyName in $propertyNames) {
    $canonicalObject[$propertyName] = ConvertTo-DreamSkinCanonicalJsonValue `
      -Value $Value.PSObject.Properties[$propertyName].Value
  }
  return [pscustomobject]$canonicalObject
}

function Write-DreamSkinCanonicalLength {
  param(
    [Parameter(Mandatory = $true)][System.IO.Stream]$Stream,
    [Parameter(Mandatory = $true)][uint64]$Length
  )
  [byte[]]$bytes = [System.BitConverter]::GetBytes($Length)
  if ([System.BitConverter]::IsLittleEndian) { [System.Array]::Reverse($bytes) }
  $Stream.Write($bytes, 0, $bytes.Length)
}

function Write-DreamSkinCanonicalString {
  param(
    [Parameter(Mandatory = $true)][System.IO.Stream]$Stream,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value
  )
  $Stream.WriteByte(4)
  [byte[]]$bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  Write-DreamSkinCanonicalLength -Stream $Stream -Length $bytes.Length
  $Stream.Write($bytes, 0, $bytes.Length)
}

function Write-DreamSkinCanonicalJsonValue {
  param(
    [Parameter(Mandatory = $true)][System.IO.Stream]$Stream,
    [Parameter(Mandatory = $true)][AllowNull()][object]$Value
  )
  if ($null -eq $Value) {
    $Stream.WriteByte(0)
    return
  }
  if ($Value -is [bool]) {
    $Stream.WriteByte($(if ($Value) { 2 } else { 1 }))
    return
  }
  if ($Value -is [string] -or $Value -is [char]) {
    Write-DreamSkinCanonicalString -Stream $Stream -Value "$Value"
    return
  }
  if ($Value -is [System.ValueType]) {
    $Stream.WriteByte(3)
    [double]$number = $Value
    if ($number -eq 0) { $number = 0.0 }
    [byte[]]$bytes = [System.BitConverter]::GetBytes($number)
    if ([System.BitConverter]::IsLittleEndian) { [System.Array]::Reverse($bytes) }
    $Stream.Write($bytes, 0, $bytes.Length)
    return
  }
  if ($Value -is [System.Collections.IDictionary]) {
    [string[]]$keys = @($Value.Keys | ForEach-Object { "$_" })
    [System.Array]::Sort($keys, [System.StringComparer]::Ordinal)
    $Stream.WriteByte(6)
    Write-DreamSkinCanonicalLength -Stream $Stream -Length $keys.Length
    foreach ($key in $keys) {
      Write-DreamSkinCanonicalString -Stream $Stream -Value $key
      Write-DreamSkinCanonicalJsonValue -Stream $Stream -Value $Value[$key]
    }
    return
  }
  if ($Value -is [System.Collections.IEnumerable]) {
    [object[]]$items = @($Value)
    $Stream.WriteByte(5)
    Write-DreamSkinCanonicalLength -Stream $Stream -Length $items.Length
    foreach ($item in $items) {
      Write-DreamSkinCanonicalJsonValue -Stream $Stream -Value $item
    }
    return
  }
  [string[]]$propertyNames = @($Value.PSObject.Properties | ForEach-Object Name)
  [System.Array]::Sort($propertyNames, [System.StringComparer]::Ordinal)
  $Stream.WriteByte(6)
  Write-DreamSkinCanonicalLength -Stream $Stream -Length $propertyNames.Length
  foreach ($propertyName in $propertyNames) {
    Write-DreamSkinCanonicalString -Stream $Stream -Value $propertyName
    Write-DreamSkinCanonicalJsonValue -Stream $Stream `
      -Value $Value.PSObject.Properties[$propertyName].Value
  }
}

function Get-DreamSkinCanonicalJsonFingerprint {
  param([Parameter(Mandatory = $true)][AllowNull()][object]$Value)
  $stream = [System.IO.MemoryStream]::new()
  try {
    [byte[]]$prefix = [System.Text.Encoding]::UTF8.GetBytes("dreamskin-canonical-json/1`0")
    $stream.Write($prefix, 0, $prefix.Length)
    Write-DreamSkinCanonicalJsonValue -Stream $stream -Value $Value
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
      return ([System.BitConverter]::ToString(
        $hasher.ComputeHash($stream.ToArray())
      )).Replace('-', '').ToLowerInvariant()
    } finally {
      $hasher.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Get-DreamSkinSourceThemeIdentity {
  param([Parameter(Mandatory = $true)]$LoadedTheme)
  try {
    $sourceTheme = (Read-DreamSkinUtf8File -Path $LoadedTheme.ThemePath) |
      ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Theme metadata is invalid JSON: $($LoadedTheme.ThemePath)"
  }
  if ($null -eq $sourceTheme -or $sourceTheme -is [string] -or $sourceTheme -is [array]) {
    throw 'Theme metadata must be a JSON object.'
  }
  $idProperty = $sourceTheme.PSObject.Properties['id']
  $requestedId = if ($null -ne $idProperty -and $idProperty.Value -is [string]) {
    "$($idProperty.Value)".Trim()
  } else {
    ''
  }
  $sourceTheme.PSObject.Properties.Remove('id')
  $themeHash = Get-DreamSkinCanonicalJsonFingerprint -Value $sourceTheme
  $imageHash = (Get-FileHash -LiteralPath $LoadedTheme.ImagePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $cssPath = Join-Path $LoadedTheme.Directory 'theme.css'
  $cssIdentity = 'absent'
  if (Test-Path -LiteralPath $cssPath -PathType Leaf) {
    Assert-DreamSkinNoReparseComponents -Path $cssPath
    $cssIdentity = (Get-FileHash -LiteralPath $cssPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $licensePath = Join-Path $LoadedTheme.Directory 'LICENSE.txt'
  $licenseIdentity = 'absent'
  if (Test-Path -LiteralPath $licensePath -PathType Leaf) {
    Assert-DreamSkinNoReparseComponents -Path $licensePath
    $licenseIdentity = (Get-FileHash -LiteralPath $licensePath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $identity = "dreamskin-source-theme-fallback/1`0theme.json`0$themeHash" +
    "`0image`0$imageHash`0theme.css`0$cssIdentity`0LICENSE.txt`0$licenseIdentity"
  $identityBytes = [System.Text.Encoding]::UTF8.GetBytes($identity)
  $identityHasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $semanticFingerprint = ([System.BitConverter]::ToString(
      $identityHasher.ComputeHash($identityBytes)
    )).Replace('-', '').ToLowerInvariant()
  } finally {
    $identityHasher.Dispose()
  }
  return [pscustomobject]@{
    RequestedId = $requestedId
    SourceIdIsString = $null -ne $idProperty -and $idProperty.Value -is [string]
    SemanticFingerprint = $semanticFingerprint
  }
}

function Get-DreamSkinThemeRuntimeContentFingerprint {
  param([Parameter(Mandatory = $true)][string]$ThemeDirectory)
  $loaded = Read-DreamSkinTheme -ThemeDirectory $ThemeDirectory -SkipImageMetadata
  $runtimeTheme = $loaded.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $runtimeTheme.image = '<runtime-image>'
  $runtimeTheme = Normalize-DreamSkinThemeContract -Theme $runtimeTheme
  $canonicalTheme = ConvertTo-DreamSkinCanonicalJsonValue -Value $runtimeTheme
  $themeBytes = [System.Text.Encoding]::UTF8.GetBytes(
    ($canonicalTheme | ConvertTo-Json -Depth 8 -Compress)
  )
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $themeHash = ([System.BitConverter]::ToString($hasher.ComputeHash($themeBytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $hasher.Dispose()
  }
  $imageHash = (Get-FileHash -LiteralPath $loaded.ImagePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $cssPath = Join-Path $loaded.Directory 'theme.css'
  $cssIdentity = 'absent'
  if (Test-Path -LiteralPath $cssPath -PathType Leaf) {
    Assert-DreamSkinNoReparseComponents -Path $cssPath
    if ((Get-Item -LiteralPath $cssPath -Force).Length -gt 256KB) {
      throw 'Theme CSS exceeds the 256 KB limit.'
    }
    $cssIdentity = (Get-FileHash -LiteralPath $cssPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $identity = "dreamskin-runtime-theme/1`0theme.json`0$themeHash`0image`0$imageHash`0theme.css`0$cssIdentity"
  $identityBytes = [System.Text.Encoding]::UTF8.GetBytes($identity)
  $identityHasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString(
      $identityHasher.ComputeHash($identityBytes)
    )).Replace('-', '').ToLowerInvariant()
  } finally {
    $identityHasher.Dispose()
  }
}

function Test-DreamSkinNestedArchiveName {
  param([Parameter(Mandatory = $true)][string]$Name)
  return $Name -match '(?i)\.(?:zip|dreamskin|7z|rar|tar|tgz|gz|bz2|xz)$'
}

function Test-DreamSkinWindowsReservedPathStem {
  param([Parameter(Mandatory = $true)][string]$Name)
  $stem = ($Name -split '\.', 2)[0]
  return $stem -match '^(?i:CON|PRN|AUX|NUL|COM[1-9\u00B9\u00B2\u00B3]|LPT[1-9\u00B9\u00B2\u00B3])$'
}

function Get-DreamSkinStableWindowsThemeId {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$RequestedId,
    [Parameter(Mandatory = $true)][string]$SemanticFingerprint
  )
  if ($RequestedId -cmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' -and
    -not $RequestedId.EndsWith('.') -and
    -not (Test-DreamSkinWindowsReservedPathStem -Name $RequestedId)) {
    return $RequestedId
  }
  if (-not $RequestedId) { return 'import-' + $SemanticFingerprint.Substring(0, 24) }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes("dreamskin-source-theme-id/1`0$RequestedId")
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = ([System.BitConverter]::ToString($hasher.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    return 'import-' + $hash.Substring(0, 24)
  } finally {
    $hasher.Dispose()
  }
}

function Assert-DreamSkinZipPathComponent {
  param([Parameter(Mandatory = $true)][string]$Component)
  if (-not $Component -or $Component -in @('.', '..') -or
    $Component -match '[\u0000-\u001f<>:"|?*]' -or
    $Component.EndsWith(' ') -or $Component.EndsWith('.')) {
    throw "Theme ZIP contains an unsafe Windows path component: $Component"
  }
  if (Test-DreamSkinWindowsReservedPathStem -Name $Component) {
    throw "Theme ZIP contains a reserved Windows path component: $Component"
  }
}

function Expand-DreamSkinThemeZipSecurely {
  param(
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [Parameter(Mandatory = $true)][string]$DestinationRoot,
    [int64]$ExpectedArchiveBytes = -1,
    [AllowNull()][string]$ExpectedArchiveSha256
  )
  $hasExpectedBytes = $ExpectedArchiveBytes -ge 0
  $hasExpectedSha = -not [string]::IsNullOrEmpty($ExpectedArchiveSha256)
  if ($hasExpectedBytes -ne $hasExpectedSha) {
    throw 'Expected theme ZIP bytes and SHA-256 must be supplied together.'
  }
  if ($hasExpectedBytes -and ($ExpectedArchiveBytes -lt 1 -or
    $ExpectedArchiveBytes -gt $script:DreamSkinMaxThemeArchiveBytes -or
    $ExpectedArchiveSha256 -cnotmatch '\A[a-f0-9]{64}\z')) {
    throw 'Expected theme ZIP identity is invalid.'
  }
  $archiveFullPath = [System.IO.Path]::GetFullPath($ArchivePath)
  if (-not [System.IO.Path]::GetExtension($archiveFullPath).Equals('.zip', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Only ordinary .zip theme packages are supported; .dreamskin files are not accepted.'
  }
  if (-not (Test-Path -LiteralPath $archiveFullPath -PathType Leaf)) {
    throw "Theme ZIP does not exist: $archiveFullPath"
  }
  $archiveLength = (Get-Item -LiteralPath $archiveFullPath -Force).Length
  if ($archiveLength -lt 1) { throw 'Theme ZIP cannot be empty.' }
  if ($archiveLength -gt $script:DreamSkinMaxThemeArchiveBytes) {
    throw 'Theme ZIP exceeds the 32 MB archive limit.'
  }

  $destinationFullPath = [System.IO.Path]::GetFullPath($DestinationRoot)
  Assert-DreamSkinNoReparseComponents -Path $destinationFullPath
  if (-not (Test-Path -LiteralPath $destinationFullPath -PathType Container)) {
    throw "Theme ZIP extraction directory does not exist: $destinationFullPath"
  }
  if (@(Get-ChildItem -LiteralPath $destinationFullPath -Force -ErrorAction Stop).Count -ne 0) {
    throw 'Theme ZIP extraction directory must be empty.'
  }

  Add-Type -AssemblyName System.IO.Compression -ErrorAction Stop
  Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
  $archiveStream = $null
  $archive = $null
  $expandedBytes = [int64]0
  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  try {
    $archiveStream = [System.IO.File]::Open(
      $archiveFullPath,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::None
    )
    $openedArchiveLength = [int64]$archiveStream.Length
    if ($openedArchiveLength -lt 1) { throw 'Theme ZIP cannot be empty.' }
    if ($openedArchiveLength -gt $script:DreamSkinMaxThemeArchiveBytes) {
      throw 'Theme ZIP exceeds the 32 MB archive limit.'
    }
    if ($hasExpectedBytes) {
      if ($openedArchiveLength -ne $ExpectedArchiveBytes) {
        throw 'Theme ZIP byte count does not match the approved package identity.'
      }
      $archiveHasher = [System.Security.Cryptography.SHA256]::Create()
      try {
        $openedArchiveSha256 = ([System.BitConverter]::ToString(
          $archiveHasher.ComputeHash($archiveStream)
        )).Replace('-', '').ToLowerInvariant()
      } finally {
        $archiveHasher.Dispose()
      }
      if ($openedArchiveSha256 -cne $ExpectedArchiveSha256) {
        throw 'Theme ZIP SHA-256 does not match the approved package identity.'
      }
      $archiveStream.Position = 0
    }
    $archive = [System.IO.Compression.ZipArchive]::new(
      $archiveStream,
      [System.IO.Compression.ZipArchiveMode]::Read,
      $false
    )
    $entries = @($archive.Entries)
    if ($entries.Count -lt 1) { throw 'Theme ZIP contains no entries.' }
    if ($entries.Count -gt $script:DreamSkinMaxThemeArchiveEntries) {
      throw 'Theme ZIP exceeds the 32-entry limit.'
    }

    foreach ($entry in $entries) {
      $rawName = "$($entry.FullName)"
      if (-not $rawName -or $rawName -match '[\u0000-\u001f]') {
        throw 'Theme ZIP contains an empty or control-character entry name.'
      }
      $normalized = $rawName.Replace('\', '/').Normalize([System.Text.NormalizationForm]::FormC)
      if ($normalized.StartsWith('/') -or $normalized -match '^[A-Za-z]:') {
        throw "Theme ZIP contains an absolute path: $rawName"
      }
      $isDirectory = $normalized.EndsWith('/')
      $trimmed = $normalized.TrimEnd('/')
      $components = @($trimmed -split '/')
      if ($components.Count -lt 1) { throw "Theme ZIP contains an invalid path: $rawName" }
      foreach ($component in $components) { Assert-DreamSkinZipPathComponent -Component $component }
      $entryKey = $trimmed
      if (-not $seen.Add($entryKey)) { throw "Theme ZIP contains a duplicate path: $rawName" }

      $metadataEntry = $components -contains '__MACOSX' -or
        $components[$components.Count - 1].Equals('.DS_Store', [System.StringComparison]::OrdinalIgnoreCase)
      $external = [System.BitConverter]::ToUInt32(
        [System.BitConverter]::GetBytes([int]$entry.ExternalAttributes), 0
      )
      $unixType = (($external -shr 16) -band 0xF000)
      if ($unixType -eq 0xA000) { throw "Theme ZIP contains a symbolic link: $rawName" }
      if (($external -band [uint32][System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Theme ZIP contains a Windows reparse entry: $rawName"
      }
      if ($unixType -notin @(0, 0x4000, 0x8000)) {
        throw "Theme ZIP contains an unsupported filesystem entry: $rawName"
      }
      if (($isDirectory -and $unixType -eq 0x8000) -or
        (-not $isDirectory -and $unixType -eq 0x4000)) {
        throw "Theme ZIP entry type does not match its path: $rawName"
      }

      $entryLength = [int64]$entry.Length
      if ($entryLength -lt 0) { throw "Theme ZIP contains an invalid entry size: $rawName" }
      $expandedBytes += $entryLength
      if ($expandedBytes -gt $script:DreamSkinMaxThemeArchiveExpandedBytes) {
        throw 'Theme ZIP exceeds the 64 MB expanded-size limit.'
      }
      if ($metadataEntry) { continue }
      if (-not $isDirectory -and (Test-DreamSkinNestedArchiveName -Name $components[$components.Count - 1])) {
        throw 'Nested compressed archives are not allowed inside a theme ZIP.'
      }

      $relativeWindowsPath = $trimmed.Replace('/', '\')
      $destination = [System.IO.Path]::GetFullPath((Join-Path $destinationFullPath $relativeWindowsPath))
      $rootPrefix = $destinationFullPath.TrimEnd('\') + '\'
      if (-not $destination.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Theme ZIP entry escaped its extraction directory: $rawName"
      }
      if ($isDirectory) {
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        Assert-DreamSkinNoReparseComponents -Path $destination
        continue
      }

      $parent = [System.IO.Path]::GetDirectoryName($destination)
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
      Assert-DreamSkinNoReparseComponents -Path $parent
      $input = $null
      $output = $null
      try {
        $input = $entry.Open()
        $output = [System.IO.File]::Open(
          $destination,
          [System.IO.FileMode]::CreateNew,
          [System.IO.FileAccess]::Write,
          [System.IO.FileShare]::None
        )
        $buffer = New-Object byte[] 65536
        $written = [int64]0
        while (($read = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
          $written += $read
          if ($written -gt $entryLength -or $written -gt $script:DreamSkinMaxThemeArchiveExpandedBytes) {
            throw "Theme ZIP entry expanded beyond its declared safe size: $rawName"
          }
          $output.Write($buffer, 0, $read)
        }
        if ($written -ne $entryLength) { throw "Theme ZIP entry size changed while extracting: $rawName" }
      } finally {
        if ($null -ne $output) { $output.Dispose() }
        if ($null -ne $input) { $input.Dispose() }
      }
      Assert-DreamSkinNoReparseComponents -Path $destination
    }
  } catch {
    throw "Theme ZIP extraction failed: $($_.Exception.Message)"
  } finally {
    if ($null -ne $archive) { $archive.Dispose() }
    if ($null -ne $archiveStream) { $archiveStream.Dispose() }
  }

  $topItems = @(Get-ChildItem -LiteralPath $destinationFullPath -Force -ErrorAction Stop)
  $rootThemePath = Join-Path $destinationFullPath 'theme.json'
  if (Test-Path -LiteralPath $rootThemePath -PathType Leaf) {
    $sourceRoot = $destinationFullPath
  } elseif ($topItems.Count -eq 1 -and $topItems[0].PSIsContainer -and
    (Test-Path -LiteralPath (Join-Path $topItems[0].FullName 'theme.json') -PathType Leaf)) {
    $sourceRoot = $topItems[0].FullName
  } else {
    throw 'Place theme.json and its image at ZIP root or inside one top-level theme folder.'
  }
  Assert-DreamSkinNoReparseComponents -Path $sourceRoot
  $sourceItems = @(Get-ChildItem -LiteralPath $sourceRoot -Force -ErrorAction Stop)
  if (@($sourceItems | Where-Object { $_.PSIsContainer }).Count -ne 0) {
    throw 'Theme ZIP content must be a flat set of files.'
  }
  $sourceFiles = @($sourceItems | Where-Object { -not $_.PSIsContainer })
  $hasManifest = @($sourceFiles | Where-Object { $_.Name -ceq 'manifest.json' }).Count -eq 1
  if ($hasManifest) {
    $officialNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($name in @(
      'manifest.json', 'manifest.sig', 'theme.json', 'theme.css', 'LICENSE.txt',
      'background.webp', 'background.jpg', 'background.png'
    )) { $null = $officialNames.Add($name) }
    foreach ($sourceFile in $sourceFiles) {
      if (-not $officialNames.Contains($sourceFile.Name)) {
        throw "Official theme ZIP contains an unregistered file: $($sourceFile.Name)"
      }
    }
    $backgroundCount = @($sourceFiles | Where-Object {
      $_.Name -cin @('background.webp', 'background.jpg', 'background.png')
    }).Count
    if ($backgroundCount -ne 1) {
      throw 'Official theme ZIP must contain exactly one registered background file.'
    }
    if (@($sourceFiles | Where-Object { $_.Name -ceq 'theme.css' }).Count -ne 1) {
      throw 'New official theme ZIP imports require theme.css and the safe-css capability.'
    }
  } elseif ($sourceFiles.Count -ne 3 -or
    @($sourceFiles | Where-Object { $_.Name -ceq 'theme.css' }).Count -ne 1) {
    throw 'A local simplified theme ZIP must contain exactly theme.json, theme.css, and one referenced image.'
  }
  return $sourceRoot
}

function Get-DreamSkinLegacySuffixNumber {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$BaseId
  )
  if (-not $BaseId -or $Value -ceq $BaseId) {
    return $null
  }
  $match = [System.Text.RegularExpressions.Regex]::Match($Value, '-([2-9][0-9]*)$')
  if (-not $match.Success) { return $null }
  $suffix = $match.Groups[1].Value
  $marker = "-$suffix"
  $prefixLength = [Math]::Max(0, 80 - $marker.Length)
  $expectedPrefix = $BaseId.Substring(0, [Math]::Min($BaseId.Length, $prefixLength))
  if ($Value.Substring(0, $Value.Length - $marker.Length) -cne $expectedPrefix) { return $null }
  if ($suffix -cnotmatch '^[2-9][0-9]*$') { return $null }
  $number = 0L
  $parsed = [int64]::TryParse(
    $suffix,
    [System.Globalization.NumberStyles]::None,
    [System.Globalization.CultureInfo]::InvariantCulture,
    [ref]$number
  )
  if (-not $parsed) { return $null }
  return $number
}

function Test-DreamSkinLegacySuffixRecord {
  param(
    [Parameter(Mandatory = $true)]$Record,
    [Parameter(Mandatory = $true)][string]$BaseId
  )
  $suffix = Get-DreamSkinLegacySuffixNumber -Value $Record.EntryName -BaseId $BaseId
  return $null -ne $suffix -and $Record.ThemeId -ceq $Record.EntryName
}

function New-DreamSkinThemeImportMutex {
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  return [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.ThemeImport")
}

function Assert-DreamSkinThemeReplacementLeafName {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if (-not $Value -or [System.IO.Path]::GetFileName($Value) -cne $Value -or
    $Value -in @('.', '..') -or $Value -match '[\\/\u0000-\u001f<>:"|?*]') {
    throw "Theme replacement journal contains an unsafe $Label."
  }
}

function Write-DreamSkinUtf8FileDurably {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $directory = [System.IO.Path]::GetDirectoryName($fullPath)
  if (-not [System.IO.Directory]::Exists($directory)) {
    throw 'Durable journal parent directory does not exist.'
  }
  $fileName = [System.IO.Path]::GetFileName($fullPath)
  $operationId = "$PID.$([guid]::NewGuid().ToString('N'))"
  $temporary = Join-Path $directory ".$fileName.$operationId.tmp"
  $replacementBackup = Join-Path $directory ".$fileName.$operationId.replace-backup"
  $encoding = [System.Text.UTF8Encoding]::new($false, $true)
  $bytes = $encoding.GetBytes($Content)
  try {
    $stream = [System.IO.FileStream]::new(
      $temporary,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None,
      4096,
      [System.IO.FileOptions]::WriteThrough
    )
    try {
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Flush($true)
    } finally {
      $stream.Dispose()
    }
    if ([System.IO.File]::Exists($fullPath)) {
      [System.IO.File]::Replace($temporary, $fullPath, $replacementBackup, $true)
    } else {
      [System.IO.File]::Move($temporary, $fullPath)
    }
    # Flush the installed file as well as the staging file. This keeps the
    # journal contents durable across a process fail-fast or system restart.
    $installed = [System.IO.FileStream]::new(
      $fullPath,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::Read,
      4096,
      [System.IO.FileOptions]::WriteThrough
    )
    try { $installed.Flush($true) } finally { $installed.Dispose() }
  } finally {
    foreach ($artifact in @($temporary, $replacementBackup)) {
      try {
        if ([System.IO.File]::Exists($artifact)) { [System.IO.File]::Delete($artifact) }
      } catch {
        try { Write-Warning "Could not remove durable journal artifact '$artifact': $($_.Exception.Message)" } catch {}
      }
    }
  }
}

function Write-DreamSkinThemeReplacementJournal {
  param(
    [Parameter(Mandatory = $true)]$Paths,
    [Parameter(Mandatory = $true)][string]$JournalPath,
    [Parameter(Mandatory = $true)]$Journal
  )
  $fullSaved = [System.IO.Path]::GetFullPath($Paths.Saved).TrimEnd('\')
  $fullJournal = [System.IO.Path]::GetFullPath($JournalPath)
  if (-not [System.IO.Path]::GetDirectoryName($fullJournal).Equals(
      $fullSaved, [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw 'Theme replacement journal escaped the saved-theme directory.'
  }
  Assert-DreamSkinNoReparseComponents -Path $fullJournal
  $json = $Journal | ConvertTo-Json -Depth 4 -Compress
  Write-DreamSkinUtf8FileDurably -Path $fullJournal -Content ($json + "`r`n")
  Assert-DreamSkinNoReparseComponents -Path $fullJournal
}

function Read-DreamSkinThemeReplacementJournal {
  param(
    [Parameter(Mandatory = $true)]$Paths,
    [Parameter(Mandatory = $true)][string]$JournalPath
  )
  $fullSaved = [System.IO.Path]::GetFullPath($Paths.Saved).TrimEnd('\')
  $fullJournal = [System.IO.Path]::GetFullPath($JournalPath)
  if (-not [System.IO.Path]::GetDirectoryName($fullJournal).Equals(
      $fullSaved, [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw 'Theme replacement journal escaped the saved-theme directory.'
  }
  $journalName = [System.IO.Path]::GetFileName($fullJournal)
  if ($journalName -cnotmatch '^(\.theme-replace-[a-f0-9]{32})\.json$') {
    throw 'Theme replacement journal has an invalid file name.'
  }
  $expectedBackupName = $Matches[1]
  Assert-DreamSkinNoReparseComponents -Path $fullJournal
  if (-not (Test-Path -LiteralPath $fullJournal -PathType Leaf -ErrorAction Stop)) {
    throw 'Theme replacement journal is not a regular file.'
  }
  if ((Get-Item -LiteralPath $fullJournal -Force -ErrorAction Stop).Length -gt 16KB) {
    throw 'Theme replacement journal exceeds the 16 KiB limit.'
  }
  try {
    $journal = (Read-DreamSkinUtf8File -Path $fullJournal) |
      ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw 'Theme replacement journal is not valid UTF-8 JSON.'
  }
  if ($null -eq $journal -or $journal -is [string] -or $journal -is [array] -or
    $journal -is [System.ValueType]) {
    throw 'Theme replacement journal must be an object.'
  }
  [string[]]$expectedProperties = @(
    'schema', 'destinationName', 'backupName', 'stageName',
    'oldFingerprint', 'newFingerprint', 'phase'
  )
  $actualProperties = @($journal.PSObject.Properties)
  if ($actualProperties.Count -ne $expectedProperties.Count) {
    throw 'Theme replacement journal has an unsupported schema.'
  }
  foreach ($property in $expectedProperties) {
    if (@($actualProperties | Where-Object { $_.Name -ceq $property }).Count -ne 1) {
      throw 'Theme replacement journal has an unsupported schema.'
    }
  }
  if ($journal.schema -isnot [string] -or
    $journal.schema -cne 'dreamskin-theme-replacement/1') {
    throw 'Theme replacement journal uses an unsupported schema.'
  }
  if ($journal.destinationName -isnot [string] -or
    $journal.backupName -isnot [string] -or
    $journal.stageName -isnot [string] -or
    $journal.oldFingerprint -isnot [string] -or
    $journal.newFingerprint -isnot [string] -or
    $journal.phase -isnot [string]) {
    throw 'Theme replacement journal contains a field with the wrong type.'
  }
  $destinationName = $journal.destinationName
  $backupName = $journal.backupName
  $stageName = $journal.stageName
  Assert-DreamSkinThemeReplacementLeafName -Value $destinationName -Label 'destination name'
  Assert-DreamSkinThemeReplacementLeafName -Value $backupName -Label 'backup name'
  Assert-DreamSkinThemeReplacementLeafName -Value $stageName -Label 'stage name'
  if ($destinationName -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' -or
    $destinationName.EndsWith('.') -or
    (Test-DreamSkinWindowsReservedPathStem -Name $destinationName)) {
    throw 'Theme replacement journal contains an invalid destination name.'
  }
  if ($backupName -cne $expectedBackupName -or
    $backupName -cnotmatch '^\.theme-replace-[a-f0-9]{32}$') {
    throw 'Theme replacement journal does not match its backup name.'
  }
  if ($stageName -cnotmatch '^\.theme-import-[a-f0-9]{32}$') {
    throw 'Theme replacement journal contains an invalid stage name.'
  }
  $oldFingerprint = $journal.oldFingerprint
  $newFingerprint = $journal.newFingerprint
  if ($oldFingerprint -cnotmatch '^[a-f0-9]{64}$' -or
    $newFingerprint -cnotmatch '^[a-f0-9]{64}$') {
    throw 'Theme replacement journal contains an invalid semantic fingerprint.'
  }
  $phase = $journal.phase
  if ($phase -notin @('prepared', 'old-moved', 'new-published', 'committed')) {
    throw 'Theme replacement journal contains an invalid phase.'
  }
  $destination = Join-Path $fullSaved $destinationName
  $backup = Join-Path $fullSaved $backupName
  $stage = Join-Path $fullSaved $stageName
  $commitMarker = Join-Path $fullSaved ($backupName + '.committed')
  $commitTemporary = Join-Path $fullSaved ($backupName + '.commit.tmp')
  foreach ($path in @($destination, $backup, $stage, $commitMarker, $commitTemporary)) {
    Assert-DreamSkinNoReparseComponents -Path $path
  }
  return [pscustomobject]@{
    Path = $fullJournal
    Destination = $destination
    Backup = $backup
    Stage = $stage
    DestinationName = $destinationName
    BackupName = $backupName
    StageName = $stageName
    OldFingerprint = $oldFingerprint
    NewFingerprint = $newFingerprint
    Phase = $phase
    CommitMarker = $commitMarker
    CommitTemporary = $commitTemporary
  }
}

function Get-DreamSkinThemeReplacementPathFingerprint {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if (-not (Test-Path -LiteralPath $Path -ErrorAction Stop)) { return $null }
  Assert-DreamSkinNoReparseComponents -Path $Path
  if (-not (Test-Path -LiteralPath $Path -PathType Container -ErrorAction Stop)) {
    throw "Theme replacement recovery is ambiguous: $Label is not a directory."
  }
  try {
    return (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $Path)
  } catch {
    throw "Theme replacement recovery is ambiguous: $Label cannot be verified."
  }
}

function Assert-DreamSkinThemeReplacementCommitMarker {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )
  Assert-DreamSkinNoReparseComponents -Path $Path
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf -ErrorAction Stop) -or
    (Get-Item -LiteralPath $Path -Force -ErrorAction Stop).Length -gt 128 -or
    (Read-DreamSkinUtf8File -Path $Path) -cne
      ($script:DreamSkinThemeReplacementCommitText + "`n")) {
    throw "$Label is invalid."
  }
}

function Write-DreamSkinThemeReplacementCommitMarker {
  param([Parameter(Mandatory = $true)]$Transaction)
  if (Test-Path -LiteralPath $Transaction.CommitMarker -ErrorAction Stop) {
    throw 'Theme replacement commit marker already exists.'
  }
  if (Test-Path -LiteralPath $Transaction.CommitTemporary -ErrorAction Stop) {
    throw 'Theme replacement temporary commit marker already exists.'
  }
  Write-DreamSkinUtf8FileDurably -Path $Transaction.CommitTemporary `
    -Content ($script:DreamSkinThemeReplacementCommitText + "`n")
  Assert-DreamSkinThemeReplacementCommitMarker -Path $Transaction.CommitTemporary `
    -Label 'Temporary theme replacement commit marker'
  [System.IO.File]::Move($Transaction.CommitTemporary, $Transaction.CommitMarker)
  $markerStream = [System.IO.FileStream]::new(
    $Transaction.CommitMarker,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::Read,
    4096,
    [System.IO.FileOptions]::WriteThrough
  )
  try { $markerStream.Flush($true) } finally { $markerStream.Dispose() }
  Assert-DreamSkinThemeReplacementCommitMarker -Path $Transaction.CommitMarker `
    -Label 'Theme replacement commit marker'
}

function Remove-DreamSkinThemeReplacementCommitArtifactsVerified {
  param([Parameter(Mandatory = $true)]$Transaction)
  foreach ($record in @(
      @{ Path = $Transaction.CommitTemporary; Label = 'Temporary theme replacement commit marker' },
      @{ Path = $Transaction.CommitMarker; Label = 'Theme replacement commit marker' }
    )) {
    if (-not (Test-Path -LiteralPath $record.Path -ErrorAction Stop)) { continue }
    Assert-DreamSkinThemeReplacementCommitMarker -Path $record.Path -Label $record.Label
    [System.IO.File]::Delete([System.IO.Path]::GetFullPath($record.Path))
    if (Test-Path -LiteralPath $record.Path -ErrorAction Stop) {
      throw "$($record.Label) cleanup was not verified."
    }
  }
}

function Remove-DreamSkinThemeReplacementJournalVerified {
  param([Parameter(Mandatory = $true)][string]$Path)
  Assert-DreamSkinNoReparseComponents -Path $Path
  [System.IO.File]::Delete([System.IO.Path]::GetFullPath($Path))
  if (Test-Path -LiteralPath $Path -ErrorAction Stop) {
    throw 'Theme replacement journal cleanup was not verified.'
  }
}

function Repair-DreamSkinThemeReplacementTransactions {
  param([Parameter(Mandatory = $true)]$Paths)
  $journals = @(Get-ChildItem -LiteralPath $Paths.Saved -File -Force -ErrorAction Stop |
    Where-Object { $_.Name -cmatch '^\.theme-replace-[a-f0-9]{32}\.json$' } |
    Sort-Object Name)
  $transactions = [System.Collections.Generic.List[object]]::new()
  $destinations = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  foreach ($journalFile in $journals) {
    $transaction = Read-DreamSkinThemeReplacementJournal `
      -Paths $Paths -JournalPath $journalFile.FullName
    if (-not $destinations.Add($transaction.DestinationName)) {
      throw "Multiple theme replacement transactions target $($transaction.DestinationName)."
    }
    $transactions.Add($transaction)
  }

  foreach ($transaction in $transactions) {
    $backupFingerprint = Get-DreamSkinThemeReplacementPathFingerprint `
      -Path $transaction.Backup -Label 'the canonical backup'
    if ($null -ne $backupFingerprint -and
      $backupFingerprint -cne $transaction.OldFingerprint) {
      throw 'Theme replacement recovery is ambiguous: the backup fingerprint changed.'
    }

    $destinationFingerprint = $null
    $destinationFingerprintError = $null
    try {
      $destinationFingerprint = Get-DreamSkinThemeReplacementPathFingerprint `
        -Path $transaction.Destination -Label 'the canonical destination'
    } catch {
      # A corrupt, uncommitted candidate must not strand the verified old theme
      # in its hidden backup. Reparse points and non-directories remain fail-closed.
      Assert-DreamSkinNoReparseComponents -Path $transaction.Destination
      if (-not (Test-Path -LiteralPath $transaction.Destination `
          -PathType Container -ErrorAction Stop)) {
        throw
      }
      $destinationFingerprintError = $_.Exception
    }

    $commitMarkerExists = Test-Path -LiteralPath $transaction.CommitMarker -ErrorAction Stop
    $commitTemporaryExists = Test-Path -LiteralPath $transaction.CommitTemporary -ErrorAction Stop
    if ($commitMarkerExists) {
      if ($transaction.Phase -cne 'committed') {
        throw 'Theme replacement recovery is ambiguous: commit marker and journal phase disagree.'
      }
      if ($commitTemporaryExists) {
        throw 'Theme replacement recovery is ambiguous: committed transaction retained a temporary marker.'
      }
      Assert-DreamSkinThemeReplacementCommitMarker -Path $transaction.CommitMarker `
        -Label 'Theme replacement commit marker'
      if ($destinationFingerprintError) { throw $destinationFingerprintError }
      if ($null -eq $destinationFingerprint) {
        throw 'Theme replacement recovery is ambiguous: committed destination is missing.'
      }
      if ($destinationFingerprint -cne $transaction.NewFingerprint) {
        throw 'Theme replacement recovery is ambiguous: committed destination fingerprint changed.'
      }
      $stageFingerprint = Get-DreamSkinThemeReplacementPathFingerprint `
        -Path $transaction.Stage -Label 'the staged replacement'
      if ($null -ne $stageFingerprint) {
        throw 'Theme replacement recovery is ambiguous: committed transaction retained a staged replacement.'
      }
      if ($null -ne $backupFingerprint) {
        Remove-DreamSkinManagedDirectoryVerified -Path $transaction.Backup -Root $Paths.Root
      }
      Remove-DreamSkinThemeReplacementJournalVerified -Path $transaction.Path
      Remove-DreamSkinThemeReplacementCommitArtifactsVerified -Transaction $transaction
      continue
    }
    if ($commitTemporaryExists) {
      Assert-DreamSkinThemeReplacementCommitMarker -Path $transaction.CommitTemporary `
        -Label 'Temporary theme replacement commit marker'
    }

    if ($destinationFingerprintError) {
      if ($backupFingerprint -cne $transaction.OldFingerprint) {
        throw $destinationFingerprintError
      }
      if (Test-Path -LiteralPath $transaction.Stage -ErrorAction Stop) {
        throw 'Theme replacement recovery is ambiguous: both candidate evidence paths exist.'
      }
      [System.IO.Directory]::Move($transaction.Destination, $transaction.Stage)
      [System.IO.Directory]::Move($transaction.Backup, $transaction.Destination)
      Assert-DreamSkinRestoredThemeFingerprint -Path $transaction.Destination `
        -ExpectedFingerprint $transaction.OldFingerprint -Label 'Canonical saved theme'
      throw 'Theme replacement recovery is ambiguous: the published replacement cannot be verified.'
    }

    if ($null -eq $destinationFingerprint) {
      if ($backupFingerprint -cne $transaction.OldFingerprint) {
        throw 'Theme replacement recovery is ambiguous: the destination and verified backup are missing.'
      }
      [System.IO.Directory]::Move($transaction.Backup, $transaction.Destination)
      Assert-DreamSkinRestoredThemeFingerprint -Path $transaction.Destination `
        -ExpectedFingerprint $transaction.OldFingerprint -Label 'Canonical saved theme'
      # The old canonical is restored before touching the candidate. A corrupt
      # candidate must never keep the user's verified theme missing.
      $stageFingerprint = Get-DreamSkinThemeReplacementPathFingerprint `
        -Path $transaction.Stage -Label 'the staged replacement'
      if ($null -eq $stageFingerprint) {
        throw 'Theme replacement recovery is ambiguous: the staged replacement is missing.'
      }
      if ($stageFingerprint -cne $transaction.NewFingerprint) {
        throw 'Theme replacement recovery is ambiguous: the staged replacement fingerprint changed.'
      }
      Remove-DreamSkinManagedDirectoryVerified -Path $transaction.Stage -Root $Paths.Root
      Remove-DreamSkinThemeReplacementCommitArtifactsVerified -Transaction $transaction
      Remove-DreamSkinThemeReplacementJournalVerified -Path $transaction.Path
      continue
    }

    if ($null -ne $backupFingerprint) {
      if ($destinationFingerprint -cne $transaction.NewFingerprint) {
        throw 'Theme replacement recovery is ambiguous: canonical content does not match the journal.'
      }
      if (Test-Path -LiteralPath $transaction.Stage -ErrorAction Stop) {
        Remove-DreamSkinManagedDirectoryVerified -Path $transaction.Destination -Root $Paths.Root
      } else {
        [System.IO.Directory]::Move($transaction.Destination, $transaction.Stage)
      }
      [System.IO.Directory]::Move($transaction.Backup, $transaction.Destination)
      Assert-DreamSkinRestoredThemeFingerprint -Path $transaction.Destination `
        -ExpectedFingerprint $transaction.OldFingerprint -Label 'Canonical saved theme'
      $stageFingerprint = Get-DreamSkinThemeReplacementPathFingerprint `
        -Path $transaction.Stage -Label 'the staged replacement'
      if ($null -eq $stageFingerprint -or
        $stageFingerprint -cne $transaction.NewFingerprint) {
        throw 'Theme replacement recovery is ambiguous: the staged replacement fingerprint changed.'
      }
      Remove-DreamSkinManagedDirectoryVerified -Path $transaction.Stage -Root $Paths.Root
      Remove-DreamSkinThemeReplacementCommitArtifactsVerified -Transaction $transaction
      Remove-DreamSkinThemeReplacementJournalVerified -Path $transaction.Path
      continue
    }

    if ($destinationFingerprint -ceq $transaction.OldFingerprint) {
      $stageFingerprint = Get-DreamSkinThemeReplacementPathFingerprint `
        -Path $transaction.Stage -Label 'the staged replacement'
      if ($null -ne $stageFingerprint) {
        if ($stageFingerprint -cne $transaction.NewFingerprint) {
          throw 'Theme replacement recovery is ambiguous: the staged replacement fingerprint changed.'
        }
        Remove-DreamSkinManagedDirectoryVerified -Path $transaction.Stage -Root $Paths.Root
      }
      Remove-DreamSkinThemeReplacementCommitArtifactsVerified -Transaction $transaction
      Remove-DreamSkinThemeReplacementJournalVerified -Path $transaction.Path
      continue
    }

    throw 'Theme replacement recovery is ambiguous: canonical content does not match the journal.'
  }
}

function Invoke-DreamSkinThemeReplacementRecovery {
  param([Parameter(Mandatory = $true)]$Paths)
  $mutex = New-DreamSkinThemeImportMutex
  $acquired = $false
  try {
    try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Another theme import is still running; replacement recovery is deferred.' }
    Repair-DreamSkinThemeReplacementTransactions -Paths $Paths
  } finally {
    if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
    $mutex.Dispose()
  }
}

function Import-DreamSkinThemeZip {
  param(
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'),
    [int64]$ExpectedArchiveBytes = -1,
    [AllowNull()][string]$ExpectedArchiveSha256
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  foreach ($directory in @($paths.Root, $paths.Saved)) {
    Ensure-DreamSkinManagedDirectory -Path $directory -Root $paths.Root
  }
  $mutex = New-DreamSkinThemeImportMutex
  $acquired = $false
  $workRoot = Join-Path $paths.Root ('.theme-import-work-' + [guid]::NewGuid().ToString('N'))
  $publishStage = $null
  try {
    try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Another theme import is still running; try again shortly.' }
    Repair-DreamSkinThemeReplacementTransactions -Paths $paths
    Ensure-DreamSkinManagedDirectory -Path $workRoot -Root $paths.Root
    $extractRoot = Join-Path $workRoot 'extracted'
    Ensure-DreamSkinManagedDirectory -Path $extractRoot -Root $paths.Root
    $sourceRoot = Expand-DreamSkinThemeZipSecurely -ArchivePath $ArchivePath `
      -DestinationRoot $extractRoot -ExpectedArchiveBytes $ExpectedArchiveBytes `
      -ExpectedArchiveSha256 $ExpectedArchiveSha256

    if (-not (Get-Command Get-DreamSkinNodeRuntime -ErrorAction SilentlyContinue)) {
      throw 'Node.js runtime validation is unavailable for theme ZIP checks.'
    }
    $node = Get-DreamSkinNodeRuntime
    $engineRoot = Split-Path -Parent $PSScriptRoot
    $packageValidator = Join-Path $engineRoot 'assets\theme-package-validator.mjs'
    $versionPath = Join-Path $engineRoot 'VERSION'
    if (-not (Test-Path -LiteralPath $packageValidator -PathType Leaf) -or
      -not (Test-Path -LiteralPath $versionPath -PathType Leaf)) {
      throw 'Theme package validator or client version is missing from the runtime engine.'
    }
    $validatedRoot = Join-Path $workRoot 'validated'
    Ensure-DreamSkinManagedDirectory -Path $validatedRoot -Root $paths.Root
    $clientVersion = (Read-DreamSkinUtf8File -Path $versionPath).Trim()
    $packageOutput = @(& $node.Path $packageValidator '--source' $sourceRoot '--stage' $validatedRoot `
      '--platform' 'windows' '--client-version' $clientVersion 2>&1)
    if ($LASTEXITCODE -ne 0) {
      $detail = ($packageOutput -join "`n").Trim()
      throw $(if ($detail) { $detail } else { 'Theme ZIP failed package validation.' })
    }
    try { $packageInfo = ($packageOutput -join "`n") | ConvertFrom-Json -ErrorAction Stop } catch {
      throw 'Theme package validator returned invalid output.'
    }
    if ($packageInfo.format -notin @('official', 'simple')) {
      throw 'Theme package validator returned an unsupported package format.'
    }
    $sourceRoot = $validatedRoot
    $packageFormat = "$($packageInfo.format)"
    $safeCssStatus = "$($packageInfo.safeCssStatus)"
    if ($safeCssStatus -cne 'validated') {
      throw 'New theme ZIP imports require locally validated Safe CSS.'
    }
    $signatureIgnored = [bool]$packageInfo.signatureIgnored

    $themePath = Join-Path $sourceRoot 'theme.json'
    if ((Get-Item -LiteralPath $themePath -Force).Length -gt 1MB) {
      throw 'Theme metadata exceeds the 1 MB limit.'
    }
    $source = Read-DreamSkinTheme -ThemeDirectory $sourceRoot
    if ($source.Theme.schemaVersion -ne 1) { throw 'Theme ZIP must use theme schemaVersion 1.' }
    $imageField = "$($source.Theme.image)"
    if ([System.IO.Path]::GetFileName($imageField) -cne $imageField) {
      throw 'Theme ZIP image must be beside theme.json.'
    }

    $sourceIdentity = Get-DreamSkinSourceThemeIdentity -LoadedTheme $source
    $requestedId = $sourceIdentity.RequestedId
    $injector = Join-Path $PSScriptRoot 'injector.mjs'
    if ($sourceIdentity.SourceIdIsString) {
      $payloadCheck = @(& $node.Path $injector '--check-payload' '--theme-dir' $sourceRoot 2>&1)
      if ($LASTEXITCODE -ne 0) {
        throw 'Theme ZIP failed theme.json or image payload validation.'
      }
    }

    $fingerprint = Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $sourceRoot
    $baseId = Get-DreamSkinStableWindowsThemeId -RequestedId $requestedId `
      -SemanticFingerprint $sourceIdentity.SemanticFingerprint
    $records = [System.Collections.Generic.List[object]]::new()
    foreach ($savedDirectory in Get-ChildItem -LiteralPath $paths.Saved -Directory -Force -ErrorAction SilentlyContinue) {
      if ($savedDirectory.Name.StartsWith('.')) { continue }
      try {
        $saved = Read-DreamSkinTheme -ThemeDirectory $savedDirectory.FullName -SkipImageMetadata
        $savedName = if ($saved.Theme.name) { "$($saved.Theme.name)" } else { $savedDirectory.Name }
        $savedFingerprint = Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $savedDirectory.FullName
        $savedHasOnlyRuntimeFiles = Test-DreamSkinThemeDirectoryHasOnlyRuntimeFiles `
          -ThemeDirectory $savedDirectory.FullName
        $savedThemeId = if ($saved.Theme.id) { "$($saved.Theme.id)".Trim() } else { '' }
        $contentFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint `
          -ThemeDirectory $savedDirectory.FullName
        $null = $records.Add([pscustomobject]@{
          EntryName = $savedDirectory.Name
          Directory = $savedDirectory.FullName
          Theme = $saved.Theme
          ThemeId = $savedThemeId
          Name = $savedName
          Fingerprint = $savedFingerprint
          HasOnlyRuntimeFiles = $savedHasOnlyRuntimeFiles
          ContentFingerprint = $contentFingerprint
        })
      } catch {}
    }

    $id = $baseId
    $existingForId = @($records | Where-Object { $_.EntryName -ceq $baseId } | Select-Object -First 1)
    $canonicalFingerprint = if ($existingForId.Count -gt 0) {
      "$($existingForId[0].Fingerprint)"
    } else {
      $null
    }
    $legacySuffixRecords = @($records | Where-Object {
      Test-DreamSkinLegacySuffixRecord -Record $_ -BaseId $baseId
    } | Sort-Object { Get-DreamSkinLegacySuffixNumber -Value $_.EntryName -BaseId $baseId })
    $exactRecords = @($records | Where-Object { $_.Fingerprint -ceq $fingerprint })
    $exactCanonical = @($exactRecords | Where-Object { $_.EntryName -ceq $baseId } | Select-Object -First 1)
    $exactLegacy = @($exactRecords | Where-Object {
      Test-DreamSkinLegacySuffixRecord -Record $_ -BaseId $baseId
    })
    $exactUnrelated = @($exactRecords | Where-Object {
      $_.EntryName -cne $baseId -and -not (Test-DreamSkinLegacySuffixRecord -Record $_ -BaseId $baseId)
    } | Select-Object -First 1)
    if (-not $existingForId -and $exactUnrelated -and $exactLegacy.Count -eq 0) {
      return [pscustomobject]@{
        Status = 'Duplicate'
        Id = $exactUnrelated.EntryName
        Name = $exactUnrelated.Name
        Renamed = $false
        NameCollision = $false
        PackageFormat = $packageFormat
        SafeCssStatus = $safeCssStatus
        SignatureIgnored = $signatureIgnored
        ContentFingerprint = $exactUnrelated.ContentFingerprint
        Path = $exactUnrelated.Directory
      }
    }
    # A suffix and a display name are not proof of lineage: a legitimate
    # theme may intentionally use an ID such as <base>-2. Only an identical
    # semantic fingerprint makes cleanup safe and reversible.
    $legacyCleanupRecords = @($legacySuffixRecords | Where-Object {
      $_.EntryName -cne $baseId -and $_.Fingerprint -ceq $fingerprint -and
        $_.HasOnlyRuntimeFiles
    })
    if ($exactCanonical -and $legacyCleanupRecords.Count -eq 0) {
      return [pscustomobject]@{
        Status = 'Duplicate'
        Id = $exactCanonical.EntryName
        Name = $exactCanonical.Name
        Renamed = $false
        NameCollision = $false
        PackageFormat = $packageFormat
        SafeCssStatus = $safeCssStatus
        SignatureIgnored = $signatureIgnored
        ContentFingerprint = $exactCanonical.ContentFingerprint
        Path = $exactCanonical.Directory
      }
    }
    $replaceExisting = $false
    $baseDestination = Join-Path $paths.Saved $id
    $basePathExists = Test-Path -LiteralPath $baseDestination -ErrorAction Stop
    if ($basePathExists) {
      if (-not (Test-Path -LiteralPath $baseDestination -PathType Container)) {
        throw 'Existing saved theme path is not a directory; refusing replacement.'
      }
      Assert-DreamSkinNoReparseComponents -Path $baseDestination
      if (-not $existingForId -or "$($existingForId.ThemeId)" -cne $baseId) {
        throw 'Existing saved theme identity could not be confirmed for replacement.'
      }
      $replaceExisting = $true
    } else {
      $suffix = 2
      while (Test-Path -LiteralPath (Join-Path $paths.Saved $id)) {
        $marker = "-$suffix"
        $id = $baseId.Substring(0, [Math]::Min($baseId.Length, 80 - $marker.Length)) + $marker
        $suffix += 1
      }
    }

    $publishStage = Join-Path $paths.Saved ('.theme-import-' + [guid]::NewGuid().ToString('N'))
    Ensure-DreamSkinManagedDirectory -Path $publishStage -Root $paths.Root
    $imageName = [System.IO.Path]::GetFileName($source.ImagePath)
    $stagedImage = Join-Path $publishStage $imageName
    Assert-DreamSkinNoReparseComponents -Path $stagedImage
    Copy-Item -LiteralPath $source.ImagePath -Destination $stagedImage -Force
    Assert-DreamSkinImageFile -Path $stagedImage
    $theme = $source.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    $theme.id = $id
    $theme.image = $imageName
    Write-DreamSkinTheme -ThemeDirectory $publishStage -Theme $theme
    foreach ($auxiliaryName in @('theme.css', 'LICENSE.txt')) {
      $auxiliarySource = Join-Path $sourceRoot $auxiliaryName
      if (Test-Path -LiteralPath $auxiliarySource -PathType Leaf) {
        Assert-DreamSkinNoReparseComponents -Path $auxiliarySource
        $auxiliaryDestination = Join-Path $publishStage $auxiliaryName
        Copy-Item -LiteralPath $auxiliarySource -Destination $auxiliaryDestination -Force
        Assert-DreamSkinNoReparseComponents -Path $auxiliaryDestination
      }
    }
    $null = Read-DreamSkinTheme -ThemeDirectory $publishStage
    # Missing/non-string source IDs cannot pass the injector until the stable
    # fallback ID has been written. This private-stage check remains mandatory
    # and completes before any existing saved theme is moved or replaced.
    $stagedPayloadCheck = @(& $node.Path $injector '--check-payload' '--theme-dir' $publishStage 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Imported theme failed final payload validation.' }

    $destination = Join-Path $paths.Saved $id
    $backup = $null
    $replacementJournalPath = $null
    $replacementJournal = $null
    $replacementTransaction = $null
    $publishedDestination = $false
    try {
      if ($replaceExisting) {
        $replacementToken = [guid]::NewGuid().ToString('N')
        $backupName = '.theme-replace-' + $replacementToken
        $backup = Join-Path $paths.Saved $backupName
        $replacementJournalPath = Join-Path $paths.Saved ($backupName + '.json')
        $replacementJournal = [pscustomobject][ordered]@{
          schema = 'dreamskin-theme-replacement/1'
          destinationName = [System.IO.Path]::GetFileName($destination)
          backupName = $backupName
          stageName = [System.IO.Path]::GetFileName($publishStage)
          oldFingerprint = $canonicalFingerprint
          newFingerprint = $fingerprint
          phase = 'prepared'
        }
        Write-DreamSkinThemeReplacementJournal -Paths $paths `
          -JournalPath $replacementJournalPath -Journal $replacementJournal
        $replacementTransaction = Read-DreamSkinThemeReplacementJournal `
          -Paths $paths -JournalPath $replacementJournalPath
        Assert-DreamSkinNoReparseComponents -Path $destination
        [System.IO.Directory]::Move($destination, $backup)
        $replacementJournal.phase = 'old-moved'
        Write-DreamSkinThemeReplacementJournal -Paths $paths `
          -JournalPath $replacementJournalPath -Journal $replacementJournal
      }
      [System.IO.Directory]::Move($publishStage, $destination)
      $publishedDestination = $true
      $publishStage = $null
      if ($replacementJournal) {
        $replacementJournal.phase = 'new-published'
        Write-DreamSkinThemeReplacementJournal -Paths $paths `
          -JournalPath $replacementJournalPath -Journal $replacementJournal
      }
      $publishedFingerprint = Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $destination
      if ($publishedFingerprint -cne $fingerprint) {
        throw 'Published theme content does not match the validated import payload.'
      }
      $contentFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $destination
      if ($replacementJournal) {
        $replacementJournal.phase = 'committed'
        Write-DreamSkinThemeReplacementJournal -Paths $paths `
          -JournalPath $replacementJournalPath -Journal $replacementJournal
        Write-DreamSkinThemeReplacementCommitMarker -Transaction $replacementTransaction
      }
    } catch {
      $publishError = $_.Exception
      $rollbackErrors = [System.Collections.Generic.List[string]]::new()
      if ($publishedDestination) {
        try {
          if (Test-Path -LiteralPath $destination -ErrorAction Stop) {
            Assert-DreamSkinNoReparseComponents -Path $destination
            $quarantine = Join-Path $paths.Saved ('.theme-failed-' + [guid]::NewGuid().ToString('N'))
            [System.IO.Directory]::Move($destination, $quarantine)
            Remove-DreamSkinManagedDirectoryVerified -Path $quarantine -Root $paths.Root
          }
          if (Test-Path -LiteralPath $destination -ErrorAction Stop) {
            throw 'published destination remains'
          }
        } catch {
          $null = $rollbackErrors.Add(('{0}: {1}' -f $destination, $_.Exception.Message))
        }
      }
      if ($backup) {
        try {
          $backupExists = Test-Path -LiteralPath $backup -PathType Container -ErrorAction Stop
          $destinationExists = Test-Path -LiteralPath $destination -ErrorAction Stop
          if ($backupExists) {
            if ($destinationExists) { throw 'new destination remains' }
            [System.IO.Directory]::Move($backup, $destination)
          }
          if (Test-Path -LiteralPath $backup -ErrorAction Stop) {
            throw 'replacement backup remains after restore'
          }
          if (-not (Test-Path -LiteralPath $destination -PathType Container -ErrorAction Stop)) {
            throw 'original directory was not restored'
          }
          Assert-DreamSkinRestoredThemeFingerprint -Path $destination `
            -ExpectedFingerprint $canonicalFingerprint -Label 'Canonical saved theme'
        } catch {
          $null = $rollbackErrors.Add(('{0}: {1}' -f $destination, $_.Exception.Message))
        }
      } else {
        try {
          if (Test-Path -LiteralPath $destination -ErrorAction Stop) {
            throw 'unexpected destination remains after rollback'
          }
        } catch {
          $null = $rollbackErrors.Add(('{0}: {1}' -f $destination, $_.Exception.Message))
        }
      }
      if ($replacementJournalPath -and $rollbackErrors.Count -eq 0) {
        try {
          if ($replacementTransaction) {
            Remove-DreamSkinThemeReplacementCommitArtifactsVerified `
              -Transaction $replacementTransaction
          }
          Remove-DreamSkinThemeReplacementJournalVerified -Path $replacementJournalPath
        } catch {
          $null = $rollbackErrors.Add("replacement journal: $($_.Exception.Message)")
        }
      }
      if ($rollbackErrors.Count -gt 0) {
        throw "$($publishError.Message); import rollback was not verified: $($rollbackErrors -join '; ')"
      }
      throw $publishError
    }
    $cleanupErrors = [System.Collections.Generic.List[string]]::new()
    if ($replacementTransaction) {
      try {
        # The commit marker remains until the verified old backup is gone. If
        # cleanup stops here, the next locked recovery retains the new theme.
        if ($backup) {
          Remove-DreamSkinManagedDirectoryVerified -Path $backup -Root $paths.Root
        }
        Remove-DreamSkinThemeReplacementJournalVerified -Path $replacementJournalPath
        Remove-DreamSkinThemeReplacementCommitArtifactsVerified `
          -Transaction $replacementTransaction
      } catch {
        $null = $cleanupErrors.Add($_.Exception.Message)
      }
    }
    # Legacy exact-duplicate cleanup is post-commit and warning-only. It cannot
    # roll back a canonical replacement that already passed final validation.
    foreach ($legacy in $legacyCleanupRecords) {
      if ($legacy.EntryName -ceq $id) { continue }
      $cleanupBackup = Join-Path $paths.Saved (
        '.theme-legacy-cleanup-' + [guid]::NewGuid().ToString('N')
      )
      try {
        Assert-DreamSkinNoReparseComponents -Path $legacy.Directory
        if (-not (Test-Path -LiteralPath $legacy.Directory -PathType Container)) { continue }
        [System.IO.Directory]::Move($legacy.Directory, $cleanupBackup)
        Remove-DreamSkinManagedDirectoryVerified -Path $cleanupBackup -Root $paths.Root
      } catch {
        $null = $cleanupErrors.Add($_.Exception.Message)
      }
    }
    $cleanupWarning = $null
    if ($cleanupErrors.Count -gt 0) {
      $cleanupWarning = "Imported theme backup cleanup was not verified: $($cleanupErrors -join '; ')"
    }
    $name = if ($theme.name) { "$($theme.name)" } else { $id }
    $nameCollision = $false
    foreach ($record in $records) {
      if ($record.EntryName -ceq $id) { continue }
      if (@($legacyCleanupRecords | Where-Object { $_.EntryName -ceq $record.EntryName }).Count -gt 0) { continue }
      if ($record.Name -ceq $name) {
        $nameCollision = $true
        break
      }
    }
    return [pscustomobject]@{
      Status = 'Imported'
      Id = $id
      Name = $name
      Renamed = ($id -cne $requestedId)
      Replaced = $replaceExisting
      NameCollision = $nameCollision
      PackageFormat = $packageFormat
      SafeCssStatus = $safeCssStatus
      SignatureIgnored = $signatureIgnored
      ContentFingerprint = $contentFingerprint
      CleanupWarning = $cleanupWarning
      Path = $destination
    }
  } finally {
    if ($publishStage -and (Test-Path -LiteralPath $publishStage)) {
      Remove-Item -LiteralPath $publishStage -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $workRoot) {
      Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
    $mutex.Dispose()
  }
}

function Get-DreamSkinSavedThemes {
  param(
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'),
    [switch]$SkipImageMetadata
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $paths.Root -Root $paths.Root
  Ensure-DreamSkinManagedDirectory -Path $paths.Saved -Root $paths.Root
  if (-not (Test-Path -LiteralPath $paths.Saved -PathType Container)) { return @() }
  $mutex = New-DreamSkinThemeImportMutex
  $acquired = $false
  try {
    try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Another theme import is still running; saved themes cannot be scanned safely.' }
    Repair-DreamSkinThemeReplacementTransactions -Paths $paths
    $themes = @()
    foreach ($directory in Get-ChildItem -LiteralPath $paths.Saved -Directory -ErrorAction SilentlyContinue) {
      if ($directory.Name.StartsWith('.')) { continue }
      try {
        $loaded = Read-DreamSkinTheme -ThemeDirectory $directory.FullName -SkipImageMetadata:$SkipImageMetadata
        $themes += [pscustomobject]@{
          Id = "$($loaded.Theme.id)"
          Name = if ($loaded.Theme.name) { "$($loaded.Theme.name)" } else { $directory.Name }
          Path = $directory.FullName
        }
      } catch {}
    }
    return @($themes | Sort-Object Name)
  } finally {
    if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
    $mutex.Dispose()
  }
}

function Use-DreamSkinSavedTheme {
  param(
    [Parameter(Mandatory = $true)][string]$ThemeDirectory,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $paths.Root -Root $paths.Root
  Ensure-DreamSkinManagedDirectory -Path $paths.Saved -Root $paths.Root
  $directory = [System.IO.Path]::GetFullPath($ThemeDirectory)
  if (-not (Test-DreamSkinThemePathWithin -Path $directory -Root $paths.Saved)) {
    throw 'Saved theme must remain inside the Dream Skin themes folder.'
  }
  $saved = Read-DreamSkinTheme -ThemeDirectory $directory
  $theme = $saved.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $safeCssPath = Join-Path $directory 'theme.css'
  if (-not (Test-Path -LiteralPath $safeCssPath -PathType Leaf)) { $safeCssPath = $null }
  if ($safeCssPath) { Assert-DreamSkinSafeCssFile -Path $safeCssPath }
  return Set-DreamSkinActiveTheme -ImagePath $saved.ImagePath -Theme $theme `
    -SafeCssPath $safeCssPath -StateRoot $StateRoot
}

function Set-DreamSkinPaused {
  param(
    [Parameter(Mandatory = $true)][bool]$Paused,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $paths.Root -Root $paths.Root
  if ($Paused) {
    Assert-DreamSkinNoReparseComponents -Path $paths.PauseFile
    Write-DreamSkinUtf8FileAtomically -Path $paths.PauseFile -Content "paused`r`n"
  } else {
    if (Test-Path -LiteralPath $paths.PauseFile) { Assert-DreamSkinNoReparseComponents -Path $paths.PauseFile }
    Remove-Item -LiteralPath $paths.PauseFile -Force -ErrorAction SilentlyContinue
  }
  return $Paused
}

function Test-DreamSkinPaused {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))
  return (Test-Path -LiteralPath (Get-DreamSkinThemePaths -StateRoot $StateRoot).PauseFile -PathType Leaf)
}

function Get-DreamSkinLiveSessionContext {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  $state = $null
  try { $state = Read-DreamSkinState -Path $paths.State } catch { $state = $null }
  if ($null -eq $state -or -not $state.port -or -not $state.browserId) { return $null }
  $port = 0
  if (-not [int]::TryParse("$($state.port)", [ref]$port)) { return $null }
  Assert-DreamSkinPort -Port $port
  $browserId = "$($state.browserId)".Trim()
  if (-not (Test-DreamSkinBrowserId -Value $browserId)) { return $null }
  if (-not (Get-Command Get-DreamSkinNodeRuntime -ErrorAction SilentlyContinue) -or
    -not (Get-Command Invoke-DreamSkinNative -ErrorAction SilentlyContinue)) {
    return $null
  }
  $node = Get-DreamSkinNodeRuntime
  $injector = Join-Path $PSScriptRoot 'injector.mjs'
  if (-not (Test-Path -LiteralPath $injector)) { return $null }
  return [pscustomobject]@{
    Paths = $paths
    State = $state
    Port = $port
    BrowserId = $browserId
    NodePath = $node.Path
    Injector = $injector
  }
}

function New-DreamSkinOperationToken {
  $pidPart = [string]$PID
  $ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $seq = Get-Random -Minimum 1 -Maximum 99999999
  return "${pidPart}:${ms}:${seq}"
}

function Show-DreamSkinOperationUi {
  param(
    [Parameter(Mandatory = $true)][object]$Session,
    [Parameter(Mandatory = $true)][ValidateSet('begin', 'finish')][string]$Phase,
    [string]$Kind = 'apply',
    [string]$Token,
    [ValidateSet('success', 'error', 'cancelled')][string]$UiState = 'success',
    [string]$Message = '',
    [int]$TimeoutMs = 3000
  )
  $argumentList = @($Session.Injector, "--port", "$($Session.Port)", "--browser-id", $Session.BrowserId, "--timeout-ms", "$TimeoutMs")
  if ($Phase -eq 'begin') {
    if ($Kind -notin @('apply', 'pause', 'switch')) { throw "Invalid operation kind: $Kind" }
    $token = if ($Token) { $Token } else { New-DreamSkinOperationToken }
    $argumentList += @('--begin-operation', '--operation-kind', $Kind, '--operation-token', $token)
    $probe = Invoke-DreamSkinNative -FilePath $Session.NodePath -ArgumentList $argumentList -DiscardStderr
    $printed = (($probe.Output -join "`n").Trim() -split "`n" | Select-Object -Last 1).Trim()
    if ($probe.ExitCode -ne 0 -or -not $printed) {
      return [pscustomobject]@{ Ok = $false; Token = $token; Message = '无法在 Codex 窗口显示进度。' }
    }
    return [pscustomobject]@{ Ok = $true; Token = $printed; Message = '' }
  }
  if (-not $Token) { throw 'Finish operation requires a token.' }
  if ($Message.Length -gt 240 -or $Message -match "[\r\n]") { throw 'Invalid operation message.' }
  $argumentList += @(
    '--finish-operation',
    '--operation-ui-state', $UiState,
    '--operation-message', $Message,
    '--operation-token', $Token
  )
  $probe = Invoke-DreamSkinNative -FilePath $Session.NodePath -ArgumentList $argumentList -DiscardStderr
  return [pscustomobject]@{
    Ok = ($probe.ExitCode -eq 0)
    Token = $Token
    Message = if ($probe.ExitCode -eq 0) { '' } else { '无法更新 Codex 窗口内的操作状态。' }
  }
}

# Mirror macOS pause: mark paused, show in-app loading, then strip the live skin over CDP.
# Writing only the pause file leaves CSS in the renderer until the watcher polls.
function Invoke-DreamSkinLiveRemove {
  param(
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'),
    [int]$TimeoutMs = 8000
  )
  if ($TimeoutMs -lt 250 -or $TimeoutMs -gt 120000) {
    throw "Invalid live-remove timeout: $TimeoutMs"
  }
  $session = Get-DreamSkinLiveSessionContext -StateRoot $StateRoot
  if ($null -eq $session) {
    return [pscustomobject]@{
      Attempted = $false
      Removed = $false
      Message = '没有可连接的活动会话；已记录暂停，当前窗口可能仍显示皮肤。'
    }
  }

  $token = $null
  $begin = Show-DreamSkinOperationUi -Session $session -Phase begin -Kind pause -TimeoutMs 3000
  if ($begin.Ok) { $token = $begin.Token }

  $argumentList = @(
    $session.Injector,
    '--remove',
    '--port', "$($session.Port)",
    '--browser-id', $session.BrowserId,
    '--timeout-ms', "$TimeoutMs"
  )
  if ($token) { $argumentList += @('--operation-token', $token) }
  if (Test-Path -LiteralPath $session.Paths.Active) {
    $argumentList += @('--theme-dir', $session.Paths.Active)
  }

  $removal = Invoke-DreamSkinNative -FilePath $session.NodePath -ArgumentList $argumentList -DiscardStderr
  if ($removal.ExitCode -eq 0) {
    if ($token) {
      $null = Show-DreamSkinOperationUi -Session $session -Phase finish -Token $token `
        -UiState success -Message '皮肤已暂停' -TimeoutMs 1500
    }
    return [pscustomobject]@{
      Attempted = $true
      Removed = $true
      Message = '皮肤已暂停'
    }
  }
  if ($token) {
    $null = Show-DreamSkinOperationUi -Session $session -Phase finish -Token $token `
      -UiState error -Message '暂停失败，请重试' -TimeoutMs 1500
  }
  return [pscustomobject]@{
    Attempted = $true
    Removed = $false
    Message = '已记录暂停，但卸下当前皮肤失败；可重试暂停或完全恢复。'
  }
}
