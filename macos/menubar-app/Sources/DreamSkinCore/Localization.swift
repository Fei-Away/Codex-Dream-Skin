import Foundation

public enum DreamSkinLanguage: String, CaseIterable, Codable, Sendable {
  case system
  case english
  case chinese

  public static let defaultsKey = "dreamskin.language"

  public var displayName: String {
    switch self {
    case .system: return "System / 系统"
    case .english: return "English"
    case .chinese: return "中文"
    }
  }

  public var environmentValue: String {
    switch resolved() {
    case .chinese: return "zh-CN"
    case .english, .system: return "en-US"
    }
  }

  public func resolved(preferredLanguages: [String] = Locale.preferredLanguages) -> DreamSkinLanguage {
    switch self {
    case .english, .chinese:
      return self
    case .system:
      let preferred = preferredLanguages.first?.lowercased() ?? ""
      return preferred.hasPrefix("zh") ? .chinese : .english
    }
  }

  public static func stored(
    defaults: UserDefaults = .standard
  ) -> DreamSkinLanguage {
    guard let raw = defaults.string(forKey: defaultsKey),
          let value = DreamSkinLanguage(rawValue: raw) else {
      return .system
    }
    return value
  }
}

public struct DreamSkinCopy: Sendable {
  public enum Key: String, Sendable {
    case statusApplying
    case statusPausing
    case statusOnFailed
    case statusOn
    case statusOffFailed
    case statusOff
    case statusUnknown
    case appliedTheme
    case selectedThemePending
    case selectedTheme
    case codexOpen
    case codexClosed
    case version
    case newVersion
    case themeMenu
    case linksMenu
    case maintenanceMenu
    case languageMenu
    case apply
    case reapply
    case repairApply
    case pause
    case openChatGPT
    case loginAtStartup
    case quit
    case changeBackground
    case importZip
    case savedThemes
    case noSavedThemes
    case openThemes
    case openImages
    case gallery
    case studio
    case openSite
    case installEngine
    case repairEngine
    case installingEngine
    case checkUpdate
    case disableSwiftBar
    case restoreUninstall
    case busyTitle
    case busyMessage
    case invalidLinkTitle
    case invalidLinkMessage
    case prepareDirectoryTitle
    case cannotApplyTitle
    case cannotApplyMessage
    case missingEngineTitle
    case missingEngineCommunityMessage
    case missingEngineImportMessage
    case missingEngineRetryMessage
    case invalidThemeTitle
    case invalidThemeMessage
    case baselineTitle
    case baselineMessage
    case readThemeTitle
    case readThemeMessage
    case validationTitle
    case downloadThemeTitle
    case downloadThemeMessage
    case downloadValidationTitle
    case downloadValidationMessage
    case importFailedTitle
    case invalidZipMessage
    case downloadedNotAppliedTitle
    case downloadedNotAppliedMessage
    case duplicateTitle
    case duplicateBase
    case duplicateCSS
    case signatureIgnored
    case importedUpdated
    case importedAdded
    case renamed
    case nameCollision
    case cssValidated
    case cleanupWarning
    case importCompleteTitle
    case importedApplyTitle
    case importedApplyMessage
    case appliedTitle
    case appliedMessage
    case rollbackTitle
    case rollbackMessage
    case unconfirmedTitle
    case unconfirmedMessage
    case notFoundTitle
    case notFoundMessage
    case openFailedTitle
    case openFailedMessage
    case updateMissingTitle
    case updateMissingMessage
    case updateFailedTitle
    case updateFailedMessage
    case updateInvalidTitle
    case updateInvalidMessage
    case newVersionTitle
    case newVersionMessage
    case downloadNow
    case later
    case updateNotificationTitle
    case updateNotificationMessage
    case updateDownloadMissingTitle
    case updateDownloadMissingMessage
    case updateDownloadFailedTitle
    case updateDownloadFailedMessage
    case updateOpenFailedTitle
    case updateOpenFailedMessage
    case updateOpenedTitle
    case updateOpenedMessage
    case upToDateTitle
    case upToDateMessage
    case loginApprovalTitle
    case loginApprovalMessage
    case loginStartFailedTitle
    case loginStartFailedMessage
    case restoreConfirmTitle
    case restoreConfirmMessage
    case restoreAndUninstall
    case restoreFailedTitle
    case restoreFailedMessage
    case restoreCleanupFailedTitle
    case restoreCleanupFailedMessage
    case restoreDoneTitle
    case restoreDoneMessage
    case installCorruptTitle
    case installVersionInvalid
    case installedNewerTitle
    case installedNewerMessage
    case installMissingEngine
    case installFailedTitle
    case installFailedMessage
    case recoveryMissingTitle
    case recoveryMissingMessage
    case recoveryFailedTitle
    case recoveryFailedMessage
    case legacyConfirmTitle
    case legacyConfirmMessage
    case legacyDisable
    case legacyDisabledTitle
    case legacyDisabledMessage
    case legacyPartialTitle
    case ok
    }

