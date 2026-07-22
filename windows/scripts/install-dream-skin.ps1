[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$NoShortcuts
)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$SkillRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$operationLock = Enter-DreamSkinOperationLock
try {
  Assert-DreamSkinPort -Port $Port
  $null = Get-DreamSkinNodeRuntime
  $registeredInstalls = @(Get-DreamSkinRegisteredCodexInstalls)
  if ($registeredInstalls.Count -eq 0) {
    throw 'The official OpenAI.Codex Store package is not installed or its identity cannot be validated.'
  }
  foreach ($registeredCodex in $registeredInstalls) {
    if ((Get-DreamSkinCodexProcesses -Codex $registeredCodex).Count -gt 0) {
      throw 'Close Codex before installing Dream Skin so config.toml cannot change during the transaction.'
    }
  }

  $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  $themePaths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $themePaths.Root -Root $themePaths.Root
  $StatePath = Join-Path $StateRoot 'state.json'
  $existingState = Read-DreamSkinState -Path $StatePath
  $savedPathCandidate = Get-DreamSkinCodexStatePathCandidate -State $existingState
  $savedCodex = Resolve-DreamSkinCodexInstallFromState -State $existingState -RegisteredInstalls $registeredInstalls
  if ($null -ne $savedPathCandidate -and $null -eq $savedCodex -and
    (Get-DreamSkinCodexProcesses -Codex $savedPathCandidate).Count -gt 0) {
    throw 'The saved Codex path is still running but no longer matches a registered Store package. Close it manually before installing.'
  }
  if (Test-DreamSkinTrayActive) {
    throw 'Exit the Codex Dream Skin tray before reinstalling so every shortcut can move to the new runtime safely.'
  }
  $engine = Install-DreamSkinRuntimeEngine -SkillRoot $SkillRoot -StateRoot $StateRoot
  $null = Initialize-DreamSkinThemeStore -SkillRoot $engine.Root -StateRoot $StateRoot
  # The Codex icon is a checked-in, user-readable asset copied into the runtime.
  $codexIconPath = Get-DreamSkinCodexIconPath -RuntimeRoot $engine.Root
  if (-not $codexIconPath) {
    throw 'The managed Codex icon asset is missing; refusing to use a package executable as a shortcut icon.'
  }
  $ConfigPath = Join-Path $HOME '.codex\config.toml'
  $BackupPath = Join-Path $StateRoot 'config.before-dream-skin.toml'
  Install-DreamSkinBaseTheme -ConfigPath $ConfigPath -BackupPath $BackupPath

  if (-not $NoShortcuts) {
    $shell = New-Object -ComObject WScript.Shell
    $desktop = [Environment]::GetFolderPath('Desktop')
    $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $consoleExecutable = $engine.ConsoleExecutable
    if (-not (Test-Path -LiteralPath $codexIconPath -PathType Leaf)) {
      throw 'The extracted Codex icon is unavailable; shortcuts were not created.'
    }
    if (-not (Test-Path -LiteralPath $consoleExecutable -PathType Leaf)) {
      throw 'The native Codex Dream Skin launcher is unavailable; shortcuts were not created.'
    }
    $portArgument = if ($PortExplicit) { "-Port $Port" } else { '' }

    foreach ($folder in @($desktop, $startMenu)) {
      $console = $shell.CreateShortcut((Join-Path $folder 'Codex Dream Skin Console.lnk'))
      $console.TargetPath = $consoleExecutable
      $console.Arguments = $portArgument
      $console.WorkingDirectory = $engine.Root
      $console.Description = 'Open the Codex Dream Skin control panel'
      $console.IconLocation = "$consoleExecutable,0"
      $console.Save()
      foreach ($legacyName in @(
        'Codex Dream Skin.lnk',
        'Codex Dream Skin - Restore.lnk',
        'Codex Dream Skin - Tray.lnk'
      )) {
        Remove-Item -LiteralPath (Join-Path $folder $legacyName) -Force -ErrorAction SilentlyContinue
      }
    }
  }

  if ($NoShortcuts) {
    Write-Host "Codex Dream Skin base theme installed at $($engine.Root). Run $($engine.Console) to open the control panel."
  } else {
    Write-Host 'Codex Dream Skin installed. Use the single console shortcut to manage launch, themes, pause, restore, and verification.'
  }
} finally {
  Exit-DreamSkinOperationLock -Mutex $operationLock
}
