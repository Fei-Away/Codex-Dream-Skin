import AppKit
import DreamSkinCore
import ServiceManagement
import UniformTypeIdentifiers

private struct ThemeOption {
  let id: String
  let name: String
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
  private let fileManager = FileManager.default
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
  private let menu = NSMenu()
  private var snapshot = StatusSnapshot()
  private var statusRefreshRunning = false
  private var operationInFlight = false
  private var engineInstallInFlight = false
  private var refreshTimer: Timer?
  private let requiredEngineRelativePaths = [
    "VERSION",
    "assets/dream-skin.css",
    "assets/portal-hero.png",
    "assets/renderer-inject.js",
    "assets/theme.json",
    "presets/preset-gothic-void-crusade/background.jpg",
    "presets/preset-gothic-void-crusade/theme.json",
    "scripts/apply-from-menubar-macos.sh",
    "scripts/check-update-macos.sh",
    "scripts/common-macos.sh",
    "scripts/customize-theme-macos.sh",
    "scripts/doctor-macos.sh",
    "scripts/image-metadata.mjs",
    "scripts/injector.mjs",
    "scripts/install-dream-skin-macos.sh",
    "scripts/load-image-theme-macos.sh",
    "scripts/pause-dream-skin-macos.sh",
    "scripts/restore-dream-skin-macos.sh",
    "scripts/stage-theme.mjs",
    "scripts/start-dream-skin-macos.sh",
    "scripts/status-dream-skin-macos.sh",
    "scripts/switch-theme-macos.sh",
    "scripts/theme-config.mjs",
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

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    configureStatusItem()
    ensureUserDirectories()
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
  }

