# Visible Windows entry point; theme application is owned by the tray's
# verified asynchronous operation, not a second theme implementation.
function Initialize-DreamSkinThemeWindow {
  $script:themeWindow = [System.Windows.Forms.Form]::new()
  $script:themeWindow.Text = 'Codex Dream Skin'
  $script:themeWindow.ClientSize = [System.Drawing.Size]::new(520, 430)
  $script:themeWindow.StartPosition = 'CenterScreen'
  $script:themeWindow.Font = [System.Drawing.Font]::new('Segoe UI', 10)
  $script:themeWindow.MinimumSize = [System.Drawing.Size]::new(536, 420)
  if ($null -ne $trayIcon) { $script:themeWindow.Icon = $trayIcon }
  $heading = [System.Windows.Forms.Label]::new()
  $heading.Text = Get-DreamSkinTrayText -Key 'SavedThemes'
  $heading.Font = [System.Drawing.Font]::new('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
  $heading.SetBounds(22, 16, 460, 40)
  $script:themeWindow.Controls.Add($heading)
  $script:themeStatusLabel = [System.Windows.Forms.Label]::new()
  $script:themeStatusLabel.Text = Get-DreamSkinTrayText -Key 'ThemeWindowHint'
  $script:themeStatusLabel.SetBounds(24, 62, 470, 55)
  $script:themeStatusLabel.Anchor = 'Top,Left,Right'
  $script:themeWindow.Controls.Add($script:themeStatusLabel)
  $script:themeList = [System.Windows.Forms.ListBox]::new()
  $script:themeList.SetBounds(24, 120, 472, 215)
  $script:themeList.Anchor = 'Top,Bottom,Left,Right'
  $script:themeList.DisplayMember = 'Name'
  $script:themeWindow.Controls.Add($script:themeList)
  $applyButton = [System.Windows.Forms.Button]::new()
  $applyButton.Text = Get-DreamSkinTrayText -Key 'Apply'
  $applyButton.SetBounds(24, 350, 225, 40)
  $applyButton.Anchor = 'Bottom,Left'
  $applyButton.add_Click({
    try {
      if ($script:trayApplyPending) { return }
      $selected = $script:themeList.SelectedItem
      if ($null -eq $selected) { return }
      Start-DreamSkinVerifiedTrayApply -ThemeName $selected.Name -ThemeDirectory $selected.Path
    } catch { Show-DreamSkinTrayError -Message $_.Exception.Message }
  })
  $script:themeWindow.Controls.Add($applyButton)
  $hideButton = [System.Windows.Forms.Button]::new()
  $hideButton.Text = Get-DreamSkinTrayText -Key 'HideToTray'
  $hideButton.SetBounds(266, 350, 230, 40)
  $hideButton.Anchor = 'Bottom,Right'
  $hideButton.add_Click({ $script:themeWindow.Hide() })
  $script:themeWindow.Controls.Add($hideButton)
  $script:themeWindow.add_FormClosing({
    param($sender, $eventArgs)
    if ($eventArgs.CloseReason -eq [System.Windows.Forms.CloseReason]::UserClosing) {
      $eventArgs.Cancel = $true
      $script:themeWindow.Hide()
    }
  })
}

function Show-DreamSkinThemeWindow {
  if (-not $script:trayApplyPending) {
    $script:themeList.Items.Clear()
    foreach ($savedTheme in @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata)) {
      [void]$script:themeList.Items.Add($savedTheme)
    }
    if ($script:themeList.Items.Count -gt 0) { $script:themeList.SelectedIndex = 0 }
  }
  $script:themeWindow.Show()
  $script:themeWindow.WindowState = 'Normal'
  $script:themeWindow.Activate()
}
