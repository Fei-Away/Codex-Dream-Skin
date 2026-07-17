# Codex Miku Stage · 项目记录

## 1. 目标与来源

本仓库在 Codex Dream Skin 的 Windows CDP 引擎基础上制作一套新的初音未来主题。上游来源、base commit 和复用边界记录在 windows/NOTICE.md。

设计事实来源是本机 codex-miku-ui-theme 项目中的 14 张独立组件板；本仓保存其 manifest、哈希、组件矩阵和运行时映射，不把组件板拼成假 Codex 截图。

14 项是设计与静态契约的完整性边界，不等于 14 个当前 Codex 路由已经完成 DOM 命中、交互回归和视觉签收。运行时覆盖必须按路由单独记录证据。

## 2. 当前状态

Windows manifest 当前版本为 **2.0.5**。

### 已实现

- Windows loopback CDP 启动、target discovery、Runtime.evaluate 注入、reload 重注入、verify/screenshot、live cleanup。
- 14 项设计契约、manifest 条目和顺序对应的 CSS 分区，可做静态完整性校验。
- 深色与浅色 token；默认 Dark。
- 专用 Miku Stage 插画，只在 New Task 空状态作为背景使用。
- 安装到 %LOCALAPPDATA%\CodexMikuSkin\engine，创建安全快捷方式；配置存在时只保存一次备份，不写入外观、代码主题或 Diff 设置。
- 恢复、配置回滚、卸载。
- 可选的用户级 AtLogOn Auto Hook；注册时忽略当前进程，未来普通启动时只重启官方 Store Codex 一次以补齐 CDP 参数。
- Store 启动通过当前包 family 与 manifest application ID 动态组成 AUMID，并使用 Windows `IApplicationActivationManager` 传递 CDP 参数；不直接执行受保护的 WindowsApps 二进制。
- 普通 Restore 只暂停并清理当前官方 Codex 会话，Hook 保持注册并在该进程退出后的下一次启动自动恢复；永久关闭必须显式使用 `-DisableAutoHook` 或 unregister 脚本。
- 14 项设计契约、PNG、Node/PowerShell 语法、loopback 和官方包不变性静态测试。这些测试不声明当前 DOM selector 已命中或真实控件已通过交互验收。
- 2.0.3 保留并复验了 Dark 路由基线：home、task/output、Diff、terminal、popover、Settings、Plugins、Scheduled tasks、Quick Chat、Profile、Appearance 和 Pets，对应组件 01–13。
- 2.0.5 已在 `OpenAI.Codex 26.715.2305.0` 上重验 Home 与当前任务壳/输出面板：4 张原生建议卡全部真实可见且无遮挡，原生 sidebar/composer、当前修改摘要、thread summary output、插画、14 项 manifest 与无横向溢出检查通过；其他路由仍沿用 2.0.3 基线，不外推为本次重验结果。

### 部分实现

- DOM 适配使用当前 Codex 的语义 role、data-testid 和少量现有 class。组件 01–13 已有当前版本的 Dark 路由基线证据；组件 14 的 hover、disabled、loading 等全状态矩阵未逐项人工触发，仍为 Partial。
- Light 模式有独立 token 与启动参数；home 和 settings-general 已通过视觉 smoke，但不外推为全 Light 路由签收。

### 未实现 / 后续

- 没有自动导航 Codex 所有页面并批量截图；这会涉及控制正在使用的 Codex 窗口。
- macos/ 仍是上游旧实现，没有迁移 14 组件规范。
- 没有公开发行初音角色插画；公开或商业再分发前需单独做权利审核。

## 3. Windows 架构

    install-miku-skin.ps1
      ├─ 校验 manifest / 插画 / CSS / Node
      ├─ 复制独立 engine
      ├─ 可选保存只读配置备份，不修改 Appearance
      └─ 创建安全启动与恢复快捷方式

    start-miku-skin.ps1
      ├─ Get-AppxPackage 动态发现官方 Codex
      ├─ manifest application ID → AUMID → Store package activation
      ├─ 只在 127.0.0.1 打开 CDP
      ├─ 启动 injector daemon
      └─ 等待 Runtime.verify 通过

    hook-miku-skin.ps1
      ├─ Limited 用户计划任务 AtLogOn 启动
      ├─ 精确匹配 Store Codex ChatGPT.exe 路径
      ├─ 注册当下忽略现有 PID
      ├─ Restore pause 只忽略当前官方 PID，退出后自动清理
      └─ 新的无 CDP 启动 → 按 PID 受控重启一次 → start

    injector.mjs
      ├─ /json/list → app:// page target
      ├─ WebSocket CDP → Runtime + Page
      ├─ manifest 校验 → CSS / renderer / art payload
      ├─ Runtime.evaluate
      ├─ Page.loadEventFired 重注入
      ├─ Home 四建议卡存在 / 可见 / 中心点无遮挡检查
      └─ Page.captureScreenshot

    renderer-inject.js
      ├─ root class + style + aria-hidden chrome
      ├─ 语义 surface markers
      ├─ MutationObserver + 5s 幂等 ensure
      └─ cleanup

