# Codex Miku Stage：路由覆盖与 14 项设计契约 QA

## 验收基线

- 视觉事实来源：component-matrix.md 与 component-spec-manifest.json。它们证明设计资产覆盖，不证明当前 DOM 运行时覆盖。
- 运行时契约来源：assets/miku-stage-theme.json 中的 14 项 components。
- 代码映射来源：assets/miku-stage.css 中按 01–14 排列的独立分区。
- 生成插画只能作为低干扰背景；真实按钮、文本、Diff、终端、菜单和输入框必须来自 Codex 原生 DOM。
- 自动静态门禁：tests/test-windows-skin.ps1。
- 路由级检查：在指定路由记录 route key、预期 selector/marker 命中、当前实现截图和交互结果，再按下表人工确认。

## 状态口径

- **Static Pass**：外部设计板的元数据/哈希快照、runtime manifest、hero PNG 与 CSS 分区通过静态门禁。这不是路由验收结果，也不表示本仓重新读取了外部 14 张 PNG。
- **Unverified**：没有当前 Codex 版本的路由命中、实机截图和交互证据。
- **Partial**：已看到路由或部分状态，但必查状态、selector 命中或交互回归仍不完整。
- **Verified**：当前实现上已保存 route/selector 证据与实机截图，并通过关键状态和原生交互检查；不存在未关闭的高优先级视觉问题。

静态门禁、单个 `app://` target 的 root/style 验证或一张截图均不足以把 14 项全部标为 Verified。

本文的 Verified 是 **2.0.3 当前实现的 Dark 路由基线**：对应 live contract 通过且截图已由主控逐张视觉复核。它不表示组件 14 中列出的每个 hover、disabled、loading 等通用状态都已人工触发。

## 2.0.5 Codex 更新兼容性重验

- 验收日期：2026-07-17（Asia/Shanghai）。
- Codex Store package：`OpenAI.Codex 26.715.2305.0`。
- 仅重验 Home、当前任务壳/修改摘要、thread summary output panel 与自动启动链路，不把结果外推到 Settings、Plugins、Scheduled tasks、独立 Diff tab、terminal、Quick Chat、Profile、Appearance 或 Pets。
- Home live contract：4/4 原生建议卡存在；正式 verify：`suggestionCount=4`、`visibleSuggestionCount=4`，且 composer、Miku art、14 项 manifest、装饰层 `pointer-events:none` 与无横向溢出均通过。
- 当前任务 verify：原生 sidebar、composer、change summary 与 thread summary output 分别命中组件 01、02、04、11，marker 在 SPA 恢复后通过有限重试收敛；`outputPanelMarked=true`，无缺失必需组件。
- 本地 Git-ignored 视觉证据：`runtime/qa/codex-26.715.2305-miku-recheck.png`、`runtime/qa/codex-26.715.2305-verified-visible.png`、`runtime/qa/final-installed-2.0.5.png`；前两张已人工复核为 4 张建议卡完整显示，后一张已复核当前任务壳、composer 与 output panel 的最终安装态。

## 2.0.3 基线元数据

- 验收日期：2026-07-16（Asia/Shanghai）。
- Codex Store package：`OpenAI.Codex 26.707.9981.0`；renderer 仅记录为固定 `app://`，不持久化原始标题或完整路由 URL。
- 分支：`codex/miku-stage-windows-skin`；发布后以 Draft PR head 为提交事实源。
- Runtime manifest SHA-256：`67fb512954a8458a9666e91daa0a6404ae2c4a0963a85c75f3f6e6d0f0949135`。
- CSS SHA-256：`1971bcb213b4466b7d981f4629ac121539fdf286bb1914dc9daf1339297a3f7c`。
- Renderer SHA-256：`c0a18b327cb87ce30f70eedf04482d824ae122b9b578df973e20e95409c2d84c`。
- Injector SHA-256：`d9c0982bc52b76d3a98fa3e8ae3074f056d3eaecf22847a5f8c6f5a068961515`。
- 本机独立设计源复核：14/14 组件 PNG 存在、14/14 SHA-256 与 metadata snapshot 一致，总计 21,141,377 bytes；这些 PNG 不随 runtime 仓库发布。
- 实机交互边界：通过原生导航打开所列页面、Diff、终端、账户菜单与 Quick Chat，检查 search focus/selected/scroll/overlay；没有发送消息、提交命令或更改用户数据。完整 disabled/loading/error/reduced-motion 状态仍归组件 14 Partial。

## 当前覆盖登记

