[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
. (Join-Path $Root 'scripts\common-windows.ps1')
. (Join-Path $Root 'scripts\theme-windows.ps1')

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) "codex-dream-skin-tests-$PID-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
  $atomicReplacePath = Join-Path $temporaryRoot 'atomic-replace.txt'
  [System.IO.File]::WriteAllText($atomicReplacePath, 'before')
  Write-DreamSkinUtf8FileAtomically -Path $atomicReplacePath -Content 'after'
  if ((Read-DreamSkinUtf8File -Path $atomicReplacePath) -cne 'after') {
    throw 'Atomic writer did not replace an existing file under Windows PowerShell.'
  }
  $atomicArtifacts = @(Get-ChildItem -LiteralPath $temporaryRoot -Force |
    Where-Object { $_.FullName -ne $atomicReplacePath })
  if ($atomicArtifacts.Count -ne 0) {
    throw 'Atomic writer left internal replacement artifacts behind.'
  }
  Remove-Item -LiteralPath $atomicReplacePath -Force

  $realAtomicCleanup = (Get-Command Remove-DreamSkinAtomicArtifact -CommandType Function).ScriptBlock
  $previousWarningPreference = $WarningPreference
  $cleanupFailure = @{ Triggered = $false }
  try {
    $WarningPreference = 'Stop'
    function Remove-DreamSkinAtomicArtifact {
      param([Parameter(Mandatory = $true)][string]$Path)
      if ($Path -like '*.replace-backup') {
        $cleanupFailure.Triggered = $true
        throw 'forced atomic replacement-backup cleanup failure'
      }
      if ([System.IO.File]::Exists($Path)) {
        [System.IO.File]::Delete($Path)
      }
    }

    $cleanupFailurePath = Join-Path $temporaryRoot 'atomic-cleanup-failure.txt'
    [System.IO.File]::WriteAllText($cleanupFailurePath, 'before')
    $cleanupFailureReported = $false
    try {
      Write-DreamSkinUtf8FileAtomically -Path $cleanupFailurePath -Content 'after'
    } catch {
      $cleanupFailureReported = $true
    }
    if (-not $cleanupFailure.Triggered -or $cleanupFailureReported -or
      (Read-DreamSkinUtf8File -Path $cleanupFailurePath) -cne 'after') {
      throw 'A committed atomic write was reported as failed when cleanup failed.'
    }

    $cleanupConfigPath = Join-Path $temporaryRoot 'cleanup-failure-config.toml'
    $cleanupBackupPath = Join-Path $temporaryRoot 'cleanup-failure-config.before.toml'
    $cleanupOriginal = "model = `"gpt-5`"`r`n`r`n[desktop]`r`nappearanceTheme = `"system`"`r`n"
    [System.IO.File]::WriteAllText(
      $cleanupConfigPath,
      $cleanupOriginal,
      [System.Text.UTF8Encoding]::new($false, $true)
    )
    $cleanupOriginalBytes = [System.IO.File]::ReadAllBytes($cleanupConfigPath)
    Install-DreamSkinBaseTheme -ConfigPath $cleanupConfigPath -BackupPath $cleanupBackupPath
    if (-not (Test-Path -LiteralPath $cleanupBackupPath) -or
      -not (Test-DreamSkinBytesEqual -Left $cleanupOriginalBytes `
        -Right ([System.IO.File]::ReadAllBytes($cleanupBackupPath)))) {
      throw 'Atomic cleanup failure removed or changed the durable pre-install config backup.'
    }
  } finally {
    $WarningPreference = $previousWarningPreference
    Set-Item -Path Function:\Remove-DreamSkinAtomicArtifact -Value $realAtomicCleanup
  }

  $configPath = Join-Path $temporaryRoot 'config.toml'
  $backupPath = Join-Path $temporaryRoot 'config.before-dream-skin.toml'
  $projectName = -join @([char]0x4EE3, [char]0x7801, [char]0x9879, [char]0x76EE, [char]0x7532)
  $laterValue = -join @([char]0x4FDD, [char]0x7559)
  $sample = "model = `"gpt-5`"`r`n`r`n[other]`r`nappearanceTheme = `"keep-other`"`r`n`r`n[projects.'C:\$projectName']`r`ntrust_level = `"trusted`"`r`n`r`n[desktop]`r`nappearanceTheme = `"system`"`r`nappearanceLightCodeThemeId = `"theme-`$special`"`r`n"
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false, $true)
  [System.IO.File]::WriteAllText($configPath, $sample, $utf8NoBom)
  $originalBytes = [System.IO.File]::ReadAllBytes($configPath)

  Install-DreamSkinBaseTheme -ConfigPath $configPath -BackupPath $backupPath
  $installed = Read-DreamSkinUtf8File -Path $configPath
  if (-not $installed.Contains($projectName) -or $installed -notmatch 'appearanceTheme = "system"' -or
    $installed -notmatch 'appearanceLightCodeThemeId = "codex"') {
    throw 'Install changed a non-ASCII project name or failed to preserve the native appearance.'
  }
  if (-not (Test-Path -LiteralPath (Get-DreamSkinAppearanceMarkerPath -BackupPath $backupPath))) {
    throw 'Install did not record the appearance-preservation marker.'
  }
  $backupBytes = [System.IO.File]::ReadAllBytes($backupPath)
  if ([Convert]::ToBase64String($backupBytes) -cne [Convert]::ToBase64String($originalBytes)) {
    throw 'Install did not preserve an exact pre-change config backup.'
  }

  $written = [System.IO.File]::ReadAllBytes($configPath)
  if ($written.Length -ge 3 -and $written[0] -eq 0xEF -and $written[1] -eq 0xBB -and $written[2] -eq 0xBF) {
    throw 'Config writer added an unexpected UTF-8 BOM.'
  }

  $installed += "afterInstall = `"$laterValue`"`r`n"
  $installed = $installed -replace 'appearanceTheme = "system"', 'appearanceTheme = "dark"'
  Write-DreamSkinUtf8FileAtomically -Path $configPath -Content $installed
  Restore-DreamSkinBaseTheme -ConfigPath $configPath -BackupPath $backupPath
  $restored = Read-DreamSkinUtf8File -Path $configPath
  if (-not $restored.Contains($projectName) -or -not $restored.Contains($laterValue)) {
    throw 'Restore changed a project name or unrelated post-install setting.'
  }
  if ($restored -notmatch 'appearanceTheme = "dark"' -or -not $restored.Contains('appearanceLightCodeThemeId = "theme-$special"')) {
    throw 'Restore overwrote the user appearance or failed to restore the light code theme.'
  }
  if ($restored -notmatch '(?ms)^\[other\].*?appearanceTheme = "keep-other"') {
    throw 'Restore changed an appearance key outside the desktop section.'
  }

  $legacyConfigPath = Join-Path $temporaryRoot 'legacy-light.toml'
  $legacyBackupPath = Join-Path $temporaryRoot 'legacy-light.before.toml'
  $legacyCurrent = "[desktop]`r`n$($script:DreamSkinLegacyAppearanceTheme)`r`n$($script:DreamSkinManagedLightCodeTheme)`r`n$($script:DreamSkinManagedLightChromeTheme)`r`n"
  $legacyOriginal = "[desktop]`r`nappearanceTheme = `"system`"`r`nappearanceLightCodeThemeId = `"theme-original`"`r`nappearanceLightChromeTheme = { surface = `"original`" }`r`n"
  [System.IO.File]::WriteAllText($legacyConfigPath, $legacyCurrent, $utf8NoBom)
  [System.IO.File]::WriteAllText($legacyBackupPath, $legacyOriginal, $utf8NoBom)
  Install-DreamSkinBaseTheme -ConfigPath $legacyConfigPath -BackupPath $legacyBackupPath
  $legacyMigrated = Read-DreamSkinUtf8File -Path $legacyConfigPath
  if ($legacyMigrated -notmatch 'appearanceTheme = "system"' -or
    $legacyMigrated -notmatch 'appearanceLightCodeThemeId = "codex"') {
    throw 'Exact legacy managed light trio was not migrated to the saved native appearance.'
  }
  $legacyMigrated = $legacyMigrated -replace 'appearanceTheme = "system"', 'appearanceTheme = "dark"'
  Write-DreamSkinUtf8FileAtomically -Path $legacyConfigPath -Content $legacyMigrated
  Restore-DreamSkinBaseTheme -ConfigPath $legacyConfigPath -BackupPath $legacyBackupPath
  if ((Read-DreamSkinUtf8File -Path $legacyConfigPath) -notmatch 'appearanceTheme = "dark"') {
    throw 'A current install restore overwrote the user appearance after legacy migration.'
  }

  $lfConfigPath = Join-Path $temporaryRoot 'config-lf.toml'
  $lfBackupPath = Join-Path $temporaryRoot 'config-lf.before.toml'
  $lfOriginal = "model = `"gpt-5`"`n[projects.'C:\$projectName']`ntrust_level = `"trusted`"`n"
  [System.IO.File]::WriteAllText($lfConfigPath, $lfOriginal, $utf8NoBom)
  Install-DreamSkinBaseTheme -ConfigPath $lfConfigPath -BackupPath $lfBackupPath
  $lfInstalled = Read-DreamSkinUtf8File -Path $lfConfigPath
  if ($lfInstalled.Contains("`r") -or $lfInstalled -notmatch '(?m)^\[desktop\]$') {
    throw 'Install did not preserve LF line endings or create the desktop section.'
  }
  Restore-DreamSkinBaseTheme -ConfigPath $lfConfigPath -BackupPath $lfBackupPath
  $lfRestored = Read-DreamSkinUtf8File -Path $lfConfigPath
  if ($lfRestored.Contains("`r") -or $lfRestored -match '(?m)^\[desktop\]$' -or -not $lfRestored.Contains($projectName)) {
    throw 'Restore did not preserve LF content or remove the generated empty desktop section.'
  }

  $quotedConfigPath = Join-Path $temporaryRoot 'config-quoted.toml'
  $quotedBackupPath = Join-Path $temporaryRoot 'config-quoted.before.toml'
  $quotedOriginal = "[`"desktop`"] # retained comment`r`n`"appearanceTheme`" = `"system`"`r`n'appearanceLightCodeThemeId' = `"theme-`$special`"`r`n"
  [System.IO.File]::WriteAllText($quotedConfigPath, $quotedOriginal, $utf8NoBom)
  Install-DreamSkinBaseTheme -ConfigPath $quotedConfigPath -BackupPath $quotedBackupPath
  $quotedInstalled = Read-DreamSkinUtf8File -Path $quotedConfigPath
  if ([regex]::Matches($quotedInstalled, '(?m)^\s*\[(?:"desktop"|desktop)\]').Count -ne 1) {
    throw 'A commented or quoted desktop table was duplicated during install.'
  }
  Restore-DreamSkinBaseTheme -ConfigPath $quotedConfigPath -BackupPath $quotedBackupPath
  if ((Read-DreamSkinUtf8File -Path $quotedConfigPath) -cne $quotedOriginal) {
    throw 'Quoted desktop keys or a table-header comment were not restored exactly.'
  }

  $nestedConfigPath = Join-Path $temporaryRoot 'config-nested-themes.toml'
  $nestedBackupPath = Join-Path $temporaryRoot 'config-nested-themes.before.toml'
  $nestedTables = "[desktop.appearanceDarkChromeTheme]`r`naccent = `"#112233`"`r`n`r`n[desktop.appearanceDarkChromeTheme.fonts]`r`ncode = `"Cascadia Code`"`r`n`r`n[desktop.appearanceDarkChromeTheme.semanticColors]`r`ndiffAdded = `"#234567`"`r`n`r`n[desktop.appearanceLightChromeTheme]`r`naccent = `"#abcdef`"`r`n`r`n[desktop.appearanceLightChromeTheme.fonts]`r`nui = `"Microsoft YaHei UI`"`r`n`r`n[desktop.appearanceLightChromeTheme.semanticColors]`r`ndiffRemoved = `"#fedcba`"`r`n`r`n[`"desktop`".layout]`r`ndensity = `"compact`"`r`n"
  $nestedOriginal = "[desktop]`r`nappearanceTheme = `"system`"`r`nappearanceLightCodeThemeId = `"github-light`"`r`n`r`n$nestedTables"
  [System.IO.File]::WriteAllText($nestedConfigPath, $nestedOriginal, $utf8NoBom)
  Install-DreamSkinBaseTheme -ConfigPath $nestedConfigPath -BackupPath $nestedBackupPath
  $nestedInstalled = Read-DreamSkinUtf8File -Path $nestedConfigPath
  $nestedDesktop = Get-DreamSkinDesktopSection -Content $nestedInstalled
  if (-not $nestedDesktop.Body.Contains('appearanceTheme = "system"') -or
    -not $nestedDesktop.Body.Contains('appearanceLightCodeThemeId = "codex"')) {
    throw 'Install did not update scalar appearance settings beside nested desktop theme tables.'
  }
  if ([regex]::IsMatch($nestedDesktop.Body, '(?m)^[\t ]*appearanceLightChromeTheme[\t ]*=')) {
    throw 'Install wrote an inline light chrome theme beside the equivalent nested table.'
  }
  if (-not $nestedInstalled.Contains($nestedTables)) {
    throw 'Install changed native Codex chrome theme or unrelated nested desktop tables.'
  }
  Restore-DreamSkinBaseTheme -ConfigPath $nestedConfigPath -BackupPath $nestedBackupPath
  if ((Read-DreamSkinUtf8File -Path $nestedConfigPath) -cne $nestedOriginal) {
    throw 'Nested desktop theme tables were not preserved through install and restore.'
  }

  $singleLineArrayPath = Join-Path $temporaryRoot 'config-single-line-array.toml'
  $singleLineArrayBackup = Join-Path $temporaryRoot 'config-single-line-array.before.toml'
  $singleLineArray = "labels = [`"name[1]`", `"#tag]`"]`r`n"
  [System.IO.File]::WriteAllText($singleLineArrayPath, $singleLineArray, $utf8NoBom)
  Install-DreamSkinBaseTheme -ConfigPath $singleLineArrayPath -BackupPath $singleLineArrayBackup
  if (-not (Read-DreamSkinUtf8File -Path $singleLineArrayPath).Contains($singleLineArray.TrimEnd())) {
    throw 'A safe single-line array containing bracket text was changed or rejected.'
  }

  foreach ($unsupported in @(
    'desktop.appearanceTheme = "system"',
    'desktop = { appearanceTheme = "system" }',
    '[[desktop]]',
    '[[desktop.layout]]',
    '[desktop.appearanceTheme]',
    '[desktop.appearanceLightCodeThemeId]',
    "[desktop]`r`nappearanceLightChromeTheme = { accent = `"#ffffff`" }`r`n`r`n[desktop.appearanceLightChromeTheme]`r`naccent = `"#000000`"",
    '["desk\u0074op".layout]',
    '["desk\u0074op"]',
    "note = `"`"`"fake`r`n[desktop]`r`nappearanceTheme = `"dark`"`r`n`"`"`"",
    "[desktop]`r`nappearanceTheme = [`r`n  `"light`"`r`n]",
    "[desktop]`r`nlayout = [`r`n  [1, 2],`r`n  [3, 4],`r`n]`r`nappearanceTheme = `"dark`"",
    "[desktop]`r`nlayout = [`"]`",`r`n  [`"[`", `"]`"],`r`n]`r`nappearanceTheme = `"dark`""
  )) {
    $unsupportedPath = Join-Path $temporaryRoot ("unsupported-$([guid]::NewGuid().ToString('N')).toml")
    $unsupportedBackup = "$unsupportedPath.before"
    [System.IO.File]::WriteAllText($unsupportedPath, $unsupported, $utf8NoBom)
    $unsupportedRejected = $false
    try { Install-DreamSkinBaseTheme -ConfigPath $unsupportedPath -BackupPath $unsupportedBackup } catch { $unsupportedRejected = $true }
    if (-not $unsupportedRejected -or (Test-Path -LiteralPath $unsupportedBackup)) {
      throw "Unsupported TOML desktop representation was not rejected safely: $unsupported"
    }
  }

  $recoveryPath = Join-Path $temporaryRoot 'config.before-recovery.toml'
  Write-DreamSkinUtf8FileAtomically -Path $configPath -Content 'intentionally changed'
  Restore-DreamSkinConfigBackup -ConfigPath $configPath -BackupPath $backupPath -RecoveryBackupPath $recoveryPath
  $recoveredBytes = [System.IO.File]::ReadAllBytes($configPath)
  if ([Convert]::ToBase64String($recoveredBytes) -cne [Convert]::ToBase64String($originalBytes)) {
    throw 'Exact config recovery did not restore the original bytes.'
  }
  if ((Read-DreamSkinUtf8File -Path $recoveryPath) -cne 'intentionally changed') {
    throw 'Exact config recovery did not preserve the replaced current config.'
  }
  $archivePath = Join-Path $temporaryRoot 'config.restored.toml'
  Archive-DreamSkinConfigBackup -BackupPath $backupPath -ArchivePath $archivePath
  if ((Test-Path -LiteralPath $backupPath) -or -not (Test-Path -LiteralPath $archivePath)) {
    throw 'Completed config backup was not archived for a safe future reinstall.'
  }
  $secondBaseline = "[desktop]`r`nappearanceTheme = `"dark`"`r`n"
  [System.IO.File]::WriteAllText($configPath, $secondBaseline, $utf8NoBom)
  $secondBaselineBytes = [System.IO.File]::ReadAllBytes($configPath)
  Install-DreamSkinBaseTheme -ConfigPath $configPath -BackupPath $backupPath
  if (-not (Test-DreamSkinBytesEqual -Left $secondBaselineBytes -Right ([System.IO.File]::ReadAllBytes($backupPath)))) {
    throw 'Reinstall did not capture a fresh config baseline after completed restore.'
  }

  $invalidPath = Join-Path $temporaryRoot 'invalid.toml'
  $invalidBackupPath = Join-Path $temporaryRoot 'invalid.before.toml'
  [System.IO.File]::WriteAllBytes($invalidPath, [byte[]](0x66, 0x6f, 0x80))
  $rejected = $false
  try { Install-DreamSkinBaseTheme -ConfigPath $invalidPath -BackupPath $invalidBackupPath } catch { $rejected = $true }
  if (-not $rejected -or (Test-Path -LiteralPath $invalidBackupPath)) {
    throw 'Invalid UTF-8 input was not rejected before backup creation.'
  }
  $utf16Path = Join-Path $temporaryRoot 'utf16.toml'
  $utf16BackupPath = Join-Path $temporaryRoot 'utf16.before.toml'
  [System.IO.File]::WriteAllText($utf16Path, 'model = "gpt-5"', [System.Text.Encoding]::Unicode)
  $utf16Rejected = $false
  try { Install-DreamSkinBaseTheme -ConfigPath $utf16Path -BackupPath $utf16BackupPath } catch { $utf16Rejected = $true }
  if (-not $utf16Rejected -or (Test-Path -LiteralPath $utf16BackupPath)) {
    throw 'A UTF-16 config was silently transcoded instead of being rejected.'
  }
  $utf16NoBomPath = Join-Path $temporaryRoot 'utf16-no-bom.toml'
  $utf16NoBomBackupPath = Join-Path $temporaryRoot 'utf16-no-bom.before.toml'
  [System.IO.File]::WriteAllBytes($utf16NoBomPath, [System.Text.Encoding]::Unicode.GetBytes('model = "gpt-5"'))
  $utf16NoBomRejected = $false
  try { Install-DreamSkinBaseTheme -ConfigPath $utf16NoBomPath -BackupPath $utf16NoBomBackupPath } catch { $utf16NoBomRejected = $true }
  if (-not $utf16NoBomRejected -or (Test-Path -LiteralPath $utf16NoBomBackupPath)) {
    throw 'A BOM-less UTF-16 config was silently treated as UTF-8 instead of being rejected.'
  }
  $racePath = Join-Path $temporaryRoot 'race.toml'
  [System.IO.File]::WriteAllText($racePath, 'before', $utf8NoBom)
  $raceExpected = [System.IO.File]::ReadAllBytes($racePath)
  [System.IO.File]::WriteAllText($racePath, 'after', $utf8NoBom)
  $raceRejected = $false
  try { Assert-DreamSkinFileUnchanged -Path $racePath -ExpectedBytes $raceExpected } catch { $raceRejected = $true }
  if (-not $raceRejected) { throw 'Concurrent config modification was not detected.' }
  $conditionalWriteRejected = $false
  try {
    Write-DreamSkinUtf8FileAtomically -Path $racePath -Content 'replacement' -ExpectedBytes $raceExpected
  } catch {
    $conditionalWriteRejected = $true
  }
  if (-not $conditionalWriteRejected -or (Read-DreamSkinUtf8File -Path $racePath) -cne 'after') {
    throw 'Conditional atomic write replaced newer config content.'
  }

  if (-not (Test-DreamSkinWebSocketUrl -Value 'ws://127.0.0.1:9335/devtools/page/test' -Port 9335)) {
    throw 'PowerShell loopback WebSocket validation rejected a safe target.'
  }
  foreach ($unsafe in @(
    'ws://example.com:9335/devtools/page/test',
    'ws://127.0.0.1:9336/devtools/page/test',
    'wss://127.0.0.1:9335/devtools/page/test',
    'ws://user@127.0.0.1:9335/devtools/page/test',
    'ws://127.0.0.1:9335/unexpected/test',
    'ws://127.0.0.1:9335/devtools/page/test?query=1'
  )) {
    if (Test-DreamSkinWebSocketUrl -Value $unsafe -Port 9335) { throw "Accepted unsafe CDP target: $unsafe" }
  }
  $safePageTarget = [pscustomobject]@{
    id = 'page-123'
    type = 'page'
    url = 'app://codex/'
    webSocketDebuggerUrl = 'ws://127.0.0.1:9335/devtools/page/page-123'
  }
  if (-not (Test-DreamSkinCdpPageTarget -Target $safePageTarget -Port 9335)) {
    throw 'A valid same-ID CDP page target was rejected.'
  }
  foreach ($unsafePageTarget in @(
    [pscustomobject]@{ id = 'page-123'; type = 'page'; url = 'app://codex/'; webSocketDebuggerUrl = 'ws://127.0.0.1:9335/devtools/browser/page-123' },
    [pscustomobject]@{ id = 'other-page'; type = 'page'; url = 'app://codex/'; webSocketDebuggerUrl = 'ws://127.0.0.1:9335/devtools/page/page-123' },
    [pscustomobject]@{ id = 123; type = 'page'; url = 'app://codex/'; webSocketDebuggerUrl = 'ws://127.0.0.1:9335/devtools/page/123' },
    [pscustomobject]@{ id = 'page-123'; type = 'other'; url = 'app://codex/'; webSocketDebuggerUrl = 'ws://127.0.0.1:9335/devtools/page/page-123' }
  )) {
    if (Test-DreamSkinCdpPageTarget -Target $unsafePageTarget -Port 9335) {
      throw 'Accepted an inconsistent CDP page target.'
    }
  }
  $watchCommand = '"C:\Program Files\nodejs\node.exe" "C:\Dream Skin\injector.mjs" --watch --port 9335 --browser-id browser-123'
  if (-not (Test-DreamSkinCommandLineToken -CommandLine $watchCommand -Token 'C:\Dream Skin\injector.mjs') -or
    (Test-DreamSkinCommandLineToken -CommandLine $watchCommand -Token 'Dream Skin\injector.mjs')) {
    throw 'Injector command-line token validation is not boundary-safe.'
  }
  if (-not (Test-DreamSkinBrowserId -Value 'browser-123') -or
    (Test-DreamSkinBrowserId -Value 'browser 123')) {
    throw 'CDP browser ID validation is not boundary-safe.'
  }
  $quotedProfile = ConvertTo-DreamSkinProcessArgument -Value '--user-data-dir=C:\Dream Skin\Profile\'
  if ($quotedProfile -cne '"--user-data-dir=C:\Dream Skin\Profile\\"') {
    throw 'Process argument quoting did not protect spaces and a trailing backslash.'
  }
  $argumentLine = ConvertTo-DreamSkinArgumentLine -Arguments @(
    '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=C:\Dream Skin\Profile\',
    ''
  )
  if ($argumentLine -cne '--remote-debugging-address=127.0.0.1 "--user-data-dir=C:\Dream Skin\Profile\\" ""') {
    throw 'Packaged-app argument line quoting failed.'
  }
  Initialize-DreamSkinPackageLauncher
  if (-not ('CodexDreamSkin.PackageLauncher' -as [type])) {
    throw 'Packaged-app activation helper did not compile.'
  }
  $invalidActivationRejected = $false
  try { $null = Start-DreamSkinCodex -Codex ([pscustomobject]@{ AppUserModelId = 'invalid app' }) } catch {
    $invalidActivationRejected = $true
  }
  if (-not $invalidActivationRejected) { throw 'An invalid AppUserModelId reached package activation.' }

  $statePath = Join-Path $temporaryRoot 'state.json'
  $state = [pscustomobject]@{
    schemaVersion = 3
    platform = 'windows'
    port = 9335
    injectorPid = 1234
    injectorStartedAt = '2026-01-01T00:00:00.0000000Z'
    injectorPath = 'C:\Dream Skin\injector.mjs'
    nodePath = 'C:\Program Files\nodejs\node.exe'
    codexExe = 'C:\Program Files\WindowsApps\OpenAI.Codex\app\ChatGPT.exe'
    codexPackageRoot = 'C:\Program Files\WindowsApps\OpenAI.Codex'
    codexPackageFullName = 'OpenAI.Codex_1.2.3.4_x64__test'
    codexPackageFamilyName = 'OpenAI.Codex_test'
    browserId = 'browser-123'
  }
  Write-DreamSkinState -Path $statePath -State $state
  $loadedState = Read-DreamSkinState -Path $statePath
  if ($loadedState.schemaVersion -ne 3 -or $loadedState.port -ne 9335 -or
    $loadedState.browserId -cne 'browser-123') { throw 'State round-trip failed.' }
  $missingIdentityState = [pscustomobject]@{ schemaVersion = 3; platform = 'windows'; port = 9335 }
  Write-DreamSkinState -Path $statePath -State $missingIdentityState
  $missingIdentityRejected = $false
  try { $null = Read-DreamSkinState -Path $statePath } catch { $missingIdentityRejected = $true }
  if (-not $missingIdentityRejected) { throw 'Schema 3 accepted a state missing process and package identity.' }
  $legacyState = [pscustomobject]@{ schemaVersion = 2; platform = 'windows'; port = 9335; injectorPid = 1234 }
  Write-DreamSkinState -Path $statePath -State $legacyState
  if ((Read-DreamSkinState -Path $statePath).schemaVersion -ne 2) {
    throw 'A supported schema 2 state was rejected.'
  }

  $fakePackageRoot = Join-Path $temporaryRoot 'OpenAI.Codex_1.2.3.4_x64__test'
  $fakeExecutable = Join-Path $fakePackageRoot 'app\ChatGPT.exe'
  New-Item -ItemType Directory -Path (Split-Path -Parent $fakeExecutable) -Force | Out-Null
  [System.IO.File]::WriteAllBytes($fakeExecutable, [byte[]]@())
  $fakePackage = [pscustomobject]@{
    Name = 'OpenAI.Codex'
    InstallLocation = $fakePackageRoot
    PackageFullName = 'OpenAI.Codex_1.2.3.4_x64__test'
    PackageFamilyName = 'OpenAI.Codex_test'
    SignatureKind = 'Store'
    IsDevelopmentMode = $false
    Version = [version]'1.2.3.4'
  }
  $fakeManifest = [pscustomobject]@{
    Package = [pscustomobject]@{
      Applications = [pscustomobject]@{
        Application = @(
          [pscustomobject]@{ Id = 'Other'; Executable = 'other\Other.exe' },
          [pscustomobject]@{ Id = 'App'; Executable = 'app/ChatGPT.exe' }
        )
      }
    }
  }
  $fakeInstall = ConvertTo-DreamSkinCodexInstall -Package $fakePackage -Manifest $fakeManifest
  if ($null -eq $fakeInstall -or $fakeInstall.PackageFullName -cne $fakePackage.PackageFullName -or
    $fakeInstall.AppUserModelId -cne 'OpenAI.Codex_test!App' -or
    -not (Test-DreamSkinPathEqual -Left $fakeInstall.Executable -Right $fakeExecutable)) {
    throw 'Registered Appx package identity conversion failed.'
  }
  $fakeManifest.Package.Applications.Application[1].Id = 'Invalid App'
  if ($null -ne (ConvertTo-DreamSkinCodexInstall -Package $fakePackage -Manifest $fakeManifest)) {
    throw 'An invalid packaged-app application ID was accepted.'
  }
  $fakeManifest.Package.Applications.Application[1].Id = 'App'
  $fakeManifest.Package.Applications.Application += [pscustomobject]@{ Id = 'Duplicate'; Executable = 'app\ChatGPT.exe' }
  if ($null -ne (ConvertTo-DreamSkinCodexInstall -Package $fakePackage -Manifest $fakeManifest)) {
    throw 'An ambiguous packaged-app manifest was accepted.'
  }
  $fakeManifest.Package.Applications.Application = @($fakeManifest.Package.Applications.Application[0..1])
  $fakePackage.SignatureKind = 'Developer'
  if ($null -ne (ConvertTo-DreamSkinCodexInstall -Package $fakePackage -Manifest $fakeManifest)) {
    throw 'A non-Store Appx package was accepted as official Codex.'
  }
  $fakePackage.SignatureKind = 'Store'
  $pathOnlyState = [pscustomobject]@{
    codexExe = $fakeExecutable
    codexPackageRoot = $fakePackageRoot
    codexVersion = '1.2.3.4'
  }
  if ($null -eq (Get-DreamSkinCodexStatePathCandidate -State $pathOnlyState)) {
    throw 'A structurally valid legacy Codex path was not recognized for read-only activity checks.'
  }
  if ($null -eq (Resolve-DreamSkinCodexInstallFromState -State $pathOnlyState `
    -RegisteredInstalls @($fakeInstall))) {
    throw 'A legacy state path was not revalidated against a registered Store package.'
  }
  $verifiedPackageState = [pscustomobject]@{
    codexExe = $fakeExecutable
    codexPackageRoot = $fakePackageRoot
    codexVersion = '1.2.3.4'
    codexPackageFullName = $fakePackage.PackageFullName
    codexPackageFamilyName = $fakePackage.PackageFamilyName
  }
  $resolvedInstall = Resolve-DreamSkinCodexInstallFromState -State $verifiedPackageState `
    -RegisteredInstalls @($fakeInstall)
  if ($null -eq $resolvedInstall -or -not $resolvedInstall.RegisteredPackageVerified -or
    $resolvedInstall.AppUserModelId -cne $fakeInstall.AppUserModelId) {
    throw 'State package identity did not resolve against the registered Appx package.'
  }
  $verifiedPackageState.codexPackageFamilyName = 'OpenAI.Codex_wrong'
  if ($null -ne (Resolve-DreamSkinCodexInstallFromState -State $verifiedPackageState `
    -RegisteredInstalls @($fakeInstall))) {
    throw 'A mismatched Appx package family was accepted from state.'
  }
  Write-DreamSkinUtf8FileAtomically -Path $statePath -Content '[]'
  $badStateRejected = $false
  try { $null = Read-DreamSkinState -Path $statePath } catch { $badStateRejected = $true }
  if (-not $badStateRejected) { throw 'A non-object state file was accepted.' }
  $staleStatePath = Archive-DreamSkinStateFile -Path $statePath
  if ((Test-Path -LiteralPath $statePath) -or -not (Test-Path -LiteralPath $staleStatePath)) {
    throw 'Stale state was not preserved under an archive name.'
  }

  $themeStateRoot = Join-Path $temporaryRoot 'theme-state'
  $themePaths = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $themeStateRoot
  $initialTheme = Read-DreamSkinTheme -ThemeDirectory $themePaths.Active
  if ($initialTheme.Theme.id -cne 'preset-romantic-rose' -or
    $initialTheme.Theme.name -cne '桥本有菜' -or
    $initialTheme.Theme.appearance -cne 'auto' -or
    $initialTheme.Theme.art.safeArea -cne 'left' -or
    $initialTheme.Theme.art.taskMode -cne 'ambient' -or
    [System.IO.Path]::GetExtension($initialTheme.ImagePath) -cne '.jpg') {
    throw 'Default Windows theme did not seed the Arina Hashimoto wallpaper contract.'
  }
  $preseededThemes = @(Get-DreamSkinSavedThemes -StateRoot $themeStateRoot)
  if ($preseededThemes.Count -ne 1 -or
    $preseededThemes[0].Id -cne 'preset-romantic-rose' -or
    $preseededThemes[0].Name -cne '桥本有菜') {
    throw 'Arina Hashimoto was not preseeded in the Windows saved-theme menu.'
  }
  $updatedTheme = Set-DreamSkinActiveTheme -ImagePath (Join-Path $Root 'assets\dream-reference.jpg') `
    -Theme $null -Name '测试主题' -StateRoot $themeStateRoot
  if ($updatedTheme.Theme.name -cne '测试主题' -or
    $updatedTheme.Theme.id -cne 'custom' -or
    $updatedTheme.Theme.art.safeArea -cne 'auto' -or
    $updatedTheme.Theme.art.taskMode -cne 'auto' -or
    -not (Test-DreamSkinThemePathWithin -Path $updatedTheme.ImagePath -Root $themePaths.Active)) {
    throw 'Imported image did not reset to the generic adaptive contract inside the managed directory.'
  }
  $null = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $themeStateRoot
  $idempotentTheme = Read-DreamSkinTheme -ThemeDirectory $themePaths.Active
  if ($idempotentTheme.Theme.id -cne 'custom' -or
    @(Get-DreamSkinSavedThemes -StateRoot $themeStateRoot).Count -ne 1) {
    throw 'Theme-store initialization overwrote the active custom theme or duplicated its bundled preset.'
  }
  $savedTheme = Save-DreamSkinCurrentTheme -Name '已保存主题' -StateRoot $themeStateRoot
  if ($savedTheme.Theme.name -cne '已保存主题' -or @(Get-DreamSkinSavedThemes -StateRoot $themeStateRoot).Count -ne 2) {
    throw 'Saved theme creation or discovery failed.'
  }
  $null = Use-DreamSkinSavedTheme -ThemeDirectory $savedTheme.Directory -StateRoot $themeStateRoot

  $outsideTheme = Join-Path $temporaryRoot 'outside-theme'
  New-Item -ItemType Directory -Path $outsideTheme | Out-Null
  Copy-Item -LiteralPath (Join-Path $Root 'assets\dream-reference.jpg') `
    -Destination (Join-Path $outsideTheme 'dream-reference.jpg')
  Copy-Item -LiteralPath (Join-Path $Root 'assets\theme.json') `
    -Destination (Join-Path $outsideTheme 'theme.json')
  $junctionTheme = Join-Path $themePaths.Saved 'junction-escape'
  $null = New-Item -ItemType Junction -Path $junctionTheme -Target $outsideTheme
  $junctionRejected = $false
  try {
    $null = Use-DreamSkinSavedTheme -ThemeDirectory $junctionTheme -StateRoot $themeStateRoot
  } catch { $junctionRejected = $true }
  if (-not $junctionRejected) { throw 'Saved-theme junction escaped the managed theme directory.' }
  [System.IO.Directory]::Delete($junctionTheme)

  Set-DreamSkinPaused -Paused $true -StateRoot $themeStateRoot | Out-Null
  if (-not (Test-DreamSkinPaused -StateRoot $themeStateRoot)) { throw 'Pause marker was not created.' }
  Set-DreamSkinPaused -Paused $false -StateRoot $themeStateRoot | Out-Null
  if (Test-DreamSkinPaused -StateRoot $themeStateRoot) { throw 'Pause marker was not removed.' }

  $oversizedTheme = Join-Path $temporaryRoot 'oversized-theme'
  New-Item -ItemType Directory -Path $oversizedTheme | Out-Null
  $oversizedImage = Join-Path $oversizedTheme 'oversized.jpg'
  $oversizedStream = [System.IO.File]::Open($oversizedImage, [System.IO.FileMode]::CreateNew)
  try { $oversizedStream.SetLength((16 * 1024 * 1024) + 1) } finally { $oversizedStream.Dispose() }
  Write-DreamSkinUtf8FileAtomically -Path (Join-Path $oversizedTheme 'theme.json') `
    -Content "{`"image`":`"oversized.jpg`"}`r`n"
  $oversizedReadRejected = $false
  try { $null = Read-DreamSkinTheme -ThemeDirectory $oversizedTheme } catch { $oversizedReadRejected = $true }
  $oversizedSetRejected = $false
  try {
    $null = Set-DreamSkinActiveTheme -ImagePath $oversizedImage -Theme $null -StateRoot $themeStateRoot
  } catch { $oversizedSetRejected = $true }
  if (-not $oversizedReadRejected -or -not $oversizedSetRejected) {
    throw 'The 16 MB image limit was not enforced before theme copy or payload construction.'
  }

  $oversizedDimensionImage = Join-Path $temporaryRoot 'oversized-dimension.png'
  $pngHeader = New-Object byte[] 24
  [byte[]](0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) | ForEach-Object -Begin { $i = 0 } -Process { $pngHeader[$i++] = $_ }
  $pngHeader[8] = 0; $pngHeader[9] = 0; $pngHeader[10] = 0; $pngHeader[11] = 13
  [byte[]](0x49, 0x48, 0x44, 0x52) | ForEach-Object -Begin { $i = 12 } -Process { $pngHeader[$i++] = $_ }
  $pngHeader[16] = 0; $pngHeader[17] = 0; $pngHeader[18] = 0x27; $pngHeader[19] = 0x10
  $pngHeader[20] = 0; $pngHeader[21] = 0; $pngHeader[22] = 0x17; $pngHeader[23] = 0x70
  [System.IO.File]::WriteAllBytes($oversizedDimensionImage, $pngHeader)
  $oversizedDimensionRejected = $false
  try { $null = Set-DreamSkinActiveTheme -ImagePath $oversizedDimensionImage -Theme $null -StateRoot $themeStateRoot } catch { $oversizedDimensionRejected = $true }
  if (-not $oversizedDimensionRejected) { throw 'A 16384px/50MP-invalid import was copied into the active theme.' }

  $reparseStateRoot = Join-Path $temporaryRoot 'reparse-state'
  New-Item -ItemType Directory -Path $reparseStateRoot | Out-Null
  $outsideActive = Join-Path $temporaryRoot 'outside-active'
  New-Item -ItemType Directory -Path $outsideActive | Out-Null
  $reparseActive = Join-Path $reparseStateRoot 'active-theme'
  $null = New-Item -ItemType Junction -Path $reparseActive -Target $outsideActive
  $reparseInitRejected = $false
  try { $null = Initialize-DreamSkinThemeStore -SkillRoot $Root -StateRoot $reparseStateRoot } catch { $reparseInitRejected = $true }
  if (-not $reparseInitRejected) { throw 'Theme-store initialization followed an active-theme junction.' }
  [System.IO.Directory]::Delete($reparseActive)

  $css = Read-DreamSkinUtf8File -Path (Join-Path $Root 'assets\dream-skin.css')
  foreach ($requiredCss in @(
    'background-image: var(--dream-art)',
    'main.main-surface > header.app-header-tint',
    '.app-shell-main-content-top-fade',
    '.thread-scroll-container .bg-gradient-to-t.from-token-main-surface-primary',
    '--dream-immersive-composer',
    'background-position: var(--dream-art-position)',
    '.dream-home-utility',
    ':has(.dream-home-utility) .composer-surface-chrome',
    ':is(.dream-task-ambient, .dream-task-banner):has(main.main-surface:not(.dream-home-shell))'
  )) {
    if (-not $css.Contains($requiredCss)) { throw "Windows immersive CSS is missing: $requiredCss" }
  }
  $traySource = Read-DreamSkinUtf8File -Path (Join-Path $Root 'scripts\tray-dream-skin.ps1')
  foreach ($requiredTrayAction in @('System.Windows.Forms.NotifyIcon', '暂停皮肤', '更换背景图', '已保存主题', '完全恢复 Codex')) {
    if (-not $traySource.Contains($requiredTrayAction)) { throw "Tray action is missing: $requiredTrayAction" }
  }
  if (-not $traySource.Contains('$nextPaused') -or -not $traySource.Contains('[System.Windows.Forms.Application]::Exit()')) {
    throw 'Tray pause/restore closures do not terminate cleanly.'
  }
  if (-not $traySource.Contains('Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata') -or
    -not $traySource.Contains('Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata')) {
    throw 'Tray menu metadata enumeration still performs full image parsing on every open.'
  }
  $restoreSource = Read-DreamSkinUtf8File -Path (Join-Path $Root 'scripts\restore-dream-skin.ps1')
  if (-not $restoreSource.Contains('Stop-DreamSkinTrayProcess')) {
    throw 'Complete restore does not stop a separately launched tray process.'
  }
  if ($restoreSource.Contains('Start-Process -FilePath $relaunchCodex.Executable') -or
    -not $restoreSource.Contains('Start-DreamSkinCodex -Codex $relaunchCodex')) {
    throw 'Restore still executes the WindowsApps path instead of activating the registered package.'
  }
  $startSource = Read-DreamSkinUtf8File -Path (Join-Path $Root 'scripts\start-dream-skin.ps1')
  if ($startSource.Contains('Start-Process -FilePath $codex.Executable') -or
    -not $startSource.Contains('Start-DreamSkinCodex -Codex $codex')) {
    throw 'Start still executes the WindowsApps path instead of activating the registered package.'
  }
  $stateReadIndex = $startSource.IndexOf('$previousState = Read-DreamSkinState', [System.StringComparison]::Ordinal)
  $restartPromptIndex = $startSource.IndexOf('$restartAuthorized = Confirm-DreamSkinRestart', [System.StringComparison]::Ordinal)
  $recordedStopIndex = $startSource.IndexOf('$recordedInjectorStopped = Stop-DreamSkinRecordedInjector', [System.StringComparison]::Ordinal)
  $cancelIndex = $startSource.IndexOf("Write-Host 'Dream Skin launch was cancelled", [System.StringComparison]::Ordinal)
  $pauseClearIndex = $startSource.IndexOf('Set-DreamSkinPaused -Paused $false', [System.StringComparison]::Ordinal)
  if ($stateReadIndex -lt 0 -or $pauseClearIndex -le $stateReadIndex -or
    ($restartPromptIndex -ge 0 -and $pauseClearIndex -le $restartPromptIndex) -or
    ($recordedStopIndex -ge 0 -and $pauseClearIndex -le $recordedStopIndex) -or
    ($cancelIndex -ge 0 -and $cancelIndex -ge $pauseClearIndex)) {
    throw 'Start clears the pause marker before state validation or restart consent, or before its cancellation branch.'
  }
  if (-not $startSource.Contains('$pauseWasSet = Test-DreamSkinPaused') -or
    -not $startSource.Contains('$pauseCleared = $true') -or
    -not $startSource.Contains('Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot')) {
    throw 'Start does not preserve an existing pause marker when startup rolls back.'
  }

  $rendererSource = Read-DreamSkinUtf8File -Path (Join-Path $Root 'assets\renderer-inject.js')
  foreach ($requiredRendererBehavior in @('dream-home-utility', 'artMetadata', 'detectShellAppearance')) {
    if (-not $rendererSource.Contains($requiredRendererBehavior)) {
      throw "Renderer adaptive behavior is missing: $requiredRendererBehavior"
    }
  }
  $injectorSource = Read-DreamSkinUtf8File -Path (Join-Path $Root 'scripts\injector.mjs')
  foreach ($requiredInjectorBehavior in @(
    'MAX_ART_BYTES', 'createHash', 'readImageMetadata', '50MP safety limit', 'STRONG_THEME_AUDIT_MS',
    'Page.addScriptToEvaluateOnNewDocument', 'Page.removeScriptToEvaluateOnNewDocument', 'earlyPayloadFor'
  )) {
    if (-not $injectorSource.Contains($requiredInjectorBehavior)) {
      throw "Injector theme safety is missing: $requiredInjectorBehavior"
    }
  }
  $themeSource = Read-DreamSkinUtf8File -Path (Join-Path $Root 'scripts\theme-windows.ps1')
  foreach ($requiredThemeSafety in @(
    '[System.IO.FileAttributes]::ReparsePoint',
    'Ensure-DreamSkinManagedDirectory',
    'Get-DreamSkinValidatedImageMetadata',
    '16384px / 50MP safety limit',
    'Assert-DreamSkinImageFile -Path $temporary',
    'Assert-DreamSkinImageFile -Path $imageArchive'
  )) {
    if (-not $themeSource.Contains($requiredThemeSafety)) {
      throw "PowerShell theme-store safety is missing: $requiredThemeSafety"
    }
  }
  $commonSource = Read-DreamSkinUtf8File -Path (Join-Path $Root 'scripts\common-windows.ps1')
  if (-not $commonSource.Contains('State was preserved.')) {
    throw 'Mismatched live injector identity does not fail closed with preserved state.'
  }

  $node = Get-DreamSkinNodeRuntime
  $stderrProbe = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    '-e', "process.stderr.write('dream-skin-stderr-probe\n'); process.exit(7)")
  if ($stderrProbe.ExitCode -ne 7 -or ($stderrProbe.Output -join "`n") -notmatch 'dream-skin-stderr-probe') {
    throw "Native stderr was not captured with its real exit code under Stop preference: exit=$($stderrProbe.ExitCode); output=$($stderrProbe.Output -join '<NL>')"
  }
  $discardedProbe = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    '-e', "process.stderr.write('ignored-warning\n'); process.stdout.write('kept-output')") -DiscardStderr
  if ($discardedProbe.ExitCode -ne 0 -or ($discardedProbe.Output -join '') -cne 'kept-output') {
    throw 'Native stderr discard changed stdout or the real exit code.'
  }

  $selfTest = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    (Join-Path $Root 'scripts\injector.mjs'), '--self-test')
  if ($selfTest.ExitCode -ne 0) { throw 'Injector CDP self-test failed.' }
  $payloadTest = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    (Join-Path $Root 'scripts\injector.mjs'), '--check-payload')
  if ($payloadTest.ExitCode -ne 0) { throw 'Injector self-test failed.' }
  $managedPayloadTest = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    (Join-Path $Root 'scripts\injector.mjs'), '--check-payload', '--theme-dir', $themePaths.Active)
  if ($managedPayloadTest.ExitCode -ne 0) { throw 'Managed theme payload validation failed.' }
  $oversizedPayloadTest = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    (Join-Path $Root 'scripts\injector.mjs'), '--check-payload', '--theme-dir', $oversizedTheme)
  if ($oversizedPayloadTest.ExitCode -eq 0) { throw 'Node injector accepted an image over the 16 MB limit.' }
  $rendererTest = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    (Join-Path $PSScriptRoot 'renderer-inject.test.mjs'))
  if ($rendererTest.ExitCode -ne 0) { throw 'Renderer auxiliary-window regression test failed.' }
  $bootstrapTest = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    (Join-Path $PSScriptRoot 'injector-bootstrap.test.mjs'))
  if ($bootstrapTest.ExitCode -ne 0) { throw 'Injector early-bootstrap regression test failed.' }
  $oneShotTest = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    (Join-Path $PSScriptRoot 'injector-one-shot.test.mjs'))
  if ($oneShotTest.ExitCode -ne 0) { throw 'Injector one-shot Browser ID regression test failed.' }
  $imageMetadataTest = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    (Join-Path $PSScriptRoot 'image-metadata.test.mjs'))
  if ($imageMetadataTest.ExitCode -ne 0) { throw 'Image metadata regression test failed.' }

  Write-Host 'PASS: config transactions, restore scoping, state safety, argument quoting, and loopback CDP validation.'
} finally {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
