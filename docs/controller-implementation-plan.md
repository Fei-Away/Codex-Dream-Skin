# Dream Skin 长期实施方案

日期：2026-09-05。当前执行阶段：A，稳定性 Issue / PR 批次。

本方案承接 [Controller 迁移路线](./controller-migration-roadmap.md)。根目录
`TASK_PROGRESS.md` 是执行事实来源，记录分支、提交、PR、CI、发布、测试证据和下一步。
本文件定义目标与验收，不把计划中的模块描述为已实现。

## 1. 目标与架构决策

目标是提高操作效率、恢复可靠性和修改可预测性，让新增功能有明确归属。
用户操作最终由一个 Controller 负责完整生命周期；Shell / PowerShell 退出默认
用户运行时，保留确有需要的安装、构建、迁移和离线恢复工具。

| 层 | 唯一职责 | 代码归属 |
| --- | --- | --- |
| 菜单栏 / 托盘 | 提交操作、显示进度和真实结果 | macOS AppKit / Windows 原生 UI |
| Controller | 串行写操作、取消、超时、状态、恢复、子进程生命周期 | macOS Swift / Windows 受支持 .NET LTS |
| 平台 adapter | 应用发现、身份、启动、窗口、系统注册、文件权限 | 各平台目录 |
| 共享 runtime | 主题解释、payload 装配、renderer、通用 CDP 数据与 readiness 判定 | `runtime/` 规范源 |
| 合同与 fixture | 主题包、Safe CSS、公开 part / token、操作语义 | 版本化数据与共享测试样本 |
| 网站与 Go API | 制作、预览、审核、分发、平台与版本兼容声明 | `dreamskin-cc` |

Windows Controller 首先以普通用户权限运行，复用受管 Node injector；不在 C#
重新实现 renderer 或一套主题校验器。macOS 复用现有 Swift App。SDK 版本在原生
阶段开始时按目标 Windows 版本与支持周期选定并固定，CI 验证相同工具链。

现有两仓继续分别发布。主题 schema / limits / Safe CSS 的规范源沿用网站
`packages/theme-schema`，公开 part / token 沿用 `packages/skin-api`；客户端以
固定来源版本生成或带入副本。客户端 `runtime/` 是 renderer 和 injector 共同逻辑
的规范源。先建立来源记录与一致性测试，再按实际需求决定是否独立发布包。

## 2. 阶段 A：稳定性批次优先

先完成本批的修复、组合回归和发布验收，再切换默认运行时架构。审阅范围保持在
下面几项；等待外部证据的项目不扩张为清理整个 GitHub 队列。

| 项目 | 动作 | 验收与退出条件 |
| --- | --- | --- |
| #398 | 修复 macOS 取消后强制退出 | 热重载优先；两层取消都终止；未确认退出时不发 TERM/KILL，不重启、不继续配置写入 |
| #399 | 保留 Codex 原生字体 | 删除基础皮肤对 body 字体的强制覆盖；界面和代码字体分别保留；颜色/背景与 Safe CSS 边界不变 |
| #396 / #394 | 审阅已有圆角 PR | 共享源与双端资产同步；Home utility/composer 四角正确，任务页无回归 |
| #401 | 审阅已有更新回退 PR | API 正常、限流、固定仓库跳转、HTTP 头大小写、错误跳转及无版本时结果明确 |
| #356 / #280 | 审阅当前 CDP 有界读取 PR | 数组单元素/空数组、异常 JSON、大小/超时、字段与端点身份约束；双端安装资产齐全 |
| #387 / #218 | 核对已合并未发布的 watcher 修复 | 空闲退避有效，Codex 重开仍恢复；记录请求次数与 CPU，不用停止 watcher 掩盖重连缺陷 |
| #390 / #235 / #395 | 验证已合并的 Windows profile 路径 | Store 来源和版本明确；CDP 在 runtime 交接后仍可用；首次登录及第二次启动、恢复均有实机证据 |

各修复独立 PR。现有外部贡献优先沿原 PR 审阅与补充，记录来源，避免重复提交。
`action_required` 只说明 CI 等待运行许可；审核 workflow 后才能放行。CI 成功后
仍按改动需要做 native smoke。无法复现的上游 CDP 问题保持未验证状态。