| ID | 组件族 | 静态契约 | 运行时状态 | 当前证据 | 下一验收缺口 |
| --- | --- | --- | --- | --- | --- |
| 01 | App shell + sidebar | Static Pass | Verified | Home 与 task-output Dark contract 通过；`task-output-final-open.png` 已复核 shell、selected row、account footer 与侧栏 divider；resize separator 归属 01 而非 10 | Codex 更新后重跑路由基线；全状态扩展归入 14 |
| 02 | Task conversation + composer | Static Pass | Verified | task-output Dark contract 通过；`task-output-final-open.png` 已复核任务正文、修改卡、typed composer、附件与发送区 | Codex 更新后重跑；通用 disabled/loading 变体归入 14 |
| 03 | New-task empty state | Static Pass | Verified | 2.0.3 Home Dark contract 通过；`26.715.2305.0` 已用 `codex-26.715.2305-verified-visible.png` 复核四张原生建议卡真实可见且无遮挡、composer、插画与无横向溢出；owner 锁定内层 `[role="main"]` | 小窗口/减少建议卡作为后续响应式回归 |
| 04 | Change summary + Diff | Static Pass | Verified | Diff Dark contract 通过；`diff-contract-final.png` 已复核原生 Diff、增删语义、行号、代码可读性和无插画；owner 为稳定右侧 Diff tabpanel | Codex 更新后重跑；罕见 inline/error 变体归入 14 |
| 05 | Settings + controls | Static Pass | Verified | Settings General Dark contract 通过，5 个原生 `.miku-settings-card` 命中；`settings-general-dark-contract-final.png` 已复核卡片、search、switch/select 和焦点边界 | 其他 Settings 子页在 Codex 更新后抽样重验 |
| 06 | Plugins marketplace | Static Pass | Verified | Plugins Dark contract 通过；`plugins-focus-fixed.png` 已复核 tabs、search focus、安装条与卡片层级 | available/installed 数据变化后重跑 |
| 07 | Scheduled tasks | Static Pass | Verified | Scheduled Dark contract 通过；`scheduled-focus-fixed.png` 已复核 search focus、filter、任务行、未读点和时间文本 | 新状态数据出现时补 running/failed 回归 |
| 08 | Quick chat panel | Static Pass | Verified | Quick Chat Dark contract 通过；`quick-chat-contract.png` 已复核 dialog owner、overlay、recent list、composer 与层级 | minimized/error 变体出现时重验 |
| 09 | Task/account popovers | Static Pass | Verified | Popover Dark contract 通过；`account-popover-contract-final.png` 已复核 account menu、usage、键盘焦点、层级与不裁切 | task hover-card 内容变化时抽样重验 |
| 10 | Split launcher + terminal | Static Pass | Verified | Terminal Dark contract 通过；`terminal-contract-final.png` 已复核 split divider、terminal tab、等宽文本、cursor 与无主题装饰 | 后续补长时 running/error 输出回归 |
| 11 | Output/process panel | Static Pass | Verified | task-output Dark contract 通过；`task-output-final-open.png` 已复核 350–370px output panel、source rows、surface 层级；`26.715.2305.0` 最终安装态再次确认 `thread-summary-panel` host 命中 11 | process failed/stopped 数据出现时重验 |
| 12 | Profile analytics | Static Pass | Verified | Profile Dark contract 通过；`profile-installed.png` 已复核 profile header、metrics、heatmap、insights 与 plugin ranking | empty/error 数据变体归入 14 |
| 13 | Appearance + Pets | Static Pass | Verified | Appearance/Pets Dark contracts 通过；`appearance-installed.png` 与 `pets-installed.png` 已复核真实控件、theme preview、pet grid 和原图 | 新增原生控件后抽样重验 |
| 14 | States + tokens | Static Pass | Partial | Dark 路由已覆盖部分 default/selected/focus/success 状态；Light Home/Settings 有 smoke 证据 | hover、disabled、loading、empty、error、warning、unread 与 reduced-motion 未逐项人工触发 |

## 2.0.3 Dark live 证据

以下场景的 live contract 已通过，且对应截图已由主控逐张视觉复核。截图位于被 Git 忽略的 `runtime/qa/`，只登记本地相对路径，不提交图片本身。

