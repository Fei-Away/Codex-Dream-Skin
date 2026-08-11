import AppKit
import CryptoKit
import DreamSkinCore
import ServiceManagement
import UniformTypeIdentifiers
import UserNotifications

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, UNUserNotificationCenterDelegate {
  private enum CommunityRollbackRetention {
    case preserved(URL)
    case retainedInOperationRoot(URL)
    case unavailable

    var requiresOperationRoot: Bool {
      if case .retainedInOperationRoot = self { return true }
      return false
    }
  }

  private let fileManager = FileManager.default
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
  private let menu = NSMenu()
  private var snapshot = StatusSnapshot()
  private var statusRefreshRunning = false
  private var operationInFlight = false
  private var engineInstallInFlight = false
  private var themeRecoveryInFlight = false
  private var pendingCommunityVersionID: String?
  private var communityBaselineThemeID = ""
  private var communityStageMessage = ""
  private var refreshTimer: Timer?
  private var updateCheckTimer: Timer?
  private var availableUpdate: (version: String, releaseURL: String)?
  private var updateCheckInFlight = false
  private lazy var communityHTTP = BoundedCommunityHTTPClient(
    userAgent: "CodexDreamSkin/\(appVersion)"
  )
  private let requiredEngineRelativePaths = [
    "VERSION",
    "assets/dream-skin.css",
    "assets/portal-hero.png",
    "assets/renderer-inject.js",
    "assets/safe-css-policy.json",
    "assets/safe-css-validator.mjs",
    "assets/selectors.json",
    "assets/theme-package-validator.mjs",
    "assets/theme.json",
    "presets/preset-gothic-void-crusade/background.jpg",
    "presets/preset-gothic-void-crusade/theme.json",
    "scripts/apply-from-menubar-macos.sh",
    "scripts/apply-community-theme-macos.sh",
    "scripts/check-update-macos.sh",
    "scripts/common-macos.sh",
    "scripts/customize-theme-macos.sh",
    "scripts/doctor-macos.sh",
    "scripts/extract-theme-zip-macos.sh",
    "scripts/image-metadata.mjs",
    "scripts/import-theme-zip-macos.sh",
    "scripts/injector.mjs",
    "scripts/install-dream-skin-macos.sh",
    "scripts/load-image-theme-macos.sh",
    "scripts/localization-macos.sh",
    "scripts/pause-dream-skin-macos.sh",
    "scripts/publish-theme-import.mjs",
    "scripts/recover-theme-imports-macos.sh",
    "scripts/restore-dream-skin-macos.sh",
    "scripts/snapshot-active-theme-macos.sh",
    "scripts/snapshot-theme-zip.mjs",
    "scripts/stage-theme.mjs",
    "scripts/start-dream-skin-macos.sh",
    "scripts/status-dream-skin-macos.sh",
    "scripts/switch-theme-macos.sh",
    "scripts/theme-content-fingerprint.mjs",
    "scripts/theme-switch-lock-macos.sh",
    "scripts/theme-config.mjs",
    "scripts/validate-safe-css-file.mjs",
    "scripts/verify-dream-skin-macos.sh",
    "scripts/write-theme.mjs"
  ]

  private var homeURL: URL {
    fileManager.homeDirectoryForCurrentUser
  }

  private var installedEngineURL: URL {
    homeURL.appendingPathComponent(".codex/codex-dream-skin-studio", isDirectory: true)
  }

  private var stateRootURL: URL {
    homeURL.appendingPathComponent(
      "Library/Application Support/CodexDreamSkinStudio",
      isDirectory: true
    )
  }

  private var themesURL: URL {
    stateRootURL.appendingPathComponent("themes", isDirectory: true)
  }

  private var imagesURL: URL {
    stateRootURL.appendingPathComponent("images", isDirectory: true)
  }

  private var bundledEngineURL: URL? {
    Bundle.main.resourceURL?.appendingPathComponent("engine", isDirectory: true)
  }

  private var appVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
  }

  private var selectedLanguage: DreamSkinLanguage {
    get { DreamSkinLanguage.stored() }
    set { UserDefaults.standard.set(newValue.rawValue, forKey: DreamSkinLanguage.defaultsKey) }
  }

  private var copy: DreamSkinCopy {
    DreamSkinCopy(language: selectedLanguage)
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    configureStatusItem()
    ensureUserDirectories()
    cleanupStalePrivateOperationDirectories()
    migrateLegacySwiftBarIfNeeded()
    installBundledEngineIfNeeded(force: false)
    refreshStatus()
    refreshTimer = Timer.scheduledTimer(
      timeInterval: 10,
      target: self,
      selector: #selector(refreshStatusFromTimer),
      userInfo: nil,
      repeats: true
    )
    UNUserNotificationCenter.current().delegate = self
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in
      // Silent either way: an update banner is a courtesy, not something worth
      // nagging a user who declined notifications to re-enable.
    }
    updateCheckTimer = Timer.scheduledTimer(
      withTimeInterval: 24 * 60 * 60,
      repeats: true
    ) { [weak self] _ in
      self?.performBackgroundUpdateCheck()
    }
    // Fire once shortly after launch instead of waiting a full day for the
    // first check.
    DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
      self?.performBackgroundUpdateCheck()
    }
  }

  func applicationWillTerminate(_ notification: Notification) {
    refreshTimer?.invalidate()
    updateCheckTimer?.invalidate()
    communityHTTP.invalidate()
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard !operationInFlight, !engineInstallInFlight, !themeRecoveryInFlight, !snapshot.busy else {
      showError(
        title: copy.text(.busyTitle),
        message: copy.text(.busyMessage)
      )
      return .terminateCancel
    }
    return .terminateNow
  }

  func application(_ application: NSApplication, open urls: [URL]) {
    guard urls.count == 1,
          let versionID = CommunityThemeContract.versionID(from: urls[0]) else {
      showError(
        title: copy.text(.invalidLinkTitle),
        message: copy.text(.invalidLinkMessage)
      )
      return
    }
    beginCommunityThemeApply(versionID: versionID)
  }

  func menuNeedsUpdate(_ menu: NSMenu) {
    rebuildMenu()
    refreshStatus()
  }

  private func configureStatusItem() {
    menu.delegate = self
    menu.autoenablesItems = false
    statusItem.menu = menu
    guard let button = statusItem.button else { return }
    // 菜单栏模板剪影：与 dreamskin.cc favicon 同源的品牌 mark
    // （圆角方描边 + 墨色对角半区）。模板图仅黑 + 透明，青点在
    // 此尺寸下省略，避免糊成噪点。
    let mark = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { rect in
      let inset = rect.insetBy(dx: 1, dy: 1)
      let rounded = NSBezierPath(roundedRect: inset, xRadius: 5.2, yRadius: 5.2)
      NSColor.black.setStroke()
      rounded.lineWidth = 1.4
      rounded.stroke()
      NSGraphicsContext.current?.saveGraphicsState()
      rounded.addClip()
      let diagonal = NSBezierPath()
      diagonal.move(to: NSPoint(x: inset.minX, y: inset.maxY))
      diagonal.line(to: NSPoint(x: inset.maxX, y: inset.minY))
      diagonal.line(to: NSPoint(x: inset.maxX, y: inset.maxY))
      diagonal.close()
      NSColor.black.setFill()
      diagonal.fill()
      NSGraphicsContext.current?.restoreGraphicsState()
      return true
    }
    mark.isTemplate = true
    mark.accessibilityDescription = "Codex Dream Skin"
    button.image = mark
    button.toolTip = "Codex Dream Skin"
    rebuildMenu()
  }

  private func ensureUserDirectories() {
    for directory in [stateRootURL, themesURL, imagesURL] {
      do {
        try fileManager.createDirectory(
          at: directory,
          withIntermediateDirectories: true,
          attributes: [.posixPermissions: 0o700]
        )
        try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
      } catch {
        showError(title: copy.text(.prepareDirectoryTitle), message: error.localizedDescription)
        break
      }
    }
  }

  private func cleanupStalePrivateOperationDirectories() {
    let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
    let allowedPrefixes = [".community-apply-", ".theme-switch.", ".theme-import-work."]
    let rootPath = stateRootURL.standardizedFileURL.path + "/"
    guard let entries = try? fileManager.contentsOfDirectory(
      at: stateRootURL,
      includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey, .contentModificationDateKey],
      options: []
    ) else { return }

    for entry in entries {
      let name = entry.lastPathComponent
      guard name != ".theme-switch.lock",
            allowedPrefixes.contains(where: name.hasPrefix),
            entry.standardizedFileURL.path.hasPrefix(rootPath),
            let values = try? entry.resourceValues(
              forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .contentModificationDateKey]
            ),
            values.isDirectory == true,
            values.isSymbolicLink != true,
            let modified = values.contentModificationDate,
            modified < cutoff else { continue }
      if name.hasPrefix(".community-apply-"),
         (try? CommunityRecovery.validatedRollbackSnapshot(
           operationRoot: entry,
           stateRoot: stateRootURL,
           fileManager: fileManager
         )) != nil {
        continue
      }
      do {
        try fileManager.removeItem(at: entry)
      } catch {
        NSLog("[DreamSkin] stale private operation cleanup failed for %@: %@", name, error.localizedDescription)
      }
    }
  }

  private func rebuildMenu() {
    menu.removeAllItems()
    addDisabledItem(copy.statusTitle(session: snapshot.session, operation: snapshot.operation))
    if !snapshot.appliedThemeName.isEmpty && snapshot.session == "active" {
      addDisabledItem(copy.format(.appliedTheme, cleanMenuText(snapshot.appliedThemeName)))
    }
    if !snapshot.themeName.isEmpty && snapshot.themeName != snapshot.appliedThemeName {
      addDisabledItem(copy.format(.selectedThemePending, cleanMenuText(snapshot.themeName)))
    } else if snapshot.appliedThemeName.isEmpty && !snapshot.themeName.isEmpty {
      addDisabledItem(copy.format(.selectedTheme, cleanMenuText(snapshot.themeName)))
    }
    addDisabledItem(copy.text(snapshot.codexRunning ? .codexOpen : .codexClosed))
    if !snapshot.operationMessage.isEmpty {
      addDisabledItem(cleanMenuText(snapshot.operationMessage))
    }
    if !communityStageMessage.isEmpty {
      addDisabledItem(cleanMenuText(communityStageMessage))
    }
    addDisabledItem(copy.format(.version, appVersion))

    menu.addItem(.separator())
    if let availableUpdate {
      addActionItem(
        copy.format(.newVersion, availableUpdate.version),
        action: #selector(openAvailableUpdate)
      )
      menu.addItem(.separator())
    }
    let busy = operationInFlight || engineInstallInFlight || themeRecoveryInFlight || snapshot.busy
    let needsEngineInstall = engineNeedsInstall()

    let applyTitle: String
    switch snapshot.session {
    case "active": applyTitle = copy.text(.reapply)
    case "stale", "unknown": applyTitle = copy.text(.repairApply)
    default: applyTitle = copy.text(.apply)
    }
    addActionItem(applyTitle, action: #selector(applySkin), enabled: !busy)
    if snapshot.session == "active" || snapshot.session == "applying" {
      addActionItem(copy.text(.pause), action: #selector(pauseSkin), enabled: !busy)
    }
    addActionItem(copy.text(.openChatGPT), action: #selector(openCodex), enabled: !busy)

    menu.addItem(.separator())
    addThemeMenu(enabled: !busy)
    addLinksMenu()

    menu.addItem(.separator())
    addLanguageMenu()
    let loginItem = addActionItem(copy.text(.loginAtStartup), action: #selector(toggleLoginItem))
    loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
    addMaintenanceMenu(enabled: !busy, needsEngineInstall: needsEngineInstall)

    menu.addItem(.separator())
    addActionItem(copy.text(.quit), action: #selector(quit), enabled: !busy)
  }

  private func addThemeMenu(enabled: Bool) {
    let root = NSMenuItem(title: copy.text(.themeMenu), action: nil, keyEquivalent: "")
    let submenu = NSMenu(title: copy.text(.themeMenu))
    submenu.autoenablesItems = false
    addActionItem(copy.text(.changeBackground), action: #selector(chooseBackgroundImage), enabled: enabled, to: submenu)
    addActionItem(copy.text(.importZip), action: #selector(chooseThemeArchive), enabled: enabled, to: submenu)
    addSavedThemesMenu(enabled: enabled, to: submenu)
    submenu.addItem(.separator())
    addActionItem(copy.text(.openThemes), action: #selector(openThemesFolder), to: submenu)
    addActionItem(copy.text(.openImages), action: #selector(openImagesFolder), to: submenu)
    root.submenu = submenu
    menu.addItem(root)
  }

  private func addLinksMenu() {
    let root = NSMenuItem(title: copy.text(.linksMenu), action: nil, keyEquivalent: "")
    let submenu = NSMenu(title: copy.text(.linksMenu))
    submenu.autoenablesItems = false
    addActionItem(copy.text(.gallery), action: #selector(openThemeGallery), to: submenu)
    addActionItem(copy.text(.studio), action: #selector(openOnlineStudio), to: submenu)
    addActionItem(copy.text(.openSite), action: #selector(openDreamSkinWebsite), to: submenu)
    root.submenu = submenu
    menu.addItem(root)
  }

  private func addMaintenanceMenu(enabled: Bool, needsEngineInstall: Bool) {
    let root = NSMenuItem(title: copy.text(.maintenanceMenu), action: nil, keyEquivalent: "")
    let submenu = NSMenu(title: copy.text(.maintenanceMenu))
    submenu.autoenablesItems = false
    if engineInstallInFlight {
      addDisabledItem(copy.text(.installingEngine), to: submenu)
    } else {
      addActionItem(
        copy.text(needsEngineInstall ? .installEngine : .repairEngine),
        action: #selector(reinstallEngine),
        enabled: enabled,
        to: submenu
      )
    }
    addActionItem(
      copy.text(.checkUpdate),
      action: #selector(checkForUpdates),
      enabled: !operationInFlight && !updateCheckInFlight,
      to: submenu
    )
    if !legacyPluginURLs().isEmpty {
      addActionItem(copy.text(.disableSwiftBar), action: #selector(disableLegacySwiftBarFromMenu), to: submenu)
    }
    submenu.addItem(.separator())
    addActionItem(
      copy.text(.restoreUninstall),
      action: #selector(restoreAndUninstall),
      enabled: enabled,
      to: submenu
    )
    root.submenu = submenu
    menu.addItem(root)
  }

  private func addLanguageMenu() {
    let root = NSMenuItem(title: copy.text(.languageMenu), action: nil, keyEquivalent: "")
    let submenu = NSMenu(title: copy.text(.languageMenu))
    submenu.autoenablesItems = false
    for language in DreamSkinLanguage.allCases {
      let item = addActionItem(
        language.displayName,
        action: #selector(selectLanguage(_:)),
        to: submenu
      )
      item.representedObject = language.rawValue
      item.state = language == selectedLanguage ? .on : .off
    }
    root.submenu = submenu
    menu.addItem(root)
  }

  @objc private func selectLanguage(_ sender: NSMenuItem) {
    guard let raw = sender.representedObject as? String,
          let language = DreamSkinLanguage(rawValue: raw) else { return }
    selectedLanguage = language
    communityStageMessage = ""
    refreshStatus()
    rebuildMenu()
  }

  @discardableResult
  private func addActionItem(
    _ title: String,
    action: Selector,
    enabled: Bool = true,
    to destination: NSMenu? = nil
  ) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
    item.target = self
    item.isEnabled = enabled
    (destination ?? menu).addItem(item)
    return item
  }

  private func addDisabledItem(_ title: String, to destination: NSMenu? = nil) {
    let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    item.isEnabled = false
    (destination ?? menu).addItem(item)
  }

  private func addSavedThemesMenu(enabled: Bool, to destination: NSMenu? = nil) {
    let root = NSMenuItem(title: copy.text(.savedThemes), action: nil, keyEquivalent: "")
    let submenu = NSMenu(title: copy.text(.savedThemes))
    submenu.autoenablesItems = false
    let themes = savedThemes()
    if themes.isEmpty {
      addDisabledItem(copy.text(.noSavedThemes), to: submenu)
    } else {
      for theme in themes {
        let item = addActionItem(
          theme.name,
          action: #selector(switchSavedTheme(_:)),
          enabled: enabled,
          to: submenu
        )
        item.representedObject = theme.id
        if theme.id == snapshot.themeID {
          item.state = .on
        }
      }
    }
    root.submenu = submenu
    (destination ?? menu).addItem(root)
  }

  private func savedThemes() -> [SavedThemeOption] {
    let entries: [URL]
    do {
      entries = try fileManager.contentsOfDirectory(
        at: themesURL,
        includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
        options: [.skipsHiddenFiles]
      )
    } catch {
      NSLog(
        "[DreamSkin] savedThemes: list %@ failed: %@",
        themesURL.path, String(describing: error)
      )
      return []
    }
    // 包含性判断必须用 canonicalPath：用户记录的 home 大小写可能与磁盘目录
    // 不一致（如 NFSHomeDirectory=/Users/Fei、磁盘实际为 /Users/fei），
    // 字符串前缀比较会把全部主题误拒成 rejected["root"]。
    let canonicalRoot =
      (((try? themesURL.resourceValues(forKeys: [.canonicalPathKey]))?.canonicalPath)
        ?? themesURL.standardizedFileURL.path) + "/"
    var rejected: [String: Int] = [:]
    let options: [SavedThemeOption] = entries.compactMap { directory in
      let id = directory.lastPathComponent
      guard id.range(of: #"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$"#, options: .regularExpression) != nil else {
        rejected["name", default: 0] += 1
        return nil
      }
      guard let values = try? directory.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]),
            values.isDirectory == true,
            values.isSymbolicLink != true else {
        rejected["kind", default: 0] += 1
        return nil
      }
      let entryPath =
        ((try? directory.resourceValues(forKeys: [.canonicalPathKey]))?.canonicalPath)
          ?? directory.standardizedFileURL.path
      guard entryPath.hasPrefix(canonicalRoot) else {
        rejected["root", default: 0] += 1
        return nil
      }
      let configURL = directory.appendingPathComponent("theme.json")
      guard let data = try? Data(contentsOf: configURL, options: [.mappedIfSafe]),
            data.count <= 1_048_576 else {
        rejected["read", default: 0] += 1
        return nil
      }
      guard let object = try? JSONSerialization.jsonObject(with: data),
            let value = object as? [String: Any] else {
        rejected["json", default: 0] += 1
        return nil
      }
      let rawName = value["name"] as? String ?? id
      return SavedThemeOption(id: id, name: cleanMenuText(rawName))
    }
    let deduplicated = deduplicatedSavedThemes(options, currentThemeID: snapshot.themeID).sorted {
      $0.name.localizedStandardCompare($1.name) == .orderedAscending
    }
    // 空列表或有拒收时落一条统一日志：`log show --predicate 'process ==
    // "CodexDreamSkinMenuBar"'` 可直接定位是哪一层过滤把主题吃掉了。
    if options.isEmpty || !rejected.isEmpty {
      NSLog(
        "[DreamSkin] savedThemes: %d entries -> %d themes at %@ rejected=%@",
        entries.count, options.count, themesURL.path, String(describing: rejected)
      )
    }
    return deduplicated
  }

  private func cleanMenuText(_ source: String) -> String {
    let filtered = source.unicodeScalars.map { scalar -> Character in
      CharacterSet.controlCharacters.contains(scalar) || scalar == "|" ? " " : Character(scalar)
    }
    let value = String(filtered).trimmingCharacters(in: .whitespacesAndNewlines)
    return String(value.prefix(120))
  }

  @objc private func refreshStatusFromTimer() {
    refreshStatus()
  }

  private func refreshStatus() {
    guard !statusRefreshRunning,
          let script = installedScript(named: "status-dream-skin-macos.sh") else {
      return
    }
    statusRefreshRunning = true
    ScriptRunner.run(script: script, arguments: ["--json"]) { [weak self] result in
      guard let self else { return }
      self.statusRefreshRunning = false
      if result.succeeded,
         let parsed = StatusSnapshot(jsonData: Data(result.output.utf8)) {
        self.snapshot = parsed
        self.statusItem.button?.toolTip = "Codex Dream Skin · \(self.copy.statusTitle(session: parsed.session, operation: parsed.operation))"
        self.statusItem.button?.appearsDisabled = parsed.session == "unknown" || parsed.session == "stale"
        self.rebuildMenu()
      }
    }
  }

  @objc private func applySkin() {
    runInstalledScript(named: "apply-from-menubar-macos.sh", operation: copy.text(.apply))
  }

  @objc private func pauseSkin() {
    runInstalledScript(named: "pause-dream-skin-macos.sh", operation: copy.text(.pause))
  }

  @objc private func reinstallEngine() {
    guard !operationInFlight, !snapshot.busy else { return }
    installBundledEngineIfNeeded(force: true)
  }

  @objc private func chooseBackgroundImage() {
    let panel = NSOpenPanel()
    panel.title = copy.text(.changeBackground)
    panel.prompt = copy.resolvedLanguage == .chinese ? "选择" : "Choose"
    panel.canChooseDirectories = false
    panel.canChooseFiles = true
    panel.allowsMultipleSelection = false
    panel.allowedContentTypes = [.png, .jpeg, .webP, .heic, .tiff]
    activateForUserInteraction()
    guard panel.runModal() == .OK, let imageURL = panel.url else { return }
    runInstalledScript(
      named: "load-image-theme-macos.sh",
      arguments: ["--file", imageURL.path],
      operation: copy.text(.changeBackground).replacingOccurrences(of: "…", with: "")
    )
  }

  @objc private func chooseThemeArchive() {
    let panel = NSOpenPanel()
    panel.title = copy.text(.importZip)
    panel.prompt = copy.resolvedLanguage == .chinese ? "导入" : "Import"
    panel.canChooseDirectories = false
    panel.canChooseFiles = true
    panel.allowsMultipleSelection = false
    panel.allowedContentTypes = [.zip]
    activateForUserInteraction()
    guard panel.runModal() == .OK, let archiveURL = panel.url else { return }
    importThemeArchive(archiveURL)
  }

  private func beginCommunityThemeApply(versionID: String) {
    guard !operationInFlight, !snapshot.busy else {
      showError(title: copy.text(.cannotApplyTitle), message: copy.text(.cannotApplyMessage))
      return
    }
    if engineInstallInFlight {
      pendingCommunityVersionID = versionID
      return
    }
    if engineNeedsInstall() {
      pendingCommunityVersionID = versionID
      installBundledEngineIfNeeded(force: false)
      return
    }
    guard let metadataURL = CommunityThemeContract.metadataURL(for: versionID) else {
      showError(title: copy.text(.invalidLinkTitle), message: copy.text(.invalidThemeMessage))
      return
    }
    guard let statusScript = installedScript(named: "status-dream-skin-macos.sh") else {
      showError(title: copy.text(.missingEngineTitle), message: copy.text(.missingEngineCommunityMessage))
      return
    }

    operationInFlight = true
    updateCommunityStage(copy.resolvedLanguage == .chinese
      ? "正在确认当前皮肤可安全回滚…"
      : "Checking that the current skin can be safely restored…")
    ScriptRunner.run(script: statusScript, arguments: ["--json", "--deep"]) { [weak self] result in
      guard let self else { return }
      guard result.succeeded,
            let current = StatusSnapshot(jsonData: Data(result.output.utf8)),
            current.isReadyForCommunityApply else {
        self.finishThemeOperation()
        self.showError(
          title: self.copy.text(.baselineTitle),
          message: self.copy.text(.baselineMessage)
        )
        return
      }
      self.communityBaselineThemeID = current.themeID
      self.fetchCommunityThemeMetadata(versionID: versionID, metadataURL: metadataURL)
    }
  }

  private func fetchCommunityThemeMetadata(versionID: String, metadataURL: URL) {
    updateCommunityStage(copy.resolvedLanguage == .chinese
      ? "正在读取已审核主题信息…"
      : "Loading approved theme metadata…")
    communityHTTP.get(
      metadataURL,
      accept: "application/json",
      maximumBytes: 65_536
    ) { [weak self] result in
      DispatchQueue.main.async {
        guard let self else { return }
        guard case let .success(payload) = result,
              self.mediaType(of: payload.response) == "application/json",
              !payload.body.isEmpty else {
          self.finishThemeOperation()
          self.showError(
            title: self.copy.text(.readThemeTitle),
            message: self.copy.text(.readThemeMessage)
          )
          return
        }
        do {
          let decoded = try JSONDecoder().decode(CommunityThemeMetadata.self, from: payload.body)
          let metadata = try decoded.validated(expectedVersionID: versionID)
          self.confirmCommunityThemeApply(metadata)
        } catch {
          self.finishThemeOperation()
          self.showError(
            title: self.copy.text(.validationTitle),
            message: error.localizedDescription
          )
        }
      }
    }
  }

  private func confirmCommunityThemeApply(_ metadata: CommunityThemeMetadata) {
    updateCommunityStage(copy.resolvedLanguage == .chinese
      ? "等待确认：\(cleanMenuText(metadata.name))"
      : "Waiting for confirmation: \(cleanMenuText(metadata.name))")
    let size = ByteCountFormatter.string(fromByteCount: metadata.packageBytes, countStyle: .file)
    let alert = NSAlert()
    let name = cleanMenuText(metadata.name)
    let author = cleanMenuText(metadata.authorDisplayName)
    if copy.resolvedLanguage == .chinese {
      alert.messageText = "从 DreamSkin.cc 应用“\(name)”？"
      alert.informativeText = """
      作者：\(author)
      版本：\(metadata.version) · \(size)
      SHA-256：\(metadata.packageSha256)

      客户端会从固定官方 API 下载，核对完整哈希，并重新执行 ZIP、清单与 Safe CSS 校验。导入和应用前不会运行主题中的任意命令。

      如果 ChatGPT 当前没有安全调试连接，应用时会重启 ChatGPT；请先保存未发送的输入。
      """
    } else {
      alert.messageText = "Apply “\(name)” from DreamSkin.cc?"
      alert.informativeText = """
      Author: \(author)
      Version: \(metadata.version) · \(size)
      SHA-256: \(metadata.packageSha256)

      The client downloads from the fixed official API, verifies the full hash, and reruns the ZIP, manifest, and Safe CSS checks. It does not execute commands from the theme before importing or applying it.

      ChatGPT may restart if no safe debug connection is active. Save any unsent input first.
      """
    }
    alert.addButton(withTitle: copy.resolvedLanguage == .chinese ? "下载并应用" : "Download and apply")
    alert.addButton(withTitle: copy.resolvedLanguage == .chinese ? "取消" : "Cancel")
    activateForUserInteraction()
    guard alert.runModal() == .alertFirstButtonReturn else {
      finishThemeOperation()
      return
    }
    downloadCommunityTheme(metadata)
  }

  private func downloadCommunityTheme(_ metadata: CommunityThemeMetadata) {
    guard let downloadURL = CommunityThemeContract.downloadURL(for: metadata.id) else {
      finishThemeOperation()
      showError(title: copy.text(.downloadThemeTitle), message: copy.text(.downloadThemeMessage))
      return
    }
    updateCommunityStage(copy.resolvedLanguage == .chinese ? "正在下载主题包…" : "Downloading theme package…")
    communityHTTP.get(
      downloadURL,
      accept: "application/zip",
      maximumBytes: Int(metadata.packageBytes)
    ) { [weak self] result in
      guard let self else { return }
      var downloadRoot: URL?
      do {
        guard case let .success(payload) = result,
              self.mediaType(of: payload.response) == "application/zip",
              payload.response.expectedContentLength < 0
                || payload.response.expectedContentLength == metadata.packageBytes,
              payload.body.count == Int(metadata.packageBytes) else {
          throw CommunityThemeContractError.invalidPackageIdentity
        }

        let root = self.stateRootURL.appendingPathComponent(
          ".community-apply-\(UUID().uuidString)",
          isDirectory: true
        )
        downloadRoot = root
        try self.fileManager.createDirectory(
          at: root,
          withIntermediateDirectories: false,
          attributes: [.posixPermissions: 0o700]
        )
        let archiveURL = root.appendingPathComponent("theme.zip")
        guard self.fileManager.createFile(
          atPath: archiveURL.path,
          contents: payload.body,
          attributes: [.posixPermissions: 0o600]
        ) else {
          throw CommunityThemeContractError.invalidPackageIdentity
        }
        try self.fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: archiveURL.path)
        let actualHash = try self.sha256(of: archiveURL)
        guard actualHash == metadata.packageSha256 else {
          throw CommunityThemeContractError.invalidPackageIdentity
        }
        DispatchQueue.main.async {
          self.updateCommunityStage(self.copy.resolvedLanguage == .chinese
            ? "下载完成，正在执行严格导入校验…"
            : "Download complete; running strict import validation…")
          self.performThemeImport(
            archiveURL,
            cleanupRoot: root,
            applyAfterImport: true,
            communityMetadata: metadata
          )
        }
      } catch {
        if let downloadRoot {
          try? self.fileManager.removeItem(at: downloadRoot)
        }
        DispatchQueue.main.async {
          self.finishThemeOperation()
          self.showError(
            title: self.copy.text(.downloadValidationTitle),
            message: self.copy.format(.downloadValidationMessage, error.localizedDescription)
          )
        }
      }
    }
  }

  private func mediaType(of response: HTTPURLResponse) -> String {
    guard let value = response.value(forHTTPHeaderField: "Content-Type") else { return "" }
    return value.split(separator: ";", maxSplits: 1)[0]
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .lowercased()
  }

  private func sha256(of url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var digest = SHA256()
    while true {
      let data = try handle.read(upToCount: 1024 * 1024) ?? Data()
      if data.isEmpty { break }
      digest.update(data: data)
    }
    return digest.finalize().map { String(format: "%02x", $0) }.joined()
  }

  private func importThemeArchive(_ archiveURL: URL) {
    guard !operationInFlight, !snapshot.busy else { return }
    operationInFlight = true
    rebuildMenu()
    performThemeImport(archiveURL)
  }

  private func performThemeImport(
    _ archiveURL: URL,
    cleanupRoot: URL? = nil,
    applyAfterImport: Bool = false,
    communityMetadata: CommunityThemeMetadata? = nil
  ) {
    guard let script = installedScript(named: "import-theme-zip-macos.sh") else {
      finishThemeOperation(cleanupRoot: cleanupRoot)
      showError(title: copy.text(.missingEngineTitle), message: copy.text(.missingEngineImportMessage))
      return
    }
    var importArguments = ["--file", archiveURL.path]
    if let communityMetadata {
      importArguments += [
        "--expected-sha256", communityMetadata.packageSha256,
        "--expected-bytes", String(communityMetadata.packageBytes)
      ]
    }
    ScriptRunner.run(script: script, arguments: importArguments) { [weak self] result in
      guard let self else { return }
      guard result.succeeded,
            let data = result.output.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data),
            let value = object as? [String: Any],
            let status = value["status"] as? String,
            let rawName = value["name"] as? String,
            let rawID = value["id"] as? String else {
        self.finishThemeOperation(cleanupRoot: cleanupRoot)
        self.showError(
          title: self.copy.text(.importFailedTitle),
          message: self.conciseOutput(result.output, fallback: self.copy.text(.invalidZipMessage))
        )
        return
      }
      let name = self.cleanMenuText(rawName)
      let id = self.cleanMenuText(rawID)
      let safeCssStatus = value["safeCssStatus"] as? String ?? "none"
      let signatureIgnored = value["signatureIgnored"] as? Bool ?? false
      let cleanupWarning = !(value["cleanupWarning"] as? String ?? "")
        .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      if applyAfterImport {
        guard (status == "imported" || status == "duplicate"),
              safeCssStatus == "validated",
              let contentFingerprint = value["contentFingerprint"] as? String,
              contentFingerprint.range(
                of: #"^[0-9a-f]{64}$"#,
                options: .regularExpression
              ) != nil else {
          self.finishThemeOperation(cleanupRoot: cleanupRoot)
          self.showError(
            title: self.copy.text(.downloadedNotAppliedTitle),
            message: self.copy.text(.downloadedNotAppliedMessage)
          )
          return
        }
        self.captureActiveThemeThenApplyImported(
          id: id,
          name: name,
          expectedContentFingerprint: contentFingerprint,
          cleanupRoot: cleanupRoot,
          metadata: communityMetadata,
          cleanupWarning: cleanupWarning
        )
        return
      }
      if status == "duplicate" {
        var details = self.copy.format(.duplicateBase, name)
        if safeCssStatus == "validated" {
          details += self.copy.text(.duplicateCSS)
        }
        if signatureIgnored {
          details += self.copy.text(.signatureIgnored)
        }
        self.finishThemeOperation(cleanupRoot: cleanupRoot)
        self.showInfo(
          title: self.copy.text(.duplicateTitle),
          message: details
        )
        return
      }
      let renamed = value["renamed"] as? Bool ?? false
      let replaced = value["replaced"] as? Bool ?? false
      let nameCollision = value["nameCollision"] as? Bool ?? false
      var details = replaced
        ? self.copy.format(.importedUpdated, name)
        : self.copy.format(.importedAdded, name)
      if renamed {
        details += self.copy.format(.renamed, id)
      }
      if nameCollision {
        details += self.copy.text(.nameCollision)
      }
      if safeCssStatus == "validated" {
        details += self.copy.text(.cssValidated)
      }
      if signatureIgnored {
        details += self.copy.text(.signatureIgnored)
      }
      if cleanupWarning {
        details += self.copy.text(.cleanupWarning)
      }
      self.finishThemeOperation(cleanupRoot: cleanupRoot)
      self.showInfo(title: self.copy.text(.importCompleteTitle), message: details)
    }
  }

  private func captureActiveThemeThenApplyImported(
    id: String,
    name: String,
    expectedContentFingerprint: String,
    cleanupRoot: URL?,
    metadata: CommunityThemeMetadata?,
    cleanupWarning: Bool
  ) {
    guard CommunityThemeContract.isVersionID(metadata?.id ?? ""),
          id.range(of: #"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$"#, options: .regularExpression) != nil,
          expectedContentFingerprint.range(
            of: #"^[0-9a-f]{64}$"#,
            options: .regularExpression
          ) != nil,
          let cleanupRoot,
          !communityBaselineThemeID.isEmpty,
          let transactionScript = installedScript(named: "apply-community-theme-macos.sh") else {
      finishThemeOperation(cleanupRoot: cleanupRoot)
      showError(
        title: copy.text(.importedApplyTitle),
        message: copy.text(.importedApplyMessage)
      )
      return
    }
    reactivateCodexBeforeTransaction()
    updateCommunityStage(copy.resolvedLanguage == .chinese
      ? "正在保存当前主题、应用新主题并验证渲染…"
      : "Saving the current theme, applying the new theme, and verifying rendering…")
    ScriptRunner.run(
      script: transactionScript,
      arguments: [
        "--id", id,
        "--expect-fingerprint", expectedContentFingerprint,
        "--expect-active-id", communityBaselineThemeID,
        "--transaction-root", cleanupRoot.path
      ]
    ) { [weak self] result in
      guard let self else { return }
      let rollbackRetention = !result.succeeded && result.exitCode != 20
        ? self.preserveCommunityRollbackSnapshot(from: cleanupRoot)
        : .unavailable
      self.finishThemeOperation(
        cleanupRoot: rollbackRetention.requiresOperationRoot ? nil : cleanupRoot
      )
      if result.succeeded {
        var details = self.copy.format(.appliedMessage, name)
        if cleanupWarning {
          details += "\n" + self.copy.text(.cleanupWarning)
        }
        self.showInfo(
          title: self.copy.text(.appliedTitle),
          message: details
        )
      } else if result.exitCode == 20 {
        self.showError(
          title: self.copy.text(.rollbackTitle),
          message: self.copy.format(
            .rollbackMessage,
            self.conciseOutput(
              result.output,
              fallback: self.copy.resolvedLanguage == .chinese
                ? "新主题仍保存在主题库中。"
                : "The new theme remains in Saved themes."
            )
          )
        )
      } else {
        var details = self.conciseOutput(
          result.output,
          fallback: self.copy.resolvedLanguage == .chinese
            ? "请从已保存主题中重新选择一个主题。"
            : "Choose a theme again from Saved themes."
        )
        let title: String
        switch rollbackRetention {
        case let .preserved(recoveryURL):
          title = self.copy.resolvedLanguage == .chinese
            ? "自动恢复未完成，原主题快照已保留"
            : "Automatic recovery did not finish; original snapshot retained"
          details += self.copy.resolvedLanguage == .chinese
            ? "\n\n换肤前的精确主题快照已移入私有恢复目录：\n\(recoveryURL.path)\n该快照尚未通过恢复验证，请不要把“已保留”理解为已经恢复。"
            : "\n\nThe exact pre-apply snapshot was moved to this private recovery folder:\n\(recoveryURL.path)\nThe snapshot has not passed restore verification; retained does not mean restored."
        case let .retainedInOperationRoot(snapshotURL):
          title = self.copy.resolvedLanguage == .chinese
            ? "自动恢复未完成，快照仍在事务目录"
            : "Automatic recovery did not finish; snapshot remains in transaction folder"
          details += self.copy.resolvedLanguage == .chinese
            ? "\n\n客户端无法把快照提升到 recovery 目录，但已停止清理原事务目录，并检测到快照仍位于：\n\(snapshotURL.path)\n该快照尚未通过恢复验证，请不要继续切换主题。"
            : "\n\nThe client could not move the snapshot into the recovery folder, so it stopped cleaning the transaction folder. The snapshot remains at:\n\(snapshotURL.path)\nIt has not passed restore verification. Do not switch themes again yet."
        case .unavailable:
          title = self.copy.text(.unconfirmedTitle)
          details += self.copy.resolvedLanguage == .chinese
            ? "\n\n客户端没有确认到可保留的换肤前快照，不能承诺可自动恢复。请不要继续切换主题，并查看 Dream Skin 日志。"
            : "\n\nThe client could not confirm a retainable pre-apply snapshot, so automatic recovery cannot be promised. Do not switch themes again; check the Dream Skin logs."
        }
        self.showError(
          title: title,
          message: self.copy.format(.unconfirmedMessage, details)
        )
      }
    }
  }

  private func preserveCommunityRollbackSnapshot(from operationRoot: URL) -> CommunityRollbackRetention {
    do {
      return .preserved(
        try CommunityRecovery.preserveRollbackSnapshot(
          operationRoot: operationRoot,
          stateRoot: stateRootURL,
          fileManager: fileManager
        )
      )
    } catch {
      NSLog("[DreamSkin] rollback snapshot retention failed: %@", error.localizedDescription)
      if let snapshot = try? CommunityRecovery.validatedRollbackSnapshot(
        operationRoot: operationRoot,
        stateRoot: stateRootURL,
        fileManager: fileManager
      ) {
        return .retainedInOperationRoot(snapshot)
      }
      return .unavailable
    }
  }

  private func finishThemeOperation(cleanupRoot: URL? = nil) {
    if let cleanupRoot { try? fileManager.removeItem(at: cleanupRoot) }
    communityBaselineThemeID = ""
    communityStageMessage = ""
    operationInFlight = false
    refreshStatus()
    rebuildMenu()
  }

  private func updateCommunityStage(_ message: String) {
    communityStageMessage = message
    rebuildMenu()
  }

  @objc private func switchSavedTheme(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String,
          id.range(of: #"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$"#, options: .regularExpression) != nil else {
      showError(title: copy.text(.invalidThemeTitle), message: copy.text(.invalidThemeMessage))
      return
    }
    runInstalledScript(
      named: "switch-theme-macos.sh",
      arguments: ["--id", id],
      operation: copy.resolvedLanguage == .chinese ? "切换主题" : "Switch theme"
    )
  }

  @objc private func openImagesFolder() {
    ensureUserDirectories()
    NSWorkspace.shared.open(imagesURL)
  }

  @objc private func openThemesFolder() {
    ensureUserDirectories()
    NSWorkspace.shared.open(themesURL)
  }

  @objc private func openCodex() {
    guard let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.openai.codex") else {
      showError(title: copy.text(.notFoundTitle), message: copy.text(.notFoundMessage))
      return
    }
    guard !operationInFlight else { return }
    guard !engineNeedsInstall(),
          let script = installedScript(named: "start-dream-skin-macos.sh") else {
      let configuration = NSWorkspace.OpenConfiguration()
      NSWorkspace.shared.openApplication(at: appURL, configuration: configuration) { _, error in
        if let error {
          DispatchQueue.main.async {
            self.showError(title: self.copy.text(.openFailedTitle), message: error.localizedDescription)
          }
        }
      }
      return
    }
    operationInFlight = true
    rebuildMenu()
    ScriptRunner.run(script: script) { [weak self] result in
      guard let self else { return }
      self.operationInFlight = false
      self.refreshStatus()
      self.rebuildMenu()
      if !result.succeeded {
        self.showError(
          title: self.copy.text(.openFailedTitle),
          message: self.conciseOutput(result.output, fallback: self.copy.text(.openFailedMessage))
        )
      }
    }
  }

  @objc private func openDreamSkinWebsite() {
    guard let url = URL(string: "https://dreamskin.cc") else { return }
    NSWorkspace.shared.open(url)
  }

  @objc private func openThemeGallery() {
    guard let url = URL(string: "https://dreamskin.cc/gallery") else { return }
    NSWorkspace.shared.open(url)
  }

  @objc private func openOnlineStudio() {
    guard let url = URL(string: "https://dreamskin.cc/studio") else { return }
    NSWorkspace.shared.open(url)
  }

  @objc private func checkForUpdates() {
    guard !operationInFlight, !updateCheckInFlight else { return }
    guard let script = installedScript(named: "check-update-macos.sh")
      ?? bundledScript(named: "check-update-macos.sh") else {
      showError(title: copy.text(.updateMissingTitle), message: copy.text(.updateMissingMessage))
      return
    }
    operationInFlight = true
    updateCheckInFlight = true
    rebuildMenu()
    ScriptRunner.run(script: script, arguments: ["--json"]) { [weak self] result in
      guard let self else { return }
      self.operationInFlight = false
      self.updateCheckInFlight = false
      self.rebuildMenu()
      guard result.succeeded,
            let data = result.output.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data),
            let value = object as? [String: Any],
            let current = value["currentVersion"] as? String,
            let latest = value["latestVersion"] as? String,
            let available = value["updateAvailable"] as? Bool else {
        self.showError(
          title: self.copy.text(.updateFailedTitle),
          message: self.conciseOutput(result.output, fallback: self.copy.text(.updateFailedMessage))
        )
        return
      }
      if available {
        let alert = NSAlert()
        alert.messageText = self.copy.format(.newVersionTitle, latest)
        alert.informativeText = self.copy.format(.newVersionMessage, current)
        alert.addButton(withTitle: self.copy.text(.downloadNow))
        alert.addButton(withTitle: self.copy.text(.later))
        self.activateForUserInteraction()
        if alert.runModal() == .alertFirstButtonReturn,
           let url = URL(string: "https://github.com/Fei-Away/Codex-Dream-Skin/releases/latest") {
          NSWorkspace.shared.open(url)
        }
      } else {
        self.showInfo(
          title: self.copy.text(.upToDateTitle),
          message: self.copy.format(.upToDateMessage, current)
        )
      }
    }
  }

  /// Silent counterpart to `checkForUpdates()`: runs on a timer, never shows a
  /// modal, and only surfaces a system notification the first time a given
  /// version is seen so a user who dismisses it isn't renotified every day.
  private func performBackgroundUpdateCheck() {
    guard !operationInFlight, !updateCheckInFlight,
          let script = installedScript(named: "check-update-macos.sh")
            ?? bundledScript(named: "check-update-macos.sh") else { return }
    updateCheckInFlight = true
    ScriptRunner.run(script: script, arguments: ["--json"]) { [weak self] result in
      guard let self else { return }
      defer { self.updateCheckInFlight = false }
      guard result.succeeded,
            let data = result.output.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data),
            let value = object as? [String: Any],
            let latest = value["latestVersion"] as? String,
            let available = value["updateAvailable"] as? Bool else {
        // A transient network/API failure here just means we try again on the
        // next timer tick; unlike the manual check, there's no button press
        // waiting on an answer, so staying quiet is correct.
        return
      }
      guard available else {
        self.availableUpdate = nil
        self.rebuildMenu()
        return
      }
      let releaseURL = (value["releaseUrl"] as? String)
        ?? "https://github.com/Fei-Away/Codex-Dream-Skin/releases/latest"
      self.availableUpdate = (version: latest, releaseURL: releaseURL)
      self.rebuildMenu()
      let lastNotifiedKey = "lastNotifiedUpdateVersion"
      guard UserDefaults.standard.string(forKey: lastNotifiedKey) != latest else { return }
      UserDefaults.standard.set(latest, forKey: lastNotifiedKey)
      self.postUpdateAvailableNotification(version: latest, releaseURL: releaseURL)
    }
  }

  private func postUpdateAvailableNotification(version: String, releaseURL: String) {
    let content = UNMutableNotificationContent()
    if copy.resolvedLanguage == .chinese {
      content.title = "Codex Dream Skin 有新版本"
      content.body = "\(version) 已发布，点按前往下载页面。"
    } else {
      content.title = "Codex Dream Skin update available"
      content.body = "\(version) is available. Click to open the download page."
    }
    content.sound = .default
    content.userInfo = ["releaseURL": releaseURL]
    let request = UNNotificationRequest(
      identifier: "dreamskin-update-\(version)",
      content: content,
      trigger: nil
    )
    UNUserNotificationCenter.current().add(request)
  }

  @objc private func openAvailableUpdate() {
    guard let url = URL(string: availableUpdate?.releaseURL
      ?? "https://github.com/Fei-Away/Codex-Dream-Skin/releases/latest") else { return }
    NSWorkspace.shared.open(url)
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    if let urlString = response.notification.request.content.userInfo["releaseURL"] as? String,
       let url = URL(string: urlString) {
      NSWorkspace.shared.open(url)
    }
    completionHandler()
  }

  @objc private func toggleLoginItem() {
    do {
      if SMAppService.mainApp.status == .enabled {
        try SMAppService.mainApp.unregister()
      } else {
        try SMAppService.mainApp.register()
      }
      rebuildMenu()
      if SMAppService.mainApp.status == .requiresApproval {
        showInfo(
          title: copy.text(.loginApprovalTitle),
          message: copy.text(.loginApprovalMessage)
        )
      }
    } catch {
      showError(
        title: copy.text(.loginStartFailedTitle),
        message: copy.format(.loginStartFailedMessage, error.localizedDescription)
      )
    }
  }

  @objc private func disableLegacySwiftBarFromMenu() {
    disableLegacySwiftBarPlugins(confirmFirst: true)
  }

  @objc private func restoreAndUninstall() {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = copy.text(.restoreConfirmTitle)
    alert.informativeText = copy.text(.restoreConfirmMessage)
    alert.addButton(withTitle: copy.text(.restoreAndUninstall))
    alert.addButton(withTitle: copy.resolvedLanguage == .chinese ? "取消" : "Cancel")
    activateForUserInteraction()
    guard alert.runModal() == .alertFirstButtonReturn else { return }

    let script = installedScript(named: "restore-dream-skin-macos.sh")
      ?? bundledScript(named: "restore-dream-skin-macos.sh")
    guard let script else {
      showError(
        title: copy.resolvedLanguage == .chinese ? "无法恢复" : "Could not restore",
        message: copy.resolvedLanguage == .chinese
          ? "恢复脚本缺失；没有删除任何文件。"
          : "The restore script is missing. No files were removed."
      )
      return
    }
    operationInFlight = true
    rebuildMenu()
    ScriptRunner.run(
      script: script,
      arguments: ["--restore-base-theme", "--restart-codex", "--uninstall"]
    ) { [weak self] result in
      guard let self else { return }
      self.operationInFlight = false
      guard result.succeeded else {
        self.rebuildMenu()
        self.showError(
          title: self.copy.text(.restoreFailedTitle),
          message: self.conciseOutput(result.output, fallback: self.copy.text(.restoreFailedMessage))
        )
        return
      }
      do {
        if SMAppService.mainApp.status == .enabled || SMAppService.mainApp.status == .requiresApproval {
          try SMAppService.mainApp.unregister()
        }
        if self.fileManager.fileExists(atPath: self.installedEngineURL.path) {
          try self.fileManager.removeItem(at: self.installedEngineURL)
        }
      } catch {
        self.rebuildMenu()
        self.showError(
          title: self.copy.text(.restoreCleanupFailedTitle),
          message: self.copy.format(.restoreCleanupFailedMessage, error.localizedDescription)
        )
        return
      }
      self.showInfo(
        title: self.copy.text(.restoreDoneTitle),
        message: self.copy.text(.restoreDoneMessage)
      )
      NSApp.terminate(nil)
    }
  }

  @objc private func quit() {
    guard !operationInFlight, !engineInstallInFlight, !snapshot.busy else {
      showError(
        title: copy.text(.busyTitle),
        message: copy.resolvedLanguage == .chinese
          ? "请等待当前操作完成后再退出。"
          : "Wait for the current operation to finish before quitting."
      )
      return
    }
    NSApp.terminate(nil)
  }

  private func runInstalledScript(
    named name: String,
    arguments: [String] = [],
    operation: String
  ) {
    guard !operationInFlight else { return }
    guard let script = installedScript(named: name) else {
      showError(title: copy.text(.missingEngineTitle), message: copy.text(.missingEngineRetryMessage))
      return
    }
    operationInFlight = true
    rebuildMenu()
    ScriptRunner.run(script: script, arguments: arguments) { [weak self] result in
      guard let self else { return }
      self.operationInFlight = false
      self.refreshStatus()
      self.rebuildMenu()
      if !result.succeeded {
        self.showError(
          title: self.copy.operationFailed(operation),
          message: self.conciseOutput(result.output, fallback: self.copy.text(.openFailedMessage))
        )
      }
    }
  }

  private func installBundledEngineIfNeeded(force: Bool) {
    guard !engineInstallInFlight, !operationInFlight, !themeRecoveryInFlight, !snapshot.busy else { return }
    if !force && !engineNeedsInstall() {
      recoverInterruptedThemeImports { [weak self] recovered in
        guard let self else { return }
        if recovered {
          self.resumePendingCommunityApply()
        } else {
          self.pendingCommunityVersionID = nil
        }
      }
      return
    }
    guard let bundledVersion = version(at: bundledEngineURL?.appendingPathComponent("VERSION")) else {
      pendingCommunityVersionID = nil
      showError(title: copy.text(.installCorruptTitle), message: copy.text(.installVersionInvalid))
      return
    }
    if let installedVersion = version(at: installedEngineURL.appendingPathComponent("VERSION")),
       installedVersion > bundledVersion {
      pendingCommunityVersionID = nil
      showError(
        title: copy.text(.installedNewerTitle),
        message: copy.format(.installedNewerMessage, installedVersion.description, bundledVersion.description)
      )
      return
    }
    guard let script = bundledScript(named: "install-dream-skin-macos.sh") else {
      pendingCommunityVersionID = nil
      showError(title: copy.text(.installCorruptTitle), message: copy.text(.installMissingEngine))
      return
    }
    engineInstallInFlight = true
    rebuildMenu()
    ScriptRunner.run(
      script: script,
      arguments: ["--no-launchers", "--no-launch"]
    ) { [weak self] result in
      guard let self else { return }
      self.engineInstallInFlight = false
      self.rebuildMenu()
      if result.succeeded {
        self.refreshStatus()
        self.recoverInterruptedThemeImports { [weak self] recovered in
          guard let self else { return }
          if recovered {
            self.resumePendingCommunityApply()
          } else {
            self.pendingCommunityVersionID = nil
          }
        }
      } else {
        self.pendingCommunityVersionID = nil
        self.showError(
          title: self.copy.text(.installFailedTitle),
          message: self.conciseOutput(
            result.output,
            fallback: self.copy.text(.installFailedMessage)
          )
        )
      }
    }
  }

  private func recoverInterruptedThemeImports(completion: ((Bool) -> Void)? = nil) {
    guard !themeRecoveryInFlight else {
      completion?(false)
      return
    }
    guard let script = installedScript(named: "recover-theme-imports-macos.sh") else {
      showError(
        title: copy.text(.recoveryMissingTitle),
        message: copy.text(.recoveryMissingMessage)
      )
      completion?(false)
      return
    }
    themeRecoveryInFlight = true
    rebuildMenu()
    ScriptRunner.run(script: script) { [weak self] result in
      guard let self else { return }
      self.themeRecoveryInFlight = false
      if !result.succeeded {
        NSLog(
          "[DreamSkin] interrupted theme import recovery failed: %@",
          self.conciseOutput(result.output, fallback: "unknown recovery failure")
        )
        self.showError(
          title: self.copy.text(.recoveryFailedTitle),
          message: self.copy.text(.recoveryFailedMessage)
        )
      }
      self.rebuildMenu()
      completion?(result.succeeded)
    }
  }

  private func resumePendingCommunityApply() {
    guard let versionID = pendingCommunityVersionID else { return }
    pendingCommunityVersionID = nil
    DispatchQueue.main.async { [weak self] in
      self?.beginCommunityThemeApply(versionID: versionID)
    }
  }

  private func engineNeedsInstall() -> Bool {
    guard let bundled = version(at: bundledEngineURL?.appendingPathComponent("VERSION")) else {
      return true
    }
    guard let installed = version(at: installedEngineURL.appendingPathComponent("VERSION")),
          installed >= bundled else {
      return true
    }
    for relativePath in requiredEngineRelativePaths {
      let url = installedEngineURL.appendingPathComponent(relativePath)
      guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey]),
            values.isRegularFile == true,
            values.isSymbolicLink != true else {
        return true
      }
      if relativePath.hasSuffix(".sh") && !fileManager.isExecutableFile(atPath: url.path) {
        return true
      }
    }
    return false
  }

  private func version(at url: URL?) -> SemanticVersion? {
    guard let url,
          let text = try? String(contentsOf: url, encoding: .utf8) else {
      return nil
    }
    return SemanticVersion(text)
  }

  private func installedScript(named name: String) -> URL? {
    let url = installedEngineURL.appendingPathComponent("scripts/\(name)")
    return fileManager.isExecutableFile(atPath: url.path) ? url : nil
  }

  private func bundledScript(named name: String) -> URL? {
    guard let root = bundledEngineURL else { return nil }
    let url = root.appendingPathComponent("scripts/\(name)")
    return fileManager.fileExists(atPath: url.path) ? url : nil
  }

  private func migrateLegacySwiftBarIfNeeded() {
    let defaults = UserDefaults.standard
    let promptKey = "legacySwiftBarMigrationPrompted"
    guard !defaults.bool(forKey: promptKey), !legacyPluginURLs().isEmpty else { return }
    defaults.set(true, forKey: promptKey)
    disableLegacySwiftBarPlugins(confirmFirst: true)
  }

  private func legacyPluginURLs() -> [URL] {
    var candidates = [
      stateRootURL.appendingPathComponent("menubar/codex_dream_skin.10s.sh")
    ]
    if let pluginDirectory = UserDefaults(suiteName: "com.ameba.SwiftBar")?
      .string(forKey: "PluginDirectory"), !pluginDirectory.isEmpty {
      candidates.append(
        URL(fileURLWithPath: pluginDirectory, isDirectory: true)
          .appendingPathComponent("codex_dream_skin.10s.sh")
      )
    }
    var seen = Set<String>()
    return candidates.filter {
      let path = $0.standardizedFileURL.path
      guard seen.insert(path).inserted else { return false }
      return fileManager.fileExists(atPath: path)
    }
  }

  private func disableLegacySwiftBarPlugins(confirmFirst: Bool) {
    let plugins = legacyPluginURLs()
    guard !plugins.isEmpty else { return }
    if confirmFirst {
      let alert = NSAlert()
      alert.messageText = copy.text(.legacyConfirmTitle)
      alert.informativeText = copy.text(.legacyConfirmMessage)
      alert.addButton(withTitle: copy.text(.legacyDisable))
      alert.addButton(withTitle: copy.text(.later))
      activateForUserInteraction()
      guard alert.runModal() == .alertFirstButtonReturn else { return }
    }
    var failures: [String] = []
    for plugin in plugins {
      var destination = plugin.appendingPathExtension("disabled")
      if fileManager.fileExists(atPath: destination.path) {
        destination = plugin.appendingPathExtension("disabled-\(Int(Date().timeIntervalSince1970))")
      }
      do {
        try fileManager.moveItem(at: plugin, to: destination)
      } catch {
        failures.append("\(plugin.path): \(error.localizedDescription)")
      }
    }
    if let refreshURL = URL(string: "swiftbar://refreshall") {
      NSWorkspace.shared.open(refreshURL)
    }
    if failures.isEmpty {
      showInfo(title: copy.text(.legacyDisabledTitle), message: copy.text(.legacyDisabledMessage))
    } else {
      showError(title: copy.text(.legacyPartialTitle), message: failures.joined(separator: "\n"))
    }
  }

  private func conciseOutput(_ output: String, fallback: String) -> String {
    let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return fallback }
    let lines = trimmed.split(whereSeparator: \.isNewline).suffix(8)
    return String(lines.joined(separator: "\n")).prefix(1_200).description
  }

  private func activateForUserInteraction() {
    NSApp.activate(ignoringOtherApps: true)
  }

  /// DreamSkin is an LSUIElement with no Dock icon or regular window, so
  /// macOS does not automatically return focus to Codex once this app's own
  /// alert closes. Without this, `document.visibilityState` in the Codex
  /// renderer stays "hidden" for the confirm dialog's caller, so the
  /// rollback-snapshot verification in captureActiveThemeThenApplyImported
  /// spuriously fails and cancels every community apply even though the
  /// visible theme content is correct.
  private func reactivateCodexBeforeTransaction() {
    NSRunningApplication.runningApplications(withBundleIdentifier: "com.openai.codex")
      .first?.activate(options: [.activateIgnoringOtherApps])
  }

  private func showInfo(title: String, message: String) {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = message
    alert.addButton(withTitle: copy.text(.ok))
    activateForUserInteraction()
    alert.runModal()
  }

  private func showError(title: String, message: String) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = title
    alert.informativeText = message
    alert.addButton(withTitle: copy.text(.ok))
    activateForUserInteraction()
    alert.runModal()
  }
}
