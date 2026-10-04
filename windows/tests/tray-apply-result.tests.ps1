$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts/common-windows.ps1')
Add-Type -AssemblyName System.Windows.Forms
$trayPath = Join-Path $root 'scripts/tray-dream-skin.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($trayPath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw $errors[0] }
foreach ($name in @('Set-DreamSkinTrayApplyStatus', 'Complete-DreamSkinTrayApply', 'Start-DreamSkinVerifiedTrayApply')) {
  $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
  if (-not $definition) { throw "Missing tray function: $name" }
  . ([scriptblock]::Create($definition.Extent.Text))
}

$StateRoot = Join-Path ([IO.Path]::GetTempPath()) ('dreamskin-tray-result-' + [guid]::NewGuid().ToString('N'))
$script:themeStatusLabel = [pscustomobject]@{ Text = ''; IsDisposed = $false }
$notify = [pscustomobject]@{}
$notify | Add-Member ScriptMethod ShowBalloonTip { param($duration, $title, $message, $icon) $script:lastTrayBalloon = $message }
function Get-DreamSkinTrayText {
  param($Key, $FormatArguments)
  if ($Key -eq 'Applied') { return 'Applied: ' + $FormatArguments[0] }
  return $Key
}
function New-TrayDisposableFixture {
  $fixture = [pscustomobject]@{ Disposed = $false; Stopped = $false; ExitCode = 0 }
  $fixture | Add-Member ScriptMethod Dispose { $this.Disposed = $true }
  $fixture | Add-Member ScriptMethod Stop { $this.Stopped = $true }
  return $fixture
}

