[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

if (-not ('DreamSkin.NativeMethods' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace DreamSkin {
  public static class NativeMethods {
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr handle);
  }
}
'@
}

function New-DreamSkinTrayIcon {
  $bitmap = [System.Drawing.Bitmap]::new(
    32,
    32,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $backgroundBrush = $null
  $ringPen = $null
  $dropPath = $null
  $dropBrush = $null
  $sparklePen = $null
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $backgroundBrush = [System.Drawing.SolidBrush]::new(
      [System.Drawing.Color]::FromArgb(255, 13, 46, 82)
    )
    $graphics.FillEllipse($backgroundBrush, 1, 1, 30, 30)
    $ringPen = [System.Drawing.Pen]::new(
      [System.Drawing.Color]::FromArgb(255, 126, 226, 255),
      1.8
    )
    $graphics.DrawEllipse($ringPen, 2, 2, 28, 28)

    $dropPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $dropPath.StartFigure()
    $dropPath.AddBezier(16, 4, 14, 8, 8, 13, 8, 18)
    $dropPath.AddBezier(8, 18, 8, 24, 11.5, 28, 16, 28)
    $dropPath.AddBezier(16, 28, 20.5, 28, 24, 24, 24, 18)
    $dropPath.AddBezier(24, 18, 24, 13, 18, 8, 16, 4)
    $dropPath.CloseFigure()
    $dropBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      [System.Drawing.RectangleF]::new(8, 4, 16, 24),
      [System.Drawing.Color]::FromArgb(255, 145, 234, 255),
      [System.Drawing.Color]::FromArgb(255, 39, 148, 244),
      90
    )
    $graphics.FillPath($dropBrush, $dropPath)

    $sparklePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 1.8)
    $graphics.DrawLine($sparklePen, 18.5, 9, 18.5, 13)
    $graphics.DrawLine($sparklePen, 16.5, 11, 20.5, 11)

    $handle = $bitmap.GetHicon()
    try {
      $borrowedIcon = [System.Drawing.Icon]::FromHandle($handle)
      try {
        return [System.Drawing.Icon]$borrowedIcon.Clone()
      } finally {
        $borrowedIcon.Dispose()
      }
    } finally {
      if ($handle -ne [IntPtr]::Zero) {
        [void][DreamSkin.NativeMethods]::DestroyIcon($handle)
      }
    }
  } finally {
    if ($null -ne $sparklePen) { $sparklePen.Dispose() }
    if ($null -ne $dropBrush) { $dropBrush.Dispose() }
    if ($null -ne $dropPath) { $dropPath.Dispose() }
    if ($null -ne $ringPen) { $ringPen.Dispose() }
    if ($null -ne $backgroundBrush) { $backgroundBrush.Dispose() }
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Show-DreamSkinTrayError {
  param([string]$Message)
  [void][System.Windows.Forms.MessageBox]::Show(
    $Message,
    'Codex Dream Skin',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  )
}

function Start-DreamSkinPowerShell {
  param([Parameter(Mandatory = $true)][string]$Script, [string[]]$Arguments = @())
  $scriptToken = ConvertTo-DreamSkinProcessArgument -Value $Script
  $argumentLine = '-NoProfile -ExecutionPolicy RemoteSigned -File ' + $scriptToken
  if ($Arguments.Count -gt 0) { $argumentLine += ' ' + ($Arguments -join ' ') }
  Start-Process -FilePath $powershell -ArgumentList $argumentLine -WindowStyle Hidden | Out-Null
}

function Add-DreamSkinTrayItem {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [System.Windows.Forms.ToolStripItemCollection]$Items,
    [Parameter(Mandatory = $true)][string]$Text,
    [AllowNull()][scriptblock]$Action,
    [bool]$Enabled = $true
  )
  $item = [System.Windows.Forms.ToolStripMenuItem]::new($Text)
  $item.Enabled = $Enabled
  if ($null -ne $Action) {
    $item.add_Click({
      try { & $Action } catch { Show-DreamSkinTrayError -Message $_.Exception.Message }
    }.GetNewClosure())
  }
  [void]$Items.Add($item)
  return $item
}

if ($SelfTest) {
  $testMenu = [System.Windows.Forms.ContextMenuStrip]::new()
  $testIcon = $null
  $testBitmap = $null
  try {
    $null = Add-DreamSkinTrayItem -Items $testMenu.Items -Text 'Self test' -Action $null
    if ($testMenu.Items.Count -ne 1) {
      throw 'The tray menu could not add its first item to an empty collection.'
    }
    $testIcon = New-DreamSkinTrayIcon
    if ($null -eq $testIcon -or $testIcon.Width -ne 32 -or $testIcon.Height -ne 32) {
      throw 'The Dream Skin tray icon was not created at 32 x 32.'
    }
    $testBitmap = $testIcon.ToBitmap()
    $bluePixels = 0
    for ($x = 0; $x -lt $testBitmap.Width; $x++) {
      for ($y = 0; $y -lt $testBitmap.Height; $y++) {
        $pixel = $testBitmap.GetPixel($x, $y)
        if ($pixel.A -gt 0 -and $pixel.B -gt $pixel.R) { $bluePixels++ }
      }
    }
    if ($bluePixels -lt 128) { throw 'The Dream Skin tray icon did not render its Hydro-blue mark.' }
    Write-Host 'PASS: tray icon and empty context-menu collection.'
  } finally {
    if ($null -ne $testBitmap) { $testBitmap.Dispose() }
    if ($null -ne $testIcon) { $testIcon.Dispose() }
    $testMenu.Dispose()
  }
  exit 0
}

