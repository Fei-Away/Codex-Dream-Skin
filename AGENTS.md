# Codex Dream Skin Agent Guide

本文件适用于仓库根目录及全部子目录。平台目录中的 `SKILL.md` 提供运行时操作细节；与本文件冲突时，优先遵守更严格的安全和发布要求。

## 开始任务

- 先阅读根目录 README、**最新的 `docs/handoff-*.md`**、相关平台文档、当前分支状态和目标文件，不凭记忆推断现状。交接文档是了解当前状态最快的入口：`main` 上有哪些已合并但未发布的提交、哪些事卡在外部确认、以及本机做不了哪些验证。
- 中大型任务必须建立或更新根目录 `TASK_PROGRESS.md`。记录目标、范围、当前分支或 worktree、已完成项、进行中项、阻塞、测试结果、PR、合并及 Release 状态。
- 在每个里程碑、任务切换、出现阻塞、准备交接以及上下文可能压缩前更新 `TASK_PROGRESS.md`。内容必须可让新 Agent 直接续做，不只写“处理中”。
- `TASK_PROGRESS.md` 是本地连续性文件，不提交密钥、令牌、Webhook、个人路径中的隐私数据或未经确认的生产配置。
- `TASK_PROGRESS.md`、`.local-evidence/` 等任务流水与本机证据只保留本地，禁止提交；`main` 文件树不得包含 `TASK_PROGRESS.md`。已跟踪的进度文件须取消跟踪并保留本地副本。

## 优先级

1. P0：安全问题、数据损坏、不可恢复卸载、错误发布、公开密钥和供应链风险。
2. P1：用户无法安装、启动、恢复、导入或应用主题，以及发布版本与代码不一致。
3. P2：兼容性、性能、交互和可维护性改进。
4. P3：文档润色和非阻塞清理。

- 最新的明确用户指令可以调整当前优先级。插入高优任务时，先把被中断任务的精确状态写入 `TASK_PROGRESS.md`。
- 不把待定事项擅自升级为前置条件，也不把无关 Issue 或 PR 拉入当前范围。

## 多 Agent 协作

- 中大型且可独立拆分的任务默认并行分给多个 Agent；每个子任务必须有清晰边界、输入、允许的写入范围和验收条件。
- 主 Agent 负责计划、冲突协调、最终集成、回归测试和事实核对。子 Agent 的“完成”不能代替主 Agent 验收。
- 多个写入任务优先使用独立分支或 worktree。所有 Agent 共享文件系统，编辑前必须检查现有改动，禁止覆盖、回滚或顺手提交他人的工作。
- 同一文件由一个 Agent 负责写入；无法避免时先协调所有权。只读审计可以并行，但不能伪装成已经实现或验证。
- 页面或原生交互需要实机证据时使用项目指定的浏览器或原生测试工具；工具不可用必须明确记录缺口。

## 进度与事实表述

- 严格区分：本地实现、已测试、已提交、已推送、PR 已开、PR 已合并、tag 已创建、Release 已发布、用户已可下载。
- `merged != released`。只有 GitHub Release 已公开、目标版本资产存在且可下载，才能说“已发布”。
- 只有安装包实际包含目标代码并完成对应版本验证，才能说用户通过 Release 获得了功能。
- Issue 只有在修复、证据、回复和状态都核对后才能说“已处理”；受上游限制或证据不足时保持真实状态。

## 主题 ZIP 合同

- 客户端只导入普通 `.zip`，不支持 `.dreamskin`，也不接受仅修改扩展名的伪装文件。
- 新主题必须同时包含非空 `theme.json`、非空 `theme.css` 和 `theme.json` 引用的唯一背景图；三者缺一不可。
- 背景图最大 10 MiB，并继续执行像素、尺寸、媒体魔数和解码校验。前端、Studio、服务端和双端客户端的限制必须一致。
- 正式 Studio 包还必须校验 `manifest.json` 的平台、最低客户端版本、注册文件集合、字节数和 SHA-256。未知文件、重复路径、路径穿越、链接、reparse、嵌套归档、压缩炸弹和歧义根目录必须 fail closed。
- `theme.css` 在导入时和每次应用时都必须通过共享 Safe CSS 策略，只允许作用于登记的公开主题部件。不得为新导入包增加旧主题兼容旁路。
- 导入成功只写入“已保存主题”库，不自动切换活动主题，也不覆盖 last-known-good。用户必须在菜单中明确选择后才应用。
- 手动移动目录仅用于可信、已解压的完整三文件主题；不得把它描述为与受限 ZIP 导入器同等安全。

## 实现与测试

- 优先复用 `runtime/` 的共享源，通过现有同步工具生成双端资产；不要直接制造 macOS、Windows 漂移。
- 版本发布必须同步 `macos/VERSION`、`windows/VERSION`、`macos/package.json`、`macos/scripts/common-macos.sh`、`macos/scripts/injector.mjs` 和 `windows/scripts/injector.mjs`，并更新绑定当前版本的断言。
- 修改主题 schema、manifest、Safe CSS、导入或提取逻辑时，必须覆盖合法包、缺件、空文件、边界大小、哈希不符、路径攻击、链接、嵌套归档、压缩滥用、重复导入和 ID 冲突。
- 修改共享 renderer 或 CSS 时，运行同步校验和双端 payload 检查；不得只验证一个平台副本。
- macOS 相关改动至少运行适用的 Node、shell 语法和 Swift 测试；Windows 相关改动至少运行适用的 Node 与 PowerShell 测试。无法在本机执行的平台测试必须交给 CI 并明确说明。
- 发布前必须通过版本一致性、仓库 CI、DMG/Setup 构建与挂载或静态校验，并对原生文件选择器、ZIP 导入、已保存主题切换和真实 Codex 渲染做 smoke test。
- 不为追求绿色测试降低安全断言、跳过失败用例或把真实失败改成无条件 skip。

