if (-not (Get-Command Enter-DreamSkinOperationLock -ErrorAction SilentlyContinue)) {
  . (Join-Path $PSScriptRoot 'common-windows.ps1')
}

$script:DreamSkinPetManifestName = 'pet.json'
$script:DreamSkinPetSpritesheetName = 'spritesheet.webp'

function Assert-DreamSkinPetPathNoReparseComponents {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetPathRoot($fullPath)
  $current = $fullPath
  while ($true) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Managed pet path contains a junction or symbolic link: $current"
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

function Ensure-DreamSkinPetManagedDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Root
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullRoot = [System.IO.Path]::GetFullPath($Root)
  if (-not ((Test-DreamSkinPathEqual -Left $fullPath -Right $fullRoot) -or
      (Test-DreamSkinPathWithin -Path $fullPath -Root $fullRoot))) {
    throw "Managed pet path escaped its root: $fullPath"
  }
  Assert-DreamSkinPetPathNoReparseComponents -Path $fullPath
  if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
    throw "Managed pet path is a file, not a directory: $fullPath"
  }
  New-Item -ItemType Directory -Force -Path $fullPath | Out-Null
  Assert-DreamSkinPetPathNoReparseComponents -Path $fullPath
  if (-not (Test-Path -LiteralPath $fullPath -PathType Container)) {
    throw "Managed pet directory could not be created: $fullPath"
  }
}

function Get-DreamSkinPetRoot {
  param([string]$PetsRoot)
  if ($PetsRoot) { return [System.IO.Path]::GetFullPath($PetsRoot) }
  $codexHome = if ($env:CODEX_HOME) {
    $env:CODEX_HOME
  } elseif ($env:USERPROFILE) {
    Join-Path $env:USERPROFILE '.codex'
  } else {
    throw 'Cannot resolve the Codex home directory. Set CODEX_HOME or USERPROFILE.'
  }
  return [System.IO.Path]::GetFullPath((Join-Path $codexHome 'pets'))
}

function Test-DreamSkinPetId {
  param([string]$PetId)
  return [bool]($PetId -and $PetId.Length -le 64 -and
    $PetId -cmatch '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$' -and
    -not $PetId.Contains('--'))
}

function Invoke-DreamSkinPetPackageValidation {
  param([Parameter(Mandatory = $true)][string]$PackagePath)
  $fullPath = [System.IO.Path]::GetFullPath($PackagePath)
  if (-not (Test-Path -LiteralPath $fullPath -PathType Container)) {
    throw "Pet package directory does not exist: $fullPath"
  }
  Assert-DreamSkinPetPathNoReparseComponents -Path $fullPath
  $node = Get-DreamSkinNodeRuntime
  $validator = Join-Path $PSScriptRoot 'pet-package.mjs'
  $validation = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    $validator, '--check', $fullPath)
  if ($validation.ExitCode -ne 0) {
    $detail = ($validation.Output -join "`n").Trim()
    if (-not $detail) { $detail = 'unknown validation error' }
    throw "Pet package validation failed: $detail"
  }
  try {
    $manifest = ($validation.Output -join "`n") | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw 'Pet package validator returned invalid JSON.'
  }
  if (-not (Test-DreamSkinPetId -PetId "$($manifest.id)")) {
    throw 'Pet package validator returned an unsafe id.'
  }
  return $manifest
}

function Remove-DreamSkinManagedPetDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$PetsRoot
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullRoot = [System.IO.Path]::GetFullPath($PetsRoot)
  if (-not (Test-DreamSkinPathWithin -Path $fullPath -Root $fullRoot)) {
    throw "Refusing to remove a pet path outside the managed pet root: $fullPath"
  }
  if (-not (Test-Path -LiteralPath $fullPath)) { return }
  Assert-DreamSkinPetPathNoReparseComponents -Path $fullPath
  Remove-Item -LiteralPath $fullPath -Recurse -Force -ErrorAction Stop
}

