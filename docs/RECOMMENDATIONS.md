# Codex Dream Skin 外部主题包后续建议

> 本文保留候选路线的推导与延期项；已采纳的实施范围和完成标准以 [`../PLAN.md`](../PLAN.md) 为准。本文不记录运行状态、临时 TODO、检查点或持续执行规则。

## 1. 当前实施准备度

- 判断：完成关键事项后实施。
- 当前依据：`PRD.md`、`BUSINESS.md`、`TECHNICAL.md` 与当前 macOS/Windows 主题代码。
- 核心事实源与验证入口：现有 injector `--check-payload`、macOS `stage-theme.mjs`/`switch-theme-macos.sh`、Windows `theme-windows.ps1` 与两端测试套件。
- 关键外部能力与目标环境验证状态：不依赖 AI/API 或第三方归档库；作者工具的纯 Node ZIP 路线已经 hostile fixtures 验证，平台流式 importer 留在模块二。
- 原候选阻塞的处理：v1 字段/能力契约、作者 ZIP 适配器、安全恶意夹具和 PR #123 等价载荷加固已经被正式 Plan 的模块一采纳。
- 不阻塞但需要跟踪的问题：macOS 确认页的图形预览形式；主题素材许可信息如何展示。

## 2. Goal 候选

> Goal：让外部 AI 或开发者产出的声明式 `.dreamskin` 包可在 macOS 和 Windows 上离线、安全、可追踪地导入并应用。

- 结果：作者有完整套件；用户有本地导入入口；两端共享包身份、验证规则、错误语义和 golden fixtures。
- scope：本地 ZIP v1、零代码主题、作者工具、共享核心、平台适配、原子安装、可选应用、文档和 CI。
- 非目标：远程市场/URL、AI API、任意 CSS/JS、签名信誉、云同步和主题删除。
- 已验证起点：两端已有图片安全限制、payload 门禁、主题存储和切换链路；当前主线仍缺少外部包层。
- 关键依赖：v1 契约；安全归档读取；PR #123 或等价加固；Windows 原生测试环境。
- 最终可验证 DoD：同一个官方示例包在两端通过真实导入入口安装并应用；恶意/超限/不兼容/冲突夹具均在持久写入前失败或完成可证明回滚；完整平台测试与文档通过。

## 3. 建议补充的专项文档

| 文档 | 解决的问题与 scope | 阻塞级别 | 可验证 DoD | 建议顺序 |
| --- | --- | --- | --- | --- |
| `docs/THEME_PACKAGE.md` | v1 容器、manifest/theme 字段、能力矩阵、错误码、身份与更新规则 | 实施前 | 与 JSON Schema、示例和 validator 夹具一致 | 1 |
| `docs/VALIDATION.md` | 恶意 ZIP、资源边界、持久状态不变与回滚的专项验证矩阵 | 模块二前 | 每条安全不变量有自动化夹具和平台覆盖 | 2 |

如果归档实现最终引入第三方库，再创建 `docs/CAPABILITIES.md`；没有真实依赖前不预建。

## 4. 项目级候选模块路线

### 模块一：主题包契约与作者套件

- scope：验证 ZIP 技术路线；定义 `THEME_PACKAGE.md`、manifest/theme Schema、能力矩阵、错误码；提供示例源目录、Kimi/通用 Agent 提示词、`validate/pack/inspect` CLI 和 golden fixtures。
- 非目标：写入用户主题库、菜单/托盘入口、自动应用。
- 主要交付物：公开契约、Schema、作者文档、示例、包工具、合法与恶意容器夹具。
- 前置依赖：已选择性带入 PR #123 核心修复；纯 Node ZIP 作者工具已完成最小验证。
- 可验证 DoD：合法示例可重复打包并通过 inspect；所有 invalid fixtures 返回稳定错误码；Node 22 CI 通过；工具不联网且不写用户状态。
- QA 边界与方法：只验证包层与作者体验，不以平台 importer fallback 代替契约测试。
- 后续候选模块：共享导入核心与主题库事务。

### 模块二：共享导入核心与事务

- scope：受控条目流、Schema/哈希/兼容校验、平台规范化编译、导入报告、幂等/冲突、staging/backup/final 原子事务与恢复。
- 非目标：菜单、托盘、系统文件选择器和视觉预览。
- 主要交付物：共享 Node 核心、平台 archive/store adapter 接口、`import --dry-run`/fixture harness、`VALIDATION.md`。
- 前置依赖：模块一契约冻结；主题存储 adapter 边界确认。
- 可验证 DoD：恶意 ZIP、TOCTOU、磁盘/rename 故障、同 ID 冲突、重复导入、跨平台编译夹具全部可机械验证；失败时现有主题字节不变或旧备份恢复。
- QA 边界与方法：故障注入和目录边界检查；不启动 Codex，不依赖用户真实主题。
- 后续候选模块：macOS 与 Windows 用户入口。

