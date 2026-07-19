<#
.SYNOPSIS
    Codex Dream Skin - PowerShell Profile 辅助函数
.DESCRIPTION
    提供便捷的 PowerShell 命令管理 Codex Dream Skin。
    将此脚本添加到你的 PowerShell Profile 中以获得更友好的使用体验。
.USAGE
    # 添加到 PowerShell Profile
    echo ". '$(Join-Path $PSScriptRoot 'dream-skin-profile.ps1')'" >> $PROFILE
    
    # 或直接运行
    . .\dream-skin-profile.ps1
#>

# ============================================================
# 配置
# ============================================================
$script:StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$script:EngineDir = Join-Path $script:StateRoot 'engine'
$script:ScriptsDir = Join-Path $script:EngineDir 'scripts'

# ============================================================
# 辅助函数
# ============================================================
function Get-DreamSkinEngineScript {
  param([string]$Name)
  $path = Join-Path $script:ScriptsDir "$Name.ps1"
  if (-not (Test-Path $path)) {
    # 尝试仓库路径
    $repoPath = Join-Path $env:USERPROFILE 'Codex-Dream-Skin\windows\scripts'
    $path = Join-Path $repoPath "$Name.ps1"
    if (-not (Test-Path $path)) {
      throw "找不到 Dream Skin 脚本: $Name.ps1`n请先运行 setup-dream-skin.ps1 安装"
    }
  }
  return $path
}

function Invoke-DreamSkinEngineScript {
  param(
    [string]$Name,
    [string[]]$Arguments = @()
  )
  $scriptPath = Get-DreamSkinEngineScript -Name $Name
  $powershellArgs = @(
    '-NoProfile', '-ExecutionPolicy', 'RemoteSigned',
    '-File', $scriptPath
  ) + $Arguments
  & 'powershell.exe' $powershellArgs
}

# ============================================================
# 公开命令
# ============================================================

<#
.SYNOPSIS
    启动 Codex Dream Skin
.DESCRIPTION
    启动 Codex 并应用皮肤
.PARAMETER Port
    CDP 调试端口，默认 9335
.PARAMETER Force
    不询问直接重启 Codex
.EXAMPLE
    Start-DreamSkin
    标准启动
.EXAMPLE
    Start-DreamSkin -Port 9444 -Force
    自定义端口，强制重启
#>
function Start-DreamSkin {
  [CmdletBinding()]
  param(
    [int]$Port = 9335,
    [switch]$Force
  )
  
  $arguments = @()
  if ($Port -ne 9335) { $arguments += '-Port'; $arguments += "$Port" }
  if ($Force) { $arguments += '-RestartExisting' }
  else { $arguments += '-PromptRestart' }
  
  Write-Host "🚀 启动 Codex Dream Skin..." -ForegroundColor Magenta
  Invoke-DreamSkinEngineScript -Name 'start-dream-skin' -Arguments $arguments
}

<#
.SYNOPSIS
    恢复 Codex 官方界面
.DESCRIPTION
    恢复官方外观并关闭 CDP 会话
.PARAMETER Uninstall
    同时删除快捷方式
.PARAMETER Force
    不询问直接恢复
.EXAMPLE
    Restore-DreamSkin
    标准恢复
.EXAMPLE
    Restore-DreamSkin -Uninstall -Force
    完全卸载
#>
function Restore-DreamSkin {
  [CmdletBinding()]
  param(
    [switch]$Uninstall,
    [switch]$Force
  )
  
  $arguments = @('-RestoreBaseTheme')
  if ($Uninstall) { $arguments += '-Uninstall' }
  if ($Force) { $arguments += '-PromptRestart' }
  
  Write-Host "🔄 恢复 Codex 官方界面..." -ForegroundColor Yellow
  Invoke-DreamSkinEngineScript -Name 'restore-dream-skin' -Arguments $arguments
}

<#
.SYNOPSIS
    验证 Codex Dream Skin 注入状态
.DESCRIPTION
    检查皮肤是否已正确注入
.EXAMPLE
    Test-DreamSkin
    标准验证
