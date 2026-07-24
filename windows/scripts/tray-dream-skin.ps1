[CmdletBinding()]
param([int]$Port = 9335)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

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
    $notify.Icon = [System.Drawing.SystemIcons]::Application
  }
  $notify.Text = 'Codex Dream Skin'
  $notify.Visible = $true
  $menu = [System.Windows.Forms.ContextMenuStrip]::new()
  $notify.ContextMenuStrip = $menu

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
    $argumentLine = '-NoProfile -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' + $scriptToken
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
      [bool]$Enabled = $true,
      [bool]$Checked = $false
    )
    $item = [System.Windows.Forms.ToolStripMenuItem]::new($Text)
    $item.Enabled = $Enabled
    $item.Checked = $Checked
    if ($null -ne $Action) {
      $item.add_Click({
        try { & $Action } catch { Show-DreamSkinTrayError -Message $_.Exception.Message }
      }.GetNewClosure())
    }
    [void]$Items.Add($item)
    return $item
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
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '导入主题 ZIP…' -Action {
      $dialog = [System.Windows.Forms.OpenFileDialog]::new()
      $dialog.Title = '选择 Codex Dream Skin 主题 ZIP'
      $dialog.Filter = 'Dream Skin theme ZIP|*.zip'
      $dialog.Multiselect = $false
      try {
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          $imported = Import-DreamSkinThemeZip -ArchivePath $dialog.FileName -StateRoot $StateRoot
          if ($imported.Status -ceq 'Duplicate') {
            $message = "主题已存在：$($imported.Name)。没有重复写入。"
          } else {
            $message = "已导入：$($imported.Name)。当前主题没有改变。"
            if ($imported.Renamed) { $message += " 新标识：$($imported.Id)。" }
            if ($imported.NameCollision) { $message += ' 主题库中已有同名主题。' }
          }
          if ($imported.CssIgnored) { $message += ' 已保留 theme.css，但当前客户端不会执行自定义 CSS。' }
          if ($imported.SignatureIgnored) { $message += ' manifest.sig 是预留文件，当前版本已忽略。' }
          $notify.ShowBalloonTip(3200, 'Codex Dream Skin', $message, [System.Windows.Forms.ToolTipIcon]::Info)
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

    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '打开主题文件夹' -Action {
      $themeDirectoryToken = ConvertTo-DreamSkinProcessArgument -Value $paths.Saved
      Start-Process -FilePath explorer.exe -ArgumentList $themeDirectoryToken | Out-Null
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '打开图片文件夹' -Action {
      $imageDirectoryToken = ConvertTo-DreamSkinProcessArgument -Value $paths.Images
      Start-Process -FilePath explorer.exe -ArgumentList $imageDirectoryToken | Out-Null
    }
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '检查更新…' -Action {
      Start-DreamSkinPowerShell -Script $checkUpdateScript -Arguments @('-Interactive')
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '主题库 Gallery' -Action {
      Start-Process -FilePath 'https://dreamskin.cc/gallery' | Out-Null
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '在线 Studio' -Action {
      Start-Process -FilePath 'https://dreamskin.cc/studio' | Out-Null
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '打开 DreamSkin.cc' -Action {
      Start-Process -FilePath 'https://dreamskin.cc' | Out-Null
    }
    $autoStartEnabled = Test-Path -LiteralPath $startupShortcut -PathType Leaf
    $autoStartAction = {
      Set-DreamSkinAutoStart -Enabled:(-not $autoStartEnabled)
    }.GetNewClosure()
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '登录时启动' `
      -Action $autoStartAction -Checked $autoStartEnabled
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '完全恢复 Codex' -Action {
      Start-DreamSkinPowerShell -Script $restoreScript -Arguments @(
        '-Port', "$Port", '-RestoreBaseTheme', '-PromptRestart'
      )
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
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
  if ($null -ne $notify) { $notify.Dispose() }
  if ($null -ne $trayIcon) { $trayIcon.Dispose() }
  if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
  $mutex.Dispose()
}
