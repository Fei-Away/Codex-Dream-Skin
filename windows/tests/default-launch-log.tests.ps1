[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\launch-themed-codex.ps1') -FunctionsOnly
$fixtureBase = Join-Path (Split-Path -Parent $root) '.local-evidence'
$fixture = Join-Path $fixtureBase ('dreamskin-launch-log-' + [guid]::NewGuid().ToString('N'))
$state = Join-Path $fixture 'state'
$engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $state
$script:passes = 0
function Check([bool]$Condition, [string]$Name) {
  if (-not $Condition) { throw $Name }
  $script:passes++
  Write-Host "PASS $Name"
}
function Refuses([scriptblock]$Action, [string]$Name) {
  $refused = $false; try { & $Action | Out-Null } catch { $refused = $true }
  Check $refused $Name
}
try {
  $bootstrapPath = Join-Path $root 'installer\setup-bootstrap.ps1'
  $tokens = $null; $parseErrors = $null
  $bootstrapAst = [Management.Automation.Language.Parser]::ParseFile($bootstrapPath, [ref]$tokens, [ref]$parseErrors)
  Check ($parseErrors.Count -eq 0) 'bootstrap parses'
  $guard = $bootstrapAst.Find({ param($node) $node -is [Management.Automation.Language.IfStatementAst] -and $node.Extent.Text.Contains('Choose exactly one installer bootstrap action.') }, $true)
  if ($null -eq $guard) { throw 'Bootstrap action guard is missing.' }
  $guardBlock = [scriptblock]::Create('param([switch]$Install,[switch]$LaunchTray,[switch]$Uninstall)' + "`n" + $guard.Extent.Text)
  & $guardBlock -Install
  & $guardBlock -LaunchTray
  & $guardBlock -Uninstall
  Check $true 'upstream standalone installer actions retained'
  Refuses { & $guardBlock -Install -LaunchTray } 'upstream install and launch remain separate'
  Refuses { & $guardBlock -Install -Uninstall } 'upstream install and uninstall remain separate'
  [IO.Directory]::CreateDirectory($engine.Scripts) | Out-Null
  foreach ($relative in @('VERSION','scripts\common-windows.ps1','scripts\theme-windows.ps1','scripts\config-utf8.ps1','scripts\operation-log.ps1','scripts\localization-windows.ps1','scripts\launch-themed-codex.ps1','scripts\start-dream-skin.ps1')) {
    [IO.File]::WriteAllText((Join-Path $engine.Root $relative), '1.5.19')
  }
  $id = [guid]::NewGuid().ToString('N')
  Check (Write-DreamSkinOperationEvent -StateRoot $state -OperationId $id -Source tests -Action preview -Stage complete -Outcome failure -Category invalid-image -Message 'token=secret-value password=private-value C:\Users\Private\wallpaper.png') 'write bounded operation event'
  $log = Join-Path $state 'logs\operations.jsonl'
  $event = [IO.File]::ReadAllText($log) | ConvertFrom-Json
  Check ($event.operationId -ceq $id -and $event.timestamp -and $event.category -ceq 'invalid-image') 'event identity and metadata'
  Check ($event.message -notmatch 'secret-value|private-value|Private|wallpaper') 'diagnostic secrets and paths redacted'
  Check (-not (Write-DreamSkinOperationEvent -StateRoot $state -OperationId 'invalid' -Source tests -Action preview -Stage begin -Outcome pending)) 'invalid event rejected without throw'
  for ($index = 1; $index -le 6; $index++) {
    [IO.File]::WriteAllText($log, ('x' * 5MB), [Text.UTF8Encoding]::new($false))
    Check (Write-DreamSkinOperationEvent -StateRoot $state -OperationId $id -Source tests -Action rotate -Stage complete -Outcome success) "rotation $index"
  }
  $files = @(Get-ChildItem -LiteralPath (Join-Path $state 'logs') -Filter 'operations*.jsonl')
  Check ($files.Count -eq 5 -and @($files | Where-Object { $_.Length -gt 5MB }).Count -eq 0) 'five bounded log files retained'
  $blocked = Join-Path $fixture 'blocked'
  [IO.Directory]::CreateDirectory($blocked) | Out-Null
  [IO.File]::WriteAllText((Join-Path $blocked 'logs'), 'not a directory')
  Check (-not (Write-DreamSkinOperationEvent -StateRoot $blocked -OperationId $id -Source tests -Action blocked -Stage begin -Outcome pending)) 'log failure does not throw'
  $redirect = Join-Path $fixture 'redirect'; $outside = Join-Path $fixture 'outside'
  [IO.Directory]::CreateDirectory($redirect) | Out-Null
  [IO.Directory]::CreateDirectory($outside) | Out-Null
  $junction = Join-Path $redirect 'logs'
  New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
  try {
    Check (-not (Write-DreamSkinOperationEvent -StateRoot $redirect -OperationId $id -Source tests -Action unsafe -Stage begin -Outcome pending)) 'junction log redirection rejected'
    Check (@(Get-ChildItem -LiteralPath $outside).Count -eq 0) 'log did not escape managed directory'
  } finally {
    # Remove only this verified link, never recursively traverse its target.
    if ([IO.Path]::GetFullPath($junction).StartsWith([IO.Path]::GetFullPath($fixture) + '\') -and ([IO.File]::GetAttributes($junction) -band [IO.FileAttributes]::ReparsePoint)) {
      [IO.Directory]::Delete($junction)
    }
  }
  [IO.File]::WriteAllText($log, ('x' * (5MB + 1)), [Text.UTF8Encoding]::new($false))
  Check (Write-DreamSkinOperationEvent -StateRoot $state -OperationId $id -Source tests -Action oversized -Stage complete -Outcome success) 'inflated diagnostic file handled within bound'
  Check (([IO.FileInfo]$log).Length -le 5MB) 'inflated active log bounded'

  $shortcutPath = Join-Path $fixture 'default.lnk'
  $created = New-DreamSkinDefaultShortcut -StateRoot $state -ShortcutPath $shortcutPath
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($created)
  Check ($shortcut.Arguments -match 'RemoteSigned' -and $shortcut.Arguments.Contains($engine.DefaultLaunch)) 'shortcut targets managed launcher'
  $copiedShortcut = Join-Path $fixture 'desktop-copy.lnk'
  Copy-Item -LiteralPath $created -Destination $copiedShortcut
  $copied = $shell.CreateShortcut($copiedShortcut)
  Check ($copied.TargetPath -ceq $shortcut.TargetPath -and $copied.Arguments -ceq $shortcut.Arguments -and
    $copied.WorkingDirectory -ceq $engine.Root -and $copied.Arguments -notmatch 'SavedThemeDirectory|BackgroundPath') 'copied shortcut retains launcher and dynamically saved settings'
  $null = New-DreamSkinDefaultShortcut -StateRoot $state -ShortcutPath $shortcutPath
  $stranger = Join-Path $fixture 'stranger.lnk'
  $other = $shell.CreateShortcut($stranger); $other.TargetPath = Join-Path ([Environment]::GetFolderPath('Windows')) 'notepad.exe'; $other.Save()
  Refuses { New-DreamSkinDefaultShortcut -StateRoot $state -ShortcutPath $stranger } 'unrelated same-name shortcut preserved'
  Remove-DreamSkinDefaultShortcut -StateRoot $state -ShortcutPath $stranger
  Check (Test-Path -LiteralPath $stranger) 'uninstall preserves unrelated shortcut'
  Remove-DreamSkinDefaultShortcut -StateRoot $state -ShortcutPath $shortcutPath
  Check (-not (Test-Path -LiteralPath $shortcutPath)) 'uninstall removes owned shortcut'
  Refuses { New-DreamSkinDefaultShortcut -StateRoot $state -ShortcutPath (Join-Path $fixture 'bad.txt') } 'non-shortcut destination refused'

  $englishName = Get-DreamSkinDefaultShortcutName
  Check ($englishName -ceq 'Codex Dream Skin - Launch.lnk') 'generated launch name is fixed English'
  $canonical = Join-Path $fixture $englishName
  $legacy = Join-Path $fixture (Get-DreamSkinLegacyDefaultShortcutNames)
  Copy-Item -LiteralPath $copiedShortcut -Destination $legacy
  $null = New-DreamSkinDefaultShortcut -StateRoot $state -ShortcutPath $canonical
  Check ((Test-Path -LiteralPath $canonical) -and -not (Test-Path -LiteralPath $legacy)) 'owned legacy name migrated after English entry exists'
  Copy-Item -LiteralPath $canonical -Destination $legacy
  $null = New-DreamSkinDefaultShortcut -StateRoot $state -ShortcutPath $canonical
  Check (-not (Test-Path -LiteralPath $legacy)) 'repair of existing English entry retires owned legacy alias'
  $other = $shell.CreateShortcut($legacy); $other.TargetPath = Join-Path ([Environment]::GetFolderPath('Windows')) 'notepad.exe'; $other.Save()
  $null = New-DreamSkinDefaultShortcut -StateRoot $state -ShortcutPath $canonical
  Check (Test-Path -LiteralPath $legacy) 'migration preserves unrelated legacy-named shortcut'
  Remove-DreamSkinDefaultShortcuts -StateRoot $state -Directory $fixture
  Check (-not (Test-Path -LiteralPath $canonical) -and (Test-Path -LiteralPath $legacy)) 'uninstall removes English entry but preserves unrelated legacy name'
  Remove-Item -LiteralPath $legacy
  Copy-Item -LiteralPath $copiedShortcut -Destination $legacy
  $other = $shell.CreateShortcut($canonical); $other.TargetPath = Join-Path ([Environment]::GetFolderPath('Windows')) 'notepad.exe'; $other.Save()
  Refuses { New-DreamSkinDefaultShortcut -StateRoot $state -ShortcutPath $canonical } 'unrelated English-named shortcut blocks migration'
  Check (Test-Path -LiteralPath $legacy) 'blocked migration retains original owned entry'
  Remove-Item -LiteralPath $canonical
  Remove-DreamSkinDefaultShortcuts -StateRoot $state -Directory $fixture
  Check (-not (Test-Path -LiteralPath $legacy)) 'uninstall recognizes the owned former Chinese name'

  $previousLanguage = $env:DREAMSKIN_LANG
  try {
    $failure = [pscustomobject]@{category='renderer-verification-failed';appearanceRecovery='restored';diskRecovery='restored';visibleRecovery='unverified'}
    foreach ($language in @('en-US','zh-CN')) {
      $env:DREAMSKIN_LANG = $language
      $message = Get-DreamSkinDefaultLaunchFailureText -Result $failure -StateRoot $state
      Check ($message.Contains('renderer-verification-failed') -and $message -notmatch 'not-needed|unverified') "localized launch failure preserves diagnostic category: $language"
      Check (($message -match '[\u4e00-\u9fff]') -eq ($language -eq 'zh-CN')) "launch failure follows selected language: $language"
      Check ((Get-DreamSkinDefaultShortcutName) -ceq $englishName) "language does not change shortcut filename: $language"
      $appearanceKeys = @{
        'not-needed'='DefaultRecoveryNotNeeded'; 'retained'='DefaultRecoveryRetained'; 'restored'='DefaultRecoveryRestored'
        'conflict-preserved'='DefaultRecoveryConflictPreserved'; 'blocked'='DefaultRecoveryBlocked'; 'preserved-rendered'='DefaultRecoveryPreservedRendered'
      }
      foreach ($recoveryState in $script:DreamSkinStartAppearanceRecoveryStates) {
        $failure.appearanceRecovery = $recoveryState
        $recoveryMessage = Get-DreamSkinDefaultLaunchFailureText -Result $failure -StateRoot $state
        $expected = Get-DreamSkinText -Key $appearanceKeys[$recoveryState] -Language $language
        Check ($recoveryMessage.Contains($expected)) "appearance recovery meaning retained: $language / $recoveryState"
      }
    }
    $env:DREAMSKIN_LANG = $null
    Set-DreamSkinLanguage -Language 'zh-CN' -StateRoot $state
    Check ((Get-DreamSkinDefaultLaunchFailureText -Result $failure -StateRoot $state) -match '[\u4e00-\u9fff]') 'independent launcher honors saved language preference'
    Set-DreamSkinLanguage -Language 'system' -StateRoot $state
  } finally { $env:DREAMSKIN_LANG = $previousLanguage }

  $script:launchMode = 'success'
  function Start-Process {
    param([string]$FilePath, [string]$ArgumentList, [string]$WindowStyle, [switch]$Wait, [switch]$PassThru)
    if (-not $Wait -or -not $PassThru -or -not $ArgumentList.Contains($engine.Start) -or -not $ArgumentList.Contains($state) -or
      -not $ArgumentList.Contains('-OperationSource shortcut') -or -not $ArgumentList.Contains('-PanelRequest') -or $ArgumentList -notmatch '-ResultToken ([a-f0-9]{32})') { throw 'Unexpected child process.' }
    $token = $Matches[1]
    switch ($script:launchMode) {
      success { Write-DreamSkinStartResult -StateRoot $state -Token $token -Outcome success -Category none -AppearanceRecovery not-needed }
      failure { Write-DreamSkinStartResult -StateRoot $state -Token $token -Outcome failure -Category renderer-verification-failed -AppearanceRecovery restored }
      malformed { [IO.File]::WriteAllText((Get-DreamSkinStartResultPath -StateRoot $state -Token $token), '{"outcome":"success"}') }
      missing { }
      cancelled {
        $payload = @{schemaVersion=1; operationId=$token; outcome='cancelled'; diskRecovery='not-needed'; visibleRecovery='not-needed'} | ConvertTo-Json -Compress
        [IO.File]::WriteAllText((Join-Path $state ('.panel-start-recovery-' + $token + '.json')), $payload)
      }
      forgedcancel {
        $payload = @{schemaVersion=1; operationId=('a'*32); outcome='cancelled'; diskRecovery='not-needed'; visibleRecovery='not-needed'} | ConvertTo-Json -Compress
        [IO.File]::WriteAllText((Join-Path $state ('.panel-start-recovery-' + $token + '.json')), $payload)
      }
      busy { Write-DreamSkinStartResult -StateRoot $state -Token $token -Outcome failure -Category operation-busy -AppearanceRecovery not-needed }
      default { throw 'Unexpected test mode.' }
    }
    $process = [pscustomobject]@{ExitCode=0}
    $process | Add-Member ScriptMethod Dispose { }
    return $process
  }
  $result = Invoke-DreamSkinDefaultLaunch -StateRoot $state
  Check ($result.outcome -ceq 'success') 'validated child success'
  $script:launchMode = 'failure'; $result = Invoke-DreamSkinDefaultLaunch -StateRoot $state
  Check ($result.outcome -ceq 'failure' -and $result.appearanceRecovery -ceq 'restored') 'failure recovery retained'
  $script:launchMode = 'missing'; $result = Invoke-DreamSkinDefaultLaunch -StateRoot $state
  Check ($result.outcome -ceq 'failure' -and $result.category -ceq 'result-unconfirmed') 'missing result never success or cancellation'
  $script:launchMode = 'cancelled'; $result = Invoke-DreamSkinDefaultLaunch -StateRoot $state
  Check ($result.outcome -ceq 'cancelled' -and $result.category -ceq 'user-cancelled') 'explicit cancellation recognized'
  $script:launchMode = 'forgedcancel'; $result = Invoke-DreamSkinDefaultLaunch -StateRoot $state
  Check ($result.outcome -ceq 'failure') 'wrong-token cancellation rejected'
  $script:launchMode = 'busy'; $result = Invoke-DreamSkinDefaultLaunch -StateRoot $state
  Check ($result.outcome -ceq 'failure' -and $result.category -ceq 'operation-busy') 'overlapping operation clearly classified'
  $script:launchMode = 'malformed'; $result = Invoke-DreamSkinDefaultLaunch -StateRoot $state
  Check ($result.outcome -ceq 'failure') 'malformed result never success'
  $failureLog = @(Get-Content -LiteralPath $log | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.outcome -ceq 'failure' })
  Check ($failureLog.Count -ge 3) 'failed child operations logged'
  Write-Host "PASS: $script:passes isolated default-launch and log checks; no production process started."
} finally {
  $fullFixture = [IO.Path]::GetFullPath($fixture)
  if (-not $fullFixture.StartsWith([IO.Path]::GetFullPath($fixtureBase) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test cleanup.' }
  Remove-Item -LiteralPath $fullFixture -Recurse -Force -ErrorAction SilentlyContinue
}
