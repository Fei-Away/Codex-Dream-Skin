[CmdletBinding()]
param(
  [ValidateSet('Save', 'Apply', 'Shortcut')][string]$Action,
  [ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId,
  [string]$SavedThemeDirectory,
  [string]$BackgroundPath,
  [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'),
  [switch]$FunctionsOnly
)

$ErrorActionPreference = 'Stop'

function New-DreamSkinPanelDraft {
  param([string]$StateRoot, [string]$SavedThemeDirectory, [string]$BackgroundPath)
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  $source = $paths.Active
  if ($SavedThemeDirectory) {
    $source = [IO.Path]::GetFullPath($SavedThemeDirectory)
    if (-not (Test-DreamSkinThemePathWithin -Path $source -Root $paths.Saved)) {
      throw 'The selected theme is outside the managed theme library.'
    }
  }
  $loaded = Read-DreamSkinTheme -ThemeDirectory $source
  $css = Join-Path $source 'theme.css'
  if (Test-Path -LiteralPath $css -PathType Leaf) { Assert-DreamSkinSafeCssFile -Path $css } else { $css = $null }
  $image = $loaded.ImagePath
  if ($BackgroundPath) {
    $image = [IO.Path]::GetFullPath($BackgroundPath)
    Assert-DreamSkinNoReparseComponents -Path $image
    Assert-DreamSkinImageFile -Path $image
  }
  $stage = Join-Path $paths.Root ('.panel-draft-' + [guid]::NewGuid().ToString('N'))
  Ensure-DreamSkinManagedDirectory -Path $stage -Root $paths.Root
  try {
    # All expensive/media/CSS validation happens before publishing any files.
    $contract = $loaded.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
    $draft = Set-DreamSkinActiveTheme -ImagePath $image -Theme $contract -SafeCssPath $css -StateRoot $stage
    return [pscustomobject]@{
      Root = $stage; Directory = $draft.Directory
      Fingerprint = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $draft.Directory
    }
  } catch {
    Remove-DreamSkinManagedDirectoryVerified -Path $stage -Root $paths.Root
    throw
  }
}

function Set-DreamSkinPanelDraft {
  param([string]$StateRoot, [string]$SavedThemeDirectory, [string]$BackgroundPath)
  # Startup owns the surrounding snapshot and operation lock.
  $draft = New-DreamSkinPanelDraft -StateRoot $StateRoot -SavedThemeDirectory $SavedThemeDirectory -BackgroundPath $BackgroundPath
  try {
    $candidate = Read-DreamSkinTheme -ThemeDirectory $draft.Directory
    $css = Join-Path $draft.Directory 'theme.css'
    if (-not (Test-Path -LiteralPath $css -PathType Leaf)) { $css = $null }
    $null = Set-DreamSkinActiveTheme -ImagePath $candidate.ImagePath -Theme $candidate.Theme -SafeCssPath $css -StateRoot $StateRoot
    $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
    if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -cne $draft.Fingerprint) {
      throw 'The committed theme does not match its validated draft.'
    }
  } finally { Remove-DreamSkinManagedDirectoryVerified -Path $draft.Root -Root $StateRoot }
}

function Write-DreamSkinPanelResult {
  param([string]$StateRoot, [string]$OperationId, [string]$Action, [string]$Outcome,
    [string]$Category, [string]$Message, [string]$DiskRecovery = 'not-needed', [string]$VisibleRecovery = 'not-needed')
  if ($OperationId -cnotmatch '^[a-f0-9]{32}$') { throw 'Invalid panel operation ID.' }
  Ensure-DreamSkinManagedDirectory -Path $StateRoot -Root $StateRoot
  $path = Join-Path $StateRoot ('.panel-result-' + $OperationId + '.json')
  Assert-DreamSkinNoReparseComponents -Path $path
  if (Test-Path -LiteralPath $path) { throw 'The panel operation ID was already used.' }
  $result = [ordered]@{ schemaVersion = 1; operationId = $OperationId; action = $Action
    outcome = $Outcome; category = $Category; message = $Message
    diskRecovery = $DiskRecovery; visibleRecovery = $VisibleRecovery }
  Write-DreamSkinUtf8FileAtomically -Path $path -Content ($result | ConvertTo-Json -Compress)
}

function Write-DreamSkinPanelEvent {
  param([string]$StateRoot, [string]$OperationId, [string]$Action, [string]$Stage,
    [string]$Outcome, [string]$Category, [string]$Message)
  try {
    $logScript = Join-Path $PSScriptRoot 'operation-log.ps1'
    if (-not (Get-Command Write-DreamSkinOperationEvent -ErrorAction SilentlyContinue) -and
      (Test-Path -LiteralPath $logScript -PathType Leaf)) { . $logScript }
    if (Get-Command Write-DreamSkinOperationEvent -ErrorAction SilentlyContinue) {
      $null = Write-DreamSkinOperationEvent -StateRoot $StateRoot -OperationId $OperationId -Source panel `
        -Action $Action -Stage $Stage -Outcome $Outcome -Category $Category -Message $Message
    }
  } catch { Write-Warning 'The operation log is unavailable.' }
}

function Invoke-DreamSkinPanelVisibleRecovery {
  param([string]$StateRoot)
  if (Test-DreamSkinPaused -StateRoot $StateRoot) { return 'not-needed' }
  try {
    $session = Get-DreamSkinLiveSessionContext -StateRoot $StateRoot
    if ($null -eq $session) { return 'unverified' }
    $codex = Get-DreamSkinCodexInstallFromState -State $session.State
    if ($null -eq $codex) { return 'blocked' }
    $identity = Get-DreamSkinVerifiedCdpIdentity -Port $session.Port -Codex $codex
    if ($null -eq $identity -or $identity.BrowserId -cne $session.BrowserId) { return 'blocked' }
    $arguments = @($session.Injector, '--port', "$($session.Port)", '--browser-id', $session.BrowserId,
      '--theme-dir', $session.Paths.Active, '--timeout-ms', '15000')
    $once = Invoke-DreamSkinNative -FilePath $session.NodePath -ArgumentList ($arguments + '--once')
    if ($once.ExitCode -ne 0) { return 'unverified' }
    $verify = Invoke-DreamSkinNative -FilePath $session.NodePath -ArgumentList ($arguments + '--verify')
    if ($verify.ExitCode -eq 0) { return 'verified' }
  } catch {}
  return 'unverified'
}

function Remove-DreamSkinPanelSaveJournal {
  param([string]$StateRoot)
  $path = Join-Path $StateRoot '.panel-pending-save.json'
  Assert-DreamSkinNoReparseComponents -Path $path
  Remove-Item -LiteralPath $path -Force -ErrorAction Stop
  if (Test-Path -LiteralPath $path) { throw 'The pending save journal could not be cleared.' }
}

function Repair-DreamSkinPanelSave {
  param([string]$StateRoot)
  # Caller must hold Operation. Never seed a fallback over an interrupted save.
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  $journalPath = Join-Path $paths.Root '.panel-pending-save.json'
  Assert-DreamSkinNoReparseComponents -Path $journalPath
  if (-not (Test-Path -LiteralPath $journalPath)) { return 'not-needed' }
  if (-not (Test-Path -LiteralPath $journalPath -PathType Leaf)) { throw 'Pending save journal is not a file.' }
  $stream = [IO.File]::Open($journalPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    if ($stream.Length -lt 1 -or $stream.Length -gt 4096) { throw 'Invalid pending save journal size.' }
    $bytes = [byte[]]::new([int]$stream.Length)
    $offset = 0
    while ($offset -lt $bytes.Length) {
      $read = $stream.Read($bytes, $offset, $bytes.Length - $offset)
      if ($read -le 0) { throw 'Truncated pending save journal.' }
      $offset += $read
    }
    $journal = (ConvertFrom-DreamSkinUtf8Bytes -Bytes $bytes -Path $journalPath) | ConvertFrom-Json
  } finally { $stream.Dispose() }
  if ($null -eq $journal -or $journal -is [array] -or $journal -is [string] -or
    @($journal.PSObject.Properties).Count -ne 6 -or
    ($journal.schemaVersion -isnot [int] -and $journal.schemaVersion -isnot [long]) -or $journal.schemaVersion -ne 1 -or
    $journal.operationId -isnot [string] -or $journal.operationId -cnotmatch '^[a-f0-9]{32}$' -or
    $journal.backupName -isnot [string] -or $journal.backupName -cne ('.panel-backup-' + $journal.operationId) -or
    $journal.draftName -isnot [string] -or $journal.draftName -cnotmatch '^\.panel-draft-[a-f0-9]{32}$' -or
    $journal.oldFingerprint -isnot [string] -or $journal.oldFingerprint -cnotmatch '^[a-f0-9]{64}$' -or
    $journal.newFingerprint -isnot [string] -or $journal.newFingerprint -cnotmatch '^[a-f0-9]{64}$') {
    throw 'Invalid pending save journal contract.'
  }
  $backup = Join-Path $paths.Root $journal.backupName
  $draftRoot = Join-Path $paths.Root $journal.draftName
  $draftActive = Join-Path $draftRoot 'active-theme'
  foreach ($path in @($backup, $draftRoot, $draftActive, $paths.Active)) { Assert-DreamSkinNoReparseComponents -Path $path }
  $current = $null
  if (Test-Path -LiteralPath $paths.Active) { $current = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active }
  if ($null -ne $current -and $current -cne $journal.oldFingerprint -and $current -cne $journal.newFingerprint) {
    throw 'Newer settings superseded pending-save recovery; backups and journal were preserved.'
  }
  if (Test-Path -LiteralPath $backup) {
    if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $backup) -cne $journal.oldFingerprint) {
      throw 'Pending-save recovery backup changed.'
    }
    # Copy only validated runtime files to a fresh complete directory, preserving
    # the old backup across another process crash during this recovery.
    if ($current -cne $journal.oldFingerprint) {
      $old = Read-DreamSkinTheme -ThemeDirectory $backup
      $oldCss = Join-Path $backup 'theme.css'
      if (Test-Path -LiteralPath $oldCss -PathType Leaf) { Assert-DreamSkinSafeCssFile -Path $oldCss }
      $recoveryStage = Join-Path $paths.Root ('.panel-recover-' + [guid]::NewGuid().ToString('N'))
      Ensure-DreamSkinManagedDirectory -Path $recoveryStage -Root $paths.Root
      Copy-Item -LiteralPath $old.ImagePath -Destination (Join-Path $recoveryStage ([IO.Path]::GetFileName($old.ImagePath))) -Force
      $contract = $old.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
      $contract.image = [IO.Path]::GetFileName($old.ImagePath)
      Write-DreamSkinTheme -ThemeDirectory $recoveryStage -Theme $contract
      if (Test-Path -LiteralPath $oldCss -PathType Leaf) { Copy-Item -LiteralPath $oldCss -Destination (Join-Path $recoveryStage 'theme.css') -Force }
      if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $recoveryStage) -cne $journal.oldFingerprint) { throw 'The recovery stage failed content verification.' }
      # Check identity again immediately before removing the published new theme.
      if (Test-Path -LiteralPath $paths.Active) {
        if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -cne $journal.newFingerprint) { throw 'Current settings changed during recovery.' }
        Remove-DreamSkinManagedDirectoryVerified -Path $paths.Active -Root $paths.Root
      }
      Move-Item -LiteralPath $recoveryStage -Destination $paths.Active
    }
  } elseif ($current -cne $journal.oldFingerprint) {
    throw 'Pending-save backup is unavailable; current settings were preserved.'
  }
  if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -cne $journal.oldFingerprint) { throw 'Pending-save disk recovery failed verification.' }
  # If clear fails, retain the backup and retry idempotently next time.
  Remove-DreamSkinPanelSaveJournal -StateRoot $paths.Root
  $visible = Invoke-DreamSkinPanelVisibleRecovery -StateRoot $paths.Root
  Write-DreamSkinPanelEvent -StateRoot $paths.Root -OperationId $journal.operationId -Action Save -Stage interrupted-recovery -Outcome restored -Category $visible -Message 'An interrupted save was recovered before initialization; visible recovery is tracked separately.'
  if ((Test-Path -LiteralPath $backup) -and $visible -in @('verified', 'not-needed')) {
    try { Remove-DreamSkinManagedDirectoryVerified -Path $backup -Root $paths.Root } catch {}
  }
  # Unknown or changed stages are retained as evidence, never blindly removed.
  try {
    if ((Test-Path -LiteralPath $draftActive) -and
      (Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $draftActive) -ceq $journal.newFingerprint) {
      Remove-DreamSkinManagedDirectoryVerified -Path $draftRoot -Root $paths.Root
    }
  } catch { Write-Warning 'Interrupted save was restored; an unverified draft was retained.' }
  return 'restored'
}

function Save-DreamSkinPanelSettings {
  param([string]$StateRoot, [ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId, [string]$SavedThemeDirectory, [string]$BackgroundPath)
  $lock = $null; $draft = $null; $oldMoved = $false; $published = $false
  $diskRecovery = 'not-needed'; $category = 'validation-failed'; $oldFingerprint = $null
  $journalWritten = $false
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  $backup = Join-Path $paths.Root ('.panel-backup-' + $OperationId)
  try {
    $category = 'operation-busy'
    $lock = Enter-DreamSkinOperationLock
    $category = 'recovery-blocked'
    $null = Repair-DreamSkinPanelSave -StateRoot $StateRoot
    $category = 'validation-failed'
    $null = Initialize-DreamSkinThemeStore -SkillRoot (Split-Path -Parent $script:PanelScriptRoot) -StateRoot $StateRoot
    Assert-DreamSkinNoReparseComponents -Path $backup
    if (Test-Path -LiteralPath $backup) { throw 'An existing recovery backup must be preserved.' }
    $oldFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active
    $draft = New-DreamSkinPanelDraft -StateRoot $StateRoot -SavedThemeDirectory $SavedThemeDirectory -BackgroundPath $BackgroundPath
    if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -cne $oldFingerprint) {
      throw 'The active settings changed before commit.'
    }
    $category = 'save-failed'
    $journalPath = Join-Path $paths.Root '.panel-pending-save.json'
    Assert-DreamSkinNoReparseComponents -Path $journalPath
    if (Test-Path -LiteralPath $journalPath) { throw 'A pending save requires recovery first.' }
    $journal = [ordered]@{ schemaVersion = 1; operationId = $OperationId
      backupName = [IO.Path]::GetFileName($backup); draftName = [IO.Path]::GetFileName($draft.Root)
      oldFingerprint = $oldFingerprint; newFingerprint = $draft.Fingerprint }
    Write-DreamSkinUtf8FileAtomically -Path $journalPath -Content ($journal | ConvertTo-Json -Compress)
    $journalWritten = $true
    # Pause and transparency preference files are deliberately never changed.
    # Rename complete directories; theme.json never points at a partial image/CSS.
    Assert-DreamSkinNoReparseComponents -Path $paths.Active
    Move-Item -LiteralPath $paths.Active -Destination $backup
    $oldMoved = $true
    Move-Item -LiteralPath $draft.Directory -Destination $paths.Active
    $published = $true
    if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -cne $draft.Fingerprint) {
      throw 'Published settings failed content verification.'
    }
    # Archive the selected image before declaring success. A failed archive is
    # a failed save, recovered below, rather than an unexplained partial save.
    $loaded = Read-DreamSkinTheme -ThemeDirectory $paths.Active
    Ensure-DreamSkinManagedDirectory -Path $paths.Images -Root $paths.Root
    $archive = Join-Path $paths.Images ([IO.Path]::GetFileName($loaded.ImagePath))
    Assert-DreamSkinNoReparseComponents -Path $archive
    Copy-Item -LiteralPath $loaded.ImagePath -Destination $archive -Force
    Assert-DreamSkinImageFile -Path $archive
    Remove-DreamSkinPanelSaveJournal -StateRoot $paths.Root
    $journalWritten = $false
    # Backup cleanup failure does not undo a successfully published save.
    try { Remove-DreamSkinManagedDirectoryVerified -Path $backup -Root $paths.Root } catch {
      Write-Warning 'Saved settings are valid; the previous recovery backup was retained.'
    }
    return [pscustomobject]@{ Outcome = 'success'; Category = 'none'; DiskRecovery = 'not-needed'; VisibleRecovery = 'not-needed'
      Message = '启动设置已保存；下次默认启动将使用此主题和背景。已运行的皮肤也可能随之更新。' }
  } catch {
    if ($category -eq 'recovery-blocked') { $diskRecovery = 'blocked' }
    if ($oldMoved) {
      $diskRecovery = 'blocked'
      try {
        if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $backup) -cne $oldFingerprint) {
          throw 'The recovery backup changed.'
        }
        if ($published) {
          if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -cne $draft.Fingerprint) {
            throw 'Newer external changes superseded recovery.'
          }
          Remove-DreamSkinManagedDirectoryVerified -Path $paths.Active -Root $paths.Root
        } elseif (Test-Path -LiteralPath $paths.Active) { throw 'An unexpected active directory blocks recovery.' }
        Move-Item -LiteralPath $backup -Destination $paths.Active
        if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -cne $oldFingerprint) { throw 'Restored settings failed verification.' }
        $diskRecovery = 'restored'
      } catch { Write-Warning 'Settings recovery was blocked; the private backup was retained.' }
    }
    if ($journalWritten -and (-not $oldMoved -or $diskRecovery -eq 'restored')) {
      try { Remove-DreamSkinPanelSaveJournal -StateRoot $paths.Root; $journalWritten = $false } catch {
        $diskRecovery = 'blocked'
        Write-Warning 'The recovery journal could not be cleared; it was retained for the next locked repair.'
      }
    }
    $visible = if ($published -or $category -eq 'recovery-blocked') { 'unverified' } else { 'not-needed' }
    if ($published -and $diskRecovery -eq 'restored') {
      $visible = Invoke-DreamSkinPanelVisibleRecovery -StateRoot $StateRoot
      if ($visible -in @('unverified', 'blocked')) {
        # Keep a complete minimal old-theme snapshot even after the directory
        # rename recovery succeeded, until visible recovery can be confirmed.
        try {
          Ensure-DreamSkinManagedDirectory -Path $backup -Root $paths.Root
          $restored = Read-DreamSkinTheme -ThemeDirectory $paths.Active
          Copy-Item -LiteralPath $restored.ThemePath -Destination (Join-Path $backup 'theme.json') -Force
          Copy-Item -LiteralPath $restored.ImagePath -Destination (Join-Path $backup ([IO.Path]::GetFileName($restored.ImagePath))) -Force
          $restoredCss = Join-Path $paths.Active 'theme.css'
          if (Test-Path -LiteralPath $restoredCss -PathType Leaf) {
            Assert-DreamSkinSafeCssFile -Path $restoredCss
            Copy-Item -LiteralPath $restoredCss -Destination (Join-Path $backup 'theme.css') -Force
          }
          if ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $backup) -cne $oldFingerprint) { throw 'Recovery snapshot verification failed.' }
        } catch { Write-Warning 'Disk settings were restored, but a visible recovery evidence copy could not be completed.' }
      }
      Write-DreamSkinPanelEvent -StateRoot $StateRoot -OperationId $OperationId -Action Save -Stage recovery -Outcome $diskRecovery -Category $visible -Message 'Disk settings were restored; visible recovery has a separate status.'
    }
    return [pscustomobject]@{ Outcome = 'failure'; Category = $category; DiskRecovery = $diskRecovery; VisibleRecovery = $visible
      Message = $(if ($category -eq 'operation-busy') { '另一项皮肤操作正在进行，请稍后重试。' }
        elseif ($category -eq 'recovery-blocked') { '上一次保存仍需恢复，原恢复备份与记录已保留，请查看日志。' }
        elseif ($diskRecovery -eq 'restored' -and $visible -eq 'verified') { '保存失败；原启动设置与窗口外观已验证恢复。' }
        elseif ($diskRecovery -eq 'restored') { '保存失败，原启动设置已恢复；当前窗口外观尚未验证。' }
        elseif ($diskRecovery -eq 'blocked') { '保存失败且恢复未完成，恢复备份已保留，请查看日志。' }
        else { '设置校验失败，原启动设置保持不变，请检查主题和图片。' }) }
  } finally {
    if ($draft -and -not $journalWritten -and (Test-Path -LiteralPath $draft.Root)) {
      try { Remove-DreamSkinManagedDirectoryVerified -Path $draft.Root -Root $paths.Root } catch {}
    }
    if ($lock) { Exit-DreamSkinOperationLock -Mutex $lock }
  }
}

function Invoke-DreamSkinPanelApply {
  param([string]$StateRoot, [ValidatePattern('^[a-f0-9]{32}$')][string]$OperationId, [string]$SavedThemeDirectory, [string]$BackgroundPath)
  # Do not hold Operation while waiting for the startup child owning that lock.
  $start = Join-Path $script:PanelScriptRoot 'start-dream-skin.ps1'
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', $start,
    '-StateRoot', $StateRoot, '-ResultToken', $OperationId, '-PanelRequest', '-PromptRestart', '-OperationSource', 'panel')
  if ($SavedThemeDirectory) { $arguments += @('-SavedThemeDirectory', $SavedThemeDirectory) }
  if ($BackgroundPath) { $arguments += @('-BackgroundPath', $BackgroundPath) }
  $hostExe = Join-Path $PSHOME 'powershell.exe'
  if (-not (Test-Path -LiteralPath $hostExe)) { $hostExe = Join-Path $PSHOME 'pwsh.exe' }
  foreach ($oldResult in @((Get-DreamSkinStartResultPath -StateRoot $StateRoot -Token $OperationId),
    (Join-Path $StateRoot ('.panel-start-recovery-' + $OperationId + '.json')))) {
    Assert-DreamSkinNoReparseComponents -Path $oldResult
    if (Test-Path -LiteralPath $oldResult) { throw 'The startup result token was already used.' }
  }
  $child = Start-Process -FilePath $hostExe -ArgumentList (ConvertTo-DreamSkinArgumentLine -Arguments $arguments) -WindowStyle Hidden -PassThru
  try {
    $child.WaitForExit()
    $startResult = $null
    $strictPath = Get-DreamSkinStartResultPath -StateRoot $StateRoot -Token $OperationId
    Assert-DreamSkinNoReparseComponents -Path $strictPath
    if (Test-Path -LiteralPath $strictPath -PathType Leaf) {
      $startResult = Read-DreamSkinStartResult -StateRoot $StateRoot -Token $OperationId
    }
    $recoveryPath = Join-Path $StateRoot ('.panel-start-recovery-' + $OperationId + '.json')
    $recovery = $null
    if (Test-Path -LiteralPath $recoveryPath -PathType Leaf) {
      Assert-DreamSkinNoReparseComponents -Path $recoveryPath
      if ((Get-Item -LiteralPath $recoveryPath).Length -gt 4096) { throw 'Oversized recovery result.' }
      $recovery = Read-DreamSkinUtf8File -Path $recoveryPath | ConvertFrom-Json
      $allowed = @('not-needed', 'restored', 'blocked', 'superseded', 'verified', 'unverified')
      if ($null -eq $recovery -or $recovery -is [array] -or $recovery -is [string] -or
        @($recovery.PSObject.Properties).Count -ne 5 -or
        ($recovery.schemaVersion -isnot [int] -and $recovery.schemaVersion -isnot [long]) -or
        $recovery.schemaVersion -ne 1 -or $recovery.operationId -isnot [string] -or $recovery.operationId -cne $OperationId -or
        $recovery.outcome -cnotin @('success', 'failure', 'cancelled') -or
        $recovery.diskRecovery -cnotin $allowed -or $recovery.visibleRecovery -cnotin $allowed) { throw 'Invalid recovery result.' }
    }
    if ($null -eq $startResult) {
      if ($child.ExitCode -eq 0 -and $recovery -and $recovery.outcome -ceq 'cancelled') {
        return [pscustomobject]@{ Outcome = 'cancelled'; Category = 'cancelled'; Message = '已取消应用，启动设置保持不变。'; DiskRecovery = 'not-needed'; VisibleRecovery = 'not-needed' }
      }
      return [pscustomobject]@{ Outcome = 'failure'; Category = 'missing-start-result'; Message = '启动未返回可验证结果，请查看日志。'; DiskRecovery = 'unverified'; VisibleRecovery = 'unverified' }
    }
    if ($startResult.outcome -eq 'success' -and $child.ExitCode -ne 0) {
      return [pscustomobject]@{ Outcome = 'failure'; Category = 'conflicting-start-result'; Message = '启动结果与进程状态不一致，请查看日志。'; DiskRecovery = 'unverified'; VisibleRecovery = 'unverified' }
    }
    $disk = 'not-needed'; $visible = 'not-needed'
    if ($startResult.outcome -eq 'failure') { $disk = 'unverified'; $visible = 'unverified' }
    if ($recovery) {
      if ($recovery.outcome -cne $startResult.outcome) { throw 'Conflicting startup and recovery results.' }
      $disk = $recovery.diskRecovery; $visible = $recovery.visibleRecovery
    }
    # The existing strict, token-bound start result is the only success evidence.
    return [pscustomobject]@{ Outcome = $startResult.outcome; Category = $startResult.category; DiskRecovery = $disk; VisibleRecovery = $visible
      Message = $(if ($startResult.outcome -eq 'success') { '主题和背景已通过 Codex 加载验证，并保存为下次启动设置。' }
        elseif ($disk -eq 'restored' -and $visible -eq 'verified') { '应用失败；原启动设置与窗口外观已验证恢复。' }
        elseif ($disk -eq 'restored') { '应用失败；原启动设置已恢复，窗口外观恢复尚未通过验证。' }
        elseif ($disk -eq 'blocked') { '应用失败且恢复未完成，恢复备份已保留。' }
        else { '主题加载未通过验证，请查看日志后重试。' }) }
  } finally {
    $child.Dispose()
    foreach ($temporaryResult in @(
      (Get-DreamSkinStartResultPath -StateRoot $StateRoot -Token $OperationId),
      (Join-Path $StateRoot ('.panel-start-recovery-' + $OperationId + '.json')))) {
      try {
        Assert-DreamSkinNoReparseComponents -Path $temporaryResult
        if (Test-Path -LiteralPath $temporaryResult -PathType Leaf) { Remove-Item -LiteralPath $temporaryResult -Force }
      } catch {
        Write-DreamSkinPanelEvent -StateRoot $StateRoot -OperationId $OperationId -Action Apply -Stage cleanup -Outcome warning -Category result-cleanup-failed -Message 'A temporary result was retained; the operation outcome is unchanged.'
      }
    }
  }
}

if ($FunctionsOnly) { return }
if (-not $Action -or -not $OperationId) { throw 'Action and OperationId are required.' }
$script:PanelScriptRoot = $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
$logScript = Join-Path $PSScriptRoot 'operation-log.ps1'
if (Test-Path -LiteralPath $logScript) { . $logScript }
$StateRoot = [IO.Path]::GetFullPath($StateRoot)
Ensure-DreamSkinManagedDirectory -Path $StateRoot -Root $StateRoot
$resultPath = Join-Path $StateRoot ('.panel-result-' + $OperationId + '.json')
Assert-DreamSkinNoReparseComponents -Path $resultPath
if (Test-Path -LiteralPath $resultPath) { throw 'The operation ID was already used.' }
Write-DreamSkinPanelEvent -StateRoot $StateRoot -OperationId $OperationId -Action $Action -Stage request -Outcome started -Category none -Message 'Panel request received.'
try {
  switch ($Action) {
    'Save' { $result = Save-DreamSkinPanelSettings -StateRoot $StateRoot -OperationId $OperationId -SavedThemeDirectory $SavedThemeDirectory -BackgroundPath $BackgroundPath }
    'Apply' { $result = Invoke-DreamSkinPanelApply -StateRoot $StateRoot -OperationId $OperationId -SavedThemeDirectory $SavedThemeDirectory -BackgroundPath $BackgroundPath }
    'Shortcut' {
      . (Join-Path $PSScriptRoot 'launch-themed-codex.ps1') -FunctionsOnly
      $null = New-DreamSkinDefaultShortcut -StateRoot $StateRoot
      $result = [pscustomobject]@{ Outcome = 'success'; Category = 'none'; Message = '默认主题启动快捷方式已创建或修复。未保存的草稿不会自动提交。'; DiskRecovery = 'not-needed'; VisibleRecovery = 'not-needed' }
    }
  }
} catch {
  $result = [pscustomobject]@{ Outcome = 'failure'; Category = 'operation-failed'; Message = '操作未完成，请查看日志后重试。'; DiskRecovery = 'unverified'; VisibleRecovery = 'unverified' }
}
Write-DreamSkinPanelEvent -StateRoot $StateRoot -OperationId $OperationId -Action $Action -Stage completed -Outcome $result.Outcome -Category $result.Category -Message $result.Message
Write-DreamSkinPanelResult -StateRoot $StateRoot -OperationId $OperationId -Action $Action -Outcome $result.Outcome -Category $result.Category -Message $result.Message -DiskRecovery $result.DiskRecovery -VisibleRecovery $result.VisibleRecovery
if ($result.Outcome -eq 'failure') { exit 1 }
