import SwiftUI
import AppKit

enum ThemePreset: String, CaseIterable, Identifiable {
    case rose = "柔光粉"
    case ocean = "清透蓝"
    case neon = "霓虹绿"

    var id: String { rawValue }

    var colors: (accent: String, secondary: String, highlight: String) {
        switch self {
        case .rose: return ("#e25563", "#f3a8af", "#c93d4c")
        case .ocean: return ("#3e9ed6", "#78d7ea", "#315ec9")
        case .neon: return ("#7cff46", "#36d7e8", "#642a8c")
        }
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published var isBusy = false
    @Published var isInstalled = false
    @Published var isActive = false
    @Published var statusText = "正在检查环境…"
    @Published var logText = ""
    @Published var themeName = "我的 Dream Skin"
    @Published var preset: ThemePreset = .rose
    @Published var showRestoreConfirmation = false
    @Published var showUninstallConfirmation = false

    private let fileManager = FileManager.default
    private let home = FileManager.default.homeDirectoryForCurrentUser

    private var bundledEngine: URL? {
        Bundle.main.resourceURL?.appendingPathComponent("Engine", isDirectory: true)
    }

    private var installRoot: URL {
        home.appendingPathComponent(".codex/codex-dream-skin-studio", isDirectory: true)
    }

    private var stateRoot: URL {
        home.appendingPathComponent("Library/Application Support/CodexDreamSkinStudio", isDirectory: true)
    }

    private var installedScripts: URL {
        installRoot.appendingPathComponent("scripts", isDirectory: true)
    }

    private var stateFile: URL {
        stateRoot.appendingPathComponent("state.json")
    }

    private var themeBackup: URL {
        stateRoot.appendingPathComponent("theme-backup.json")
    }

    init() {
        Task { await refreshStatus() }
    }

    func refreshStatus() async {
        isInstalled = fileManager.fileExists(atPath: installRoot.path)
        isActive = fileManager.fileExists(atPath: stateFile.path)
        if isActive {
            statusText = "皮肤正在运行"
        } else if isInstalled {
            statusText = "已安装，当前未启用"
        } else {
            statusText = codexIsAvailable() ? "准备就绪" : "未找到 Codex Desktop"
        }
    }

    func chooseImageAndApply() {
        let panel = NSOpenPanel()
        panel.title = "选择主题图片"
        panel.prompt = "使用这张图片"
        panel.allowedContentTypes = [.png, .jpeg, .heic, .tiff, .webP]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let image = panel.url else { return }
        if themeName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            themeName = image.deletingPathExtension().lastPathComponent
        }
        runOperation(title: "应用自定义主题") { [self] in
            guard await installEngine() else { return false }
            let colors = preset.colors
            let result = await runProcess(installedScripts.appendingPathComponent("customize-theme-macos.sh").path, [
                "--image", image.path,
                "--name", themeName,
                "--accent", colors.accent,
                "--secondary", colors.secondary,
                "--highlight", colors.highlight,
                "--no-apply"
            ])
            append(result.output)
            guard result.code == 0 else { return false }
            return await startSkin()
        }
    }

    func applyDemo() {
        runOperation(title: "应用示例主题") { [self] in
            guard await installEngine() else { return false }
            let reset = await runProcess(installedScripts.appendingPathComponent("customize-theme-macos.sh").path, ["--reset-demo", "--no-apply"])
            append(reset.output)
            guard reset.code == 0 else { return false }
            return await startSkin()
        }
    }

    func verify() {
        runOperation(title: "检查运行状态") { [self] in
            guard fileManager.fileExists(atPath: installRoot.path) else {
                append("尚未安装 Dream Skin。\n")
                return false
            }
            let screenshot = stateRoot.appendingPathComponent("verification.png")
            let result = await runProcess(installedScripts.appendingPathComponent("verify-dream-skin-macos.sh").path, ["--screenshot", screenshot.path])
            append(result.output)
            if result.code == 0 {
                await MainActor.run { NSWorkspace.shared.activateFileViewerSelecting([screenshot]) }
            }
            return result.code == 0
        }
    }

