# Codex Dream Skin 外部主题包技术蓝图

> 本文把 `BUSINESS.md` 翻译为目标技术边界。当前代码仍只有单图导入和内部主题切换；本文不表示外部包导入已经实现。

## 1. 技术目标与边界

- 系统需要承接的核心业务能力：生成、验证、导入、安装和应用一个版本化、离线、零代码的 `.dreamskin` 主题包。
- 本系统负责：主题包契约；作者校验/打包；不可信 ZIP 的受控读取；共享字段/资源校验；跨平台规范化；本地主题库事务；平台入口；测试与错误码。
- 本系统不负责：调用外部 AI、联网下载、作者身份认证、在线市场、任意 CSS/JS 插件、素材权利自动判定或官方 Codex 内部 API。
- 当前现状与目标差异：

| 当前事实 | 目标状态 |
| --- | --- |
| macOS 可导入单图并把仓库 preset 播种到 `themes/<id>` | 可从本地 `.dreamskin` 安装任意合格外部主题 |
| Windows 可更换背景、保存/切换 active/saved theme | 可从同一种 `.dreamskin` 安装并保留来源/版本信息 |
| macOS staging 只要求 `schemaVersion: 1` 与根目录图片；Windows `Read-DreamSkinTheme` 未统一要求 schema 版本 | 由共享包契约统一验证，再编译为平台运行时主题 |
| 两端运行时主题字段与颜色命名不完全相同 | 便携主题模型明确公共字段、能力差异和平台编译结果 |
| 没有外部包身份、版本、哈希或导入错误码 | `packageId + packageVersion + contentHash` 可追踪、可幂等、可更新 |

## 2. 技术栈与选择理由

| 层面 | 选择 | 选择理由 | 能力依据 | 关键限制 |
| --- | --- | --- | --- | --- |
| 作者工具 | Node.js ESM CLI + 普通主题源目录 | 仓库与两端注入器已使用 Node；适合提供 `validate/pack/inspect` | `tools/theme-package.mjs`、Node 22 契约测试 | 作者 `inspect` 在 32 MiB 包上有界整包读取，不能直接充当平台流式 importer |
| 包容器 | `.dreamskin`，ZIP v1，Store/Deflate | 单文件便于 AI Agent 和作者交付；普通工具可检查 | 仓库内纯 Node 中央目录解析/确定性写入与恶意夹具 | 禁止直接整包解压；加密、多卷、ZIP64、额外字段和未知算法拒绝 |
| 共享验证核心 | Node.js ESM + checked-in JSON Schema + 契约夹具 | 统一字段、错误码、哈希与平台能力报告 | 现有 bundled Node 与平台 CI | 运行时 validator 和公开 Schema 必须由同一夹具验证，防止漂移 |
| macOS 入口 | Shell/Apple 系统文件选择 + SwiftBar 菜单 + bundled Node | 复用现有菜单和脚本安全 helper | `macos/menubar/`、`common-macos.sh` | 图形预览需要最小原型验证 |
| Windows 入口 | PowerShell/Windows Forms 托盘 + bundled/managed Node | 复用现有托盘、主题仓库和原子 UTF-8 helper | `tray-dream-skin.ps1`、`theme-windows.ps1` | Windows PowerShell 5.1 与 PowerShell 7 都必须通过 |
| 状态存储 | 现有平台主题库 + 每主题来源记录 | 不引入数据库；保持安装后离线、自包含 | macOS `themes/`；Windows `themes/`/`active-theme` | 不复用外部包路径；安装后不依赖源文件 |
| 最终验证 | 现有 injector `--check-payload` + 图片元数据检查 | 最接近真实渲染输入，可阻断平台编译错误 | 两端现有注入器与测试 | 上游需包含 PR #123 或等价字符串加固 |

本功能不依赖 Kimi 或其他外部服务，因此不创建 `CAPABILITIES.md`。首模块的能力 Spike 已选择仓库内纯 Node ZIP 路线：作者工具不调用系统 `zip/unzip`，也不引入第三方包；路径、重复、加密、链接、CRC 和尺寸门禁由恶意夹具验证。平台 importer 的文件句柄与流式中止仍属于模块二实现门禁。