  func applicationWillTerminate(_ notification: Notification) {
    refreshTimer?.invalidate()
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
    let configuration = NSImage.SymbolConfiguration(pointSize: 15, weight: .semibold)
    button.image = NSImage(
      systemSymbolName: "paintpalette.fill",
      accessibilityDescription: "Codex Dream Skin"
    )?.withSymbolConfiguration(configuration)
    button.image?.isTemplate = true
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
        showError(title: "无法准备用户目录", message: error.localizedDescription)
        break
      }
    }
  }

  private func rebuildMenu() {
    menu.removeAllItems()
    addDisabledItem(snapshot.title)
    if !snapshot.appliedThemeName.isEmpty && snapshot.session == "active" {
      addDisabledItem("已应用：\(cleanMenuText(snapshot.appliedThemeName))")
    }
    if !snapshot.themeName.isEmpty && snapshot.themeName != snapshot.appliedThemeName {
      addDisabledItem("已选主题：\(cleanMenuText(snapshot.themeName))（待应用）")
    } else if snapshot.appliedThemeName.isEmpty && !snapshot.themeName.isEmpty {
      addDisabledItem("已选主题：\(cleanMenuText(snapshot.themeName))")
    }
    addDisabledItem(snapshot.codexRunning ? "ChatGPT：已打开" : "ChatGPT：未打开")
    if !snapshot.operationMessage.isEmpty {
      addDisabledItem(cleanMenuText(snapshot.operationMessage))
    }
    addDisabledItem("版本：v\(appVersion)")

    menu.addItem(.separator())
    let busy = operationInFlight || engineInstallInFlight || snapshot.busy
    let needsEngineInstall = engineNeedsInstall()
    if engineInstallInFlight {
      addDisabledItem("正在安装引擎…")
    } else {
      addActionItem(
        needsEngineInstall ? "安装 / 升级引擎…" : "修复 / 重新安装引擎…",
        action: #selector(reinstallEngine),
        enabled: !busy
      )
    }

    let applyTitle: String
    switch snapshot.session {
    case "active": applyTitle = "重新应用皮肤"
    case "stale", "unknown": applyTitle = "修复并应用"
    default: applyTitle = "应用皮肤"
    }
    addActionItem(applyTitle, action: #selector(applySkin), enabled: !busy)
    if snapshot.session == "active" || snapshot.session == "applying" {
      addActionItem("暂停皮肤", action: #selector(pauseSkin), enabled: !busy)
    }
    addActionItem("打开 ChatGPT", action: #selector(openCodex), enabled: !busy)
    addActionItem("换一张背景图…", action: #selector(chooseBackgroundImage), enabled: !busy)
    addSavedThemesMenu(enabled: !busy)
    addActionItem("打开图片文件夹", action: #selector(openImagesFolder))

    menu.addItem(.separator())
    addActionItem("检查更新…", action: #selector(checkForUpdates), enabled: !operationInFlight)
    addActionItem("打开 DreamSkin.cc", action: #selector(openDreamSkinWebsite))
    let loginItem = addActionItem("登录时启动", action: #selector(toggleLoginItem))
    loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
    if !legacyPluginURLs().isEmpty {
      addActionItem("停用旧 SwiftBar 菜单…", action: #selector(disableLegacySwiftBarFromMenu))
    }

    menu.addItem(.separator())
    addActionItem(
      "恢复原状并卸载…",
      action: #selector(restoreAndUninstall),
      enabled: !busy
    )
    addActionItem("退出", action: #selector(quit))
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

  private func addSavedThemesMenu(enabled: Bool) {
    let root = NSMenuItem(title: "已保存的主题", action: nil, keyEquivalent: "")
    let submenu = NSMenu(title: "已保存的主题")
    submenu.autoenablesItems = false
    let themes = savedThemes()
    if themes.isEmpty {
      addDisabledItem("还没有保存的主题", to: submenu)
    } else {
      for theme in themes {
        let item = addActionItem(
          theme.name,
          action: #selector(switchSavedTheme(_:)),
          enabled: enabled,
          to: submenu
        )
        item.representedObject = theme.id
        if theme.name == snapshot.themeName {
          item.state = .on
        }
      }
    }
    root.submenu = submenu
    menu.addItem(root)
  }

  private func savedThemes() -> [ThemeOption] {
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
    let options: [ThemeOption] = entries.compactMap { directory in
      let id = directory.lastPathComponent
      guard id.range(of: #"^[A-Za-z0-9_-]{1,80}$"#, options: .regularExpression) != nil else {
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
      return ThemeOption(id: id, name: cleanMenuText(rawName))
    }.sorted {
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
    return options
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
        self.statusItem.button?.toolTip = "Codex Dream Skin · \(parsed.title)"
        self.statusItem.button?.appearsDisabled = parsed.session == "unknown" || parsed.session == "stale"
        self.rebuildMenu()
      }
    }
  }

  @objc private func applySkin() {
    runInstalledScript(named: "apply-from-menubar-macos.sh", operation: "应用皮肤")
  }

  @objc private func pauseSkin() {
    runInstalledScript(named: "pause-dream-skin-macos.sh", operation: "暂停皮肤")
  }

  @objc private func reinstallEngine() {
    guard !operationInFlight, !snapshot.busy else { return }
    installBundledEngineIfNeeded(force: true)
  }

  @objc private func chooseBackgroundImage() {
    let panel = NSOpenPanel()
    panel.title = "选择 Dream Skin 背景图"
    panel.prompt = "选择"
    panel.canChooseDirectories = false
    panel.canChooseFiles = true
    panel.allowsMultipleSelection = false
    panel.allowedContentTypes = [.png, .jpeg, .webP, .heic, .tiff]
    activateForUserInteraction()
    guard panel.runModal() == .OK, let imageURL = panel.url else { return }
    runInstalledScript(
      named: "load-image-theme-macos.sh",
      arguments: ["--file", imageURL.path],
      operation: "更换背景图"
    )
  }

  @objc private func switchSavedTheme(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String,
          id.range(of: #"^[A-Za-z0-9_-]{1,80}$"#, options: .regularExpression) != nil else {
      showError(title: "主题无效", message: "主题标识不符合安全规则。")
      return
    }
    runInstalledScript(
      named: "switch-theme-macos.sh",
      arguments: ["--id", id],
      operation: "切换主题"
    )
  }

  @objc private func openImagesFolder() {
    ensureUserDirectories()
    NSWorkspace.shared.open(imagesURL)
  }

  @objc private func openCodex() {
    guard let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.openai.codex") else {
      showError(title: "未找到 ChatGPT", message: "请先安装并至少启动一次官方 ChatGPT / Codex 桌面应用。")
      return
    }
    let configuration = NSWorkspace.OpenConfiguration()
    NSWorkspace.shared.openApplication(at: appURL, configuration: configuration) { _, error in
      if let error {
        DispatchQueue.main.async {
          self.showError(title: "无法打开 ChatGPT", message: error.localizedDescription)
        }
      }
    }
  }

  @objc private func openDreamSkinWebsite() {
    guard let url = URL(string: "https://dreamskin.cc") else { return }
    NSWorkspace.shared.open(url)
  }

  @objc private func checkForUpdates() {
    guard !operationInFlight,
          let script = installedScript(named: "check-update-macos.sh")
            ?? bundledScript(named: "check-update-macos.sh") else {
      showError(title: "无法检查更新", message: "更新检查脚本缺失，请重新安装应用。")
      return
    }
    operationInFlight = true
    rebuildMenu()
    ScriptRunner.run(script: script, arguments: ["--json"]) { [weak self] result in
      guard let self else { return }
      self.operationInFlight = false
      self.rebuildMenu()
      guard result.succeeded,
            let data = result.output.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data),
            let value = object as? [String: Any],
            let current = value["currentVersion"] as? String,
            let latest = value["latestVersion"] as? String,
            let available = value["updateAvailable"] as? Bool else {
        self.showError(
          title: "检查更新失败",
          message: self.conciseOutput(result.output, fallback: "无法连接 GitHub，请稍后重试。")
        )
        return
      }
      if available {
        let alert = NSAlert()
        alert.messageText = "发现新版本 \(latest)"
        alert.informativeText = "当前版本为 \(current)。是否前往 GitHub Releases 下载？"
        alert.addButton(withTitle: "前往下载")
        alert.addButton(withTitle: "稍后")
        self.activateForUserInteraction()
        if alert.runModal() == .alertFirstButtonReturn,
           let url = URL(string: "https://github.com/Fei-Away/Codex-Dream-Skin/releases/latest") {
          NSWorkspace.shared.open(url)
        }
      } else {
        self.showInfo(title: "已是最新版本", message: "当前安装的是 \(current)。")
      }
    }
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
          title: "需要系统确认",
          message: "请在“系统设置 → 通用 → 登录项”中允许 Codex Dream Skin。"
        )
      }
    } catch {
      showError(
        title: "无法修改登录启动",
        message: "请先把 App 拖到“应用程序”文件夹，再重试。\n\n\(error.localizedDescription)"
      )
    }
  }

  @objc private func disableLegacySwiftBarFromMenu() {
    disableLegacySwiftBarPlugins(confirmFirst: true)
  }

  @objc private func restoreAndUninstall() {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = "恢复原状并卸载 Dream Skin？"
    alert.informativeText = "将停止皮肤、恢复 ChatGPT 外观、删除本地引擎并关闭本应用。你的图片和已保存主题会保留。"
    alert.addButton(withTitle: "恢复并卸载")
    alert.addButton(withTitle: "取消")
    activateForUserInteraction()
    guard alert.runModal() == .alertFirstButtonReturn else { return }

    let script = installedScript(named: "restore-dream-skin-macos.sh")
      ?? bundledScript(named: "restore-dream-skin-macos.sh")
    guard let script else {
      showError(title: "无法恢复", message: "恢复脚本缺失；没有删除任何文件。")
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
          title: "恢复未完成",
          message: self.conciseOutput(result.output, fallback: "引擎和设置均已保留，请处理错误后重试。")
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
          title: "恢复完成，但清理失败",
          message: "ChatGPT 已恢复，部分安装文件未能删除：\n\n\(error.localizedDescription)"
        )
        return
      }
      self.showInfo(
        title: "恢复完成",
        message: "本地引擎和登录启动已移除。最后请把“Codex Dream Skin.app”移到废纸篓。"
      )
      NSApp.terminate(nil)
    }
  }

  @objc private func quit() {
    NSApp.terminate(nil)
  }

  private func runInstalledScript(
    named name: String,
    arguments: [String] = [],
    operation: String
  ) {
    guard !operationInFlight else { return }
    guard let script = installedScript(named: name) else {
      showError(title: "引擎尚未安装", message: "请先选择“安装 / 升级引擎”，再重试。")
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
          title: "\(operation)失败",
          message: self.conciseOutput(result.output, fallback: "请检查 ChatGPT 是否已安装，并重试。")
        )
      }
    }
  }

  private func installBundledEngineIfNeeded(force: Bool) {
    guard !engineInstallInFlight, !operationInFlight, !snapshot.busy else { return }
    if !force && !engineNeedsInstall() { return }
    guard let bundledVersion = version(at: bundledEngineURL?.appendingPathComponent("VERSION")) else {
      showError(title: "安装资源损坏", message: "App 内的版本信息无效，请重新下载。")
      return
    }
    if let installedVersion = version(at: installedEngineURL.appendingPathComponent("VERSION")),
       installedVersion > bundledVersion {
      showError(
        title: "已安装更新版本",
        message: "本机引擎 v\(installedVersion) 比当前 App 的 v\(bundledVersion) 更新。请下载相同或更新版本的 DMG，不会执行降级。"
      )
      return
    }
    guard let script = bundledScript(named: "install-dream-skin-macos.sh") else {
      showError(title: "安装资源损坏", message: "App 内没有找到 Dream Skin 引擎。请重新下载。")
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
      } else {
        self.showError(
          title: "引擎安装未完成",
          message: "请先退出 ChatGPT，再从菜单选择“安装 / 升级引擎”。\n\n" +
            self.conciseOutput(result.output, fallback: "安装脚本返回了错误。")
        )
      }
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
      alert.messageText = "停用旧 SwiftBar 菜单？"
      alert.informativeText = "已检测到旧版 Dream Skin SwiftBar 插件。停用后可避免菜单栏出现两个图标；插件会改名保留，不会直接删除。"
      alert.addButton(withTitle: "停用旧插件")
      alert.addButton(withTitle: "稍后")
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
      showInfo(title: "旧菜单已停用", message: "SwiftBar 插件已安全改名保留。")
    } else {
      showError(title: "部分旧插件未能停用", message: failures.joined(separator: "\n"))
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

  private func showInfo(title: String, message: String) {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = message
    alert.addButton(withTitle: "好")
    activateForUserInteraction()
    alert.runModal()
  }

  private func showError(title: String, message: String) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = title
    alert.informativeText = message
    alert.addButton(withTitle: "好")
    activateForUserInteraction()
    alert.runModal()
  }
}
