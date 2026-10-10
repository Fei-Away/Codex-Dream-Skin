# Dream Skin Controller 迁移路线

> 状态：目标架构已完成审阅；当前先执行稳定性批次，Controller 尚未切换
>
> 记录日期：2026-09-05
>
> 适用范围：Codex Dream Skin macOS / Windows 客户端，与 DreamSkin.cc 的主题合同
>
> 执行顺序、验收门槛和贡献边界见 [实施方案](./controller-implementation-plan.md)。当前分支、证据和下一步见根目录 `TASK_PROGRESS.md`。

## 1. 结论先行

当前客户端的问题不是单纯的“PowerShell 文件太多”，而是**用户控制层没有一个统一的负责人**：菜单栏或托盘会启动多个 Shell/PowerShell 子流程，进程生命周期、主题状态、回滚、错误反馈和 Codex 兼容逻辑分散在不同文件中。

长期目标是：

```text
菜单栏 / 系统托盘
        |
        v
DreamSkin Controller
        |
        +-- 平台适配层：启动、进程、配置、CDP、回滚
        |
        +-- 共享 Runtime：renderer、Safe CSS、主题包校验
        |
        +-- 兼容档案：版本化 selector 数据，样式模板随客户端发布
```

用户入口最终只调用 Controller 的操作，不再由 UI 自己启动一串隐藏脚本。

这不是立即删除所有 `.ps1` / `.sh` 的任务。正确顺序是先建立新边界，再迁移入口，最后删除**用户运行时**脚本。构建、CI、安装迁移和故障恢复脚本是否保留，单独评估。

## 2. 当前事实与问题

评审基线为 `main@64d1fd36d08530a803e08728652ef27328bf26e1`（2026-09-05，公开 Release 为 `v1.5.16`）。当前 `windows/scripts` 有 11 个 PowerShell 文件，约 355 KB；macOS `scripts` 有 27 个 Shell 文件。文件数量本身不是缺陷，真正的问题是职责边界和跨进程契约不清晰。

### 2.1 控制层分散

- Windows 的托盘、启动、恢复、主题库、配置、更新和校验分别由多个 `.ps1` 负责。
- macOS 的菜单栏 App、Shell 启动器、`launchd`、恢复脚本和 AppleScript 共同编排一次操作。
- UI 启动隐藏子进程后，部分路径只能显示“已开始”，不能取得最终成功、失败或取消结果。
- 取消、超时、恢复失败和状态读取失败的语义没有统一模型。
- 同一个动作在 macOS 与 Windows 上的菜单、状态和错误文本不完全一致。

### 2.2 官方更新造成两类不同风险

官方 Codex 更新影响的是两个独立边界，不能用一个“大重写”混为一谈：

1. **启动 / CDP 边界**：官方可能改变参数传递、用户数据目录要求、进程关系或直接关闭调试端点。控制器可以改善发现、身份校验、回滚和诊断，但不能安全地制造官方已经移除的 CDP 能力。
2. **Renderer / DOM 边界**：官方可能更换 DOM 结构、CSS Modules hash、composer 结构或渐进渲染顺序。需要稳定选择器、版本化兼容档案和降级策略，而不是每次都复制修改两份注入器。

因此，“换成原生 exe”只能显著改善安装、编码、进程控制和维护成本，不能单独解决 DOM 漂移或官方关闭 CDP。

### 2.3 已有的好基础

共享 Runtime 已经部分建立：

- `runtime/renderer-inject.js` 是 renderer 的规范源；
- `runtime/dream-skin.css` 是 CSS 的规范源；
- `runtime/theme-package-validator.mjs`、`runtime/safe-css-validator.mjs` 和图片解析器是共享校验源；
- `tools/sync-runtime-assets.mjs` 生成 macOS / Windows 资产；
- `tools/selectors.json` 维护选择器合同；
- `docs/compat-profile-design.md` 已定义远端兼容档案的草案边界，但尚未实现。

后续不应再复制一套 renderer 逻辑，而应继续扩展这条共享 Runtime 路径。

## 3. 当前 PR / Issue 各自解决什么

这些项目不能都叫“新功能”。大部分是稳定性、兼容性或维护性修复：

