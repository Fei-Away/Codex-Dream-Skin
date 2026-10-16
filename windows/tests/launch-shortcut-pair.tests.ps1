[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\launch-themed-codex.ps1') -FunctionsOnly

# Exercise the real COM links, compare-and-swap writer and operation mutex, but
# redirect every external location and use a unique mutex namespace for this run.
$fixtureBase = Join-Path (Split-Path -Parent $root) '.local-evidence'
$fixture = Join-Path $fixtureBase ('dreamskin-shortcut-pair-' + [guid]::NewGuid().ToString('N'))
$originalLocalAppData = $env:LOCALAPPDATA
$realWriter = (Get-Command Write-DreamSkinBytesAtomically -CommandType Function).ScriptBlock
$realEnterLock = (Get-Command Enter-DreamSkinOperationLock -CommandType Function).ScriptBlock
$testLock = $realEnterLock.ToString().Replace('Local\CodexDreamSkin.', ('Local\DreamSkinPairTest.' + [guid]::NewGuid().ToString('N') + '.'))
Set-Item Function:\Enter-DreamSkinOperationLock ([scriptblock]::Create($testLock))
$script:locations = @()
$script:desktop = $null
$script:passes = 0
function Get-DreamSkinSetupInstallLocations { $script:locations }
function Get-DreamSkinDesktopShortcutDirectory { $script:desktop }
function Check([bool]$Condition, [string]$Name) {
  if (-not $Condition) { throw $Name }
  $script:passes++
  Write-Host "PASS $Name"
}
function Refuses([scriptblock]$Action, [string]$Name) {
  $refused = $false
  try { & $Action | Out-Null } catch { $refused = $true }
  Check $refused $Name
}
function New-Scenario([string]$Name) {
  $directory = Join-Path $fixture $Name
  $state = Join-Path $directory 'state'
  $engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $state
  [IO.Directory]::CreateDirectory($engine.Scripts) | Out-Null
  foreach ($relative in @('VERSION','scripts\common-windows.ps1','scripts\theme-windows.ps1','scripts\config-utf8.ps1','scripts\operation-log.ps1','scripts\localization-windows.ps1','scripts\launch-themed-codex.ps1','scripts\start-dream-skin.ps1')) {
    [IO.File]::WriteAllText((Join-Path $engine.Root $relative), '1.5.21')
  }
  $script:desktop = Join-Path $directory 'desktop'
  [IO.Directory]::CreateDirectory($script:desktop) | Out-Null
  $script:locations = @()
  return [pscustomobject]@{ Root=$directory; State=$state; Engine=$engine; Desktop=$script:desktop }
}
function New-SetupFixture([string]$Directory) {
  [IO.Directory]::CreateDirectory((Join-Path $Directory 'payload\scripts')) | Out-Null
  foreach ($relative in @('setup-bootstrap.ps1','payload\VERSION','payload\scripts\common-windows.ps1')) {
    [IO.File]::WriteAllText((Join-Path $Directory $relative), '1.5.21')
  }
  return $Directory
}
function New-OwnedLink([string]$State, [string]$Path, [string]$Description = 'old description') {
  $null = New-DreamSkinDefaultShortcut -StateRoot $State -ShortcutPath $Path
  $link = (New-Object -ComObject WScript.Shell).CreateShortcut($Path)
  $link.Description = $Description
  $link.Save()
}
function Same-Bytes([string]$Path, [byte[]]$Bytes) {
  return (Test-Path -LiteralPath $Path -PathType Leaf) -and
    (Test-DreamSkinBytesEqual -Left ([IO.File]::ReadAllBytes($Path)) -Right $Bytes)
}
function Check-NoArtifacts($Scenario, [string]$Name) {
  $artifacts = @(Get-ChildItem -LiteralPath $Scenario.Root -Recurse -Force | Where-Object {
    $_.Name -like '.dream-pair-*' -or $_.Name -like '.shortcut-recovery-*'
  })
  Check ($artifacts.Count -eq 0) $Name
}

try {
  [IO.Directory]::CreateDirectory($fixture) | Out-Null
  $env:LOCALAPPDATA = Join-Path $fixture 'local-app-data'
  $case = New-Scenario 'source'
  Check (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinShortcutInstallDirectory -StateRoot $case.State) -Right $case.State) 'source installation uses the stable managed installation root'
  $script:locations = @((Join-Path $case.Root 'removed-setup'))
  Check (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinShortcutInstallDirectory -StateRoot $case.State) -Right $case.State) 'removed Setup registration does not redirect a source installation'
  $script:locations = @()
  $result = New-DreamSkinDefaultShortcutPair -StateRoot $case.State
  Check ($result.Count -eq 2 -and (Test-DreamSkinPathEqual -Left $result.Desktop -Right (Join-Path $case.Desktop (Get-DreamSkinDefaultShortcutName))) -and
    (Test-DreamSkinPathEqual -Left $result.Installation -Right (Join-Path $case.State (Get-DreamSkinDefaultShortcutName)))) 'button request creates exactly the desktop and installation links'
  $shell = New-Object -ComObject WScript.Shell
  $first = $shell.CreateShortcut($result.Desktop); $second = $shell.CreateShortcut($result.Installation)
  Check ((Test-DreamSkinPathEqual -Left $first.TargetPath -Right $second.TargetPath) -and
    $first.Arguments -ceq $second.Arguments -and $first.Arguments -ceq (Get-DreamSkinDefaultShortcutArguments -Launcher $case.Engine.DefaultLaunch)) 'both links delegate to the same managed launcher'
  Check ($first.Arguments -notmatch '(?i)(?:^|\s)-(?:Theme\w*|ArtPath|Background\w*|Command|Install)(?:\s|$)' -and $first.Arguments -notmatch '(?i)theme\.json') 'links contain no saved theme, background, command text or installation request'
  Check (@(Get-ChildItem -LiteralPath $case.Root -Filter '*.lnk' -Recurse).Count -eq 2) 'source request adds only two visible links'
  $first.Description = 'needs repair'; $first.Save()
  $null = New-DreamSkinDefaultShortcutPair -StateRoot $case.State
  Check (($shell.CreateShortcut($result.Desktop).Description -cne 'needs repair') -and @(Get-ChildItem -LiteralPath $case.Root -Filter '*.lnk' -Recurse).Count -eq 2) 'repeated request repairs owned links without duplicating them'
  Check-NoArtifacts $case 'successful source request removes private staging and recovery files'

  $case = New-Scenario 'restricted-location'
  $restricted = Join-Path $case.Root 'restricted-menu'
  $setup = New-SetupFixture (Join-Path $restricted 'app')
  $script:locations = @($setup)
  $realRestrictedDirectories = (Get-Command Get-DreamSkinRestrictedShortcutDirectories -CommandType Function).ScriptBlock
  function Get-DreamSkinRestrictedShortcutDirectories { $restricted }
  try {
    Refuses { New-DreamSkinDefaultShortcutPair -StateRoot $case.State } 'registered installation inside a menu or sign-in directory is rejected'
    Check (-not (Test-Path -LiteralPath (Join-Path $case.Desktop (Get-DreamSkinDefaultShortcutName))) -and
      -not (Test-Path -LiteralPath (Join-Path $setup (Get-DreamSkinDefaultShortcutName)))) 'restricted directory cannot indirectly enable sign-in launch or add a menu entry'
    Check-NoArtifacts $case 'restricted location is refused before staging either public link'
  } finally { Set-Item Function:\Get-DreamSkinRestrictedShortcutDirectories $realRestrictedDirectories }

  $case = New-Scenario 'setup'
  $unicode = 'Setup ' + (-join ([char[]]@(0x4e2d,0x6587))) + ' space'
  $setup = New-SetupFixture (Join-Path $case.Root $unicode)
  $script:locations = @($setup, $setup)
  Check (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinShortcutInstallDirectory -StateRoot $case.State) -Right $setup) 'Setup location with spaces and Unicode is resolved once'
  $result = New-DreamSkinDefaultShortcutPair -StateRoot $case.State
  Check ((Test-Path -LiteralPath $result.Desktop) -and (Test-DreamSkinPathEqual -Left ([IO.Path]::GetDirectoryName($result.Installation)) -Right $setup) -and
    -not (Test-Path -LiteralPath (Join-Path $case.State (Get-DreamSkinDefaultShortcutName)))) 'Setup button uses final installation directory rather than payload, temporary directory or engine'
  $otherSetup = New-SetupFixture (Join-Path $case.Root 'other-setup')
  $script:locations = @($setup, $otherSetup)
  Refuses { Resolve-DreamSkinShortcutInstallDirectory -StateRoot $case.State } 'ambiguous valid Setup registrations are rejected'
  $script:locations = @('relative-path')
  Refuses { Resolve-DreamSkinShortcutInstallDirectory -StateRoot $case.State } 'relative Setup registration is rejected'
  $script:locations = @((Join-Path $case.Root 'incomplete'))
  [IO.Directory]::CreateDirectory($script:locations[0]) | Out-Null
  Refuses { Resolve-DreamSkinShortcutInstallDirectory -StateRoot $case.State } 'existing registered directory without product markers is rejected'
  $script:locations = @($setup)
  [IO.File]::WriteAllText((Join-Path $setup 'payload\VERSION'), 'invalid')
  Refuses { Resolve-DreamSkinShortcutInstallDirectory -StateRoot $case.State } 'invalid Setup payload version is rejected'
  [IO.File]::WriteAllText((Join-Path $setup 'payload\VERSION'), '1.5.21')
  $junction = Join-Path $case.Root 'setup-junction'
  New-Item -ItemType Junction -Path $junction -Target $setup | Out-Null
  try {
    $script:locations = @($junction)
    Refuses { Resolve-DreamSkinShortcutInstallDirectory -StateRoot $case.State } 'redirected Setup installation is rejected'
  } finally { [IO.Directory]::Delete($junction) }

  $case = New-Scenario 'unrelated-second-destination'
  $desktopLink = Join-Path $case.Desktop (Get-DreamSkinDefaultShortcutName)
  $installLink = Join-Path $case.State (Get-DreamSkinDefaultShortcutName)
  New-OwnedLink $case.State $desktopLink
  $before = [IO.File]::ReadAllBytes($desktopLink)
  $unrelated = $shell.CreateShortcut($installLink)
  $unrelated.TargetPath = Join-Path ([Environment]::GetFolderPath('Windows')) 'notepad.exe'; $unrelated.Save()
  $foreign = [IO.File]::ReadAllBytes($installLink)
  Refuses { New-DreamSkinDefaultShortcutPair -StateRoot $case.State } 'unrelated second destination refuses the entire pair'
  Check ((Same-Bytes $desktopLink $before) -and (Same-Bytes $installLink $foreign)) 'preflight collision leaves both public destinations byte-for-byte unchanged'
  Check-NoArtifacts $case 'preflight refusal creates no staging or recovery files'

  foreach ($externalChange in @($false, $true)) {
    $case = New-Scenario ('publish-failure-' + $externalChange)
    $desktopLink = Join-Path $case.Desktop (Get-DreamSkinDefaultShortcutName)
    $installLink = Join-Path $case.State (Get-DreamSkinDefaultShortcutName)
    New-OwnedLink $case.State $desktopLink
    $before = [IO.File]::ReadAllBytes($desktopLink)
    $script:faultSecond = $installLink; $script:faultFirst = $desktopLink
    $script:externalChange = $externalChange
    $script:externalBytes = [Text.Encoding]::UTF8.GetBytes('external newer data')
    $script:faultTriggered = $false
    function Write-DreamSkinBytesAtomically {
      [CmdletBinding()]
      param([string]$Path, [byte[]]$Bytes, [AllowNull()][byte[]]$ExpectedBytes)
      if (Test-DreamSkinPathEqual -Left $Path -Right $script:faultSecond) {
        $script:faultTriggered = $true
        if ($script:externalChange) { [IO.File]::WriteAllBytes($script:faultFirst, $script:externalBytes) }
        throw 'forced second shortcut publication failure'
      }
      & $realWriter @PSBoundParameters
    }
    try {
      Refuses { New-DreamSkinDefaultShortcutPair -StateRoot $case.State } 'second shortcut publication failure is reported'
    } finally { Set-Item Function:\Write-DreamSkinBytesAtomically $realWriter }
    Check ($script:faultTriggered -and -not (Test-Path -LiteralPath $installLink)) 'failure occurs at the second destination without a partial second link'
    if ($externalChange) {
      Check (Same-Bytes $desktopLink $script:externalBytes) 'rollback preserves a newer external change at the first destination'
      $backups = @(Get-ChildItem -LiteralPath $case.State -Directory -Force -Filter '.shortcut-recovery-*')
      Check ($backups.Count -eq 1 -and (Same-Bytes (Join-Path $backups[0].FullName '0.lnk') $before) -and
        (Test-Path -LiteralPath (Join-Path $backups[0].FullName 'recovery.json'))) 'blocked rollback retains original bytes and recovery index'
    } else {
      Check (Same-Bytes $desktopLink $before) 'second destination failure rolls first destination back to exact original bytes'
      Check-NoArtifacts $case 'successful rollback removes staging and recovery files'
    }
  }

  $case = New-Scenario 'legacy-migration'
  $legacy = Get-DreamSkinLegacyDefaultShortcutNames
  $desktopLegacy = Join-Path $case.Desktop $legacy; $installLegacy = Join-Path $case.State $legacy
  New-OwnedLink $case.State $desktopLegacy
  New-OwnedLink $case.State $installLegacy
  $realRemove = (Get-Command Remove-DreamSkinDefaultShortcut -CommandType Function).ScriptBlock
  $script:removedAliases = 0
  function Remove-DreamSkinDefaultShortcut {
    param([string]$StateRoot, [string]$ShortcutPath)
    if (-not (Test-Path -LiteralPath (Join-Path $case.Desktop (Get-DreamSkinDefaultShortcutName))) -or
      -not (Test-Path -LiteralPath (Join-Path $case.State (Get-DreamSkinDefaultShortcutName)))) {
      throw 'Legacy alias was removed before both new links were published.'
    }
    $script:removedAliases++
    & $realRemove -StateRoot $StateRoot -ShortcutPath $ShortcutPath
  }
  try { $null = New-DreamSkinDefaultShortcutPair -StateRoot $case.State }
  finally { Set-Item Function:\Remove-DreamSkinDefaultShortcut $realRemove }
  Check ($script:removedAliases -eq 2 -and -not (Test-Path -LiteralPath $desktopLegacy) -and -not (Test-Path -LiteralPath $installLegacy)) 'owned legacy names migrate only after both English links are published'
  $unrelated = $shell.CreateShortcut($desktopLegacy)
  $unrelated.TargetPath = Join-Path ([Environment]::GetFolderPath('Windows')) 'notepad.exe'; $unrelated.Save()
  $foreign = [IO.File]::ReadAllBytes($desktopLegacy)
  $null = New-DreamSkinDefaultShortcutPair -StateRoot $case.State
  Check (Same-Bytes $desktopLegacy $foreign) 'unrelated shortcut using the old Chinese name is preserved'
  Check-NoArtifacts $case 'legacy migration leaves no private staging or backup files'
  Write-Host "PASS: $script:passes isolated shortcut pair checks."
} finally {
  $env:LOCALAPPDATA = $originalLocalAppData
  Set-Item Function:\Write-DreamSkinBytesAtomically $realWriter
  Set-Item Function:\Enter-DreamSkinOperationLock $realEnterLock
  # Only this random, verified fixture is recursively removed. Junctions are
  # removed individually above, without traversing their targets.
  $fullFixture = [IO.Path]::GetFullPath($fixture)
  $fullBase = [IO.Path]::GetFullPath($fixtureBase).TrimEnd('\') + '\'
  if (-not $fullFixture.StartsWith($fullBase, [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($fullFixture) -notlike 'dreamskin-shortcut-pair-*') { throw 'Unsafe fixture cleanup path.' }
  if (Test-Path -LiteralPath $fullFixture) { Remove-Item -LiteralPath $fullFixture -Recurse -Force }
}
