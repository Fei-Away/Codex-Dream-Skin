# Windows CDP 运行说明

## 实际调用链

1. 可选的 hook-miku-skin.ps1 由用户级登录计划任务启动，低频监听官方 Codex 可执行文件。普通图标启动的进程没有 CDP 时，Hook 只重启该 Store 包的进程一次，再交给 start-miku-skin.ps1。
2. start-miku-skin.ps1 动态查询 OpenAI.Codex Store 包和 manifest application ID，组成当前 AUMID，通过 Windows `IApplicationActivationManager` 激活官方包并传入 CDP 参数，只在 127.0.0.1:9347 打开远程调试端口。它不直接执行受 WindowsApps ACL 保护的 ChatGPT.exe。
3. injector.mjs 请求 http://127.0.0.1:9347/json/list，筛选 url 以 app:// 开头的 page target，并取得对应 WebSocket debugger URL。
4. 注入器通过 WebSocket 发送带递增 id 的 CDP JSON 消息，启用 Runtime 与 Page domain。
5. Runtime.evaluate 在 Codex renderer 的 JavaScript 上下文执行 renderer-inject.js。该脚本创建 style、根 class、少量 aria-hidden 装饰 DOM，并把插画变成 renderer 内部 blob URL。
6. MutationObserver 处理单页应用内部路由变化；Page.loadEventFired 处理整页 reload；5 秒低频 ensure 只做幂等修复。
7. verify 使用 Runtime.evaluate 读取 DOM、尺寸和注入状态；可选的 Page.captureScreenshot 直接从 renderer surface 截图。这是引擎健康与当前页面证据，不自动等价于 14 个设计契约都已运行时验收。
8. 普通 restore 先记录当前官方 Codex 主进程为会话级 pause，再停止 daemon，并通过同一 CDP 通道调用 cleanup，移除 class、style、装饰 DOM、marker 和 blob URL。Hook 保持注册但不会重新注入该进程；该进程退出后 pause 自动清理，下一次普通启动恢复皮肤。只有 `-DisableAutoHook`、`-Uninstall` 或独立 unregister 脚本会注销 Hook。

CDP 在这里是浏览器/Chromium 的调试控制面，不是 Codex 官方主题 API。它能执行 renderer JavaScript，因此权限高、兼容性依赖当前 DOM，也比官方 Appearance 设置脆弱。

## 运行时覆盖口径

- **静态契约通过**：只代表 14 项设计资产、manifest 与 CSS 分区存在且彼此一致。
- **路由已检测**：当指定路由活跃时，记录了 route key 和预期 selector/marker 命中，但仍可能缺少某些状态。
- **路由已验收**：当前实现有实机截图、必要状态和原生交互证据；只有这一层可在 `qa-inventory.md` 标为 Verified。

对单一 `app://` target 或单一 task 页运行 verify，不能外推 Settings、Plugins、Scheduled tasks、Profile 等未打开路由。

`tests/audit-live-components.mjs` 提供按场景的只读 selector/marker 审计。它只请求 loopback `/json/list` 并使用 `Runtime.evaluate` 读取 DOM，不导航、不注入、不发送输入。场景审计通过仍只完成三层验收中的“路由检测”层。

## 2.0.3 稳定路由 owner

- Home 不再把外层 shell main 当成组件 03；owner 是包含 `home-icon` 的内层 `[role="main"]`。
- Diff 优先使用 `[role="tabpanel"][data-app-shell-tab-panel-controller="right"][data-tab-id="diff"]`，避免把任务正文或其他右侧容器误标为组件 04。
- Settings General 在 settings shell 内标记真实 rounded/bordered 原生卡片；2.0.3 基线命中 5 个 `.miku-settings-card`。
- Quick Chat 只接受 `[role="dialog"][data-pip-obstacle="quick-chat"]`；其他带输入框的 dialog 不再误标组件 08。
- 插画使用内容 fingerprint；热重注入只在 payload 相同的时候复用 blob URL，内容改变时切换并撤销旧 URL。
- Output 使用 `[data-pip-obstacle="thread-summary-panel"]` host；侧栏 resize separator 归属组件 01，只有与终端区域相关的 separator 才归属组件 10。

## Dark 签收与 Light smoke

- 2.0.3 Dark 路由基线已在 Home、task/output、terminal、Diff、account popover、Settings General、Plugins、Scheduled tasks、Quick Chat、Profile、Appearance 和 Pets 通过 live contract，且截图已逐张视觉复核。
- Light 仅在 Home 和 Settings General 完成视觉 smoke。本轮修复了原生 dark token 在 Light 下造成的白底白字、深色设置卡混入、边界 token 不足和 search 双焦点框。
- 组件 14 中 hover、disabled、loading 等通用状态未逐项人工触发，因此仍为 Partial。
- 截图保存在 Git 忽略的 `runtime/qa/`，不提交到仓库；证据文件名和路由状态见 `qa-inventory.md`。

## 状态与文件

