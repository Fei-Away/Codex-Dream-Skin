function Resolve-DreamSkinLanguage {
  param(
    [string]$Language = $env:DREAMSKIN_LANG,
    [string]$StateRoot = ''
  )
  $requested = if ($null -eq $Language) { '' } else { $Language.Trim() }
  if ($requested -match '^(?i:zh)(?:-|_|$)' -or $requested -ieq 'chinese') { return 'zh-CN' }
  if ($requested -match '^(?i:en)(?:-|_|$)' -or $requested -ieq 'english') { return 'en-US' }

  if ($StateRoot) {
    $preferencePath = Join-Path $StateRoot 'language.txt'
    if (Test-Path -LiteralPath $preferencePath -PathType Leaf) {
      try {
        $item = Get-Item -LiteralPath $preferencePath -Force -ErrorAction Stop
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0 -and
          $item.Length -le 16) {
          $saved = [System.IO.File]::ReadAllText($item.FullName).Trim()
          if ($saved -ceq 'zh-CN' -or $saved -ceq 'en-US') { return $saved }
        }
      } catch {}
    }
  }

  $culture = [System.Globalization.CultureInfo]::CurrentUICulture.Name
  if ($culture -match '^(?i:zh)(?:-|_|$)') { return 'zh-CN' }
  return 'en-US'
}

function Set-DreamSkinLanguage {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('system', 'en-US', 'zh-CN')]
    [string]$Language,
    [Parameter(Mandatory = $true)][string]$StateRoot
  )
  $root = [System.IO.Path]::GetFullPath($StateRoot)
  if (-not (Test-Path -LiteralPath $root -PathType Container)) {
    [void][System.IO.Directory]::CreateDirectory($root)
  }
  $preferencePath = Join-Path $root 'language.txt'
  if ($Language -ceq 'system') {
    Remove-Item -LiteralPath $preferencePath -Force -ErrorAction SilentlyContinue
    return
  }
  $temporary = Join-Path $root ('.language.' + [Guid]::NewGuid().ToString('N') + '.tmp')
  try {
    [System.IO.File]::WriteAllText(
      $temporary,
      $Language + [Environment]::NewLine,
      [System.Text.UTF8Encoding]::new($false)
    )
    Move-Item -LiteralPath $temporary -Destination $preferencePath -Force
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  }
}

function Get-DreamSkinLanguagePreference {
  param([Parameter(Mandatory = $true)][string]$StateRoot)
  if ($env:DREAMSKIN_LANG -match '^(?i:zh)(?:-|_|$)' -or $env:DREAMSKIN_LANG -ieq 'chinese') {
    return 'zh-CN'
  }
  if ($env:DREAMSKIN_LANG -match '^(?i:en)(?:-|_|$)' -or $env:DREAMSKIN_LANG -ieq 'english') {
    return 'en-US'
  }
  $preferencePath = Join-Path $StateRoot 'language.txt'
  if (Test-Path -LiteralPath $preferencePath -PathType Leaf) {
    try {
      $saved = [System.IO.File]::ReadAllText($preferencePath).Trim()
      if ($saved -ceq 'zh-CN' -or $saved -ceq 'en-US') { return $saved }
    } catch {}
  }
  return 'system'
}

