[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts\common-windows.ps1')
. (Join-Path $Root 'scripts\theme-windows.ps1')
Add-Type -AssemblyName System.IO.Compression -ErrorAction Stop
Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop

# A runtime failure injection is not deterministic across PowerShell 5.1 file
# providers. Keep this source-order guard as a portable regression: the old
# canonical backup must survive until the newly published semantic fingerprint
# has been calculated and compared.
$themeStoreSource = [System.IO.File]::ReadAllText((Join-Path $Root 'scripts\theme-windows.ps1'))
$publishedFingerprintIndex = $themeStoreSource.IndexOf(
  '$publishedFingerprint = Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $destination',
  [System.StringComparison]::Ordinal
)
$publishedMismatchIndex = $themeStoreSource.IndexOf(
  "if (`$publishedFingerprint -cne `$fingerprint) {",
  [System.StringComparison]::Ordinal
)
$canonicalBackupCleanupIndex = $themeStoreSource.IndexOf(
  'Remove-DreamSkinManagedDirectoryVerified -Path $backup -Root $paths.Root',
  [System.StringComparison]::Ordinal
)
$journalPersistenceIndex = $themeStoreSource.IndexOf(
  'Write-DreamSkinThemeReplacementJournal -Paths $paths',
  [System.StringComparison]::Ordinal
)
$firstCanonicalMoveIndex = $themeStoreSource.IndexOf(
  '[System.IO.Directory]::Move($destination, $backup)',
  [System.StringComparison]::Ordinal
)
$commitMarkerIndex = $themeStoreSource.IndexOf(
  'Write-DreamSkinThemeReplacementCommitMarker -Transaction $replacementTransaction',
  [System.StringComparison]::Ordinal
)
if ($publishedFingerprintIndex -lt 0 -or $publishedMismatchIndex -le $publishedFingerprintIndex -or
  $journalPersistenceIndex -lt 0 -or $firstCanonicalMoveIndex -le $journalPersistenceIndex -or
  $commitMarkerIndex -le $publishedMismatchIndex -or
  $canonicalBackupCleanupIndex -le $commitMarkerIndex) {
  throw 'Windows import can discard the canonical backup before final published-fingerprint validation.'
}

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
  [System.IO.File]::WriteAllText(
    (Join-Path $Directory 'theme.css'),
    '[data-ds-part="root"] { color: var(--ds-theme-color-text); }' + "`r`n",
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Write-TestFallbackIdThemePack {
  param(
    [Parameter(Mandatory = $true)][string]$Directory,
    [Parameter(Mandatory = $true)][ValidateSet('Missing', 'NonString')][string]$IdKind
  )
  New-Item -ItemType Directory -Path $Directory -Force | Out-Null
  $projectRoot = Split-Path -Parent $Root
  Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\images\gallery\skin-01.jpg') `
    -Destination (Join-Path $Directory 'background.jpg') -Force
  $theme = [ordered]@{
    schemaVersion = 1
    name = "Cross-platform & ' Fallback ID"
    image = 'background.jpg'
    appearance = 'auto'
    art = [ordered]@{ focusX = 1e-7; safeArea = 'auto'; taskMode = 'auto' }
    quote = 'CROSS PLATFORM FALLBACK'
  }
  if ($IdKind -ceq 'NonString') { $theme.Insert(1, 'id', 42) }
  [System.IO.File]::WriteAllText(
    (Join-Path $Directory 'theme.json'),
    (($theme | ConvertTo-Json -Depth 8) + "`n"),
    [System.Text.UTF8Encoding]::new($false)
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $Directory 'theme.css'),
    '[data-ds-part="root"] { color: var(--ds-theme-color-text); }' + "`n",
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
  $cssPath = Join-Path $Directory 'theme.css'
  [System.IO.File]::WriteAllText(
    $cssPath,
    '[data-ds-part="composer"] { background-color: var(--ds-theme-color-panel); }' + "`r`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  $files += [ordered]@{
    path = 'theme.css'; mediaType = 'text/css'; bytes = (Get-Item -LiteralPath $cssPath).Length
    sha256 = (Get-FileHash -LiteralPath $cssPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $capabilities += 'safe-css'
  if ($IncludeOptionalFiles) {
    $licensePath = Join-Path $Directory 'LICENSE.txt'
    [System.IO.File]::WriteAllText($licensePath, $LicenseText, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $Directory 'manifest.sig'), 'reserved-signature', [System.Text.UTF8Encoding]::new($false))
    $files += [ordered]@{
      path = 'LICENSE.txt'; mediaType = 'text/plain'; bytes = (Get-Item -LiteralPath $licensePath).Length
      sha256 = (Get-FileHash -LiteralPath $licensePath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
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

function New-TestReplacementJournal {
  param(
    [Parameter(Mandatory = $true)]$Paths,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$Stage,
    [Parameter(Mandatory = $true)][string]$OldFingerprint,
    [Parameter(Mandatory = $true)][string]$NewFingerprint,
    [ValidateSet('prepared', 'old-moved', 'new-published', 'committed')][string]$Phase = 'prepared',
    [switch]$CommitMarker
  )
  $token = [guid]::NewGuid().ToString('N')
  $backupName = '.theme-replace-' + $token
  $backup = Join-Path $Paths.Saved $backupName
  $journalPath = Join-Path $Paths.Saved ($backupName + '.json')
  $journal = [pscustomobject][ordered]@{
    schema = 'dreamskin-theme-replacement/1'
    destinationName = [System.IO.Path]::GetFileName($Destination)
    backupName = $backupName
    stageName = [System.IO.Path]::GetFileName($Stage)
    oldFingerprint = $OldFingerprint
    newFingerprint = $NewFingerprint
    phase = $Phase
  }
  Write-DreamSkinThemeReplacementJournal -Paths $Paths `
    -JournalPath $journalPath -Journal $journal
  $transaction = Read-DreamSkinThemeReplacementJournal `
    -Paths $Paths -JournalPath $journalPath
  if ($CommitMarker) {
    if ($Phase -cne 'committed') {
      throw 'A test commit marker requires the committed journal phase.'
    }
    Write-DreamSkinThemeReplacementCommitMarker -Transaction $transaction
  }
  return $transaction
}

function ConvertTo-TestPowerShellLiteral {
  param([Parameter(Mandatory = $true)][string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
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

function Assert-TestIdentityImportRejected {
  param(
    [Parameter(Mandatory = $true)][string]$Archive,
    [Parameter(Mandatory = $true)][int64]$ExpectedBytes,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $savedBefore = @(Get-ChildItem -LiteralPath $paths.Saved -Directory -Force -ErrorAction Stop |
    ForEach-Object Name | Sort-Object)
  $rejected = $false
  try {
    $null = Import-DreamSkinThemeZip -ArchivePath $Archive -StateRoot $stateRoot `
      -ExpectedArchiveBytes $ExpectedBytes -ExpectedArchiveSha256 $ExpectedSha256
  } catch {
    $rejected = $true
  }
  if (-not $rejected) { throw "Theme ZIP identity unexpectedly accepted $Label." }
  $savedAfter = @(Get-ChildItem -LiteralPath $paths.Saved -Directory -Force -ErrorAction Stop |
    ForEach-Object Name | Sort-Object)
  if ((Compare-Object -ReferenceObject $savedBefore -DifferenceObject $savedAfter).Count -ne 0) {
    throw "Rejected theme ZIP identity published saved-theme content for $Label."
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
  $officialArchiveBytes = (Get-Item -LiteralPath $officialArchive -Force).Length
  $officialArchiveSha256 = (Get-FileHash -LiteralPath $officialArchive -Algorithm SHA256).Hash.ToLowerInvariant()
  $official = Import-DreamSkinThemeZip -ArchivePath $officialArchive -StateRoot $stateRoot `
    -ExpectedArchiveBytes $officialArchiveBytes -ExpectedArchiveSha256 $officialArchiveSha256
  $officialRuntimeFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint `
    -ThemeDirectory $official.Path
  if ($official.Status -cne 'Imported' -or $official.Id -cne 'studio.windows-contract' -or
    $official.PackageFormat -cne 'official' -or $official.SafeCssStatus -cne 'validated' -or
    -not $official.SignatureIgnored -or $official.ContentFingerprint -cnotmatch '^[a-f0-9]{64}$' -or
    $official.ContentFingerprint -cne $officialRuntimeFingerprint) {
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
  $officialDuplicate = Import-DreamSkinThemeZip -ArchivePath $officialArchive -StateRoot $stateRoot `
    -ExpectedArchiveBytes $officialArchiveBytes -ExpectedArchiveSha256 $officialArchiveSha256
  if ($officialDuplicate.Status -cne 'Duplicate' -or
    $officialDuplicate.Id -cne 'studio.windows-contract' -or
    $officialDuplicate.ContentFingerprint -cne $official.ContentFingerprint) {
    throw 'Studio manifest ZIP duplicate was written twice.'
  }

  $roundtripStateRoot = Join-Path $temporaryRoot 'runtime-fingerprint-roundtrip-state'
  $roundtripPaths = Initialize-DreamSkinThemeStore -SkillRoot $Root `
    -StateRoot $roundtripStateRoot
  $officialSaved = Read-DreamSkinTheme -ThemeDirectory $official.Path
  if (-not $officialSaved.Theme.PSObject.Properties['colors'] -or
    $officialSaved.Theme.PSObject.Properties['palette']) {
    throw 'Studio colors-only theme was not preserved as the current community theme contract.'
  }
  $officialTheme = $officialSaved.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $null = Set-DreamSkinActiveTheme -ImagePath $officialSaved.ImagePath `
    -Theme $officialTheme -SafeCssPath (Join-Path $official.Path 'theme.css') `
    -StateRoot $roundtripStateRoot
  $roundtripActive = Read-DreamSkinTheme -ThemeDirectory $roundtripPaths.Active
  if (-not $roundtripActive.Theme.PSObject.Properties['colors'] -or
    $roundtripActive.Theme.PSObject.Properties['palette']) {
    throw 'Applying a Studio colors-only theme added a legacy palette field.'
  }
  $roundtripFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint `
    -ThemeDirectory $roundtripPaths.Active
  if ($roundtripFingerprint -cne $official.ContentFingerprint) {
    throw 'Active-theme image renaming changed the imported runtime content fingerprint.'
  }

  $replacementSource = Join-Path $temporaryRoot 'identity-replacement-source'
  $replacementArchive = Join-Path $temporaryRoot 'identity-replacement.zip'
  Write-TestOfficialThemePack -Directory $replacementSource -Id 'identity-replacement' `
    -Name 'Identity Replacement'
  New-TestZipFromDirectory -Source $replacementSource -Archive $replacementArchive
  $replacedArchive = Join-Path $temporaryRoot 'replaced-after-approval.zip'
  Copy-Item -LiteralPath $replacementArchive -Destination $replacedArchive -Force
  Assert-TestIdentityImportRejected -Archive $replacedArchive `
    -ExpectedBytes $officialArchiveBytes -ExpectedSha256 $officialArchiveSha256 `
    -Label 'a different package at the approved path'

  $partialArchive = Join-Path $temporaryRoot 'partial-approved-package.zip'
  Copy-Item -LiteralPath $officialArchive -Destination $partialArchive -Force
  $partialStream = [System.IO.File]::Open(
    $partialArchive,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  try {
    $partialStream.SetLength([Math]::Max(1, [int64]($officialArchiveBytes / 2)))
  } finally {
    $partialStream.Dispose()
  }
  Assert-TestIdentityImportRejected -Archive $partialArchive `
    -ExpectedBytes $officialArchiveBytes -ExpectedSha256 $officialArchiveSha256 `
    -Label 'a partially written approved package'

  Assert-TestIdentityImportRejected -Archive $officialArchive `
    -ExpectedBytes $officialArchiveBytes -ExpectedSha256 ('b' * 64) `
    -Label 'an incorrect approved SHA-256'

  $officialWithoutCssSource = Join-Path $temporaryRoot 'official-without-css-source'
  $officialWithoutCssArchive = Join-Path $temporaryRoot 'official-without-css.zip'
  Copy-Item -LiteralPath $officialSource -Destination $officialWithoutCssSource -Recurse
  Remove-Item -LiteralPath (Join-Path $officialWithoutCssSource 'theme.css') -Force
  New-TestZipFromDirectory -Source $officialWithoutCssSource -Archive $officialWithoutCssArchive
  Assert-TestImportRejected -Archive $officialWithoutCssArchive -Label 'official package without theme.css'

  $simpleWithoutCssSource = Join-Path $temporaryRoot 'simple-without-css-source'
  $simpleWithoutCssArchive = Join-Path $temporaryRoot 'simple-without-css.zip'
  Write-TestThemePack -Directory $simpleWithoutCssSource -Id 'simple-without-css' -Name 'No CSS'
  Remove-Item -LiteralPath (Join-Path $simpleWithoutCssSource 'theme.css') -Force
  New-TestZipFromDirectory -Source $simpleWithoutCssSource -Archive $simpleWithoutCssArchive
  Assert-TestImportRejected -Archive $simpleWithoutCssArchive -Label 'simplified package without theme.css'

  $missingIdSource = Join-Path $temporaryRoot 'missing-id-source'
  $missingIdArchive = Join-Path $temporaryRoot 'missing-id.zip'
  Write-TestFallbackIdThemePack -Directory $missingIdSource -IdKind Missing
  New-TestZipFromDirectory -Source $missingIdSource -Archive $missingIdArchive
  $missingId = Import-DreamSkinThemeZip -ArchivePath $missingIdArchive -StateRoot $stateRoot
  if ($missingId.Status -cne 'Imported' -or
    $missingId.Id -cne 'import-b009c788e6a9307c35ed281e' -or -not $missingId.Renamed) {
    throw 'A missing source theme id did not use the stable cross-platform semantic fallback id.'
  }

  $nonStringIdSource = Join-Path $temporaryRoot 'non-string-id-source'
  $nonStringIdArchive = Join-Path $temporaryRoot 'non-string-id.zip'
  Write-TestFallbackIdThemePack -Directory $nonStringIdSource -IdKind NonString
  New-TestZipFromDirectory -Source $nonStringIdSource -Archive $nonStringIdArchive
  $nonStringId = Import-DreamSkinThemeZip `
    -ArchivePath $nonStringIdArchive -StateRoot $stateRoot
  if ($nonStringId.Status -cne 'Duplicate' -or $nonStringId.Id -cne $missingId.Id) {
    throw 'A non-string source theme id diverged from the stable cross-platform semantic fallback id.'
  }

  foreach ($reservedId in @(
    'con.theme',
    'aux',
    'com1.theme',
    'lpt1.skin'
  )) {
    $reservedToken = $reservedId.Replace('.', '-')
    $reservedSource = Join-Path $temporaryRoot "official-reserved-$reservedToken-source"
    $reservedArchive = Join-Path $temporaryRoot "official-reserved-$reservedToken.zip"
    Write-TestOfficialThemePack -Directory $reservedSource -Id $reservedId `
      -Name "Reserved Windows ID $reservedId"
    New-TestZipFromDirectory -Source $reservedSource -Archive $reservedArchive
    $reserved = Import-DreamSkinThemeZip -ArchivePath $reservedArchive -StateRoot $stateRoot
    if ($reserved.Status -cne 'Imported' -or
      $reserved.Id -cnotmatch '^import-[0-9a-f]{24}$' -or
      -not $reserved.Renamed -or
      [System.IO.Path]::GetFileName($reserved.Path) -cne $reserved.Id) {
      throw "Studio theme id $reservedId was not mapped to a safe Windows directory id."
    }
    if ($reservedId -ceq 'con.theme' -and
      $reserved.Id -cne 'import-931599c2985393be807cf0ed') {
      throw 'The con.theme Windows-safe id mapping changed from its stable vector.'
    }
    $reservedDuplicate = Import-DreamSkinThemeZip -ArchivePath $reservedArchive -StateRoot $stateRoot
    if ($reservedDuplicate.Status -cne 'Duplicate' -or $reservedDuplicate.Id -cne $reserved.Id) {
      throw "Studio theme id $reservedId was duplicated after its safe Windows id mapping."
    }
    if ($reservedId -ceq 'con.theme') {
      $reservedUpdateSource = Join-Path $temporaryRoot 'official-reserved-con-theme-update-source'
      $reservedUpdateArchive = Join-Path $temporaryRoot 'official-reserved-con-theme-update.zip'
      Write-TestOfficialThemePack -Directory $reservedUpdateSource -Id $reservedId `
        -Name 'Reserved Windows ID con.theme updated'
      New-TestZipFromDirectory -Source $reservedUpdateSource -Archive $reservedUpdateArchive
      $reservedUpdate = Import-DreamSkinThemeZip -ArchivePath $reservedUpdateArchive -StateRoot $stateRoot
      if ($reservedUpdate.Status -cne 'Imported' -or -not $reservedUpdate.Replaced -or
        $reservedUpdate.Id -cne $reserved.Id) {
        throw 'A newer Windows-reserved source theme id was not updated in place.'
      }
    }
  }

  $licenseVariantSource = Join-Path $temporaryRoot 'official-license-variant-source'
  $licenseVariantArchive = Join-Path $temporaryRoot 'official-license-variant.zip'
  Write-TestOfficialThemePack -Directory $licenseVariantSource -Id 'studio.windows-contract' `
    -Name 'Studio Windows Contract' -IncludeOptionalFiles -LicenseText "MIT`r`n"
  New-TestZipFromDirectory -Source $licenseVariantSource -Archive $licenseVariantArchive
  $licenseVariant = Import-DreamSkinThemeZip -ArchivePath $licenseVariantArchive -StateRoot $stateRoot
  if ($licenseVariant.Status -cne 'Imported' -or $licenseVariant.Id -cne 'studio.windows-contract' -or
    -not $licenseVariant.Replaced) {
    throw 'A package with distinct LICENSE.txt content did not replace the saved theme with the same id.'
  }
  if ((Read-DreamSkinUtf8File -Path (Join-Path $licenseVariant.Path 'LICENSE.txt')) -cne "MIT`r`n") {
    throw 'The distinct imported license content was not preserved.'
  }

  $firstSource = Join-Path $temporaryRoot 'first-source'
  $firstArchive = Join-Path $temporaryRoot 'first.zip'
  Write-TestThemePack -Directory $firstSource -Id 'import-test' -Name 'Imported Theme'
  New-TestZipFromDirectory -Source $firstSource -Archive $firstArchive
  $first = Import-DreamSkinThemeZip -ArchivePath $firstArchive -StateRoot $stateRoot
  if ($first.Status -cne 'Imported' -or $first.Id -cne 'import-test' -or $first.Renamed -or
    $first.SafeCssStatus -cne 'validated') {
    throw 'Valid root-level theme ZIP did not import with its requested id.'
  }
  $firstFingerprint = Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $first.Path
  Assert-DreamSkinRestoredThemeFingerprint -Path $first.Path `
    -ExpectedFingerprint $firstFingerprint -Label 'Fingerprint fixture'
  $fingerprintMismatchRejected = $false
  try {
    Assert-DreamSkinRestoredThemeFingerprint -Path $first.Path `
      -ExpectedFingerprint ('0' * 64) -Label 'Fingerprint fixture'
  } catch {
    $fingerprintMismatchRejected = "$($_.Exception.Message)" -match 'pre-import record'
  }
  if (-not $fingerprintMismatchRejected) {
    throw 'Restored-theme verification accepted content that did not match its pre-import fingerprint.'
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
  if ($collision.Status -cne 'Imported' -or $collision.Id -cne 'import-test' -or
    $collision.Renamed -or -not $collision.Replaced) {
    throw 'Same-id theme update was not imported by replacing the saved theme.'
  }

  $sameNameSource = Join-Path $temporaryRoot 'same-name-source'
  $sameNameArchive = Join-Path $temporaryRoot 'same-name.zip'
  Write-TestThemePack -Directory $sameNameSource -Id 'third-theme' -Name 'Second Theme' -Quote 'OTHER CONTENT'
  New-TestZipFromDirectory -Source $sameNameSource -Archive $sameNameArchive
  $sameName = Import-DreamSkinThemeZip -ArchivePath $sameNameArchive -StateRoot $stateRoot
  if (-not $sameName.NameCollision) { throw 'Same-name theme import did not report the name collision.' }

  $replacementNameCollisionSource = Join-Path $temporaryRoot 'replacement-name-collision-source'
  $replacementNameCollisionArchive = Join-Path $temporaryRoot 'replacement-name-collision.zip'
  Write-TestThemePack -Directory $replacementNameCollisionSource -Id 'import-test' `
    -Name 'Second Theme' -Quote 'REPLACEMENT COLLIDES WITH THIRD'
  New-TestZipFromDirectory -Source $replacementNameCollisionSource -Archive $replacementNameCollisionArchive
  $replacementNameCollision = Import-DreamSkinThemeZip `
    -ArchivePath $replacementNameCollisionArchive -StateRoot $stateRoot
  if ($replacementNameCollision.Status -cne 'Imported' -or $replacementNameCollision.Id -cne 'import-test' -or
    -not $replacementNameCollision.Replaced -or -not $replacementNameCollision.NameCollision) {
    throw 'Same-id replacement did not preserve same-name collision reporting.'
  }

  $legacyExactDirectory = Join-Path $paths.Saved 'import-test-2'
  Write-TestThemePack -Directory $legacyExactDirectory -Id 'import-test-2' `
    -Name 'Legacy Exact' -Quote 'LEGACY EXACT CONTENT'
  $legacyExactSource = Join-Path $temporaryRoot 'legacy-exact-source'
  $legacyExactArchive = Join-Path $temporaryRoot 'legacy-exact.zip'
  Write-TestThemePack -Directory $legacyExactSource -Id 'import-test' `
    -Name 'Legacy Exact' -Quote 'LEGACY EXACT CONTENT'
  New-TestZipFromDirectory -Source $legacyExactSource -Archive $legacyExactArchive
  $legacyExact = Import-DreamSkinThemeZip -ArchivePath $legacyExactArchive -StateRoot $stateRoot
  if ($legacyExact.Status -cne 'Imported' -or $legacyExact.Id -cne 'import-test' -or
    -not $legacyExact.Replaced -or (Test-Path -LiteralPath $legacyExactDirectory)) {
    throw 'Legacy same-base suffix duplicate was not consolidated into the canonical theme id.'
  }
  $canonicalLegacyTheme = Read-DreamSkinTheme -ThemeDirectory (Join-Path $paths.Saved 'import-test') -SkipImageMetadata
  if ("$($canonicalLegacyTheme.Theme.name)" -cne 'Legacy Exact') {
    throw 'Legacy exact suffix repair did not publish the canonical replacement content.'
  }

  # Re-importing an exact package must still consolidate a pre-existing
  # canonical/legacy pair; an early duplicate return would leave both dirs.
  $legacyReimportDirectory = Join-Path $paths.Saved 'legacy-reimport'
  $legacyReimportSuffixDirectory = Join-Path $paths.Saved 'legacy-reimport-2'
  Write-TestThemePack -Directory $legacyReimportDirectory -Id 'legacy-reimport' `
    -Name 'Legacy Re-import' -Quote 'LEGACY REIMPORT CONTENT'
  Write-TestThemePack -Directory $legacyReimportSuffixDirectory -Id 'legacy-reimport-2' `
    -Name 'Legacy Re-import' -Quote 'LEGACY REIMPORT CONTENT'
  $legacyReimportSource = Join-Path $temporaryRoot 'legacy-reimport-source'
  $legacyReimportArchive = Join-Path $temporaryRoot 'legacy-reimport.zip'
  Write-TestThemePack -Directory $legacyReimportSource -Id 'legacy-reimport' `
    -Name 'Legacy Re-import' -Quote 'LEGACY REIMPORT CONTENT'
  New-TestZipFromDirectory -Source $legacyReimportSource -Archive $legacyReimportArchive
  $legacyReimport = Import-DreamSkinThemeZip -ArchivePath $legacyReimportArchive -StateRoot $stateRoot
  if ($legacyReimport.Status -cne 'Imported' -or $legacyReimport.Id -cne 'legacy-reimport' -or
    -not $legacyReimport.Replaced -or (Test-Path -LiteralPath $legacyReimportSuffixDirectory)) {
    throw 'An exact canonical/legacy pair returned duplicate instead of consolidating the canonical theme.'
  }
  $legacyReimportCanonical = Read-DreamSkinTheme -ThemeDirectory $legacyReimportDirectory -SkipImageMetadata
  if ("$($legacyReimportCanonical.Theme.id)" -cne 'legacy-reimport') {
    throw 'Exact legacy consolidation did not preserve the canonical internal theme id.'
  }
  $legacyReimportResidue = @(Get-ChildItem -LiteralPath $paths.Saved -Force -ErrorAction Stop |
    Where-Object { $_.Name -match '^\.theme-(?:failed|import-|legacy-cleanup-|replace-)' })
  if ($legacyReimportResidue.Count -gt 0) {
    throw 'Exact canonical/legacy consolidation left hidden transaction directories.'
  }

  $legacyExtraDirectory = Join-Path $paths.Saved 'legacy-extra-2'
  Write-TestThemePack -Directory $legacyExtraDirectory -Id 'legacy-extra-2' `
    -Name 'Legacy Extra' -Quote 'LEGACY EXTRA CONTENT'
  [System.IO.File]::WriteAllText(
    (Join-Path $legacyExtraDirectory 'KEEP.txt'),
    "preserve this independent file`r`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  $legacyExtraSource = Join-Path $temporaryRoot 'legacy-extra-source'
  $legacyExtraArchive = Join-Path $temporaryRoot 'legacy-extra.zip'
  Write-TestThemePack -Directory $legacyExtraSource -Id 'legacy-extra' `
    -Name 'Legacy Extra' -Quote 'LEGACY EXTRA CONTENT'
  New-TestZipFromDirectory -Source $legacyExtraSource -Archive $legacyExtraArchive
  $legacyExtra = Import-DreamSkinThemeZip -ArchivePath $legacyExtraArchive -StateRoot $stateRoot
  if ($legacyExtra.Status -cne 'Imported' -or
    -not (Test-Path -LiteralPath (Join-Path $legacyExtraDirectory 'KEEP.txt') -PathType Leaf)) {
    throw 'A suffix directory with extra content was incorrectly consolidated.'
  }

  $unrelatedSuffixDirectory = Join-Path $paths.Saved 'import-test-2'
  Write-TestThemePack -Directory $unrelatedSuffixDirectory -Id 'unrelated-theme' `
    -Name 'Unrelated Suffix' -Quote 'UNRELATED SUFFIX CONTENT'
  $independentNumericIdDirectory = Join-Path $paths.Saved 'import-test-3'
  Write-TestThemePack -Directory $independentNumericIdDirectory -Id 'import-test-3' `
    -Name 'Preserve Canonical' -Quote 'INDEPENDENT NUMERIC ID CONTENT'
  $preserveSuffixSource = Join-Path $temporaryRoot 'preserve-unrelated-suffix-source'
  $preserveSuffixArchive = Join-Path $temporaryRoot 'preserve-unrelated-suffix.zip'
  Write-TestThemePack -Directory $preserveSuffixSource -Id 'import-test' `
    -Name 'Preserve Canonical' -Quote 'PRESERVE UNRELATED SUFFIX'
  New-TestZipFromDirectory -Source $preserveSuffixSource -Archive $preserveSuffixArchive
  $preserveSuffix = Import-DreamSkinThemeZip -ArchivePath $preserveSuffixArchive -StateRoot $stateRoot
  if ($preserveSuffix.Status -cne 'Imported' -or $preserveSuffix.Id -cne 'import-test' -or
    -not (Test-Path -LiteralPath $unrelatedSuffixDirectory)) {
    throw 'Unrelated suffix-like saved theme was incorrectly removed.'
  }
  $unrelatedSuffix = Read-DreamSkinTheme -ThemeDirectory $unrelatedSuffixDirectory -SkipImageMetadata
  if ("$($unrelatedSuffix.Theme.id)" -cne 'unrelated-theme') {
    throw 'Unrelated suffix-like saved theme identity changed during canonical replacement.'
  }
  $independentNumericId = Read-DreamSkinTheme `
    -ThemeDirectory $independentNumericIdDirectory -SkipImageMetadata
  if ("$($independentNumericId.Theme.id)" -cne 'import-test-3') {
    throw 'A legitimate numeric-suffix theme with unrelated content but the same name was removed or changed.'
  }

  $longBaseId = ('l' * 80)
  $longLegacyId = $longBaseId.Substring(0, 78) + '-2'
  $longLegacyDirectory = Join-Path $paths.Saved $longLegacyId
  Write-TestThemePack -Directory $longLegacyDirectory -Id $longLegacyId `
    -Name 'Long Legacy' -Quote 'LONG LEGACY CONTENT'
  $longLegacySource = Join-Path $temporaryRoot 'long-legacy-source'
  $longLegacyArchive = Join-Path $temporaryRoot 'long-legacy.zip'
  Write-TestThemePack -Directory $longLegacySource -Id $longBaseId `
    -Name 'Long Legacy' -Quote 'LONG LEGACY CONTENT'
  New-TestZipFromDirectory -Source $longLegacySource -Archive $longLegacyArchive
  $longLegacy = Import-DreamSkinThemeZip -ArchivePath $longLegacyArchive -StateRoot $stateRoot
  if ($longLegacy.Status -cne 'Imported' -or $longLegacy.Id -cne $longBaseId -or
    (Test-Path -LiteralPath $longLegacyDirectory)) {
    throw 'An 80-character legacy suffix duplicate was not consolidated safely.'
  }

  $ambiguousDirectory = Join-Path $paths.Saved 'ambiguous-id'
  Write-TestThemePack -Directory $ambiguousDirectory -Id 'different-internal-id' `
    -Name 'Ambiguous Canonical' -Quote 'AMBIGUOUS CANONICAL'
  $ambiguousSource = Join-Path $temporaryRoot 'ambiguous-replacement-source'
  $ambiguousArchive = Join-Path $temporaryRoot 'ambiguous-replacement.zip'
  Write-TestThemePack -Directory $ambiguousSource -Id 'ambiguous-id' `
    -Name 'Should Not Replace' -Quote 'AMBIGUOUS REPLACEMENT'
  New-TestZipFromDirectory -Source $ambiguousSource -Archive $ambiguousArchive
  $ambiguousRejected = $false
  try {
    $null = Import-DreamSkinThemeZip -ArchivePath $ambiguousArchive -StateRoot $stateRoot
  } catch {
    $ambiguousRejected = "$($_.Exception.Message)" -match 'Existing saved theme identity could not be confirmed'
  }
  if (-not $ambiguousRejected) { throw 'Ambiguous canonical saved-theme identity was not rejected.' }
  $ambiguousTheme = Read-DreamSkinTheme -ThemeDirectory $ambiguousDirectory -SkipImageMetadata
  if ("$($ambiguousTheme.Theme.id)" -cne 'different-internal-id') {
    throw 'Ambiguous canonical rejection did not preserve the old saved theme.'
  }

  $fileCollisionPath = Join-Path $paths.Saved 'file-collision'
  [System.IO.File]::WriteAllText($fileCollisionPath, 'keep-file')
  $fileCollisionSource = Join-Path $temporaryRoot 'file-collision-source'
  $fileCollisionArchive = Join-Path $temporaryRoot 'file-collision.zip'
  Write-TestThemePack -Directory $fileCollisionSource -Id 'file-collision' `
    -Name 'File Collision' -Quote 'FILE COLLISION'
  New-TestZipFromDirectory -Source $fileCollisionSource -Archive $fileCollisionArchive
  $fileCollisionRejected = $false
  try {
    $null = Import-DreamSkinThemeZip -ArchivePath $fileCollisionArchive -StateRoot $stateRoot
  } catch {
    $fileCollisionRejected = "$($_.Exception.Message)" -match 'not a directory'
  }
  if (-not $fileCollisionRejected -or
    [System.IO.File]::ReadAllText($fileCollisionPath) -cne 'keep-file') {
    throw 'A file occupying the canonical theme path was not preserved and rejected.'
  }
  if (Test-Path -LiteralPath (Join-Path $paths.Saved 'file-collision-2')) {
    throw 'A canonical file collision incorrectly allocated a suffixed saved-theme directory.'
  }
  $fileCollisionResidue = @(Get-ChildItem -LiteralPath $paths.Saved -Force -ErrorAction Stop |
    Where-Object { $_.Name -like '.theme-*file-collision*' })
  if ($fileCollisionResidue.Count -gt 0) {
    throw 'A canonical file collision left hidden import or replacement state.'
  }

  $rollbackSourceA = Join-Path $temporaryRoot 'rollback-source-a'
  $rollbackSourceB = Join-Path $temporaryRoot 'rollback-source-b'
  $rollbackArchiveA = Join-Path $temporaryRoot 'rollback-a.zip'
  $rollbackArchiveB = Join-Path $temporaryRoot 'rollback-b.zip'
  Write-TestThemePack -Directory $rollbackSourceA -Id 'rollback-id' `
    -Name 'Rollback Theme' -Quote 'ROLLBACK A'
  Write-TestThemePack -Directory $rollbackSourceB -Id 'rollback-id' `
    -Name 'Rollback Theme' -Quote 'ROLLBACK B'
  New-TestZipFromDirectory -Source $rollbackSourceA -Archive $rollbackArchiveA
  New-TestZipFromDirectory -Source $rollbackSourceB -Archive $rollbackArchiveB
  $rollbackFirst = Import-DreamSkinThemeZip -ArchivePath $rollbackArchiveA -StateRoot $stateRoot
  $rollbackFingerprintBefore = Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $rollbackFirst.Path
  $rollbackFilesBefore = @(Get-ChildItem -LiteralPath $rollbackFirst.Path -File | Sort-Object Name |
    ForEach-Object { "$($_.Name):$($_.Length):$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)" })
  $activeBeforeRollback = Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $paths.Active
  $script:RollbackOriginalFingerprint = (Get-Item Function:\Get-DreamSkinThemeSemanticFingerprint).ScriptBlock
  $script:RollbackCanonical = [System.IO.Path]::GetFullPath($rollbackFirst.Path)
  $script:RollbackInjectionHit = $false
  function Get-DreamSkinThemeSemanticFingerprint {
    param([Parameter(Mandatory = $true)][string]$ThemeDirectory)
    $full = [System.IO.Path]::GetFullPath($ThemeDirectory)
    $actual = & $script:RollbackOriginalFingerprint -ThemeDirectory $full
    if (-not $script:RollbackInjectionHit -and
      $full.Equals($script:RollbackCanonical, [System.StringComparison]::OrdinalIgnoreCase)) {
      $loaded = Read-DreamSkinTheme -ThemeDirectory $full -SkipImageMetadata
      if ("$($loaded.Theme.quote)" -ceq 'ROLLBACK B') {
        $script:RollbackInjectionHit = $true
        return ('0' * 64)
      }
    }
    return $actual
  }
  $rollbackRejected = $false
  try {
    $null = Import-DreamSkinThemeZip -ArchivePath $rollbackArchiveB -StateRoot $stateRoot
  } catch {
    $rollbackRejected = "$($_.Exception.Message)" -match 'Published theme content does not match'
  } finally {
    Set-Item Function:\Get-DreamSkinThemeSemanticFingerprint -Value $script:RollbackOriginalFingerprint
  }
  $rollbackFilesAfter = @(Get-ChildItem -LiteralPath $rollbackFirst.Path -File | Sort-Object Name |
    ForEach-Object { "$($_.Name):$($_.Length):$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)" })
  $rollbackResidue = @(Get-ChildItem -LiteralPath $paths.Saved -Force -ErrorAction Stop |
    Where-Object { $_.Name -match '^\.theme-(?:failed|import-|legacy-cleanup-|replace-)' })
  if (-not $rollbackRejected -or -not $script:RollbackInjectionHit -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $rollbackFirst.Path) -cne $rollbackFingerprintBefore -or
    (Compare-Object -ReferenceObject $rollbackFilesBefore -DifferenceObject $rollbackFilesAfter) -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $paths.Active) -cne $activeBeforeRollback -or
    $rollbackResidue.Count -gt 0) {
    throw 'A post-publish replacement failure did not restore the exact old theme without residue.'
  }

  # Recreate hard-termination states directly on disk. These are the states a
  # killed process leaves between atomic directory renames; production code has
  # no test-only failure hook.
  $restartRestoreDestination = Join-Path $paths.Saved 'restart-restore-id'
  $restartRestoreStage = Join-Path $paths.Saved (
    '.theme-import-' + [guid]::NewGuid().ToString('N')
  )
  Write-TestThemePack -Directory $restartRestoreDestination -Id 'restart-restore-id' `
    -Name 'Restart Restore Theme' -Quote 'RESTART RESTORE OLD'
  Write-TestThemePack -Directory $restartRestoreStage -Id 'restart-restore-id' `
    -Name 'Restart Restore Theme' -Quote 'RESTART RESTORE NEW'
  $restartRestoreOldFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $restartRestoreDestination
  $restartRestoreNewFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $restartRestoreStage
  $restartRestoreTransaction = New-TestReplacementJournal -Paths $paths `
    -Destination $restartRestoreDestination -Stage $restartRestoreStage `
    -OldFingerprint $restartRestoreOldFingerprint `
    -NewFingerprint $restartRestoreNewFingerprint
  [System.IO.Directory]::Move(
    $restartRestoreDestination,
    $restartRestoreTransaction.Backup
  )
  $null = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $stateRoot
  $restartRestored = Read-DreamSkinTheme `
    -ThemeDirectory $restartRestoreDestination -SkipImageMetadata
  if ("$($restartRestored.Theme.quote)" -cne 'RESTART RESTORE OLD' -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $restartRestoreDestination) -cne
      $restartRestoreOldFingerprint -or
    (Test-Path -LiteralPath $restartRestoreTransaction.Backup) -or
    (Test-Path -LiteralPath $restartRestoreTransaction.Stage) -or
    (Test-Path -LiteralPath $restartRestoreTransaction.Path)) {
    throw 'Store startup did not restore a verified old theme after a crash between replacement renames.'
  }

  $corruptStageDestination = Join-Path $paths.Saved 'restart-corrupt-stage-id'
  $corruptStage = Join-Path $paths.Saved (
    '.theme-import-' + [guid]::NewGuid().ToString('N')
  )
  Write-TestThemePack -Directory $corruptStageDestination -Id 'restart-corrupt-stage-id' `
    -Name 'Restart Corrupt Stage Theme' -Quote 'RESTART CORRUPT OLD'
  Write-TestThemePack -Directory $corruptStage -Id 'restart-corrupt-stage-id' `
    -Name 'Restart Corrupt Stage Theme' -Quote 'RESTART CORRUPT EXPECTED NEW'
  $corruptStageOldFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $corruptStageDestination
  $corruptStageNewFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $corruptStage
  $corruptStageTransaction = New-TestReplacementJournal -Paths $paths `
    -Destination $corruptStageDestination -Stage $corruptStage `
    -OldFingerprint $corruptStageOldFingerprint -NewFingerprint $corruptStageNewFingerprint
  [System.IO.Directory]::Move(
    $corruptStageDestination,
    $corruptStageTransaction.Backup
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $corruptStage 'theme.json'),
    '{broken',
    [System.Text.UTF8Encoding]::new($false)
  )
  $corruptStageRejected = $false
  try {
    $null = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $stateRoot
  } catch {
    $corruptStageRejected = "$($_.Exception.Message)" -match 'recovery is ambiguous'
  }
  if (-not $corruptStageRejected -or
    -not (Test-Path -LiteralPath $corruptStageDestination -PathType Container) -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $corruptStageDestination) -cne
      $corruptStageOldFingerprint -or
    (Test-Path -LiteralPath $corruptStageTransaction.Backup) -or
    -not (Test-Path -LiteralPath $corruptStageTransaction.Stage -PathType Container) -or
    -not (Test-Path -LiteralPath $corruptStageTransaction.Path -PathType Leaf)) {
    throw 'Corrupt staged replacement prevented the verified old canonical theme from being restored.'
  }
  Remove-DreamSkinManagedDirectoryVerified -Path $corruptStageTransaction.Stage -Root $paths.Root
  [System.IO.File]::Delete($corruptStageTransaction.Path)

  $corruptPublishedDestination = Join-Path $paths.Saved 'restart-corrupt-published-id'
  $corruptPublishedStage = Join-Path $paths.Saved (
    '.theme-import-' + [guid]::NewGuid().ToString('N')
  )
  $corruptPublishedExpected = Join-Path $temporaryRoot 'restart-corrupt-published-expected'
  Write-TestThemePack -Directory $corruptPublishedDestination `
    -Id 'restart-corrupt-published-id' -Name 'Restart Corrupt Published Theme' `
    -Quote 'RESTART CORRUPT PUBLISHED OLD'
  Write-TestThemePack -Directory $corruptPublishedExpected `
    -Id 'restart-corrupt-published-id' -Name 'Restart Corrupt Published Theme' `
    -Quote 'RESTART CORRUPT PUBLISHED NEW'
  $corruptPublishedOldFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $corruptPublishedDestination
  $corruptPublishedNewFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $corruptPublishedExpected
  $corruptPublishedTransaction = New-TestReplacementJournal -Paths $paths `
    -Destination $corruptPublishedDestination -Stage $corruptPublishedStage `
    -OldFingerprint $corruptPublishedOldFingerprint `
    -NewFingerprint $corruptPublishedNewFingerprint -Phase 'new-published'
  [System.IO.Directory]::Move(
    $corruptPublishedDestination,
    $corruptPublishedTransaction.Backup
  )
  Write-TestThemePack -Directory $corruptPublishedDestination `
    -Id 'restart-corrupt-published-id' -Name 'Restart Corrupt Published Theme' `
    -Quote 'RESTART CORRUPT PUBLISHED CANDIDATE'
  [System.IO.File]::WriteAllText(
    (Join-Path $corruptPublishedDestination 'theme.json'),
    '{broken',
    [System.Text.UTF8Encoding]::new($false)
  )
  $corruptPublishedRejected = $false
  try {
    $null = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $stateRoot
  } catch {
    $corruptPublishedRejected = "$($_.Exception.Message)" -match 'published replacement cannot be verified'
  }
  if (-not $corruptPublishedRejected -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $corruptPublishedDestination) -cne
      $corruptPublishedOldFingerprint -or
    (Test-Path -LiteralPath $corruptPublishedTransaction.Backup) -or
    -not (Test-Path -LiteralPath $corruptPublishedTransaction.Stage -PathType Container) -or
    -not (Test-Path -LiteralPath $corruptPublishedTransaction.Path -PathType Leaf)) {
    throw 'Corrupt published replacement prevented the verified old canonical theme from being restored.'
  }
  Remove-DreamSkinManagedDirectoryVerified -Path $corruptPublishedTransaction.Stage -Root $paths.Root
  [System.IO.File]::Delete($corruptPublishedTransaction.Path)

  $missingStageDestination = Join-Path $paths.Saved 'restart-missing-stage-id'
  $missingStage = Join-Path $paths.Saved (
    '.theme-import-' + [guid]::NewGuid().ToString('N')
  )
  $missingStageExpected = Join-Path $temporaryRoot 'restart-missing-stage-expected'
  Write-TestThemePack -Directory $missingStageDestination -Id 'restart-missing-stage-id' `
    -Name 'Restart Missing Stage Theme' -Quote 'RESTART MISSING STAGE OLD'
  Write-TestThemePack -Directory $missingStageExpected -Id 'restart-missing-stage-id' `
    -Name 'Restart Missing Stage Theme' -Quote 'RESTART MISSING STAGE NEW'
  $missingStageOldFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $missingStageDestination
  $missingStageNewFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $missingStageExpected
  $missingStageTransaction = New-TestReplacementJournal -Paths $paths `
    -Destination $missingStageDestination -Stage $missingStage `
    -OldFingerprint $missingStageOldFingerprint -NewFingerprint $missingStageNewFingerprint
  [System.IO.Directory]::Move(
    $missingStageDestination,
    $missingStageTransaction.Backup
  )
  $missingStageRejected = $false
  try {
    $null = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $stateRoot
  } catch {
    $missingStageRejected = "$($_.Exception.Message)" -match 'staged replacement is missing'
  }
  if (-not $missingStageRejected -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $missingStageDestination) -cne
      $missingStageOldFingerprint -or
    (Test-Path -LiteralPath $missingStageTransaction.Backup) -or
    -not (Test-Path -LiteralPath $missingStageTransaction.Path -PathType Leaf)) {
    throw 'Missing staged evidence was not preserved after restoring the verified old theme.'
  }
  [System.IO.File]::Delete($missingStageTransaction.Path)

  $failFastDestination = Join-Path $paths.Saved 'restart-failfast-id'
  $failFastStage = Join-Path $paths.Saved (
    '.theme-import-' + [guid]::NewGuid().ToString('N')
  )
  Write-TestThemePack -Directory $failFastDestination -Id 'restart-failfast-id' `
    -Name 'Restart FailFast Theme' -Quote 'RESTART FAILFAST OLD'
  Write-TestThemePack -Directory $failFastStage -Id 'restart-failfast-id' `
    -Name 'Restart FailFast Theme' -Quote 'RESTART FAILFAST NEW'
  $failFastOldFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $failFastDestination
  $failFastNewFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $failFastStage
  $failFastTransaction = New-TestReplacementJournal -Paths $paths `
    -Destination $failFastDestination -Stage $failFastStage `
    -OldFingerprint $failFastOldFingerprint -NewFingerprint $failFastNewFingerprint
  $themeScriptLiteral = ConvertTo-TestPowerShellLiteral `
    -Value (Join-Path $Root 'scripts\theme-windows.ps1')
  $destinationLiteral = ConvertTo-TestPowerShellLiteral -Value $failFastDestination
  $backupLiteral = ConvertTo-TestPowerShellLiteral -Value $failFastTransaction.Backup
  $failFastChildScript = @"
`$ErrorActionPreference = 'Stop'
. $themeScriptLiteral
`$mutex = New-DreamSkinThemeImportMutex
`$null = `$mutex.WaitOne()
[System.IO.Directory]::Move($destinationLiteral, $backupLiteral)
[System.Environment]::FailFast('DreamSkin replacement interruption test')
"@
  $encodedFailFastScript = [Convert]::ToBase64String(
    [System.Text.Encoding]::Unicode.GetBytes($failFastChildScript)
  )
  $powerShellExecutable = (Get-Process -Id $PID -ErrorAction Stop).Path
  if (-not $powerShellExecutable -or
    -not (Test-Path -LiteralPath $powerShellExecutable -PathType Leaf)) {
    throw 'Could not resolve the current PowerShell executable for the fail-fast test.'
  }
  $failFastProcess = Start-Process -FilePath $powerShellExecutable -ArgumentList @(
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned',
    '-EncodedCommand', $encodedFailFastScript
  ) -Wait -PassThru
  if ($failFastProcess.ExitCode -eq 0 -or
    (Test-Path -LiteralPath $failFastDestination) -or
    -not (Test-Path -LiteralPath $failFastTransaction.Backup -PathType Container)) {
    throw 'The fail-fast child did not terminate after moving the canonical theme to its backup.'
  }
  $null = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $stateRoot
  $failFastRestored = Read-DreamSkinTheme `
    -ThemeDirectory $failFastDestination -SkipImageMetadata
  if ("$($failFastRestored.Theme.quote)" -cne 'RESTART FAILFAST OLD' -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $failFastDestination) -cne
      $failFastOldFingerprint -or
    (Test-Path -LiteralPath $failFastTransaction.Backup) -or
    (Test-Path -LiteralPath $failFastTransaction.Stage) -or
    (Test-Path -LiteralPath $failFastTransaction.Path)) {
    throw 'Abandoned-mutex recovery did not restore the exact old theme after child FailFast.'
  }

  $restartCommitDestination = Join-Path $paths.Saved 'restart-commit-id'
  $restartCommitStage = Join-Path $paths.Saved (
    '.theme-import-' + [guid]::NewGuid().ToString('N')
  )
  Write-TestThemePack -Directory $restartCommitDestination -Id 'restart-commit-id' `
    -Name 'Restart Commit Theme' -Quote 'RESTART COMMIT OLD'
  Write-TestThemePack -Directory $restartCommitStage -Id 'restart-commit-id' `
    -Name 'Restart Commit Theme' -Quote 'RESTART COMMIT NEW'
  $restartCommitOldFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $restartCommitDestination
  $restartCommitNewFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $restartCommitStage
  $restartCommitTransaction = New-TestReplacementJournal -Paths $paths `
    -Destination $restartCommitDestination -Stage $restartCommitStage `
    -OldFingerprint $restartCommitOldFingerprint `
    -NewFingerprint $restartCommitNewFingerprint -Phase 'committed' -CommitMarker
  [System.IO.Directory]::Move(
    $restartCommitDestination,
    $restartCommitTransaction.Backup
  )
  [System.IO.Directory]::Move(
    $restartCommitStage,
    $restartCommitDestination
  )
  $restartCommitThemes = @(Get-DreamSkinSavedThemes `
    -StateRoot $stateRoot -SkipImageMetadata)
  $restartCommitted = Read-DreamSkinTheme `
    -ThemeDirectory $restartCommitDestination -SkipImageMetadata
  if ("$($restartCommitted.Theme.quote)" -cne 'RESTART COMMIT NEW' -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $restartCommitDestination) -cne
      $restartCommitNewFingerprint -or
    @($restartCommitThemes | Where-Object { $_.Path -ceq $restartCommitDestination }).Count -ne 1 -or
    (Test-Path -LiteralPath $restartCommitTransaction.Backup) -or
    (Test-Path -LiteralPath $restartCommitTransaction.Path)) {
    throw 'Saved-theme listing did not retain a verified new theme and clean its completed transaction.'
  }

  $restartUncommittedDestination = Join-Path $paths.Saved 'restart-uncommitted-id'
  $restartUncommittedStage = Join-Path $paths.Saved (
    '.theme-import-' + [guid]::NewGuid().ToString('N')
  )
  Write-TestThemePack -Directory $restartUncommittedDestination -Id 'restart-uncommitted-id' `
    -Name 'Restart Uncommitted Theme' -Quote 'RESTART UNCOMMITTED OLD'
  Write-TestThemePack -Directory $restartUncommittedStage -Id 'restart-uncommitted-id' `
    -Name 'Restart Uncommitted Theme' -Quote 'RESTART UNCOMMITTED NEW'
  $restartUncommittedOldFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $restartUncommittedDestination
  $restartUncommittedNewFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $restartUncommittedStage
  $restartUncommittedTransaction = New-TestReplacementJournal -Paths $paths `
    -Destination $restartUncommittedDestination -Stage $restartUncommittedStage `
    -OldFingerprint $restartUncommittedOldFingerprint `
    -NewFingerprint $restartUncommittedNewFingerprint -Phase 'new-published'
  [System.IO.Directory]::Move(
    $restartUncommittedDestination,
    $restartUncommittedTransaction.Backup
  )
  [System.IO.Directory]::Move(
    $restartUncommittedStage,
    $restartUncommittedDestination
  )
  $null = Get-DreamSkinSavedThemes -StateRoot $stateRoot -SkipImageMetadata
  $restartUncommitted = Read-DreamSkinTheme `
    -ThemeDirectory $restartUncommittedDestination -SkipImageMetadata
  if ("$($restartUncommitted.Theme.quote)" -cne 'RESTART UNCOMMITTED OLD' -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $restartUncommittedDestination) -cne
      $restartUncommittedOldFingerprint -or
    (Test-Path -LiteralPath $restartUncommittedTransaction.Backup) -or
    (Test-Path -LiteralPath $restartUncommittedTransaction.Stage) -or
    (Test-Path -LiteralPath $restartUncommittedTransaction.Path)) {
    throw 'A published replacement without the durable commit marker was not rolled back.'
  }

  $restartAmbiguousDestination = Join-Path $paths.Saved 'restart-ambiguous-id'
  $restartAmbiguousStage = Join-Path $paths.Saved (
    '.theme-import-' + [guid]::NewGuid().ToString('N')
  )
  $restartAmbiguousExpected = Join-Path $temporaryRoot 'restart-ambiguous-expected'
  Write-TestThemePack -Directory $restartAmbiguousDestination -Id 'restart-ambiguous-id' `
    -Name 'Restart Ambiguous Theme' -Quote 'RESTART AMBIGUOUS OLD'
  Write-TestThemePack -Directory $restartAmbiguousExpected -Id 'restart-ambiguous-id' `
    -Name 'Restart Ambiguous Theme' -Quote 'RESTART AMBIGUOUS EXPECTED NEW'
  $restartAmbiguousOldFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $restartAmbiguousDestination
  $restartAmbiguousNewFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $restartAmbiguousExpected
  $restartAmbiguousTransaction = New-TestReplacementJournal -Paths $paths `
    -Destination $restartAmbiguousDestination -Stage $restartAmbiguousStage `
    -OldFingerprint $restartAmbiguousOldFingerprint `
    -NewFingerprint $restartAmbiguousNewFingerprint -Phase 'new-published'
  [System.IO.Directory]::Move(
    $restartAmbiguousDestination,
    $restartAmbiguousTransaction.Backup
  )
  Write-TestThemePack -Directory $restartAmbiguousDestination -Id 'restart-ambiguous-id' `
    -Name 'Restart Ambiguous Theme' -Quote 'RESTART AMBIGUOUS UNKNOWN'
  $restartAmbiguousRejected = $false
  try {
    $null = Get-DreamSkinSavedThemes -StateRoot $stateRoot -SkipImageMetadata
  } catch {
    $restartAmbiguousRejected = "$($_.Exception.Message)" -match 'recovery is ambiguous'
  }
  if (-not $restartAmbiguousRejected -or
    -not (Test-Path -LiteralPath $restartAmbiguousDestination -PathType Container) -or
    -not (Test-Path -LiteralPath $restartAmbiguousTransaction.Backup -PathType Container) -or
    -not (Test-Path -LiteralPath $restartAmbiguousTransaction.Path -PathType Leaf) -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $restartAmbiguousTransaction.Backup) -cne
      $restartAmbiguousOldFingerprint) {
    throw 'Ambiguous replacement recovery did not fail closed while preserving its evidence.'
  }
  Remove-DreamSkinManagedDirectoryVerified -Path $restartAmbiguousDestination -Root $paths.Root
  Remove-DreamSkinManagedDirectoryVerified -Path $restartAmbiguousTransaction.Backup -Root $paths.Root
  [System.IO.File]::Delete($restartAmbiguousTransaction.Path)

  $unsafeJournalToken = [guid]::NewGuid().ToString('N')
  $unsafeJournalBackupName = '.theme-replace-' + $unsafeJournalToken
  $unsafeJournalPath = Join-Path $paths.Saved ($unsafeJournalBackupName + '.json')
  $unsafeJournal = [ordered]@{
    schema = 'dreamskin-theme-replacement/1'
    destinationName = '..\escape'
    backupName = $unsafeJournalBackupName
    stageName = '.theme-import-' + [guid]::NewGuid().ToString('N')
    oldFingerprint = (('0' * 64) -join '')
    newFingerprint = (('1' * 64) -join '')
    phase = 'prepared'
  }
  [System.IO.File]::WriteAllText(
    $unsafeJournalPath,
    (($unsafeJournal | ConvertTo-Json -Depth 4 -Compress) + "`r`n"),
    [System.Text.UTF8Encoding]::new($false)
  )
  $unsafeJournalRejected = $false
  try {
    $null = Get-DreamSkinSavedThemes -StateRoot $stateRoot -SkipImageMetadata
  } catch {
    $unsafeJournalRejected = "$($_.Exception.Message)" -match 'unsafe|invalid destination'
  }
  if (-not $unsafeJournalRejected -or
    -not (Test-Path -LiteralPath $unsafeJournalPath -PathType Leaf) -or
    (Test-Path -LiteralPath (Join-Path $paths.Root 'escape'))) {
    throw 'Unsafe replacement-journal traversal was not rejected without side effects.'
  }
  [System.IO.File]::Delete($unsafeJournalPath)

  $strictJournalToken = [guid]::NewGuid().ToString('N')
  $strictJournalBackupName = '.theme-replace-' + $strictJournalToken
  $strictJournalPath = Join-Path $paths.Saved ($strictJournalBackupName + '.json')
  $strictJournal = [ordered]@{
    schema = 'dreamskin-theme-replacement/1'
    destinationName = 'strict-journal-id'
    backupName = $strictJournalBackupName
    stageName = '.theme-import-' + [guid]::NewGuid().ToString('N')
    oldFingerprint = (('2' * 64) -join '')
    newFingerprint = (('3' * 64) -join '')
    phase = 'prepared'
    unexpected = $true
  }
  [System.IO.File]::WriteAllText(
    $strictJournalPath,
    (($strictJournal | ConvertTo-Json -Depth 4 -Compress) + "`r`n"),
    [System.Text.UTF8Encoding]::new($false)
  )
  $strictJournalRejected = $false
  try {
    $null = Get-DreamSkinSavedThemes -StateRoot $stateRoot -SkipImageMetadata
  } catch {
    $strictJournalRejected = "$($_.Exception.Message)" -match 'unsupported schema'
  }
  if (-not $strictJournalRejected -or
    -not (Test-Path -LiteralPath $strictJournalPath -PathType Leaf)) {
    throw 'Replacement recovery accepted or deleted a journal with an unknown field.'
  }
  [System.IO.File]::Delete($strictJournalPath)

  $duplicateDestination = Join-Path $paths.Saved 'duplicate-transaction-id'
  Write-TestThemePack -Directory $duplicateDestination -Id 'duplicate-transaction-id' `
    -Name 'Duplicate Transaction Theme' -Quote 'DUPLICATE TRANSACTION ORIGINAL'
  $duplicateOldFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $duplicateDestination
  $duplicateNewSource = Join-Path $temporaryRoot 'duplicate-transaction-new'
  Write-TestThemePack -Directory $duplicateNewSource -Id 'duplicate-transaction-id' `
    -Name 'Duplicate Transaction Theme' -Quote 'DUPLICATE TRANSACTION NEW'
  $duplicateNewFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $duplicateNewSource
  $duplicateTransactionA = New-TestReplacementJournal -Paths $paths `
    -Destination $duplicateDestination `
    -Stage (Join-Path $paths.Saved ('.theme-import-' + [guid]::NewGuid().ToString('N'))) `
    -OldFingerprint $duplicateOldFingerprint -NewFingerprint $duplicateNewFingerprint
  $duplicateTransactionB = New-TestReplacementJournal -Paths $paths `
    -Destination $duplicateDestination `
    -Stage (Join-Path $paths.Saved ('.theme-import-' + [guid]::NewGuid().ToString('N'))) `
    -OldFingerprint $duplicateOldFingerprint -NewFingerprint $duplicateNewFingerprint
  $duplicateTransactionsRejected = $false
  try {
    $null = Get-DreamSkinSavedThemes -StateRoot $stateRoot -SkipImageMetadata
  } catch {
    $duplicateTransactionsRejected = "$($_.Exception.Message)" -match 'Multiple theme replacement transactions'
  }
  if (-not $duplicateTransactionsRejected -or
    -not (Test-Path -LiteralPath $duplicateTransactionA.Path -PathType Leaf) -or
    -not (Test-Path -LiteralPath $duplicateTransactionB.Path -PathType Leaf) -or
    (Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $duplicateDestination) -cne
      $duplicateOldFingerprint) {
    throw 'Duplicate replacement targets were not rejected before recovery changed canonical state.'
  }
  [System.IO.File]::Delete($duplicateTransactionA.Path)
  [System.IO.File]::Delete($duplicateTransactionB.Path)

  $cleanupWarningSourceA = Join-Path $temporaryRoot 'cleanup-warning-source-a'
  $cleanupWarningSourceB = Join-Path $temporaryRoot 'cleanup-warning-source-b'
  $cleanupWarningArchiveA = Join-Path $temporaryRoot 'cleanup-warning-a.zip'
  $cleanupWarningArchiveB = Join-Path $temporaryRoot 'cleanup-warning-b.zip'
  Write-TestThemePack -Directory $cleanupWarningSourceA -Id 'cleanup-warning-id' `
    -Name 'Cleanup Warning Theme' -Quote 'CLEANUP WARNING A'
  Write-TestThemePack -Directory $cleanupWarningSourceB -Id 'cleanup-warning-id' `
    -Name 'Cleanup Warning Theme' -Quote 'CLEANUP WARNING B'
  New-TestZipFromDirectory -Source $cleanupWarningSourceA -Archive $cleanupWarningArchiveA
  New-TestZipFromDirectory -Source $cleanupWarningSourceB -Archive $cleanupWarningArchiveB
  $cleanupWarningFirst = Import-DreamSkinThemeZip `
    -ArchivePath $cleanupWarningArchiveA -StateRoot $stateRoot
  $cleanupWarningOldFingerprint = Get-DreamSkinThemeSemanticFingerprint `
    -ThemeDirectory $cleanupWarningFirst.Path
  $script:CleanupWarningOriginalRemove =
    (Get-Item Function:\Remove-DreamSkinManagedDirectoryVerified).ScriptBlock
  $script:CleanupWarningInjectionHit = $false
  function Remove-DreamSkinManagedDirectoryVerified {
    param(
      [Parameter(Mandatory = $true)][string]$Path,
      [Parameter(Mandatory = $true)][string]$Root
    )
    if ([System.IO.Path]::GetFileName($Path) -clike '.theme-replace-*') {
      $script:CleanupWarningInjectionHit = $true
      throw 'simulated committed-backup cleanup failure'
    }
    & $script:CleanupWarningOriginalRemove -Path $Path -Root $Root
  }
  try {
    $cleanupWarningResult = Import-DreamSkinThemeZip `
      -ArchivePath $cleanupWarningArchiveB -StateRoot $stateRoot
  } finally {
    Set-Item Function:\Remove-DreamSkinManagedDirectoryVerified `
      -Value $script:CleanupWarningOriginalRemove
  }
  $cleanupWarningBackups = @(Get-ChildItem -LiteralPath $paths.Saved -Directory -Force |
    Where-Object { $_.Name -clike '.theme-replace-*' })
  $cleanupWarningJournals = @(Get-ChildItem -LiteralPath $paths.Saved -File -Force |
    Where-Object { $_.Name -cmatch '^\.theme-replace-[a-f0-9]{32}\.json$' })
  $cleanupWarningBackupFingerprint = if ($cleanupWarningBackups.Count -eq 1) {
    Get-DreamSkinThemeSemanticFingerprint -ThemeDirectory $cleanupWarningBackups[0].FullName
  } else {
    $null
  }
  $cleanupWarningVisibleBackups = @(Get-DreamSkinSavedThemes `
    -StateRoot $stateRoot -SkipImageMetadata | Where-Object {
      [System.IO.Path]::GetFileName("$($_.Path)").StartsWith(
        '.theme-replace-', [System.StringComparison]::Ordinal
      )
    })
  $cleanupWarningBackupsAfterRecovery = @(
    Get-ChildItem -LiteralPath $paths.Saved -Directory -Force |
      Where-Object { $_.Name -clike '.theme-replace-*' }
  )
  $cleanupWarningJournalsAfterRecovery = @(
    Get-ChildItem -LiteralPath $paths.Saved -File -Force |
      Where-Object { $_.Name -cmatch '^\.theme-replace-[a-f0-9]{32}\.json$' }
  )
  $cleanupWarningPublished = Read-DreamSkinTheme `
    -ThemeDirectory $cleanupWarningFirst.Path -SkipImageMetadata
  if (-not $script:CleanupWarningInjectionHit -or
    $cleanupWarningResult.Status -cne 'Imported' -or -not $cleanupWarningResult.Replaced -or
    "$($cleanupWarningPublished.Theme.quote)" -cne 'CLEANUP WARNING B' -or
    $cleanupWarningResult.CleanupWarning -cnotmatch 'committed-backup cleanup failure' -or
    $cleanupWarningBackups.Count -ne 1 -or $cleanupWarningJournals.Count -ne 1 -or
    $cleanupWarningBackupFingerprint -cne $cleanupWarningOldFingerprint -or
    $cleanupWarningVisibleBackups.Count -ne 0 -or
    $cleanupWarningBackupsAfterRecovery.Count -ne 0 -or
    $cleanupWarningJournalsAfterRecovery.Count -ne 0) {
    throw 'A committed import was rolled back or reported failed when obsolete backup cleanup failed.'
  }

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
    [System.BitConverter]::GetBytes([Convert]::ToUInt32('A1FF0000', 16)), 0
  )
  New-TestZipWithEntry -Archive $linkArchive -EntryName 'background.jpg' `
    -Content 'outside-target' -ExternalAttributes $linkAttributes
  Assert-TestImportRejected -Archive $linkArchive -Label 'Unix symbolic link'

  $reparseArchive = Join-Path $temporaryRoot 'reparse.zip'
  $reparseAttributes = [System.BitConverter]::ToInt32(
    [System.BitConverter]::GetBytes([Convert]::ToUInt32('81A40400', 16)), 0
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
  $transactionResidue = @(Get-ChildItem -LiteralPath $paths.Saved -Force -ErrorAction Stop |
    Where-Object { $_.Name -match '^\.theme-(?:failed|import-|legacy-cleanup-|replace-)' })
  if ($transactionResidue.Count -gt 0) {
    throw 'A successful or rolled-back import left hidden transaction directories.'
  }
  Write-Host 'PASS: Windows ZIP import is contained, bounded, atomic, deduplicated, and active-theme neutral.'
} finally {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
