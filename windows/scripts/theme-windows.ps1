if (-not (Get-Command Read-DreamSkinUtf8File -ErrorAction SilentlyContinue)) {
  . (Join-Path $PSScriptRoot 'config-utf8.ps1')
}

$script:DreamSkinMaxImageBytes = 16 * 1024 * 1024
$script:DreamSkinMaxThemeArchiveBytes = 32 * 1024 * 1024
$script:DreamSkinMaxThemeArchiveExpandedBytes = 64 * 1024 * 1024
$script:DreamSkinMaxThemeArchiveEntries = 32

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
    throw 'Theme image exceeds the 16 MB limit.'
  }
  if (-not $SkipImageMetadata) {
    Get-DreamSkinValidatedImageMetadata -Path $fullPath
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
    Theme = $theme
  }
}

function Write-DreamSkinTheme {
  param(
    [Parameter(Mandatory = $true)][string]$ThemeDirectory,
    [Parameter(Mandatory = $true)][object]$Theme
  )
  Assert-DreamSkinNoReparseComponents -Path $ThemeDirectory
  New-Item -ItemType Directory -Force -Path $ThemeDirectory | Out-Null
  Assert-DreamSkinNoReparseComponents -Path $ThemeDirectory
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
      palette = [pscustomobject]@{}
    }
  }
  $imageName = New-DreamSkinThemeImageName -Extension $extension
  $target = Join-Path $paths.Active $imageName
  $temporary = Join-Path $paths.Active ('.dream-tmp-' + [guid]::NewGuid().ToString('N') + $extension)
  try {
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
    if (-not $Theme.id) { $Theme | Add-Member -NotePropertyName id -NotePropertyValue 'custom' -Force }
    if (-not $Theme.appearance) { $Theme | Add-Member -NotePropertyName appearance -NotePropertyValue 'auto' -Force }
    if (-not $Theme.art) {
      $Theme | Add-Member -NotePropertyName art -NotePropertyValue `
        ([pscustomobject]@{ focusX = $null; focusY = $null; safeArea = 'auto'; taskMode = 'auto' }) -Force
    }
    if (-not $Theme.palette) {
      $Theme | Add-Member -NotePropertyName palette -NotePropertyValue ([pscustomobject]@{}) -Force
    }
    Write-DreamSkinTheme -ThemeDirectory $paths.Active -Theme $Theme
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
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

function Test-DreamSkinNestedArchiveName {
  param([Parameter(Mandatory = $true)][string]$Name)
  return $Name -match '(?i)\.(?:zip|dreamskin|7z|rar|tar|tgz|gz|bz2|xz)$'
}

function Test-DreamSkinWindowsReservedPathStem {
  param([Parameter(Mandatory = $true)][string]$Name)
  $stem = ($Name -split '\.', 2)[0]
  return $stem -match '^(?i:CON|PRN|AUX|NUL|COM[1-9\u00B9\u00B2\u00B3]|LPT[1-9\u00B9\u00B2\u00B3])$'
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
    [Parameter(Mandatory = $true)][string]$DestinationRoot
  )
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
      [System.IO.FileShare]::Read
    )
    $openedArchiveLength = [int64]$archiveStream.Length
    if ($openedArchiveLength -lt 1) { throw 'Theme ZIP cannot be empty.' }
    if ($openedArchiveLength -gt $script:DreamSkinMaxThemeArchiveBytes) {
      throw 'Theme ZIP exceeds the 32 MB archive limit.'
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
  } elseif ($sourceFiles.Count -ne 2) {
    throw 'A local simplified theme ZIP must contain exactly theme.json and one referenced image.'
  }
  return $sourceRoot
}

function Import-DreamSkinThemeZip {
  param(
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  foreach ($directory in @($paths.Root, $paths.Saved)) {
    Ensure-DreamSkinManagedDirectory -Path $directory -Root $paths.Root
  }
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.ThemeImport")
  $acquired = $false
  $workRoot = Join-Path $paths.Root ('.theme-import-work-' + [guid]::NewGuid().ToString('N'))
  $publishStage = $null
  try {
    try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { throw 'Another theme import is still running; try again shortly.' }
    Ensure-DreamSkinManagedDirectory -Path $workRoot -Root $paths.Root
    $extractRoot = Join-Path $workRoot 'extracted'
    Ensure-DreamSkinManagedDirectory -Path $extractRoot -Root $paths.Root
    $sourceRoot = Expand-DreamSkinThemeZipSecurely -ArchivePath $ArchivePath -DestinationRoot $extractRoot

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
    $cssIgnored = [bool]$packageInfo.cssIgnored
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

    $injector = Join-Path $PSScriptRoot 'injector.mjs'
    $payloadCheck = @(& $node.Path $injector '--check-payload' '--theme-dir' $sourceRoot 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw 'Theme ZIP failed theme.json or image payload validation.'
    }

    $fingerprint = Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $sourceRoot
    $existingNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($savedDirectory in Get-ChildItem -LiteralPath $paths.Saved -Directory -Force -ErrorAction SilentlyContinue) {
      if ($savedDirectory.Name.StartsWith('.')) { continue }
      try {
        $saved = Read-DreamSkinTheme -ThemeDirectory $savedDirectory.FullName -SkipImageMetadata
        $savedName = if ($saved.Theme.name) { "$($saved.Theme.name)" } else { $savedDirectory.Name }
        $null = $existingNames.Add($savedName)
        if ((Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $savedDirectory.FullName) -ceq $fingerprint) {
          return [pscustomobject]@{
            Status = 'Duplicate'
            Id = $savedDirectory.Name
            Name = $savedName
            Renamed = $false
            NameCollision = $false
            PackageFormat = $packageFormat
            CssIgnored = $cssIgnored
            SignatureIgnored = $signatureIgnored
            Path = $savedDirectory.FullName
          }
        }
      } catch {}
    }

    $requestedId = "$($source.Theme.id)".Trim()
    $baseId = if ($requestedId -cmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' -and
      -not $requestedId.EndsWith('.') -and
      -not (Test-DreamSkinWindowsReservedPathStem -Name $requestedId)) {
      $requestedId
    } else {
      'import-' + $fingerprint.Substring(0, 12)
    }
    $id = $baseId
    $suffix = 2
    while (Test-Path -LiteralPath (Join-Path $paths.Saved $id)) {
      $marker = "-$suffix"
      $id = $baseId.Substring(0, [Math]::Min($baseId.Length, 80 - $marker.Length)) + $marker
      $suffix += 1
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
    $stagedPayloadCheck = @(& $node.Path $injector '--check-payload' '--theme-dir' $publishStage 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Imported theme failed final payload validation.' }

    $destination = Join-Path $paths.Saved $id
    [System.IO.Directory]::Move($publishStage, $destination)
    $publishStage = $null
    $name = if ($theme.name) { "$($theme.name)" } else { $id }
    return [pscustomobject]@{
      Status = 'Imported'
      Id = $id
      Name = $name
      Renamed = ($id -cne $requestedId)
      NameCollision = $existingNames.Contains($name)
      PackageFormat = $packageFormat
      CssIgnored = $cssIgnored
      SignatureIgnored = $signatureIgnored
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
  $themes = @()
  foreach ($directory in Get-ChildItem -LiteralPath $paths.Saved -Directory -ErrorAction SilentlyContinue) {
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
  return Set-DreamSkinActiveTheme -ImagePath $saved.ImagePath -Theme $theme -StateRoot $StateRoot
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
