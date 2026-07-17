[CmdletBinding()]
param(
  [string]$ImagePath,
  [string]$SidebarImagePath,
  [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'),
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if (-not ('CodexDreamSkin.StudioWindow' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace CodexDreamSkin {
  public static class StudioWindow {
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr handle, int command);

    public static void Show(IntPtr handle) {
      ShowWindow(handle, 5);
    }
  }
}
'@
}
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$SkillRoot = Split-Path -Parent $PSScriptRoot
$paths = Initialize-DreamSkinThemeStore -SkillRoot $SkillRoot -StateRoot $StateRoot
$script:DreamSkinStudioPreviewPixelLimit = 24 * 1000 * 1000

function Get-DreamSkinStudioImageInfo {
  param([Parameter(Mandatory = $true)][string]$Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  Assert-DreamSkinImageFile -Path $fullPath -SkipImageMetadata
  $node = Get-DreamSkinNodeRuntime
  $metadataScript = Join-Path $PSScriptRoot 'image-metadata.mjs'
  $result = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
    $metadataScript, '--check', $fullPath
  )
  if ($result.ExitCode -ne 0) {
    throw 'Image metadata is invalid or exceeds the 16384px / 50MP safety limit.'
  }
  try { $metadata = ($result.Output -join "`n") | ConvertFrom-Json -ErrorAction Stop } catch {
    throw 'Image metadata validation returned invalid output.'
  }
  if ($null -eq $metadata -or $null -eq $metadata.width -or $null -eq $metadata.height) {
    throw 'Image metadata validation did not return dimensions.'
  }
  $file = Get-Item -LiteralPath $fullPath -Force -ErrorAction Stop
  $width = [int]$metadata.width
  $height = [int]$metadata.height
  return [pscustomobject]@{
    Path = $fullPath
    Extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
    Bytes = [long]$file.Length
    Width = $width
    Height = $height
    Pixels = [long]$width * [long]$height
  }
}

function New-DreamSkinStudioPreview {
  param(
    [Parameter(Mandatory = $true)][object]$Info,
    [ValidateSet('Sidebar', 'Workspace')][string]$Role
  )
  if ($Info.Pixels -gt $script:DreamSkinStudioPreviewPixelLimit) { return $null }

  $stream = $null
  $source = $null
  $preview = $null
  $graphics = $null
  try {
    $stream = [System.IO.File]::Open(
      $Info.Path,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::ReadWrite
    )
    $source = [System.Drawing.Image]::FromStream($stream, $true, $true)
    $width = if ($Role -eq 'Sidebar') { 360 } else { 960 }
    $height = if ($Role -eq 'Sidebar') { 720 } else { 540 }
    $targetRatio = $width / $height
    $sourceRatio = $source.Width / $source.Height
    $sourceX = 0.0
    $sourceY = 0.0
    $sourceWidth = [double]$source.Width
    $sourceHeight = [double]$source.Height
    if ($sourceRatio -gt $targetRatio) {
      $sourceWidth = $source.Height * $targetRatio
      $sourceX = ($source.Width - $sourceWidth) / 2
    } else {
      $sourceHeight = $source.Width / $targetRatio
      $sourceY = ($source.Height - $sourceHeight) / 2
    }
    $preview = [System.Drawing.Bitmap]::new($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($preview)
    $graphics.Clear([System.Drawing.Color]::FromArgb(24, 24, 28))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $destination = [System.Drawing.Rectangle]::new(0, 0, $width, $height)
    $graphics.DrawImage(
      $source,
      $destination,
      [single]$sourceX,
      [single]$sourceY,
      [single]$sourceWidth,
      [single]$sourceHeight,
      [System.Drawing.GraphicsUnit]::Pixel
    )
    return $preview
  } catch {
    if ($null -ne $preview) { $preview.Dispose() }
    throw
  } finally {
    if ($null -ne $graphics) { $graphics.Dispose() }
    if ($null -ne $source) { $source.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
  }
}

if ($ValidateOnly) {
  if (-not $ImagePath) { throw '-ValidateOnly requires -ImagePath.' }
  Get-DreamSkinStudioImageInfo -Path $ImagePath | ConvertTo-Json -Compress
  return
}

[System.Windows.Forms.Application]::EnableVisualStyles()
$form = [System.Windows.Forms.Form]::new()
$form.Text = 'Codex Dream Skin - Split Theme Studio'
$form.ClientSize = [System.Drawing.Size]::new(1120, 760)
$form.MinimumSize = [System.Drawing.Size]::new(860, 640)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
$form.Font = [System.Drawing.Font]::new('Segoe UI', 10)
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 248, 250)

$layout = [System.Windows.Forms.TableLayoutPanel]::new()
$layout.Dock = [System.Windows.Forms.DockStyle]::Fill
$layout.Padding = [System.Windows.Forms.Padding]::new(20)
$layout.ColumnCount = 1
$layout.RowCount = 6
[void]$layout.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
  [System.Windows.Forms.SizeType]::Percent, 100
))
foreach ($row in 0..1) {
  [void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new(
    [System.Windows.Forms.SizeType]::AutoSize
  ))
}
[void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new(
  [System.Windows.Forms.SizeType]::Percent, 100
))
foreach ($row in 3..5) {
  [void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new(
    [System.Windows.Forms.SizeType]::AutoSize
  ))
}
$form.Controls.Add($layout)

$heading = [System.Windows.Forms.Label]::new()
$heading.AutoSize = $true
$heading.Font = [System.Drawing.Font]::new('Segoe UI Semibold', 17)
$heading.Text = '为左侧任务栏和右侧工作区分别选择图片'
$heading.Margin = [System.Windows.Forms.Padding]::new(0, 0, 0, 4)
$layout.Controls.Add($heading, 0, 0)

$instructions = [System.Windows.Forms.Label]::new()
$instructions.AutoSize = $true
$instructions.ForeColor = [System.Drawing.Color]::FromArgb(82, 82, 91)
$instructions.Text = '左侧适合竖向纹理或低对比图，右侧适合 16:9 工作区背景。图片只保存在本机，不会上传到网络。'
$instructions.Margin = [System.Windows.Forms.Padding]::new(0, 0, 0, 12)
$layout.Controls.Add($instructions, 0, 1)

$previewGrid = [System.Windows.Forms.TableLayoutPanel]::new()
$previewGrid.Dock = [System.Windows.Forms.DockStyle]::Fill
$previewGrid.ColumnCount = 2
$previewGrid.RowCount = 1
[void]$previewGrid.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
  [System.Windows.Forms.SizeType]::Percent, 36
))
[void]$previewGrid.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
  [System.Windows.Forms.SizeType]::Percent, 64
))
$previewGrid.Margin = [System.Windows.Forms.Padding]::new(0, 0, 0, 12)
$layout.Controls.Add($previewGrid, 0, 2)