## 4. 关键契约

- assets/miku-stage-theme.json 必须有 14 个唯一的 01–14 component、dark/light token、CSS 与 art 路径。
- 当前 manifest 版本必须为 2.0.5，安装后引擎与工作树版本一致。
- assets/miku-stage.css 必须有 14 个顺序一致的 section marker。
- Home 的组件 03 owner 是包含 `home-icon` 的内层 `[role="main"]`；Diff 的组件 04 owner 优先使用右侧 `data-tab-id="diff"` tabpanel，不依赖易变的宽泛容器。
- Settings General 必须命中真实的 `.miku-settings-card`；2.0.3 基线为 5 个原生卡片。
- 装饰层必须 pointer-events: none；Diff、终端、输出和正文不得叠加高对比插画。
- 远程调试 HTTP 与 WebSocket URL 必须都是 127.0.0.1。
- 默认快捷方式不得使用 -RestartExisting。
- 自动 Hook 不得使用 IFEO、管理员权限或通用 ChatGPT.exe 劫持；只能匹配当前 OpenAI.Codex Store 包路径。
- Store 启动必须使用当前 manifest AUMID 与 `IApplicationActivationManager`，不得直接 Start-Process WindowsApps 下的 exe；普通 Restore 不得静默永久注销 Hook。
- 运行时必须保持单 Hook + 单 injector daemon；停止持久化 PID 前必须核对可执行文件、脚本路径、端口、命令行、启动时间和实例 token。Hook 使用单实例互斥，start/restore 使用独立转换互斥保证 pause 与注入不会交错；隐藏 daemon 与前台诊断 watcher 都必须先持久化可恢复身份，再在验证或长期等待前释放转换锁。Target HTTP、CDP socket/command 必须有超时，确保半断连时 Restore 仍可接管。
- installer 不得写入 appearance key；`-RestoreBaseTheme` 只用于旧测试版的显式兼容恢复。
- 不写 WindowsApps，不读取或改写凭证，不改 provider、API Key 或 Base URL。

## 5. 验收与覆盖模型

验收分为三层，不得用上一层结果替代下一层：

1. **静态契约**：`windows/tests/test-windows-skin.ps1` 检查 14 项外部设计资产的元数据/哈希快照、runtime manifest、hero PNG、CSS 分区、语法和安全 guard。设计板 PNG 位于独立设计源，不在本仓重算。
2. **路由检测**：在指定 Codex 路由记录 route key、预期 selector/marker 命中、样式注入状态和溢出情况。`verify-miku-skin.ps1` 的 root/style 健康结果不能单独证明全路由覆盖。
3. **交互与视觉签收**：保存当前实现的实机截图，验证必要 hover/focus/selected/disabled/error 状态与原生点击、键盘、滚动行为。

路由状态使用以下口径：

- **Unverified**：只有设计/静态契约，没有当前 Codex 版本的路由证据。
- **Partial**：有路由命中、局部状态或截图证据，但未完成所有必查状态和交互回归。
- **Verified**：当前实现上有 selector/marker 命中记录、实机截图和关键交互结果，且无未关闭的高优先级视觉问题。

当前路由状态和缺口见 `windows/references/qa-inventory.md`。Codex 更新后必须重新执行三层验收；CDP 引擎可继续使用不代表 DOM selector 一定兼容。

## 6. 分支说明

本地开发分支为 codex/miku-stage-windows-skin。origin 指向只读上游 Fei-Away/Codex-Dream-Skin；发布时只向已认证用户的 fork 推送同名功能分支，并从 fork 创建 Draft PR，禁止直接推送 main。

最后更新：2026-07-17。