  public let language: DreamSkinLanguage

  public init(language: DreamSkinLanguage) {
    self.language = language
  }

  public var resolvedLanguage: DreamSkinLanguage {
    language.resolved()
  }

  public func text(_ key: Key) -> String {
    let chinese = resolvedLanguage == .chinese
    switch key {
    case .statusApplying: return chinese ? "Skin 应用中" : "Skin applying"
    case .statusPausing: return chinese ? "Skin 暂停中" : "Skin pausing"
    case .statusOnFailed: return chinese ? "Skin ON · 操作失败" : "Skin ON · operation failed"
    case .statusOn: return "Skin ON"
    case .statusOffFailed: return chinese ? "Skin OFF · 操作失败" : "Skin OFF · operation failed"
    case .statusOff: return "Skin OFF"
    case .statusUnknown: return chinese ? "Skin 异常" : "Skin unavailable"
    case .appliedTheme: return chinese ? "已应用：%@" : "Applied: %@"
    case .selectedThemePending: return chinese ? "已选主题：%@（待应用）" : "Selected: %@ (pending apply)"
    case .selectedTheme: return chinese ? "已选主题：%@" : "Selected: %@"
    case .codexOpen: return chinese ? "ChatGPT：已打开" : "ChatGPT: Open"
    case .codexClosed: return chinese ? "ChatGPT：未打开" : "ChatGPT: Closed"
    case .version: return chinese ? "版本：v%@" : "Version: v%@"
    case .newVersion: return chinese ? "🆕 发现新版本 %@" : "🆕 New version %@ available"
    case .themeMenu: return chinese ? "主题" : "Themes"
    case .linksMenu: return chinese ? "链接" : "Links"
    case .maintenanceMenu: return chinese ? "维护" : "Maintenance"
    case .languageMenu: return chinese ? "语言" : "Language"
    case .apply: return chinese ? "应用皮肤" : "Apply skin"
    case .reapply: return chinese ? "重新应用皮肤" : "Reapply skin"
    case .repairApply: return chinese ? "修复并应用" : "Repair and apply"
    case .pause: return chinese ? "暂停皮肤" : "Pause skin"
    case .openChatGPT: return chinese ? "打开 ChatGPT" : "Open ChatGPT"
    case .loginAtStartup: return chinese ? "登录时启动" : "Launch at login"
    case .quit: return chinese ? "退出" : "Quit"
    case .changeBackground: return chinese ? "换一张背景图…" : "Choose background image…"
    case .importZip: return chinese ? "导入主题 ZIP…" : "Import theme ZIP…"
    case .savedThemes: return chinese ? "已保存的主题" : "Saved themes"
    case .noSavedThemes: return chinese ? "还没有保存的主题" : "No saved themes yet"
    case .openThemes: return chinese ? "打开主题文件夹" : "Open themes folder"
    case .openImages: return chinese ? "打开图片文件夹" : "Open images folder"
    case .gallery: return chinese ? "主题库 Gallery" : "Theme Gallery"
    case .studio: return chinese ? "在线 Studio" : "Online Studio"
    case .openSite: return chinese ? "打开 DreamSkin.cc" : "Open DreamSkin.cc"
    case .installEngine: return chinese ? "安装 / 升级引擎…" : "Install / upgrade engine…"
    case .repairEngine: return chinese ? "修复 / 重新安装引擎…" : "Repair / reinstall engine…"
    case .installingEngine: return chinese ? "正在安装引擎…" : "Installing engine…"
    case .checkUpdate: return chinese ? "立即检查更新" : "Check for updates now"
    case .disableSwiftBar: return chinese ? "停用旧 SwiftBar 菜单…" : "Disable old SwiftBar menu…"
    case .restoreUninstall: return chinese ? "恢复原状并卸载…" : "Restore and uninstall…"
    case .busyTitle: return chinese ? "操作仍在进行" : "Operation in progress"
    case .busyMessage: return chinese ? "请等待当前下载、导入、应用或恢复完成后再退出，以免留下未完成的主题状态。" : "Wait for the current download, import, apply, or restore to finish before quitting so the theme state stays recoverable."
    case .invalidLinkTitle: return chinese ? "一键换肤链接无效" : "Invalid one-click theme link"
    case .invalidLinkMessage: return chinese ? "只接受 DreamSkin.cc 生成的主题版本链接；不会打开链接中的任意网址或文件。" : "Only theme-version links generated by DreamSkin.cc are accepted. The app will not open arbitrary URLs or files from a link."
    case .prepareDirectoryTitle: return chinese ? "无法准备用户目录" : "Could not prepare the user folders"
    case .cannotApplyTitle: return chinese ? "暂时无法换肤" : "Cannot apply a theme right now"
    case .cannotApplyMessage: return chinese ? "Dream Skin 正在执行其他操作，请稍后再点一次。" : "Dream Skin is busy with another operation. Try again in a moment."
    case .missingEngineTitle: return chinese ? "引擎尚未安装" : "Engine is not installed"
    case .missingEngineCommunityMessage: return chinese ? "请先选择“安装 / 升级引擎”，再使用一键换肤。" : "Choose “Install / upgrade engine” before using one-click theme apply."
    case .missingEngineImportMessage: return chinese ? "请先选择“安装 / 升级引擎”，再导入主题。" : "Choose “Install / upgrade engine” before importing a theme."
    case .missingEngineRetryMessage: return chinese ? "请先选择“安装 / 升级引擎”，再重试。" : "Choose “Install / upgrade engine” and try again."
    case .invalidThemeTitle: return chinese ? "主题无效" : "Invalid theme"
    case .invalidThemeMessage: return chinese ? "主题标识不符合安全规则。" : "The theme identifier does not meet the safety rules."
    case .baselineTitle: return chinese ? "当前皮肤还不能安全换肤" : "The current skin is not ready for a safe replacement"
    case .baselineMessage: return chinese ? "请先从菜单栏应用当前皮肤，确认状态为 Skin ON 且没有“待应用”主题，再回到网页重试。这样失败时才能恢复并验证点击前真正显示的主题。" : "Apply the current skin from the menu bar first. Confirm it says Skin ON with no pending theme, then retry from the website. This lets the app restore and verify exactly what was visible before the click if the new apply fails."
    case .readThemeTitle: return chinese ? "无法读取主题信息" : "Could not read theme metadata"
    case .readThemeMessage: return chinese ? "DreamSkin.cc 没有返回可验证的已审核主题，请稍后重试。" : "DreamSkin.cc did not return a verifiable approved theme. Try again later."
    case .validationTitle: return chinese ? "主题信息未通过校验" : "Theme metadata failed validation"
    case .downloadThemeTitle: return chinese ? "无法下载主题" : "Could not download the theme"
    case .downloadThemeMessage: return chinese ? "主题下载地址无法由版本标识安全构造。" : "A safe download URL could not be constructed from the version identifier."
    case .downloadValidationTitle: return chinese ? "主题包未通过下载校验" : "Theme package failed download validation"
    case .downloadValidationMessage: return chinese ? "下载已丢弃，没有导入或应用任何内容。\n\n%@" : "The download was discarded. Nothing was imported or applied.\n\n%@"
    case .importFailedTitle: return chinese ? "导入主题失败" : "Theme import failed"
    case .invalidZipMessage: return chinese ? "主题 ZIP 未通过安全或内容校验。" : "The theme ZIP failed the safety or content validation."
    case .downloadedNotAppliedTitle: return chinese ? "主题已下载，但没有应用" : "Theme downloaded but not applied"
    case .downloadedNotAppliedMessage: return chinese ? "主题包没有完成严格 ZIP 与 Safe CSS 导入校验。" : "The package did not complete the strict ZIP and Safe CSS import checks."
    case .duplicateTitle: return chinese ? "主题已经存在" : "Theme already exists"
    case .duplicateBase: return chinese ? "“%@”与已保存主题完全相同，没有重复写入。" : "“%@” is identical to a saved theme, so no duplicate was written."
    case .duplicateCSS: return chinese ? "\n包内 theme.css 已通过本机 Safe CSS 校验，切换到该主题时会一并生效。" : "\nThe bundled theme.css passed local Safe CSS validation and will be applied when you switch to this theme."
    case .signatureIgnored: return chinese ? "\n包内 manifest.sig 是预留文件，当前版本已忽略。" : "\nmanifest.sig is reserved for a future version and is ignored by this release."
    case .importedUpdated: return chinese ? "已更新“%@”的已保存版本，当前正在使用的主题没有改变。" : "The saved version of “%@” was updated. The currently active theme did not change."
    case .importedAdded: return chinese ? "已把“%@”加入“已保存的主题”，当前正在使用的主题没有改变。" : "“%@” was added to Saved themes. The currently active theme did not change."
    case .renamed: return chinese ? "\n为避免覆盖同 ID 主题，已使用新标识：%@。" : "\nA new identifier was used to avoid overwriting a theme with the same ID: %@."
    case .nameCollision: return chinese ? "\n主题库中已有同名主题，可在菜单中按需要选择。" : "\nA theme with the same name already exists; choose the one you want from the menu."
    case .cssValidated: return chinese ? "\ntheme.css 已通过本机 Safe CSS 校验，切换到该主题时会一并生效。" : "\ntheme.css passed local Safe CSS validation and will be applied when you switch to this theme."
    case .cleanupWarning: return chinese ? "\n主题已成功保存，但旧备份目录未能自动清理；新主题不会因此回滚。请稍后重启客户端并查看日志。" : "\nThe theme was saved, but an old backup folder could not be cleaned up. The new theme will not roll back because of this. Restart the client later and check its logs."
    case .importCompleteTitle: return chinese ? "主题导入完成" : "Theme import complete"
    case .importedApplyTitle: return chinese ? "主题已导入，但没有应用" : "Theme imported but not applied"
    case .importedApplyMessage: return chinese ? "客户端无法启动带回滚保护的一键换肤事务。当前主题没有改变。" : "The client could not start the rollback-protected one-click apply transaction. The current theme was not changed."
    case .appliedTitle: return chinese ? "主题已应用" : "Theme applied"
    case .appliedMessage: return chinese ? "“%@”已通过下载、SHA-256、主题包、Safe CSS 和可见渲染校验，并已切换到客户端。" : "“%@” passed the download, SHA-256, package, Safe CSS, and visible-render checks and is now active."
    case .rollbackTitle: return chinese ? "新主题应用失败，原主题已恢复" : "New theme failed; original theme restored"
    case .rollbackMessage: return chinese ? "换肤前的精确主题快照已重新应用，并通过可见渲染验证。\n\n%@" : "The exact pre-apply theme snapshot was reapplied and passed visible-render verification.\n\n%@"
    case .unconfirmedTitle: return chinese ? "主题已导入，但应用状态未确认" : "Theme imported but apply state is unconfirmed"
    case .unconfirmedMessage: return chinese ? "当前可见主题状态未能确认。\n\n%@" : "The currently visible theme state could not be confirmed.\n\n%@"
    case .notFoundTitle: return chinese ? "未找到 ChatGPT" : "ChatGPT was not found"
    case .notFoundMessage: return chinese ? "请先安装并至少启动一次官方 ChatGPT / Codex 桌面应用。" : "Install and launch the official ChatGPT / Codex desktop app at least once first."
    case .openFailedTitle: return chinese ? "无法打开 ChatGPT" : "Could not open ChatGPT"
    case .openFailedMessage: return chinese ? "请检查 ChatGPT 是否已安装，并重试。" : "Check that ChatGPT is installed and try again."
    case .updateMissingTitle: return chinese ? "无法检查更新" : "Could not check for updates"
    case .updateMissingMessage: return chinese ? "更新检查脚本缺失，请重新安装应用。" : "The update checker is missing. Reinstall the app."
    case .updateFailedTitle: return chinese ? "检查更新失败" : "Update check failed"
    case .updateFailedMessage: return chinese ? "无法连接 GitHub，请稍后重试。" : "Could not connect to GitHub. Try again later."
    case .updateInvalidTitle: return chinese ? "更新信息无效" : "Invalid update information"
    case .updateInvalidMessage: return chinese ? "GitHub 返回了无法识别的版本号。" : "GitHub returned an unrecognized version number."
    case .newVersionTitle: return chinese ? "发现新版本 %@" : "New version %@ available"
    case .newVersionMessage: return chinese ? "当前版本为 %@。客户端将从精确版本的 GitHub Release 下载 DMG，核对资产信息、GitHub SHA-256、SHA256SUMS.txt 和磁盘映像完整性，并验证其中 App 的身份、版本、内嵌引擎与代码签名完整性；全部通过后只打开 DMG，不会自动替换应用。" : "You are running %@. The app will download the DMG from the exact GitHub Release, verify its asset metadata, GitHub SHA-256, SHA256SUMS.txt, and disk image integrity, then check the mounted app identity, version, embedded engine, and code-signature integrity. It opens the DMG only after every check passes and never replaces the app automatically."
    case .downloadNow: return chinese ? "下载并验证" : "Download and verify"
    case .later: return chinese ? "稍后" : "Later"
    case .updateNotificationTitle: return chinese ? "Codex Dream Skin 有新版本" : "Codex Dream Skin update available"
    case .updateNotificationMessage: return chinese ? "%@ 已发布，点按下载并验证 DMG。" : "%@ is available. Click to download and verify the DMG."
    case .updateDownloadMissingTitle: return chinese ? "无法下载更新" : "Could not download the update"
    case .updateDownloadMissingMessage: return chinese ? "更新组件缺失，请重新安装应用。" : "The update component is missing. Reinstall the app."
    case .updateDownloadFailedTitle: return chinese ? "更新下载或验证失败" : "Update download or verification failed"
    case .updateDownloadFailedMessage: return chinese ? "未打开任何 DMG。请重试；如果问题持续，请前往 GitHub Releases 手动下载。" : "No DMG was opened. Try again; if the problem continues, download it manually from GitHub Releases."
    case .updateOpenFailedTitle: return chinese ? "无法打开已验证的 DMG" : "Could not open the verified DMG"
    case .updateOpenFailedMessage: return chinese ? "DMG 保存在：\n%@\n请稍后从 Finder 手动打开。" : "The DMG is saved at:\n%@\nOpen it from Finder later."
    case .updateOpenedTitle: return chinese ? "已验证并打开 DMG" : "DMG verified and opened"
    case .updateOpenedMessage: return chinese ? "请退出当前 Dream Skin App，再把新 App 拖入 Applications 并选择替换。客户端不会自行覆盖应用；主题和图片会继续保留。" : "Quit the current Dream Skin app, drag the new app into Applications, and choose Replace. The client will not overwrite itself; your themes and images are preserved."
    case .upToDateTitle: return chinese ? "已是最新版本" : "You are up to date"
    case .upToDateMessage: return chinese ? "当前安装的是 %@。" : "You are running %@."
    case .loginApprovalTitle: return chinese ? "需要系统确认" : "System confirmation required"
    case .loginApprovalMessage: return chinese ? "请在“系统设置 → 通用 → 登录项”中允许 Codex Dream Skin。" : "Allow Codex Dream Skin in System Settings → General → Login Items."
    case .loginStartFailedTitle: return chinese ? "无法修改登录启动" : "Could not change launch-at-login"
    case .loginStartFailedMessage: return chinese ? "请先把 App 拖到“应用程序”文件夹，再重试。\n\n%@" : "Move the app to the Applications folder and try again.\n\n%@"
    case .restoreConfirmTitle: return chinese ? "恢复原状并卸载 Dream Skin？" : "Restore the original appearance and uninstall Dream Skin?"
    case .restoreConfirmMessage: return chinese ? "将停止皮肤、恢复 ChatGPT 外观、删除本地引擎并关闭本应用。你的图片和已保存主题会保留。" : "This stops the skin, restores ChatGPT's appearance, removes the local engine, and closes this app. Your images and saved themes will be kept."
    case .restoreAndUninstall: return chinese ? "恢复并卸载" : "Restore and uninstall"
    case .restoreFailedTitle: return chinese ? "恢复未完成" : "Restore did not finish"
    case .restoreFailedMessage: return chinese ? "引擎和设置均已保留，请处理错误后重试。" : "The engine and settings were kept. Resolve the error and try again."
    case .restoreCleanupFailedTitle: return chinese ? "恢复完成，但清理失败" : "Restored, but cleanup failed"
    case .restoreCleanupFailedMessage: return chinese ? "ChatGPT 已恢复，部分安装文件未能删除：\n\n%@" : "ChatGPT was restored, but some installation files could not be removed:\n\n%@"
    case .restoreDoneTitle: return chinese ? "恢复完成" : "Restore complete"
    case .restoreDoneMessage: return chinese ? "本地引擎和登录启动已移除。最后请把“Codex Dream Skin.app”移到废纸篓。" : "The local engine and launch-at-login entry were removed. Move “Codex Dream Skin.app” to the Trash to finish."
    case .installCorruptTitle: return chinese ? "安装资源损坏" : "Installation resources are damaged"
    case .installVersionInvalid: return chinese ? "App 内的版本信息无效，请重新下载。" : "The version information inside the app is invalid. Download the app again."
    case .installedNewerTitle: return chinese ? "已安装更新版本" : "A newer engine is already installed"
    case .installedNewerMessage: return chinese ? "本机引擎 v%@ 比当前 App 的 v%@ 更新。请下载相同或更新版本的 DMG，不会执行降级。" : "The local engine v%@ is newer than this app's v%@. Download the same or a newer DMG; the app will not downgrade it."
    case .installMissingEngine: return chinese ? "App 内没有找到 Dream Skin 引擎。请重新下载。" : "The Dream Skin engine is missing from the app. Download the app again."
    case .installFailedTitle: return chinese ? "引擎安装未完成" : "Engine installation did not finish"
    case .installFailedMessage: return chinese ? "安装脚本返回了错误，请重试；如果问题持续，请查看 Dream Skin 日志。" : "The installer returned an error. Try again; if it persists, check the Dream Skin logs."
    case .recoveryMissingTitle: return chinese ? "主题恢复组件缺失" : "Theme recovery component is missing"
    case .recoveryMissingMessage: return chinese ? "本地引擎不完整，未继续待执行的换肤操作。请先选择“修复 / 重新安装引擎…”。" : "The local engine is incomplete, so the pending theme operation was not resumed. Choose “Repair / reinstall engine…” first."
    case .recoveryFailedTitle: return chinese ? "主题恢复未完成" : "Theme recovery did not finish"
    case .recoveryFailedMessage: return chinese ? "已保留恢复记录，未继续待执行的换肤操作。请先选择“修复 / 重新安装引擎…”；如果仍失败，请附上日志反馈。" : "The recovery record was kept and the pending theme operation was not resumed. Choose “Repair / reinstall engine…” first; if it still fails, include the logs when reporting it."
    case .legacyConfirmTitle: return chinese ? "停用旧 SwiftBar 菜单？" : "Disable the old SwiftBar menu?"
    case .legacyConfirmMessage: return chinese ? "已检测到旧版 Dream Skin SwiftBar 插件。停用后可避免菜单栏出现两个图标；插件会改名保留，不会直接删除。" : "An older Dream Skin SwiftBar plugin was found. Disabling it prevents two menu-bar icons; the plugin will be renamed and kept, not deleted."
    case .legacyDisable: return chinese ? "停用旧插件" : "Disable old plugin"
    case .legacyDisabledTitle: return chinese ? "旧菜单已停用" : "Old menu disabled"
    case .legacyDisabledMessage: return chinese ? "SwiftBar 插件已安全改名保留。" : "The SwiftBar plugin was safely renamed and kept."
    case .legacyPartialTitle: return chinese ? "部分旧插件未能停用" : "Some old plugins could not be disabled"
    case .ok: return chinese ? "好" : "OK"
    }
  }

  public func format(_ key: Key, _ arguments: CVarArg...) -> String {
    String(format: text(key), arguments: arguments)
  }

  public func statusTitle(session: String, operation: String) -> String {
    if operation == "applying" { return text(.statusApplying) }
    if operation == "pausing" { return text(.statusPausing) }
    switch session {
    case "active": return operation == "failed" ? text(.statusOnFailed) : text(.statusOn)
    case "off", "paused": return operation == "failed" ? text(.statusOffFailed) : text(.statusOff)
    default: return text(.statusUnknown)
    }
  }

  public func operationFailed(_ operation: String) -> String {
    resolvedLanguage == .chinese ? "\(operation)失败" : "\(operation) failed"
  }
}