function New-DreamSkinStudioPane {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Hint,
    [Parameter(Mandatory = $true)][string]$ButtonText,
    [bool]$CanClear
  )
  $group = [System.Windows.Forms.GroupBox]::new()
  $group.Text = $Title
  $group.Dock = [System.Windows.Forms.DockStyle]::Fill
  $group.Padding = [System.Windows.Forms.Padding]::new(10)
  $group.AllowDrop = $true

  $inner = [System.Windows.Forms.TableLayoutPanel]::new()
  $inner.Dock = [System.Windows.Forms.DockStyle]::Fill
  $inner.ColumnCount = 1
  $inner.RowCount = 3
  [void]$inner.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
    [System.Windows.Forms.SizeType]::Percent, 100
  ))
  [void]$inner.RowStyles.Add([System.Windows.Forms.RowStyle]::new(
    [System.Windows.Forms.SizeType]::Percent, 100
  ))
  [void]$inner.RowStyles.Add([System.Windows.Forms.RowStyle]::new(
    [System.Windows.Forms.SizeType]::AutoSize
  ))
  [void]$inner.RowStyles.Add([System.Windows.Forms.RowStyle]::new(
    [System.Windows.Forms.SizeType]::AutoSize
  ))
  $group.Controls.Add($inner)

  $panel = [System.Windows.Forms.Panel]::new()
  $panel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $panel.MinimumSize = [System.Drawing.Size]::new(0, 260)
  $panel.BackColor = [System.Drawing.Color]::FromArgb(24, 24, 28)
  $panel.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
  $panel.AllowDrop = $true
  $inner.Controls.Add($panel, 0, 0)

  $picture = [System.Windows.Forms.PictureBox]::new()
  $picture.Dock = [System.Windows.Forms.DockStyle]::Fill
  $picture.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
  $picture.BackColor = $panel.BackColor
  $picture.AllowDrop = $true
  $panel.Controls.Add($picture)

  $hintLabel = [System.Windows.Forms.Label]::new()
  $hintLabel.Dock = [System.Windows.Forms.DockStyle]::Fill
  $hintLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $hintLabel.Font = [System.Drawing.Font]::new('Segoe UI Semibold', 12)
  $hintLabel.ForeColor = [System.Drawing.Color]::FromArgb(226, 226, 232)
  $hintLabel.BackColor = $panel.BackColor
  $hintLabel.Text = $Hint
  $hintLabel.AllowDrop = $true
  $panel.Controls.Add($hintLabel)
  $hintLabel.BringToFront()

  $info = [System.Windows.Forms.Label]::new()
  $info.AutoSize = $true
  $info.AutoEllipsis = $true
  $info.ForeColor = [System.Drawing.Color]::FromArgb(82, 82, 91)
  $info.Text = '尚未选择图片'
  $info.Margin = [System.Windows.Forms.Padding]::new(0, 8, 0, 4)
  $inner.Controls.Add($info, 0, 1)

  $actions = [System.Windows.Forms.FlowLayoutPanel]::new()
  $actions.AutoSize = $true
  $actions.WrapContents = $false
  $actions.FlowDirection = [System.Windows.Forms.FlowDirection]::LeftToRight
  $inner.Controls.Add($actions, 0, 2)

  $select = [System.Windows.Forms.Button]::new()
  $select.AutoSize = $true
  $select.Text = $ButtonText
  $select.Padding = [System.Windows.Forms.Padding]::new(7, 2, 7, 2)
  $actions.Controls.Add($select)

  $clear = $null
  if ($CanClear) {
    $clear = [System.Windows.Forms.Button]::new()
    $clear.AutoSize = $true
    $clear.Text = '清除侧栏图片'
    $clear.Padding = [System.Windows.Forms.Padding]::new(7, 2, 7, 2)
    $actions.Controls.Add($clear)
  }

  return [pscustomobject]@{
    Group = $group
    Panel = $panel
    Picture = $picture
    Hint = $hintLabel
    InfoLabel = $info
    SelectButton = $select
    ClearButton = $clear
  }
}