    func restore() {
        showRestoreConfirmation = false
        runOperation(title: "恢复官方外观") { [self] in
            guard fileManager.fileExists(atPath: installRoot.path) else {
                append("当前没有已安装的 Dream Skin。\n")
                return true
            }
            guard fileManager.fileExists(atPath: stateFile.path) || fileManager.fileExists(atPath: themeBackup.path) else {
                append("Codex 当前已经是官方外观。\n")
                return true
            }
            var arguments = ["--restart-codex"]
            if fileManager.fileExists(atPath: themeBackup.path) {
                arguments.insert("--restore-base-theme", at: 0)
            }
            let result = await runProcess(installedScripts.appendingPathComponent("restore-dream-skin-macos.sh").path, arguments)
            append(result.output)
            return result.code == 0
        }
    }

    func uninstall() {
        showUninstallConfirmation = false
        runOperation(title: "彻底卸载") { [self] in
            if fileManager.fileExists(atPath: installRoot.path),
               fileManager.fileExists(atPath: stateFile.path) || fileManager.fileExists(atPath: themeBackup.path) {
                var arguments = ["--restart-codex", "--uninstall"]
                if fileManager.fileExists(atPath: themeBackup.path) {
                    arguments.insert("--restore-base-theme", at: 0)
                }
                let result = await runProcess(installedScripts.appendingPathComponent("restore-dream-skin-macos.sh").path, arguments)
                append(result.output)
                guard result.code == 0 else { return false }
            }
            do {
                if fileManager.fileExists(atPath: installRoot.path) { try fileManager.removeItem(at: installRoot) }
                if fileManager.fileExists(atPath: stateRoot.path) { try fileManager.removeItem(at: stateRoot) }
                append("Dream Skin 已从这台 Mac 删除。\n")
                return true
            } catch {
                append("删除失败：\(error.localizedDescription)\n")
                return false
            }
        }
    }

    private func runOperation(title: String, operation: @escaping () async -> Bool) {
        guard !isBusy else { return }
        isBusy = true
        logText = "▶︎ \(title)\n"
        statusText = "正在\(title)…"
        Task {
            let succeeded = await operation()
            await refreshStatus()
            if succeeded {
                statusText = "\(title)完成"
                append("✓ \(title)完成\n")
            } else {
                statusText = "\(title)失败"
                append("请查看上方日志。\n")
            }
            isBusy = false
        }
    }

    private func installEngine() async -> Bool {
        guard let engine = bundledEngine else {
            append("应用资源中缺少 Engine。\n")
            return false
        }
        let script = engine.appendingPathComponent("scripts/install-dream-skin-macos.sh")
        let result = await runProcess(script.path, ["--no-launchers", "--no-launch"])
        append(result.output)
        return result.code == 0
    }

    private func startSkin() async -> Bool {
        statusText = "正在重启 Codex 并应用主题…"
        append("正在重启 Codex 并等待主题就绪，通常需要 10–45 秒。\n")
        let result = await runProcess(installedScripts.appendingPathComponent("start-dream-skin-macos.sh").path, ["--restart-existing"])
        append(result.output)
        return result.code == 0
    }

    private func append(_ text: String) {
        guard !text.isEmpty else { return }
        logText += text
    }

    private func codexIsAvailable() -> Bool {
        let candidates = [
            "/Applications/ChatGPT.app/Contents/Info.plist",
            home.appendingPathComponent("Applications/ChatGPT.app/Contents/Info.plist").path
        ]
        return candidates.contains(where: fileManager.fileExists(atPath:))
    }
}

struct StatusPill: View {
    let active: Bool
    let text: String

    var body: some View {
        HStack(spacing: 7) {
            Circle()
                .fill(active ? Color.green : Color.secondary.opacity(0.55))
                .frame(width: 8, height: 8)
            Text(text)
                .font(.system(size: 12, weight: .medium))
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(.ultraThinMaterial, in: Capsule())
    }
}

struct ActionButton: View {
    let title: String
    let subtitle: String
    let icon: String
    var prominent = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 19, weight: .semibold))
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 14, weight: .semibold))
                    Text(subtitle).font(.system(size: 11)).opacity(0.7)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).opacity(0.5)
            }
            .padding(13)
            .frame(maxWidth: .infinity)
            .background(prominent ? Color.accentColor : Color.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(prominent ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }
}

