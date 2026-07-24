[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts\common-windows.ps1')
. (Join-Path $Root 'scripts\theme-windows.ps1')
Add-Type -AssemblyName System.IO.Compression -ErrorAction Stop
Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) "codex-dream-skin-zip-tests-$PID-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

function Write-TestThemePack {
  param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Quote = 'IMPORT TEST'
  )
  New-Item -ItemType Directory -Path $Directory -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $Root 'assets\dream-reference.jpg') `
    -Destination (Join-Path $Directory 'background.jpg') -Force
  $theme = [ordered]@{
    schemaVersion = 1
    id = $Id
    name = $Name
    image = 'background.jpg'
    appearance = 'auto'
    quote = $Quote
    art = [ordered]@{ safeArea = 'auto'; taskMode = 'auto' }
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $Directory 'theme.json'),
    (($theme | ConvertTo-Json -Depth 8) + "`r`n"),
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Write-TestOfficialThemePack {
  param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Name,
    [switch]$IncludeOptionalFiles,
    [string]$LicenseText = "CC0-1.0`r`n"
  )
  New-Item -ItemType Directory -Path $Directory -Force | Out-Null
  $imagePath = Join-Path $Directory 'background.jpg'
  Copy-Item -LiteralPath (Join-Path $Root 'assets\dream-reference.jpg') -Destination $imagePath -Force
  $theme = [ordered]@{
    schemaVersion = 1
    id = $Id
    name = $Name
    image = 'background.jpg'
    appearance = 'auto'
    art = [ordered]@{ focusX = 0.7; focusY = 0.5; safeArea = 'left'; taskMode = 'full' }
    colors = [ordered]@{
      background = '#071116'; panel = '#0b1a20'; panelAlt = '#10272c'; accent = '#7cff46'
      accentAlt = '#b8ff3d'; secondary = '#36d7e8'; highlight = '#642a8c'; text = '#e9fff1'
      muted = '#9ebdb3'; line = 'rgba(124, 255, 70, .28)'
    }
  }
  $themePath = Join-Path $Directory 'theme.json'
  [System.IO.File]::WriteAllText(
    $themePath,
    (($theme | ConvertTo-Json -Depth 8) + "`r`n"),
    [System.Text.UTF8Encoding]::new($false)
  )
  $files = @(
    [ordered]@{
      path = 'theme.json'; mediaType = 'application/json'; bytes = (Get-Item -LiteralPath $themePath).Length
      sha256 = (Get-FileHash -LiteralPath $themePath -Algorithm SHA256).Hash.ToLowerInvariant()
    },
    [ordered]@{
      path = 'background.jpg'; mediaType = 'image/jpeg'; bytes = (Get-Item -LiteralPath $imagePath).Length
      sha256 = (Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  )
  $capabilities = @('background', 'tokens')
  if ($IncludeOptionalFiles) {
    $cssPath = Join-Path $Directory 'theme.css'
    $licensePath = Join-Path $Directory 'LICENSE.txt'
    [System.IO.File]::WriteAllText($cssPath, ":root { --ds-theme-accent: #7cff46; }`r`n", [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($licensePath, $LicenseText, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $Directory 'manifest.sig'), 'reserved-signature', [System.Text.UTF8Encoding]::new($false))
    $files += [ordered]@{
      path = 'theme.css'; mediaType = 'text/css'; bytes = (Get-Item -LiteralPath $cssPath).Length
      sha256 = (Get-FileHash -LiteralPath $cssPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $files += [ordered]@{
      path = 'LICENSE.txt'; mediaType = 'text/plain'; bytes = (Get-Item -LiteralPath $licensePath).Length
      sha256 = (Get-FileHash -LiteralPath $licensePath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $capabilities += 'safe-css'
  }
  $manifest = [ordered]@{
    packageVersion = 1
    themeId = $Id
    version = '1.2.3'
    skinApiVersion = 1
    minClientVersion = '1.3.0'
    platforms = @('macos', 'windows')
    capabilities = $capabilities
    publisher = [ordered]@{ id = 'dreamskin-studio'; displayName = 'DreamSkin Studio' }
    license = 'CC0-1.0'
    provenance = [ordered]@{ aiGenerated = $false; summary = 'Studio contract test package.' }
    files = $files
    createdAt = '2026-07-24T00:00:00Z'
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $Directory 'manifest.json'),
    (($manifest | ConvertTo-Json -Depth 8) + "`r`n"),
    [System.Text.UTF8Encoding]::new($false)
  )
}

function New-TestZipFromDirectory {
  param([Parameter(Mandatory = $true)][string]$Source, [Parameter(Mandatory = $true)][string]$Archive)
  if (Test-Path -LiteralPath $Archive) { Remove-Item -LiteralPath $Archive -Force }
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $Source,
    $Archive,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )
}

function New-TestZipWithEntry {
  param(
    [Parameter(Mandatory = $true)][string]$Archive,
    [Parameter(Mandatory = $true)][string]$EntryName,
    [string]$Content = 'fixture',
    [Nullable[int]]$ExternalAttributes = $null
  )
  $stream = [System.IO.File]::Open($Archive, [System.IO.FileMode]::CreateNew)
  $zip = [System.IO.Compression.ZipArchive]::new(
    $stream,
    [System.IO.Compression.ZipArchiveMode]::Create,
    $false
  )
  try {
    $entry = $zip.CreateEntry($EntryName)
    if ($null -ne $ExternalAttributes) { $entry.ExternalAttributes = $ExternalAttributes.Value }
    $writer = [System.IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
    try { $writer.Write($Content) } finally { $writer.Dispose() }
  } finally {
    $zip.Dispose()
    $stream.Dispose()
  }
}

function Assert-TestImportRejected {
  param([Parameter(Mandatory = $true)][string]$Archive, [Parameter(Mandatory = $true)][string]$Label)
  $savedBefore = @(Get-ChildItem -LiteralPath $paths.Saved -Directory -Force -ErrorAction Stop | ForEach-Object Name | Sort-Object)
  $rejected = $false
  try { $null = Import-DreamSkinThemeZip -ArchivePath $Archive -StateRoot $stateRoot } catch { $rejected = $true }
  if (-not $rejected) { throw "Theme ZIP import unexpectedly accepted $Label." }
  $savedAfter = @(Get-ChildItem -LiteralPath $paths.Saved -Directory -Force -ErrorAction Stop | ForEach-Object Name | Sort-Object)
  if ((Compare-Object -ReferenceObject $savedBefore -DifferenceObject $savedAfter).Count -ne 0) {
    throw "Rejected theme ZIP published saved-theme content for $Label."
  }
}

function Assert-TestExpansionRejectedWithoutWrites {
  param([Parameter(Mandatory = $true)][string]$Archive, [Parameter(Mandatory = $true)][string]$Label)
  $destination = Join-Path $temporaryRoot ("rejected-expansion-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $destination | Out-Null
  $rejected = $false
  try { $null = Expand-DreamSkinThemeZipSecurely -ArchivePath $Archive -DestinationRoot $destination } catch { $rejected = $true }
  if (-not $rejected) { throw "Theme ZIP expansion unexpectedly accepted $Label." }
  if (@(Get-ChildItem -LiteralPath $destination -Force -ErrorAction Stop).Count -ne 0) {
    throw "Rejected theme ZIP wrote extraction content for $Label."
  }
}

try {
  $stateRoot = Join-Path $temporaryRoot 'state'
  $paths = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $stateRoot
  $activeBefore = Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $paths.Active

  $officialSource = Join-Path $temporaryRoot 'official-source'
  $officialArchive = Join-Path $temporaryRoot 'official.zip'
  Write-TestOfficialThemePack -Directory $officialSource -Id 'studio.windows-contract' `
    -Name 'Studio Windows Contract' -IncludeOptionalFiles
  New-TestZipFromDirectory -Source $officialSource -Archive $officialArchive
  $official = Import-DreamSkinThemeZip -ArchivePath $officialArchive -StateRoot $stateRoot
  if ($official.Status -cne 'Imported' -or $official.Id -cne 'studio.windows-contract' -or
    $official.PackageFormat -cne 'official' -or -not $official.CssIgnored -or -not $official.SignatureIgnored) {
    throw 'Studio manifest ZIP did not import with its official id and warning metadata.'
  }
  foreach ($savedFile in @('theme.json', 'background.jpg', 'theme.css', 'LICENSE.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $official.Path $savedFile) -PathType Leaf)) {
      throw "Studio manifest ZIP did not preserve $savedFile."
    }
  }
  foreach ($ignoredFile in @('manifest.json', 'manifest.sig')) {
    if (Test-Path -LiteralPath (Join-Path $official.Path $ignoredFile)) {
      throw "Saved theme retained package-only metadata: $ignoredFile"
    }
  }
  $officialDuplicate = Import-DreamSkinThemeZip -ArchivePath $officialArchive -StateRoot $stateRoot
  if ($officialDuplicate.Status -cne 'Duplicate' -or $officialDuplicate.Id -cne 'studio.windows-contract') {
    throw 'Studio manifest ZIP duplicate was written twice.'
  }

  foreach ($reservedId in @(
    'con.theme',
    'aux',
    'lpt1.skin',
    ('com{0}.theme' -f [char]0x00B9),
    ('lpt{0}.skin' -f [char]0x00B2)
  )) {
    $reservedToken = $reservedId.Replace('.', '-')
    $reservedSource = Join-Path $temporaryRoot "official-reserved-$reservedToken-source"
    $reservedArchive = Join-Path $temporaryRoot "official-reserved-$reservedToken.zip"
    Write-TestOfficialThemePack -Directory $reservedSource -Id $reservedId `
      -Name "Reserved Windows ID $reservedId"
    New-TestZipFromDirectory -Source $reservedSource -Archive $reservedArchive
    $reserved = Import-DreamSkinThemeZip -ArchivePath $reservedArchive -StateRoot $stateRoot
    if ($reserved.Status -cne 'Imported' -or
      $reserved.Id -cnotmatch '^import-[0-9a-f]{12}$' -or
      -not $reserved.Renamed -or
      [System.IO.Path]::GetFileName($reserved.Path) -cne $reserved.Id) {
      throw "Studio theme id $reservedId was not mapped to a safe Windows directory id."
    }
    $reservedDuplicate = Import-DreamSkinThemeZip -ArchivePath $reservedArchive -StateRoot $stateRoot
    if ($reservedDuplicate.Status -cne 'Duplicate' -or $reservedDuplicate.Id -cne $reserved.Id) {
      throw "Studio theme id $reservedId was duplicated after its safe Windows id mapping."
    }
  }

  $licenseVariantSource = Join-Path $temporaryRoot 'official-license-variant-source'
  $licenseVariantArchive = Join-Path $temporaryRoot 'official-license-variant.zip'
  Write-TestOfficialThemePack -Directory $licenseVariantSource -Id 'studio.windows-contract' `
    -Name 'Studio Windows Contract' -IncludeOptionalFiles -LicenseText "MIT`r`n"
  New-TestZipFromDirectory -Source $licenseVariantSource -Archive $licenseVariantArchive
  $licenseVariant = Import-DreamSkinThemeZip -ArchivePath $licenseVariantArchive -StateRoot $stateRoot
  if ($licenseVariant.Status -cne 'Imported' -or $licenseVariant.Id -cne 'studio.windows-contract-2') {
    throw 'A package with distinct LICENSE.txt content was incorrectly treated as a duplicate.'
  }
  if ((Read-DreamSkinUtf8File -Path (Join-Path $licenseVariant.Path 'LICENSE.txt')) -cne "MIT`r`n") {
    throw 'The distinct imported license content was not preserved.'
  }

  $firstSource = Join-Path $temporaryRoot 'first-source'
  $firstArchive = Join-Path $temporaryRoot 'first.zip'
  Write-TestThemePack -Directory $firstSource -Id 'import-test' -Name 'Imported Theme'
  New-TestZipFromDirectory -Source $firstSource -Archive $firstArchive
  $first = Import-DreamSkinThemeZip -ArchivePath $firstArchive -StateRoot $stateRoot
  if ($first.Status -cne 'Imported' -or $first.Id -cne 'import-test' -or $first.Renamed) {
    throw 'Valid root-level theme ZIP did not import with its requested id.'
  }
  if ((Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $paths.Active) -cne $activeBefore) {
    throw 'Theme ZIP import changed the active / last-known-good theme.'
  }

  $duplicateSource = Join-Path $temporaryRoot 'duplicate-source'
  $duplicateArchive = Join-Path $temporaryRoot 'duplicate.zip'
  Write-TestThemePack -Directory $duplicateSource -Id 'different-id' -Name 'Imported Theme'
  New-TestZipFromDirectory -Source $duplicateSource -Archive $duplicateArchive
  $duplicate = Import-DreamSkinThemeZip -ArchivePath $duplicateArchive -StateRoot $stateRoot
  if ($duplicate.Status -cne 'Duplicate' -or $duplicate.Id -cne 'import-test') {
    throw 'Semantic duplicate ZIP was written as another saved theme.'
  }

  $collisionSource = Join-Path $temporaryRoot 'collision-source'
  $collisionArchive = Join-Path $temporaryRoot 'collision.zip'
  Write-TestThemePack -Directory $collisionSource -Id 'import-test' -Name 'Second Theme'
  New-TestZipFromDirectory -Source $collisionSource -Archive $collisionArchive
  $collision = Import-DreamSkinThemeZip -ArchivePath $collisionArchive -StateRoot $stateRoot
  if ($collision.Status -cne 'Imported' -or $collision.Id -cne 'import-test-2' -or -not $collision.Renamed) {
    throw 'Conflicting theme id was not preserved under a clear unique id.'
  }

  $sameNameSource = Join-Path $temporaryRoot 'same-name-source'
  $sameNameArchive = Join-Path $temporaryRoot 'same-name.zip'
  Write-TestThemePack -Directory $sameNameSource -Id 'third-theme' -Name 'Imported Theme' -Quote 'OTHER CONTENT'
  New-TestZipFromDirectory -Source $sameNameSource -Archive $sameNameArchive
  $sameName = Import-DreamSkinThemeZip -ArchivePath $sameNameArchive -StateRoot $stateRoot
  if (-not $sameName.NameCollision) { throw 'Same-name theme import did not report the name collision.' }

  $wrappedRoot = Join-Path $temporaryRoot 'wrapped-source'
  $wrappedTheme = Join-Path $wrappedRoot 'theme-folder'
  $wrappedArchive = Join-Path $temporaryRoot 'wrapped.zip'
  Write-TestThemePack -Directory $wrappedTheme -Id 'wrapped-theme' -Name 'Wrapped Theme'
  New-TestZipFromDirectory -Source $wrappedRoot -Archive $wrappedArchive
  $wrapped = Import-DreamSkinThemeZip -ArchivePath $wrappedArchive -StateRoot $stateRoot
  if ($wrapped.Status -cne 'Imported' -or $wrapped.Id -cne 'wrapped-theme') {
    throw 'One-folder theme ZIP layout was not accepted.'
  }

  $legacyArchive = Join-Path $temporaryRoot 'legacy.dreamskin'
  Copy-Item -LiteralPath $firstArchive -Destination $legacyArchive
  Assert-TestImportRejected -Archive $legacyArchive -Label '.dreamskin extension'

  $traversalArchive = Join-Path $temporaryRoot 'traversal.zip'
  New-TestZipWithEntry -Archive $traversalArchive -EntryName '..\escape.txt'
  Assert-TestImportRejected -Archive $traversalArchive -Label 'path traversal'

  foreach ($reservedAlias in @(
    @{ Token = 'com-superscript-one'; Name = ('COM{0}.jpg' -f [char]0x00B9) },
    @{ Token = 'lpt-superscript-two'; Name = ('LPT{0}' -f [char]0x00B2) }
  )) {
    $reservedAliasArchive = Join-Path $temporaryRoot "$($reservedAlias.Token).zip"
    New-TestZipWithEntry -Archive $reservedAliasArchive -EntryName $reservedAlias.Name
    Assert-TestExpansionRejectedWithoutWrites -Archive $reservedAliasArchive -Label $reservedAlias.Token
    Assert-TestImportRejected -Archive $reservedAliasArchive -Label $reservedAlias.Token
  }

  $linkArchive = Join-Path $temporaryRoot 'link.zip'
  $linkAttributes = [System.BitConverter]::ToInt32(
    [System.BitConverter]::GetBytes([uint32]0xA1FF0000), 0
  )
  New-TestZipWithEntry -Archive $linkArchive -EntryName 'background.jpg' `
    -Content 'outside-target' -ExternalAttributes $linkAttributes
  Assert-TestImportRejected -Archive $linkArchive -Label 'Unix symbolic link'

  $reparseArchive = Join-Path $temporaryRoot 'reparse.zip'
  $reparseAttributes = [System.BitConverter]::ToInt32(
    [System.BitConverter]::GetBytes([uint32]0x81A40400), 0
  )
  New-TestZipWithEntry -Archive $reparseArchive -EntryName 'background.jpg' `
    -Content 'reparse-target' -ExternalAttributes $reparseAttributes
  Assert-TestImportRejected -Archive $reparseArchive -Label 'Windows reparse entry'

  $nestedArchive = Join-Path $temporaryRoot 'nested.zip'
  New-TestZipWithEntry -Archive $nestedArchive -EntryName 'inner.zip'
  Assert-TestImportRejected -Archive $nestedArchive -Label 'nested compressed archive'

  $largeSource = Join-Path $temporaryRoot 'large-source'
  New-Item -ItemType Directory -Path $largeSource | Out-Null
  [System.IO.File]::WriteAllText(
    (Join-Path $largeSource 'theme.json'),
    '{"schemaVersion":1,"id":"large","image":"background.jpg"}',
    [System.Text.UTF8Encoding]::new($false)
  )
  $largeImageStream = [System.IO.File]::Open(
    (Join-Path $largeSource 'background.jpg'),
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write
  )
  try { $largeImageStream.SetLength(65MB) } finally { $largeImageStream.Dispose() }
  $largeArchive = Join-Path $temporaryRoot 'large.zip'
  New-TestZipFromDirectory -Source $largeSource -Archive $largeArchive
  Assert-TestImportRejected -Archive $largeArchive -Label 'expanded-size abuse'

  $countSource = Join-Path $temporaryRoot 'count-source'
  New-Item -ItemType Directory -Path $countSource | Out-Null
  foreach ($index in 1..33) {
    [System.IO.File]::WriteAllText((Join-Path $countSource "file-$index.txt"), "$index")
  }
  $countArchive = Join-Path $temporaryRoot 'count.zip'
  New-TestZipFromDirectory -Source $countSource -Archive $countArchive
  Assert-TestImportRejected -Archive $countArchive -Label 'entry-count abuse'

  $badSchemaSource = Join-Path $temporaryRoot 'bad-schema-source'
  $badSchemaArchive = Join-Path $temporaryRoot 'bad-schema.zip'
  Write-TestThemePack -Directory $badSchemaSource -Id 'bad-schema' -Name 'Bad Schema'
  $badTheme = (Read-DreamSkinUtf8File -Path (Join-Path $badSchemaSource 'theme.json')) | ConvertFrom-Json
  $badTheme.schemaVersion = 2
  [System.IO.File]::WriteAllText(
    (Join-Path $badSchemaSource 'theme.json'),
    (($badTheme | ConvertTo-Json -Depth 8) + "`r`n"),
    [System.Text.UTF8Encoding]::new($false)
  )
  New-TestZipFromDirectory -Source $badSchemaSource -Archive $badSchemaArchive
  Assert-TestImportRejected -Archive $badSchemaArchive -Label 'unsupported schema'

  $manualDirectory = Join-Path $paths.Saved 'manual-theme'
  Copy-Item -LiteralPath $firstSource -Destination $manualDirectory -Recurse
  if (@(Get-DreamSkinSavedThemes -StateRoot $stateRoot | Where-Object { $_.Path -ceq $manualDirectory }).Count -ne 1) {
    throw 'A manually moved extracted theme directory was not discovered.'
  }

  if ((Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $paths.Active) -cne $activeBefore) {
    throw 'Rejected or saved ZIP imports changed the active theme.'
  }
  Write-Host 'PASS: Windows ZIP import is contained, bounded, atomic, deduplicated, and active-theme neutral.'
} finally {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
