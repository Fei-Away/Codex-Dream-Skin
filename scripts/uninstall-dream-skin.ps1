<#
.SYNOPSIS
    Codex Dream Skin - 一键卸载脚本（优化版）
.DESCRIPTION
    自动完成皮肤恢复、关闭 CDP 会话、删除快捷方式、清理文件。
    专注于提供更流畅的卸载体验。
.PARAMETER KeepConfigBackup
    保留配置备份文件
.PARAMETER KeepThemes
    保留已保存的主题和图片
.EXAMPLE
    .\uninstall-dream-skin.ps1
    标准卸载
.EXAMPLE
    .\uninstall-dream-skin.ps1 -KeepThemes
    卸载但保留主题和图片
#>

[CmdletBinding()]
param(
  [switch]$KeepConfigBackup,
  [switch]$KeepThemes
)

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = "Codex Dream Skin - 卸载中..."

# ============================================================
# 辅助函数
# ============================================================
function Write-Step {
  param([string]$Message, [string]$Status = "运行中")
  $icon = switch ($Status) {
    "成功" { "✅" }
    "失败" { "❌" }
    "跳过" { "⏭️" }
    default { "🔄" }
  }
  Write-Host "  $icon $Message"
}

function Write-Header {
  param([string]$Title)
  Write-Host ""
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
  Write-Host "  $Title" -ForegroundColor Yellow
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
  Write-Host ""
}

# ============================================================
# 入口
# ============================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║     Codex Dream Skin - 一键卸载              ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$engineDir = Join-Path $StateRoot 'engine'

# 1. 确认卸载
Write-Header "步骤 1/3：确认卸载"

$shell = New-Object -ComObject WScript.Shell
$confirm = $shell.Popup("确定要卸载 Codex Dream Skin 吗？`n`n这将会：`n- 恢复官方 Codex 外观`n- 关闭 CDP 调试会话`n- 删除桌面快捷方式`n- 清理状态文件`n- 保留下载的主题和图片", 0, "Codex Dream Skin - 卸载确认", 52) -eq 6

if (-not $confirm) {
  Write-Step "用户取消卸载" "跳过"
  exit 0
}

Write-Step "用户确认卸载" "成功"

# 2. 执行恢复
Write-Header "步骤 2/3：执行恢复"

$restoreScript = Join-Path $engineDir 'scripts\restore-dream-skin.ps1'
if (Test-Path $restoreScript) {
  Write-Step "运行恢复脚本..." "运行中"
  try {
    $restoreArgs = @(
      '-NoProfile', '-ExecutionPolicy', 'RemoteSigned',
      '-File', $restoreScript,
      '-RestoreBaseTheme',
      '-PromptRestart',
      '-Uninstall'
    )
    & 'powershell.exe' $restoreArgs
    $restoreExitCode = $LASTEXITCODE
    if ($restoreExitCode -ne 0 -and $null -ne $restoreExitCode) {
      Write-Step "恢复脚本返回非零退出码: $restoreExitCode" "跳过"
      Write-Host "   将继续手动清理..." -ForegroundColor Yellow
    } else {
      Write-Step "恢复完成" "成功"
    }
  } catch {
    Write-Step "恢复脚本执行失败: $_" "跳过"
    Write-Host "   将继续手动清理..." -ForegroundColor Yellow
  }
} else {
  Write-Step "恢复脚本未找到，将执行手动清理" "跳过"
}

# 3. 手动清理
Write-Header "步骤 3/3：清理残留文件"

# 3.1 关闭 Codex
$codexProcesses = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue
if ($codexProcesses) {
  Write-Step "关闭 Codex 进程..." "运行中"
  $codexProcesses | ForEach-Object {
    try { $_.CloseMainWindow() } catch {}
  }
  Start-Sleep -Seconds 2
  Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Write-Step "Codex 已关闭" "成功"
} else {
  Write-Step "Codex 未运行" "成功"
}