贡献署名是交付验收的一部分：优先合并贡献者原 PR，审阅产生的补充修复单独
记录。合并时核对最终提交保留原作者身份；采用 squash 或必须转入替代 PR 时，
使用经核对的原作者信息保留 author 或 `Co-authored-by`，并引用原 PR。Changelog
和 Release notes 写明贡献者账号及对应 PR；发布后核对 GitHub 的贡献归属。
本地整合与再生成平台资产不改变原补丁的贡献归属。未采用的 PR 保留清楚的
审阅结论和后续要求，不把审阅等同于已合并或已完成贡献者登记。

发布 gate：准确主线提交、六处版本一致、release workflow 构建 DMG / Setup.exe、
tag 对应提交、校验和、公开且可下载的 Release 分别核对。网站随后更新下载 pin
并部署验证。发布所需 Windows/native 证据缺失时保留候选；可并行准备后续纯逻辑
合同和 fixture，但不切换用户入口。

## 3. 阶段 B：先收敛共享逻辑与合同

| PR 单元 | 实现范围 | 验收 |
| --- | --- | --- |
| B1 readiness | 从两份 injector 提取 signals 到 verdict 的纯判定，平台探测仍留 adapter | 同一 fixture 双端同一语义；覆盖 overflow、晚到 composer、主页/任务页、隐藏窗口 |
| B2 payload | 统一主题解释和 payload 装配，保留已验证的模板替换、图片与 Safe CSS 校验 | 双端 payload 检查；重复应用与完整清理；主题名特殊字符与既有包回归 |
| B3 合同同步 | 固定规范来源版本，生成 limits / policy / parts / tokens 副本；建立共同包样本 | 浏览器、Go、客户端对同一包结果一致；平台和 minClient 差异显式断言 |
| B4 操作合同 | 实现第 5 节的协议及旧状态读取 adapter，先用于 status / verify | 旧状态 fixture、缺失/损坏状态、陈旧结果、UI 重连、重复请求 |

提取一个模块就迁移其所有消费者并删除被替代的重复逻辑；保留运行行为，不同时
改变 schema、视觉规则和启动方式。现有 JS runtime 的业务规则继续共用，避免
为了原生化把同一套策略分别翻译成 Swift、C#、PowerShell。

## 4. 阶段 C 至 F：逐步接管和删除旧入口

### C：Windows Controller

1. 新增可安装的 Controller，先接管 `status`、`verify` 和诊断。旧入口仍可使用。
2. 统一旧、新执行器的操作互斥和状态 adapter，验证安装升级与回退。尚不写新
   schema 到旧脚本只能读取的状态文件。
3. 接管主题导入和库操作，沿用现有安全导入器；导入成功不自动激活。
4. 成对准备 `start/reapply/apply-theme` 与 `restore`，每个操作单独 PR，但必须
   恢复路径已验证才能切换对应写入口。托盘只提交命令和订阅结果。
5. 接管暂停、主题切换和更新检查；最后修改快捷方式、协议处理和登录启动注册。

每一步需有旧版安装升级、干净安装、重复点击、慢请求、进程中断与恢复证据。
新执行器失败不能自动并行启动旧脚本。fallback 的先决条件是未产生副作用，或
本次事务恢复已经验证。保留可独立运行的 Repair / Recovery 路径。

### D：macOS 操作编排收敛

Swift App 逐项接管与 Windows 相同的操作语义，保留系统特定权限、应用激活和
签名验证。阶段 A 的取消回归必须持续通过；迁移冷启动一键换肤、导入后显式应用、
独立恢复官方外观时，分别覆盖取消与失败。替代一个脚本调用后再移除对应入口。

### E：兼容档案单独落地

在 B2 完成后才接远端档案。第一版只允许替换既有 selector，不含远端 CSS。
可信本地模板用同一有效合同装配 CSS、renderer 与 Verify；命中和回退必须一致。
若改变已签名有效版本，下一次安全装配边界生效，不在操作途中替换规则。

