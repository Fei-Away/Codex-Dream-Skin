[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 9347,
  [switch]$Uninstall,
  [switch]$RestoreBaseTheme,
  [switch]$KeepAutoHook,
  [switch]$DisableAutoHook
)

$ErrorActionPreference = 'Stop'
if ($Uninstall -and $KeepAutoHook) {
  throw 'Cannot combine -Uninstall with -KeepAutoHook because the scheduled task would point to a removed engine.'
}
if ($DisableAutoHook -and $KeepAutoHook) {
  throw 'Cannot combine -DisableAutoHook with -KeepAutoHook.'
}
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexMikuSkin'
$StatePath = Join-Path $StateRoot 'state.json'
$HookPausePath = Join-Path $StateRoot 'hook-pause.json'
$InstallStatePath = Join-Path $StateRoot 'install-state.json'
$InstallRoot = Join-Path $StateRoot 'engine'
$localInjector = Join-Path $PSScriptRoot 'injector.mjs'
$installedInjector = Join-Path $InstallRoot 'scripts\injector.mjs'
$injector = if (Test-Path -LiteralPath $localInjector) { $localInjector } else { $installedInjector }
$ProcessIdentity = Join-Path $PSScriptRoot 'process-identity.ps1'
$localUnregisterHook = Join-Path $PSScriptRoot 'unregister-miku-hook.ps1'
$installedUnregisterHook = Join-Path $InstallRoot 'scripts\unregister-miku-hook.ps1'
$unregisterHook = if (Test-Path -LiteralPath $localUnregisterHook) {
  $localUnregisterHook
} else {
  $installedUnregisterHook
}

if (-not (Test-Path -LiteralPath $ProcessIdentity)) {
  throw "Miku process identity helper not found: $ProcessIdentity"
}
. $ProcessIdentity

$runtimeTransition = Enter-MikuRuntimeTransition
try {
$pauseProcessIds = @()
if (-not $DisableAutoHook -and -not $Uninstall) {
  $package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
  if ($package) {
    $codexExecutable = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
    $pauseProcessIds = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object {
      if ($_.MainWindowHandle -eq 0) { return $false }
      try {
        return [string]::Equals(
          $_.Path,
          $codexExecutable,
          [System.StringComparison]::OrdinalIgnoreCase
        )
      } catch {
        return $false
      }
    } | ForEach-Object { [int]$_.Id })
  }
  if ($pauseProcessIds.Count -gt 0) {
    @{
      processIds = @($pauseProcessIds)
      createdAt = (Get-Date).ToString('o')
      reason = 'restore-current-session'
    } | ConvertTo-Json | Set-Content -LiteralPath $HookPausePath -Encoding utf8
  } else {
    Remove-Item -LiteralPath $HookPausePath -Force -ErrorAction SilentlyContinue
  }
} else {
  Remove-Item -LiteralPath $HookPausePath -Force -ErrorAction SilentlyContinue
}

if (($DisableAutoHook -or $Uninstall) -and (Test-Path -LiteralPath $unregisterHook)) {
  & $unregisterHook
}

function Test-CodexDebugPort([int]$CandidatePort) {
  try {
    $targets = Invoke-RestMethod "http://127.0.0.1:$CandidatePort/json/list" -TimeoutSec 1
    return [bool]($targets | Where-Object {
      $_.type -eq 'page' -and
      $_.url -like 'app://*' -and
      $_.webSocketDebuggerUrl -like "ws://127.0.0.1:$CandidatePort/*"
    })
  } catch {
    return $false
  }
}

if (Test-Path -LiteralPath $StatePath) {
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    $statePort = if ($state.port) { [int]$state.port } else { $Port }
    if ($state.injectorPid) {
      $stateInjector = if ($state.injectorPath) {
        [string]$state.injectorPath
      } elseif ($state.skillRoot) {
        Join-Path ([string]$state.skillRoot) 'scripts\injector.mjs'
      } else {
        $injector
      }
      $stateExecutable = if ($state.nodeExecutable) { [string]$state.nodeExecutable } else { '' }
      [void](Stop-MikuInjectorProcess `
        -ProcessId ([int]$state.injectorPid) `
        -InjectorPath $stateInjector `
        -ExecutablePath $stateExecutable `
        -Port $statePort `
        -InstanceToken ([string]$state.instanceToken) `
        -StartedAt ([string]$(if ($state.injectorStartedAt) { $state.injectorStartedAt } else { $state.startedAt })))
    }
    $Port = $statePort
  } catch {}
  Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 250
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node -and (Test-Path -LiteralPath $injector) -and (Test-CodexDebugPort $Port)) {
  $previousErrorAction = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $node.Source $injector --remove --port $Port --timeout-ms 3000 2>$null | Out-Null
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }
}

