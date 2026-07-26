[CmdletBinding()]
param(
  [int]$Port = 9335,
  [string]$ScreenshotPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

Assert-DreamSkinPort -Port $Port
[System.Windows.Forms.Application]::EnableVisualStyles()

$windowTitle = 'Codex Dream Skin 主题选择器'
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.ThemePicker")
$acquired = $false
$thumbnailImages = [System.Collections.ArrayList]::new()
$toolTip = $null
$form = $null

try {
  try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) {
    try { [Microsoft.VisualBasic.Interaction]::AppActivate($windowTitle) | Out-Null } catch {}
    exit 0
  }

  $SkillRoot = Split-Path -Parent $PSScriptRoot
  $StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  $paths = Initialize-DreamSkinThemeStore -SkillRoot $SkillRoot -StateRoot $StateRoot
  $powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
  $startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'

  function Start-DreamSkinPickerPowerShell {
    param([Parameter(Mandatory = $true)][string]$Script, [string[]]$Arguments = @())
    $scriptToken = ConvertTo-DreamSkinProcessArgument -Value $Script
    $argumentLine = '-NoProfile -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' + $scriptToken
    if ($Arguments.Count -gt 0) { $argumentLine += ' ' + ($Arguments -join ' ') }
    Start-Process -FilePath $powershell -ArgumentList $argumentLine -WindowStyle Hidden | Out-Null
  }

  function Test-DreamSkinPickerWatcherRunning {
    param([AllowNull()][object]$State)
    if ($null -eq $State -or -not $State.injectorPid) { return $false }
    $injectorProcessId = 0
    if (-not [int]::TryParse("$($State.injectorPid)", [ref]$injectorProcessId) -or
      $injectorProcessId -le 0) { return $false }
    $startedAt = Get-DreamSkinProcessStartedAt -ProcessId $injectorProcessId
    if (-not $startedAt) { return $false }
    return -not $State.injectorStartedAt -or $startedAt -eq "$($State.injectorStartedAt)"
  }

  function New-DreamSkinThumbnail {
    param(
      [Parameter(Mandatory = $true)][string]$Path,
      [int]$Width = 224,
      [int]$Height = 126
    )
    $stream = $null
    $source = $null
    $graphics = $null
    try {
      $bytes = [System.IO.File]::ReadAllBytes($Path)
      $stream = [System.IO.MemoryStream]::new($bytes, $false)
      $source = [System.Drawing.Image]::FromStream($stream, $true, $true)
      $thumbnail = [System.Drawing.Bitmap]::new(
        $Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppPArgb
      )
      $graphics = [System.Drawing.Graphics]::FromImage($thumbnail)
      $graphics.Clear([System.Drawing.Color]::FromArgb(14, 17, 23))
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $scale = [Math]::Max($Width / $source.Width, $Height / $source.Height)
      $drawWidth = $source.Width * $scale
      $drawHeight = $source.Height * $scale
      $drawX = ($Width - $drawWidth) / 2
      $drawY = ($Height - $drawHeight) / 2
      $destination = [System.Drawing.RectangleF]::new($drawX, $drawY, $drawWidth, $drawHeight)
      $graphics.DrawImage($source, $destination)
      return $thumbnail
    } catch {
      if ($null -ne $thumbnail) { $thumbnail.Dispose() }
      return $null
    } finally {
      if ($null -ne $graphics) { $graphics.Dispose() }
      if ($null -ne $source) { $source.Dispose() }
      if ($null -ne $stream) { $stream.Dispose() }
    }
  }

  $colors = [pscustomobject]@{
    Background = [System.Drawing.Color]::FromArgb(14, 17, 23)
    Header = [System.Drawing.Color]::FromArgb(22, 26, 35)
    Card = [System.Drawing.Color]::FromArgb(27, 31, 41)
    CardHover = [System.Drawing.Color]::FromArgb(34, 40, 53)
    Border = [System.Drawing.Color]::FromArgb(48, 55, 70)
    Accent = [System.Drawing.Color]::FromArgb(124, 92, 255)
    AccentSoft = [System.Drawing.Color]::FromArgb(185, 168, 255)
    Success = [System.Drawing.Color]::FromArgb(110, 231, 183)
    Text = [System.Drawing.Color]::FromArgb(244, 246, 250)
    Muted = [System.Drawing.Color]::FromArgb(152, 162, 179)
    Error = [System.Drawing.Color]::FromArgb(248, 113, 113)
  }

  $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata
  $script:pickerActiveThemeId = "$($active.Theme.id)"
  $script:pickerActiveThemeName = "$($active.Theme.name)"
  $script:pickerBusy = $false
  $script:pickerCards = [System.Collections.ArrayList]::new()

  $themeInfos = @()
  foreach ($saved in @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata)) {
    try {
      $loaded = Read-DreamSkinTheme -ThemeDirectory $saved.Path -SkipImageMetadata
      $themeInfos += [pscustomobject]@{
        Id = $saved.Id
        Name = $saved.Name
        Path = $saved.Path
        ImagePath = $loaded.ImagePath
      }
    } catch {}
  }
  $themeInfos = @(
    @($themeInfos | Where-Object { $_.Id -eq $script:pickerActiveThemeId }) +
    @($themeInfos | Where-Object { $_.Id -ne $script:pickerActiveThemeId })
  )

  $workingArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $windowWidth = [Math]::Min(1120, [Math]::Max(760, $workingArea.Width - 100))
  $windowHeight = [Math]::Min(820, [Math]::Max(600, $workingArea.Height - 100))

  $form = [System.Windows.Forms.Form]::new()
  $form.Text = $windowTitle
  $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
  $form.Size = [System.Drawing.Size]::new($windowWidth, $windowHeight)
  $form.MinimumSize = [System.Drawing.Size]::new(760, 600)
  $form.BackColor = $colors.Background
  $form.ForeColor = $colors.Text
  $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
  $form.Font = [System.Drawing.Font]::new('Microsoft YaHei UI', 9)
  $form.ShowIcon = $false

  $layout = [System.Windows.Forms.TableLayoutPanel]::new()
  $layout.Dock = [System.Windows.Forms.DockStyle]::Fill
  $layout.ColumnCount = 1
  $layout.RowCount = 3
  [void]$layout.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new([System.Windows.Forms.SizeType]::Percent, 100))
  [void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 78))
  [void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Percent, 100))
  [void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute, 50))
  $form.Controls.Add($layout)

  $header = [System.Windows.Forms.Panel]::new()
  $header.Dock = [System.Windows.Forms.DockStyle]::Fill
  $header.BackColor = $colors.Header
  $layout.Controls.Add($header, 0, 0)

  $titleLabel = [System.Windows.Forms.Label]::new()
  $titleLabel.Text = '选择你的主题'
  $titleLabel.Location = [System.Drawing.Point]::new(22, 13)
  $titleLabel.Size = [System.Drawing.Size]::new(700, 30)
  $titleLabel.Font = [System.Drawing.Font]::new('Microsoft YaHei UI', 16, [System.Drawing.FontStyle]::Bold)
  $titleLabel.ForeColor = $colors.Text
  $header.Controls.Add($titleLabel)

  $script:pickerSubtitle = [System.Windows.Forms.Label]::new()
  $script:pickerSubtitle.Text = "当前：$($script:pickerActiveThemeName)  ·  $($themeInfos.Count) 个主题"
  $script:pickerSubtitle.Location = [System.Drawing.Point]::new(24, 46)
  $script:pickerSubtitle.Size = [System.Drawing.Size]::new(900, 22)
  $script:pickerSubtitle.ForeColor = $colors.Muted
  $header.Controls.Add($script:pickerSubtitle)

  $flow = [System.Windows.Forms.FlowLayoutPanel]::new()
  $flow.Dock = [System.Windows.Forms.DockStyle]::Fill
  $flow.AutoScroll = $true
  $flow.WrapContents = $true
  $flow.FlowDirection = [System.Windows.Forms.FlowDirection]::LeftToRight
  $flow.Padding = [System.Windows.Forms.Padding]::new(12)
  $flow.BackColor = $colors.Background
  $layout.Controls.Add($flow, 0, 1)

  $footer = [System.Windows.Forms.Panel]::new()
  $footer.Dock = [System.Windows.Forms.DockStyle]::Fill
  $footer.BackColor = $colors.Header
  $layout.Controls.Add($footer, 0, 2)

  $script:pickerStatusLabel = [System.Windows.Forms.Label]::new()
  $script:pickerStatusLabel.Text = '单击卡片自动应用  ·  “删”可删除非当前主题  ·  ✓ 为当前主题'
  $script:pickerStatusLabel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $script:pickerStatusLabel.Padding = [System.Windows.Forms.Padding]::new(22, 0, 12, 0)
  $script:pickerStatusLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
  $script:pickerStatusLabel.ForeColor = $colors.Muted
  $footer.Controls.Add($script:pickerStatusLabel)

  $toolTip = [System.Windows.Forms.ToolTip]::new()
  $toolTip.InitialDelay = 350
  $toolTip.ReshowDelay = 100

  function Update-DreamSkinPickerCardStates {
    foreach ($entry in @($script:pickerCards)) {
      $isActive = $entry.Id -eq $script:pickerActiveThemeId
      $entry.Frame.BackColor = if ($isActive) { $colors.Accent } else { $colors.Border }
      $entry.Check.Text = if ($isActive) { '✓' } else { '' }
      $entry.Check.BackColor = if ($isActive) { $colors.Accent } else { $colors.Card }
      $entry.Delete.Enabled = -not $isActive
      $entry.Delete.Visible = -not $isActive
      $entry.Delete.ForeColor = if ($isActive) { $colors.Muted } else { $colors.Error }
      $entry.NameLabel.ForeColor = if ($isActive) { $colors.AccentSoft } else { $colors.Text }
      $entry.NameLabel.Font = [System.Drawing.Font]::new(
        'Microsoft YaHei UI', 10, $(if ($isActive) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular })
      )
    }
  }

  function Invoke-DreamSkinPickerSelection {
    param([Parameter(Mandatory = $true)][object]$ThemeInfo)
    if ($script:pickerBusy) { return }
    $script:pickerBusy = $true
    $form.UseWaitCursor = $true
    $script:pickerStatusLabel.ForeColor = $colors.AccentSoft
    $script:pickerStatusLabel.Text = "正在自动应用：$($ThemeInfo.Name)…"
    [System.Windows.Forms.Application]::DoEvents()
    try {
      $null = Use-DreamSkinSavedTheme -ThemeDirectory $ThemeInfo.Path -StateRoot $StateRoot
      Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
      $liveState = $null
      try { $liveState = Read-DreamSkinState -Path $paths.State } catch {}
      $watcherWasRunning = Test-DreamSkinPickerWatcherRunning -State $liveState
      if (-not $watcherWasRunning) {
        Start-DreamSkinPickerPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
      }
      $script:pickerActiveThemeId = $ThemeInfo.Id
      $script:pickerActiveThemeName = $ThemeInfo.Name
      Update-DreamSkinPickerCardStates
      $script:pickerSubtitle.Text = "当前：$($ThemeInfo.Name)  ·  $($script:pickerCards.Count) 个主题"
      $script:pickerStatusLabel.ForeColor = $colors.Success
      $script:pickerStatusLabel.Text = if ($watcherWasRunning) {
        "✓ 已自动应用：$($ThemeInfo.Name)"
      } else {
        "✓ 已选择：$($ThemeInfo.Name)，皮肤服务正在启动"
      }
    } catch {
      $script:pickerStatusLabel.ForeColor = $colors.Error
      $script:pickerStatusLabel.Text = "应用失败：$($_.Exception.Message)"
      [void][System.Windows.Forms.MessageBox]::Show(
        $form,
        $_.Exception.Message,
        $windowTitle,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      )
    } finally {
      $form.UseWaitCursor = $false
      $script:pickerBusy = $false
    }
  }

  function Invoke-DreamSkinPickerDeletion {
    param(
      [Parameter(Mandatory = $true)][object]$ThemeInfo,
      [Parameter(Mandatory = $true)][object]$Entry
    )
    if ($script:pickerBusy) { return }
    if ($ThemeInfo.Id -eq $script:pickerActiveThemeId) {
      [void][System.Windows.Forms.MessageBox]::Show(
        $form,
        '当前主题不能删除，请先应用另一个主题。',
        $windowTitle,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      )
      return
    }
    $confirmationText = ('确定删除主题“{0}”吗？' -f $ThemeInfo.Name) + "`r`n`r`n" +
      '此操作会删除该主题及其壁纸文件，无法撤销。'
    $confirmation = [System.Windows.Forms.MessageBox]::Show(
      $form,
      $confirmationText,
      '删除主题',
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Warning,
      [System.Windows.Forms.MessageBoxDefaultButton]::Button2
    )
    if ($confirmation -ne [System.Windows.Forms.DialogResult]::Yes) { return }

    $script:pickerBusy = $true
    $form.UseWaitCursor = $true
    $script:pickerStatusLabel.ForeColor = $colors.AccentSoft
    $script:pickerStatusLabel.Text = "正在删除：$($ThemeInfo.Name)…"
    [System.Windows.Forms.Application]::DoEvents()
    try {
      $null = Remove-DreamSkinSavedTheme -ThemeDirectory $ThemeInfo.Path -StateRoot $StateRoot
      $flow.Controls.Remove($Entry.Frame)
      [void]$script:pickerCards.Remove($Entry)
      if ($null -ne $Entry.Thumbnail) {
        $Entry.Picture.Image = $null
        [void]$thumbnailImages.Remove($Entry.Thumbnail)
        $Entry.Thumbnail.Dispose()
      }
      $Entry.Frame.Dispose()
      if ($script:pickerCards.Count -eq 0) {
        $emptyLabel = [System.Windows.Forms.Label]::new()
        $emptyLabel.Text = '暂无已保存主题'
        $emptyLabel.Size = [System.Drawing.Size]::new(500, 80)
        $emptyLabel.Margin = [System.Windows.Forms.Padding]::new(20)
        $emptyLabel.ForeColor = $colors.Muted
        $emptyLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
        [void]$flow.Controls.Add($emptyLabel)
      }
      $script:pickerSubtitle.Text = "当前：$($script:pickerActiveThemeName)  ·  $($script:pickerCards.Count) 个主题"
      $script:pickerStatusLabel.ForeColor = $colors.Success
      $script:pickerStatusLabel.Text = "✓ 已删除：$($ThemeInfo.Name)"
    } catch {
      $script:pickerStatusLabel.ForeColor = $colors.Error
      $script:pickerStatusLabel.Text = "删除失败：$($_.Exception.Message)"
      [void][System.Windows.Forms.MessageBox]::Show(
        $form,
        $_.Exception.Message,
        $windowTitle,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      )
    } finally {
      $form.UseWaitCursor = $false
      $script:pickerBusy = $false
    }
  }

  function Add-DreamSkinPickerClickHandler {
    param(
      [Parameter(Mandatory = $true)][System.Windows.Forms.Control]$Control,
      [Parameter(Mandatory = $true)][object]$ThemeInfo
    )
    if ("$($Control.Tag)" -eq 'DreamSkinDeleteAction') { return }
    $Control.Cursor = [System.Windows.Forms.Cursors]::Hand
    $handler = {
      param($sender, $eventArgs)
      Invoke-DreamSkinPickerSelection -ThemeInfo $ThemeInfo
    }.GetNewClosure()
    $Control.add_Click($handler)
    foreach ($child in $Control.Controls) {
      Add-DreamSkinPickerClickHandler -Control $child -ThemeInfo $ThemeInfo
    }
  }

  foreach ($themeInfo in $themeInfos) {
    $frame = [System.Windows.Forms.Panel]::new()
    $frame.Size = [System.Drawing.Size]::new(244, 190)
    $frame.Margin = [System.Windows.Forms.Padding]::new(8)
    $frame.Padding = [System.Windows.Forms.Padding]::new(2)
    $frame.BackColor = $colors.Border

    $card = [System.Windows.Forms.Panel]::new()
    $card.Dock = [System.Windows.Forms.DockStyle]::Fill
    $card.BackColor = $colors.Card
    $frame.Controls.Add($card)

    $picture = [System.Windows.Forms.PictureBox]::new()
    $picture.Location = [System.Drawing.Point]::new(8, 8)
    $picture.Size = [System.Drawing.Size]::new(224, 126)
    $picture.BackColor = $colors.Background
    $picture.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Normal
    $thumbnail = New-DreamSkinThumbnail -Path $themeInfo.ImagePath
    if ($null -ne $thumbnail) {
      [void]$thumbnailImages.Add($thumbnail)
      $picture.Image = $thumbnail
    }
    $card.Controls.Add($picture)

    $nameLabel = [System.Windows.Forms.Label]::new()
    $nameLabel.Text = $themeInfo.Name
    $nameLabel.Location = [System.Drawing.Point]::new(9, 143)
    $nameLabel.Size = [System.Drawing.Size]::new(150, 31)
    $nameLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $nameLabel.AutoEllipsis = $true
    $nameLabel.ForeColor = $colors.Text
    $nameLabel.BackColor = $colors.Card
    $card.Controls.Add($nameLabel)

    $checkLabel = [System.Windows.Forms.Label]::new()
    $checkLabel.Location = [System.Drawing.Point]::new(202, 145)
    $checkLabel.Size = [System.Drawing.Size]::new(28, 28)
    $checkLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $checkLabel.Font = [System.Drawing.Font]::new('Segoe UI Symbol', 12, [System.Drawing.FontStyle]::Bold)
    $checkLabel.ForeColor = [System.Drawing.Color]::White
    $checkLabel.BackColor = $colors.Card
    $card.Controls.Add($checkLabel)

    $deleteButton = [System.Windows.Forms.Button]::new()
    $deleteButton.Text = '删'
    $deleteButton.Tag = 'DreamSkinDeleteAction'
    $deleteButton.Location = [System.Drawing.Point]::new(164, 145)
    $deleteButton.Size = [System.Drawing.Size]::new(32, 28)
    $deleteButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $deleteButton.FlatAppearance.BorderSize = 0
    $deleteButton.BackColor = $colors.Card
    $deleteButton.ForeColor = $colors.Error
    $deleteButton.Font = [System.Drawing.Font]::new('Microsoft YaHei UI', 9, [System.Drawing.FontStyle]::Bold)
    $deleteButton.Cursor = [System.Windows.Forms.Cursors]::Hand
    $card.Controls.Add($deleteButton)

    $pickerEntry = [pscustomobject]@{
      Id = $themeInfo.Id
      Frame = $frame
      Card = $card
      Picture = $picture
      Thumbnail = $thumbnail
      NameLabel = $nameLabel
      Check = $checkLabel
      Delete = $deleteButton
    }
    [void]$script:pickerCards.Add($pickerEntry)
    $toolTip.SetToolTip($picture, "点击自动应用：$($themeInfo.Name)")
    $toolTip.SetToolTip($deleteButton, "删除主题：$($themeInfo.Name)")
    $deleteHandler = {
      param($sender, $eventArgs)
      Invoke-DreamSkinPickerDeletion -ThemeInfo $themeInfo -Entry $pickerEntry
    }.GetNewClosure()
    $deleteButton.add_Click($deleteHandler)
    Add-DreamSkinPickerClickHandler -Control $frame -ThemeInfo $themeInfo
    [void]$flow.Controls.Add($frame)
  }

  if ($themeInfos.Count -eq 0) {
    $emptyLabel = [System.Windows.Forms.Label]::new()
    $emptyLabel.Text = '暂无已保存主题'
    $emptyLabel.Size = [System.Drawing.Size]::new(500, 80)
    $emptyLabel.Margin = [System.Windows.Forms.Padding]::new(20)
    $emptyLabel.ForeColor = $colors.Muted
    $emptyLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $flow.Controls.Add($emptyLabel)
  }

  Update-DreamSkinPickerCardStates

  if ($ScreenshotPath) {
    $fullScreenshotPath = [System.IO.Path]::GetFullPath($ScreenshotPath)
    $screenshotDirectory = [System.IO.Path]::GetDirectoryName($fullScreenshotPath)
    New-Item -ItemType Directory -Force -Path $screenshotDirectory | Out-Null
    $captureTimer = [System.Windows.Forms.Timer]::new()
    $captureTimer.Interval = 700
    $captureTimer.add_Tick({
      $captureTimer.Stop()
      $bitmap = [System.Drawing.Bitmap]::new($form.Width, $form.Height)
      try {
        $form.DrawToBitmap(
          $bitmap,
          [System.Drawing.Rectangle]::new(0, 0, $bitmap.Width, $bitmap.Height)
        )
        $bitmap.Save($fullScreenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $bitmap.Dispose()
        $captureTimer.Dispose()
      }
      $form.Close()
    }.GetNewClosure())
    $form.add_Shown({ $captureTimer.Start() }.GetNewClosure())
  }

  [void]$form.ShowDialog()
} finally {
  if ($null -ne $toolTip) { $toolTip.Dispose() }
  foreach ($thumbnail in @($thumbnailImages)) { $thumbnail.Dispose() }
  if ($null -ne $form) { $form.Dispose() }
  if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
  $mutex.Dispose()
}
