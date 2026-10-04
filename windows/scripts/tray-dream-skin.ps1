[CmdletBinding()]
param([int]$Port = 9335, [switch]$ShowWindow)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
. (Join-Path $PSScriptRoot 'localization-windows.ps1')
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

Assert-DreamSkinPort -Port $Port
$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$paths = $null
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
$restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
$checkUpdateScript = Join-Path $PSScriptRoot 'check-update.ps1'
$startupShortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Codex Dream Skin.lnk'

$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Tray")
$showEvent = [System.Threading.EventWaitHandle]::new($false,
  [System.Threading.EventResetMode]::AutoReset, "Local\CodexDreamSkin.$sid.ShowWindow")
$acquired = $false
$notify = $null
$trayIcon = $null
try {
  try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) {
    if ($ShowWindow) { [void]$showEvent.Set() }
    exit 0
  }

  $initializationLock = Enter-DreamSkinOperationLock
  try {
    $paths = Initialize-DreamSkinThemeStore -SkillRoot $SkillRoot -StateRoot $StateRoot
  } finally {
    Exit-DreamSkinOperationLock -Mutex $initializationLock
  }

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

  function Get-DreamSkinTrayText {
    param(
      [Parameter(Mandatory = $true)][string]$Key,
      [object[]]$FormatArguments = @()
    )
    $language = Resolve-DreamSkinLanguage -StateRoot $StateRoot
    Get-DreamSkinText -Key $Key -Language $language -FormatArguments $FormatArguments
  }

  function Start-DreamSkinPowerShell {
    param([Parameter(Mandatory = $true)][string]$Script, [string[]]$Arguments = @())
    $scriptToken = ConvertTo-DreamSkinProcessArgument -Value $Script
    $argumentLine = '-NoProfile -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' + $scriptToken
    if ($Arguments.Count -gt 0) { $argumentLine += ' ' + ($Arguments -join ' ') }
    $previousLanguage = $env:DREAMSKIN_LANG
    try {
      $env:DREAMSKIN_LANG = Resolve-DreamSkinLanguage -StateRoot $StateRoot
      Start-Process -FilePath $powershell -ArgumentList $argumentLine -WindowStyle Hidden | Out-Null
    } finally {
      $env:DREAMSKIN_LANG = $previousLanguage
    }
  }

  function Set-DreamSkinTrayApplyStatus {
    param([string]$Message, [bool]$Success = $false)
    $script:trayApplyStatus = $Message
    $script:trayApplySucceeded = $Success
  }

  function Complete-DreamSkinTrayApply {
    # Called on the UI timer only after the child exits. A selected theme or
    # a successful process launch is not evidence of rendered appearance.
    $operation = $script:trayApplyOperation
    if ($null -eq $operation) { return }
    $success = $false
    $message = Get-DreamSkinTrayText -Key 'ApplyNotConfirmed'
    try {
      $result = Read-DreamSkinStartResult -StateRoot $StateRoot -Token $operation.Token
      $success = $operation.Process.ExitCode -eq 0 -and $result.outcome -ceq 'success'
      if ($success) {
        $message = Get-DreamSkinTrayText -Key 'Applied' -FormatArguments @($operation.ThemeName)
      } elseif ($result.outcome -ceq 'failure') {
        $message = Get-DreamSkinTrayText -Key 'ApplyFailed' -FormatArguments @($result.category)
      }
    } catch {
      # Missing, malformed, stale and oversized results all fail closed.
    } finally {
      $operation.Timer.Stop()
      $operation.Timer.Dispose()
      $operation.Process.Dispose()
      Remove-Item -LiteralPath $operation.ResultPath -Force -ErrorAction SilentlyContinue
      $script:trayApplyOperation = $null
      $script:trayApplyPending = $false
    }
    Set-DreamSkinTrayApplyStatus -Message $message -Success $success
    $icon = if ($success) { [System.Windows.Forms.ToolTipIcon]::Info } else { [System.Windows.Forms.ToolTipIcon]::Warning }
    $notify.ShowBalloonTip(3500, 'Codex Dream Skin', $message, $icon)
  }

  function Start-DreamSkinVerifiedTrayApply {
    param([string]$ThemeName = '', [string]$ThemeDirectory = '')
    if ($script:trayApplyPending) { return }
    $script:trayApplyPending = $true
    $script:trayApplyOperation = $null
    $process = $null
    $timer = $null
    try {
      if (-not $ThemeName) {
        $selected = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata
        $ThemeName = $selected.Theme.name
      }
      $token = [guid]::NewGuid().ToString('N')
      $resultPath = Get-DreamSkinStartResultPath -StateRoot $StateRoot -Token $token
      if (Test-Path -LiteralPath $resultPath) { throw 'Theme application result token already exists.' }
      $arguments = '-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ' +
        (ConvertTo-DreamSkinProcessArgument -Value $startScript) + ' -Port ' + $Port +
        ' -PromptRestart -ResultToken ' + $token
      if ($ThemeDirectory) {
        $arguments += ' -SavedThemeDirectory ' + (ConvertTo-DreamSkinProcessArgument -Value $ThemeDirectory)
      }
      $timer = [System.Windows.Forms.Timer]::new()
      $timer.Interval = 300
      $timer.add_Tick({
        $operation = $script:trayApplyOperation
        if ($null -eq $operation) { return }
        try {
          $operation.Process.Refresh()
          if ($operation.Process.HasExited) { Complete-DreamSkinTrayApply }
        } catch {
          # Do not report success or permit another selection while the child
          # may still own the operation lock. The next tick retries observation.
          Set-DreamSkinTrayApplyStatus -Message (Get-DreamSkinTrayText -Key 'ApplyWaiting')
        }
      })
      $previousLanguage = $env:DREAMSKIN_LANG
      try {
        $env:DREAMSKIN_LANG = Resolve-DreamSkinLanguage -StateRoot $StateRoot
        $process = Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden -PassThru
      } finally {
        $env:DREAMSKIN_LANG = $previousLanguage
      }
      $script:trayApplyOperation = [pscustomobject]@{
        Process = $process; Timer = $timer; Token = $token; ResultPath = $resultPath; ThemeName = $ThemeName
      }
      $timer.Start()
      Set-DreamSkinTrayApplyStatus -Message (Get-DreamSkinTrayText -Key 'Applying')
    } catch {
      if ($null -ne $timer) { $timer.Stop(); $timer.Dispose() }
      if ($null -ne $process) { $process.Dispose() }
      $script:trayApplyOperation = $null
      $script:trayApplyPending = $false
      Set-DreamSkinTrayApplyStatus -Message (Get-DreamSkinTrayText -Key 'ApplyCouldNotStart')
      throw
    }
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

  function Add-DreamSkinTrayLanguageMenu {
    $preference = Get-DreamSkinLanguagePreference -StateRoot $StateRoot
    $languageMenu = [System.Windows.Forms.ToolStripMenuItem]::new(
      (Get-DreamSkinTrayText -Key 'Language')
    )
    foreach ($option in @(
      @{ Value = 'system'; Label = (Get-DreamSkinTrayText -Key 'LanguageSystem') },
      @{ Value = 'en-US'; Label = (Get-DreamSkinTrayText -Key 'LanguageEnglish') },
      @{ Value = 'zh-CN'; Label = (Get-DreamSkinTrayText -Key 'LanguageChinese') }
    )) {
      $optionValue = $option.Value
      $optionAction = {
        Set-DreamSkinLanguage -Language $optionValue -StateRoot $StateRoot
        Rebuild-DreamSkinTrayMenu
      }.GetNewClosure()
      $optionItem = Add-DreamSkinTrayItem -Items $languageMenu.DropDownItems -Text $option.Label -Action $optionAction
      $optionItem.Checked = $preference -ceq $optionValue
    }
    [void]$menu.Items.Add($languageMenu)
  }

  function Invoke-DreamSkinTrayThemeOperation {
    param([Parameter(Mandatory = $true)][scriptblock]$Action)
    $themeOperationLock = Enter-DreamSkinOperationLock
    try {
      return & $Action
    } finally {
      Exit-DreamSkinOperationLock -Mutex $themeOperationLock
    }
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
    $status = if ($paused) {
      Get-DreamSkinTrayText -Key 'StatusPaused'
    } elseif ($state) {
      Get-DreamSkinTrayText -Key 'StatusRunning'
    } else {
      Get-DreamSkinTrayText -Key 'StatusStopped'
    }
    if ($null -ne $active -and $null -ne $active.Theme -and $active.Theme.name) {
      $status += " · $($active.Theme.name)"
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text $status -Action $null -Enabled $false
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Apply') -Action {
      Start-DreamSkinVerifiedTrayApply
    }
    # Match macOS menubar: pause = mark + live remove; resume lets the serialized
    # start path clear pause only after its safety checks and any restart consent.
    if ($paused) {
      $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Resume') -Action {
        Start-DreamSkinVerifiedTrayApply
      }
    } else {
      $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Pause') -Action {
        # Match macOS pause: marker + live remove with in-window loading / result.
        $pauseNoSessionMessage = Get-DreamSkinTrayText -Key 'PauseNoSession'
        $pauseSucceededMessage = Get-DreamSkinTrayText -Key 'PauseSucceeded'
        $pauseFailedMessage = Get-DreamSkinTrayText -Key 'PauseFailed'
        $removal = Invoke-DreamSkinTrayThemeOperation -Action {
          Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
          Invoke-DreamSkinLiveRemove -StateRoot $StateRoot `
            -PauseNoSessionMessage $pauseNoSessionMessage `
            -PauseSucceededMessage $pauseSucceededMessage `
            -PauseFailedMessage $pauseFailedMessage
        }
        $icon = if ($removal.Removed) {
          [System.Windows.Forms.ToolTipIcon]::Info
        } else {
          [System.Windows.Forms.ToolTipIcon]::Warning
        }
        $removalMessage = $removal.Message
        $notify.ShowBalloonTip(2800, 'Codex Dream Skin', $removalMessage, $icon)
        if (-not $removal.Removed -and $removal.Attempted) {
          Show-DreamSkinTrayError -Message $removalMessage
        }
      }
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'ChangeBackground') -Action {
      $dialog = [System.Windows.Forms.OpenFileDialog]::new()
      $dialog.Title = Get-DreamSkinTrayText -Key 'BackgroundTitle'
      $dialog.Filter = Get-DreamSkinTrayText -Key 'ImageFilter'
      $dialog.Multiselect = $false
      try {
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          $null = Invoke-DreamSkinTrayThemeOperation -Action {
            $null = Set-DreamSkinActiveThemeImage -ImagePath $dialog.FileName `
              -StateRoot $StateRoot
            Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
          }
          $notify.ShowBalloonTip(1800, 'Codex Dream Skin', (Get-DreamSkinTrayText -Key 'BackgroundUpdated'), [System.Windows.Forms.ToolTipIcon]::Info)
        }
      } finally {
        $dialog.Dispose()
      }
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'ImportZip') -Action {
      $dialog = [System.Windows.Forms.OpenFileDialog]::new()
      $dialog.Title = Get-DreamSkinTrayText -Key 'ImportTitle'
      $dialog.Filter = 'Dream Skin theme ZIP|*.zip'
      $dialog.Multiselect = $false
      try {
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
          $imported = Import-DreamSkinThemeZip -ArchivePath $dialog.FileName -StateRoot $StateRoot
          if ($imported.Status -ceq 'Duplicate') {
            $message = Get-DreamSkinTrayText -Key 'ThemeExists' -FormatArguments @($imported.Name)
          } elseif ($imported.Replaced) {
            $message = Get-DreamSkinTrayText -Key 'ThemeUpdated' -FormatArguments @($imported.Name)
          } else {
            $message = Get-DreamSkinTrayText -Key 'ThemeImported' -FormatArguments @($imported.Name)
            if ($imported.Renamed) {
              $message += Get-DreamSkinTrayText -Key 'NewIdentifier' -FormatArguments @($imported.Id)
            }
            if ($imported.NameCollision) { $message += Get-DreamSkinTrayText -Key 'NameCollision' }
          }
          if ($imported.SafeCssStatus -ceq 'validated') {
            $message += Get-DreamSkinTrayText -Key 'CssValidated'
          }
          if ($imported.SignatureIgnored) { $message += Get-DreamSkinTrayText -Key 'SignatureIgnored' }
          $cleanupProperty = $imported.PSObject.Properties['CleanupWarning']
          $hasCleanupWarning = $null -ne $cleanupProperty -and
            -not [string]::IsNullOrWhiteSpace("$($cleanupProperty.Value)")
          if ($hasCleanupWarning) {
            $message += Get-DreamSkinTrayText -Key 'CleanupWarning'
          }
          $messageIcon = if ($hasCleanupWarning) {
            [System.Windows.Forms.ToolTipIcon]::Warning
          } else {
            [System.Windows.Forms.ToolTipIcon]::Info
          }
          $notify.ShowBalloonTip(4200, 'Codex Dream Skin', $message, $messageIcon)
        }
      } finally {
        $dialog.Dispose()
      }
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'SaveCurrent') -Action {
      $name = [Microsoft.VisualBasic.Interaction]::InputBox(
        (Get-DreamSkinTrayText -Key 'SavePrompt'),
        (Get-DreamSkinTrayText -Key 'SaveTitle'),
        ''
      )
      if ($name.Trim()) {
        $saved = Invoke-DreamSkinTrayThemeOperation -Action {
          Save-DreamSkinCurrentTheme -Name $name -StateRoot $StateRoot
        }
        $notify.ShowBalloonTip(
          1800,
          'Codex Dream Skin',
          (Get-DreamSkinTrayText -Key 'Saved' -FormatArguments @($saved.Theme.name)),
          [System.Windows.Forms.ToolTipIcon]::Info
        )
      }
    }

    $savedMenu = [System.Windows.Forms.ToolStripMenuItem]::new(
      (Get-DreamSkinTrayText -Key 'SavedThemes')
    )
    $savedThemes = @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata)
    if ($savedThemes.Count -eq 0) {
      $empty = [System.Windows.Forms.ToolStripMenuItem]::new(
        (Get-DreamSkinTrayText -Key 'NoSavedThemes')
      )
      $empty.Enabled = $false
      [void]$savedMenu.DropDownItems.Add($empty)
    } else {
      foreach ($saved in $savedThemes) {
        $savedPath = $saved.Path
        $savedName = $saved.Name
        $savedAction = {
          Start-DreamSkinVerifiedTrayApply -ThemeName $savedName -ThemeDirectory $savedPath
        }.GetNewClosure()
        $null = Add-DreamSkinTrayItem -Items $savedMenu.DropDownItems -Text $savedName -Action $savedAction
      }
    }
    [void]$menu.Items.Add($savedMenu)

    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'OpenThemes') -Action {
      $themeDirectoryToken = ConvertTo-DreamSkinProcessArgument -Value $paths.Saved
      Start-Process -FilePath explorer.exe -ArgumentList $themeDirectoryToken | Out-Null
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'OpenImages') -Action {
      $imageDirectoryToken = ConvertTo-DreamSkinProcessArgument -Value $paths.Images
      Start-Process -FilePath explorer.exe -ArgumentList $imageDirectoryToken | Out-Null
    }
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'CheckUpdate') -Action {
      Start-DreamSkinPowerShell -Script $checkUpdateScript -Arguments @('-Interactive')
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Gallery') -Action {
      Start-Process -FilePath 'https://dreamskin.cc/gallery' | Out-Null
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Studio') -Action {
      Start-Process -FilePath 'https://dreamskin.cc/studio' | Out-Null
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'OpenSite') -Action {
      Start-Process -FilePath 'https://dreamskin.cc' | Out-Null
    }
    $autoStartEnabled = Test-Path -LiteralPath $startupShortcut -PathType Leaf
    $autoStartAction = {
      Set-DreamSkinAutoStart -Enabled:(-not $autoStartEnabled)
    }.GetNewClosure()
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'LaunchAtLogin') `
      -Action $autoStartAction -Checked $autoStartEnabled
    Add-DreamSkinTrayLanguageMenu
    [void]$menu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Restore') -Action {
      Start-DreamSkinPowerShell -Script $restoreScript -Arguments @(
        '-Port', "$Port", '-RestoreBaseTheme', '-PromptRestart'
      )
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
    $null = Add-DreamSkinTrayItem -Items $menu.Items -Text (Get-DreamSkinTrayText -Key 'Exit') -Action {
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
  }

  $menu.add_Opening({ Rebuild-DreamSkinTrayMenu })
  function Start-DreamSkinThemeManager {
    $manager = Join-Path $SkillRoot 'assets\theme-manager\DreamSkin.ThemeManager.exe'
    Assert-DreamSkinRuntimeTree -Path (Split-Path -Parent $manager)
    if (-not (Test-Path -LiteralPath $manager -PathType Leaf)) {
      throw 'The native theme manager is missing. Reinstall Codex Dream Skin.'
    }
    $previousLanguage = $env:DREAMSKIN_LANG
    try {
      $env:DREAMSKIN_LANG = Resolve-DreamSkinLanguage -StateRoot $StateRoot
      Start-Process -FilePath $manager -WorkingDirectory (Split-Path -Parent $manager) | Out-Null
    } finally {
      $env:DREAMSKIN_LANG = $previousLanguage
    }
  }
  $notify.add_DoubleClick({
    try {
      Start-DreamSkinThemeManager
    } catch {
      Show-DreamSkinTrayError -Message $_.Exception.Message
    }
  })
  $showTimer = [System.Windows.Forms.Timer]::new()
  $showTimer.Interval = 400
  $showTimer.add_Tick({
    if ($showEvent.WaitOne(0)) {
      try { Start-DreamSkinThemeManager } catch { Show-DreamSkinTrayError -Message $_.Exception.Message }
    }
  })
  $showTimer.Start()
  if ($ShowWindow) { Start-DreamSkinThemeManager }
  [System.Windows.Forms.Application]::Run()
} finally {
  if ($null -ne $showTimer) { $showTimer.Dispose() }
  if ($null -ne $script:trayApplyOperation) {
    $script:trayApplyOperation.Timer.Dispose()
    $script:trayApplyOperation.Process.Dispose()
  }
  $showEvent.Dispose()
  if ($null -ne $notify) { $notify.Dispose() }
  if ($null -ne $trayIcon) { $trayIcon.Dispose() }
  if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
  $mutex.Dispose()
}
