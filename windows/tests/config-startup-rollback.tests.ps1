[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)

$ErrorActionPreference = 'Stop'
. (Join-Path $Root 'scripts\common-windows.ps1')

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) `
  ('dreamskin-config-startup-rollback-' + [guid]::NewGuid().ToString('N'))
$utf8NoBom = [System.Text.UTF8Encoding]::new($false, $true)
New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null

function Write-FixtureConfig {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$Content)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Assert-TextContains {
  param(
    [Parameter(Mandatory = $true)][string]$Content,
    [Parameter(Mandatory = $true)][string]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if (-not $Content.Contains($Expected)) { throw "$Label was not preserved." }
}

try {
  # Exact quoted-key and dollar-bearing values must survive a full rollback,
  # while an unrelated edit made after install remains in place.
  $exactConfig = Join-Path $temporaryRoot 'exact.toml'
  $exactBackup = Join-Path $temporaryRoot 'exact.before.toml'
  $exactOriginal = @(
    'model = "gpt-5"',
    '',
    '[desktop]',
    '  "appearanceTheme" = "system"',
    'appearanceLightCodeThemeId = "theme-$special"',
    'appearanceLightChromeTheme = { accent = "#123456", label = "$keep" }',
    ''
  ) -join "`r`n"
  Write-FixtureConfig -Path $exactConfig -Content $exactOriginal
  Write-DreamSkinAppearanceMarker -BackupPath $exactBackup -Managed $false -ExpectedBytes $null
  $exactMarkerBefore = [System.IO.File]::ReadAllBytes(
    (Get-DreamSkinAppearanceMarkerPath -BackupPath $exactBackup)
  )
  $exactTransaction = Install-DreamSkinBaseTheme -ConfigPath $exactConfig `
    -BackupPath $exactBackup -AppearanceTheme 'dark' -PassThruTransaction
  $exactInstalled = Read-DreamSkinUtf8File -Path $exactConfig
  $exactConcurrent = $exactInstalled + 'unrelatedSetting = "keep-$new"' + "`r`n"
  Write-DreamSkinUtf8FileAtomically -Path $exactConfig -Content $exactConcurrent
  $exactResult = Restore-DreamSkinManagedAppearanceSnapshot -ConfigPath $exactConfig `
    -BackupPath $exactBackup -Transaction $exactTransaction
  $exactRestored = Read-DreamSkinUtf8File -Path $exactConfig
  foreach ($expected in @(
    '  "appearanceTheme" = "system"',
    'appearanceLightCodeThemeId = "theme-$special"',
    'appearanceLightChromeTheme = { accent = "#123456", label = "$keep" }',
    'unrelatedSetting = "keep-$new"'
  )) {
    Assert-TextContains -Content $exactRestored -Expected $expected -Label $expected
  }
  $exactMarkerAfter = [System.IO.File]::ReadAllBytes(
    (Get-DreamSkinAppearanceMarkerPath -BackupPath $exactBackup)
  )
  if ($exactResult.ConflictedKeys.Count -ne 0 -or $exactResult.RestoredKeys.Count -ne 3 -or
    "$($exactResult.MarkerStatus)" -cne 'restored' -or
    -not (Test-DreamSkinBytesEqual -Left $exactMarkerBefore -Right $exactMarkerAfter)) {
    throw 'Exact startup rollback did not restore all managed keys and the prior marker.'
  }

  # A newer edit to one managed key is a conflict. It must remain untouched,
  # while still-matching managed keys roll back and unrelated content survives.
  $conflictConfig = Join-Path $temporaryRoot 'conflict.toml'
  $conflictBackup = Join-Path $temporaryRoot 'conflict.before.toml'
  $conflictOriginal = @(
    '[desktop]',
    'appearanceTheme = "system"',
    'appearanceLightCodeThemeId = "before-code"',
    'appearanceLightChromeTheme = { accent = "#abcdef" }',
    ''
  ) -join "`n"
  Write-FixtureConfig -Path $conflictConfig -Content $conflictOriginal
  $conflictTransaction = Install-DreamSkinBaseTheme -ConfigPath $conflictConfig `
    -BackupPath $conflictBackup -AppearanceTheme 'dark' -PassThruTransaction
  $conflictInstalled = Read-DreamSkinUtf8File -Path $conflictConfig
  $conflictCurrent = $conflictInstalled.Replace(
    'appearanceTheme = "dark"',
    'appearanceTheme = "light"'
  ) + 'unrelated = "preserve"' + "`n"
  Write-DreamSkinUtf8FileAtomically -Path $conflictConfig -Content $conflictCurrent
  $conflictResult = Restore-DreamSkinManagedAppearanceSnapshot -ConfigPath $conflictConfig `
    -BackupPath $conflictBackup -Transaction $conflictTransaction
  $conflictRestored = Read-DreamSkinUtf8File -Path $conflictConfig
  foreach ($expected in @(
    'appearanceTheme = "light"',
    'appearanceLightCodeThemeId = "before-code"',
    'appearanceLightChromeTheme = { accent = "#abcdef" }',
    'unrelated = "preserve"'
  )) {
    Assert-TextContains -Content $conflictRestored -Expected $expected -Label $expected
  }
  $logicalAbsentMarker = Read-DreamSkinAppearanceMarker -BackupPath $conflictBackup
  if (($conflictResult.ConflictedKeys -join ',') -cne 'appearanceTheme' -or
    $conflictResult.RestoredKeys.Count -ne 2 -or
    "$($conflictResult.MarkerStatus)" -cne 'restored' -or
    -not (Test-DreamSkinAppearanceMarkerLogicalAbsent -Marker $logicalAbsentMarker)) {
    throw 'Per-key conflict rollback overwrote a newer edit or failed logical marker restoration.'
  }

  # When install had to create [desktop], restoring absent keys should remove
  # that now-empty section and retain LF byte shape for the original content.
  $absentConfig = Join-Path $temporaryRoot 'absent.toml'
  $absentBackup = Join-Path $temporaryRoot 'absent.before.toml'
  $absentOriginal = "model = `"gpt-5`"`n"
  Write-FixtureConfig -Path $absentConfig -Content $absentOriginal
  $absentTransaction = Install-DreamSkinBaseTheme -ConfigPath $absentConfig `
    -BackupPath $absentBackup -PassThruTransaction
  $absentResult = Restore-DreamSkinManagedAppearanceSnapshot -ConfigPath $absentConfig `
    -BackupPath $absentBackup -Transaction $absentTransaction
  if ((Read-DreamSkinUtf8File -Path $absentConfig) -cne $absentOriginal -or
    $absentResult.RestoredKeys.Count -ne 2) {
    throw 'Rollback did not remove the [desktop] section created solely for managed settings.'
  }

  # A nested chrome table is not touched by install and therefore cannot be
  # claimed or restored by the transaction.
  $nestedConfig = Join-Path $temporaryRoot 'nested.toml'
  $nestedBackup = Join-Path $temporaryRoot 'nested.before.toml'
  $nestedOriginal = @(
    '[desktop]',
    'appearanceTheme = "system"',
    'appearanceLightCodeThemeId = "before-code"',
    '',
    '[desktop.appearanceLightChromeTheme]',
    'accent = "#123456"',
    ''
  ) -join "`n"
  Write-FixtureConfig -Path $nestedConfig -Content $nestedOriginal
  $nestedTransaction = Install-DreamSkinBaseTheme -ConfigPath $nestedConfig `
    -BackupPath $nestedBackup -AppearanceTheme 'dark' -PassThruTransaction
  if ($nestedTransaction.TouchedKeys -ccontains 'appearanceLightChromeTheme') {
    throw 'Install transaction claimed a nested chrome table it intentionally skipped.'
  }
  $null = Restore-DreamSkinManagedAppearanceSnapshot -ConfigPath $nestedConfig `
    -BackupPath $nestedBackup -Transaction $nestedTransaction
  $nestedRestored = Read-DreamSkinUtf8File -Path $nestedConfig
  if ($nestedRestored -notmatch '\[desktop\.appearanceLightChromeTheme\]' -or
    $nestedRestored -match '(?m)^appearanceLightChromeTheme\s*=') {
    throw 'Nested chrome-table rollback introduced or removed a scalar setting.'
  }

  # A marker changed after install is independent concurrent state. Config keys
  # may roll back, but that marker must not be overwritten.
  $markerConflictConfig = Join-Path $temporaryRoot 'marker-conflict.toml'
  $markerConflictBackup = Join-Path $temporaryRoot 'marker-conflict.before.toml'
  Write-FixtureConfig -Path $markerConflictConfig -Content $conflictOriginal
  $markerConflictTransaction = Install-DreamSkinBaseTheme -ConfigPath $markerConflictConfig `
    -BackupPath $markerConflictBackup -AppearanceTheme 'dark' -PassThruTransaction
  Write-DreamSkinAppearanceMarker -BackupPath $markerConflictBackup -Managed $false
  $markerConflictBytes = [System.IO.File]::ReadAllBytes(
    (Get-DreamSkinAppearanceMarkerPath -BackupPath $markerConflictBackup)
  )
  $markerConflictResult = Restore-DreamSkinManagedAppearanceSnapshot `
    -ConfigPath $markerConflictConfig -BackupPath $markerConflictBackup `
    -Transaction $markerConflictTransaction
  $markerConflictAfter = [System.IO.File]::ReadAllBytes(
    (Get-DreamSkinAppearanceMarkerPath -BackupPath $markerConflictBackup)
  )
  if ("$($markerConflictResult.MarkerStatus)" -cne 'conflict-preserved' -or
    -not (Test-DreamSkinBytesEqual -Left $markerConflictBytes -Right $markerConflictAfter)) {
    throw 'Rollback overwrote a concurrently changed appearance marker.'
  }

  # A second writer between rollback read and atomic commit must reject the
  # entire config write and leave ownership metadata in the applied state.
  $raceConfig = Join-Path $temporaryRoot 'race.toml'
  $raceBackup = Join-Path $temporaryRoot 'race.before.toml'
  Write-FixtureConfig -Path $raceConfig -Content $conflictOriginal
  $raceTransaction = Install-DreamSkinBaseTheme -ConfigPath $raceConfig `
    -BackupPath $raceBackup -AppearanceTheme 'dark' -PassThruTransaction
  $raceMarkerBefore = [System.IO.File]::ReadAllBytes(
    (Get-DreamSkinAppearanceMarkerPath -BackupPath $raceBackup)
  )
  $realAtomicUtf8Writer = (Get-Command Write-DreamSkinUtf8FileAtomically -CommandType Function).ScriptBlock
  $script:raceInjected = $false
  try {
    function Write-DreamSkinUtf8FileAtomically {
      param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
        [AllowNull()][byte[]]$ExpectedBytes
      )
      if (-not $script:raceInjected -and
        [System.IO.Path]::GetFullPath($Path) -ieq [System.IO.Path]::GetFullPath($raceConfig) -and
        $PSBoundParameters.ContainsKey('ExpectedBytes')) {
        $script:raceInjected = $true
        [System.IO.File]::AppendAllText($Path, "concurrent = `"keep`"`n", $utf8NoBom)
      }
      & $realAtomicUtf8Writer @PSBoundParameters
    }
    $raceRejected = $false
    try {
      $null = Restore-DreamSkinManagedAppearanceSnapshot -ConfigPath $raceConfig `
        -BackupPath $raceBackup -Transaction $raceTransaction
    } catch {
      $raceRejected = $true
    }
  } finally {
    Set-Item -Path Function:\Write-DreamSkinUtf8FileAtomically -Value $realAtomicUtf8Writer
  }
  $raceMarkerAfter = [System.IO.File]::ReadAllBytes(
    (Get-DreamSkinAppearanceMarkerPath -BackupPath $raceBackup)
  )
  if (-not $raceRejected -or -not $script:raceInjected -or
    (Read-DreamSkinUtf8File -Path $raceConfig) -notmatch 'concurrent = "keep"' -or
    -not (Test-DreamSkinBytesEqual -Left $raceMarkerBefore -Right $raceMarkerAfter)) {
    throw 'Rollback did not reject a config change between its read and atomic write.'
  }

  # Install commits ownership metadata before config. A concurrent config edit
  # that rejects the config commit must still compensate this attempt's marker.
  $commitFailureConfig = Join-Path $temporaryRoot 'install-commit-conflict.toml'
  $commitFailureBackup = Join-Path $temporaryRoot 'install-commit-conflict.before.toml'
  Write-FixtureConfig -Path $commitFailureConfig -Content $conflictOriginal
  $realCommitWriter = (Get-Command Write-DreamSkinUtf8FileAtomically -CommandType Function).ScriptBlock
  $script:commitConflictInjected = $false
  try {
    function Write-DreamSkinUtf8FileAtomically {
      param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
        [AllowNull()][byte[]]$ExpectedBytes
      )
      if (-not $script:commitConflictInjected -and
        [System.IO.Path]::GetFullPath($Path) -ieq
          [System.IO.Path]::GetFullPath($commitFailureConfig) -and
        $PSBoundParameters.ContainsKey('ExpectedBytes')) {
        $script:commitConflictInjected = $true
        [System.IO.File]::AppendAllText(
          $Path, "concurrentInstallEdit = `"keep`"`n", $utf8NoBom
        )
      }
      & $realCommitWriter @PSBoundParameters
    }
    $commitRejected = $false
    try {
      $null = Install-DreamSkinBaseTheme -ConfigPath $commitFailureConfig `
        -BackupPath $commitFailureBackup -AppearanceTheme 'dark' -PassThruTransaction
    } catch {
      $commitRejected = $true
    }
  } finally {
    Set-Item -Path Function:\Write-DreamSkinUtf8FileAtomically -Value $realCommitWriter
  }
  $commitFailureMarker = Read-DreamSkinAppearanceMarker -BackupPath $commitFailureBackup
  if (-not $commitRejected -or -not $script:commitConflictInjected -or
    (Read-DreamSkinUtf8File -Path $commitFailureConfig) -notmatch
      'concurrentInstallEdit = "keep"' -or
    -not (Test-DreamSkinAppearanceMarkerLogicalAbsent -Marker $commitFailureMarker)) {
    throw 'A rejected install config commit left incorrect appearance ownership metadata.'
  }

  # Close the final precondition-check/File.Replace window. File.Replace's
  # backup exposes the exact bytes that were replaced, so a late writer can be
  # restored even when it lands after the initial byte comparison.
  $atomicWindowConfig = Join-Path $temporaryRoot 'atomic-window.toml'
  Write-FixtureConfig -Path $atomicWindowConfig -Content "before = true`n"
  $atomicWindowExpected = [System.IO.File]::ReadAllBytes($atomicWindowConfig)
  $realUnchangedAssertion = (Get-Command Assert-DreamSkinFileUnchanged -CommandType Function).ScriptBlock
  $script:atomicWindowInjected = $false
  try {
    function Assert-DreamSkinFileUnchanged {
      param([string]$Path, [AllowNull()][byte[]]$ExpectedBytes)
      & $realUnchangedAssertion @PSBoundParameters
      if (-not $script:atomicWindowInjected -and
        [System.IO.Path]::GetFullPath($Path) -ieq
          [System.IO.Path]::GetFullPath($atomicWindowConfig)) {
        $script:atomicWindowInjected = $true
        [System.IO.File]::WriteAllText($Path, "lateWriter = `"preserve`"`n", $utf8NoBom)
      }
    }
    $atomicWindowRejected = $false
    try {
      Write-DreamSkinUtf8FileAtomically -Path $atomicWindowConfig `
        -Content "dreamSkin = `"applied`"`n" -ExpectedBytes $atomicWindowExpected
    } catch {
      $atomicWindowRejected = $true
    }
  } finally {
    Set-Item -Path Function:\Assert-DreamSkinFileUnchanged -Value $realUnchangedAssertion
  }
  if (-not $atomicWindowRejected -or -not $script:atomicWindowInjected -or
    (Read-DreamSkinUtf8File -Path $atomicWindowConfig) -cne
      "lateWriter = `"preserve`"`n") {
    throw 'Final atomic replacement overwrote a writer that landed after its precondition check.'
  }

  # A null ExpectedBytes value is an absent-file precondition, not permission
  # to replace a file created after the check.
  $absentWindowPath = Join-Path $temporaryRoot 'absent-window.json'
  $realAbsentAssertion = (Get-Command Assert-DreamSkinFileUnchanged -CommandType Function).ScriptBlock
  $script:absentWindowInjected = $false
  try {
    function Assert-DreamSkinFileUnchanged {
      param([string]$Path, [AllowNull()][byte[]]$ExpectedBytes)
      & $realAbsentAssertion @PSBoundParameters
      if (-not $script:absentWindowInjected -and
        [System.IO.Path]::GetFullPath($Path) -ieq
          [System.IO.Path]::GetFullPath($absentWindowPath)) {
        $script:absentWindowInjected = $true
        [System.IO.File]::WriteAllText($Path, "lateCreator = `"preserve`"`n", $utf8NoBom)
      }
    }
    $absentWindowRejected = $false
    try {
      Write-DreamSkinUtf8FileAtomically -Path $absentWindowPath `
        -Content "dreamSkin = `"new`"`n" -ExpectedBytes $null
    } catch {
      $absentWindowRejected = $true
    }
  } finally {
    Set-Item -Path Function:\Assert-DreamSkinFileUnchanged -Value $realAbsentAssertion
  }
  if (-not $absentWindowRejected -or -not $script:absentWindowInjected -or
    (Read-DreamSkinUtf8File -Path $absentWindowPath) -cne
      "lateCreator = `"preserve`"`n") {
    throw 'Absent-file atomic write overwrote a file created after its precondition check.'
  }

  # If the exact replacement backup cannot be inspected, retain it. It can be
  # the only copy of the writer that was replaced in the final race window.
  $backupReadFailurePath = Join-Path $temporaryRoot 'backup-read-failure.toml'
  Write-FixtureConfig -Path $backupReadFailurePath -Content "before = true`n"
  $backupReadExpected = [System.IO.File]::ReadAllBytes($backupReadFailurePath)
  $realBackupAssertion = (Get-Command Assert-DreamSkinFileUnchanged -CommandType Function).ScriptBlock
  $realArtifactReader = (Get-Command Read-DreamSkinAtomicArtifactBytes -CommandType Function).ScriptBlock
  $script:backupReadConflictInjected = $false
  try {
    function Assert-DreamSkinFileUnchanged {
      param([string]$Path, [AllowNull()][byte[]]$ExpectedBytes)
      & $realBackupAssertion @PSBoundParameters
      if (-not $script:backupReadConflictInjected -and
        [System.IO.Path]::GetFullPath($Path) -ieq
          [System.IO.Path]::GetFullPath($backupReadFailurePath)) {
        $script:backupReadConflictInjected = $true
        [System.IO.File]::WriteAllText($Path, "capturedWriter = `"retain`"`n", $utf8NoBom)
      }
    }
    function Read-DreamSkinAtomicArtifactBytes {
      param([string]$Path)
      if ($Path.EndsWith('.replace-backup', [System.StringComparison]::Ordinal)) {
        throw 'forced replacement-backup read failure'
      }
      & $realArtifactReader @PSBoundParameters
    }
    $backupReadRejected = $false
    try {
      Write-DreamSkinUtf8FileAtomically -Path $backupReadFailurePath `
        -Content "dreamSkin = `"applied`"`n" -ExpectedBytes $backupReadExpected
    } catch {
      $backupReadRejected = $true
    }
  } finally {
    Set-Item -Path Function:\Assert-DreamSkinFileUnchanged -Value $realBackupAssertion
    Set-Item -Path Function:\Read-DreamSkinAtomicArtifactBytes -Value $realArtifactReader
  }
  $retainedArtifacts = @(Get-ChildItem -LiteralPath $temporaryRoot -Force |
    Where-Object { $_.Name.EndsWith('.replace-backup', [System.StringComparison]::Ordinal) })
  if (-not $backupReadRejected -or -not $script:backupReadConflictInjected -or
    $retainedArtifacts.Count -ne 1 -or
    (Read-DreamSkinUtf8File -Path $retainedArtifacts[0].FullName) -cne
      "capturedWriter = `"retain`"`n") {
    throw 'An unreadable replacement backup was deleted or did not retain the displaced writer.'
  }
  [System.IO.File]::Delete($retainedArtifacts[0].FullName)
} finally {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output 'PASS: startup appearance rollback preserves concurrent config and marker changes.'