Assert-DreamSkinPort -Port $Port
$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$paths = Initialize-DreamSkinThemeStore -SkillRoot $SkillRoot -StateRoot $StateRoot
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
$restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Tray")
$acquired = $false
try {
  try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { exit 0 }

  $notify = [System.Windows.Forms.NotifyIcon]::new()
  $trayIcon = New-DreamSkinTrayIcon
  $notify.Icon = $trayIcon
  $notify.Text = 'Codex Dream Skin'
  $notify.Visible = $true
  $menu = [System.Windows.Forms.ContextMenuStrip]::new()
  $notify.ContextMenuStrip = $menu

  function Rebuild-DreamSkinTrayMenu {
    $menu.Items.Clear()
    $paused = Test-DreamSkinPaused -StateRoot $StateRoot
    $state = $null
    try { $state = Read-DreamSkinState -Path $paths.State } catch {}
    $active = $null
    try { $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata } catch {}
    $status = if ($paused) { '状态：已暂停' } elseif ($state) { '状态：运行中' } else { '状态：未运行' }
    if ($null -ne $active -and $null -ne $active.Theme -and $active.Theme.name) {
      $status += " · $($active.Theme.name)"
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text $status -Action $null -Enabled $false
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '应用或重新应用' -Action {
      Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
      Start-DreamSkinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
    }
    $pauseText = if ($paused) { '继续显示皮肤' } else { '暂停皮肤' }
    $nextPaused = -not $paused
    $pauseAction = {
      Set-DreamSkinPaused -Paused $nextPaused -StateRoot $StateRoot | Out-Null
    }.GetNewClosure()
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text $pauseText -Action $pauseAction
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '更换背景图' -Action {
      $dialog = [System.Windows.Forms.OpenFileDialog]::new()
      $dialog.Title = '选择 Codex Dream Skin 背景图'
      $dialog.Filter = 'Image files|*.png;*.jpg;*.jpeg;*.webp|All files|*.*'
      $dialog.Multiselect = $false
      try {
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          $null = Set-DreamSkinActiveTheme -ImagePath $dialog.FileName -Theme $null -StateRoot $StateRoot
          Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
          $notify.ShowBalloonTip(1800, 'Codex Dream Skin', '背景图已更新。', [System.Windows.Forms.ToolTipIcon]::Info)
        }
      } finally {
        $dialog.Dispose()
      }
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '保存当前主题' -Action {
      $name = [Microsoft.VisualBasic.Interaction]::InputBox('输入主题名称：', '保存 Codex Dream Skin 主题', '')
      if ($name.Trim()) {
        $saved = Save-DreamSkinCurrentTheme -Name $name -StateRoot $StateRoot
        $notify.ShowBalloonTip(1800, 'Codex Dream Skin', "已保存：$($saved.Theme.name)", [System.Windows.Forms.ToolTipIcon]::Info)
      }
    }

    $savedMenu = [System.Windows.Forms.ToolStripMenuItem]::new('已保存主题')
    $savedThemes = @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata)
    if ($savedThemes.Count -eq 0) {
      $empty = [System.Windows.Forms.ToolStripMenuItem]::new('暂无已保存主题')
      $empty.Enabled = $false
      [void]$savedMenu.DropDownItems.Add($empty)
    } else {
      foreach ($saved in $savedThemes) {
        $savedPath = $saved.Path
        $savedName = $saved.Name
        $savedAction = {
          $null = Use-DreamSkinSavedTheme -ThemeDirectory $savedPath -StateRoot $StateRoot
          Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
          $notify.ShowBalloonTip(1800, 'Codex Dream Skin', "已应用：$savedName", [System.Windows.Forms.ToolTipIcon]::Info)
        }.GetNewClosure()
        $null = Add-DreamSkinTrayItem -Items $savedMenu.DropDownItems -Text $savedName -Action $savedAction
      }
    }
    [void]$menu.Items.Add($savedMenu)

    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '打开图片文件夹' -Action {
      Start-Process -FilePath explorer.exe -ArgumentList @($paths.Images) | Out-Null
    }
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '停止 Dream Skin' -Action {
      Start-DreamSkinPowerShell -Script $restoreScript -Arguments @(
        '-Port', "$Port", '-PromptRestart'
      )
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '完全恢复 Codex' -Action {
      Start-DreamSkinPowerShell -Script $restoreScript -Arguments @(
        '-Port', "$Port", '-RestoreBaseTheme', '-PromptRestart'
      )
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '退出托盘' -Action {
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
  }

  $menu.add_Opening({ Rebuild-DreamSkinTrayMenu })
  $notify.add_DoubleClick({
    try {
      Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
      Start-DreamSkinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
    } catch {
      Show-DreamSkinTrayError -Message $_.Exception.Message
    }
  })
  [System.Windows.Forms.Application]::Run()
} finally {
  if ($null -ne $notify) {
    $notify.Visible = $false
    $notify.Dispose()
  }
  if ($null -ne $trayIcon) { $trayIcon.Dispose() }
  if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
  $mutex.Dispose()
}