## Git 与发布

- 每次发布遵循 [`docs/releases/README.md`](docs/releases/README.md)：版本 PR 必须包含中文 `docs/releases/vX.Y.Z.md` 和完整英文 `docs/releases/vX.Y.Z-en.md`，顶部互链；以用户可感知的新增、修复和升级说明为先，附贡献者与完整变更链接；Release 展示中文正文，下载信息由工作流追加。

- 保留用户现有改动；禁止未经授权的 reset、checkout 丢弃、强推、移动已公开 tag 或覆盖已公开 Release。
- 功能开发、版本准备和紧急修复使用独立分支；提交只包含当前范围，推送前审查 staged diff。
- 客户端发布由 `main` 上的版本变化驱动。版本未变化的普通合并不得重复构建或覆盖 Release。
- Issue 修复的 PR 合并、CI 转绿后，同一轮工作里直接完成版本号提升（含六处版本一致）与 Release 触发，并在关闭 Issue 的评论中写清根因、修复提交与验证方式；不要把"已修复"停在合并这一步、让发布和关闭 Issue 变成另一次单独请求才做的事。
- 自动发布必须验证六处版本一致、版本递增、tag 与发布提交一致、目标 Release 尚未公开。失败后的 `workflow_dispatch` 只能幂等重试同一 tag 和提交。
- 构建资产必须来自 tag 对应提交。发布前核对 DMG、Setup.exe、`SHA256SUMS.txt` 的文件名、非空大小和摘要；发布后再次核对 Release 为公开状态且三个资产齐全。
- 发布失败时保留可诊断状态，不把不完整资产标记为成功，也不通过重用旧版本号规避更新检测。

## 安全边界

- 不提交 GitHub token、Cloudflare 凭据、飞书或邮件 Webhook、签名私钥、用户数据和本机状态文件。示例只能使用明确占位符。
- 使用最小 GitHub Actions 权限并固定第三方 Action 的完整 commit SHA。发布写权限只授予需要创建 tag 或 Release 的 job。
- 不修改官方 Codex/ChatGPT 的 `app.asar`、签名、系统 ACL 或受保护安装目录；不要求关闭 Gatekeeper、Defender、SmartScreen 或执行 `ExecutionPolicy Bypass`。
- 安装、升级和卸载必须保留原子 staging、备份与回滚，验证目标身份后才操作进程或路径。拒绝不可信符号链接和路径重定向。
- 对外部包、网络响应和状态文件使用有界读取、严格 schema、内容校验和 fail-closed 行为；日志和错误信息不得泄露凭据或私人路径内容。

## Windows 主题管理面板与默认启动

- 用户操作说明见 [`docs/windows-panel-startup.md`](docs/windows-panel-startup.md)。面板源码在 `windows/theme-manager/`，固定业务桥接入口为 `windows/scripts/panel-operation.ps1`。
- 主题与背景选择先创建草稿；“保存为启动设置”提交完整活动主题，“应用并启动”必须收到对应操作 ID 的严格启动与 renderer 验证结果才报告成功。仅保存不启动 Codex，已有 watcher 可能同步更新外观。
- 默认启动读取受管 `active-theme`，快捷方式不能写死主题或图片。面板创建/修复按钮写入桌面；Setup 安装还在安装目录及开始菜单生成入口。安装目录的 `.lnk` 可复制到同一用户的桌面，每台电脑安装时按实际用户路径生成，不提交本机 `.lnk`。
- 普通管理入口使用 bootstrap 的 `-LaunchTray -ShowWindow`；维护入口可以使用 `-Install -LaunchTray -ShowWindow`，提交引擎后打开面板；`-Uninstall` 与安装/打开面板保持互斥。
- 保留保存事务的 `.panel-pending-save.json` 与恢复备份。持 Operation 锁后先修复中断保存，再初始化存储；发现外部更新不能覆盖，磁盘恢复与可见恢复分别记录与展示。
- 面板提交期间禁用重复操作，跨入口保持既有 Operation 锁。父进程不得持锁等待需要同锁的启动子进程；不要仅凭主题名称相同跳过渲染验证。
- 操作日志由 `operation-log.ps1` 写入用户数据根的 `logs/`，面板与默认启动入口共用；保持有界读取、轮转、脱敏和 best-effort 行为，日志失败不得篡改已验证的产品结果。
- C# 面板变更后使用 `tools/build-theme-manager.mjs` 构建；PowerShell 脚本无需编译，但必须随完整 payload/engine 更新。不得直接把安装副本作为长期源码，也不得热替换运行引擎绕过正常退出与安装维护检查。
- 改动后运行相关 Core/Native、PowerShell 与 Node 检查；维护锁测试使用独立测试命名空间，保留实际获取/拒绝/释放逻辑，不能为了测试关闭用户正在使用的面板。源码构建、安装副本准备、引擎激活与真实主题渲染验证分别记录。
