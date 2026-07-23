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

if (-not ('DreamSkin.TrayRenderer' -as [type])) {
  Add-Type -ReferencedAssemblies @(
    [System.Windows.Forms.NotifyIcon].Assembly.Location,
    [System.Drawing.Bitmap].Assembly.Location
  ) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DreamSkin {
  public static class NativeMethods {
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr handle);
  }

  public sealed class TrayColorTable : ProfessionalColorTable {
    private static readonly Color Surface = Color.FromArgb(255, 255, 255, 255);
    private static readonly Color Selected = Color.FromArgb(255, 243, 244, 246);
    private static readonly Color Accent = Color.FromArgb(255, 37, 99, 235);
    private static readonly Color Border = Color.FromArgb(255, 218, 222, 229);
    private static readonly Color Divider = Color.FromArgb(255, 218, 228, 242);

    public override Color ToolStripDropDownBackground { get { return Surface; } }
    public override Color ImageMarginGradientBegin { get { return Surface; } }
    public override Color ImageMarginGradientMiddle { get { return Surface; } }
    public override Color ImageMarginGradientEnd { get { return Surface; } }
    public override Color MenuItemSelected { get { return Selected; } }
    public override Color MenuItemBorder { get { return Accent; } }
    public override Color MenuBorder { get { return Border; } }
    public override Color SeparatorDark { get { return Divider; } }
    public override Color SeparatorLight { get { return Color.Transparent; } }
    public override Color CheckBackground { get { return Selected; } }
    public override Color CheckSelectedBackground { get { return Selected; } }
    public override Color CheckPressedBackground { get { return Selected; } }
  }

  public sealed class TrayMenu : ContextMenuStrip {
    private static GraphicsPath RoundedRectangle(Rectangle bounds, int radius) {
      GraphicsPath path = new GraphicsPath();
      int diameter = radius * 2;
      Rectangle arc = new Rectangle(bounds.Location, new Size(diameter, diameter));
      path.AddArc(arc, 180, 90);
      arc.X = bounds.Right - diameter;
      path.AddArc(arc, 270, 90);
      arc.Y = bounds.Bottom - diameter;
      path.AddArc(arc, 0, 90);
      arc.X = bounds.Left;
      path.AddArc(arc, 90, 90);
      path.CloseFigure();
      return path;
    }

    private void ApplyRoundedRegion() {
      if (Width < 2 || Height < 2) return;
      int radius = Math.Max(10, (int)Math.Round(14.0 * DeviceDpi / 96.0));
      using (GraphicsPath path = RoundedRectangle(new Rectangle(0, 0, Width, Height), radius)) {
        Region previous = Region;
        Region = new Region(path);
        if (previous != null) previous.Dispose();
      }
    }

    public TrayMenu() {
      SetStyle(
        ControlStyles.AllPaintingInWmPaint |
        ControlStyles.OptimizedDoubleBuffer |
        ControlStyles.ResizeRedraw,
        true
      );
    }

    protected override void OnHandleCreated(EventArgs e) {
      base.OnHandleCreated(e);
      ApplyRoundedRegion();
    }

    protected override void OnSizeChanged(EventArgs e) {
      base.OnSizeChanged(e);
      ApplyRoundedRegion();
    }

    protected override void Dispose(bool disposing) {
      if (disposing && Region != null) {
        Region.Dispose();
        Region = null;
      }
      base.Dispose(disposing);
    }
  }

  public sealed class TrayRenderer : ToolStripProfessionalRenderer {
    private static GraphicsPath RoundedRectangle(Rectangle bounds, int radius) {
      GraphicsPath path = new GraphicsPath();
      int diameter = radius * 2;
      Rectangle arc = new Rectangle(bounds.Location, new Size(diameter, diameter));
      path.AddArc(arc, 180, 90);
      arc.X = bounds.Right - diameter;
      path.AddArc(arc, 270, 90);
      arc.Y = bounds.Bottom - diameter;
      path.AddArc(arc, 0, 90);
      arc.X = bounds.Left;
      path.AddArc(arc, 90, 90);
      path.CloseFigure();
      return path;
    }

    public TrayRenderer() : base(new TrayColorTable()) {
      RoundedEdges = true;
    }

    protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e) {
      e.Graphics.Clear(Color.White);
    }

    protected override void OnRenderImageMargin(ToolStripRenderEventArgs e) {
      // Keep the menu visually flat. Checks are rendered independently below.
    }

    protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e) {
      if (!e.Item.Selected || !e.Item.Enabled) return;
      Rectangle bounds = new Rectangle(4, 1, Math.Max(1, e.Item.Width - 8), Math.Max(1, e.Item.Height - 2));
      SmoothingMode previous = e.Graphics.SmoothingMode;
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (GraphicsPath path = RoundedRectangle(bounds, 8))
      using (SolidBrush brush = new SolidBrush(Color.FromArgb(255, 243, 244, 246))) {
        e.Graphics.FillPath(brush, path);
      }
      e.Graphics.SmoothingMode = previous;
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e) {
      ToolStripMenuItem menuItem = e.Item as ToolStripMenuItem;
      int rightInset = menuItem != null && menuItem.HasDropDownItems ? 36 : 12;
      Rectangle bounds = new Rectangle(
        16,
        0,
        Math.Max(1, e.Item.Width - 16 - rightInset),
        e.Item.Height
      );
      Color color = e.Item.Enabled
        ? e.Item.ForeColor
        : Color.FromArgb(255, 146, 151, 159);
      TextRenderer.DrawText(
        e.Graphics,
        e.Text,
        e.TextFont,
        bounds,
        color,
        TextFormatFlags.Left |
          TextFormatFlags.VerticalCenter |
          TextFormatFlags.SingleLine |
          TextFormatFlags.NoPrefix
      );
    }

    protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e) {
      int y = e.Item.Height / 2;
      using (Pen pen = new Pen(Color.FromArgb(255, 218, 228, 242), 1.0f)) {
        e.Graphics.DrawLine(pen, 0, y, Math.Max(0, e.Item.Width), y);
      }
    }

    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e) {
      int radius = Math.Max(10, (int)Math.Round(14.0 * e.ToolStrip.DeviceDpi / 96.0));
      Rectangle bounds = new Rectangle(
        0,
        0,
        Math.Max(1, e.ToolStrip.Width - 1),
        Math.Max(1, e.ToolStrip.Height - 1)
      );
      SmoothingMode previous = e.Graphics.SmoothingMode;
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (GraphicsPath path = RoundedRectangle(bounds, radius))
      using (Pen pen = new Pen(Color.FromArgb(255, 218, 222, 229), 1.0f)) {
        e.Graphics.DrawPath(pen, path);
      }
      e.Graphics.SmoothingMode = previous;
    }

    protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e) {
      int centerX = e.ArrowRectangle.Left + (e.ArrowRectangle.Width / 2);
      int centerY = e.ArrowRectangle.Top + (e.ArrowRectangle.Height / 2);
      Color color = e.Item.Enabled
        ? Color.FromArgb(255, 91, 97, 105)
        : Color.FromArgb(255, 183, 188, 196);
      SmoothingMode previous = e.Graphics.SmoothingMode;
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (Pen pen = new Pen(color, 1.6f)) {
        pen.StartCap = LineCap.Round;
        pen.EndCap = LineCap.Round;
        e.Graphics.DrawLines(pen, new Point[] {
          new Point(centerX - 2, centerY - 4),
          new Point(centerX + 2, centerY),
          new Point(centerX - 2, centerY + 4)
        });
      }
      e.Graphics.SmoothingMode = previous;
    }

    protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e) {
      Rectangle box = new Rectangle(e.ImageRectangle.Left + 3, e.ImageRectangle.Top + 3, 16, 16);
      SmoothingMode previous = e.Graphics.SmoothingMode;
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (SolidBrush brush = new SolidBrush(Color.FromArgb(255, 37, 99, 235)))
      using (GraphicsPath path = RoundedRectangle(box, 5))
      using (Pen pen = new Pen(Color.White, 1.8f)) {
        pen.StartCap = LineCap.Round;
        pen.EndCap = LineCap.Round;
        e.Graphics.FillPath(brush, path);
        e.Graphics.DrawLines(pen, new Point[] {
          new Point(box.Left + 4, box.Top + 8),
          new Point(box.Left + 7, box.Top + 11),
          new Point(box.Left + 12, box.Top + 5)
        });
      }
      e.Graphics.SmoothingMode = previous;
    }
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
  $mark = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $paper = $null
  $ink = $null
  $outline = $null
  $dot = $null
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $mark.AddArc(2, 2, 9, 9, 180, 90)
    $mark.AddArc(21, 2, 9, 9, 270, 90)
    $mark.AddArc(21, 21, 9, 9, 0, 90)
    $mark.AddArc(2, 21, 9, 9, 90, 90)
    $mark.CloseFigure()

    $paper = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 253, 253, 252))
    $graphics.FillPath($paper, $mark)
    $graphics.SetClip($mark)
    $ink = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 23, 24, 28))
    $graphics.FillPolygon($ink, [System.Drawing.Point[]]@(
      [System.Drawing.Point]::new(30, 2),
      [System.Drawing.Point]::new(30, 30),
      [System.Drawing.Point]::new(2, 30)
    ))
    $graphics.ResetClip()
    $outline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(118, 23, 24, 28), 1.1)
    $graphics.DrawPath($outline, $mark)
    $dot = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 45, 225, 194))
    $graphics.FillEllipse($dot, 20, 6, 6, 6)

    $handle = $bitmap.GetHicon()
    try {
      $borrowed = [System.Drawing.Icon]::FromHandle($handle)
      try { return [System.Drawing.Icon]$borrowed.Clone() } finally { $borrowed.Dispose() }
    } finally {
      if ($handle -ne [IntPtr]::Zero) {
        [void][DreamSkin.NativeMethods]::DestroyIcon($handle)
      }
    }
  } finally {
    if ($null -ne $dot) { $dot.Dispose() }
    if ($null -ne $outline) { $outline.Dispose() }
    if ($null -ne $ink) { $ink.Dispose() }
    if ($null -ne $paper) { $paper.Dispose() }
    $mark.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Initialize-DreamSkinTrayMenu {
  param([Parameter(Mandatory = $true)][System.Windows.Forms.ContextMenuStrip]$Menu)
  $Menu.Renderer = [DreamSkin.TrayRenderer]::new()
  $Menu.BackColor = [System.Drawing.Color]::White
  $Menu.ForeColor = [System.Drawing.Color]::FromArgb(255, 31, 35, 40)
  $Menu.Font = [System.Drawing.Font]::new('Segoe UI', 9.0)
  $Menu.Padding = [System.Windows.Forms.Padding]::new(5, 5, 5, 5)
  $Menu.AutoSize = $true
  $Menu.DropShadowEnabled = $true
  $Menu.ShowImageMargin = $false
  $Menu.ShowCheckMargin = $false
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

function Add-DreamSkinTrayItem {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [System.Windows.Forms.ToolStripItemCollection]$Items,
    [Parameter(Mandatory = $true)][string]$Text,
    [AllowNull()][scriptblock]$Action,
    [bool]$Enabled = $true,
    [bool]$Checked = $false
  )
  $displayText = if ($Checked) { "✓  $Text" } else { $Text }
  $item = [System.Windows.Forms.ToolStripMenuItem]::new($displayText)
  $item.Enabled = $Enabled
  $item.Checked = $false
  $item.ForeColor = if ($Enabled) {
    [System.Drawing.Color]::FromArgb(255, 31, 35, 40)
  } else {
    [System.Drawing.Color]::FromArgb(255, 146, 151, 159)
  }
  $item.Padding = [System.Windows.Forms.Padding]::new(8, 4, 8, 4)
  $item.Margin = [System.Windows.Forms.Padding]::new(1, 0, 1, 0)
  if ($null -ne $Action) {
    $item.add_Click({
      try { & $Action } catch { Show-DreamSkinTrayError -Message $_.Exception.Message }
    }.GetNewClosure())
  }
  [void]$Items.Add($item)
  return $item
}

function Add-DreamSkinTraySection {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [System.Windows.Forms.ToolStripItemCollection]$Items,
    [Parameter(Mandatory = $true)][string]$Text
  )
  $label = [System.Windows.Forms.ToolStripLabel]::new($Text)
  $label.ForeColor = [System.Drawing.Color]::FromArgb(255, 98, 105, 114)
  $label.Padding = [System.Windows.Forms.Padding]::new(11, 6, 11, 2)
  $label.Font = [System.Drawing.Font]::new('Segoe UI', 8.25, [System.Drawing.FontStyle]::Regular)
  [void]$Items.Add($label)
  return $label
}