if ($RestoreBaseTheme) {
  $backup = Join-Path $StateRoot 'config.before-miku-stage.toml'
  $userProfile = [Environment]::GetFolderPath('UserProfile')
  $config = Join-Path $userProfile '.codex\config.toml'
  if (-not (Test-Path -LiteralPath $backup)) {
    throw 'No pre-install Codex config backup is available.'
  }
  if (-not (Test-Path -LiteralPath $config)) {
    throw "Codex config not found: $config"
  }
  $backupContent = Get-Content -LiteralPath $backup -Raw
  $currentContent = Get-Content -LiteralPath $config -Raw
  $scalarKeys = @(
    'appearanceTheme',
    'appearanceLightCodeThemeId',
    'appearanceDarkCodeThemeId',
    'appearanceDiffMarkerStyle'
  )
  foreach ($key in $scalarKeys) {
    $pattern = "(?m)^$([regex]::Escape($key))\s*=.*(?:\r?\n)?"
    $saved = [regex]::Match($backupContent, $pattern)
    if ([regex]::IsMatch($currentContent, $pattern)) {
      $replacement = if ($saved.Success) {
        $saved.Value.TrimEnd() + [Environment]::NewLine
      } else {
        ''
      }
      $currentContent = [regex]::Replace($currentContent, $pattern, $replacement, 1)
    } elseif ($saved.Success) {
      $desktop = [regex]::Match($currentContent, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
      if (-not $desktop.Success) {
        $currentContent =
          $currentContent.TrimEnd() +
          [Environment]::NewLine +
          [Environment]::NewLine +
          '[desktop]' +
          [Environment]::NewLine
        $desktop = [regex]::Match($currentContent, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
      }
      $body =
        $desktop.Groups['body'].Value.TrimEnd() +
        [Environment]::NewLine +
        $saved.Value.TrimEnd() +
        [Environment]::NewLine
      $currentContent =
        $currentContent.Substring(0, $desktop.Groups['body'].Index) +
        $body +
        $currentContent.Substring($desktop.Groups['body'].Index + $desktop.Groups['body'].Length)
    }
  }

  $currentContent = [regex]::Replace(
    $currentContent,
    '(?m)^appearance(?:Dark|Light)ChromeTheme\s*=.*(?:\r?\n)?',
    ''
  )
  $themeTables = @(
    'desktop.appearanceLightChromeTheme',
    'desktop.appearanceLightChromeTheme.fonts',
    'desktop.appearanceLightChromeTheme.semanticColors',
    'desktop.appearanceDarkChromeTheme',
    'desktop.appearanceDarkChromeTheme.fonts',
    'desktop.appearanceDarkChromeTheme.semanticColors'
  )
  foreach ($tableName in $themeTables) {
    $tablePattern =
      '(?ms)^\[' +
      [regex]::Escape($tableName) +
      '\]\s*\r?\n.*?(?=^\[|\z)'
    $currentContent = [regex]::Replace($currentContent, $tablePattern, '', 1)
  }

  foreach ($inlineKey in @('appearanceLightChromeTheme', 'appearanceDarkChromeTheme')) {
    $inlinePattern = "(?m)^$([regex]::Escape($inlineKey))\s*=.*$"
    $savedInline = [regex]::Match($backupContent, $inlinePattern)
    if (-not $savedInline.Success) { continue }
    $desktop = [regex]::Match($currentContent, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
    if (-not $desktop.Success) {
      $currentContent =
        $currentContent.TrimEnd() +
        [Environment]::NewLine +
        [Environment]::NewLine +
        '[desktop]' +
        [Environment]::NewLine
      $desktop = [regex]::Match($currentContent, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
    }
    $body =
      $desktop.Groups['body'].Value.TrimEnd() +
      [Environment]::NewLine +
      $savedInline.Value.TrimEnd() +
      [Environment]::NewLine
    $currentContent =
      $currentContent.Substring(0, $desktop.Groups['body'].Index) +
      $body +
      $currentContent.Substring($desktop.Groups['body'].Index + $desktop.Groups['body'].Length)
  }

  foreach ($tableName in $themeTables) {
    $tablePattern =
      '(?ms)^\[' +
      [regex]::Escape($tableName) +
      '\]\s*\r?\n.*?(?=^\[|\z)'
    $savedTable = [regex]::Match($backupContent, $tablePattern)
    if ($savedTable.Success) {
      $currentContent =
        $currentContent.TrimEnd() +
        [Environment]::NewLine +
        [Environment]::NewLine +
        $savedTable.Value.Trim() +
        [Environment]::NewLine
    }
  }
  Set-Content -LiteralPath $config -Value $currentContent -Encoding utf8
}

if ($Uninstall) {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  @(
    (Join-Path $desktop 'Codex Miku Stage.lnk'),
    (Join-Path $desktop 'Codex Miku Stage - Restore.lnk'),
    (Join-Path $startMenu 'Codex Miku Stage.lnk')
  ) | ForEach-Object {
    Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $InstallStatePath -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $InstallRoot) {
    $resolvedEngine = [System.IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
    $expectedEngine = [System.IO.Path]::GetFullPath((Join-Path $StateRoot 'engine')).TrimEnd('\')
    if (-not [string]::Equals($resolvedEngine, $expectedEngine, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove unexpected install root: $resolvedEngine"
    }
    Remove-Item -LiteralPath $resolvedEngine -Recurse -Force
  }
}

Write-Host 'The live Codex Miku Stage skin was removed.'
if ($pauseProcessIds.Count -gt 0) {
  Write-Host 'The current Codex session will remain native; the automatic hook resumes after this process exits.'
}
if ($DisableAutoHook) { Write-Host 'The automatic hook was explicitly disabled.' }
if ($RestoreBaseTheme) { Write-Host 'The pre-install appearance settings were restored.' }
if ($Uninstall) { Write-Host 'Shortcuts and the installed engine were removed.' }
} finally {
  Exit-MikuRuntimeTransition -Mutex $runtimeTransition
}