struct ContentView: View {
    @StateObject private var model = AppModel()

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(spacing: 16) {
                    hero
                    themeControls
                    operationGrid
                    logPanel
                    securityNote
                }
                .padding(22)
            }
        }
        .frame(minWidth: 700, idealWidth: 760, minHeight: 620, idealHeight: 700)
        .background(Color(nsColor: .windowBackgroundColor))
        .disabled(model.isBusy)
        .overlay {
            if model.isBusy {
                ZStack {
                    Color.black.opacity(0.12).ignoresSafeArea()
                    VStack(spacing: 12) {
                        ProgressView().controlSize(.large)
                        Text(model.statusText).font(.headline)
                    }
                    .padding(24)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                    .shadow(radius: 20)
                }
            }
        }
        .alert("恢复官方外观？", isPresented: $model.showRestoreConfirmation) {
            Button("取消", role: .cancel) {}
            Button("恢复并重启 Codex", role: .destructive) { model.restore() }
        } message: {
            Text("主题会立即停止，Codex 将以官方外观重新启动。")
        }
        .alert("彻底卸载 Dream Skin？", isPresented: $model.showUninstallConfirmation) {
            Button("取消", role: .cancel) {}
            Button("恢复并卸载", role: .destructive) { model.uninstall() }
        } message: {
            Text("将恢复官方外观，并删除主题引擎、图片、日志和桌面入口。")
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(LinearGradient(colors: [.pink, .purple], startPoint: .topLeading, endPoint: .bottomTrailing))
                Image(systemName: "wand.and.stars").foregroundStyle(.white).font(.title3)
            }
            .frame(width: 38, height: 38)
            VStack(alignment: .leading, spacing: 1) {
                Text("Codex Dream Skin").font(.headline)
                Text("可视化主题管理器").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            StatusPill(active: model.isActive, text: model.statusText)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 14)
        .background(.bar)
    }

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: [Color(red: 0.98, green: 0.63, blue: 0.72), Color(red: 0.55, green: 0.38, blue: 0.95)], startPoint: .topLeading, endPoint: .bottomTrailing)
            Circle().fill(.white.opacity(0.18)).frame(width: 220).offset(x: 480, y: -45)
            Circle().fill(.white.opacity(0.12)).frame(width: 130).offset(x: 380, y: 30)
            VStack(alignment: .leading, spacing: 6) {
                Text("一张图片，一次点击。")
                    .font(.system(size: 27, weight: .bold, design: .rounded))
                Text("自动安装、应用、检查和恢复 Codex 主题。")
                    .font(.system(size: 14, weight: .medium))
                    .opacity(0.86)
            }
            .foregroundStyle(.white)
            .padding(22)
        }
        .frame(height: 155)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private var themeControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("主题设置").font(.headline)
            HStack(spacing: 14) {
                TextField("主题名称", text: $model.themeName)
                    .textFieldStyle(.roundedBorder)
                Picker("配色", selection: $model.preset) {
                    ForEach(ThemePreset.allCases) { preset in
                        Text(preset.rawValue).tag(preset)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 285)
            }
            HStack(spacing: 12) {
                ActionButton(title: "选择图片并应用", subtitle: "支持 PNG、JPEG、HEIC、TIFF、WebP", icon: "photo.badge.plus", prominent: true) {
                    model.chooseImageAndApply()
                }
                ActionButton(title: "试用示例主题", subtitle: "使用内置图片快速体验", icon: "sparkles") {
                    model.applyDemo()
                }
            }
        }
        .padding(16)
        .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 16))
    }

    private var operationGrid: some View {
        HStack(spacing: 12) {
            ActionButton(title: "检查", subtitle: "验证主题并生成截图", icon: "checkmark.shield") { model.verify() }
            ActionButton(title: "恢复", subtitle: "回到 Codex 官方外观", icon: "arrow.uturn.backward") { model.showRestoreConfirmation = true }
            ActionButton(title: "卸载", subtitle: "删除主题和运行数据", icon: "trash") { model.showUninstallConfirmation = true }
        }
    }

    private var logPanel: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("运行记录").font(.headline)
                Spacer()
                Button("刷新状态") { Task { await model.refreshStatus() } }
                    .buttonStyle(.link)
            }
            ScrollView {
                Text(model.logText.isEmpty ? "操作结果会显示在这里。" : model.logText)
                    .font(.system(size: 11.5, design: .monospaced))
                    .foregroundStyle(model.logText.isEmpty ? .secondary : .primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                    .padding(12)
            }
            .frame(height: 105)
            .background(Color.black.opacity(0.045), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private var securityNote: some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: "lock.shield").foregroundStyle(.secondary)
            Text("主题通过仅限本机的调试端口运行，不修改 Codex 官方应用。主题启用期间，请避免运行来源不明的软件；结束使用后可随时点击“恢复”。")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
        }
    }
}

@main
struct DreamSkinManagerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}