function Clear-DreamSkinTrayItems {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [System.Windows.Forms.ToolStripItemCollection]$Items
  )
  $previousItems = @($Items)
  $Items.Clear()
  foreach ($item in $previousItems) { $item.Dispose() }
}

if ($SelfTest) {
  $testMenu = [DreamSkin.TrayMenu]::new()
  $testIcon = $null
  try {
    Initialize-DreamSkinTrayMenu -Menu $testMenu
    $null = Add-DreamSkinTraySection -Items $testMenu.Items -Text 'Dream Skin'
    $null = Add-DreamSkinTrayItem -Items $testMenu.Items -Text 'Self test' -Action $null
    $testSubmenu = [System.Windows.Forms.ToolStripMenuItem]::new('Themes')
    $testDropDown = [DreamSkin.TrayMenu]::new()
    Initialize-DreamSkinTrayMenu -Menu $testDropDown
    $testSubmenu.DropDown = $testDropDown
    $null = Add-DreamSkinTrayItem -Items $testSubmenu.DropDownItems -Text 'Example' -Action $null
    [void]$testMenu.Items.Add($testSubmenu)
    $testMenu.PerformLayout()
    $null = $testMenu.Handle
    if (
      $testMenu.Items.Count -ne 3 -or
      $testMenu.GetType().FullName -cne 'DreamSkin.TrayMenu' -or
      $testMenu.Renderer.GetType().FullName -cne 'DreamSkin.TrayRenderer' -or
      $testSubmenu.DropDown.GetType().FullName -cne 'DreamSkin.TrayMenu' -or
      $null -eq $testMenu.Region
    ) {
      throw 'The styled tray menu did not initialize correctly.'
    }
    $testIcon = New-DreamSkinTrayIcon
    if ($null -eq $testIcon -or $testIcon.Width -ne 32 -or $testIcon.Height -ne 32) {
      throw 'The Dream Skin tray fallback icon was not created at 32 x 32.'
    }
    Write-Host 'PASS: branded tray icon and styled empty context menu.'
  } finally {
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
$checkUpdateScript = Join-Path $PSScriptRoot 'check-update.ps1'
$startupShortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Codex Dream Skin.lnk'

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Tray")
$acquired = $false
$notify = $null
$trayIcon = $null
try {
  try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { exit 0 }

  $notify = [System.Windows.Forms.NotifyIcon]::new()
  $iconPath = Join-Path $SkillRoot 'assets\codex-dream-skin.ico'
  if (Test-Path -LiteralPath $iconPath -PathType Leaf) {
    $trayIcon = [System.Drawing.Icon]::new($iconPath)
    $notify.Icon = $trayIcon
  } else {
    $trayIcon = New-DreamSkinTrayIcon
    $notify.Icon = $trayIcon
  }
  $notify.Text = 'Codex Dream Skin'
  $notify.Visible = $true
  $menu = [DreamSkin.TrayMenu]::new()
  Initialize-DreamSkinTrayMenu -Menu $menu
  $notify.ContextMenuStrip = $menu

  function Start-DreamSkinPowerShell {
    param([Parameter(Mandatory = $true)][string]$Script, [string[]]$Arguments = @())
    $scriptToken = ConvertTo-DreamSkinProcessArgument -Value $Script
    $argumentLine = '-NoProfile -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' + $scriptToken
    if ($Arguments.Count -gt 0) { $argumentLine += ' ' + ($Arguments -join ' ') }
    Start-Process -FilePath $powershell -ArgumentList $argumentLine -WindowStyle Hidden | Out-Null
  }

  function Set-DreamSkinAutoStart {
    param([Parameter(Mandatory = $true)][bool]$Enabled)
    if (-not $Enabled) {
      Remove-Item -LiteralPath $startupShortcut -Force -ErrorAction SilentlyContinue
      return
    }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($startupShortcut)
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = "-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File `"$PSScriptRoot\tray-dream-skin.ps1`""
    $shortcut.WorkingDirectory = $SkillRoot
    $shortcut.Description = 'Start Codex Dream Skin in the notification area'
    $shortcut.Save()
  }

  function Rebuild-DreamSkinTrayMenu {
    Clear-DreamSkinTrayItems -Items $menu.Items
    $paused = Test-DreamSkinPaused -StateRoot $StateRoot
    $state = $null
    try { $state = Read-DreamSkinState -Path $paths.State } catch {}
    $active = $null
    try { $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata } catch {}
    $status = if ($paused) { '已暂停' } elseif ($state) { '运行中' } else { '未运行' }
    if ($null -ne $active -and $null -ne $active.Theme -and $active.Theme.name) {
      $status += " · $($active.Theme.name)"
    }
    $brandLabel = [System.Windows.Forms.ToolStripLabel]::new('Codex Dream Skin')
    $brandLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 31, 35, 40)
    $brandLabel.Padding = [System.Windows.Forms.Padding]::new(11, 8, 11, 1)
    $brandLabel.Font = [System.Drawing.Font]::new('Segoe UI', 9.25, [System.Drawing.FontStyle]::Regular)
    [void]$menu.Items.Add($brandLabel)

    $statusLabel = [System.Windows.Forms.ToolStripLabel]::new($status)
    $statusLabel.ForeColor = if ($paused) {
      [System.Drawing.Color]::FromArgb(255, 145, 98, 32)
    } elseif ($state) {
      [System.Drawing.Color]::FromArgb(255, 22, 130, 92)
    } else {
      [System.Drawing.Color]::FromArgb(255, 190, 48, 48)
    }
    $statusLabel.Padding = [System.Windows.Forms.Padding]::new(11, 1, 11, 7)
    $statusLabel.Font = [System.Drawing.Font]::new('Segoe UI', 8.25, [System.Drawing.FontStyle]::Regular)
    [void]$menu.Items.Add($statusLabel)
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '应用或重新应用' -Action {
      Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
      $session = Get-DreamSkinLiveSessionContext -StateRoot $StateRoot
      $begin = $null
      if ($null -ne $session) {
        $begin = Show-DreamSkinOperationUi -Session $session -Phase begin -Kind apply -TimeoutMs 3000
      }
      Start-DreamSkinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
      # start-dream-skin is async; close the in-window loading so it does not stick for 180s.
      if ($null -ne $session -and $null -ne $begin -and $begin.Ok) {
        $null = Show-DreamSkinOperationUi -Session $session -Phase finish -Token $begin.Token `
          -UiState success -Message '已开始应用皮肤' -TimeoutMs 1500
      }
      $notify.ShowBalloonTip(1800, 'Codex Dream Skin', '正在应用皮肤…', [System.Windows.Forms.ToolTipIcon]::Info)
    }
    # Match macOS menubar: pause = mark + live remove; resume = clear pause + re-apply.
    if ($paused) {
      $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '继续显示皮肤' -Action {
        # Match macOS: clear pause + apply path; show in-window loading when CDP is up.
        Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
        $session = Get-DreamSkinLiveSessionContext -StateRoot $StateRoot
        $begin = $null
        if ($null -ne $session) {
          $begin = Show-DreamSkinOperationUi -Session $session -Phase begin -Kind apply -TimeoutMs 3000
        }
        Start-DreamSkinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
        if ($null -ne $session -and $null -ne $begin -and $begin.Ok) {
          $null = Show-DreamSkinOperationUi -Session $session -Phase finish -Token $begin.Token `
            -UiState success -Message '已开始重新应用皮肤' -TimeoutMs 1500
        }
        $notify.ShowBalloonTip(
          1800,
          'Codex Dream Skin',
          '正在重新应用皮肤…',
          [System.Windows.Forms.ToolTipIcon]::Info
        )
      }
    } else {
      $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '暂停皮肤' -Action {
        # Match macOS pause: marker + live remove with in-window loading / result.
        Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
        $removal = Invoke-DreamSkinLiveRemove -StateRoot $StateRoot
        $icon = if ($removal.Removed) {
          [System.Windows.Forms.ToolTipIcon]::Info
        } else {
          [System.Windows.Forms.ToolTipIcon]::Warning
        }
        $notify.ShowBalloonTip(2800, 'Codex Dream Skin', $removal.Message, $icon)
        if (-not $removal.Removed -and $removal.Attempted) {
          Show-DreamSkinTrayError -Message $removal.Message
        }
      }
    }
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
    $savedMenu.ForeColor = [System.Drawing.Color]::FromArgb(255, 31, 35, 40)
    $savedMenu.Padding = [System.Windows.Forms.Padding]::new(8, 4, 8, 4)
    $savedMenu.Margin = [System.Windows.Forms.Padding]::new(1, 0, 1, 0)
    $savedDropDown = [DreamSkin.TrayMenu]::new()
    Initialize-DreamSkinTrayMenu -Menu $savedDropDown
    $savedMenu.DropDown = $savedDropDown
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

    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '打开图片文件夹' -Action {
      $imageDirectoryToken = ConvertTo-DreamSkinProcessArgument -Value $paths.Images
      Start-Process -FilePath explorer.exe -ArgumentList $imageDirectoryToken | Out-Null
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '检查更新…' -Action {
      Start-DreamSkinPowerShell -Script $checkUpdateScript -Arguments @('-Interactive')
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '打开 DreamSkin Studio' -Action {
      Start-Process -FilePath 'https://www.dreamskin.cc/studio' | Out-Null
    }
    $autoStartEnabled = Test-Path -LiteralPath $startupShortcut -PathType Leaf
    $autoStartAction = {
      Set-DreamSkinAutoStart -Enabled:(-not $autoStartEnabled)
    }.GetNewClosure()
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '登录时启动' `
      -Action $autoStartAction -Checked $autoStartEnabled
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
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
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