## 3. 系统组成与关系

| 组成部分 | 职责 | 输入 | 输出 | 依赖 |
| --- | --- | --- | --- | --- |
| 作者套件 | 说明格式，校验源目录，生成确定性包 | 主题源目录 | `.dreamskin`、校验报告 | Schema、打包适配器 |
| 平台导入入口 | 选文件、显示报告、取得确认、展示结果 | 本地路径、用户决定 | 导入请求、确认结果 | macOS Shell/SwiftBar；Windows PowerShell/WinForms |
| 归档适配器 | 枚举条目并按名字流式读取，绝不采用归档提供的落盘路径 | `.dreamskin` 文件描述符 | 有界条目流与元数据 | macOS/Windows 各自受验证实现 |
| 主题包核心 | 容器规则、Schema、哈希、兼容性、规范化和错误码 | 条目流、当前平台/版本 | 导入报告、规范化平台主题、安装计划 | JSON Schema、图片元数据、SHA-256 |
| 隔离暂存区 | 保存系统命名的短生命周期候选文件 | 已通过条目级门禁的字节 | 完整候选快照 | 平台状态根目录、严格权限 |
| 主题库适配器 | 幂等判断、冲突、备份、原子安装与恢复 | 安装计划、用户决定 | 已安装主题与来源记录 | 现有平台主题路径 helper |
| 现有切换/注入器 | 再次验证规范化主题并选择性应用 | 已安装主题目录 | active theme、payload、应用结果 | loopback CDP、官方 Codex |

[查看经过渲染与验证的目标架构](./diagrams/theme-package-import-architecture.html)

## 4. 核心业务的技术承接

### 场景一：作者校验与打包

- 入口或触发：`theme-package.mjs validate <source-dir>` 与 `theme-package.mjs pack <source-dir> --output <file.dreamskin>`。
- 主要处理过程：稳定读取 manifest/theme/资源；按公开 Schema 与资源限制验证；计算 SHA-256；生成规范化清单；使用确定顺序和固定元数据写 ZIP。
- 数据读取与写入：只读源目录；通过随机临时文件写完整输出；校验成功后用同目录排他硬链接原子发布，目标若已存在则失败，避免 check-then-rename 覆盖竞态。
- 外部依赖：无网络、无第三方运行时；纯 Node ZIP 写入使用固定条目顺序、时间和权限元数据，并由 golden package 逐字节复现测试覆盖。
- 成功结果：同一输入在同一格式版本下产生相同内容哈希与可导入包。
- 失败处理与用户反馈：输出稳定错误码、JSON 路径或资源路径；删除临时输出，不留下半包。

### 场景二：受控读取与完整验证

- 入口或触发：平台入口把用户选择的本地路径传给导入编排器。
- 主要处理过程：
  1. 以 no-follow/防 reparse 方式打开源文件并固定文件身份。
  2. 枚举 ZIP 中央目录；在读取内容前拒绝重复、未知、加密、多卷、链接、路径穿越、控制字符、未知压缩算法、条目/总量超限。
  3. 只读取白名单条目；把每个条目流式写入系统自己生成的暂存文件名，并在流中执行字节上限与 SHA-256。
  4. 严格 UTF-8 解码 manifest/theme；按 `formatVersion`、平台、最低版本、Schema 与资源哈希验证。
  5. 把便携主题编译为 macOS/Windows 现有运行时形状；调用目标平台 injector `--check-payload` 验证最终主题与图片。
  6. 生成不含用户绝对路径的导入报告。
- 数据读取与写入：校验完成前只写隔离暂存区；不写主题库、active store 或 Codex 配置。
- 外部依赖：无网络、无 AI；复用图片元数据解析器与平台 injector。
- 成功结果：得到不可变候选快照、内容哈希、规范化平台主题和可展示报告。
- 失败处理与用户反馈：关闭流、删除暂存、返回稳定错误码；任何包内禁用文件都会拒绝整个包。

### 场景三：冲突、安装与回滚