| 项目 | 类型 | 解决的问题 | 当前判断 |
| --- | --- | --- | --- |
| #387 | 稳定性 / 工程 | watcher 在 CDP 消失后高频空转；选择器 provenance 不真实；Windows CI 没有可下载的 Setup 产物 | 已合入 `main`，尚未随新 Release 发出 |
| #390 | Windows 兼容 | Chromium 136+ 可能忽略默认数据目录上的 CDP 参数；为调试会话增加受管 `cdp-profile` | 已合入 `main`，首次可能需要登录一次，尚未随新 Release 发出 |
| #356 | CDP 安全 / 稳定 | 限制 `/json/list`、`/json/version` 的响应大小、根类型和字段边界，避免异常响应拖垮解析 | 已有绿色 CI，但基线较旧，需基于当前 `main` 重审 |
| #396 | 视觉兼容 | Codex 更新后 Home Composer 四角变直角 | 小范围候选，需 review 后合入 |
| #401 | 更新稳定性 | GitHub API 被共享出口限流时，更新检查仍能从固定 Releases URL 获取版本 | 小范围候选，需 review 后合入 |
| #398 | 用户信任 / bug | 用户取消官方退出确认后，Dream Skin 仍可能继续 `TERM/KILL` 并重启 Codex | 稳定性批次前置修复，不等待 Controller |
| #399 | 原生设置兼容 | 基础 CSS 强制覆盖用户在 Codex 中选择的界面字体 | 稳定性批次，与 #396 分别验证 |
| #391 | 交互结构 | Windows 托盘一级菜单过于扁平，和 macOS 信息架构不一致 | 应在 Controller 结果反馈之后处理 |
| #237 | 长期架构 | 用原生控制器替代 Windows 用户运行时 PowerShell 控制层 | 接受方向，但应拆成多个可回滚阶段，不做一次性大 PR |

明确暂不纳入 Controller 第一批的项目：壁纸库/轮换、用户侧遮罩滑块、宠物状态桥接、Linux 大范围支持和旧冲突 PR。这些不是当前稳定性与维护性问题的最短路径。

## 4. 目标职责边界

### 4.1 Controller 负责什么

Controller 是每个平台的长期用户运行时入口，负责：

- 单实例锁和操作队列；
- `start`、`reapply`、`apply-theme`、`import-theme`、`pause`、`restore`、`verify`、`status`；
- 官方 Codex 的发现、启动和退出确认；
- 进程身份、CDP 端点、Browser ID 和 renderer readiness 校验；
- 原子配置写入、事务状态、回滚和恢复；
- 启动 Node injector，并记录它的受控身份；
- 向菜单栏 / 托盘持续发送结构化进度和最终结果；
- 脱敏日志、诊断导出和错误分类。

Controller 不负责：

- 修改官方 `.app`、`app.asar`、WindowsApps 或代码签名；
- 修改 API Key、Base URL 或模型供应商设置；
- 把远端内容当作脚本、命令或任意路径执行；
- 将 renderer 的平台差异重新复制到两份业务逻辑中。

### 4.2 平台实现方式

- **Windows**：一个签名的原生 Controller（使用实现时的受支持 .NET LTS），直接调用 AppX、进程、文件、命名管道和通知 API。
- **macOS**：现有 Swift 菜单栏 App 逐步接管操作编排，Shell 仅保留为迁移、安装和必要的兼容包装层。
- **共享部分**：主题包 schema、Safe CSS、renderer、选择器合同、操作事件 envelope、状态 schema 和跨平台 fixture。

不强求 macOS / Windows 共用一个二进制。两个系统的菜单、签名、应用激活和进程 API 不同；应共用**协议和测试**，而不是强行共用所有平台代码。

## 5. Controller 操作契约

UI 只提交操作请求，Controller 拥有整个生命周期。每个操作都必须有稳定的 `operationId` 和终态：

```json
{
  "schema": "dreamskin-operation/1",
  "operationId": "op_20260905_0001",
  "operation": "apply-theme",
  "phase": "verifying",
  "state": "running",
  "themeId": "preset-gothic-void-crusade",
  "messageKey": "verifyRenderer",
  "errorCode": null,
  "updatedAt": "2026-09-05T00:00:00Z"
}
```

操作状态与执行阶段分别记录，不把所有操作强行排成同一条流程：

```text
state: queued -> running -> succeeded / failed / cancelled
phase: preflight, downloading, importing, launching, connecting,
       applying, verifying, recovering
```

