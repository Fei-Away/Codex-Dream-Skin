[CmdletBinding()]
param([switch]$FunctionsOnly)

. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')
. (Join-Path $PSScriptRoot 'operation-log.ps1')
. (Join-Path $PSScriptRoot 'localization-windows.ps1')

function Assert-DreamSkinDefaultEngine {
  param([Parameter(Mandatory = $true)][string]$StateRoot)
  $engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $StateRoot
  Assert-DreamSkinNoReparseComponents -Path $engine.Root
  foreach ($relative in @('VERSION', 'scripts\common-windows.ps1', 'scripts\theme-windows.ps1', 'scripts\config-utf8.ps1', 'scripts\operation-log.ps1', 'scripts\localization-windows.ps1', 'scripts\launch-themed-codex.ps1', 'scripts\start-dream-skin.ps1')) {
    $path = Join-Path $engine.Root $relative
    Assert-DreamSkinNoReparseComponents -Path $path
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Managed default launcher is incomplete; reinstall Dream Skin.' }
  }
  if ((Get-Item -LiteralPath $engine.Version).Length -gt 64) { throw 'Managed engine version is oversized.' }
  $version = Read-DreamSkinUtf8File -Path $engine.Version
  if ($version.Trim() -cnotmatch '^\d+\.\d+\.\d+$') { throw 'Managed engine version is invalid.' }
  return $engine
}

function Get-DreamSkinDefaultShortcutArguments {
  param([string]$Launcher)
  return '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' + (ConvertTo-DreamSkinProcessArgument -Value $Launcher)
}

function Get-DreamSkinDefaultShortcutName {
  return 'Codex Dream Skin - Launch.lnk'
}

function Get-DreamSkinLegacyDefaultShortcutNames {
  # Retain the former display name only for verified migration and uninstall.
  return 'Codex ' + [char]0x00b7 + ' ' + (-join ([char[]]@(0x9ed8,0x8ba4,0x4e3b,0x9898,0x542f,0x52a8))) + '.lnk'
}

function Remove-DreamSkinLegacyDefaultShortcuts {
  param([Parameter(Mandatory = $true)][string]$StateRoot, [Parameter(Mandatory = $true)][string]$Directory)
  foreach ($name in @(Get-DreamSkinLegacyDefaultShortcutNames)) {
    Remove-DreamSkinDefaultShortcut -StateRoot $StateRoot -ShortcutPath (Join-Path $Directory $name)
  }
}

function Remove-DreamSkinDefaultShortcuts {
  param([Parameter(Mandatory = $true)][string]$StateRoot, [Parameter(Mandatory = $true)][string]$Directory)
  foreach ($name in @((Get-DreamSkinDefaultShortcutName)) + @(Get-DreamSkinLegacyDefaultShortcutNames)) {
    Remove-DreamSkinDefaultShortcut -StateRoot $StateRoot -ShortcutPath (Join-Path $Directory $name)
  }
}