- 入口或触发：用户确认导入报告，并在同 ID 冲突时选择替换或取消。
- 主要处理过程：
  1. 以 `packageId` 定位目标主题目录；用 `packageVersion + contentHash` 判断幂等。
  2. 把规范化主题、背景、可选预览和 `import.json` 来源记录写入同一状态根下的随机 staging 目录。
  3. 新装：staging 原子重命名为最终目录。
  4. 替换：旧目录原子重命名为 backup；staging 原子重命名为最终目录；成功后删除 backup。
  5. 任一步失败：若旧目录已移走则恢复；清理 staging；返回“旧主题已保留”。
- 数据读取与写入：所有事务目录必须位于同一文件系统和受管主题根，拒绝符号链接/reparse 与跨根路径。
- 成功结果：主题库中只存在完整旧版本或完整新版本，不出现混合文件。
- 失败处理与用户反馈：补偿完成后报告安装失败；恢复也失败时保留 backup 并给出可定位的恢复指令，不能静默删除最后可用副本。

[查看经过渲染与验证的安装/回滚时序](./diagrams/theme-package-install-sequence.html)

### 场景四：应用已安装主题

- 入口或触发：确认页勾选立即应用，或用户稍后从已保存主题选择。
- 主要处理过程：复用现有 `switch-theme-macos.sh` / `Use-DreamSkinSavedTheme` 路径；在发布 active theme 前验证规范化 pair；尝试热应用或启动链路。
- 数据读取与写入：只从受管主题库读取，不再依赖原 `.dreamskin`。
- 成功结果：active store 与 Codex 视觉使用新主题。
- 失败处理与用户反馈：主题安装结果保留；若 active store 已安全提交但 CDP 暂不可用，报告“已安装，待应用”，下次启动可重试。

## 5. 数据与状态原则

### v1 包结构

```text
theme-name.dreamskin  # ZIP v1
├── manifest.json
├── theme.json
├── assets/
│   ├── background.(png|jpg|jpeg|webp)
│   └── preview.(png|jpg|jpeg|webp)  # 可选
├── LICENSE.txt                         # 可选
└── NOTICE.txt                          # 可选
```

- `manifest.json` 是包身份与兼容性权威：`formatVersion`、`packageId`、`packageVersion`、显示名、作者、目标平台、最低 Dream Skin 版本、资源路径/类型/大小/SHA-256。
- `theme.json` 是便携声明式主题权威：主题名称、背景引用、appearance、art、受控 palette 与受控文案字段；精确字段由后续 `docs/THEME_PACKAGE.md` 和 JSON Schema 固化。
- `import.json` 只在安装后生成，记录原包身份、内容哈希、安装时间和编译器版本；外部包不能自行提供或覆盖它。
- 平台运行时 `theme.json` 是便携主题编译结果，不是直接信任复制。macOS `colors`、Windows `palette` 等差异由显式编译器承接。
- 当前主题与已安装主题继续以平台现有目录为权威；原 `.dreamskin` 可以删除，不影响已安装主题。

### 一致性与幂等

- 包内容哈希覆盖规范化 manifest/theme 与所有声明资源，不依赖 ZIP 时间戳或条目顺序。
- 相同 `packageId + packageVersion + contentHash` 直接返回已安装。
- 相同 `packageId` 但其他标识不同进入人工冲突，不自动按版本号升级或降级。
- 安装事务只使用同一状态根内的 staging/backup/final 目录，确保原子 rename 可用。
- 导入日志不得记录完整用户路径；可记录包 ID、版本、短哈希、错误码和平台。

## 6. 横切技术规则

### 身份与权限

- 外部包永远是不可信数据，不是插件、脚本或权限主体。
- 包内文件名不能直接成为最终系统路径；manifest 中资源路径也必须通过白名单与规范化。
- 主题导入不读取 `~/.codex/auth.json`、API Key、Base URL 或 Codex 对话内容。

### 错误处理与补偿

- 错误码按阶段分组：`CONTAINER_*`、`MANIFEST_*`、`THEME_*`、`ASSET_*`、`COMPAT_*`、`CONFLICT_*`、`INSTALL_*`、`APPLY_*`。
- 每个失败返回：稳定 code、简短用户文案、可选 field/entry、是否产生持久变更、可恢复建议。
- 同类失败测试必须证明主题库/active store 字节不变，或明确证明备份已恢复。