#>
function Test-DreamSkin {
  $screenshotPath = Join-Path $env:TEMP "codex-dream-skin-$(Get-Date -Format 'yyyyMMdd-HHmmss').png"
  $arguments = @('-ScreenshotPath', "`"$screenshotPath`"")
  
  Write-Host "🔍 验证 Codex Dream Skin 注入状态..." -ForegroundColor Cyan
  Invoke-DreamSkinEngineScript -Name 'verify-dream-skin' -Arguments $arguments
}

<#
.SYNOPSIS
    显示 Codex Dream Skin 状态信息
.DESCRIPTION
    显示当前状态、日志和配置信息
.EXAMPLE
    Get-DreamSkinStatus
    显示状态信息
#>
function Get-DreamSkinStatus {
  [CmdletBinding()]
  param()
  
  Write-Host ""
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
  Write-Host "  Codex Dream Skin 状态" -ForegroundColor Cyan
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
  Write-Host ""
  
  # 检查引擎是否安装
  if (Test-Path $script:EngineDir) {
    Write-Host "  ✅ 引擎已安装" -ForegroundColor Green
  } else {
    Write-Host "  ❌ 引擎未安装" -ForegroundColor Red
    return
  }
  
  # 检查状态文件
  $statePath = Join-Path $script:StateRoot 'state.json'
  if (Test-Path $statePath) {
    try {
      $state = Get-Content $statePath -Raw | ConvertFrom-Json
      Write-Host "  📋 状态文件存在 (Schema v$($state.schemaVersion))" -ForegroundColor Green
      Write-Host "     端口: $($state.port)" -ForegroundColor Gray
      Write-Host "     Codex: $($state.codexVersion)" -ForegroundColor Gray
      Write-Host "     BrowserId: $($state.browserId)" -ForegroundColor Gray
      
      # 检查注入器进程
      $injectorPid = $state.injectorPid
      $injectorRunning = Get-Process -Id $injectorPid -ErrorAction SilentlyContinue
      if ($injectorRunning) {
        Write-Host "  ✅ 注入器运行中 (PID: $injectorPid)" -ForegroundColor Green
      } else {
        Write-Host "  ⚠️ 注入器未运行" -ForegroundColor Yellow
      }
    } catch {
      Write-Host "  ⚠️ 状态文件损坏: $_" -ForegroundColor Yellow
    }
  } else {
    Write-Host "  ⚠️ 状态文件不存在（皮肤未启动）" -ForegroundColor Yellow
  }
  
  # 检查暂停状态
  $pausePath = Join-Path $script:StateRoot 'paused'
  if (Test-Path $pausePath) {
    Write-Host "  ⏸️  皮肤已暂停" -ForegroundColor Yellow
  }
  
  # 检查托盘
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $trayMutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Tray")
  $trayActive = $false
  try { $trayActive = -not $trayMutex.WaitOne(0) } catch {}
  $trayMutex.Dispose()
  if ($trayActive) {
    Write-Host "  ✅ 托盘运行中" -ForegroundColor Green
  } else {
    Write-Host "  ⚠️ 托盘未运行" -ForegroundColor Yellow
  }
  
  # 检查日志
  $logPath = Join-Path $script:StateRoot 'injector.log'
  if (Test-Path $logPath) {
    $lines = (Get-Content $logPath | Measure-Object).Count
    Write-Host "  📝 日志行数: $lines" -ForegroundColor Gray
  }
  
  Write-Host ""
}

<#
.SYNOPSIS
    打开 Codex Dream Skin 日志文件
.DESCRIPTION
    在记事本中打开日志文件
.PARAMETER Type
    日志类型: injector, error, verify, state
.EXAMPLE
    Open-DreamSkinLog -Type injector
    打开注入器日志
#>
function Open-DreamSkinLog {
  param(
    [ValidateSet('injector', 'error', 'verify', 'state')]
    [string]$Type = 'injector'
  )
  
  $logPath = switch ($Type) {
    'injector' { Join-Path $script:StateRoot 'injector.log' }
    'error' { Join-Path $script:StateRoot 'injector-error.log' }
    'verify' { Join-Path $script:StateRoot 'verify.log' }
    'state' { Join-Path $script:StateRoot 'state.json' }
  }
  
  if (Test-Path $logPath) {
    notepad $logPath
  } else {
    Write-Warning "日志文件不存在: $logPath"
  }
}

<#
.SYNOPSIS
    备份 Codex Dream Skin 主题和配置
.DESCRIPTION
    备份当前主题、已保存主题和导入图片
.EXAMPLE
    Backup-DreamSkin
    备份到桌面
#>
function Backup-DreamSkin {
  $timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
  $backupDir = Join-Path $env:USERPROFILE "Desktop\CodexDreamSkin-Backup-$timestamp"
  
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  
  $dirs = @('themes', 'images', 'active-theme')
  foreach ($dir in $dirs) {
    $src = Join-Path $script:StateRoot $dir
    if (Test-Path $src) {
      Copy-Item -Path $src -Destination $backupDir -Recurse -Force
    }
  }
  
  # 备份配置
  $configBackup = Join-Path $script:StateRoot 'config.before-dream-skin.toml'
  if (Test-Path $configBackup) {
    Copy-Item -Path $configBackup -Destination $backupDir -Force
  }
  
  Write-Host "✅ 备份完成: $backupDir" -ForegroundColor Green
}

# ============================================================
# 导出命令
# ============================================================
Export-ModuleMember -Function Start-DreamSkin, Restore-DreamSkin, Test-DreamSkin, Get-DreamSkinStatus, Open-DreamSkinLog, Backup-DreamSkin

# ============================================================
# 帮助信息
# ============================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║  Codex Dream Skin 命令已加载                 ║" -ForegroundColor Magenta
Write-Host "╠══════════════════════════════════════════════╣" -ForegroundColor Magenta
Write-Host "║  Start-DreamSkin     启动皮肤               ║" -ForegroundColor White
Write-Host "║  Restore-DreamSkin   恢复官方界面           ║" -ForegroundColor White
Write-Host "║  Test-DreamSkin      验证注入状态           ║" -ForegroundColor White
Write-Host "║  Get-DreamSkinStatus 显示状态信息           ║" -ForegroundColor White
Write-Host "║  Open-DreamSkinLog   打开日志文件           ║" -ForegroundColor White
Write-Host "║  Backup-DreamSkin    备份主题和配置          ║" -ForegroundColor White
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""