| 场景 | 组件 | 本地证据 | 结果 / 关键合同 |
| --- | --- | --- | --- |
| Home | 01、03 | `runtime/qa/home-contract-final.png` | Pass；Home owner 为包含 `home-icon` 的内层 `[role="main"]`，四建议卡可见，无横向溢出 |
| Task + Output | 01、02、11 | `runtime/qa/task-output-final-open.png` | Pass；sidebar/composer/output marker 归属正确，sidebar separator 不误标 10 |
| Terminal | 10 | `runtime/qa/terminal-contract-final.png` | Pass；原生 terminal 和 split separator 合同命中 |
| Diff | 04 | `runtime/qa/diff-contract-final.png` | Pass；稳定 owner 为 `[role="tabpanel"][data-app-shell-tab-panel-controller="right"][data-tab-id="diff"]` |
| Account popover | 09 | `runtime/qa/account-popover-contract-final.png` | Pass；单个原生 menu/popover 命中且层级正确 |
| Settings General | 05 | `runtime/qa/settings-general-dark-contract-final.png` | Pass；5 个原生 `.miku-settings-card` 均命中 component 05 |
| Plugins | 06 | `runtime/qa/plugins-focus-fixed.png` | Pass；页面、原生插件卡和 search focus 合同命中 |
| Scheduled tasks | 07 | `runtime/qa/scheduled-focus-fixed.png` | Pass；页面、任务行和 search focus 合同命中 |
| Quick Chat | 08 | `runtime/qa/quick-chat-contract.png` | Pass；`quick-chat` dialog owner 与 composer 命中 |
| Profile | 12 | `runtime/qa/profile-installed.png` | Pass；profile page 与 heatmap marker 命中 |
| Appearance | 13 | `runtime/qa/appearance-installed.png` | Pass；Appearance page 和 theme preview 命中 |
| Pets | 13 | `runtime/qa/pets-installed.png` | Pass；Pets page 和原生 pet surface 命中 |

## 2.0.3 Light 视觉 smoke

| 场景 | 本地证据 | 结果 |
| --- | --- | --- |
| Home | `runtime/qa/home-light-token-bridge.png` | Pass；浅色 token bridge 下前景、卡片、侧栏与 composer 可读 |
| Settings General | `runtime/qa/settings-general-light-card-fixed.png` | Pass；已修复原生 dark token 导致的白底白字、深色设置卡混入、边界 token 和 search 双焦点框 |

这两个截图是 Light 视觉 smoke，不将其外推为所有 Light 路由或组件 14 全状态已验收。

## 证据记录最小字段

每次把路由升级为 Verified 时，至少记录：

1. 日期、Codex 版本和本实现 commit/资产哈希；
2. route key/页面名与 selector/marker 预期数、实际命中数；
3. 截图路径或可追踪的 QA 产物；
4. 已执行的 hover/focus/selected/disabled/error 状态与原生交互；
5. 溢出、遮挡、对比度、装饰层 `pointer-events` 和未关闭缺口。

## 14 项设计契约的目标与通过标准