$sidebarPane = New-DreamSkinStudioPane -Title '左侧任务栏图片（可选）' `
  -Hint "拖放侧栏图片`r`n建议竖向纹理或低信息背景" -ButtonText '选择侧栏图片…' -CanClear $true
$sidebarPane.Group.Margin = [System.Windows.Forms.Padding]::new(0, 0, 8, 0)
$previewGrid.Controls.Add($sidebarPane.Group, 0, 0)

$workspacePane = New-DreamSkinStudioPane -Title '右侧工作区图片（必选）' `
  -Hint "拖放工作区图片`r`n建议 16:9 · PNG / JPEG / WebP" -ButtonText '选择工作区图片…' -CanClear $false
$workspacePane.Group.Margin = [System.Windows.Forms.Padding]::new(8, 0, 0, 0)
$previewGrid.Controls.Add($workspacePane.Group, 1, 0)

$options = [System.Windows.Forms.TableLayoutPanel]::new()
$options.AutoSize = $true
$options.Dock = [System.Windows.Forms.DockStyle]::Fill
$options.ColumnCount = 3
$options.RowCount = 1
[void]$options.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
  [System.Windows.Forms.SizeType]::AutoSize
))
[void]$options.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
  [System.Windows.Forms.SizeType]::Percent, 100
))
[void]$options.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
  [System.Windows.Forms.SizeType]::AutoSize
))
$options.Margin = [System.Windows.Forms.Padding]::new(0, 0, 0, 12)
$layout.Controls.Add($options, 0, 3)

$nameLabel = [System.Windows.Forms.Label]::new()
$nameLabel.AutoSize = $true
$nameLabel.Text = '主题名称'
$nameLabel.Anchor = [System.Windows.Forms.AnchorStyles]::Left
$nameLabel.Margin = [System.Windows.Forms.Padding]::new(0, 5, 10, 0)
$options.Controls.Add($nameLabel, 0, 0)

$nameBox = [System.Windows.Forms.TextBox]::new()
$nameBox.Dock = [System.Windows.Forms.DockStyle]::Fill
$nameBox.MaxLength = 80
$nameBox.Margin = [System.Windows.Forms.Padding]::new(0, 0, 16, 0)
$options.Controls.Add($nameBox, 1, 0)