服务端分发固定来源、已签名的有界数据；客户端验证签名、目标平台/上游版本、
最低客户端版本、有效期与版本递增。签名密钥、轮换、撤销和回退流程需可验证。
失效时整份丢弃并使用内置合同；异步获取不得阻塞启动。远端档案不能修复官方
关闭 CDP，也不能用未知版本的 selector 命中替代已验证兼容声明。

### F：退出用户运行时脚本

至少经过一个完整安装、升级、使用与恢复的 Release 周期，并在全部声明支持的
平台上完成验收，才能删除被替代的用户运行时脚本。删除前核对快捷方式、登录项、
协议入口、安装清单、调用者和恢复文档没有残留引用。构建与受控恢复工具按用途保留。

## 5. 操作、状态与恢复合同

- UI 请求包括协议版本、`requestId`、操作名和有限参数。相同请求重试返回同一
  `operationId`；新的用户意图使用新请求。写操作串行；读取状态不排在长导入后面。
- 操作状态为 `queued/running/succeeded/failed/cancelled`；阶段单独记录为
  `preflight/downloading/importing/launching/connecting/applying/verifying/recovering`。
  只走当前操作需要的阶段，导入不假装经过启动。
- `effect` 表达 `applied-live/selected-next-launch/imported/paused/restored/unknown`；
  `recovery` 表达 `not-needed/pending/verified/failed/unknown`。失败且恢复未确认
  进入需要处理状态，保留 journal，不删除诊断现场。
- 快照带会话身份、操作代次、当前主题、观测时间和兼容证据。旧操作晚到的事件
  不能覆盖新操作；UI 重连先取快照，再订阅后续事件。
- 取消是有结果的请求。在副作用前结束；副作用后先完成必要恢复，再返回取消
  结果和恢复状态。官方拒绝退出不等于授权强制退出。超时不等于成功或已恢复。
- 状态写入保留原子 staging 和现有 journal 顺序。按本操作所有权恢复所改配置键，
  保留用户并发修改；PID 必须连同启动时间、程序路径和受控身份一起校验。
- 共存期复用旧操作互斥或统一移交门，列出旧 reader 支持的 schema 范围。用旧版
  真实状态 fixture 验证升级/降级，不能只验证新 Controller 自写自读。
- 本地 IPC 限当前用户，使用结构化、有界消息。公开 `dreamskin://` 仍只携带版本 ID，
  由客户端确认并从固定 API 获取；网站失焦只能表示交接，不能表示已应用。

## 6. 社区功能扩展规则

| 功能类型 | 修改入口 | 必需证据 |
| --- | --- | --- |
| 主题效果/视觉兼容 | `runtime/` 与 selector 合同 | 双端生成资产、同主题首页/任务页、清理与性能 |
| 系统行为/新操作 | 平台 adapter 与操作合同 | 取消、并发、失败、恢复、真实结果 |
| 主题包/公开变量 | 两仓规范源与其消费者 | 同包跨语言 fixture、旧客户端与旧包兼容 |
| 可选扩展 | 明确生命周期的独立模块 | 开启/关闭、资源释放、错误隔离与有界工作 |
| 新平台 | 新 adapter、安装器、CI 和跨仓平台合同 | 安装/升级/恢复、发布产物、网站行为 |

共享生成资产不接受独立手改。PR 模板需列来源模块、平台、合同影响与实际验证；
使用现有操作和事件接口，不另起一套状态文件、常驻轮询或子进程编排。
新增后台功能定义启动/停止、取消、超时、订阅释放和停用后的零工作状态。

#369 的纯状态桥接可单独讨论，先拆出混入的生成资产/视觉修改；#370 涉及新平台
的跨仓协调，按独立计划推进。壁纸轮换、遮罩设置等在所依赖的操作和持久化合同
稳定后逐项接入，不必等待所有脚本删除，但不能阻塞阶段 A。

## 7. 效率与验收记录

当前工作主机同时承载本次 GPT 对话与其他项目。不得退出、重启、恢复、替换安装
或修改正在使用的 GPT / ChatGPT / Codex 客户端，也不得按通用进程名批量清理。
本机生命周期回归只运行临时 HOME、测试专用状态与已隔离系统命令的 fixture；
执行完整测试脚本前须核对所有启动、退出、launchd 和安装调用。需要真实客户端
的验收放在独立测试会话或专用主机，缺少证据就保持待验证，不在工作客户端上补跑。

