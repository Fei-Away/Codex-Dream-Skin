# macOS 安装与更新

本页面向只想使用主题的普通用户。不要 clone 仓库，也不需要安装 Node.js、Homebrew 或运行 shell 命令。

## 首次安装

先安装官方 ChatGPT / Codex 桌面应用，至少启动一次后退出，让它创建本机配置文件。

1. 在 GitHub 的 [Releases](https://github.com/Fei-Away/Codex-Dream-Skin/releases) 下载最新的
   `CodexDreamSkin-vX.Y.Z.dmg`。`SHA256SUMS.txt` 是可选的完整性校验文件。
2. 双击 DMG，把 **Codex Dream Skin.app** 拖到 **Applications（应用程序）**。
3. 第一次打开时，macOS 可能提示应用来自无法验证的开发者。这是因为公开发行包目前没有
   Apple Developer ID 签名，不代表安装包需要执行脚本。
4. 如果提示框没有“打开”，点击“完成”，然后打开 **系统设置 → 隐私与安全性**。在“安全性”区域
   找到“Codex Dream Skin 已被阻止使用”一行，点击 **仍要打开**，输入登录密码并确认。
5. 应用启动后会在用户目录部署或升级主题引擎。若 Codex 正在运行，按提示先退出，再从菜单选择
   “安装 / 升级引擎”。
   完成后，菜单栏右上角会出现 Dream Skin 图标。

放行只需要在 macOS 的图形界面完成；本项目不会要求普通用户执行 `xattr`、关闭 Gatekeeper，
或修改官方 Codex/ChatGPT 应用。

## 日常使用

菜单栏图标提供启动、暂停、恢复、换图和已保存主题等操作。主题状态和用户图片保存在：

`~/Library/Application Support/CodexDreamSkinStudio`

引擎本身位于 `~/.codex/codex-dream-skin-studio`。它通过本机回环 CDP 工作，不修改官方 `.app`、
`app.asar` 或代码签名。

## 手动更新

更新是覆盖安装，不是重新配置：

1. 从 Releases 下载新的 DMG。
2. 退出 Dream Skin 菜单栏应用，并按提示关闭 Codex。
3. 打开新 DMG，把新应用拖入 Applications，并选择替换。
4. 再次打开应用；现有主题、图片和状态会保留。

通常同一台 Mac 在第一次允许后不会每次启动都询问。但每个新下载的、未签名的应用副本都可能
再次触发 Gatekeeper；这是 macOS 按文件和来源作出的安全判断，项目无法保证所有系统版本都只
提示一次。若出现提示，重复上面的“隐私与安全性 → 仍要打开”即可，不需要重新安装引擎。

菜单栏中的“检查更新”只在用户点击时访问 GitHub Releases，不会后台轮询，
也不会静默下载或替换应用。

## 卸载

先从菜单栏选择“恢复原状并卸载”，让 Codex 恢复官方外观并关闭 CDP 会话；然后把
`/Applications/Codex Dream Skin.app` 移到废纸篓。若要删除用户主题和图片，再手动删除
`~/Library/Application Support/CodexDreamSkinStudio`；这一步不可恢复，建议先备份自定义图片。

## 常见问题

### “仍要打开”没有出现

确认你打开的是 `/Applications/Codex Dream Skin.app`，并先实际双击一次使 macOS 记录拦截结果。
“仍要打开”按钮通常只在尝试启动后的一段时间内显示；仍没有按钮时，再次尝试打开应用，然后重新
进入“隐私与安全性”。不要关闭系统安全功能，也不要从网上复制未经核对的终端命令。

### 更新后菜单栏没有图标

确认旧的 Dream Skin 已退出，再启动 Applications 中的新版本。若 Codex 正在运行，允许应用按
提示重启；主题数据仍在上面的 Application Support 目录中。

### 想继续使用脚本方式

开发者和高级用户可参阅 [`macos/README.md`](../macos/README.md) 的仓库安装章节；普通用户应优先
使用 Release DMG。