$saveBox = [System.Windows.Forms.CheckBox]::new()
$saveBox.AutoSize = $true
$saveBox.Text = '同时保存到“已保存主题”'
$saveBox.Anchor = [System.Windows.Forms.AnchorStyles]::Left
$saveBox.Margin = [System.Windows.Forms.Padding]::new(0, 4, 0, 0)
$options.Controls.Add($saveBox, 2, 0)

$budgetLabel = [System.Windows.Forms.Label]::new()
$budgetLabel.AutoSize = $true
$budgetLabel.ForeColor = [System.Drawing.Color]::FromArgb(113, 113, 122)
$budgetLabel.Text = '两张图片分别校验，合计不得超过 16 MB。未选择侧栏图片时保持旧版单图整窗模式。'
$budgetLabel.Margin = [System.Windows.Forms.Padding]::new(0, 0, 0, 10)
$layout.Controls.Add($budgetLabel, 0, 4)

$actionRow = [System.Windows.Forms.TableLayoutPanel]::new()
$actionRow.AutoSize = $true
$actionRow.Dock = [System.Windows.Forms.DockStyle]::Fill
$actionRow.ColumnCount = 2
$actionRow.RowCount = 1
[void]$actionRow.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
  [System.Windows.Forms.SizeType]::Percent, 100
))
[void]$actionRow.ColumnStyles.Add([System.Windows.Forms.ColumnStyle]::new(
  [System.Windows.Forms.SizeType]::AutoSize
))
$layout.Controls.Add($actionRow, 0, 5)

$statusLabel = [System.Windows.Forms.Label]::new()
$statusLabel.AutoSize = $true
$statusLabel.Text = '请至少选择右侧工作区图片。'
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(82, 82, 91)
$statusLabel.Anchor = [System.Windows.Forms.AnchorStyles]::Left
$actionRow.Controls.Add($statusLabel, 0, 0)

$buttons = [System.Windows.Forms.FlowLayoutPanel]::new()
$buttons.AutoSize = $true
$buttons.WrapContents = $false
$buttons.FlowDirection = [System.Windows.Forms.FlowDirection]::LeftToRight
$buttons.Margin = [System.Windows.Forms.Padding]::new(12, 0, 0, 0)
$actionRow.Controls.Add($buttons, 1, 0)

$applyButton = [System.Windows.Forms.Button]::new()
$applyButton.AutoSize = $true
$applyButton.Text = '应用分区主题'
$applyButton.Enabled = $false
$applyButton.Padding = [System.Windows.Forms.Padding]::new(8, 3, 8, 3)
$buttons.Controls.Add($applyButton)

$closeButton = [System.Windows.Forms.Button]::new()
$closeButton.AutoSize = $true
$closeButton.Text = '关闭'
$closeButton.Padding = [System.Windows.Forms.Padding]::new(8, 3, 8, 3)
$buttons.Controls.Add($closeButton)
$form.CancelButton = $closeButton

$studioState = @{
  Sidebar = @{ Info = $null; Preview = $null }
  Workspace = @{ Info = $null; Preview = $null }
}

function Show-DreamSkinStudioError {
  param([Parameter(Mandatory = $true)][string]$Message)
  [void][System.Windows.Forms.MessageBox]::Show(
    $form,
    $Message,
    'Codex Dream Skin - Split Theme Studio',
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  )
}

function Get-DreamSkinStudioPane {
  param([ValidateSet('Sidebar', 'Workspace')][string]$Target)
  if ($Target -eq 'Sidebar') { return $sidebarPane }
  return $workspacePane
}

function Update-DreamSkinStudioStatus {
  $workspace = $studioState.Workspace.Info
  $sidebar = $studioState.Sidebar.Info
  $applyButton.Enabled = $null -ne $workspace
  if ($null -eq $workspace) {
    $statusLabel.Text = '请至少选择右侧工作区图片。'
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(82, 82, 91)
    return
  }
  $total = [long]$workspace.Bytes + $(if ($null -ne $sidebar) { [long]$sidebar.Bytes } else { 0 })
  if ($total -gt 16MB) {
    $statusLabel.Text = '两张图片合计超过 16 MB，请更换或压缩图片。'
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
    $applyButton.Enabled = $false
    return
  }
  $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(22, 101, 52)
  $statusLabel.Text = if ($null -ne $sidebar) {
    '双分区图片已通过安全校验，可以应用。'
  } else {
    '工作区图片已通过校验；当前将使用兼容的单图模式。'
  }
}

