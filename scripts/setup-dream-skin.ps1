<#
.SYNOPSIS
    Codex Dream Skin - 一键安装脚本（优化版）
.DESCRIPTION
    自动完成环境检查、依赖验证、安装、创建快捷方式、启动托盘。
    专注于提供更流畅的安装体验。
.PARAMETER Port
    CDP 调试端口，默认 9335
.PARAMETER NoShortcuts
    不创建桌面快捷方式
.PARAMETER NoTray
    安装后不启动托盘
.EXAMPLE
    .\setup-dream-skin.ps1
    标准安装
.EXAMPLE
    .\setup-dream-skin.ps1 -Port 9444 -NoTray
    自定义端口，不启动托盘
#>

[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$NoShortcuts,
  [switch]$NoTray
)

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = "Codex Dream Skin - 安装中..."

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
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
  Write-Host "  $Title" -ForegroundColor Cyan
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
  Write-Host ""
}

# ============================================================
# 入口
# ============================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║       Codex Dream Skin - 一键安装            ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# 1. 环境检查
Write-Header "步骤 1/5：环境检查"

$envOk = $true

# 1.1 Node.js
try {
  $nodeVersion = node --version
  $versionMatch = [regex]::Match($nodeVersion, 'v(\d+)')
  if ($versionMatch.Success -and [int]$versionMatch.Groups[1].Value -ge 22) {
    Write-Step "Node.js $nodeVersion" "成功"
  } else {
    Write-Step "Node.js 版本需要 22+，当前 $nodeVersion" "失败"
    $envOk = $false
  }
} catch {
  Write-Step "Node.js 未安装或不在 PATH 中" "失败"
  $envOk = $false
}

# 1.2 PowerShell 版本
if ($PSVersionTable.PSVersion.Major -ge 5) {
  Write-Step "PowerShell $($PSVersionTable.PSVersion)" "成功"
} else {
  Write-Step "PowerShell 版本需要 5.1+" "失败"
  $envOk = $false
}

# 1.3 Codex 包
try {
  $codex = Get-AppxPackage -Name OpenAI.Codex -ErrorAction Stop
  if ($codex.SignatureKind -eq 'Store') {
    Write-Step "Codex $($codex.Version) (Store 签名)" "成功"
  } else {
    Write-Step "Codex 签名不是 Store 类型 ($($codex.SignatureKind))" "失败"
    $envOk = $false
  }
} catch {
  Write-Step "Codex Store 包未安装" "失败"
  $envOk = $false
}

if (-not $envOk) {
  Write-Host ""
  Write-Host "❌ 环境检查未通过，请修复上述问题后重试。" -ForegroundColor Red
  Write-Host "   缺少 Node.js：https://nodejs.org/ 下载 22.x LTS" -ForegroundColor Yellow
  Write-Host "   缺少 Codex：Microsoft Store 搜索 OpenAI.Codex" -ForegroundColor Yellow
  exit 1
}

# 2. 端口检查
Write-Header "步骤 2/5：端口检查"

$portAvailable = $true
try {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) {
    Write-Step "端口 $Port 已被占用，将自动扫描可用端口" "跳过"
    $portAvailable = $false
    # 找到可用端口
    for ($candidate = $Port + 1; $candidate -le [Math]::Min(65535, $Port + 100); $candidate++) {
      $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $candidate -ErrorAction SilentlyContinue)
      if ($listeners.Count -eq 0) {
        Write-Step "使用端口 $candidate" "成功"
        $Port = $candidate
        $portAvailable = $true
        break
      }
    }
    if (-not $portAvailable) {
      Write-Step "未找到可用端口（$Port-$([Math]::Min(65535, $Port + 100))）" "失败"
      exit 1
    }
  } else {
    Write-Step "端口 $Port 可用" "成功"
  }
} catch {
  Write-Step "端口检查失败" "跳过"
}

# 3. 关闭 Codex 和托盘
Write-Header "步骤 3/5：关闭冲突进程"

# 关闭 Codex
$codexProcesses = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue
if ($codexProcesses) {
  Write-Step "发现 $($codexProcesses.Count) 个 Codex 进程，正在关闭..." "运行中"
  $codexProcesses | ForEach-Object {
    try { $_.CloseMainWindow() } catch {}
  }
  Start-Sleep -Seconds 3
  $remaining = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue
  if ($remaining) {
    Write-Step "强制关闭剩余 Codex 进程..." "运行中"
    $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }
  Write-Step "Codex 已关闭" "成功"
} else {
  Write-Step "Codex 未运行" "成功"
}