- 安装运行时：%LOCALAPPDATA%\CodexMikuSkin\engine
- 当前 manifest/安装状态版本：2.0.5；视觉路由证据仍以 2.0.3 基线为主，`OpenAI.Codex 26.715.2305.0` 只新增 Home、当前任务壳/修改摘要、thread summary output panel 与自动启动兼容性重验。
- daemon 状态：%LOCALAPPDATA%\CodexMikuSkin\state.json
- 安装状态：%LOCALAPPDATA%\CodexMikuSkin\install-state.json
- 日志：%LOCALAPPDATA%\CodexMikuSkin\injector.log 与 injector-error.log
- 配置：安装器不修改 `config.toml`；文件存在时可保留一次只读备份 `%LOCALAPPDATA%\CodexMikuSkin\config.before-miku-stage.toml`
- Hook 状态：%LOCALAPPDATA%\CodexMikuSkin\hook-state.json 与 hook-registration.json
- 当前会话 Restore pause：%LOCALAPPDATA%\CodexMikuSkin\hook-pause.json（相关官方 Codex PID 全部退出后自动删除）
- Hook 日志：%LOCALAPPDATA%\CodexMikuSkin\auto-hook.log
- 计划任务：Codex Miku Stage Auto Hook（当前用户、Limited、AtLogOn）
- 默认端口：9347；测试实例必须使用另一个端口和独立 ProfilePath。

2.0.4 生命周期检查要求只有 1 个 Auto Hook 和 1 个 `injector.mjs --watch` daemon。脚本不会只凭 `state.json` 中的 PID 结束进程：必须同时核对 executable/name、精确脚本路径、命令行端口、启动时间和实例 token；Hook 使用 `CodexMikuSkinAutoHook` 单实例互斥，start/restore 另共享 `CodexMikuSkinRuntimeTransition` 转换锁。Restore 与 Hook 即使在同一轮轮询中交错，最终也只能按锁顺序完成“注入后清理”或“先 pause 后跳过内部启动”，不会在 cleanup 后重新注入。start 对隐藏 daemon 与 `-ForegroundInjector` watcher 都先写入完整状态，再在 verify 或长期等待前释放转换锁；前台 watcher 只有确认退出后才删除自身状态，停止失败时保留恢复信息并报错。Target HTTP 可中止，WebSocket 打开和每条 CDP command 都受超时限制，因此渲染器半断连不会长期阻塞 Restore。

2.0.5 的 Home verify 不再只统计 DOM 数量：只有恰好 4 张原生建议卡同时通过连接状态、client rect、祖先 `display` / `visibility` / `opacity`、视口范围与中心点 `elementFromPoint` 所有权检查时才通过。`homeScenario` 与 `visibleSuggestionCount` 是新增诊断字段，原有 verify 字段保持兼容。普通 `--verify` 也会在调用者提供的有限 `--timeout-ms` 内重试，等待 SPA 恢复后的原生组件与 marker 收敛，而不是在第一次瞬态读取时误报失败。

## 安全边界

- 只接受 IPv4 loopback 的 HTTP target 与 ws://127.0.0.1 WebSocket URL。
- 皮肤运行时不要启动来源不明的本机程序；任何能连接该端口的本机进程都可能获得 renderer 调试能力。
- 默认快捷方式不强制结束现有 Codex；只有显式传入 -RestartExisting 才会关闭并重启。
- 自动 Hook 注册时忽略当前 Codex，只处理之后的新进程，并通过 RestartProcessId 只关闭新检测到的官方 Codex 主进程；不用管理员权限、IFEO、注册表进程劫持或官方快捷方式替换。
- Store 启动只使用从当前包 family 与 manifest application ID 动态组成的 AUMID，并通过 `IApplicationActivationManager` 传递参数；不得改 WindowsApps ACL，也不得回退到直接 Start-Process 包内 exe。
- 普通 Restore 的 `hook-pause.json` 只包含经过当前 OpenAI.Codex 包路径与主窗口过滤的进程 PID；为避免共享 CDP 端口在 pause 期间重新注入，任一记录 PID 存活时 Hook 整体等待，全部退出后立即删除 pause 并恢复后续普通启动。
- Verify、live audit 和 watch 日志只输出固定 `app://` renderer 标识与 target id，不记录原始页面标题或完整路由 URL。
- 不得同时运行多个 Hook 或多个相同端口的 injector daemon；如果 state 与实际进程不一致，先停在安全位置排查，不继续叠加注入。
- CDP 参数无法在 Chromium 已启动后追加，因此普通启动必须受控重启一次；这是协议启动条件，不是视觉层的限制。
- 不把 CDP 端口暴露到局域网，不做端口转发，不在防火墙中开放。
- 不写入官方安装目录；Store 更新后由 Get-AppxPackage 重新发现当前版本。
- 不保证 DOM selector 永久稳定；每次 Codex 更新后必须逐路由重新生成命中记录与截图证据，未重验的路由回退为 Unverified。

## 故障定位

- 端口占用：改用一致的 -Port 值执行 start、verify 和 restore。
- 已有 Codex 未启用 CDP：关闭窗口后从 Miku Stage 快捷方式启动；需要强制重启时明确使用 -RestartExisting。
- 启动成功但验证失败：先看 injector-error.log，再运行 tests/test-windows-skin.ps1 排除资产、语法或 14 项设计契约问题。静态测试通过后仍要单独检查当前路由的 selector/marker 命中。
- 更新后局部未着色：保存该路由截图，定位变化的语义 selector；不要用整窗截图覆盖作为修复。
- 想暂时回到原生外观：运行 restore-miku-skin.ps1，当前会话退出后自动 Hook 恢复；需要永久关闭 Hook 时加 -DisableAutoHook，需要恢复配置时加 -RestoreBaseTheme。

## 协议资料

- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Runtime.evaluate: https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate
- Page domain: https://chromedevtools.github.io/devtools-protocol/tot/Page/