function Clear-DreamSkinStudioSelection {
  param([ValidateSet('Sidebar', 'Workspace')][string]$Target)
  $pane = Get-DreamSkinStudioPane -Target $Target
  $state = $studioState[$Target]
  if ($null -ne $state.Preview) { $state.Preview.Dispose() }
  $state.Info = $null
  $state.Preview = $null
  $pane.Picture.Image = $null
  $pane.InfoLabel.Text = '尚未选择图片'
  $pane.Hint.Visible = $true
  $pane.Hint.BringToFront()
  Update-DreamSkinStudioStatus
}

function Set-DreamSkinStudioSelection {
  param(
    [ValidateSet('Sidebar', 'Workspace')][string]$Target,
    [Parameter(Mandatory = $true)][string]$Path
  )
  $pane = Get-DreamSkinStudioPane -Target $Target
  $state = $studioState[$Target]
  $info = Get-DreamSkinStudioImageInfo -Path $Path
  $preview = $null
  $previewMessage = $null
  if ($info.Pixels -gt $script:DreamSkinStudioPreviewPixelLimit) {
    $previewMessage = '已通过校验；超过 2400 万像素时不生成预览。'
  } else {
    try { $preview = New-DreamSkinStudioPreview -Info $info -Role $Target } catch {
      $previewMessage = '已通过校验，但 Windows 无法预览此格式。'
    }
  }

  if ($null -ne $state.Preview) { $state.Preview.Dispose() }
  $state.Info = $info
  $state.Preview = $preview
  $pane.Picture.Image = $preview
  $format = $info.Extension.TrimStart('.').ToUpperInvariant()
  $pane.InfoLabel.Text = '{0} × {1} · {2} · {3:N2} MB · {4}' -f `
    $info.Width, $info.Height, $format, ($info.Bytes / 1MB), `
    [System.IO.Path]::GetFileName($info.Path)
  if ($null -ne $preview) {
    $pane.Hint.Visible = $false
  } else {
    $pane.Hint.Text = $previewMessage
    $pane.Hint.Visible = $true
    $pane.Hint.BringToFront()
  }
  if ($Target -eq 'Workspace') {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($info.Path).Trim()
    if ($name.Length -gt 80) { $name = $name.Substring(0, 80) }
    $nameBox.Text = $name
  }
  Update-DreamSkinStudioStatus
}

function Select-DreamSkinStudioFile {
  param([ValidateSet('Sidebar', 'Workspace')][string]$Target)
  $dialog = [System.Windows.Forms.OpenFileDialog]::new()
  $dialog.Title = if ($Target -eq 'Sidebar') { '选择左侧任务栏图片' } else { '选择右侧工作区图片' }
  $dialog.Filter = 'Image files|*.png;*.jpg;*.jpeg;*.webp|All files|*.*'
  $dialog.Multiselect = $false
  $dialog.CheckFileExists = $true
  $current = $studioState[$Target].Info
  $dialog.InitialDirectory = if ($null -ne $current) {
    [System.IO.Path]::GetDirectoryName($current.Path)
  } else {
    [Environment]::GetFolderPath('MyPictures')
  }
  try {
    if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
      Set-DreamSkinStudioSelection -Target $Target -Path $dialog.FileName
    }
  } finally {
    $dialog.Dispose()
  }
}

function Add-DreamSkinStudioDropHandlers {
  param(
    [ValidateSet('Sidebar', 'Workspace')][string]$Target,
    [Parameter(Mandatory = $true)][object[]]$Controls
  )
  $dragEnter = {
    param($sender, $eventArgs)
    $eventArgs.Effect = [System.Windows.Forms.DragDropEffects]::None
    if ($eventArgs.Data.GetDataPresent([System.Windows.Forms.DataFormats]::FileDrop)) {
      $files = @($eventArgs.Data.GetData([System.Windows.Forms.DataFormats]::FileDrop))
      if ($files.Count -eq 1) { $eventArgs.Effect = [System.Windows.Forms.DragDropEffects]::Copy }
    }
  }
  $dragDrop = {
    param($sender, $eventArgs)
    try {
      $files = @($eventArgs.Data.GetData([System.Windows.Forms.DataFormats]::FileDrop))
      if ($files.Count -ne 1) { throw '请一次拖放一张图片。' }
      Set-DreamSkinStudioSelection -Target $Target -Path $files[0]
    } catch {
      Show-DreamSkinStudioError -Message $_.Exception.Message
    }
  }.GetNewClosure()
  foreach ($control in $Controls) {
    $control.AllowDrop = $true
    $control.add_DragEnter($dragEnter)
    $control.add_DragDrop($dragDrop)
  }
}