### 模块三：macOS 导入入口与应用

- scope：CLI、菜单栏入口、文件选择、摘要/确认、冲突对话、现有主题库接入、立即/稍后应用与用户错误提示。
- 非目标：修改官方 Codex、引入常驻网络服务或独立主题商店应用。
- 主要交付物：macOS importer adapter、SwiftBar 菜单项、系统对话/预览原型、完整 shell/Node 测试。
- 前置依赖：模块二共享核心；PR #123 或等价加固。
- 可验证 DoD：临时 HOME 下完成合法导入、取消、冲突、替换、回滚和 Doctor；真实本机上验证首页与任务页，且安装状态不依赖仓库路径。
- QA 边界与方法：自动测试使用隔离 HOME；实机 verify 仅在最终集成门禁执行并明确记录。
- 后续候选模块：Windows 入口与跨平台发布。

### 模块四：Windows 导入入口与跨平台发布

- scope：PowerShell CLI、托盘入口、Windows Forms 确认/预览、主题库接入、立即/稍后应用、文档、发行包与 CI。
- 非目标：Windows 主题市场、Store 分发变化或与 macOS 不同的包格式。
- 主要交付物：Windows archive/UI/store adapter、托盘菜单、PowerShell 测试、跨平台示例与 README/平台文档。
- 前置依赖：模块二；Windows PowerShell 5.1/7 CI；模块三验证出的共同 UX 语义。
- 可验证 DoD：同一示例包在两端得到相同包身份和契约结果；Windows 5.1/7 完整套件通过；跨平台差异全部出现在能力报告而非静默行为中。
- QA 边界与方法：Windows 原生环境执行完整导入、更新、应用与恢复；Mac 上的 PowerShell 解析不作为 Windows 行为通过证据。
- 后续候选模块：远程市场、签名或扩展视觉能力只能另立 L2 需求。

## 5. 原型、验证与外部条件

### 原型、Demo 或专项验证

| 建议 | 目的 | 达到什么程度 | 影响哪个模块 |
| --- | --- | --- | --- |
| macOS ZIP 恶意夹具 Spike | 确认能枚举并有界读取条目而不整包解压 | 路径穿越、重复、链接、加密、压缩炸弹均在写入前阻断 | 模块一/二 |
| macOS 导入确认 UI 原型 | 确认菜单栏环境的摘要和预览可用性 | 不写主题库，只展示一个合法和一个冲突报告 | 模块三 |
| 跨平台 golden package | 证明同一包得到一致身份与规范化语义 | macOS/Windows 报告相同 packageId/version/hash | 模块一至四 |

### 项目级验证原则

- 每个模块的 DoD 与 QA 是该模块的交付边界。
- Goal 最终 DoD 覆盖两端真实导入入口、安装事务、应用结果和发行文档。
- 路径、大小、条目、Schema、哈希、错误码、幂等和回滚必须固化为自动化门禁。
- 不允许用“忽略危险条目”“导入失败后换默认主题”或其他 fallback 作为安全通过证据。

### 延期项与外部条件

| 事项 | 原因 | 需要谁/什么条件 | 影响哪个模块 |
| --- | --- | --- | --- |
| URL/主题市场 | 引入网络信任、更新与分发治理 | 新 PRD、来源信任和下载安全设计 | 后续独立 L2 |
| 任意 CSS/JS 插件 | 变成代码执行与版本兼容系统 | 新权限模型、沙箱和明确用户授权 | 后续独立 L2，不属于主题包 v1 |
| 作者签名与信誉 | 需要身份、密钥、撤销与审核体系 | 分发策略和外部基础设施 | 后续独立 L2 |
| 新贴纸/字体/DOM 能力 | 改变 renderer 和跨平台视觉契约 | 新视觉 PRD、Schema 与两端实现 | 后续主题能力模块 |

## 6. 建议移交与边界

- 候选建议的事实来源：`PRD.md`、`BUSINESS.md`、`TECHNICAL.md`、当前代码和用户确认的默认方案。
- 被执行层采纳后的正式总体 Plan：[`../PLAN.md`](../PLAN.md)。
- 已迁入正式 Plan 的稳定内容：四个模块的范围、非目标、完成标准、QA 边界与跨模块门禁。
- 仍有独立价值并由正式 Plan 引用的详细实施或契约文档：本蓝图、后续 `THEME_PACKAGE.md` 与 `VALIDATION.md`。
- 动态进度与 handoff 入口：尚无。
- 本文件不维护 Goal 运行状态、当前模块 Plan、临时 TODO、检查点、执行日志、暂停规则或连续执行循环。
