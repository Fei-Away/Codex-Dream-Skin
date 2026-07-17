[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $Root 'scripts\pet-package-windows.ps1')

function Write-TestPetWebp {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Width = 1536,
    [int]$Height = 2288,
    [bool]$Alpha = $true
  )
  $base64 = if ($Width -eq 1536 -and $Height -eq 2288 -and $Alpha) {
    'UklGRrQAAABXRUJQVlA4TKgAAAAv/8U7EgcQEREQkCT93x8Y0f+M//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Of/aQA='
  } elseif ($Width -eq 1536 -and $Height -eq 1872 -and $Alpha) {
    'UklGRpgAAABXRUJQVlA4TIsAAAAv/8XTEQcQEREAUKT//ymi/6n//e9///vf//73v//973//+9///ve///3vf//73//+97///e9///vf//73v//973//+9///ve///3vf//73//+97///e9///vf//73v//973//+9///ve///3vf//73//+97///e9///vf//73v//973//+9///q8CAA=='
  } elseif ($Width -eq 1536 -and $Height -eq 2288 -and -not $Alpha) {
    'UklGRrgAAABXRUJQVlA4TKsAAAAv/8U7AgfQ//73v/8BAUnS//2BEf3P+M9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+85///Oc///nPf/7zn//85z//+c9//vOf//znP//5z3/+nwYA'
  } else {
    throw "Unsupported generated WebP test fixture: ${Width}x${Height}, alpha=$Alpha"
  }
  [System.IO.File]::WriteAllBytes($Path, [System.Convert]::FromBase64String($base64))
}

function Write-TestHeaderOnlyWebp {
  param([Parameter(Mandatory = $true)][string]$Path)
  $bytes = [byte[]]::new(30)
  [System.Text.Encoding]::ASCII.GetBytes('RIFF').CopyTo($bytes, 0)
  $bytes[4] = 22
  [System.Text.Encoding]::ASCII.GetBytes('WEBP').CopyTo($bytes, 8)
  [System.Text.Encoding]::ASCII.GetBytes('VP8X').CopyTo($bytes, 12)
  $bytes[16] = 10
  $bytes[20] = 0x10
  $bytes[24] = 0xff
  $bytes[25] = 0x05
  $bytes[27] = 0xef
  $bytes[28] = 0x08
  [System.IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-TestPetPackage {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$PetId = 'test-bunny',
    [string]$DisplayName = 'Test Bunny',
    [string]$Description = 'A tiny regression-test companion.',
    [int]$SpriteVersionNumber = 2,
    [string]$SpritesheetPath = 'spritesheet.webp',
    [int]$Width = 1536,
    [int]$Height = 2288,
    [bool]$Alpha = $true
  )
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
  $manifest = [ordered]@{
    id = $PetId
    displayName = $DisplayName
    description = $Description
    spriteVersionNumber = $SpriteVersionNumber
    spritesheetPath = $SpritesheetPath
  } | ConvertTo-Json
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false, $true)
  [System.IO.File]::WriteAllText((Join-Path $Path 'pet.json'), $manifest + "`n", $utf8NoBom)
  Write-TestPetWebp -Path (Join-Path $Path 'spritesheet.webp') -Width $Width -Height $Height -Alpha $Alpha
}

function Assert-Throws {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Action,
    [Parameter(Mandatory = $true)][string]$MessagePattern
  )
  $threw = $false
  try { & $Action } catch {
    $threw = $true
    if ("$($_.Exception.Message)" -notmatch $MessagePattern) {
      throw "Unexpected error. Expected /$MessagePattern/, got: $($_.Exception.Message)"
    }
  }
  if (-not $threw) { throw "Expected action to fail with /$MessagePattern/." }
}

function Read-TestUtf8File {
  param([Parameter(Mandatory = $true)][string]$Path)
  $utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
  return $utf8Strict.GetString([System.IO.File]::ReadAllBytes($Path))
}

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) "codex-dream-skin-pet-tests-$PID-$([guid]::NewGuid().ToString('N'))"
$packages = Join-Path $temporaryRoot 'packages'
$petsRoot = Join-Path $temporaryRoot 'codex-home\pets'
New-Item -ItemType Directory -Path $packages -Force | Out-Null