改动前后使用同一脱敏 fixture / 应用版本记录：冷启动到可交互耗时、热应用耗时、
子进程数、无 Codex 时的发现请求次数、长时间空闲 CPU/内存，以及失败恢复耗时。
先记录基线，再为被修改的路径设定不退化标准，不编造未测量的数值。
新增 Controller 不引入每次点击启动一组脚本的路径；事件可订阅，读取与 UI 线程
不执行同步 ZIP、网络或进程等待。

每个 PR 运行适用的语法/类型检查、共享资产校验、portable regressions 与平台
回归。共享 runtime 改动必须跑双端 payload。写状态/启动/恢复改动添加在 journal、
配置、激活、验证边界的中断用例。平台编译与安装器检查交给对应 CI，真实桌面
交互由原生或 Playwriter 工具验证，证据标注真实客户端或受控 fixture。

## 8. 执行与上下文恢复

`TASK_PROGRESS.md` 顶部维护当前阶段、工作目录/分支、文件所有权、正在运行的
测试会话、已完成证据、阻塞与下一条可执行动作。每个实现、验证、交接、提交、
PR、CI 或发布检查点更新一次。保留旧记录，不把尚未验证的事项标为完成。
压缩或任务恢复后先读取该文件及本方案，从记录的下一步继续。

Git 状态逐项记录：本地修改、提交、推送、PR、合并、tag、构建、公开 Release、
网站部署相互独立。只有用户可下载且对应平台验收通过，才能将发布阶段关闭。

## 9. 脚本迁移清单

基线为 `64d1fd3` 加本次稳定性修改。这里只列两个 `scripts/` 目录的 38 个
Shell / PowerShell 文件，构建目录、测试、`.command` 与 SwiftBar 插件另外核对。
下表是职责和调用入口清单，不是删除许可。共享 helper 按函数职责逐步迁移，
不能将整个 `common` 或 `theme` 文件原样搬进一个新的大类。

### Windows：11 个 PowerShell 文件

路径均相对 `windows/scripts/`。阶段 C 迁移，阶段 F 核对删除条件。

| 文件 | 当前职责 / 主要调用入口 | 目标归属 |
| --- | --- | --- |
| `tray-dream-skin.ps1` | 托盘菜单、快捷方式；Setup bootstrap / 安装器启动 | 原生托盘，只保留 UI 与 Controller 客户端 |
| `start-dream-skin.ps1` | 托盘、快捷方式、社区应用调用；启动/CDP/注入/验证 | Controller 操作 + 平台启动 adapter |
| `restore-dream-skin.ps1` | 托盘和恢复快捷方式；停用、配置恢复 | Controller 恢复操作 + 独立 Recovery 入口 |
| `verify-dream-skin.ps1` | CLI 验证入口；调用 injector | Controller Verify，判定逻辑来自 B1 |
| `apply-community-theme.ps1` | `dreamskin://` 协议入口；下载/导入/应用/恢复 | Controller 社区操作，复用同一导入和应用服务 |
| `check-update.ps1` | 托盘调用；查询版本、显示结果 | 有界更新服务 + UI 结果展示 |
| `install-dream-skin.ps1` | bootstrap / CLI；引擎部署、配置、快捷方式 | 安装迁移 adapter，迁移前保留 |
| `common-windows.ps1` | 平台脚本共用；进程、CDP、锁、状态、引擎部署 | 按职责拆入 adapter / 操作状态 / 安装服务 |
| `theme-windows.ps1` | 托盘、社区、安装、启动共用；主题库/图片/导入/快照 | 主题服务与事务；继续使用共享 Node 校验 |
| `config-utf8.ps1` | common/theme 共用；UTF-8、TOML、原子写入和恢复 | 配置 adapter；保留并发修改和编码 fixture |
| `localization-windows.ps1` | 托盘与命令反馈共用 | 原生 UI 资源，稳定 messageKey 与错误码 |