function Get-DreamSkinText {
  param(
    [Parameter(Mandatory = $true)][string]$Key,
    [string]$Language = '',
    [object[]]$FormatArguments = @()
  )
  $resolved = Resolve-DreamSkinLanguage -Language $Language
  $catalog = @{
    'en-US' = @{
      StatusPaused = 'Status: Paused'; StatusRunning = 'Status: Running'; StatusStopped = 'Status: Stopped'
      Apply = 'Apply or reapply'; Resume = 'Resume skin'; Pause = 'Pause skin'
      ChangeBackground = 'Change background image'; BackgroundTitle = 'Choose a Codex Dream Skin background image'
      BackgroundUpdated = 'Background image updated.'; ImportZip = 'Import theme ZIP...'
      ImportTitle = 'Choose a Codex Dream Skin theme ZIP'; SaveCurrent = 'Save current theme'
      SavePrompt = 'Theme name:'; SaveTitle = 'Save Codex Dream Skin theme'; Saved = 'Saved: {0}'
      SavedThemes = 'Saved themes'; NoSavedThemes = 'No saved themes'; Applied = 'Applied: {0}'
      OpenThemes = 'Open themes folder'; OpenImages = 'Open images folder'; CheckUpdate = 'Check for updates...'
      Gallery = 'Theme Gallery'; Studio = 'Online Studio'; OpenSite = 'Open DreamSkin.cc'
      LaunchAtLogin = 'Launch at login'; Restore = 'Fully restore Codex'; Exit = 'Exit tray'
      Language = 'Language / 语言'; LanguageSystem = 'System / 系统'; LanguageEnglish = 'English'; LanguageChinese = '中文'
      ApplyStarted = 'Skin apply started'; Applying = 'Applying skin...'
      ResumeStarted = 'Skin reapply started'; Reapplying = 'Reapplying skin...'
      ThemeExists = 'Theme already exists: {0}. No duplicate was written.'
      ThemeUpdated = 'Saved theme updated: {0}. The current theme did not change.'
      ThemeImported = 'Imported: {0}. The current theme did not change.'
      NewIdentifier = ' New identifier: {0}.'; NameCollision = ' A theme with the same name already exists.'
      CssValidated = ' theme.css passed local Safe CSS validation and will apply with this theme.'
      SignatureIgnored = ' manifest.sig is reserved and ignored by this version.'
      CleanupWarning = ' The theme was saved, but an old backup folder could not be cleaned up. Restart the client later and check its logs.'
      ImageFilter = 'Image files|*.png;*.jpg;*.jpeg;*.webp|All files|*.*'
      PauseNoSession = 'Pause was recorded, but no active session could be reached. The current window may still show the skin.'
      PauseSucceeded = 'Skin paused.'; PauseFailed = 'Pause was recorded, but removing the live skin failed. Retry pause or fully restore Codex.'
      UpdateTitle = 'Codex Dream Skin Update'; UpdateAvailable = 'Codex Dream Skin {0} is available.'
      UpdateQuestion = 'Open the GitHub download page?'; UpToDate = 'Codex Dream Skin {0} is up to date.'
      UpdateFailed = 'Could not check for updates.'
      RestartPrompt = 'Codex must restart once to enable Dream Skin. Unsaved input may be lost. Restart now?'
      LaunchCancelled = 'Dream Skin launch was cancelled; Codex was not changed.'
      RestoreClose = 'Restore will close Codex, remove Dream Skin and its CDP session, then reopen the official app. Continue?'
      RestoreCloseNoRelaunch = 'Restore will close Codex and remove Dream Skin plus its CDP session. Continue?'
      RestoreCancelled = 'Restore was cancelled; no state or configuration was changed.'
      CommunitySuccess = 'Theme “{0}” passed download, SHA-256, package, and Safe CSS validation and is now active in Codex.'
      CommunityCleanup = 'The theme was applied, but an old backup folder could not be cleaned up. The new theme will not be rolled back. Restart the client later and check its logs.'
      CommunityConfirmTitle = 'Confirm one-click theme apply'; CommunityConfirm = 'Download and apply “{0}” from DreamSkin.cc?'
      CommunityAuthor = 'Author: {0}'; CommunityVersion = 'Version: {0} · {1} MiB'; CommunityHash = 'SHA-256: {0}'
      CommunitySafety = 'The client connects only to the fixed official API and revalidates download size, SHA-256, ZIP, manifest, and Safe CSS. Codex may restart while applying, and unsaved input may be lost. Theme content is never executed as commands.'
      RecoveryVerified = 'The new theme did not become active. The previous theme was reapplied and passed visible-render verification.'
      RecoveryFailed = 'The new theme did not become active. Automatic restore or render verification of the previous theme did not finish. Reopen the client and inspect it.'
      RecoverySuperseded = 'Another theme operation was detected. The client kept the newer selection and did not overwrite it.'
      RecoveryUnconfirmed = 'The new theme did not enter verified active state.'
      RecoveryWorkRetained = 'The recovery work folder was retained and not deleted.'; DownloadCleaned = 'Temporary download files were cleaned up.'
      RollbackSnapshot = 'Rollback snapshot: {0}'; CommunityApplyFailed = 'One-click theme apply failed.'
    }
    'zh-CN' = @{
      StatusPaused = '状态：已暂停'; StatusRunning = '状态：运行中'; StatusStopped = '状态：未运行'
      Apply = '应用或重新应用'; Resume = '继续显示皮肤'; Pause = '暂停皮肤'
      ChangeBackground = '更换背景图'; BackgroundTitle = '选择 Codex Dream Skin 背景图'
      BackgroundUpdated = '背景图已更新。'; ImportZip = '导入主题 ZIP…'
      ImportTitle = '选择 Codex Dream Skin 主题 ZIP'; SaveCurrent = '保存当前主题'
      SavePrompt = '输入主题名称：'; SaveTitle = '保存 Codex Dream Skin 主题'; Saved = '已保存：{0}'
      SavedThemes = '已保存主题'; NoSavedThemes = '暂无已保存主题'; Applied = '已应用：{0}'
      OpenThemes = '打开主题文件夹'; OpenImages = '打开图片文件夹'; CheckUpdate = '检查更新…'
      Gallery = '主题库 Gallery'; Studio = '在线 Studio'; OpenSite = '打开 DreamSkin.cc'
      LaunchAtLogin = '登录时启动'; Restore = '完全恢复 Codex'; Exit = '退出托盘'
      Language = '语言 / Language'; LanguageSystem = '系统 / System'; LanguageEnglish = 'English'; LanguageChinese = '中文'
      ApplyStarted = '已开始应用皮肤'; Applying = '正在应用皮肤…'
      ResumeStarted = '已开始重新应用皮肤'; Reapplying = '正在重新应用皮肤…'
      ThemeExists = '主题已存在：{0}。没有重复写入。'
      ThemeUpdated = '已更新已保存主题：{0}。当前主题没有改变。'
      ThemeImported = '已导入：{0}。当前主题没有改变。'
      NewIdentifier = ' 新标识：{0}。'; NameCollision = ' 主题库中已有同名主题。'
      CssValidated = ' theme.css 已通过本机 Safe CSS 校验，切换到该主题时会一并生效。'
      SignatureIgnored = ' manifest.sig 是预留文件，当前版本已忽略。'
      CleanupWarning = ' 主题已成功保存，但旧备份目录未能自动清理；新主题不会因此回滚。请稍后重启客户端并查看日志。'
      ImageFilter = '图片文件|*.png;*.jpg;*.jpeg;*.webp|所有文件|*.*'
      PauseNoSession = '没有可连接的活动会话；已记录暂停，当前窗口可能仍显示皮肤。'
      PauseSucceeded = '皮肤已暂停。'; PauseFailed = '已记录暂停，但卸下当前皮肤失败；可重试暂停或完全恢复 Codex。'
      UpdateTitle = 'Codex Dream Skin 更新'; UpdateAvailable = 'Codex Dream Skin {0} 已发布。'
      UpdateQuestion = '是否打开 GitHub 下载页面？'; UpToDate = 'Codex Dream Skin {0} 已是最新版本。'
      UpdateFailed = '无法检查更新。'
      RestartPrompt = 'Codex 需要重启一次才能启用 Dream Skin，未保存的输入可能丢失。现在重启吗？'
      LaunchCancelled = '已取消启动 Dream Skin；Codex 未发生改变。'
      RestoreClose = '恢复操作将关闭 Codex，移除 Dream Skin 及其 CDP 会话，然后重新打开官方应用。是否继续？'
      RestoreCloseNoRelaunch = '恢复操作将关闭 Codex，并移除 Dream Skin 及其 CDP 会话。是否继续？'
      RestoreCancelled = '已取消恢复；状态和配置均未改变。'
      CommunitySuccess = '主题“{0}”已通过下载、SHA-256、主题包与 Safe CSS 校验，并已应用到 Codex。'
      CommunityCleanup = '主题已成功应用，但旧备份目录未能自动清理；新主题不会因此回滚。请稍后重启客户端并查看日志。'
      CommunityConfirmTitle = '确认一键换肤'; CommunityConfirm = '从 DreamSkin.cc 下载并应用“{0}”？'
      CommunityAuthor = '作者：{0}'; CommunityVersion = '版本：{0} · {1} MiB'; CommunityHash = 'SHA-256：{0}'
      CommunitySafety = '客户端只会连接固定官方 API，并重新校验下载大小、SHA-256、ZIP、清单和 Safe CSS。应用时 Codex 可能重启，未保存的输入可能丢失。主题内容不会作为命令执行。'
      RecoveryVerified = '新主题未能生效；此前主题已重新应用并完成可见渲染验证。'
      RecoveryFailed = '新主题未能生效；此前主题的自动恢复或渲染验证未完成。请重新打开客户端检查。'
      RecoverySuperseded = '检测到另一个换肤操作，客户端保留了较新的选择，没有覆盖它。'
      RecoveryUnconfirmed = '新主题未写入已验证的活动状态。'
      RecoveryWorkRetained = '恢复工作目录已保留，未自动删除。'; DownloadCleaned = '下载临时文件已清理。'
      RollbackSnapshot = '回滚快照：{0}'; CommunityApplyFailed = '一键换肤失败。'
    }
  }
  $value = $catalog[$resolved][$Key]
  if ($null -eq $value) { throw "Unknown Dream Skin localization key: $Key" }
  if ($FormatArguments.Count -gt 0) { return [string]::Format($value, $FormatArguments) }
  return $value
}