# 3.2 关闭注入器（通过 CIM 查询命令行为 PowerShell 5.1 兼容）
$nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
$injectorFound = $false
foreach ($proc in $nodeProcesses) {
  try {
    $cmdLine = "$($proc.CommandLine)"
    if ($cmdLine -match 'injector\.mjs') {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
      $injectorFound = $true
    }
  } catch {}
}
if ($injectorFound) {
  Write-Step "注入器已关闭" "成功"
} else {
  Write-Step "注入器未运行" "成功"
}

# 3.3 删除快捷方式
Write-Step "删除快捷方式..." "运行中"
$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$shortcuts = @(
  (Join-Path $desktop 'Codex Dream Skin.lnk'),
  (Join-Path $desktop 'Codex Dream Skin - Restore.lnk'),
  (Join-Path $desktop 'Codex Dream Skin - Tray.lnk'),
  (Join-Path $startMenu 'Codex Dream Skin.lnk'),
  (Join-Path $startMenu 'Codex Dream Skin - Tray.lnk')
)
$removedCount = 0
foreach ($sc in $shortcuts) {
  if (Test-Path $sc) {
    Remove-Item -Path $sc -Force -ErrorAction SilentlyContinue
    $removedCount++
  }
}
Write-Step "已删除 $removedCount 个快捷方式" "成功"

# 3.4 清理状态目录
Write-Step "清理状态文件..." "运行中"
$excludeDirs = @()
if ($KeepThemes) {
  # 保留 themes 和 images 目录
  if (Test-Path (Join-Path $StateRoot 'themes')) { $excludeDirs += 'themes' }
  if (Test-Path (Join-Path $StateRoot 'images')) { $excludeDirs += 'images' }
}

# 删除 engine 目录
if (Test-Path $engineDir) {
  Remove-Item -Path $engineDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Step "引擎文件已删除" "成功"
} else {
  Write-Step "引擎文件不存在" "跳过"
}

# 删除状态文件（不删除主题）
$stateFiles = @(
  'state.json', 'state.stale-*.json',
  'paused',
  'config.before-dream-skin.toml',
  'config.restored-*.toml',
  'injector.log', 'injector-error.log', 'verify.log',
  'engine'
)
if (-not $KeepConfigBackup) {
  # config.before-dream-skin.toml 会在上面被删除
}

# 清理状态文件，但保留主题和图片
if (Test-Path $StateRoot) {
  Get-ChildItem -Path $StateRoot -ErrorAction SilentlyContinue | ForEach-Object {
    $name = $_.Name
    $fullPath = $_.FullName
    $skip = $false
    if ($KeepThemes -and ($name -eq 'themes' -or $name -eq 'images')) {
      $skip = $true
    }
    if ($name -eq 'engine') { $skip = $true } # 已删除
    if (-not $skip -and $_.PSIsContainer) {
      Remove-Item -Path $fullPath -Recurse -Force -ErrorAction SilentlyContinue
    } elseif (-not $skip) {
      Remove-Item -Path $fullPath -Force -ErrorAction SilentlyContinue
    }
  }
  
  # 如果状态目录为空，删除它
  $remaining = Get-ChildItem -Path $StateRoot -ErrorAction SilentlyContinue
  if ($null -eq $remaining -or $remaining.Count -eq 0) {
    Remove-Item -Path $StateRoot -Force -ErrorAction SilentlyContinue
    Write-Step "状态目录已删除" "成功"
  } else {
    Write-Step "状态目录中保留 $($remaining.Count) 项" "成功"
  }
}

# ============================================================
# 完成
# ============================================================
Write-Header "卸载完成！"

Write-Host "  Codex Dream Skin 已成功卸载。" -ForegroundColor Green
Write-Host ""
if ($KeepThemes) {
  Write-Host "  已保留主题和图片：" -ForegroundColor Yellow
  Write-Host "    $StateRoot\themes" -ForegroundColor Gray
  Write-Host "    $StateRoot\images" -ForegroundColor Gray
  Write-Host ""
  Write-Host "  如需完全删除，运行：" -ForegroundColor Yellow
  Write-Host "    Remove-Item -Path '$StateRoot' -Recurse -Force" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  现在已经恢复官方 Codex 界面。" -ForegroundColor Green
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║  卸载完成！                                  ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Yellow