额外删除检查入口：`windows/installer/setup-bootstrap.ps1`、
`windows/installer/build-release.ps1`、安装器项目、登录项和协议注册。
不能只修改托盘按钮而留下旧快捷方式继续并发写状态。

### macOS：27 个 Shell 文件

路径均相对 `macos/scripts/`。App 的实际调用与资源清单在
`macos/menubar-app/Sources/CodexDreamSkinMenuBar/AppDelegate.swift`。

| 文件 | 当前职责 / 主要调用入口 | 目标归属 |
| --- | --- | --- |
| `apply-from-menubar-macos.sh` | App / SwiftBar Apply；确认、热应用、冷启动回退 | D：Swift 操作编排 |
| `start-dream-skin-macos.sh` | App、CLI、切换/背景脚本；启动与精确验证 | D：启动 adapter + 应用操作 |
| `restore-dream-skin-macos.sh` | App / CLI 恢复 | D：恢复操作；保留独立 Recovery |
| `pause-dream-skin-macos.sh` | App / SwiftBar 暂停、等待 ACK | D：操作服务，保留真实 ACK 条件 |
| `verify-dream-skin-macos.sh` | CLI 调用 injector Verify | D：Verify adapter，复用 B1 |
| `status-dream-skin-macos.sh` | App / SwiftBar / 社区事务查询 | B4/D：旧状态 adapter，统一可信快照 |
| `apply-community-theme-macos.sh` | App 社区操作；快照、切换、恢复 | D：复用主题事务服务 |
| `import-theme-zip-macos.sh` | App / CLI；提取和保存，不自动激活 | D：导入服务，继续共用 Node 校验 |
| `extract-theme-zip-macos.sh` | 导入器调用；归档提取边界 | D：受限提取 adapter；安全 fixture 保留 |
| `recover-theme-imports-macos.sh` | App 启动时清理/恢复中断导入 | D：恢复服务，保留未确认快照 |
| `snapshot-active-theme-macos.sh` | 社区事务；快照与内容身份 | D：主题事务内部步骤 |
| `switch-theme-macos.sh` | App / SwiftBar / 社区事务；选择、应用和恢复 | D：统一 ApplyTheme |
| `load-image-theme-macos.sh` | App / SwiftBar 更换背景 | D：主题服务，保留当前主题配置与 CSS |
| `customize-theme-macos.sh` | CLI 自定义主题入口 | D：主题服务 + 兼容包装 |
| `theme-switch-lock-macos.sh` | switch/snapshot/community 共用操作锁 | B4/D：新旧共用互斥，迁移期间不得双锁并行 |
| `common-macos.sh` | 状态、身份、签名、launchd、配置等平台 helper | D：按职责拆入 Swift adapter / 操作服务 |
| `localization-macos.sh` | 多个脚本共用中英文反馈 | D：Swift UI 资源 + messageKey |
| `check-update-macos.sh` | App 优先执行包内版本；CLI | D：有界更新服务 |
| `doctor-macos.sh` | CLI 诊断入口 | D：诊断 adapter，保留只读 CLI |
| `install-dream-skin-macos.sh` | App / CLI 引擎部署与入口生成 | D/F：安装迁移服务，最后核对旧入口 |
| `install-menubar-macos.sh` | 旧 SwiftBar 安装与配置 | F：核对存量插件迁移后退出旧入口 |
| `build-menubar-app.sh` | 编译 App、装配引擎资产 | 保留构建用途，更新资源清单 |
| `build-dmg.sh` | CI 的 DMG 构建与静态检查 | 保留正式发布构建 |
| `build-release.sh` | 源码/独立分发 ZIP 构建 | 保留构建用途，确认与正式 Release 分工 |
| `build-client-release.sh` | 旧独立客户端 ZIP 与 `.command` 入口生成 | F：核对仍支持的分发渠道后决定退役 |
| `prepare-standalone-docs.sh` | 构建期独立文档与引用装配 | 保留构建用途 |
| `generate-app-icon.sh` | App 图标生成 | 保留构建用途 |

删除验收必须搜索 App 资源清单、双端安装清单、CLI/快捷方式、SwiftBar 插件、
测试和文档里的全部调用。以“旧入口已无调用者且恢复可用”为标准，不以脚本数量
下降为完成指标。
