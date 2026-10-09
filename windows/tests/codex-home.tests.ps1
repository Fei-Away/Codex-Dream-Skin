[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\common-windows.ps1')
. (Join-Path $PSScriptRoot '..\scripts\theme-windows.ps1')

function Assert-HomeTest {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}
function Assert-HomeRejected {
  param([scriptblock]$Action, [string]$Pattern)
  $rejected = $false
  try { & $Action | Out-Null } catch {
    if ($_.Exception.Message -notmatch $Pattern) { throw }
    $rejected = $true
  }
  Assert-HomeTest $rejected "Expected rejection: $Pattern"
}

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('dreamskin-home-' + [guid]::NewGuid().ToString('N'))
$originalCodexHome = $env:CODEX_HOME
try {
  $stateRoot = Join-Path $fixtureRoot 'state'
  $homeA = Join-Path $fixtureRoot ('Codex Home ' + [char]0x6D4B + [char]0x8BD5)
  $homeB = Join-Path $fixtureRoot 'second home'
  foreach ($directory in @($stateRoot, $homeA, $homeB)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $configA = Join-Path $homeA 'config.toml'
  $configB = Join-Path $homeB 'config.toml'
  $originalA = "model = `"fixture-a`"`r`n[desktop]`r`nappearanceTheme = `"dark`"`r`n"
  $originalB = "model = `"fixture-b`"`n[desktop]`nappearanceTheme = `"light`"`n"
  Write-DreamSkinUtf8FileAtomically -Path $configA -Content $originalA
  Write-DreamSkinUtf8FileAtomically -Path $configB -Content $originalB
  $env:CODEX_HOME = $homeA
  $paths = Resolve-DreamSkinConfigPaths -StateRoot $stateRoot -BindBackup
  Assert-HomeTest (Test-DreamSkinPathEqual $paths.ConfigPath $configA) 'Custom home with spaces and Unicode was not selected.'
  Install-DreamSkinBaseTheme -ConfigPath $paths.ConfigPath -BackupPath $paths.BackupPath
  Assert-HomeTest ((Read-DreamSkinUtf8File -Path $paths.BackupPath) -ceq $originalA) 'Backup did not preserve custom home config.'
  Assert-HomeTest ((Read-DreamSkinUtf8File -Path $configB) -ceq $originalB) 'Install touched another home.'
  $managedA = Read-DreamSkinUtf8File -Path $configA
  $env:CODEX_HOME = $homeA + '\'
  $null = Resolve-DreamSkinConfigPaths -StateRoot $stateRoot -BindBackup
  $env:CODEX_HOME = $homeB
  Assert-HomeRejected { Resolve-DreamSkinConfigPaths -StateRoot $stateRoot -BindBackup } 'different CODEX_HOME'
  Assert-HomeRejected { Resolve-DreamSkinConfigPaths -StateRoot $stateRoot } 'different CODEX_HOME'
  Assert-HomeTest ((Read-DreamSkinUtf8File -Path $configA) -ceq $managedA) 'Rejected home change modified old config.'
  Assert-HomeTest ((Read-DreamSkinUtf8File -Path $configB) -ceq $originalB) 'Rejected home change modified new config.'
  $env:CODEX_HOME = $homeA
  $paths = Resolve-DreamSkinConfigPaths -StateRoot $stateRoot
  Restore-DreamSkinBaseTheme -ConfigPath $paths.ConfigPath -BackupPath $paths.BackupPath
  Assert-HomeTest ((Read-DreamSkinUtf8File -Path $configA) -ceq $originalA) 'Restore did not return custom home appearance.'
  Archive-DreamSkinConfigBackup -BackupPath $paths.BackupPath -ArchivePath (Join-Path $stateRoot 'completed.toml')
  $env:CODEX_HOME = $homeB
  $paths = Resolve-DreamSkinConfigPaths -StateRoot $stateRoot -BindBackup
  Install-DreamSkinBaseTheme -ConfigPath $paths.ConfigPath -BackupPath $paths.BackupPath
  Restore-DreamSkinConfigBackup -ConfigPath $paths.ConfigPath -BackupPath $paths.BackupPath `
    -RecoveryBackupPath (Join-Path $stateRoot 'before-recovery.toml')
  Assert-HomeTest ((Read-DreamSkinUtf8File -Path $configB) -ceq $originalB) 'Full backup recovery used the wrong home.'
  Archive-DreamSkinConfigBackup -BackupPath $paths.BackupPath -ArchivePath (Join-Path $stateRoot 'second-completed.toml')

  # A legacy backup has no origin: it must never be applied to a custom home.
  Write-DreamSkinUtf8FileAtomically -Path $paths.BackupPath -Content $originalA
  Remove-Item -LiteralPath ($paths.BackupPath + '.origin.json')
  Assert-HomeRejected { Resolve-DreamSkinConfigPaths -StateRoot $stateRoot -BindBackup } 'legacy config backup'
  Remove-Item -LiteralPath $paths.BackupPath

  # A remaining journal/marker also prevents claiming an unrelated old operation.
  $env:CODEX_HOME = $homeA
  $paths = Resolve-DreamSkinConfigPaths -StateRoot $stateRoot -BindBackup
  foreach ($artifact in @((Get-DreamSkinAppearanceMarkerPath $paths.BackupPath),
    (Get-DreamSkinAppearanceTransactionPath $paths.BackupPath))) {
    Write-DreamSkinUtf8FileAtomically -Path $artifact -Content '{}'
    $env:CODEX_HOME = $homeB
    Assert-HomeRejected { Resolve-DreamSkinConfigPaths -StateRoot $stateRoot -BindBackup } 'different CODEX_HOME'
    Remove-Item -LiteralPath $artifact
  }
  Write-DreamSkinUtf8FileAtomically -Path $paths.BackupPath -Content $originalA
  Write-DreamSkinUtf8FileAtomically -Path ($paths.BackupPath + '.origin.json') -Content '{invalid'
  Assert-HomeRejected { Resolve-DreamSkinConfigPaths -StateRoot $stateRoot } 'Invalid Codex config backup origin'
  Remove-Item -LiteralPath $paths.BackupPath

  foreach ($invalid in @('relative', 'D:relative', '\rooted', '\\server\share', ' ', 'D:\bad*path',
    'D:\bad?path', 'D:\bad:path', '"D:\quoted"', (Join-Path $fixtureRoot 'missing'), $configA)) {
    $env:CODEX_HOME = $invalid
    Assert-HomeRejected { Resolve-DreamSkinConfigPaths -StateRoot $stateRoot -BindBackup } 'absolute local directory|Codex config not found'
  }
  $junction = Join-Path $fixtureRoot 'redirected home'
  New-Item -ItemType Junction -Path $junction -Target $homeA | Out-Null
  try {
    $env:CODEX_HOME = $junction
    Assert-HomeRejected { Resolve-DreamSkinConfigPaths -StateRoot $stateRoot } 'junction or symbolic link'
  } finally {
    [System.IO.Directory]::Delete($junction)
  }
  $env:CODEX_HOME = $homeB
  Remove-Item -LiteralPath $configB
  Assert-HomeRejected { Resolve-DreamSkinConfigPaths -StateRoot $stateRoot } 'Codex config not found'
  $missingPaths = Resolve-DreamSkinConfigPaths -StateRoot $stateRoot -AllowMissingConfig
  Assert-HomeTest (Test-DreamSkinPathEqual $missingPaths.ConfigPath $configB) 'Backup recovery cannot target a missing config.'

  # Unset means the default home, without ever writing into that real directory.
  $env:CODEX_HOME = $null
  if (Test-Path -LiteralPath (Join-Path $HOME '.codex\config.toml') -PathType Leaf) {
    $default = Resolve-DreamSkinConfigPaths -StateRoot $stateRoot
    Assert-HomeTest (Test-DreamSkinPathEqual $default.ConfigPath (Join-Path $HOME '.codex\config.toml')) 'Unset CODEX_HOME did not select the default.'
  } else {
    Assert-HomeRejected { Resolve-DreamSkinConfigPaths -StateRoot $stateRoot } 'Codex config not found'
  }
  Write-Host 'CODEX_HOME resolver, backup binding, restore, recovery and invalid-home checks passed.'
} finally {
  $env:CODEX_HOME = $originalCodexHome
  Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}
