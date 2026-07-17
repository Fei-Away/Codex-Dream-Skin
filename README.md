# Codex Miku Stage

<p align="center">
  <strong>中文</strong> · <a href="./README.en.md">English</a>
</p>

Windows Codex 的可逆初音未来主题皮肤。它复用 Codex Dream Skin 的本机 CDP 注入思路，但重新实现了 14 个独立组件族、深浅 token、安装/恢复、验证和专用插画。

![Miku Stage hero](windows/assets/miku-stage-hero.png)

## 当前完成范围

- Windows：已实现，可安装到 %LOCALAPPDATA%\CodexMikuSkin\engine。
- 14 组件：shell、task/composer、home、Diff、settings、plugins、automations、quick chat、popovers、split/terminal、output、analytics、Appearance/Pets、states/tokens。
- 深色默认方案：#07131F、#39C5BB、#22D3C5；magenta 只作少量强调。
- 浅色配套方案：独立 token，不是简单反相。
- 原生控件：侧栏、composer、菜单、Diff、终端等仍是 Codex DOM，不是截图覆盖。
- 可逆：不修改 WindowsApps、app.asar 或签名；支持 live remove、配置恢复和卸载。

组件与状态验收见 windows/references/qa-inventory.md。14 张设计板的尺寸和哈希保存在 windows/references/component-spec-manifest.json。

## 安装与启动

在 PowerShell 中执行：

    cd .\Codex-Miku-Skin
    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\install-miku-skin.ps1 -EnableAutoHook

安装会复制独立运行时、创建快捷方式，并注册用户级登录 Hook；若 `config.toml` 已存在，只保存一次只读备份，不改写当前外观、代码主题或 Diff 设置。注册时会忽略当前 Codex；以后即使从普通 Codex 图标启动，Hook 也会识别未启用 CDP 的新进程，受控重启一次后自动注入皮肤。

也可显式启动：

    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\start-miku-skin.ps1 -Tone Dark

只有明确接受重启当前 Codex 时才添加 -RestartExisting。

自动 Hook 不使用管理员权限、IFEO 或二进制劫持。关闭 Hook：

    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\unregister-miku-hook.ps1

## 验证与恢复

    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\test-windows-skin.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\verify-miku-skin.ps1 -ScreenshotPath C:\Temp\miku-stage.png
    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\restore-miku-skin.ps1

普通 Restore 只移除当前 Codex 会话的皮肤，并暂停 Hook 对这个进程的重注入；当前进程退出后，下一次普通启动会自动恢复皮肤。若要同时永久关闭自动 Hook，请显式添加 `-DisableAutoHook`：

    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\restore-miku-skin.ps1 -DisableAutoHook

若曾安装过会改写外观配置的旧测试版，可显式恢复那次备份：

    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\restore-miku-skin.ps1 -RestoreBaseTheme

完全卸载本地引擎和快捷方式：

    powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\scripts\restore-miku-skin.ps1 -Uninstall

## CDP 是怎么工作的

    官方 Codex Store 包（动态 AUMID 激活）
      └─ 用户登录 Hook 监听下一次普通启动
           └─ 未带 CDP 时受控重启一次
                └─ --remote-debugging-address=127.0.0.1 --remote-debugging-port=9347
           └─ /json/list 发现 app:// renderer
                └─ WebSocket CDP
                     ├─ Runtime.evaluate 注入 CSS/JS/装饰 DOM
                     ├─ Page.loadEventFired 后重注入
                     └─ Page.captureScreenshot 做实机验证

CDP 是 Chromium 的调试控制面，不是 Codex 官方主题 API。端口参数只能在进程创建时加入，因此普通启动被发现后必须重启一次；后续由注入 daemon 接管。它能力强，但也有两类代价：本机端口必须严格限制为 127.0.0.1；Codex 更新 DOM 后需要重新做兼容性 QA。详细说明见 windows/references/runtime-notes.md。

## 平台说明

本分支的 Miku Stage 交付针对 Windows。macos/ 是上游遗留实现，没有套用这套 14 组件规范，也没有在本次工作中修改。

## 许可与权利

- CDP 引擎结构来源与改写范围见 windows/NOTICE.md。
- 代码使用 windows/LICENSE 中的 MIT License。
- 非 OpenAI 官方产品。
- 初音未来及相关角色权利归相应权利人；生成插画用于用户本机私人主题，公开再分发或商用需另行完成权利审核。