try {
  $validPackage = Join-Path $packages 'valid'
  $displayName = -join @([char]0x6D4B, [char]0x8BD5, ' Bunny')
  $description = -join @([char]0x900F, [char]0x660E, [char]0x684C, [char]0x5BA0, [char]0xFF0C, ' v2 pet package.')
  Write-TestPetPackage -Path $validPackage -DisplayName $displayName -Description $description

  $manifest = Invoke-DreamSkinPetPackageValidation -PackagePath $validPackage
  if ($manifest.id -cne 'test-bunny' -or $manifest.spriteVersionNumber -ne 2 -or
    $manifest.atlas.width -ne 1536 -or $manifest.atlas.height -ne 2288 -or -not $manifest.atlas.alpha) {
    throw 'Valid v2 pet package metadata was not preserved.'
  }

  $installed = Install-DreamSkinPetPackage -PackagePath $validPackage -PetsRoot $petsRoot
  $installedManifestPath = Join-Path $installed.Path 'pet.json'
  $installedSheetPath = Join-Path $installed.Path 'spritesheet.webp'
  if (-not (Test-Path -LiteralPath $installedManifestPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $installedSheetPath -PathType Leaf)) {
    throw 'Pet package was not installed with both required files.'
  }
  $installedText = Read-TestUtf8File -Path $installedManifestPath
  if (-not $installedText.Contains($displayName) -or -not $installedText.Contains($description)) {
    throw 'Pet install changed non-ASCII manifest text.'
  }
  $manifestBytes = [System.IO.File]::ReadAllBytes($installedManifestPath)
  if ($manifestBytes.Length -ge 3 -and $manifestBytes[0] -eq 0xef -and
    $manifestBytes[1] -eq 0xbb -and $manifestBytes[2] -eq 0xbf) {
    throw 'Pet install added an unexpected UTF-8 BOM.'
  }

  Assert-Throws -Action {
    Install-DreamSkinPetPackage -PackagePath $validPackage -PetsRoot $petsRoot
  } -MessagePattern 'already exists'

  $fileTargetPackage = Join-Path $packages 'file-target'
  Write-TestPetPackage -Path $fileTargetPackage -PetId 'file-target'
  $fileTarget = Join-Path $petsRoot 'file-target'
  [System.IO.File]::WriteAllText($fileTarget, 'keep this file')
  Assert-Throws -Action {
    Install-DreamSkinPetPackage -PackagePath $fileTargetPackage -PetsRoot $petsRoot -Replace
  } -MessagePattern 'not a directory'
  if (-not (Test-Path -LiteralPath $fileTarget -PathType Leaf)) {
    throw 'Pet replacement changed an existing non-directory target.'
  }
  Remove-Item -LiteralPath $fileTarget -Force

  $junctionPackage = Join-Path $packages 'junction-target'
  Write-TestPetPackage -Path $junctionPackage -PetId 'junction-target'
  $junctionOutside = Join-Path $temporaryRoot 'junction-outside'
  New-Item -ItemType Directory -Path $junctionOutside -Force | Out-Null
  $junctionSentinel = Join-Path $junctionOutside 'sentinel.txt'
  [System.IO.File]::WriteAllText($junctionSentinel, 'do not delete')
  $junctionTarget = Join-Path $petsRoot 'junction-target'
  New-Item -ItemType Junction -Path $junctionTarget -Target $junctionOutside | Out-Null
  try {
    Assert-Throws -Action {
      Install-DreamSkinPetPackage -PackagePath $junctionPackage -PetsRoot $petsRoot -Replace
    } -MessagePattern 'junction or symbolic link'
    if (-not (Test-Path -LiteralPath $junctionSentinel -PathType Leaf)) {
      throw 'Pet replacement followed a junction outside the managed pet root.'
    }
  } finally {
    Remove-Item -LiteralPath $junctionTarget -Recurse -Force -ErrorAction SilentlyContinue
  }

  $replacement = Join-Path $packages 'replacement'
  Write-TestPetPackage -Path $replacement -Description 'Updated regression-test companion.'
  $updated = Install-DreamSkinPetPackage -PackagePath $replacement -PetsRoot $petsRoot -Replace
  if (-not $updated.Replaced -or
    (Read-TestUtf8File -Path (Join-Path $updated.Path 'pet.json')) -notmatch 'Updated regression-test companion') {
    throw 'Pet replacement did not publish the validated package.'
  }

  $v1Package = Join-Path $packages 'v1'
  Write-TestPetPackage -Path $v1Package -PetId 'legacy-pet' -SpriteVersionNumber 1
  Assert-Throws -Action {
    Invoke-DreamSkinPetPackageValidation -PackagePath $v1Package
  } -MessagePattern 'spriteVersionNumber must be 2'

  $bomPackage = Join-Path $packages 'bom-manifest'
  Write-TestPetPackage -Path $bomPackage -PetId 'bom-manifest'
  $bomManifestPath = Join-Path $bomPackage 'pet.json'
  $manifestWithoutBom = [System.IO.File]::ReadAllBytes($bomManifestPath)
  $manifestWithBom = [byte[]]::new($manifestWithoutBom.Length + 3)
  $manifestWithBom[0] = 0xef
  $manifestWithBom[1] = 0xbb
  $manifestWithBom[2] = 0xbf
  [System.Array]::Copy($manifestWithoutBom, 0, $manifestWithBom, 3, $manifestWithoutBom.Length)
  [System.IO.File]::WriteAllBytes($bomManifestPath, $manifestWithBom)
  Assert-Throws -Action {
    Invoke-DreamSkinPetPackageValidation -PackagePath $bomPackage
  } -MessagePattern 'UTF-8 without a BOM'

  $wrongSizePackage = Join-Path $packages 'wrong-size'
  Write-TestPetPackage -Path $wrongSizePackage -PetId 'wrong-size' -Width 1536 -Height 1872
  Assert-Throws -Action {
    Invoke-DreamSkinPetPackageValidation -PackagePath $wrongSizePackage
  } -MessagePattern 'must be exactly 1536x2288'

  $opaquePackage = Join-Path $packages 'opaque'
  Write-TestPetPackage -Path $opaquePackage -PetId 'opaque-pet' -Alpha $false
  Assert-Throws -Action {
    Invoke-DreamSkinPetPackageValidation -PackagePath $opaquePackage
  } -MessagePattern 'must declare an alpha channel'

  $headerOnlyPackage = Join-Path $packages 'header-only'
  Write-TestPetPackage -Path $headerOnlyPackage -PetId 'header-only'
  Write-TestHeaderOnlyWebp -Path (Join-Path $headerOnlyPackage 'spritesheet.webp')
  Assert-Throws -Action {
    Invoke-DreamSkinPetPackageValidation -PackagePath $headerOnlyPackage
  } -MessagePattern 'must contain a VP8 or VP8L image payload'

  $unsafeIdPackage = Join-Path $packages 'unsafe-id'
  Write-TestPetPackage -Path $unsafeIdPackage -PetId '..\outside'
  Assert-Throws -Action {
    Invoke-DreamSkinPetPackageValidation -PackagePath $unsafeIdPackage
  } -MessagePattern 'id must use lowercase ASCII'

  $removed = Remove-DreamSkinPetPackage -PetId 'test-bunny' -PetsRoot $petsRoot
  if (-not $removed.Removed -or (Test-Path -LiteralPath $installed.Path)) {
    throw 'Pet removal did not remove the exact managed package.'
  }
  Assert-Throws -Action {
    Remove-DreamSkinPetPackage -PetId '..\outside' -PetsRoot $petsRoot
  } -MessagePattern 'Unsafe pet id'

  $leftovers = @(Get-ChildItem -LiteralPath $petsRoot -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '.dream-skin-pet-*' })
  if ($leftovers.Count -ne 0) { throw 'Pet transaction left staging or backup directories behind.' }

  Write-Host 'PASS: v2 pet package validation, transactional install, replacement, and removal.'
} finally {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