try {
  [IO.Directory]::CreateDirectory($StateRoot) | Out-Null
  foreach ($case in @(
    @{ Name = 'verified success'; Outcome = 'success'; ExitCode = 0; Expected = $true },
    @{ Name = 'failed renderer'; Outcome = 'failure'; ExitCode = 1; Expected = $false },
    @{ Name = 'success result with failed exit'; Outcome = 'success'; ExitCode = 1; Expected = $false },
    @{ Name = 'failure result with zero exit'; Outcome = 'failure'; ExitCode = 0; Expected = $false },
    @{ Name = 'cancelled without result'; Outcome = 'missing'; ExitCode = 0; Expected = $false },
    @{ Name = 'invalid result'; Outcome = 'invalid'; ExitCode = 0; Expected = $false }
  )) {
    $token = [guid]::NewGuid().ToString('N')
    $resultPath = Get-DreamSkinStartResultPath -StateRoot $StateRoot -Token $token
    if ($case.Outcome -in @('success', 'failure')) {
      $category = if ($case.Outcome -eq 'success') { 'none' } else { 'renderer-verification-failed' }
      Write-DreamSkinStartResult -StateRoot $StateRoot -Token $token -Outcome $case.Outcome -Category $category -AppearanceRecovery 'not-needed'
    } elseif ($case.Outcome -eq 'invalid') {
      [IO.File]::WriteAllText($resultPath, '{"outcome":"success"}')
    }
    $process = New-TrayDisposableFixture
    $process.ExitCode = $case.ExitCode
    $timer = New-TrayDisposableFixture
    $script:trayApplyOperation = [pscustomobject]@{
      Process = $process; Timer = $timer; Token = $token; ResultPath = $resultPath; ThemeName = 'Paper'
    }
    $script:trayApplyPending = $true
    Complete-DreamSkinTrayApply
    if ($script:trayApplySucceeded -ne $case.Expected) { throw "Wrong result: $($case.Name)" }
    if (($script:lastTrayBalloon -like 'Applied:*') -ne $case.Expected) { throw "False success balloon: $($case.Name)" }
    if ($script:trayApplyPending -or $null -ne $script:trayApplyOperation -or
      -not $process.Disposed -or -not $timer.Disposed -or -not $timer.Stopped -or
      (Test-Path -LiteralPath $resultPath)) { throw "Result cleanup failed: $($case.Name)" }
  }

  # A second selection must not even mutate the active theme while the first
  # process is waiting for restart consent or renderer verification.
  function Invoke-DreamSkinTrayThemeOperation { throw 'Concurrent selection changed the theme.' }
  $script:trayApplyPending = $true
  Start-DreamSkinVerifiedTrayApply -ThemeName 'Another' -ThemeDirectory 'must-not-be-used'
  $script:trayApplyPending = $false

  # Failure to launch must restore pending state and language, allowing retry.
  function Resolve-DreamSkinLanguage { return 'en-US' }
  function Start-Process {
    param($FilePath, $ArgumentList, $WindowStyle, [switch]$PassThru)
    $script:launchArguments = $ArgumentList
    throw 'fixture-launch-failure'
  }
  $powershell = 'fixture-powershell'
  $startScript = 'fixture-start.ps1'
  $Port = 9335
  $priorLanguage = $env:DREAMSKIN_LANG
  $launchFailed = $false
  try { Start-DreamSkinVerifiedTrayApply -ThemeName 'Paper' -ThemeDirectory 'C:\saved themes\Paper' } catch { $launchFailed = $_.Exception.Message -eq 'fixture-launch-failure' }
  if (-not $launchFailed -or $script:trayApplyPending -or $null -ne $script:trayApplyOperation -or
    $env:DREAMSKIN_LANG -cne $priorLanguage) { throw 'Launch failure did not restore the tray state.' }
  if (-not $script:launchArguments.Contains(' -SavedThemeDirectory "C:\saved themes\Paper"')) {
    throw 'The tray did not pass the selected theme safely to its verified child.'
  }

  # Import only reusable transaction helpers: no community UI, strict-mode,
  # language, TLS or error-policy mutation may leak into the start script.
  $dreamSkinLanguage = 'fixture-language'
  $priorProtocol = [Net.ServicePointManager]::SecurityProtocol
  $ErrorActionPreference = 'Continue'
  . (Join-Path $root 'scripts/apply-community-theme.ps1') -FunctionsOnly
  if ($ErrorActionPreference -cne 'Continue' -or $dreamSkinLanguage -cne 'fixture-language' -or
    [Net.ServicePointManager]::SecurityProtocol -ne $priorProtocol) {
    throw 'Loading theme transaction helpers changed caller policy or language.'
  }
  $ErrorActionPreference = 'Stop'
  $communityCommand = Get-Command (Join-Path $root 'scripts/apply-community-theme.ps1')
  $applyParameterSet = @($communityCommand.ParameterSets | Where-Object { $_.Name -ceq 'Apply' })
  if ($applyParameterSet.Count -ne 1 -or -not $applyParameterSet[0].IsDefault -or
    -not (@($applyParameterSet[0].Parameters | Where-Object { $_.Name -ceq 'Uri' })[0].IsMandatory)) {
    throw 'Normal community invocation no longer requires its URI parameter.'
  }
  . (Join-Path $root 'scripts/theme-windows.ps1')
  $startAst = [Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $root 'scripts/start-dream-skin.ps1'), [ref]$tokens, [ref]$errors)
  $recoveryDefinition = $startAst.Find({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -eq 'Restore-DreamSkinStartupThemeSelection'
  }, $true)
  . ([scriptblock]::Create($recoveryDefinition.Extent.Text))
  $theme = Read-DreamSkinUtf8File -Path (Join-Path $root 'assets/theme.json') | ConvertFrom-Json
  $imagePath = Join-Path $root 'assets/dream-reference.jpg'
  $null = Set-DreamSkinActiveTheme -ImagePath $imagePath -Theme $theme -Name 'Before' -StateRoot $StateRoot
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  $before = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active
  $snapshot = Join-Path $StateRoot '.tray-apply-fixture'
  $null = Copy-DreamSkinActiveThemeSnapshot -Paths $paths -Destination $snapshot
  $null = Set-DreamSkinActiveTheme -ImagePath $imagePath -Theme $theme -Name 'Selected' -StateRoot $StateRoot
  $selection = [pscustomobject]@{
    Snapshot = $snapshot; PreviousFingerprint = $before
    SelectedFingerprint = (Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active)
  }
  if ((Restore-DreamSkinStartupThemeSelection -Transaction $selection -Paths $paths -StateRoot $StateRoot) -cne 'restored' -or
    (Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -cne $before) {
    throw 'The selected theme did not restore the real previous theme files.'
  }
  $null = Set-DreamSkinActiveTheme -ImagePath $imagePath -Theme $theme -Name 'Newer' -StateRoot $StateRoot
  $newer = Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active
  if ((Restore-DreamSkinStartupThemeSelection -Transaction $selection -Paths $paths -StateRoot $StateRoot) -cne 'superseded' -or
    (Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -cne $newer) {
    throw 'Theme rollback overwrote newer real theme files.'
  }
  $selection.SelectedFingerprint = $newer
  $selection.PreviousFingerprint = 'f' * 64
  $rejected = $false
  try { Restore-DreamSkinStartupThemeSelection -Transaction $selection -Paths $paths -StateRoot $StateRoot } catch {
    $rejected = $_.Exception.Message -like '*snapshot changed*'
  }
  if (-not $rejected -or (Get-DreamSkinThemeRuntimeContentFingerprint -ThemeDirectory $paths.Active) -cne $newer) {
    throw 'Changed rollback snapshot was accepted or modified the active theme.'
  }
  Write-Output 'Tray verified apply and guarded real-file rollback tests passed.'
} finally {
  $resolved = [IO.Path]::GetFullPath($StateRoot)
  $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolved.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and
    [IO.Path]::GetFileName($resolved).StartsWith('dreamskin-tray-result-')) {
    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
  }
}
