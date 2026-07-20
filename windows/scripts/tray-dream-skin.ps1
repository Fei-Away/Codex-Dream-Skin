[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$AutoApply
)

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

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Tray")
$acquired = $false
try {
  try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { exit 0 }

  $trayIcon = $null
  $trayIconPath = Join-Path $SkillRoot 'assets\dream-skin.ico'
  $notify = [System.Windows.Forms.NotifyIcon]::new()
  if (Test-Path -LiteralPath $trayIconPath -PathType Leaf) {
    try {
      $trayIcon = [System.Drawing.Icon]::new($trayIconPath)
      $notify.Icon = $trayIcon
    } catch {
      $notify.Icon = [System.Drawing.SystemIcons]::Application
    }
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
    $argumentLine = '-NoProfile -ExecutionPolicy RemoteSigned -File ' + $scriptToken
    if ($Arguments.Count -gt 0) { $argumentLine += ' ' + ($Arguments -join ' ') }
    return Start-Process -FilePath $powershell -ArgumentList $argumentLine -WindowStyle Hidden -PassThru
  }

  $script:autoApplyProcess = $null
  $script:lastAutoApplyAt = [DateTime]::MinValue
  $script:autoApplyStartedAt = [DateTime]::MinValue
  $script:autoApplyPort = $Port

  function Get-DreamSkinTrayPort {
    $state = $null
    try { $state = Read-DreamSkinState -Path $paths.State } catch {}
    if ($null -ne $state -and $state.port) {
      $statePort = 0
      if ([int]::TryParse("$($state.port)", [ref]$statePort)) {
        try {
          Assert-DreamSkinPort -Port $statePort
          return $statePort
        } catch {}
      }
    }
    return $Port
  }

  function Test-DreamSkinCodexNeedsAutoApply {
    param([Parameter(Mandatory = $true)][object]$Codex)
    $processes = @(Get-DreamSkinCodexProcesses -Codex $Codex)
    foreach ($process in $processes) {
      $commandLine = "$($process.CommandLine)"
      if (-not $commandLine) { continue }
      $isMainCodexWindow = $commandLine.IndexOf(' --type=', [System.StringComparison]::OrdinalIgnoreCase) -lt 0
      $hasDebugPort = $commandLine.IndexOf('--remote-debugging-port', [System.StringComparison]::OrdinalIgnoreCase) -ge 0
      if ($isMainCodexWindow -and -not $hasDebugPort) { return $true }
    }
    return $false
  }

  function Invoke-DreamSkinAutoApply {
    if (-not $AutoApply -or (Test-DreamSkinPaused -StateRoot $StateRoot)) { return }
    if ($null -ne $script:autoApplyProcess) {
      if (-not $script:autoApplyProcess.HasExited) {
        if ((Get-Date) -lt $script:autoApplyStartedAt.AddSeconds(120)) { return }
        try { Stop-Process -Id $script:autoApplyProcess.Id -Force -ErrorAction Stop } catch {}
        Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
        $notify.ShowBalloonTip(3000, 'Codex Dream Skin', '自动接管超时，已暂停以避免反复重启。', [System.Windows.Forms.ToolTipIcon]::Warning)
        $script:autoApplyProcess = $null
        return
      }

      $exitCode = $script:autoApplyProcess.ExitCode
      try { $script:autoApplyProcess.Dispose() } catch {}
      $script:autoApplyProcess = $null
      $codexAfter = $null
      try { $codexAfter = Get-DreamSkinCodexInstall } catch {}
      $identityAfter = if ($null -ne $codexAfter) {
        Get-DreamSkinVerifiedCdpIdentity -Port $script:autoApplyPort -Codex $codexAfter
      } else {
        $null
      }
      if ($exitCode -ne 0 -or $null -eq $identityAfter) {
        Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
        $notify.ShowBalloonTip(3000, 'Codex Dream Skin', '自动接管失败，已暂停以避免反复重启。', [System.Windows.Forms.ToolTipIcon]::Warning)
      } else {
        $notify.ShowBalloonTip(1800, 'Codex Dream Skin', '已自动应用皮肤。', [System.Windows.Forms.ToolTipIcon]::Info)
      }
      return
    }
    if ((Get-Date) -lt $script:lastAutoApplyAt.AddSeconds(1)) { return }

    $codex = $null
    try { $codex = Get-DreamSkinCodexInstall } catch { return }
    if ($null -eq $codex) { return }
    if (-not (Test-DreamSkinCodexNeedsAutoApply -Codex $codex)) { return }

    $effectivePort = Get-DreamSkinTrayPort
    if ($null -ne (Get-DreamSkinVerifiedCdpIdentity -Port $effectivePort -Codex $codex)) { return }
    if (-not (Test-DreamSkinPortAvailable -Port $effectivePort) -and
      -not (Test-DreamSkinCodexPortOwner -Port $effectivePort -Codex $codex)) {
      try {
        $effectivePort = Select-DreamSkinPort -PreferredPort $Port
      } catch {
        return
      }
    }

    $script:lastAutoApplyAt = Get-Date
    $script:autoApplyStartedAt = $script:lastAutoApplyAt
    $script:autoApplyPort = $effectivePort
    $script:autoApplyProcess = Start-DreamSkinPowerShell -Script $startScript -Arguments @(
      '-Port', "$effectivePort", '-RestartExisting', '-FastRestart'
    )
  }

  function Add-DreamSkinTrayItem {
    param(
      [Parameter(Mandatory = $true)][AllowEmptyCollection()][System.Windows.Forms.ToolStripItemCollection]$Items,
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
      $null = Start-DreamSkinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
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
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text '完全恢复 Codex' -Action {
      $null = Start-DreamSkinPowerShell -Script $restoreScript -Arguments @(
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
      $null = Start-DreamSkinPowerShell -Script $startScript -Arguments @('-Port', "$Port", '-PromptRestart')
    } catch {
      Show-DreamSkinTrayError -Message $_.Exception.Message
    }
  })
  if ($AutoApply) {
    $timer = [System.Windows.Forms.Timer]::new()
    $timer.Interval = 250
    $timer.add_Tick({
      try { Invoke-DreamSkinAutoApply } catch {}
    })
    $timer.Start()
  }
  [System.Windows.Forms.Application]::Run()
} finally {
  if ($null -ne $timer) {
    $timer.Stop()
    $timer.Dispose()
  }
  if ($null -ne $notify) { $notify.Dispose() }
  if ($null -ne $trayIcon) { $trayIcon.Dispose() }
  if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
  $mutex.Dispose()
}
