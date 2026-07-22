[CmdletBinding()]
param([int]$Port = 9335)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
if (-not ('DreamSkinConsoleNative' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DreamSkinConsoleNative {
  [DllImport("kernel32.dll")]
  public static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@
}
# The launcher is a WinForms app; hide the PowerShell console host while
# preserving its standard handles for runtime probes and child processes.
$consoleHandle = [DreamSkinConsoleNative]::GetConsoleWindow()
if ($consoleHandle -ne [IntPtr]::Zero) {
  [DreamSkinConsoleNative]::ShowWindow($consoleHandle, 0) | Out-Null
}
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)
if (-not ('DreamSkinDwmNative' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DreamSkinDwmNative {
  [DllImport("dwmapi.dll")]
  public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}
'@
}
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

Assert-DreamSkinPort -Port $Port
$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$paths = Initialize-DreamSkinThemeStore -SkillRoot $SkillRoot -StateRoot $StateRoot
$powershellCommand = Get-Command pwsh.exe -ErrorAction SilentlyContinue
if (-not $powershellCommand) { $powershellCommand = Get-Command powershell.exe -ErrorAction Stop }
$powershell = $powershellCommand.Source
$startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
$restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
$trayScript = Join-Path $PSScriptRoot 'tray-dream-skin.ps1'
$verifyScript = Join-Path $PSScriptRoot 'verify-dream-skin.ps1'

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Console")
$acquired = $false
try {
  try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { exit 0 }

  if (-not (Test-DreamSkinTrayActive)) {
    $trayArguments = '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' +
      (ConvertTo-DreamSkinProcessArgument -Value $trayScript) +
      ' -Port ' + (ConvertTo-DreamSkinProcessArgument -Value "$Port")
    $trayStartInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $trayStartInfo.FileName = $powershell
    $trayStartInfo.Arguments = $trayArguments
    $trayStartInfo.UseShellExecute = $false
    $trayStartInfo.CreateNoWindow = $true
    $trayStartInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $trayStartInfo.WorkingDirectory = Join-Path $StateRoot 'engine'
    [System.Diagnostics.Process]::Start($trayStartInfo) | Out-Null
  }

  $form = [System.Windows.Forms.Form]::new()
  $form.Text = 'Codex Dream Skin Console'
  $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
  $form.AutoScaleDimensions = [System.Drawing.SizeF]::new(96, 96)
  $form.StartPosition = 'CenterScreen'
  $form.ClientSize = [System.Drawing.Size]::new(980, 640)
  $form.MinimumSize = [System.Drawing.Size]::new(860, 560)
  $colorBackground = [System.Drawing.Color]::FromArgb(24, 24, 24)
  $colorSidebar = [System.Drawing.Color]::FromArgb(20, 20, 20)
  $colorPanel = [System.Drawing.Color]::FromArgb(43, 43, 43)
  $colorPanelBorder = [System.Drawing.Color]::FromArgb(62, 62, 62)
  $colorText = [System.Drawing.Color]::FromArgb(240, 240, 240)
  $colorMuted = [System.Drawing.Color]::FromArgb(168, 168, 168)
  $colorAccent = [System.Drawing.Color]::FromArgb(131, 195, 255)
  $colorAction = [System.Drawing.Color]::FromArgb(55, 78, 101)
  $colorActionHover = [System.Drawing.Color]::FromArgb(67, 94, 121)
  $form.BackColor = $colorBackground
  $form.ForeColor = $colorText
  try {
    $darkTitleBar = 1
    [DreamSkinDwmNative]::DwmSetWindowAttribute($form.Handle, 20, [ref]$darkTitleBar, 4) | Out-Null
  } catch {}
  $fontChinese = [System.Drawing.Font]::new('Microsoft YaHei UI', 12)
  $fontChineseBold = [System.Drawing.Font]::new('Microsoft YaHei UI', 13, [System.Drawing.FontStyle]::Bold)
  $fontEnglish = [System.Drawing.Font]::new('Consolas', 11)
  $fontEnglishBold = [System.Drawing.Font]::new('Consolas', 13, [System.Drawing.FontStyle]::Bold)
  $form.Font = $fontChinese
  $form.Add_Paint({
    param($sender, $eventArgs)
    $eventArgs.Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  })

  function Update-RoundedRegion {
    param([System.Windows.Forms.Control]$Control, [int]$Radius)
    if ($Control.Width -lt 2 -or $Control.Height -lt 2) { return }
    $diameter = [Math]::Min($Radius * 2, [Math]::Min($Control.Width, $Control.Height))
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    try {
      $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
      $path.AddArc($Control.Width - $diameter, 0, $diameter, $diameter, 270, 90)
      $path.AddArc($Control.Width - $diameter, $Control.Height - $diameter, $diameter, $diameter, 0, 90)
      $path.AddArc(0, $Control.Height - $diameter, $diameter, $diameter, 90, 90)
      $path.CloseFigure()
      $oldRegion = $Control.Region
      $Control.Region = [System.Drawing.Region]::new($path)
      if ($oldRegion) { $oldRegion.Dispose() }
    } finally {
      $path.Dispose()
    }
  }

  function Set-RoundedCorners {
    param([System.Windows.Forms.Control]$Control, [int]$Radius = 12)
    Update-RoundedRegion -Control $Control -Radius $Radius
    $capturedRadius = $Radius
    $updateRoundedRegion = ${function:Update-RoundedRegion}
    $resizeHandler = {
      param($sender, $eventArgs)
      & $updateRoundedRegion -Control $sender -Radius $capturedRadius
    }.GetNewClosure()
    $Control.Add_Resize($resizeHandler)
  }

  $nav = [System.Windows.Forms.Panel]::new()
  $nav.Dock = 'Left'
  $nav.Width = 206
  $nav.Padding = [System.Windows.Forms.Padding]::new(16, 18, 12, 12)
  $nav.BackColor = $colorSidebar

  $body = [System.Windows.Forms.Panel]::new()
  $body.Dock = 'Fill'
  $body.Padding = [System.Windows.Forms.Padding]::new(28, 24, 28, 20)
  $body.BackColor = $colorBackground
  $form.Controls.Add($body)
  $form.Controls.Add($nav)

  $brand = [System.Windows.Forms.Label]::new()
  $brand.Text = 'DREAM SKIN'
  $brand.AutoSize = $false
  $brand.Width = 178
  $brand.Height = 34
  $brand.Location = [System.Drawing.Point]::new(0, 10)
  $brand.TextAlign = 'MiddleCenter'
  $brand.Font = $fontEnglishBold
  $brand.ForeColor = $colorAccent
  $nav.Controls.Add($brand)

  $subtitle = [System.Windows.Forms.Label]::new()
  $subtitle.Text = 'Codex 控制台'
  $subtitle.AutoSize = $false
  $subtitle.Width = 178
  $subtitle.Height = 24
  $subtitle.Location = [System.Drawing.Point]::new(0, 58)
  $subtitle.TextAlign = 'MiddleCenter'
  $subtitle.Font = $fontChinese
  $subtitle.ForeColor = $colorMuted
  $nav.Controls.Add($subtitle)

  $pagePanels = @{}
  $navButtons = @{}
  function New-NavButton {
    param([string]$Key, [string]$Text, [int]$Top)
    $button = [System.Windows.Forms.Button]::new()
    $button.Text = $Text
    $button.Tag = $Key
    $button.Width = 178
    $button.Height = 38
    $button.Location = [System.Drawing.Point]::new(0, $Top)
    $button.FlatStyle = 'Flat'
    $button.FlatAppearance.BorderSize = 0
    $button.TextAlign = 'MiddleLeft'
    $button.Padding = [System.Windows.Forms.Padding]::new(12, 0, 0, 0)
    $button.Font = $fontChinese
    $button.UseCompatibleTextRendering = $false
    $button.ForeColor = $colorText
    $button.BackColor = $colorSidebar
    Set-RoundedCorners -Control $button -Radius 12
    $button.Add_Click({ Show-Page -Key $this.Tag })
    $nav.Controls.Add($button)
    $navButtons[$Key] = $button
  }

  function New-Page {
    param([string]$Key)
    $panel = [System.Windows.Forms.Panel]::new()
    $panel.Dock = 'Fill'
    $panel.Visible = $false
    $body.Controls.Add($panel)
    $pagePanels[$Key] = $panel
    return $panel
  }

  function Show-Page {
    param([string]$Key)
    foreach ($item in $pagePanels.GetEnumerator()) { $item.Value.Visible = ($item.Key -eq $Key) }
    foreach ($item in $navButtons.GetEnumerator()) {
      if ($item.Key -eq $Key) {
        $item.Value.BackColor = $colorAction
        $item.Value.ForeColor = $colorAccent
      } else {
        $item.Value.BackColor = $colorSidebar
        $item.Value.ForeColor = $colorText
      }
    }
    if ($Key -eq 'themes') { Refresh-ThemeList }
    if ($Key -eq 'overview') { Refresh-Overview }
  }

  New-NavButton -Key 'overview' -Text '概览' -Top 116
  New-NavButton -Key 'themes' -Text '主题' -Top 168
  New-NavButton -Key 'images' -Text '背景图片' -Top 220
  New-NavButton -Key 'advanced' -Text '高级设置' -Top 272

  $pageOverview = New-Page -Key 'overview'
  $pageThemes = New-Page -Key 'themes'
  $pageImages = New-Page -Key 'images'
  $pageAdvanced = New-Page -Key 'advanced'

  $overviewLayout = [System.Windows.Forms.TableLayoutPanel]::new()
  $overviewLayout.Dock = 'Fill'
  $overviewLayout.ColumnCount = 1
  $overviewLayout.RowCount = 8
  $overviewLayout.Margin = [System.Windows.Forms.Padding]::new(0)
  $overviewLayout.Padding = [System.Windows.Forms.Padding]::new(0)
  $overviewLayout.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
    [System.Windows.Forms.SizeType]::Percent, 100
  ))
  $overviewLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::AutoSize))
  $overviewLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 14))
  $overviewLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 126))
  $overviewLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 12))
  $overviewLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 1))
  $overviewLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 12))
  $overviewLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 92))
  $overviewLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Percent, 100))
  $pageOverview.Controls.Add($overviewLayout)

  $advancedLayout = [System.Windows.Forms.TableLayoutPanel]::new()
  $advancedLayout.Dock = 'Fill'
  $advancedLayout.ColumnCount = 1
  $advancedLayout.RowCount = 4
  $advancedLayout.Margin = [System.Windows.Forms.Padding]::new(0)
  $advancedLayout.Padding = [System.Windows.Forms.Padding]::new(0)
  $advancedLayout.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
    [System.Windows.Forms.SizeType]::Percent, 100
  ))
  $advancedLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::AutoSize))
  $advancedLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 18))
  $advancedLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 210))
  $advancedLayout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Percent, 100))
  $pageAdvanced.Controls.Add($advancedLayout)

  $header = [System.Windows.Forms.Label]::new()
  $header.Text = '概览'
  $header.AutoSize = $true
  $header.Font = [System.Drawing.Font]::new('Microsoft YaHei UI', 24, [System.Drawing.FontStyle]::Bold)
  $header.ForeColor = $colorText
  $header.Visible = $false
  $body.Controls.Add($header)
  $header.BringToFront()

  $statusLabel = [System.Windows.Forms.Label]::new()
  $statusLabel.AutoSize = $true
  $statusLabel.Margin = [System.Windows.Forms.Padding]::new(0)
  $statusLabel.Font = $fontChinese
  $statusLabel.ForeColor = $colorMuted
  $overviewLayout.Controls.Add($statusLabel, 0, 0)
  $statusLabel.BringToFront()

  $script:busyProcess = $null
  $script:busyButtons = @()
  function Set-Busy {
    param([bool]$Busy, [string]$Message = '')
    foreach ($button in $script:busyButtons) { $button.Enabled = -not $Busy }
    if ($Message) { $statusLabel.Text = $Message }
  }

  function Start-ConsoleScript {
    param([string]$Script, [string[]]$Arguments, [string]$Message)
    if ($null -ne $script:busyProcess -and -not $script:busyProcess.HasExited) { return }
    Set-Busy -Busy $true -Message $Message
    $argumentLine = '-NoProfile -STA -ExecutionPolicy RemoteSigned -File ' +
      (ConvertTo-DreamSkinProcessArgument -Value $Script)
    if ($Arguments.Count -gt 0) {
      $argumentLine += ' ' + (($Arguments | ForEach-Object { ConvertTo-DreamSkinProcessArgument -Value $_ }) -join ' ')
    }
    try {
      $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
      $startInfo.FileName = $powershell
      $startInfo.Arguments = $argumentLine
      $startInfo.UseShellExecute = $false
      $startInfo.CreateNoWindow = $true
      $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
      $startInfo.WorkingDirectory = Join-Path $StateRoot 'engine'
      $script:busyProcess = [System.Diagnostics.Process]::Start($startInfo)
    }
    catch { Set-Busy -Busy $false -Message "操作失败：$($_.Exception.Message)" }
  }

  function Refresh-Overview {
    try {
      $paused = Test-DreamSkinPaused -StateRoot $StateRoot
      $state = $null
      try { $state = Read-DreamSkinState -Path $paths.State } catch {}
      $active = $null
      try { $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata } catch {}
      if ($paused) { $runtime = '已暂停' } elseif ($state) { $runtime = '运行中' } else { $runtime = '未运行' }
      if ($active -and $active.Theme.name) { $theme = $active.Theme.name } else { $theme = '未命名主题' }
      $statusLabel.Text = "状态：$runtime    主题：$theme"
      if ($paused) { $pauseButton.Text = '继续使用' } else { $pauseButton.Text = '暂停皮肤' }
    } catch { $statusLabel.Text = "读取状态失败：$($_.Exception.Message)" }
  }

  $actionPanel = [System.Windows.Forms.TableLayoutPanel]::new()
  $actionPanel.Dock = 'Fill'
  $actionPanel.Margin = [System.Windows.Forms.Padding]::new(0)
  $actionPanel.ColumnCount = 2
  $actionPanel.RowCount = 2
  $actionPanel.Padding = [System.Windows.Forms.Padding]::new(14, 13, 14, 13)
  $actionPanel.BackColor = $colorPanel
  Set-RoundedCorners -Control $actionPanel -Radius 12
  $overviewLayout.Controls.Add($actionPanel, 0, 2)

  function New-ActionButton {
    param([string]$Text, [int]$Width = 150)
    $button = [System.Windows.Forms.Button]::new()
    $button.Text = $Text
    $button.Width = $Width
    $button.Height = 42
    $button.Margin = [System.Windows.Forms.Padding]::new(0, 0, 8, 0)
    $button.FlatStyle = 'Flat'
    $button.FlatAppearance.BorderSize = 0
    $button.FlatAppearance.MouseOverBackColor = $colorActionHover
    $button.FlatAppearance.MouseDownBackColor = $colorActionHover
    $button.BackColor = $colorAction
    $button.ForeColor = $colorText
    $button.Font = $fontChinese
    $button.UseCompatibleTextRendering = $false
    Set-RoundedCorners -Control $button -Radius 12
    $button.Add_Paint({
      param($sender, $eventArgs)
      $graphics = $eventArgs.Graphics
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $inset = 1.0
      $radius = 12.0
      $diameter = $radius * 2.0
      $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
      $path.AddArc($inset, $inset, $diameter, $diameter, 180, 90)
      $path.AddArc($sender.Width - $diameter - $inset, $inset, $diameter, $diameter, 270, 90)
      $path.AddArc($sender.Width - $diameter - $inset, $sender.Height - $diameter - $inset, $diameter, $diameter, 0, 90)
      $path.AddArc($inset, $sender.Height - $diameter - $inset, $diameter, $diameter, 90, 90)
      $path.CloseFigure()
      $pen = [System.Drawing.Pen]::new($colorAccent, 1.6)
      try { $graphics.DrawPath($pen, $path) }
      finally { $pen.Dispose(); $path.Dispose() }
    })
    $button.Add_MouseEnter({ $this.BackColor = $colorActionHover })
    $button.Add_MouseLeave({ $this.BackColor = $colorAction })
    $script:busyButtons += $button
    return $button
  }

  $applyButton = New-ActionButton -Text '应用 / 重新应用' -Width 180
  $pauseButton = New-ActionButton -Text '暂停皮肤' -Width 160
  $restoreButton = New-ActionButton -Text '恢复官方外观' -Width 190
  $verifyButton = New-ActionButton -Text '验证皮肤' -Width 160
  $actionButtons = @($applyButton, $pauseButton, $restoreButton, $verifyButton)
  foreach ($button in $actionButtons) {
    $button.Dock = 'Fill'
    $button.Margin = [System.Windows.Forms.Padding]::new(4)
    $button.AutoSize = $false
  }

  $script:actionGridWide = $null
  function Set-ActionGridLayout {
    param([bool]$Wide)
    if ($script:actionGridWide -eq $Wide -and $actionPanel.Controls.Count -eq 4) { return }
    $script:actionGridWide = $Wide
    $actionPanel.SuspendLayout()
    try {
      $actionPanel.Controls.Clear()
      $actionPanel.ColumnStyles.Clear()
      $actionPanel.RowStyles.Clear()
      if ($Wide) {
        $actionPanel.ColumnCount = 4
        $actionPanel.RowCount = 1
        foreach ($index in 0..3) {
          $actionPanel.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
            [System.Windows.Forms.SizeType]::Percent, 25
          ))
          $actionPanel.Controls.Add($actionButtons[$index], $index, 0)
        }
        $actionPanel.RowStyles.Add([System.Windows.Forms.RowStyle]::new(
          [System.Windows.Forms.SizeType]::Percent, 100
        ))
        $overviewLayout.RowStyles[2].Height = 76
      } else {
        $actionPanel.ColumnCount = 2
        $actionPanel.RowCount = 2
        foreach ($index in 0..1) {
          $actionPanel.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
            [System.Windows.Forms.SizeType]::Percent, 50
          ))
          $actionPanel.RowStyles.Add([System.Windows.Forms.RowStyle]::new(
            [System.Windows.Forms.SizeType]::Percent, 50
          ))
        }
        foreach ($index in 0..3) {
          $actionPanel.Controls.Add($actionButtons[$index], ($index % 2), [Math]::Floor($index / 2))
        }
        $overviewLayout.RowStyles[2].Height = 126
      }
    } finally {
      $actionPanel.ResumeLayout($true)
    }
  }

  $applyButton.Add_Click({
    Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
    Start-ConsoleScript -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart') -Message '正在应用皮肤……'
  })
  $pauseButton.Add_Click({
    if (Test-DreamSkinPaused -StateRoot $StateRoot) {
      Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
      Start-ConsoleScript -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart') -Message '正在继续使用皮肤……'
    } else {
      Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
      $removal = Invoke-DreamSkinLiveRemove -StateRoot $StateRoot
      $statusLabel.Text = $removal.Message
      Refresh-Overview
    }
  })
  $restoreButton.Add_Click({
    $answer = [System.Windows.Forms.MessageBox]::Show(
      '这将关闭 Dream Skin 并恢复 Codex 官方外观，是否继续？',
      '确认恢复', [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) {
      Start-ConsoleScript -Script $restoreScript -Arguments @('-Port', "$Port", '-RestoreBaseTheme', '-PromptRestart') -Message '正在恢复官方外观……'
    }
  })
  $verifyButton.Add_Click({ Start-ConsoleScript -Script $verifyScript -Arguments @('-Port', "$Port") -Message '正在验证皮肤……' })

  $info = [System.Windows.Forms.Label]::new()
  $info.AutoSize = $false
  $info.Dock = 'Fill'
  $info.Margin = [System.Windows.Forms.Padding]::new(0)
  $info.Padding = [System.Windows.Forms.Padding]::new(16, 14, 16, 12)
  $info.BackColor = $colorPanel
  $info.ForeColor = $colorMuted
  $info.Font = $fontChinese
  $info.Text = '控制台复用现有的启动、暂停、恢复、主题和验证脚本。'
  Set-RoundedCorners -Control $info -Radius 12
  $overviewLayout.Controls.Add($info, 0, 6)

  $overviewDivider = [System.Windows.Forms.Panel]::new()
  $overviewDivider.Dock = 'Fill'
  $overviewDivider.Margin = [System.Windows.Forms.Padding]::new(0)
  $overviewDivider.BackColor = $colorPanelBorder
  $overviewLayout.Controls.Add($overviewDivider, 0, 4)

  $themeList = [System.Windows.Forms.ListBox]::new()
  $themeList.Location = [System.Drawing.Point]::new(0, 34)
  $themeList.Width = 500
  $themeList.Height = 360
  $themeList.BackColor = $colorPanel
  $themeList.ForeColor = $colorText
  $themeList.Font = $fontChinese
  $themeList.BorderStyle = 'None'
  $themeList.IntegralHeight = $false
  $themeList.ItemHeight = 34
  $themeList.DrawMode = 'OwnerDrawFixed'
  $themeList.Add_DrawItem({
    param($sender, $eventArgs)
    if ($eventArgs.Index -lt 0 -or $eventArgs.Index -ge $sender.Items.Count) { return }
    $eventArgs.DrawBackground()
    $text = "$($sender.Items[$eventArgs.Index])"
    $font = if ($text -match '[^\x00-\x7F]') { $fontChinese } else { $fontEnglish }
    $brush = [System.Drawing.SolidBrush]::new($sender.ForeColor)
    try {
      $eventArgs.Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
      $bounds = $eventArgs.Bounds
      $y = $bounds.Y + [Math]::Max(2, [Math]::Floor(($bounds.Height - $font.Height) / 2))
      $eventArgs.Graphics.DrawString($text, $font, $brush, [System.Drawing.PointF]::new($bounds.X + 14, $y))
    } finally { $brush.Dispose() }
    $eventArgs.DrawFocusRectangle()
  }.GetNewClosure())
  Set-RoundedCorners -Control $themeList -Radius 12
  $pageThemes.Controls.Add($themeList)
  $script:themePathsByName = @{}
  $themeApply = New-ActionButton -Text '应用选中主题' -Width 170
  $pageThemes.Controls.Add($themeApply)
  $themeApply.Location = [System.Drawing.Point]::new(520, 34)
  $themeApply.Add_Click({
    if ($themeList.SelectedItem) { $selectedName = "$($themeList.SelectedItem)" } else { $selectedName = '' }
    if ($selectedName -and $script:themePathsByName.ContainsKey($selectedName)) {
      try {
        $null = Use-DreamSkinSavedTheme -ThemeDirectory $script:themePathsByName[$selectedName] -StateRoot $StateRoot
        Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
        Start-ConsoleScript -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart') -Message '正在切换主题……'
      } catch { $statusLabel.Text = "切换主题失败：$($_.Exception.Message)" }
    }
  })
  function Refresh-ThemeList {
    $themeList.Items.Clear()
    $script:themePathsByName = @{}
    foreach ($theme in @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata)) {
      [void]$themeList.Items.Add($theme.Name)
      $script:themePathsByName[$theme.Name] = $theme.Path
    }
  }

  $imageButton = New-ActionButton -Text '导入背景图片' -Width 170
  $pageImages.Controls.Add($imageButton)
  $imageButton.Location = [System.Drawing.Point]::new(0, 34)
  $imageFolderButton = New-ActionButton -Text '打开图片文件夹' -Width 170
  $pageImages.Controls.Add($imageFolderButton)
  $imageFolderButton.Location = [System.Drawing.Point]::new(0, 104)
  $imageButton.Add_Click({
    $dialog = [System.Windows.Forms.OpenFileDialog]::new()
    $dialog.Title = '选择 Codex Dream Skin 背景图片'
    $dialog.Filter = 'Image files|*.png;*.jpg;*.jpeg;*.webp|All files|*.*'
    try {
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $null = Set-DreamSkinActiveTheme -ImagePath $dialog.FileName -Theme $null -StateRoot $StateRoot
        Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
        Start-ConsoleScript -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart') -Message '正在应用背景图片……'
      }
    } catch { $statusLabel.Text = "导入背景图片失败：$($_.Exception.Message)" }
    finally { $dialog.Dispose() }
  })
  $imageFolderButton.Add_Click({ Start-Process -FilePath explorer.exe -ArgumentList @($paths.Images) | Out-Null })

  $logButton = New-ActionButton -Text '打开运行时文件夹' -Width 220
  $logButton.AutoSize = $true
  $logButton.AutoSizeMode = [System.Windows.Forms.AutoSizeMode]::GrowAndShrink
  $logButton.MinimumSize = [System.Drawing.Size]::new(0, 42)
  $logButton.Padding = [System.Windows.Forms.Padding]::new(18, 0, 18, 0)
  $logButton.Margin = [System.Windows.Forms.Padding]::new(0)
  $logButton.Anchor = [System.Windows.Forms.AnchorStyles]::Left
  $advancedLayout.Controls.Add($logButton, 0, 0)
  $logButton.Add_Click({ Start-Process -FilePath explorer.exe -ArgumentList @($StateRoot) | Out-Null })

  $versionInfo = [System.Windows.Forms.TableLayoutPanel]::new()
  $versionInfo.Dock = 'Fill'
  $versionInfo.Margin = [System.Windows.Forms.Padding]::new(0)
  $versionInfo.Padding = [System.Windows.Forms.Padding]::new(16, 14, 16, 12)
  $versionInfo.BackColor = $colorPanel
  $versionInfo.ColumnCount = 1
  $versionInfo.RowCount = 4
  $versionInfo.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
    [System.Windows.Forms.SizeType]::Percent, 100
  ))
  $versionInfo.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::AutoSize))
  $versionInfo.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 54))
  $versionInfo.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::AutoSize))
  $versionInfo.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Percent, 100))

  $runtimeTitle = [System.Windows.Forms.Label]::new()
  $runtimeTitle.AutoSize = $true
  $runtimeTitle.Margin = [System.Windows.Forms.Padding]::new(0)
  $runtimeTitle.Font = $fontChinese
  $runtimeTitle.ForeColor = $colorMuted
  $runtimeTitle.Text = '运行时目录：'
  $versionInfo.Controls.Add($runtimeTitle, 0, 0)

  $runtimePath = [System.Windows.Forms.TextBox]::new()
  $runtimePath.Dock = 'Fill'
  $runtimePath.Margin = [System.Windows.Forms.Padding]::new(0, 2, 0, 2)
  $runtimePath.Multiline = $true
  $runtimePath.WordWrap = $true
  $runtimePath.ReadOnly = $true
  $runtimePath.TabStop = $false
  $runtimePath.BorderStyle = [System.Windows.Forms.BorderStyle]::None
  $runtimePath.BackColor = $colorPanel
  $runtimePath.ForeColor = $colorMuted
  $runtimePath.Font = $fontEnglish
  $runtimePath.Text = $StateRoot
  $versionInfo.Controls.Add($runtimePath, 0, 1)

  $portLabel = [System.Windows.Forms.Label]::new()
  $portLabel.AutoSize = $true
  $portLabel.Margin = [System.Windows.Forms.Padding]::new(0)
  $portLabel.Font = $fontChinese
  $portLabel.ForeColor = $colorMuted
  $portLabel.Text = "端口：$Port"
  $versionInfo.Controls.Add($portLabel, 0, 2)

  $securityLabel = [System.Windows.Forms.Label]::new()
  $securityLabel.AutoSize = $false
  $securityLabel.Dock = 'Fill'
  $securityLabel.Margin = [System.Windows.Forms.Padding]::new(0, 4, 0, 0)
  $securityLabel.Font = $fontChinese
  $securityLabel.ForeColor = $colorMuted
  $securityLabel.TextAlign = [System.Drawing.ContentAlignment]::TopLeft
  $securityLabel.Text = "安全说明：仅使用本机 CDP；`r`n不会修改 WindowsApps 或 app.asar。"
  $versionInfo.Controls.Add($securityLabel, 0, 3)
  Set-RoundedCorners -Control $versionInfo -Radius 12
  $advancedLayout.Controls.Add($versionInfo, 0, 2)

  function Update-ConsoleLayout {
    $innerWidth = [Math]::Max(300, $body.ClientSize.Width - $body.Padding.Left - $body.Padding.Right)
    Set-ActionGridLayout -Wide ($overviewLayout.ClientSize.Width -ge 900)

    # The theme list and action stay side by side when there is room, and move
    # below each other on a compact window so neither control can overlap.
    if ($innerWidth -ge 680) {
      $themeList.Width = $innerWidth - 200
      $themeApply.Location = [System.Drawing.Point]::new($themeList.Width + 20, 34)
    } else {
      $themeList.Width = $innerWidth
      $themeApply.Location = [System.Drawing.Point]::new(0, 410)
    }
  }

  $form.Add_Resize({ Update-ConsoleLayout })
  $form.Add_Shown({ Update-ConsoleLayout })
  $overviewLayout.Add_SizeChanged({ Update-ConsoleLayout })
  Set-ActionGridLayout -Wide $false

  $timer = [System.Windows.Forms.Timer]::new()
  $timer.Interval = 400
  $timer.Add_Tick({
    if ($null -ne $script:busyProcess -and $script:busyProcess.HasExited) {
      $script:busyProcess = $null
      Set-Busy -Busy $false -Message '操作已完成。'
      Refresh-Overview
    }
  })
  $timer.Start()
  $form.Add_FormClosed({ $timer.Stop(); $timer.Dispose() })
  Show-Page -Key 'overview'
  Refresh-Overview
  [void]$form.ShowDialog()
} finally {
  if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
  $mutex.Dispose()
}