function New-DreamSkinDefaultShortcut {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'), [string]$ShortcutPath)
  $engine = Assert-DreamSkinDefaultEngine -StateRoot $StateRoot
  if (-not $ShortcutPath) {
    $ShortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) (Get-DreamSkinDefaultShortcutName)
  }
  $path = [IO.Path]::GetFullPath($ShortcutPath)
  if ([IO.Path]::GetExtension($path) -ine '.lnk') { throw 'Default shortcut must be a .lnk file.' }
  Assert-DreamSkinNoReparseComponents -Path $path
  if (-not (Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($path)) -PathType Container)) { throw 'Shortcut destination does not exist.' }
  $shell = New-Object -ComObject WScript.Shell
  $powershell = Join-Path ([Environment]::GetFolderPath('Windows')) 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $arguments = Get-DreamSkinDefaultShortcutArguments -Launcher $engine.DefaultLaunch
  if (Test-Path -LiteralPath $path) {
    $existing = $shell.CreateShortcut($path)
    if (-not (Test-DreamSkinPathEqual -Left $existing.TargetPath -Right $powershell) -or $existing.Arguments -cne $arguments) {
      throw 'An unrelated shortcut already exists; choose another name.'
    }
    if ([IO.Path]::GetFileName($path) -ceq (Get-DreamSkinDefaultShortcutName)) {
      Remove-DreamSkinLegacyDefaultShortcuts -StateRoot $StateRoot -Directory ([IO.Path]::GetDirectoryName($path))
    }
    return $path
  }
  $temporary = Join-Path ([IO.Path]::GetDirectoryName($path)) ('.dream-shortcut-' + [guid]::NewGuid().ToString('N') + '.lnk')
  Assert-DreamSkinNoReparseComponents -Path $temporary
  $shortcut = $shell.CreateShortcut($temporary)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = $arguments
  $shortcut.WorkingDirectory = $engine.Root
  $shortcut.Description = Get-DreamSkinText -Key 'DefaultShortcutDescription' -Language (Resolve-DreamSkinLanguage -StateRoot $StateRoot)
  $icon = Join-Path $engine.Root 'assets\codex-dream-skin.ico'
  Assert-DreamSkinNoReparseComponents -Path $icon
  if (Test-Path -LiteralPath $icon -PathType Leaf) { $shortcut.IconLocation = "$icon,0" }
  try {
    $shortcut.Save()
    Assert-DreamSkinNoReparseComponents -Path $temporary
    Assert-DreamSkinNoReparseComponents -Path $path
    [IO.File]::Move($temporary, $path)
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  }
  # Only retire verified aliases after the new entry has been saved successfully.
  if ([IO.Path]::GetFileName($path) -ceq (Get-DreamSkinDefaultShortcutName)) {
    Remove-DreamSkinLegacyDefaultShortcuts -StateRoot $StateRoot -Directory ([IO.Path]::GetDirectoryName($path))
  }
  return $path
}

function Remove-DreamSkinDefaultShortcut {
  param([Parameter(Mandatory = $true)][string]$StateRoot, [Parameter(Mandatory = $true)][string]$ShortcutPath)
  $path = [IO.Path]::GetFullPath($ShortcutPath)
  Assert-DreamSkinNoReparseComponents -Path $path
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return }
  $engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $StateRoot
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($path)
  $powershell = Join-Path ([Environment]::GetFolderPath('Windows')) 'System32\WindowsPowerShell\v1.0\powershell.exe'
  if ((Test-DreamSkinPathEqual -Left $shortcut.TargetPath -Right $powershell) -and $shortcut.Arguments -ceq (Get-DreamSkinDefaultShortcutArguments -Launcher $engine.DefaultLaunch)) {
    Remove-Item -LiteralPath $path -Force
  }
}

function Read-DreamSkinLaunchRecovery {
  param([Parameter(Mandatory = $true)][string]$StateRoot, [Parameter(Mandatory = $true)][string]$Token)
  if ($Token -cnotmatch '^[a-f0-9]{32}$') { throw 'Invalid recovery token.' }
  $path = Join-Path $StateRoot ('.panel-start-recovery-' + $Token + '.json')
  Assert-DreamSkinNoReparseComponents -Path $path
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  $stream = [IO.FileStream]::new($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    if ($stream.Length -le 0 -or $stream.Length -gt 4096) { throw 'Invalid recovery result size.' }
    $bytes = [byte[]]::new([int]$stream.Length)
    $offset = 0
    while ($offset -lt $bytes.Length) {
      $count = $stream.Read($bytes, $offset, $bytes.Length - $offset)
      if ($count -le 0) { throw 'Truncated recovery result.' }
      $offset += $count
    }
  } finally { $stream.Dispose() }
  $value = (ConvertFrom-DreamSkinUtf8Bytes -Bytes $bytes -Path $path) | ConvertFrom-Json -ErrorAction Stop
  $fields = @('schemaVersion','operationId','outcome','diskRecovery','visibleRecovery')
  if ($null -eq $value -or $value -is [string] -or $value -is [array] -or @($value.PSObject.Properties).Count -ne $fields.Count) { throw 'Invalid recovery result shape.' }
  foreach ($field in $value.PSObject.Properties) { if ($fields -cnotcontains $field.Name) { throw 'Unknown recovery result field.' } }
  $allowed = @('not-needed','restored','verified','unverified','blocked','superseded')
  if (($value.schemaVersion -isnot [int] -and $value.schemaVersion -isnot [long]) -or $value.schemaVersion -ne 1 -or
    $value.operationId -isnot [string] -or $value.operationId -cne $Token -or
    $value.outcome -isnot [string] -or @('success','failure','cancelled') -cnotcontains $value.outcome -or
    $value.diskRecovery -isnot [string] -or $allowed -cnotcontains $value.diskRecovery -or
    $value.visibleRecovery -isnot [string] -or $allowed -cnotcontains $value.visibleRecovery) { throw 'Invalid recovery result fields.' }
  return $value
}

