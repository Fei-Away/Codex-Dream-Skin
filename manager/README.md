# Codex Dream Skin Manager

Windows / macOS 共用的 Tauri 2 主题管理器。它只调用仓库中固定的本地引擎脚本，不下载或执行主题包里的代码。

## 用户流程

1. 打开管理器，按首次启动的四步引导检查 Codex、运行组件和换肤启动配置。
2. 启用或修复换肤环境。Windows 会先用中文确认提醒保存输入，再安全关闭经过 Store 身份校验的 Codex；失败时会尝试重新打开 Codex。
3. Create a local theme from PNG, JPEG, or WebP, then adjust its copy, composition, appearance, and safe palette in the editor.
4. 在主题库中选择主题并应用。首次建立换肤会话可能关闭并重新打开 Codex，请先保存尚未发送的输入。

Theme cards can be switched, edited, or copied. Import/export is a Draft-only prototype adapter and will align with the .dreamskin contract selected by #114/#137 before this PR is marked Ready.

Manager 从随包的能力清单读取各平台固定命令、路径和主题特性。若主题使用当前引擎不支持的能力，界面会列出具体字段；用户可以更新引擎，或明确移除这些字段并保存兼容副本，能力不会在应用时被静默丢弃。

## 运行要求

- Windows 10/11 或 macOS，以及已安装的官方 Codex Desktop。
- Windows 应用主题需要 Node.js 22 或更新版本；macOS 引擎验证并复用 Codex 自带的签名 Node 运行时。
- 从源码构建需要 Node.js/npm、稳定版 Rust 和对应平台的 Tauri 2 系统依赖。
  - Windows：Microsoft C++ Build Tools 和 WebView2 Runtime。
  - macOS：Xcode Command Line Tools。

管理器不能在一个平台上交叉构建另一个平台的安装包。

## 从源码运行

```bash
cd manager
npm install
npm run tauri dev
```

只构建前端：

```bash
npm run build
```

构建当前平台的桌面程序：

```bash
npm run tauri -- build
```

后端测试与 lint：

```bash
cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

## 数据位置

| 数据 | Windows | macOS |
|------|---------|-------|
| 管理器主题库 | `%APPDATA%\com.feiaway.codex-dream-skin-manager\themes` | `~/Library/Application Support/com.feiaway.codex-dream-skin-manager/themes` |
| 当前活动主题 | `%LOCALAPPDATA%\CodexDreamSkin\active-theme` | `~/Library/Application Support/CodexDreamSkinStudio/theme` |
| 运行状态 / 日志 | `%LOCALAPPDATA%\CodexDreamSkin` | `~/Library/Application Support/CodexDreamSkinStudio` |

应用主题时，管理器会把已经校验的主题原子写入“当前活动主题”，再调用平台引擎。启动失败或用户取消重启时会尝试回滚；“恢复官方”会停用注入并恢复安装前保存的外观配置。

## 主题包

Import/export remains a Draft-only prototype adapter pending the .dreamskin contract selected by #114/#137.

## 开发边界

- Tauri 只暴露列出、创建、受限编辑、导入、导出、应用、恢复和配置换肤环境这些固定命令。
- 主题图片只通过受限的本地 asset protocol 预览；CSP 不允许远程脚本、frame 或 object。
- 平台引擎仍须保持 CDP 仅绑定 `127.0.0.1`，且不得修改官方安装包、API Key 或 Base URL。

## 常见问题

- **检测不到 Codex**：先正常启动一次官方 Codex，再返回管理器刷新状态。
- **Windows 提示 Node 未准备好**：安装 Node.js 22+，关闭并重新打开管理器后再检查。
- **应用或恢复要求重启**：先保存输入，然后确认操作；取消时管理器不会把未完成的切换标记为成功。
- **为什么启用换肤环境会关闭 Codex**：Codex 运行时可能写回 `config.toml`。管理器先关闭它再原子修改外观键，避免新旧配置互相覆盖；安装完成后继续“应用主题”即可重新打开。
- **为什么没有命令行窗口**：Windows 调试版和正式版均使用 GUI 子系统；平台脚本也以隐藏窗口方式运行。若从外部终端手动执行脚本，终端本身仍会保留。
- **导入被拒绝**：检查扩展名、图片实际格式、尺寸和包内文件数量。不要把普通 ZIP 直接改名当成主题包。

版本记录见 [`CHANGELOG.md`](./CHANGELOG.md)。