例如导入只经过下载（如需要）和导入；重启后应用经过启动、连接、应用与验证。
副作用后的取消先完成必要恢复，再报告取消结果与恢复状态。精确定义见
[实施方案第 5 节](./controller-implementation-plan.md#5-操作状态与恢复合同)。

用户可见状态必须区分：

- `applied-live`：已验证当前 renderer 生效；
- `selected-next-launch`：只写入下次启动使用的主题；
- `paused`：明确暂停；
- `status-unavailable`：无法取得可信实时状态；
- `needs-attention`：需要用户 Verify、Repair 或 Restore。

错误信息分为稳定错误码和可选诊断详情，例如：

```text
codex-not-found
cdp-endpoint-unavailable
renderer-not-ready
user-cancelled
restore-unverified
operation-busy
compatibility-unknown
```

原始异常、完整路径和技术细节只进入脱敏日志或“复制诊断”，不直接塞进普通提示框。

Windows 可使用用户级 named pipe，macOS 可使用 XPC 或 Unix socket；传输方式可以不同，但事件 envelope 和状态语义必须相同。

## 6. 官方更新兼容策略

### 6.1 L0 / L1 / L2 降级

把注入能力分成三个等级：

- **L0**：背景、CSS 变量、基础可读性层。尽量不依赖业务 DOM。
- **L1**：`role`、`data-testid`、稳定语义属性和壳层锚点。预设必须保证 L0 + L1。
- **L2**：CSS Modules 前缀、精细 utility bar、局部间距和装饰细节。找到就增强，找不到就静默降级。

未知 Codex 版本不应被报告为“已成功”。正确行为是保留安全的 L0/L1（如果能验证），并显示“兼容性待验证”或“需要检查”。L2 缺失不应让整套主题失效。

### 6.2 兼容档案

兼容档案是**数据，不是代码**：

- 由固定官方 API 分发，带签名、版本、过期时间和最低客户端版本；
- 第一版只允许覆盖内置合同中已有 selector 的字符串，不带远端 CSS；
- 必须先建立统一 payload 装配点，使 CSS、renderer 和 Verify 同时使用同一有效 selector revision，并一起回退；构建时已编译的资产不能仅靠替换 `selectors.json` 更新；
- 不允许新增命令、脚本、URL、文件路径或任意执行逻辑；
- 完整校验失败时整份丢弃，回退到内置合同；
- 启动时异步获取，不能阻塞换肤；
- 远端档案只能缓解 DOM/选择器变化，不能修复官方关闭 CDP 或改变 AppX 启动协议。

`tools/selectors.json` 仍是源码中的唯一可编辑选择器来源。每次选择器变化都要同步 provenance、fixture 和 doctor 结果。

### 6.3 每个官方版本的发布门槛

适配新版本时按固定顺序：

1. 读取官方版本和平台来源；
2. 运行 selector doctor，逐项输出 L0/L1/L2 命中；
3. 验证 CDP 端点和进程归属；
4. 记录脱敏 DOM fixture / readiness 证据；
5. 只有必要的选择器或 adapter 变化才进入代码；
6. 未知版本保持明确降级，不假装像素级兼容。

## 7. 分阶段迁移计划

阶段编号和验收以 [实施方案](./controller-implementation-plan.md) 为唯一执行来源；
本节保留路线摘要，避免两份文档维护不同的迁移顺序。

| 阶段 | 交付内容 | 用户入口切换条件 |
| --- | --- | --- |
| A | 稳定性批次：#398、#399、#396、#401、#356 审阅，以及 #387/#390 发布证据 | 保持既有入口，先修复现有行为 |
| B | 共享 readiness、payload、跨仓合同和操作协议 | 纯逻辑提取与兼容 adapter 验收通过，不切原生入口 |
| C | Windows Controller，读取/诊断先行，再逐项迁移写操作和安装注册 | 新旧互斥、状态兼容、取消与恢复已验证 |
| D | macOS Swift 接管操作编排 | 复用相同操作语义，保留 A 的取消回归 |
| E | selectors-only 签名兼容档案 | B2 统一 CSS/renderer/Verify 装配完成，整体校验与回退通过 |
| F | 删除被替代的用户运行时脚本 | 至少一个完整 Release 周期、全部支持平台验收、独立恢复路径可用 |

阶段 C/D 的每个写操作只有在尚未产生副作用，或恢复已验证后，才允许移交旧
执行器；不能在新执行器写到一半时启动另一条路径。真实启动/退出/恢复验收在
专用测试环境完成，不得退出或修改承载当前工作对话的客户端。

## 8. 明确不走的路线

- 不直接删除所有 `.ps1` / `.sh`，避免失去恢复路径；
- 不把 Controller 重写、renderer 重写、兼容档案、主题 schema 和菜单重构塞进一个 PR；
- 不修改官方 `app.asar`、`.app`、WindowsApps 或签名；
- 不用透明 overlay 取代原生 Codex 控件作为主线；
- 不把远端兼容档案设计成可执行脚本或任意 CSS 注入通道；
- 不承诺原生 Controller 能解决上游完全关闭 CDP 的问题；
- 不为了“适配所有版本”而悄悄降低身份校验、回滚校验或安全 CSS 边界。

## 9. 完成标准

这项架构迁移完成的标志不是“仓库里没有 PowerShell 文件”，而是：

1. 用户只面对一个稳定的 Controller 入口；
2. 每个操作都有可追踪的开始、进度、成功、失败或取消；
3. 状态、日志和错误码在 macOS / Windows 语义一致；
4. renderer 逻辑只有一份共享规范源，平台差异位于薄 adapter；
5. Codex DOM 变化先由 doctor / compat profile 识别，L2 失败不会拖垮 L0/L1；
6. 官方更新、失败启动和恢复都能回滚到可验证状态；
7. PowerShell / Shell 只剩安装、构建、迁移和受控恢复等有明确理由的用途。

在此之前，最有价值的第一批不是“删脚本”，而是建立 Controller 合同并处理 #398、Apply/Restore 最终结果和状态可信度问题。