function Install-DreamSkinPetPackage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$PackagePath,
    [string]$PetsRoot,
    [switch]$Replace
  )

  $source = [System.IO.Path]::GetFullPath($PackagePath)
  $manifest = Invoke-DreamSkinPetPackageValidation -PackagePath $source
  $root = Get-DreamSkinPetRoot -PetsRoot $PetsRoot
  if ((Test-DreamSkinPathEqual -Left $source -Right $root) -or
    (Test-DreamSkinPathWithin -Path $source -Root $root)) {
    throw 'Pet package source must be outside the managed Codex pet directory.'
  }

  $petId = "$($manifest.id)"
  $target = Join-Path $root $petId
  if (-not (Test-DreamSkinPathWithin -Path $target -Root $root)) {
    throw "Pet id escaped the managed pet root: $petId"
  }
  $stage = Join-Path $root ".dream-skin-pet-stage-$([guid]::NewGuid().ToString('N'))"
  $backup = Join-Path $root ".dream-skin-pet-backup-$([guid]::NewGuid().ToString('N'))"
  $movedExisting = $false
  $published = $false
  $hadExisting = $false
  $mutex = Enter-DreamSkinOperationLock

  try {
    Ensure-DreamSkinPetManagedDirectory -Path $root -Root $root
    if (Test-Path -LiteralPath $target) {
      Assert-DreamSkinPetPathNoReparseComponents -Path $target
      if (-not (Test-Path -LiteralPath $target -PathType Container)) {
        throw "Existing pet target is not a directory: $target"
      }
      if (-not $Replace) {
        throw "Pet already exists. Re-run with -Replace to update it: $petId"
      }
      $hadExisting = $true
    }

    Ensure-DreamSkinPetManagedDirectory -Path $stage -Root $root
    Copy-Item -LiteralPath (Join-Path $source $script:DreamSkinPetManifestName) `
      -Destination (Join-Path $stage $script:DreamSkinPetManifestName) -Force
    Copy-Item -LiteralPath (Join-Path $source $script:DreamSkinPetSpritesheetName) `
      -Destination (Join-Path $stage $script:DreamSkinPetSpritesheetName) -Force
    $stagedManifest = Invoke-DreamSkinPetPackageValidation -PackagePath $stage
    if ("$($stagedManifest.id)" -cne $petId) { throw 'Staged pet id changed during copy.' }

    if (Test-Path -LiteralPath $target) {
      Move-Item -LiteralPath $target -Destination $backup -ErrorAction Stop
      $movedExisting = $true
    }
    Move-Item -LiteralPath $stage -Destination $target -ErrorAction Stop
    $published = $true

    if ($movedExisting) {
      Remove-DreamSkinManagedPetDirectory -Path $backup -PetsRoot $root
      $movedExisting = $false
    }
    return [pscustomobject]@{
      Id = $petId
      DisplayName = "$($stagedManifest.displayName)"
      Path = $target
      SpriteVersionNumber = 2
      Replaced = $hadExisting
    }
  } catch {
    if (-not $published -and $movedExisting -and (Test-Path -LiteralPath $backup) -and
      -not (Test-Path -LiteralPath $target)) {
      try {
        Move-Item -LiteralPath $backup -Destination $target -ErrorAction Stop
        $movedExisting = $false
      } catch {
        Write-Warning "Pet update rollback could not restore the previous package from: $backup"
      }
    }
    throw
  } finally {
    if (Test-Path -LiteralPath $stage) {
      try { Remove-DreamSkinManagedPetDirectory -Path $stage -PetsRoot $root } catch { }
    }
    if (-not $movedExisting -and (Test-Path -LiteralPath $backup)) {
      try { Remove-DreamSkinManagedPetDirectory -Path $backup -PetsRoot $root } catch { }
    }
    Exit-DreamSkinOperationLock -Mutex $mutex
  }
}

function Remove-DreamSkinPetPackage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$PetId,
    [string]$PetsRoot
  )
  if (-not (Test-DreamSkinPetId -PetId $PetId)) { throw "Unsafe pet id: $PetId" }
  $root = Get-DreamSkinPetRoot -PetsRoot $PetsRoot
  $target = Join-Path $root $PetId
  if (-not (Test-DreamSkinPathWithin -Path $target -Root $root)) {
    throw "Pet id escaped the managed pet root: $PetId"
  }
  $tombstone = Join-Path $root ".dream-skin-pet-remove-$([guid]::NewGuid().ToString('N'))"
  $moved = $false
  $mutex = Enter-DreamSkinOperationLock
  try {
    if (-not (Test-Path -LiteralPath $target -PathType Container)) {
      throw "Pet is not installed: $PetId"
    }
    Assert-DreamSkinPetPathNoReparseComponents -Path $target
    Move-Item -LiteralPath $target -Destination $tombstone -ErrorAction Stop
    $moved = $true
    Remove-DreamSkinManagedPetDirectory -Path $tombstone -PetsRoot $root
    $moved = $false
    return [pscustomobject]@{ Id = $PetId; Path = $target; Removed = $true }
  } catch {
    if ($moved -and (Test-Path -LiteralPath $tombstone) -and -not (Test-Path -LiteralPath $target)) {
      try {
        Move-Item -LiteralPath $tombstone -Destination $target -ErrorAction Stop
        $moved = $false
      } catch {
        Write-Warning "Pet removal rollback could not restore the package from: $tombstone"
      }
    }
    throw
  } finally {
    if (-not $moved -and (Test-Path -LiteralPath $tombstone)) {
      try { Remove-DreamSkinManagedPetDirectory -Path $tombstone -PetsRoot $root } catch { }
    }
    Exit-DreamSkinOperationLock -Mutex $mutex
  }
}
