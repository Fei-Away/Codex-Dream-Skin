[CmdletBinding()]
param(
  [string]$File,
  [switch]$DryRun,
  [switch]$Replace,
  [switch]$Apply,
  [switch]$NoPrompt,
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
  $previousPlatformRoot = [Environment]::GetEnvironmentVariable('DREAM_SKIN_PLATFORM_ROOT', 'Process')
  try {
    [Environment]::SetEnvironmentVariable('DREAM_SKIN_PLATFORM_ROOT', $SkillRoot, 'Process')
    $native = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList $arguments
  } finally {
    [Environment]::SetEnvironmentVariable('DREAM_SKIN_PLATFORM_ROOT', $previousPlatformRoot, 'Process')
  }
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
if (-not $NoPrompt) {
  Add-Type -AssemblyName System.Windows.Forms
  $summary = "名称：$($inspection.Json.runtimeTheme.name)`r`n包 ID：$($inspection.Json.packageId)`r`n版本：$($inspection.Json.packageVersion)`r`n`r`n选择是：安装并应用；选择否：仅安装。"
  $choice = [System.Windows.Forms.MessageBox]::Show(
    $summary,
    '导入 Codex Dream Skin',
    [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
    [System.Windows.Forms.MessageBoxIcon]::Question
  )
  if ($choice -eq [System.Windows.Forms.DialogResult]::Cancel) { return }
  $applyAfterInstall = $choice -eq [System.Windows.Forms.DialogResult]::Yes
}

$installArguments = @('--install', '--state-root', [System.IO.Path]::GetFullPath($StateRoot))
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
    '--install', '--state-root', [System.IO.Path]::GetFullPath($StateRoot), '--replace'
  )
}
if ($installed.ExitCode -ne 0) {
  Show-DreamSkinImportError -Result $installed
  exit 1
}

if ($applyAfterInstall) {
  $themeDirectory = Join-Path (Join-Path ([System.IO.Path]::GetFullPath($StateRoot)) 'themes') "$($installed.Json.packageId)"
  $null = Use-DreamSkinSavedTheme -ThemeDirectory $themeDirectory -StateRoot $StateRoot
  Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
}
if (-not $NoPrompt) {
  $message = if ($applyAfterInstall) { '主题已安装并应用。' } else { '主题已安装，可稍后从“已保存主题”应用。' }
  [void][System.Windows.Forms.MessageBox]::Show(
    $message,
    'Codex Dream Skin',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  )
}
Write-Output $installed.Text