# 关闭托盘
$trayMutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value).Tray")
$trayActive = $false
try {
  $trayActive = -not $trayMutex.WaitOne(0)
} catch { $trayActive = $false }
$trayMutex.Dispose()

if ($trayActive) {
  Write-Step "发现托盘正在运行，请手动退出托盘后重试" "失败"
  Write-Host "   请右键托盘图标 → 退出托盘，然后重新运行此脚本" -ForegroundColor Yellow
  exit 1
} else {
  Write-Step "托盘未运行" "成功"
}

# 4. 安装
Write-Header "步骤 4/5：安装皮肤"

$windowsDir = Join-Path $PSScriptRoot '..\windows'
if (-not (Test-Path (Join-Path $windowsDir 'scripts\install-dream-skin.ps1'))) {
  # 检查是否在 windows 目录下
  $windowsDir = $PSScriptRoot
  if (-not (Test-Path (Join-Path $windowsDir 'scripts\install-dream-skin.ps1'))) {
    Write-Step "找不到安装脚本路径" "失败"
    exit 1
  }
}

$installArgs = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', (Join-Path $windowsDir 'scripts\install-dream-skin.ps1')
)
if ($Port -ne 9335) { $installArgs += '-Port'; $installArgs += "$Port" }
if ($NoShortcuts) { $installArgs += '-NoShortcuts' }

try {
  & 'powershell.exe' $installArgs
  if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    throw "安装脚本返回非零退出码: $LASTEXITCODE"
  }
  Write-Step "皮肤安装完成" "成功"
} catch {
  Write-Step "安装失败: $_" "失败"
  exit 1
}

# 5. 启动托盘
Write-Header "步骤 5/5：启动托盘"

if (-not $NoTray) {
  $trayScript = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\engine\scripts\tray-dream-skin.ps1'
  if (Test-Path $trayScript) {
    try {
      $trayArgs = @(
        '-NoProfile', '-ExecutionPolicy', 'RemoteSigned',
        '-File', $trayScript
      )
      Start-Process -FilePath 'powershell.exe' -ArgumentList $trayArgs -WindowStyle Hidden
      Write-Step "托盘已启动（后台运行）" "成功"
    } catch {
      Write-Step "托盘启动失败: $_" "跳过"
      Write-Host "   可手动启动：双击桌面 'Codex Dream Skin - Tray'" -ForegroundColor Yellow
    }
  } else {
    Write-Step "托盘脚本未找到" "跳过"
  }
} else {
  Write-Step "跳过托盘启动" "跳过"
}

# ============================================================
# 完成
# ============================================================
Write-Header "安装完成！"

Write-Host "  下次启动可以直接使用桌面快捷方式：" -ForegroundColor Green
Write-Host "    📌 Codex Dream Skin          - 启动 Codex 并应用皮肤" -ForegroundColor White
Write-Host "    📌 Codex Dream Skin - Tray   - 系统托盘控制" -ForegroundColor White
Write-Host "    📌 Codex Dream Skin - Restore - 恢复官方界面" -ForegroundColor White
Write-Host ""
Write-Host "  或使用命令行：" -ForegroundColor Green
Write-Host "    powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$env:LOCALAPPDATA\CodexDreamSkin\engine\scripts\start-dream-skin.ps1`" -PromptRestart" -ForegroundColor Gray
Write-Host ""
Write-Host "  验证注入状态：" -ForegroundColor Green
Write-Host "    powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$env:LOCALAPPDATA\CodexDreamSkin\engine\scripts\verify-dream-skin.ps1`" -ScreenshotPath `"`$env:TEMP\codex-dream-skin.png`"" -ForegroundColor Gray
Write-Host ""
Write-Host "  恢复官方界面：" -ForegroundColor Green
Write-Host "    powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$env:LOCALAPPDATA\CodexDreamSkin\engine\scripts\restore-dream-skin.ps1`" -RestoreBaseTheme -PromptRestart" -ForegroundColor Gray
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║  安装成功！正在使用端口 $Port  🎉              ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Magenta