function Get-DreamSkinDefaultLaunchFailureText {
  param([Parameter(Mandatory = $true)]$Result, [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))
  $language = Resolve-DreamSkinLanguage -StateRoot $StateRoot
  $recoveryKeys = @{
    'not-needed' = 'DefaultRecoveryNotNeeded'; 'restored' = 'DefaultRecoveryRestored'; 'verified' = 'DefaultRecoveryVerified'
    'unverified' = 'DefaultRecoveryUnverified'; 'blocked' = 'DefaultRecoveryBlocked'; 'superseded' = 'DefaultRecoverySuperseded'
    'retained' = 'DefaultRecoveryRetained'; 'conflict-preserved' = 'DefaultRecoveryConflictPreserved'; 'preserved-rendered' = 'DefaultRecoveryPreservedRendered'
  }
  $values = @([string]$Result.category)
  foreach ($value in @($Result.appearanceRecovery, $Result.diskRecovery, $Result.visibleRecovery)) {
    $key = $recoveryKeys[[string]$value]
    if (-not $key) { $key = 'DefaultRecoveryUnverified' }
    $values += Get-DreamSkinText -Key $key -Language $language
  }
  return Get-DreamSkinText -Key 'DefaultLaunchUnconfirmed' -Language $language -FormatArguments $values
}

