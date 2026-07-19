[CmdletBinding()]
param(
  [string]$OutputDirectory,
  [string]$IsccPath,
  [string]$NodeArchivePath,
  [string]$WorkingDirectory,
  [switch]$KeepWorkingDirectory
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$installerRoot = $PSScriptRoot
$windowsRoot = Split-Path -Parent $installerRoot
$repositoryRoot = Split-Path -Parent $windowsRoot
$manifestPath = Join-Path $installerRoot 'node-runtime.json'
$definitionPath = Join-Path $installerRoot 'codex-dream-skin.iss'
$bootstrapPath = Join-Path $installerRoot 'setup-bootstrap.ps1'
$versionPath = Join-Path $windowsRoot 'VERSION'
$macosVersionPath = Join-Path (Join-Path $repositoryRoot 'macos') 'VERSION'
$macosPackagePath = Join-Path (Join-Path $repositoryRoot 'macos') 'package.json'
$licensePath = Join-Path (Join-Path $repositoryRoot 'macos') 'LICENSE'
$noticePath = Join-Path (Join-Path $repositoryRoot 'macos') 'NOTICE.md'
$innoLanguageRoot = Join-Path $installerRoot 'languages'
$innoChineseLanguagePath = Join-Path $innoLanguageRoot 'ChineseSimplified.isl'
$innoSetupLicensePath = Join-Path $innoLanguageRoot 'Inno-Setup-License.txt'
$innoChineseLanguageSha256 = '7d544b9bb1d142cfa11f2e5d3cc8abe2e55f8e066c5124e3772675aa236e1278'
$innoSetupLicenseSha256 = '0c81595601bce47eeef8d865d5da7f9ca2c6a12235b7482b29f5ab23ed02ee5a'
$publicPresetRoot = Join-Path (Join-Path (Join-Path $repositoryRoot 'macos') 'presets') `
  'preset-gothic-void-crusade'
$publicPresetImagePath = Join-Path $publicPresetRoot 'background.jpg'
$publicPresetThemePath = Join-Path $publicPresetRoot 'theme.json'
$publicPresetImageSha256 = 'b76a7cbe2ff9d923846e931984d243a7ba1f25de8d190b5c6412c809c41aee42'
$publicPresetThemeSha256 = 'fd250dc6c0ec1eea724f59a86c7c126a6bd9b90798289483a00948d57e23e52e'

function Read-ReleaseTextFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required release input does not exist: $Path"
  }
  return [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
}

function Resolve-ReleasePath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$BasePath
  )
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $BasePath $Path))
}

function Assert-NodeRuntimeManifest {
  param([Parameter(Mandatory = $true)][object]$Manifest)
  $expectedVersion = '22.23.1'
  $expectedArchive = "node-v$expectedVersion-win-x64.zip"
  $expectedRoot = "node-v$expectedVersion-win-x64"
  $expectedUrl = "https://nodejs.org/dist/v$expectedVersion/$expectedArchive"
  $expectedHash = '7df0bc9375723f4a86b3aa1b7cc73342423d9677a8df4538aca31a049e309c29'

  if ("$($Manifest.version)" -cne $expectedVersion -or
    "$($Manifest.platform)" -cne 'win' -or
    "$($Manifest.architecture)" -cne 'x64' -or
    "$($Manifest.archive)" -cne $expectedArchive -or
    "$($Manifest.url)" -cne $expectedUrl -or
    "$($Manifest.sha256)" -cne $expectedHash -or
    "$($Manifest.nodeEntry)" -cne "$expectedRoot/node.exe" -or
    "$($Manifest.licenseEntry)" -cne "$expectedRoot/LICENSE") {
    throw 'The pinned Node.js runtime manifest differs from the reviewed v22.23.1 win-x64 release.'
  }
}

function Resolve-IsccExecutable {
  param([string]$RequestedPath)
  $candidates = @()
  if ($RequestedPath) { $candidates += $RequestedPath }
  if (${env:ProgramFiles(x86)}) {
    $candidates += Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
  }
  if ($env:ProgramFiles) {
    $candidates += Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'
  }
  if ($env:ChocolateyInstall) {
    $candidates += Join-Path $env:ChocolateyInstall 'bin\iscc.exe'
  }
  $command = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue
  if ($command) { $candidates += $command.Source }

  foreach ($candidate in $candidates) {
    if (-not $candidate) { continue }
    $resolved = Resolve-ReleasePath -Path $candidate -BasePath $repositoryRoot
    if (Test-Path -LiteralPath $resolved -PathType Leaf) { return $resolved }
  }
  throw 'Inno Setup 6 compiler (ISCC.exe) was not found. Install Inno Setup 6 or pass -IsccPath.'
}

function Copy-ReleaseDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Required release directory does not exist: $Source"
  }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
    Copy-Item -LiteralPath $item.FullName -Destination $Destination -Recurse -Force -ErrorAction Stop
  }
}

function Copy-ZipEntry {
  param(
    [Parameter(Mandatory = $true)][object]$Archive,
    [Parameter(Mandatory = $true)][string]$EntryName,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  $entry = $Archive.GetEntry($EntryName)
  if ($null -eq $entry -or $entry.Length -le 0) {
    throw "The Node.js archive is missing a non-empty entry: $EntryName"
  }
  $parent = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $input = $entry.Open()
  try {
    $output = [System.IO.File]::Open(
      $Destination,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None
    )
    try { $input.CopyTo($output) } finally { $output.Dispose() }
  } finally {
    $input.Dispose()
  }
}

function Write-DreamSkinIcon {
  param([Parameter(Mandatory = $true)][string]$Path)
  $sizes = @(16, 24, 32, 48, 64, 256)
  $images = New-Object System.Collections.Generic.List[byte[]]

  foreach ($size in $sizes) {
    $pixelBytes = $size * $size * 4
    $maskStride = [int]([Math]::Ceiling($size / 32.0) * 4)
    $stream = [System.IO.MemoryStream]::new()
    $writer = [System.IO.BinaryWriter]::new($stream)
    try {
      $writer.Write([uint32]40)
      $writer.Write([int32]$size)
      $writer.Write([int32]($size * 2))
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]0)
      $writer.Write([uint32]$pixelBytes)
      $writer.Write([int32]3780)
      $writer.Write([int32]3780)
      $writer.Write([uint32]0)
      $writer.Write([uint32]0)

      $alphaRows = New-Object 'byte[][]' $size
      for ($row = $size - 1; $row -ge 0; $row--) {
        $alphaRow = New-Object byte[] $size
        for ($column = 0; $column -lt $size; $column++) {
          $coverage = 0
          $moonCoverage = 0
          $starCoverage = 0
          foreach ($sampleY in @(0.125, 0.375, 0.625, 0.875)) {
            foreach ($sampleX in @(0.125, 0.375, 0.625, 0.875)) {
              $x = ($column + $sampleX) / $size
              $y = ($row + $sampleY) / $size
              $dx = [Math]::Max([Math]::Abs($x - 0.5) - 0.34, 0.0)
              $dy = [Math]::Max([Math]::Abs($y - 0.5) - 0.34, 0.0)
              if (($dx * $dx + $dy * $dy) -le (0.105 * 0.105)) { $coverage++ }

              $outerMoon = (($x - 0.43) * ($x - 0.43) + ($y - 0.46) * ($y - 0.46)) -le (0.215 * 0.215)
              $innerMoon = (($x - 0.52) * ($x - 0.52) + ($y - 0.39) * ($y - 0.39)) -le (0.185 * 0.185)
              if ($outerMoon -and -not $innerMoon) { $moonCoverage++ }
              if ([Math]::Abs($x - 0.69) + [Math]::Abs($y - 0.31) -le 0.065) { $starCoverage++ }
            }
          }

          $alpha = [int][Math]::Round(255.0 * $coverage / 16.0)
          $alphaRow[$column] = [byte]$alpha
          $blend = [Math]::Max($moonCoverage, $starCoverage) / 16.0
          $red = [int][Math]::Round((63 + 23 * (1.0 - $y)) * (1.0 - $blend) + 245 * $blend)
          $green = [int][Math]::Round((48 + 70 * $x) * (1.0 - $blend) + 248 * $blend)
          $blue = [int][Math]::Round((153 + 73 * $x) * (1.0 - $blend) + 255 * $blend)
          $writer.Write([byte]$blue)
          $writer.Write([byte]$green)
          $writer.Write([byte]$red)
          $writer.Write([byte]$alpha)
        }
        $alphaRows[$row] = $alphaRow
      }

      for ($row = $size - 1; $row -ge 0; $row--) {
        $maskRow = New-Object byte[] $maskStride
        for ($column = 0; $column -lt $size; $column++) {
          if ($alphaRows[$row][$column] -eq 0) {
            $byteIndex = [int][Math]::Floor($column / 8.0)
            $maskRow[$byteIndex] = $maskRow[$byteIndex] -bor (0x80 -shr ($column % 8))
          }
        }
        $writer.Write($maskRow)
      }
      $writer.Flush()
      $images.Add($stream.ToArray())
    } finally {
      $writer.Dispose()
      $stream.Dispose()
    }
  }

  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $iconStream = [System.IO.File]::Open(
    $Path,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  $iconWriter = [System.IO.BinaryWriter]::new($iconStream)
  try {
    $iconWriter.Write([uint16]0)
    $iconWriter.Write([uint16]1)
    $iconWriter.Write([uint16]$sizes.Count)
    $offset = 6 + (16 * $sizes.Count)
    for ($index = 0; $index -lt $sizes.Count; $index++) {
      $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
      $iconWriter.Write([byte]$dimension)
      $iconWriter.Write([byte]$dimension)
      $iconWriter.Write([byte]0)
      $iconWriter.Write([byte]0)
      $iconWriter.Write([uint16]1)
      $iconWriter.Write([uint16]32)
      $iconWriter.Write([uint32]$images[$index].Length)
      $iconWriter.Write([uint32]$offset)
      $offset += $images[$index].Length
    }
    foreach ($image in $images) { $iconWriter.Write($image) }
  } finally {
    $iconWriter.Dispose()
    $iconStream.Dispose()
  }
}

$version = (Read-ReleaseTextFile -Path $versionPath).Trim()
if ($version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
  throw "windows/VERSION must contain a three-part semantic version: $version"
}
$macosVersion = (Read-ReleaseTextFile -Path $macosVersionPath).Trim()
$macosPackage = (Read-ReleaseTextFile -Path $macosPackagePath) | ConvertFrom-Json
if ($macosVersion -cne $version -or "$($macosPackage.version)" -cne $version) {
  throw "Release versions differ: windows=$version macOS=$macosVersion package=$($macosPackage.version)"
}

$manifest = (Read-ReleaseTextFile -Path $manifestPath) | ConvertFrom-Json
Assert-NodeRuntimeManifest -Manifest $manifest
$null = Read-ReleaseTextFile -Path $definitionPath
$null = Read-ReleaseTextFile -Path $bootstrapPath
$null = Read-ReleaseTextFile -Path $licensePath
$null = Read-ReleaseTextFile -Path $noticePath
$null = Read-ReleaseTextFile -Path $innoChineseLanguagePath
$null = Read-ReleaseTextFile -Path $innoSetupLicensePath
$innoChineseLanguageHash = (Get-FileHash -LiteralPath $innoChineseLanguagePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($innoChineseLanguageHash -cne $innoChineseLanguageSha256) {
  throw "The pinned Inno Setup Simplified Chinese messages changed. Expected $innoChineseLanguageSha256, found $innoChineseLanguageHash."
}
$innoSetupLicenseHash = (Get-FileHash -LiteralPath $innoSetupLicensePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($innoSetupLicenseHash -cne $innoSetupLicenseSha256) {
  throw "The pinned Inno Setup license changed. Expected $innoSetupLicenseSha256, found $innoSetupLicenseHash."
}
$publicPresetTheme = (Read-ReleaseTextFile -Path $publicPresetThemePath) | ConvertFrom-Json
if ("$($publicPresetTheme.id)" -cne 'preset-gothic-void-crusade' -or
  "$($publicPresetTheme.image)" -cne 'background.jpg') {
  throw 'The public Windows release preset metadata is unexpected.'
}
if (-not (Test-Path -LiteralPath $publicPresetImagePath -PathType Leaf)) {
  throw "The public Windows release preset image is missing: $publicPresetImagePath"
}
$publicPresetImageHash = (Get-FileHash -LiteralPath $publicPresetImagePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($publicPresetImageHash -cne $publicPresetImageSha256) {
  throw "The reviewed public preset image changed. Expected $publicPresetImageSha256, found $publicPresetImageHash."
}
$publicPresetThemeHash = (Get-FileHash -LiteralPath $publicPresetThemePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($publicPresetThemeHash -cne $publicPresetThemeSha256) {
  throw "The reviewed public preset metadata changed. Expected $publicPresetThemeSha256, found $publicPresetThemeHash."
}
$compiler = Resolve-IsccExecutable -RequestedPath $IsccPath

if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repositoryRoot 'release' }
$OutputDirectory = Resolve-ReleasePath -Path $OutputDirectory -BasePath $repositoryRoot
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

if ($WorkingDirectory) {
  $WorkingDirectory = Resolve-ReleasePath -Path $WorkingDirectory -BasePath $repositoryRoot
  if (Test-Path -LiteralPath $WorkingDirectory) {
    throw "The requested working directory already exists: $WorkingDirectory"
  }
  New-Item -ItemType Directory -Path $WorkingDirectory | Out-Null
} else {
  $WorkingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) (
    'codex-dream-skin-windows-release-' + [guid]::NewGuid().ToString('N')
  )
  New-Item -ItemType Directory -Path $WorkingDirectory | Out-Null
}

try {
  $archivePath = if ($NodeArchivePath) {
    Resolve-ReleasePath -Path $NodeArchivePath -BasePath $repositoryRoot
  } else {
    Join-Path $WorkingDirectory "$($manifest.archive)"
  }
  if (-not $NodeArchivePath) {
    $previousProtocol = [Net.ServicePointManager]::SecurityProtocol
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Write-Host "Downloading pinned Node.js v$($manifest.version) runtime..."
      Invoke-WebRequest -UseBasicParsing -Uri "$($manifest.url)" -OutFile $archivePath
    } finally {
      [Net.ServicePointManager]::SecurityProtocol = $previousProtocol
    }
  }
  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw "Node.js archive does not exist: $archivePath"
  }
  $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($archiveHash -cne "$($manifest.sha256)") {
    throw "Node.js archive SHA-256 mismatch. Expected $($manifest.sha256), found $archiveHash."
  }

  $stageRoot = Join-Path $WorkingDirectory 'stage'
  $payloadRoot = Join-Path $stageRoot 'payload'
  $nodeRoot = Join-Path (Join-Path $payloadRoot 'runtime') 'node'
  $languageRoot = Join-Path $stageRoot 'languages'
  New-Item -ItemType Directory -Path $payloadRoot | Out-Null
  New-Item -ItemType Directory -Path $languageRoot | Out-Null
  Copy-ReleaseDirectory -Source (Join-Path $windowsRoot 'assets') -Destination (Join-Path $payloadRoot 'assets')
  Copy-ReleaseDirectory -Source (Join-Path $windowsRoot 'scripts') -Destination (Join-Path $payloadRoot 'scripts')
  Copy-ReleaseDirectory -Source $publicPresetRoot `
    -Destination (Join-Path $payloadRoot 'presets\preset-gothic-void-crusade')
  Copy-Item -LiteralPath $publicPresetImagePath `
    -Destination (Join-Path (Join-Path $payloadRoot 'assets') 'dream-reference.jpg') -Force
  $publicPresetTheme.image = 'dream-reference.jpg'
  [System.IO.File]::WriteAllText(
    (Join-Path (Join-Path $payloadRoot 'assets') 'theme.json'),
    (($publicPresetTheme | ConvertTo-Json -Depth 8) + "`r`n"),
    [System.Text.UTF8Encoding]::new($false)
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $payloadRoot 'VERSION'),
    "$version`r`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  Copy-Item -LiteralPath $bootstrapPath -Destination (Join-Path $stageRoot 'setup-bootstrap.ps1') -Force
  Copy-Item -LiteralPath $licensePath -Destination (Join-Path $stageRoot 'LICENSE.txt') -Force
  Copy-Item -LiteralPath $noticePath -Destination (Join-Path $stageRoot 'NOTICE.md') -Force
  Copy-Item -LiteralPath $innoChineseLanguagePath `
    -Destination (Join-Path $languageRoot 'ChineseSimplified.isl') -Force

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    Copy-ZipEntry -Archive $zip -EntryName "$($manifest.nodeEntry)" `
      -Destination (Join-Path $nodeRoot 'node.exe')
    Copy-ZipEntry -Archive $zip -EntryName "$($manifest.licenseEntry)" `
      -Destination (Join-Path $nodeRoot 'LICENSE')
  } finally {
    $zip.Dispose()
  }
  Write-DreamSkinIcon -Path (Join-Path (Join-Path $payloadRoot 'assets') 'codex-dream-skin.ico')

  $expectedPayloadFiles = @(
    'VERSION',
    'assets\dream-reference.jpg',
    'assets\dream-skin.css',
    'assets\renderer-inject.js',
    'assets\theme.json',
    'assets\codex-dream-skin.ico',
    'presets\preset-gothic-void-crusade\background.jpg',
    'presets\preset-gothic-void-crusade\theme.json',
    'scripts\check-update.ps1',
    'scripts\common-windows.ps1',
    'scripts\config-utf8.ps1',
    'scripts\image-metadata.mjs',
    'scripts\injector.mjs',
    'scripts\install-dream-skin.ps1',
    'scripts\restore-dream-skin.ps1',
    'scripts\start-dream-skin.ps1',
    'scripts\theme-windows.ps1',
    'scripts\tray-dream-skin.ps1',
    'scripts\verify-dream-skin.ps1',
    'runtime\node\node.exe',
    'runtime\node\LICENSE'
  )
  foreach ($relative in $expectedPayloadFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $payloadRoot $relative) -PathType Leaf)) {
      throw "Staged installer payload is incomplete: $relative"
    }
  }
  $stagedPublicImage = Join-Path (Join-Path $payloadRoot 'assets') 'dream-reference.jpg'
  $stagedPublicImageHash = (Get-FileHash -LiteralPath $stagedPublicImage -Algorithm SHA256).Hash.ToLowerInvariant()
  $stagedPublicThemePath = Join-Path (Join-Path $payloadRoot 'presets') `
    'preset-gothic-void-crusade\theme.json'
  $stagedPublicThemeHash = (Get-FileHash -LiteralPath $stagedPublicThemePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $stagedPublicTheme = (Read-ReleaseTextFile `
    -Path (Join-Path (Join-Path $payloadRoot 'assets') 'theme.json')) | ConvertFrom-Json
  if ($stagedPublicImageHash -cne $publicPresetImageSha256 -or
    $stagedPublicThemeHash -cne $publicPresetThemeSha256 -or
    "$($stagedPublicTheme.id)" -cne 'preset-gothic-void-crusade' -or
    "$($stagedPublicTheme.image)" -cne 'dream-reference.jpg') {
    throw 'Staged installer payload did not retain the reviewed public release theme.'
  }

  $arguments = @(
    "/DAppVersion=$version",
    "/DStageRoot=$stageRoot",
    "/DOutputDir=$OutputDirectory",
    $definitionPath
  )
  Write-Host "Building CodexDreamSkin-Setup-v$version.exe..."
  & $compiler @arguments
  if ($LASTEXITCODE -ne 0) { throw "ISCC.exe failed with exit code $LASTEXITCODE." }

  $artifactPath = Join-Path $OutputDirectory "CodexDreamSkin-Setup-v$version.exe"
  if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
    throw "Inno Setup did not create the expected artifact: $artifactPath"
  }
  Write-Host "Windows release created: $artifactPath"
} finally {
  if (-not $KeepWorkingDirectory -and (Test-Path -LiteralPath $WorkingDirectory)) {
    Remove-Item -LiteralPath $WorkingDirectory -Recurse -Force -ErrorAction SilentlyContinue
  } elseif ($KeepWorkingDirectory) {
    Write-Host "Windows release working directory preserved at: $WorkingDirectory"
  }
}
