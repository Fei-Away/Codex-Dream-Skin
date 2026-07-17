[CmdletBinding()]
param(
  [string]$File,
  [switch]$DryRun,
  [switch]$Replace,
  [switch]$Apply,
  [switch]$NoPrompt,
  [int]$Port = 9335,
  [string]$StateRoot
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$SkillRoot = Split-Path -Parent $PSScriptRoot
if (-not $StateRoot) { $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin' }
if (-not $File) {
  if ($DryRun) { throw '-DryRun requires -File.' }
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = [System.Windows.Forms.OpenFileDialog]::new()
  $dialog.Title = '选择 .dreamskin 主题包'
  $dialog.Filter = 'Dream Skin package|*.dreamskin|All files|*.*'
  $dialog.Multiselect = $false
  try {
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $File = $dialog.FileName
  } finally {
    $dialog.Dispose()
  }
}
$fullFile = [System.IO.Path]::GetFullPath($File)
if (-not (Test-Path -LiteralPath $fullFile -PathType Leaf)) {
  throw "Theme package does not exist: $fullFile"
}

$bundledTool = Join-Path $SkillRoot 'theme-package\tools\theme-package.mjs'
$repositoryTool = Join-Path (Split-Path -Parent $SkillRoot) 'tools\theme-package.mjs'
$tool = if (Test-Path -LiteralPath $bundledTool -PathType Leaf) { $bundledTool } else { $repositoryTool }
if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
  throw 'Theme package runtime is missing. Reinstall Dream Skin.'
}
$node = Get-DreamSkinNodeRuntime

function Invoke-DreamSkinThemePackageImport {
  param([Parameter(Mandatory = $true)][string[]]$ModeArguments)
  $arguments = @(
    $tool, 'import', $fullFile,
    '--platform', 'windows',
    '--dream-skin-version', '1.3.0'
  ) + $ModeArguments
  $native = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList $arguments
  $text = ($native.Output -join "`n")
  try { $json = $text | ConvertFrom-Json -ErrorAction Stop } catch {
    throw 'Theme package runtime returned invalid JSON.'
  }
  return [pscustomobject]@{ ExitCode = $native.ExitCode; Text = $text; Json = $json }
}

function Show-DreamSkinImportError {
  param([Parameter(Mandatory = $true)][object]$Result)
  if (-not $NoPrompt) {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
      "主题包处理失败：$($Result.Json.message)",
      'Codex Dream Skin',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  }
  Write-Output $Result.Text
}

$inspection = Invoke-DreamSkinThemePackageImport -ModeArguments @('--dry-run')
if ($inspection.ExitCode -ne 0) {
  Show-DreamSkinImportError -Result $inspection
  exit 1
}
if ($DryRun) {
  Write-Output $inspection.Text
  return
}

$applyAfterInstall = [bool]$Apply
$expectedContentHash = "$($inspection.Json.contentHash)"
if (-not $NoPrompt) {
  Add-Type -AssemblyName System.Windows.Forms
  $targetText = @($inspection.Json.targets) -join ', '
  $previewText = if ($inspection.Json.preview.available) { '已提供' } else { '未提供' }
  $warningText = @($inspection.Json.warnings | ForEach-Object { "$($_.message)" }) -join "`r`n"
  $summary = "名称：$($inspection.Json.runtimeTheme.name)`r`n包 ID：$($inspection.Json.packageId)`r`n版本：$($inspection.Json.packageVersion)`r`n作者：$($inspection.Json.author.name)`r`n目标：$targetText`r`n预览图：$previewText"
  if ($warningText) { $summary += "`r`n`r`n兼容性提示：`r`n$warningText" }
  $summary += "`r`n`r`n选择是：安装并应用；选择否：仅安装。"
  $choice = [System.Windows.Forms.MessageBox]::Show(
    $summary,
    '导入 Codex Dream Skin',
    [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )
  if ($choice -eq [System.Windows.Forms.DialogResult]::Cancel) { return }
  $applyAfterInstall = $choice -eq [System.Windows.Forms.DialogResult]::Yes
}

$fullStateRoot = [System.IO.Path]::GetFullPath($StateRoot)
Assert-DreamSkinNoReparseComponents -Path $fullStateRoot
$installed = $null
$applyStatus = 'not-requested'
$applyMessage = $null
$operationLock = Enter-DreamSkinOperationLock
try {
  $installArguments = @(
    '--install', '--state-root', $fullStateRoot,
    '--expected-content-hash', $expectedContentHash
  )
  if ($Replace) { $installArguments += '--replace' }
  $installed = Invoke-DreamSkinThemePackageImport -ModeArguments $installArguments
  if ($installed.ExitCode -ne 0 -and $installed.Json.code -eq 'CONFLICT_CONFIRMATION_REQUIRED' -and
    -not $Replace -and -not $NoPrompt) {
    $replaceChoice = [System.Windows.Forms.MessageBox]::Show(
      '同一包 ID 已安装其他版本。是否替换？',
      '替换 Codex Dream Skin 主题',
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($replaceChoice -ne [System.Windows.Forms.DialogResult]::Yes) { return }
    $installed = Invoke-DreamSkinThemePackageImport -ModeArguments @(
      '--install', '--state-root', $fullStateRoot, '--replace',
      '--expected-content-hash', $expectedContentHash
    )
  }
  if ($installed.ExitCode -ne 0) {
    Show-DreamSkinImportError -Result $installed
    exit 1
  }

  if ($applyAfterInstall) {
    try {
      $themeDirectory = Join-Path (Join-Path $fullStateRoot 'themes') "$($installed.Json.packageId)"
      $null = Use-DreamSkinSavedTheme -ThemeDirectory $themeDirectory -StateRoot $fullStateRoot
      $applyStatus = 'selected-awaiting-runtime'
    } catch {
      $applyStatus = 'failed-after-install'
      $applyMessage = 'The theme was installed, but it could not be selected for application.'
    }
  }
} finally {
  Exit-DreamSkinOperationLock -Mutex $operationLock
}

if ($applyAfterInstall -and $applyStatus -ne 'failed-after-install') {
  $defaultStateRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))
  if (Test-DreamSkinPathEqual -Left $fullStateRoot -Right $defaultStateRoot) {
    try {
      $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
      $startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
      $verifyScript = Join-Path $PSScriptRoot 'verify-dream-skin.ps1'
      $startArguments = @(
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $startScript,
        '-Port', "$Port", '-ExpectedThemeId', "$($installed.Json.packageId)",
        '-ExpectedThemeContentHash', $expectedContentHash
      )
      if (-not $NoPrompt) { $startArguments += '-PromptRestart' }
      $startResult = Invoke-DreamSkinNative -FilePath $powershell -ArgumentList $startArguments
      $verifyResult = if ($startResult.ExitCode -eq 0) {
        Invoke-DreamSkinNative -FilePath $powershell -ArgumentList @(
          '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $verifyScript,
          '-Port', "$Port", '-ExpectedThemeId', "$($installed.Json.packageId)",
          '-ExpectedThemeContentHash', $expectedContentHash
        )
      } else {
        [pscustomobject]@{ ExitCode = $startResult.ExitCode; Output = $startResult.Output }
      }
      if ($verifyResult.ExitCode -eq 0) {
        $applyStatus = 'applied'
      } else {
        $applyStatus = 'failed-after-install'
        $applyMessage = 'The theme was installed, but the selected theme could not be started and verified.'
      }
    } catch {
      $applyStatus = 'failed-after-install'
      $applyMessage = 'The theme was installed, but the selected theme could not be started and verified.'
    }
  }
}

$installed.Json = Add-DreamSkinImportApplyResult -Report $installed.Json `
  -Status $applyStatus -Message $applyMessage
$finalReport = $installed.Json | ConvertTo-Json -Depth 12

if ($applyStatus -eq 'failed-after-install') {
  if (-not $NoPrompt) {
    [void][System.Windows.Forms.MessageBox]::Show(
      '主题已安装，但未能完成选择或 Codex 实时应用验证。可稍后从托盘重新应用。',
      'Codex Dream Skin',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )
  }
  Write-Output $finalReport
  exit 1
}
if (-not $NoPrompt) {
  $message = if ($applyStatus -eq 'applied') { '主题已安装并通过实时应用验证。' } else { '主题已安装，可稍后从已保存主题应用。' }
  [void][System.Windows.Forms.MessageBox]::Show(
    $message,
    'Codex Dream Skin',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  )
}
Write-Output $finalReport