function Invoke-DreamSkinDefaultLaunch {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))
  $id = [guid]::NewGuid().ToString('N')
  $category = 'internal-start-failure'; $recovery = 'not-needed'; $disk = 'not-needed'; $visible = 'not-needed'
  $null = Write-DreamSkinOperationEvent -StateRoot $StateRoot -OperationId $id -Source launcher -Action default-launch -Stage begin -Outcome pending
  try {
    $category = 'engine-invalid'
    $engine = Assert-DreamSkinDefaultEngine -StateRoot $StateRoot
    $category = 'internal-start-failure'
    $powershell = Join-Path ([Environment]::GetFolderPath('Windows')) 'System32\WindowsPowerShell\v1.0\powershell.exe'
    # A payload entry always delegates to the currently installed managed engine.
    # Never compare payload hashes or replace a newer engine during ordinary launch.
    $arguments = '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' +
      (ConvertTo-DreamSkinProcessArgument -Value $engine.Start) + ' -PromptRestart -PanelRequest -OperationSource shortcut -StateRoot ' +
      (ConvertTo-DreamSkinProcessArgument -Value $StateRoot) + ' -ResultToken ' + $id
    $resultPath = Get-DreamSkinStartResultPath -StateRoot $StateRoot -Token $id
    Assert-DreamSkinNoReparseComponents -Path $resultPath
    if (Test-Path -LiteralPath $resultPath) { throw 'Default launch result token already exists.' }
    $sidecarPath = Join-Path $StateRoot ('.panel-start-recovery-' + $id + '.json')
    Assert-DreamSkinNoReparseComponents -Path $sidecarPath
    if (Test-Path -LiteralPath $sidecarPath) { throw 'Default launch recovery token already exists.' }
    $process = Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
    try {
      $category = 'result-unconfirmed'
      $sidecar = Read-DreamSkinLaunchRecovery -StateRoot $StateRoot -Token $id
      if ($sidecar) {
        $disk = $sidecar.diskRecovery; $visible = $sidecar.visibleRecovery
        if ($process.ExitCode -eq 0 -and $sidecar.outcome -ceq 'cancelled' -and -not (Test-Path -LiteralPath $resultPath)) {
          $null = Write-DreamSkinOperationEvent -StateRoot $StateRoot -OperationId $id -Source launcher -Action default-launch -Stage complete -Outcome cancelled -Category user-cancelled
          return [pscustomobject]@{operationId=$id; outcome='cancelled'; category='user-cancelled'; appearanceRecovery='not-needed'; diskRecovery=$disk; visibleRecovery=$visible}
        }
      }
      if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) {
        $category = 'result-unconfirmed'
        throw 'Default launch rendering could not be confirmed.'
      }
      $result = Read-DreamSkinStartResult -StateRoot $StateRoot -Token $id
      $category = $result.category; $recovery = $result.appearanceRecovery
      if ($sidecar -and $sidecar.outcome -cne $result.outcome) { throw 'Conflicting default launch recovery results.' }
      if ($process.ExitCode -ne 0 -or $result.outcome -cne 'success') { throw 'Default theme application failed; inspect recovery and operation logs.' }
    } finally {
      $process.Dispose()
      Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $sidecarPath -Force -ErrorAction SilentlyContinue
    }
    $null = Write-DreamSkinOperationEvent -StateRoot $StateRoot -OperationId $id -Source launcher -Action default-launch -Stage complete -Outcome success -Details @{appearanceRecovery=$recovery; diskRecovery=$disk; visibleRecovery=$visible}
    return [pscustomobject]@{operationId=$id; outcome='success'; category='none'; appearanceRecovery=$recovery; diskRecovery=$disk; visibleRecovery=$visible}
  } catch {
    if ($category -ceq 'none') { $category = 'result-unconfirmed' }
    $null = Write-DreamSkinOperationEvent -StateRoot $StateRoot -OperationId $id -Source launcher -Action default-launch -Stage complete -Outcome failure -Category $category -Message $_.Exception.Message -Details @{appearanceRecovery=$recovery; diskRecovery=$disk; visibleRecovery=$visible}
    return [pscustomobject]@{operationId=$id; outcome='failure'; category=$category; appearanceRecovery=$recovery; diskRecovery=$disk; visibleRecovery=$visible}
  }
}

if (-not $FunctionsOnly) {
  $stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  try {
    $managed = Assert-DreamSkinDefaultEngine -StateRoot $stateRoot
    if (-not (Test-DreamSkinPathEqual -Left $PSCommandPath -Right $managed.DefaultLaunch)) {
      $powershell = Join-Path ([Environment]::GetFolderPath('Windows')) 'System32\WindowsPowerShell\v1.0\powershell.exe'
      $child = Start-Process -FilePath $powershell -ArgumentList (Get-DreamSkinDefaultShortcutArguments -Launcher $managed.DefaultLaunch) -WindowStyle Hidden -Wait -PassThru
      try { $code = $child.ExitCode } finally { $child.Dispose() }
      exit $code
    }
  } catch {
    $id = [guid]::NewGuid().ToString('N')
    $null = Write-DreamSkinOperationEvent -StateRoot $stateRoot -OperationId $id -Source launcher -Action default-launch -Stage validate -Outcome failure -Category engine-invalid -Message $_.Exception.Message
    Add-Type -AssemblyName System.Windows.Forms
    $message = Get-DreamSkinText -Key 'DefaultLauncherUnavailable' -Language (Resolve-DreamSkinLanguage -StateRoot $stateRoot)
    [Windows.Forms.MessageBox]::Show($message, 'Codex Dream Skin', 'OK', 'Warning') | Out-Null
    exit 1
  }
  $result = Invoke-DreamSkinDefaultLaunch
  if ($result.outcome -ceq 'cancelled') { exit 0 }
  if ($result.outcome -cne 'success') {
    Add-Type -AssemblyName System.Windows.Forms
    $message = Get-DreamSkinDefaultLaunchFailureText -Result $result -StateRoot $stateRoot
    [Windows.Forms.MessageBox]::Show($message, 'Codex Dream Skin', 'OK', 'Warning') | Out-Null
    exit 1
  }
}