### 日志、性能与离线

- 包读取必须流式限额，不能先把未知解压大小的资源整体读入内存。
- import/pack 默认不联网；CI 夹具也不能依赖网络资源。
- 临时文件使用随机名、独占创建和严格权限；成功或失败都清理，保留恢复 backup 的异常除外。

### 契约防漂移

- 公开 JSON Schema、运行时 validator、作者工具和两端 importer 必须共享同一组 golden valid/invalid fixtures。
- “两端都能导入”不等于“两端渲染所有字段”；能力矩阵必须明确 `supported / ignored-with-warning / rejected`，禁止静默丢弃声明的重要能力。
- CI 至少覆盖 Node 22、macOS 完整测试与 Windows PowerShell 5.1/7；平台环境缺失时不能用 fallback 当通过证据。

## 7. 能力证据、图纸覆盖、风险与待确认事项

- 会改变架构或路线的外部能力：无 AI/API 或第三方归档依赖；平台 importer 的流式文件读取只依赖 Node 文件句柄与 `zlib`，不依赖系统工具输出文本。
- 证据位置：`lib/theme-package/zip.mjs`、`tests/theme-package-cli.test.mjs`、`tests/theme-package-contract.test.mjs` 与 checked-in golden package；若以后引入第三方归档库，再新增 `CAPABILITIES.md` 记录版本、许可证、供应链和打包边界。
- 当前目标环境验证状态：作者 `validate/pack/inspect`、图片限制、确定性 Store 包、Store/Deflate 读取门禁和 payload 加固已实现；平台流式 importer 与主题库事务尚未实现。
- 理论支持与当前项目可用性的差异：系统存在 ZIP 工具或 .NET API 不等于满足本项目的条目唯一性、链接、限额、路径和流式中止不变量。

| 视图 | 是否需要 | 触发原因 | 对应章节或文件 |
| --- | --- | --- | --- |
| 系统架构图 | 是 | 外部输入、平台入口、共享验证、受管状态和官方应用有多个安全边界 | `diagrams/theme-package-import-architecture.html` |
| 关键链路时序图 | 是 | 同 ID 替换具有原子提交和失败补偿 | `diagrams/theme-package-install-sequence.html` |

| 问题 | 当前判断 | 影响 | 如何确认 |
| --- | --- | --- | --- |
| 平台 ZIP importer | 路线已决，实现待模块二 | 使用共享纯 Node 中央目录规则，并把条目读取改为文件句柄 + 有界流 | 对 Store/Deflate、恶意 ZIP、读取中变化、限额和流式中止运行共享夹具 |
| 便携字段与平台映射 | 首模块固化 | 决定 Kimi 能设计到什么程度以及两端差异 | 建立 `THEME_PACKAGE.md`、Schema、能力矩阵和 golden compiler fixtures |
| PR #123 依赖 | 必须合入或等价带入 | 外部自由文本可能破坏 payload | 以 `$&`、`$'`、`$$`、反引号美元序列和占位符形文本跑两端 CLI 回归 |
| macOS 预览交互 | 不阻塞契约，但阻塞最终 UX | 决定菜单入口是否需要辅助窗口/系统预览 | 做不写主题库的本地原型并由用户确认 |

## 8. 实施准备摘要

- 当前判断：完成关键事项后进入完整实施。
- 已解除的首模块阻塞：v1 字段/能力契约、纯 Node ZIP 路线与 PR #123 等价加固已进入本功能分支。
- 继续进入完整导入前的技术门禁：实现文件句柄 + 有界条目流、平台编译器、主题库事务和故障注入。
- 关键外部能力与目标环境状态：部分验证；本地主题存储与 payload 门禁已确认，外部包容器尚未验证。
- 建议首个项目级模块：主题包契约与作者套件，包括能力 Spike、Schema、示例、校验器和 Kimi 提示词。
- 蓝图候选建议：见 `RECOMMENDATIONS.md`。
- 正式总体 Plan：[`../PLAN.md`](../PLAN.md)。