$sidebarPane.SelectButton.add_Click({
  try { Select-DreamSkinStudioFile -Target Sidebar } catch {
    Show-DreamSkinStudioError -Message $_.Exception.Message
  }
})
$workspacePane.SelectButton.add_Click({
  try { Select-DreamSkinStudioFile -Target Workspace } catch {
    Show-DreamSkinStudioError -Message $_.Exception.Message
  }
})
$sidebarPane.ClearButton.add_Click({ Clear-DreamSkinStudioSelection -Target Sidebar })
$sidebarPane.Picture.add_Click({
  try { Select-DreamSkinStudioFile -Target Sidebar } catch {
    Show-DreamSkinStudioError -Message $_.Exception.Message
  }
})
$workspacePane.Picture.add_Click({
  try { Select-DreamSkinStudioFile -Target Workspace } catch {
    Show-DreamSkinStudioError -Message $_.Exception.Message
  }
})
$closeButton.add_Click({ $form.Close() })

Add-DreamSkinStudioDropHandlers -Target Sidebar -Controls @(
  $sidebarPane.Group, $sidebarPane.Panel, $sidebarPane.Picture, $sidebarPane.Hint
)
Add-DreamSkinStudioDropHandlers -Target Workspace -Controls @(
  $workspacePane.Group, $workspacePane.Panel, $workspacePane.Picture, $workspacePane.Hint
)

$applyButton.add_Click({
  $operationLock = $null
  try {
    $workspace = $studioState.Workspace.Info
    $sidebar = $studioState.Sidebar.Info
    if ($null -eq $workspace) { throw '请先选择右侧工作区图片。' }
    $name = $nameBox.Text.Trim()
    if (-not $name -or $name.Length -gt 80 -or $name -match '[\u0000-\u001f]') {
      throw '主题名称必须包含 1 到 80 个可见字符。'
    }
    $total = [long]$workspace.Bytes + $(if ($null -ne $sidebar) { [long]$sidebar.Bytes } else { 0 })
    if ($total -gt 16MB) { throw '两张图片合计不能超过 16 MB。' }

    $applyButton.Enabled = $false
    $statusLabel.Text = '正在重新校验并应用分区主题…'
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(82, 82, 91)
    [System.Windows.Forms.Application]::DoEvents()
    $operationLock = Enter-DreamSkinOperationLock
    $active = Set-DreamSkinActiveTheme -ImagePath $workspace.Path `
      -SidebarImagePath $(if ($null -ne $sidebar) { $sidebar.Path } else { $null }) `
      -Theme $null -Name $name -StateRoot $StateRoot
    $saved = $null
    if ($saveBox.Checked) {
      $saved = Save-DreamSkinCurrentTheme -Name $name -StateRoot $StateRoot
    }
    Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(22, 101, 52)
    $mode = if ($active.SidebarImagePath) { '双分区主题' } else { '单图主题' }
    $statusLabel.Text = if ($null -ne $saved) {
      "已应用并保存${mode}：$($saved.Theme.name)"
    } else {
      "已应用${mode}：$($active.Theme.name)"
    }
  } catch {
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(185, 28, 28)
    $statusLabel.Text = '应用失败；活动主题保持在最后一次成功状态。'
    Show-DreamSkinStudioError -Message $_.Exception.Message
  } finally {
    if ($null -ne $operationLock) { Exit-DreamSkinOperationLock -Mutex $operationLock }
    Update-DreamSkinStudioStatus
  }
})

$form.add_FormClosed({
  foreach ($target in @('Sidebar', 'Workspace')) {
    $preview = $studioState[$target].Preview
    if ($null -ne $preview) { $preview.Dispose() }
  }
})
$form.add_Shown({
  [CodexDreamSkin.StudioWindow]::Show($form.Handle)
  if ($SidebarImagePath) {
    try { Set-DreamSkinStudioSelection -Target Sidebar -Path $SidebarImagePath } catch {
      Show-DreamSkinStudioError -Message $_.Exception.Message
    }
  }
  if ($ImagePath) {
    try { Set-DreamSkinStudioSelection -Target Workspace -Path $ImagePath } catch {
      Show-DreamSkinStudioError -Message $_.Exception.Message
    }
  }
  $form.Activate()
})

[System.Windows.Forms.Application]::Run($form)
