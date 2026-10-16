[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Root)
$ErrorActionPreference = 'Stop'
$originalPanelLanguage = $env:DREAMSKIN_LANG
. (Join-Path $Root 'scripts/common-windows.ps1')
. (Join-Path $Root 'scripts/theme-windows.ps1')
. (Join-Path $Root 'scripts/panel-operation.ps1') -FunctionsOnly
$script:PanelScriptRoot = Join-Path $Root 'scripts'
$script:panelTestNode = Get-DreamSkinNodeRuntime
function Get-DreamSkinNodeRuntime { param([int]$MinimumMajor = 22); return $script:panelTestNode }
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('dreamskin-panel-test-' + [guid]::NewGuid().ToString('N'))
Ensure-DreamSkinManagedDirectory -Path $testRoot -Root $testRoot
function Assert-Panel { param([bool]$Condition, [string]$Label); if (-not $Condition) { throw $Label } }
try {
  # FunctionsOnly must also make localization available, without starting an operation.
  $localizedKeys = @(
    'PanelSaved', 'PanelOperationBusy', 'PanelSaveRecoveryBlocked', 'PanelSaveRecoveredVerified',
    'PanelSaveRecoveredUnverified', 'PanelSaveRecoveryIncomplete', 'PanelValidationFailed',
    'PanelApplyCancelled', 'PanelStartResultMissing', 'PanelStartResultConflict', 'PanelApplied',
    'PanelApplyRecoveredVerified', 'PanelApplyRecoveredUnverified', 'PanelApplyRecoveryIncomplete',
    'PanelApplyUnverified', 'PanelShortcutCreated', 'PanelOperationFailed',
    'DefaultLauncherUnavailable', 'DefaultLaunchUnconfirmed', 'DefaultShortcutDescription',
    'DefaultRecoveryNotNeeded', 'DefaultRecoveryRestored', 'DefaultRecoveryVerified',
    'DefaultRecoveryUnverified', 'DefaultRecoveryBlocked', 'DefaultRecoverySuperseded',
    'DefaultRecoveryRetained', 'DefaultRecoveryConflictPreserved', 'DefaultRecoveryPreservedRendered'
  )
  foreach ($key in $localizedKeys) {
    $english = Get-DreamSkinText -Key $key -Language 'en-US'
    $chinese = Get-DreamSkinText -Key $key -Language 'zh-CN'
    Assert-Panel ($english -match '[A-Za-z]' -and $english -notmatch '[\u4e00-\u9fff]') ('Missing English operation text: ' + $key)
    Assert-Panel ($chinese -match '[\u4e00-\u9fff]' -and $english -cne $chinese) ('Missing Chinese operation text: ' + $key)
  }
  foreach ($language in @('en-US', 'zh-CN')) {
    $formatted = Get-DreamSkinText -Key DefaultLaunchUnconfirmed -Language $language -FormatArguments @('fixture-category', 'fixture-appearance', 'fixture-disk', 'fixture-visible')
    foreach ($part in @('fixture-category', 'fixture-appearance', 'fixture-disk', 'fixture-visible')) {
      Assert-Panel ($formatted.Contains($part)) ('Default launch details lost a recovery field: ' + $language + ' / ' + $part)
    }
    Assert-Panel ($formatted -notmatch '\{[0-9]+\}') ('Unexpanded default launch placeholder: ' + $language)
  }
  Assert-Panel (@(Get-ChildItem -LiteralPath $testRoot -Force).Count -eq 0) 'FunctionsOnly localization performed an operation.'
  $env:DREAMSKIN_LANG = 'en-US'
  $paths = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $testRoot
  $initial = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active
  $themeDir = Join-Path $paths.Saved 'panel-source'
  Ensure-DreamSkinManagedDirectory -Path $themeDir -Root $testRoot
  $base = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  $sourceImageName = 'background' + [IO.Path]::GetExtension($base.ImagePath)
  Copy-Item -LiteralPath $base.ImagePath -Destination (Join-Path $themeDir $sourceImageName)
  $theme = $base.Theme | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  $theme.id = 'panel-source'; $theme.name = 'Panel source'; $theme.image = $sourceImageName
  Write-DreamSkinTheme -ThemeDirectory $themeDir -Theme $theme
  $css = '[data-ds-part="composer"] { border-radius: 18px; }'
  Write-DreamSkinUtf8FileAtomically -Path (Join-Path $themeDir 'theme.css') -Content $css
  $otherImage = Join-Path $testRoot 'chosen image.jpg'
  Copy-Item -LiteralPath (Join-Path $Root 'assets/dream-reference.jpg') -Destination $otherImage
  $sourceBefore = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $themeDir
  $preflight = New-DreamSkinPanelDraft -StateRoot $testRoot -SavedThemeDirectory $themeDir -BackgroundPath $otherImage
  Remove-DreamSkinManagedDirectoryVerified -Path $preflight.Root -Root $testRoot
  $null = Set-DreamSkinPaused -Paused $true -StateRoot $testRoot
  $prefs = Join-Path $testRoot 'theme-preferences.json'
  Write-DreamSkinUtf8FileAtomically -Path $prefs -Content '{"test":"untouched"}'
  $op = [guid]::NewGuid().ToString('N')
  $result = Save-DreamSkinPanelSettings -StateRoot $testRoot -OperationId $op -SavedThemeDirectory $themeDir -BackgroundPath $otherImage
  Assert-Panel ($result.Outcome -eq 'success') ('Combined save failed: ' + $result.Category)
  Assert-Panel ($result.Message -match '^Startup settings saved\.' -and $result.Message -notmatch '[\u4e00-\u9fff]') 'English save returned untranslated text.'
  Set-DreamSkinLanguage -Language 'zh-CN' -StateRoot $testRoot
  $env:DREAMSKIN_LANG = $null
  $chineseSave = Save-DreamSkinPanelSettings -StateRoot $testRoot -OperationId ([guid]::NewGuid().ToString('N')) -SavedThemeDirectory $themeDir -BackgroundPath $otherImage
  Assert-Panel ($chineseSave.Outcome -eq 'success' -and $chineseSave.Message -match '[\u4e00-\u9fff]') 'Saved Chinese preference was not honored by the FunctionsOnly save path.'
  $env:DREAMSKIN_LANG = 'en-US'
  $englishOverride = Save-DreamSkinPanelSettings -StateRoot $testRoot -OperationId ([guid]::NewGuid().ToString('N')) -SavedThemeDirectory $themeDir -BackgroundPath $otherImage
  Assert-Panel ($englishOverride.Outcome -eq 'success' -and $englishOverride.Message -match '^Startup settings saved\.') 'English environment did not override the saved Chinese preference.'
  $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  Assert-Panel ($active.Theme.id -eq 'panel-source') 'Combined save discarded the source contract.'
  Assert-Panel ((Read-DreamSkinUtf8File -Path (Join-Path $paths.Active 'theme.css')) -eq $css) 'Combined save discarded Safe CSS.'
  Assert-Panel ((Get-FileHash -LiteralPath $active.ImagePath).Hash -eq (Get-FileHash -LiteralPath $otherImage).Hash) 'Combined save did not retain the chosen image.'
  Assert-Panel ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $themeDir) -eq $sourceBefore) 'Combined save overwrote its saved source.'
  Assert-Panel (Test-DreamSkinPaused -StateRoot $testRoot) 'Save changed the existing pause state.'
  Assert-Panel ((Read-DreamSkinUtf8File -Path $prefs) -eq '{"test":"untouched"}') 'Save changed preferences.'
  Remove-Item -LiteralPath $otherImage
  Assert-Panel (Test-Path -LiteralPath (Read-DreamSkinTheme -ThemeDirectory $paths.Active).ImagePath) 'Save still depends on the original image.'
  $good = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active
  $badImage = Join-Path $testRoot 'bad.png'
  Write-DreamSkinUtf8FileAtomically -Path $badImage -Content 'not an image'
  $bad = Save-DreamSkinPanelSettings -StateRoot $testRoot -OperationId ([guid]::NewGuid().ToString('N')) -SavedThemeDirectory $themeDir -BackgroundPath $badImage
  Assert-Panel ($bad.Outcome -eq 'failure' -and $bad.DiskRecovery -eq 'not-needed') 'Bad image was accepted or published.'
  Assert-Panel ($bad.Message -match '^Settings validation failed\.') 'Validation failure did not use English result text.'
  Assert-Panel ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -eq $good) 'Bad image damaged active settings.'
  $outside = Save-DreamSkinPanelSettings -StateRoot $testRoot -OperationId ([guid]::NewGuid().ToString('N')) -SavedThemeDirectory $paths.Active
  Assert-Panel ($outside.Outcome -eq 'failure') 'Unmanaged theme source accepted.'

  # Inject a post-publication failure at image archiving, not at validation.
  $null = Set-DreamSkinPaused -Paused $false -StateRoot $testRoot
  $realInitialize = (Get-Command Initialize-DreamSkinThemeStore).ScriptBlock
  function Initialize-DreamSkinThemeStore { param($SkillRoot, $StateRoot); return Get-DreamSkinThemePaths -StateRoot $StateRoot }
  $realCopy = Get-Command Copy-Item -CommandType Cmdlet
  $script:panelArchivePath = $paths.Images
  function Copy-Item {
    param([string]$LiteralPath, [string]$Destination, [switch]$Force)
    if ([IO.Path]::GetDirectoryName($Destination) -eq $script:panelArchivePath) { throw 'fixture archive failure' }
    & $realCopy -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
  }
  try {
    $rollback = Save-DreamSkinPanelSettings -StateRoot $testRoot -OperationId ([guid]::NewGuid().ToString('N')) -SavedThemeDirectory $themeDir
    Assert-Panel ($rollback.Outcome -eq 'failure' -and $rollback.DiskRecovery -eq 'restored' -and $rollback.VisibleRecovery -eq 'unverified') 'Post-publication failure did not accurately report recovery.'
    Assert-Panel ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -eq $good) 'Post-publication failure did not restore the complete prior theme.'
    Assert-Panel (@(Get-ChildItem -LiteralPath $testRoot -Directory -Filter '.panel-backup-*').Count -eq 1) 'Unverified visible recovery discarded its backup.'
  } finally {
    Remove-Item function:Copy-Item
    Set-Item function:Initialize-DreamSkinThemeStore -Value $realInitialize
  }

  # Recovery failure must retain the verified old settings and report blocked.
  $script:panelBlockedToken = [guid]::NewGuid().ToString('N')
  $blockedBackup = Join-Path $testRoot ('.panel-backup-' + $script:panelBlockedToken)
  $realMove = Get-Command Move-Item -CommandType Cmdlet
  function Initialize-DreamSkinThemeStore { param($SkillRoot, $StateRoot); return Get-DreamSkinThemePaths -StateRoot $StateRoot }
  function Copy-Item {
    param([string]$LiteralPath, [string]$Destination, [switch]$Force)
    if ([IO.Path]::GetDirectoryName($Destination) -eq $script:panelArchivePath) { throw 'fixture archive failure' }
    & $realCopy -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
  }
  function Move-Item {
    param([string]$LiteralPath, [string]$Destination, [switch]$Force)
    if ([IO.Path]::GetFileName($LiteralPath) -eq ('.panel-backup-' + $script:panelBlockedToken)) { throw 'fixture blocked rollback' }
    & $realMove -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
  }
  try {
    $blocked = Save-DreamSkinPanelSettings -StateRoot $testRoot -OperationId $script:panelBlockedToken -SavedThemeDirectory $themeDir
    Assert-Panel ($blocked.Outcome -eq 'failure' -and $blocked.DiskRecovery -eq 'blocked') 'Recovery failure was reported as restored.'
    Assert-Panel ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $blockedBackup) -eq $good) 'Recovery failure discarded its valid old settings backup.'
  } finally {
    Remove-Item function:Copy-Item
    Remove-Item function:Move-Item
    Set-Item function:Initialize-DreamSkinThemeStore -Value $realInitialize
    if (-not (Test-Path -LiteralPath $paths.Active) -and (Test-Path -LiteralPath $blockedBackup)) {
      Assert-DreamSkinNoReparseComponents -Path $blockedBackup
      Move-Item -LiteralPath $blockedBackup -Destination $paths.Active
    }
    $null = Repair-DreamSkinPanelSave -StateRoot $testRoot
  }

  # Simulate process termination at both rename boundaries without killing
  # anything. Recovery runs under the same Operation lock before initialization.
  $repairLock = Enter-DreamSkinOperationLock
  try {
    foreach ($checkpoint in @('old-moved', 'new-published', 'external-change')) {
      $repairToken = [guid]::NewGuid().ToString('N')
      $repairBackup = Join-Path $testRoot ('.panel-backup-' + $repairToken)
      $repairDraft = New-DreamSkinPanelDraft -StateRoot $testRoot -SavedThemeDirectory $themeDir
      $journalPayload = [ordered]@{ schemaVersion = 1; operationId = $repairToken
        backupName = [IO.Path]::GetFileName($repairBackup); draftName = [IO.Path]::GetFileName($repairDraft.Root)
        oldFingerprint = $good; newFingerprint = $repairDraft.Fingerprint }
      # Make the selected draft different from the old active combination.
      $repairTheme = Read-DreamSkinTheme -ThemeDirectory $repairDraft.Directory
      $repairTheme.Theme.name = 'Interrupted selection'
      Write-DreamSkinTheme -ThemeDirectory $repairDraft.Directory -Theme $repairTheme.Theme
      $journalPayload.newFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $repairDraft.Directory
      Write-DreamSkinUtf8FileAtomically -Path (Join-Path $testRoot '.panel-pending-save.json') -Content ($journalPayload | ConvertTo-Json -Compress)
      Move-Item -LiteralPath $paths.Active -Destination $repairBackup
      if ($checkpoint -ne 'old-moved') { Move-Item -LiteralPath $repairDraft.Directory -Destination $paths.Active }
      if ($checkpoint -eq 'external-change') {
        $external = Read-DreamSkinTheme -ThemeDirectory $paths.Active
        $external.Theme.name = 'Newer external settings'
        Write-DreamSkinTheme -ThemeDirectory $paths.Active -Theme $external.Theme
        $externalFingerprint = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active
        $rejected = $false
        try { $null = Repair-DreamSkinPanelSave -StateRoot $testRoot } catch { $rejected = $true }
        Assert-Panel $rejected 'Interrupted-save recovery overwrote newer external settings.'
        Assert-Panel ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -eq $externalFingerprint) 'Newer external settings changed during blocked recovery.'
        Assert-Panel (Test-Path -LiteralPath $repairBackup) 'Blocked interrupted recovery discarded its backup.'
        Assert-Panel (Test-Path -LiteralPath (Join-Path $testRoot '.panel-pending-save.json')) 'Blocked interrupted recovery discarded its journal.'
        $blockedSave = Save-DreamSkinPanelSettings -StateRoot $testRoot -OperationId ([guid]::NewGuid().ToString('N')) -SavedThemeDirectory $themeDir
        Assert-Panel ($blockedSave.Outcome -eq 'failure' -and $blockedSave.Category -eq 'recovery-blocked' -and $blockedSave.DiskRecovery -eq 'blocked') 'Save seeded or committed over a blocked interrupted operation.'
        # Reset this isolated fixture, not production state.
        Remove-DreamSkinManagedDirectoryVerified -Path $paths.Active -Root $testRoot
        Move-Item -LiteralPath $repairBackup -Destination $paths.Active
        Remove-DreamSkinPanelSaveJournal -StateRoot $testRoot
      } else {
        $repaired = Repair-DreamSkinPanelSave -StateRoot $testRoot
        Assert-Panel ($repaired -eq 'restored') ('Interrupted save was not repaired: ' + $checkpoint)
        Assert-Panel ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -eq $good) ('Wrong theme restored after: ' + $checkpoint)
        Assert-Panel (-not (Test-Path -LiteralPath (Join-Path $testRoot '.panel-pending-save.json'))) 'Recovered interrupted save retained an active journal.'
      }
    }
    # A traversal leaf cannot redirect recovery outside the state root.
    $journalPayload.backupName = '../outside'
    Write-DreamSkinUtf8FileAtomically -Path (Join-Path $testRoot '.panel-pending-save.json') -Content ($journalPayload | ConvertTo-Json -Compress)
    $rejected = $false
    try { $null = Repair-DreamSkinPanelSave -StateRoot $testRoot } catch { $rejected = $true }
    Assert-Panel $rejected 'Pending save journal accepted path traversal.'
    Assert-Panel ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -eq $good) 'Invalid journal changed current settings.'
    Remove-DreamSkinPanelSaveJournal -StateRoot $testRoot
  } finally { Exit-DreamSkinOperationLock -Mutex $repairLock }

  # Explicitly simulate a cross-process lock failure (same-thread Mutex is recursive).
  $realEnter = (Get-Command Enter-DreamSkinOperationLock).ScriptBlock
  function Enter-DreamSkinOperationLock { throw 'busy' }
  try {
    $busy = Save-DreamSkinPanelSettings -StateRoot $testRoot -OperationId ([guid]::NewGuid().ToString('N')) -SavedThemeDirectory $themeDir
    Assert-Panel ($busy.Category -eq 'operation-busy') 'Operation contention was not surfaced.'
    Assert-Panel ((Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -eq $good) 'Operation contention changed active settings.'
  } finally { Set-Item function:Enter-DreamSkinOperationLock -Value $realEnter }
  Write-DreamSkinPanelResult -StateRoot $testRoot -OperationId $op -Action Save -Outcome success -Category none -Message 'saved'
  $json = Read-DreamSkinUtf8File -Path (Join-Path $testRoot ('.panel-result-' + $op + '.json')) | ConvertFrom-Json
  Assert-Panel ($json.schemaVersion -eq 1 -and $json.operationId -ceq $op -and $json.action -eq 'Save') 'Panel result did not round-trip.'
  $duplicateRejected = $false
  try { Write-DreamSkinPanelResult -StateRoot $testRoot -OperationId $op -Action Save -Outcome success -Category none -Message 'duplicate' } catch { $duplicateRejected = $true }
  Assert-Panel $duplicateRejected 'A stale panel result was overwritten.'
  # Exercise the bridge contract without starting Codex or a PowerShell child.
  $script:panelChildScenario = 'success'
  $script:panelChildToken = $null
  $script:panelChildDisposed = $false
  function Start-Process {
    param($FilePath, $ArgumentList, $WindowStyle, [switch]$PassThru)
    $script:panelChildDisposed = $false
    if ($script:panelChildScenario -in @('success', 'nonzero-success')) {
      Write-DreamSkinStartResult -StateRoot $testRoot -Token $script:panelChildToken -Outcome success -Category none -AppearanceRecovery not-needed
    }
    if ($script:panelChildScenario -eq 'cancelled') {
      $cancelPath = Join-Path $testRoot ('.panel-start-recovery-' + $script:panelChildToken + '.json')
      Write-DreamSkinUtf8FileAtomically -Path $cancelPath -Content (([ordered]@{
        schemaVersion = 1; operationId = $script:panelChildToken; outcome = 'cancelled'
        diskRecovery = 'not-needed'; visibleRecovery = 'not-needed'
      }) | ConvertTo-Json -Compress)
    }
    $exitCode = if ($script:panelChildScenario -eq 'nonzero-success') { 1 } else { 0 }
    $process = [pscustomobject]@{ ExitCode = $exitCode }
    $process | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {}
    $process | Add-Member -MemberType ScriptMethod -Name Dispose -Value { $script:panelChildDisposed = $true }
    return $process
  }
  try {
    foreach ($language in @('en-US', 'zh-CN')) {
      $env:DREAMSKIN_LANG = $language
    foreach ($scenario in @('success', 'missing', 'cancelled', 'nonzero-success')) {
      $script:panelChildScenario = $scenario
      $script:panelChildToken = [guid]::NewGuid().ToString('N')
      $applied = Invoke-DreamSkinPanelApply -StateRoot $testRoot -OperationId $script:panelChildToken -SavedThemeDirectory $themeDir
      $expected = switch ($scenario) { success { 'success' }; cancelled { 'cancelled' }; default { 'failure' } }
      Assert-Panel ($applied.Outcome -eq $expected) ('Incorrect child result interpretation: ' + $scenario)
      if ($language -eq 'en-US') {
        Assert-Panel ($applied.Message -match '[A-Za-z]' -and $applied.Message -notmatch '[\u4e00-\u9fff]') ('English apply returned untranslated text: ' + $scenario)
      } else {
        Assert-Panel ($applied.Message -match '[\u4e00-\u9fff]') ('Chinese apply returned untranslated text: ' + $scenario)
      }
      Assert-Panel $script:panelChildDisposed ('Child process handle leaked: ' + $scenario)
      Assert-Panel (-not (Test-Path -LiteralPath (Get-DreamSkinStartResultPath -StateRoot $testRoot -Token $script:panelChildToken))) 'Strict child result was not cleaned up.'
      Assert-Panel (-not (Test-Path -LiteralPath (Join-Path $testRoot ('.panel-start-recovery-' + $script:panelChildToken + '.json')))) 'Recovery child result was not cleaned up.'
    }
    }
  } finally { Remove-Item function:Start-Process }
  Write-Output 'PASS: isolated panel draft, CSS, validation, publication recovery, pause/preferences, contention and result token.'
} finally {
  $env:DREAMSKIN_LANG = $originalPanelLanguage
  Remove-DreamSkinManagedDirectoryVerified -Path $testRoot -Root ([IO.Path]::GetDirectoryName($testRoot))
}
