if (-not (Get-Command Read-DreamSkinUtf8File -ErrorAction SilentlyContinue)) {
  . (Join-Path $PSScriptRoot 'config-utf8.ps1')
}

$script:DreamSkinMaxImageBytes = 16 * 1024 * 1024

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
    Preview = Join-Path $fullRoot 'theme-preview'
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

function Initialize-DreamSkinThemeStore {
  param(
    [Parameter(Mandatory = $true)][string]$SkillRoot,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  foreach ($directory in @($paths.Root, $paths.Active, $paths.Saved, $paths.Images)) {
    Ensure-DreamSkinManagedDirectory -Path $directory -Root $paths.Root
  }
  Restore-DreamSkinStaleThemePreview -StateRoot $StateRoot | Out-Null
  $assetRoot = Join-Path $SkillRoot 'assets'
  $assetImage = Join-Path $assetRoot 'dream-reference.jpg'
  Assert-DreamSkinImageFile -Path $assetImage
  $activeTheme = Join-Path $paths.Active 'theme.json'
  Assert-DreamSkinNoReparseComponents -Path $activeTheme
  if (-not (Test-Path -LiteralPath $activeTheme -PathType Leaf)) {
    Ensure-DreamSkinManagedDirectory -Path $paths.Active -Root $paths.Root
    Assert-DreamSkinNoReparseComponents -Path (Join-Path $paths.Active 'dream-reference.jpg')
    $activeImage = Join-Path $paths.Active 'dream-reference.jpg'
    Copy-Item -LiteralPath (Join-Path $assetRoot 'dream-reference.jpg') `
      -Destination $activeImage -Force
    Assert-DreamSkinNoReparseComponents -Path $activeImage
    Assert-DreamSkinImageFile -Path $activeImage
    $imageArchive = Join-Path $paths.Images 'dream-reference.jpg'
    Assert-DreamSkinNoReparseComponents -Path $imageArchive
    Copy-Item -LiteralPath (Join-Path $assetRoot 'dream-reference.jpg') `
      -Destination $imageArchive -Force
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
  $presetDirectory = Join-Path $paths.Saved 'preset-arina-hashimoto'
  $presetTheme = Join-Path $presetDirectory 'theme.json'
  Assert-DreamSkinNoReparseComponents -Path $presetDirectory
  Assert-DreamSkinNoReparseComponents -Path $presetTheme
  if (-not (Test-Path -LiteralPath $presetTheme -PathType Leaf)) {
    Ensure-DreamSkinManagedDirectory -Path $presetDirectory -Root $paths.Root
    $presetImage = Join-Path $presetDirectory 'dream-reference.jpg'
    Assert-DreamSkinNoReparseComponents -Path $presetImage
    Copy-Item -LiteralPath (Join-Path $assetRoot 'dream-reference.jpg') `
      -Destination $presetImage -Force
    Assert-DreamSkinNoReparseComponents -Path $presetImage
    Assert-DreamSkinImageFile -Path $presetImage
    Assert-DreamSkinNoReparseComponents -Path $presetTheme
    Copy-Item -LiteralPath (Join-Path $assetRoot 'theme.json') -Destination $presetTheme -Force
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

function Write-DreamSkinPreviewBytesAtomically {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Bytes
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  Assert-DreamSkinNoReparseComponents -Path $fullPath
  $directory = [System.IO.Path]::GetDirectoryName($fullPath)
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  Assert-DreamSkinNoReparseComponents -Path $directory
  $fileName = [System.IO.Path]::GetFileName($fullPath)
  $temporary = Join-Path $directory ".$fileName.$PID.$([guid]::NewGuid().ToString('N')).tmp"
  $replacementBackup = Join-Path $directory ".$fileName.$PID.$([guid]::NewGuid().ToString('N')).replace-backup"
  try {
    [System.IO.File]::WriteAllBytes($temporary, $Bytes)
    if ([System.IO.File]::Exists($fullPath)) {
      [System.IO.File]::Replace($temporary, $fullPath, $replacementBackup)
    } else {
      [System.IO.File]::Move($temporary, $fullPath)
    }
  } finally {
    if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
    if ([System.IO.File]::Exists($replacementBackup)) { [System.IO.File]::Delete($replacementBackup) }
  }
}

function Copy-DreamSkinThemeSnapshot {
  param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$DestinationDirectory,
    [Parameter(Mandatory = $true)][string]$StateRoot
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  $sourceThemePath = Join-Path ([System.IO.Path]::GetFullPath($SourceDirectory)) 'theme.json'
  Assert-DreamSkinNoReparseComponents -Path $sourceThemePath
  $themeBytes = [System.IO.File]::ReadAllBytes($sourceThemePath)
  $source = Read-DreamSkinTheme -ThemeDirectory $SourceDirectory
  $imageBytes = [System.IO.File]::ReadAllBytes($source.ImagePath)
  Assert-DreamSkinFileUnchanged -Path $source.ThemePath -ExpectedBytes $themeBytes
  Assert-DreamSkinFileUnchanged -Path $source.ImagePath -ExpectedBytes $imageBytes

  Ensure-DreamSkinManagedDirectory -Path $DestinationDirectory -Root $paths.Root
  $destinationRoot = [System.IO.Path]::GetFullPath($DestinationDirectory).TrimEnd('\')
  $destinationImage = [System.IO.Path]::GetFullPath(
    (Join-Path $destinationRoot "$($source.Theme.image)")
  )
  if (-not $destinationImage.StartsWith(
      $destinationRoot + '\',
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw 'Theme snapshot image escaped its transaction directory.'
  }
  Write-DreamSkinPreviewBytesAtomically -Path $destinationImage -Bytes $imageBytes
  Write-DreamSkinPreviewBytesAtomically `
    -Path (Join-Path $destinationRoot 'theme.json') -Bytes $themeBytes
  return Read-DreamSkinTheme -ThemeDirectory $destinationRoot
}

function Assert-DreamSkinThemePayload {
  param([Parameter(Mandatory = $true)][string]$ThemeDirectory)
  if (-not (Get-Command Get-DreamSkinNodeRuntime -ErrorAction SilentlyContinue)) {
    throw 'Node.js runtime validation is unavailable for theme previews.'
  }
  $node = Get-DreamSkinNodeRuntime
  $injector = Join-Path $PSScriptRoot 'injector.mjs'
  $output = @(& $node.Path $injector '--check-payload' '--theme-dir' `
    ([System.IO.Path]::GetFullPath($ThemeDirectory)) 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Theme preview payload failed validation: $($output -join ' ')"
  }
}

function Publish-DreamSkinThemeSnapshot {
  param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$StateRoot
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $paths.Active -Root $paths.Root
  $source = Read-DreamSkinTheme -ThemeDirectory $SourceDirectory
  $imageBytes = [System.IO.File]::ReadAllBytes($source.ImagePath)
  Assert-DreamSkinFileUnchanged -Path $source.ImagePath -ExpectedBytes $imageBytes
  $oldImage = $null
  try { $oldImage = (Read-DreamSkinTheme -ThemeDirectory $paths.Active).ImagePath } catch {}

  $extension = [System.IO.Path]::GetExtension($source.ImagePath).ToLowerInvariant()
  $imageName = New-DreamSkinThemeImageName -Extension $extension
  $targetImage = Join-Path $paths.Active $imageName
  Write-DreamSkinPreviewBytesAtomically -Path $targetImage -Bytes $imageBytes
  Assert-DreamSkinImageFile -Path $targetImage

  $theme = $source.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $theme | Add-Member -NotePropertyName image -NotePropertyValue $imageName -Force
  $json = ($theme | ConvertTo-Json -Depth 8) + "`r`n"
  $jsonBytes = [System.Text.UTF8Encoding]::new($false, $true).GetBytes($json)
  Write-DreamSkinPreviewBytesAtomically `
    -Path (Join-Path $paths.Active 'theme.json') -Bytes $jsonBytes
  $published = Read-DreamSkinTheme -ThemeDirectory $paths.Active

  if ($oldImage -and
    -not ([System.IO.Path]::GetFullPath($oldImage) -ieq [System.IO.Path]::GetFullPath($targetImage)) -and
    (Test-DreamSkinThemePathWithin -Path $oldImage -Root $paths.Active)) {
    Remove-Item -LiteralPath $oldImage -Force -ErrorAction SilentlyContinue
  }
  return $published
}

function Get-DreamSkinThemePreviewState {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  if (-not (Test-Path -LiteralPath $paths.Preview)) { return $null }
  Assert-DreamSkinNoReparseComponents -Path $paths.Preview
  if (-not (Test-Path -LiteralPath $paths.Preview -PathType Container)) {
    throw 'Theme preview marker is not a directory.'
  }
  $statePath = Join-Path $paths.Preview 'preview.json'
  Assert-DreamSkinNoReparseComponents -Path $statePath
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
    throw 'Theme preview state is incomplete; its backup was preserved.'
  }
  try {
    $state = (Read-DreamSkinUtf8File -Path $statePath) | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw 'Theme preview state is invalid; its backup was preserved.'
  }
  if ($null -eq $state -or $state.schemaVersion -ne 1 -or
    $null -eq $state.ownerPid -or -not $state.ownerStartedAt) {
    throw 'Theme preview state has an unsupported schema; its backup was preserved.'
  }
  $backup = Join-Path $paths.Preview 'backup'
  $candidate = Join-Path $paths.Preview 'candidate'
  $null = Read-DreamSkinTheme -ThemeDirectory $backup
  return [pscustomobject]@{
    Paths = $paths
    Directory = $paths.Preview
    Backup = $backup
    Candidate = $candidate
    State = $state
  }
}

function Test-DreamSkinThemePreviewOwnerAlive {
  param([Parameter(Mandatory = $true)][object]$Preview)
  try {
    $ownerPid = [int]$Preview.State.ownerPid
    if ($ownerPid -lt 1) { return $false }
    $process = Get-Process -Id $ownerPid -ErrorAction Stop
    $startedAt = $process.StartTime.ToUniversalTime().ToString('o')
    $expectedStartedAt = if ($Preview.State.ownerStartedAt -is [datetime]) {
      $Preview.State.ownerStartedAt.ToUniversalTime().ToString('o')
    } else {
      "$($Preview.State.ownerStartedAt)"
    }
    return $startedAt -ceq $expectedStartedAt
  } catch {
    return $false
  }
}

function Remove-DreamSkinThemePreviewTransaction {
  param([Parameter(Mandatory = $true)][object]$Preview)
  $cleanup = Join-Path $Preview.Paths.Root (
    '.theme-preview.cleanup.' + [guid]::NewGuid().ToString('N')
  )
  Assert-DreamSkinNoReparseComponents -Path $Preview.Directory
  Assert-DreamSkinNoReparseComponents -Path $cleanup
  Move-Item -LiteralPath $Preview.Directory -Destination $cleanup -ErrorAction Stop
  try {
    Assert-DreamSkinNoReparseComponents -Path $cleanup
    Remove-Item -LiteralPath $cleanup -Recurse -Force -ErrorAction Stop
  } catch {
    Write-Warning "Theme preview completed, but temporary cleanup remains at $cleanup"
  }
}

function Start-DreamSkinThemePreview {
  param(
    [Parameter(Mandatory = $true)][string]$ThemeDirectory,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  foreach ($directory in @($paths.Root, $paths.Active, $paths.Saved)) {
    Ensure-DreamSkinManagedDirectory -Path $directory -Root $paths.Root
  }
  Restore-DreamSkinStaleThemePreview -StateRoot $StateRoot | Out-Null
  if (Test-Path -LiteralPath $paths.Preview) {
    throw 'Another theme preview is still in progress.'
  }

  $sourceDirectory = [System.IO.Path]::GetFullPath($ThemeDirectory)
  if (-not (Test-DreamSkinThemePathWithin -Path $sourceDirectory -Root $paths.Saved)) {
    throw 'Previewed theme must remain inside the Dream Skin themes folder.'
  }
  $null = Read-DreamSkinTheme -ThemeDirectory $sourceDirectory
  $preparation = Join-Path $paths.Root (
    '.theme-preview.prepare.' + [guid]::NewGuid().ToString('N')
  )
  $published = $false
  try {
    Ensure-DreamSkinManagedDirectory -Path $preparation -Root $paths.Root
    $null = Copy-DreamSkinThemeSnapshot -SourceDirectory $paths.Active `
      -DestinationDirectory (Join-Path $preparation 'backup') -StateRoot $StateRoot
    $null = Copy-DreamSkinThemeSnapshot -SourceDirectory $sourceDirectory `
      -DestinationDirectory (Join-Path $preparation 'candidate') -StateRoot $StateRoot
    Assert-DreamSkinThemePayload -ThemeDirectory (Join-Path $preparation 'backup')
    Assert-DreamSkinThemePayload -ThemeDirectory (Join-Path $preparation 'candidate')
    $previewState = [pscustomobject]@{
      schemaVersion = 1
      ownerPid = $PID
      ownerStartedAt = (Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('o')
      createdAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $previewJson = ($previewState | ConvertTo-Json -Depth 4) + "`r`n"
    Write-DreamSkinPreviewBytesAtomically `
      -Path (Join-Path $preparation 'preview.json') `
      -Bytes ([System.Text.UTF8Encoding]::new($false, $true).GetBytes($previewJson))
    Move-Item -LiteralPath $preparation -Destination $paths.Preview -ErrorAction Stop
    $published = $true
    $preview = Get-DreamSkinThemePreviewState -StateRoot $StateRoot
    try {
      return Publish-DreamSkinThemeSnapshot `
        -SourceDirectory $preview.Candidate -StateRoot $StateRoot
    } catch {
      $applyError = $_
      try { $null = Undo-DreamSkinThemePreview -StateRoot $StateRoot } catch {
        Write-Warning 'Theme preview failed and its original theme could not be restored automatically.'
      }
      throw $applyError
    }
  } finally {
    if (-not $published -and (Test-Path -LiteralPath $preparation)) {
      Assert-DreamSkinNoReparseComponents -Path $preparation
      Remove-Item -LiteralPath $preparation -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Complete-DreamSkinThemePreview {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))
  $preview = Get-DreamSkinThemePreviewState -StateRoot $StateRoot
  if ($null -eq $preview) { throw 'No theme preview is in progress.' }
  if (-not (Test-DreamSkinThemePreviewOwnerAlive -Preview $preview) -or
    [int]$preview.State.ownerPid -ne $PID) {
    throw 'Only the process that started this preview can keep it.'
  }
  $active = Read-DreamSkinTheme -ThemeDirectory $preview.Paths.Active
  Remove-DreamSkinThemePreviewTransaction -Preview $preview
  return $active
}

function Undo-DreamSkinThemePreview {
  param(
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'),
    [switch]$AllowStaleOwner
  )
  $preview = Get-DreamSkinThemePreviewState -StateRoot $StateRoot
  if ($null -eq $preview) { throw 'No theme preview is in progress.' }
  if (-not $AllowStaleOwner -and (
      -not (Test-DreamSkinThemePreviewOwnerAlive -Preview $preview) -or
      [int]$preview.State.ownerPid -ne $PID
    )) {
    throw 'Only the process that started this preview can cancel it.'
  }
  $restored = Publish-DreamSkinThemeSnapshot `
    -SourceDirectory $preview.Backup -StateRoot $StateRoot
  Remove-DreamSkinThemePreviewTransaction -Preview $preview
  return $restored
}

function Restore-DreamSkinStaleThemePreview {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))
  $preview = Get-DreamSkinThemePreviewState -StateRoot $StateRoot
  if ($null -eq $preview -or (Test-DreamSkinThemePreviewOwnerAlive -Preview $preview)) {
    return $false
  }
  $null = Undo-DreamSkinThemePreview -StateRoot $StateRoot -AllowStaleOwner
  return $true
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