| ID | 组件族 | 目标 DOM/页面 | 必查状态 | 通过标准 |
| --- | --- | --- | --- | --- |
| 01 | App shell + sidebar | 主画布、顶部栏、全局/项目侧栏、选中行、展开项 | default、hover、active、expanded、badge、account footer | 侧栏为深海军蓝半透明层；选中行有青色内侧锚线；文字、项目状态点和底部账户入口可读可点 |
| 02 | Task conversation + composer | 用户/助手消息、引用、正文、操作区、原生 composer | empty、typed、attachment、model、permission、send enabled/disabled | 消息密度不变；用户消息仅轻度青色表面；光标清晰；发送、语音、模型、附件按钮不被装饰遮挡 |
| 03 | New-task empty state | home mascot/icon、标题、原生建议卡、项目选择、composer、右侧插画 | wide、narrow、2–4 suggestions | 插画在右侧且左侧留出正文空间；建议卡仍是原生按钮；窗口变窄时不横向溢出；小于 1120px 自动隐藏字标 |
| 04 | Change summary + Diff | 修改摘要卡、增删计数、review/undo、代码行语义 | collapsed、expanded、added、removed、current line、review | added 使用绿色、removed 使用粉红红色、当前行用低透明青色；代码画布无插画；行号与操作按钮清楚 |
| 05 | Settings + controls | 设置侧栏、search、section/card、input、select、switch、segmented/tab | default、hover、selected、focus、disabled | 控件沿用 8/12/16px 圆角与青色 2px 焦点环；开关状态可分辨；说明文本不因低对比消失 |
| 06 | Plugins marketplace | tabs、search、installed strip、插件/连接器/skill 卡、安装按钮 | installed、available、hover、focus、disabled | 卡片只改变表面/描边，不改布局；安装与已安装语义清楚；官方图标不被着色或替换 |
| 07 | Scheduled tasks | filter、任务行、unread、enabled、paused、next run、建议、新建入口 | running、success、paused、failed、unread | 青/绿/黄/红状态保持语义；未读点可见但不抢正文；下一次运行时间不截断 |
| 08 | Quick chat panel | 浮窗壳、recent list、composer、关闭/最小化 | empty、list、focused、minimized | 20px 圆角、清晰阴影、青色焦点；浮窗高于主内容；真实输入与历史项可交互 |
| 09 | Task/account popovers | hover card、账户与用量菜单、tooltip、progress | default、hover、selected、warning、keyboard focus | popover 高于窗口内容且指针不漂移；320/420px 级别宽度保持；usage、pin、archive、logout 可读 |
| 10 | Split launcher + terminal | 分隔线、launcher rows、terminal tabs、xterm 内容 | hover、drag、focus、disabled、running、success、error | 分隔线 hover 才增强；终端始终使用纯净深色代码面，无插画/网格覆盖；等宽字体与光标清楚 |
| 11 | Output/process panel | 输出面板、后台进程行、add 菜单、empty/loading/error | running、success、failed、stopped、truncated | 面板宽度与相对层级不变；运行点、成功、失败颜色一致；长命令截断但 tooltip 仍可读 |
| 12 | Profile analytics | profile header、metric cards、heatmap、insights、plugin ranking | private/shared/edit、5 heat levels、empty/loading/error | 统计卡不改数据；热力等级由暗到亮青色；隐私/分享/编辑状态可区分；无角色图遮盖图表 |
| 13 | Appearance + Pets | theme controls、颜色/字体、preview、pet card/preview | dark/light、selected、hover、disabled、empty/error | 仅主题化 Codex 实际存在的控件，不新增虚构功能；宠物原图不重绘；深浅模式都保持前景对比 |
| 14 | States + tokens | button/input/search/select/switch/tab/card/list/badge/tooltip/toast | default、hover、active、selected、focus、disabled、loading、empty、error、success、warning、unread | token 与 manifest 完全一致；键盘焦点始终可见；reduced-motion 下动画近似关闭；magenta 仅用于少量强调 |

## 功能回归

1. 在 New Task 点击一个原生建议卡，确认正常填充 composer 或触发原生动作。
2. 打开真实项目选择器、账户菜单、任务 hover card 和 Quick Chat；确认皮肤层不截获鼠标。
3. 输入、选择模型、添加附件、清空文本；不发送测试内容。
4. 打开一条有文件修改的任务；展开摘要与 Diff，检查 added/removed/current-line。
5. 打开终端并输入无副作用命令；检查焦点、光标、滚动和输出。
6. 打开 Settings、Plugins、Scheduled tasks、Profile、Appearance、Pets，逐页截图。
7. 运行 verify-miku-skin.ps1 -Reload；确认 Page.loadEventFired 后注入标记恢复。
8. 运行 restore-miku-skin.ps1，确认 DOM/CSS 被移除；再次启动，确认可重复应用。

## 安全与更新检查

- CDP HTTP 与 WebSocket 都只能出现 127.0.0.1。
- 默认快捷方式不得携带 -RestartExisting。
- Auto Hook 必须是当前用户 AtLogOn + Limited 计划任务；注册当下必须忽略当前 Codex，且不得使用 IFEO 或管理员进程劫持。
- 不写入 WindowsApps，不解包或替换 app.asar，不接管目录权限，不修改签名。
- injector daemon 退出后不再自动重注入；Restore 应移除当前文档中的 style、class、chrome 和 marker。
- Codex 更新后重新运行 install、静态测试与逐路由命中/截图；未重验路由回退为 Unverified。DOM selector 变化必须作为兼容性问题处理，不能宣称永久兼容。

## 明确失败条件

- 任意真实控件不能点击、不能键盘聚焦或被背景遮住。
- 侧栏、Diff、终端、输出区出现整张插画或高对比网格。
- 横向溢出、composer 覆盖消息、popover 被主窗口裁切。
- 14 个 CSS 分区或 14 个 manifest component 任一缺失（静态契约失败）。
- 未打开或未记录 selector/marker 命中的路由被标为 Verified。
- 深色/浅色 token、增删语义色、焦点环偏离锁定规范。
- 远程调试端口监听非回环地址，或默认启动静默杀死现有 Codex。
- Hook 注册后立即重启当前 Codex，或重启到非官方 Store ChatGPT.exe 路径。
