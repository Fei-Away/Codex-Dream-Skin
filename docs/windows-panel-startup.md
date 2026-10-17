# Windows 主题面板与默认启动

本功能在原生 WinForms 面板中增加主题与背景草稿、界面效果示意、保存启动组合、专用启动入口及操作日志。面板与默认启动图标使用相同的活动主题配置；快捷方式不固定某一张图片。

本文也是该功能的实现索引，解释改动的目的和维护位置。文末的验收记录区分自动化、用户实测与待验证项，不代表所有安装方式或渲染场景均已通过。

## 相对原面板新增什么

| 改动 | 原因 | 用户看到的效果 |
| --- | --- | --- |
| 主题和背景草稿、保存启动组合 | 允许先试选，再明确提交完整组合 | 选中列表或图片不会直接覆盖启动设置 |
| 界面效果示意 | 单独展示壁纸难以判断文字与面板的对比度 | 在背景上绘制侧栏、消息卡片、输入框，示意主题配色和透明度 |
| 应用／重新应用并启动 | 保存和实际启动是不同操作 | 继续使用现有启动与渲染验证，成功与失败分别报告 |
| 按钮创建两份默认启动快捷方式 | 提供易找到、可修复的专用启动入口 | 桌面和安装目录各一份；日后更换组合不必重新创建 |
| 保存中断恢复和操作记录 | 避免中断留下混合配置，并帮助定位失败 | 配置恢复与可见外观验证分开显示；日志不影响操作结果 |
| 刷新后的草稿归属 | 删除或替换主题后，自动改选不应继承旧主题的背景草稿 | 同一主题刷新保留草稿；选中身份改变时清理草稿，无主题时清理预览 |
| 默认内容区宽度 980 → 940 像素 | 减少面板占用，保留编辑和操作空间 | 高度仍为 740，最小窗口仍为 640 × 560；内容放不下时纵向滚动，避免预览与按钮重叠 |

原面板已有的当前主题、主题列表、透明度、跟随主题及回收站操作继续保留。透明度区调整位置并明确其即时保存行为；“移到回收站”针对选中的非活动已保存主题，不是移除预览图片。

## 界面效果示意的边界

示意预览读取所选主题的颜色、appearance、背景构图焦点及适用的透明度设置，用原生绘图绘制固定布局。`auto` 明暗按 Windows 应用明暗偏好示意；主题色缺失或无法用于示意时使用受控的默认值。透明度优先读取所选主题自己的本机覆盖（若有），否则使用作者值或默认值；底部滑块仍仅修改当前活动主题，不把当前主题的覆盖套到所有草稿主题。

预览只读本地主题和图片，不启动 Codex、不连接 CDP、不截图、不保存草稿，也不执行 `theme.css` 或 Safe CSS。固定侧栏、消息卡片、输入框仅帮助比较构图、颜色和可读性，不代表 Codex 的真实布局、模糊、字体或自定义 CSS 能逐项还原。预览应明确标为“效果示意”；最终结果仍以实际应用后的 Codex 为准。

PNG/JPEG 可以预览；系统未安装 WebP 解码支持时显示说明，保存时仍走完整图片校验。预览文件读取沿用大小、尺寸及路径检查，不能代替后端主题校验。

## 使用

1. 打开桌面或开始菜单中的 **Codex Dream Skin** 管理入口，或双击托盘图标，在“主题与启动”页选择主题及背景图片。列表或文件选择只创建草稿，尚不改变已保存设置。
2. 点击 **保存为启动设置**，保存完整主题及受管图片副本。该操作不启动 Codex；如果皮肤已经运行，保存可能同步更新当前外观。
3. 点击 **应用 / 重新应用并启动 Codex**，按需要处理重启确认。只有启动与渲染验证通过，面板才报告已应用；取消不会提交草稿。
4. 点击 **创建 / 修复默认启动快捷方式**，同时在桌面和安装目录创建 **Codex Dream Skin - Launch** 两份快捷方式。下次双击任意一份即可使用保存的主题与背景；需要重启 Codex 时会先请求确认。创建快捷方式既不保存草稿，也不启动 Codex。

同一个启动图标每次读取最近明确保存或应用的完整活动主题组合。之后更换主题或背景并保存，无需重新生成快捷方式。它不会替换官方 Codex 图标，也不表示开启 Windows 登录自动启动。

面板保留中英文按钮与提示；新生成的默认启动快捷方式统一使用英文文件名 **Codex Dream Skin - Launch.lnk**。旧版的 **Codex · 默认主题启动.lnk** 会在创建或修复入口时核对归属后迁移；陌生同名图标会保留，不会仅凭名称覆盖或删除。

两份快捷方式指向当前用户受管引擎中的同一个启动脚本。Setup 用户使用已注册并验证的实际安装目录；没有有效 Setup 安装的源码用户，目录副本位于 `%LOCALAPPDATA%\CodexDreamSkin`，与 `engine` 同级，避免升级替换引擎时丢失图标。已删除的历史 Setup 目录不会重新创建。任意一份被删除后，均可通过面板重新创建。创建前检查两处目标；任一处被陌生同名文件占用或无法写入时，整次操作失败，保留原入口。写入过程中失败则报告结果并尝试撤销本次修改，未完成的恢复保留备份。

原有的管理、托盘、恢复和可选 Windows 登录启动入口保持各自安装方式的原有行为。安装、升级、源码构建、Setup、登录 Windows 或普通启动均不会自动新增 Launch 快捷方式；只有面板按钮创建或修复这两份入口，不在开始菜单新增 Launch。每台电脑按实际用户路径创建，不将开发者电脑的 `.lnk` 作为通用源码文件分发。

若安装目录本身位于 Windows 开始菜单或登录启动文件夹内，将拒绝生成新的 Launch，避免把普通启动图标变成菜单项或登录自启动项。

透明度区明确标注“当前活动主题”，沿用即时保存行为；它修改当前主题的本机透明度覆盖，不是尚未提交的草稿。已保存主题库不会因替换活动背景而被覆盖。

## 失败、恢复与重复请求

保存使用校验完整草稿后交换活动目录的事务；应用使用现有启动选择快照与验证流程。失败信息分别显示“配置恢复”和“可见外观恢复”；可见外观没有通过验证时，不宣称已经恢复，并保留相关恢复备份。

保存前写入持久事务记录。若进程中断，下次保存、启动或安装会在初始化前尝试恢复完整旧配置；发现外部的新修改时停止恢复并保留证据。不会因活动目录暂时缺失就重新生成默认主题。

应用期间禁用重复提交，跨入口通过操作锁避免重叠事务。重新应用操作保留；不会仅凭主题名称相同就跳过渲染验证。正常页面导航的重新注入继续由现有 watcher 处理。

## 日志

“日志”页支持查看、筛选、展开详情、复制脱敏记录及导出诊断。面板操作和默认启动流程可记录；无需保持面板打开。本次不扩展无关托盘编辑操作的日志行为。底层 injector 和 verify 日志也可从该页打开。

“打开日志目录”指向 `%LOCALAPPDATA%\CodexDreamSkin\logs`。结构化操作日志最多保留五个约 5 MiB 文件；面板读取最近的有界尾部。日志故障不改变已经验证的应用结果。用户取消与缺少验证结果是不同状态。

日志是诊断记录；`.panel-pending-save.json` 是持久恢复记录，操作结果文件用于核对请求与验证结果。后两者不属于可以随日志页一起删掉的日志功能。

## 源码与维护索引

以下路径相对仓库根目录。新增绘图和预览数据与进程调用分开，便于修改示意样式时不触碰实际启动流程。

| 职责 | 源码位置 | 修改时关注 |
| --- | --- | --- |
| 面板布局、草稿选择、按钮状态、双语文案 | [`windows/theme-manager/App/Program.cs`](../windows/theme-manager/App/Program.cs) | 默认／最小尺寸、英文长度、缩放、操作中禁用冲突控件 |
| 原生示意绘制、图片解码和缩放 | [`windows/theme-manager/App/ThemePreview.cs`](../windows/theme-manager/App/ThemePreview.cs) | 固定布局与真实渲染的边界、资源释放、WebP 无解码器提示 |
| 预览配色、明暗、焦点及透明度模型 | [`windows/theme-manager/Core/ThemePreviewData.cs`](../windows/theme-manager/Core/ThemePreviewData.cs) | 有界只读解析、作者值与当前主题覆盖的区别，不执行 CSS |
| 图片元数据／路径检查、请求结果校验 | [`windows/theme-manager/Core/PanelData.cs`](../windows/theme-manager/Core/PanelData.cs) | 保留输入限制及请求 ID、动作、恢复状态校验 |
| 面板调用 PowerShell | [`windows/theme-manager/App/PanelOperations.cs`](../windows/theme-manager/App/PanelOperations.cs) | 固定系统宿主与独立参数，不拼接命令表达式 |
| 保存／应用／快捷方式动作桥接和保存恢复 | [`windows/scripts/panel-operation.ps1`](../windows/scripts/panel-operation.ps1) | 持久恢复、目录交换、操作锁，等待启动子进程时不持锁 |
| 专用启动及快捷方式生成／修复 | [`windows/scripts/launch-themed-codex.ps1`](../windows/scripts/launch-themed-codex.ps1) | 目录验证、归属核对、双目标预检、回滚，启动不创建链接 |
| 既有启动与渲染验证接入 | [`windows/scripts/start-dream-skin.ps1`](../windows/scripts/start-dream-skin.ps1) | 复用既有启动事务，不凭预览或主题名称宣称成功 |
| 安装、卸载与分发文件清单 | [`windows/scripts/install-dream-skin.ps1`](../windows/scripts/install-dream-skin.ps1)、[`windows/scripts/restore-dream-skin.ps1`](../windows/scripts/restore-dream-skin.ps1)、[`windows/installer/setup-bootstrap.ps1`](../windows/installer/setup-bootstrap.ps1)、[`windows/installer/build-release.ps1`](../windows/installer/build-release.ps1) | 包含配套脚本；不自动生成 Launch；卸载只清理已确认归属的链接 |

日志相关职责分布如下：

| 修改目标 | 定位 |
| --- | --- |
| 写入格式、脱敏、保留数量、轮转、写入失败隔离 | [`windows/scripts/operation-log.ps1`](../windows/scripts/operation-log.ps1) |
| 何时记录事件 | `panel-operation.ps1`、`launch-themed-codex.ps1`、`start-dream-skin.ps1` 中的日志调用；集中写入函数仍在 `operation-log.ps1` |
| 有界读取、解析、诊断脱敏 | `PanelData.cs` 中的 `OperationLogStore`；与同文件的结果校验和图片读取分别维护 |
| 日志页、筛选、详情、复制与导出 | `Program.cs` 中的 `BuildLogPage`、`RefreshLogs`、`DisplayLogs`、`ExportLogs` |

修改一种事件的字段或阶段时，检查调用点、统一写入与读取合同及对应测试；只调整保留策略无需改变保存或启动逻辑。底层 injector／verify 日志保持原有用途。

English maintainer summary: this adds draft theme/background editing, an offline illustrative preview, explicit startup saving, two opt-in launch shortcuts, and bounded local diagnostics to the existing manager. Preview data and native drawing are separate from the operation bridge. The tables above map each responsibility to its source file. The mockup does not execute CSS, access Codex, or establish rendering success; shortcut creation neither saves a draft nor launches Codex.

## 构建与更新

- 面板需要 .NET SDK 8 或以上：在仓库根执行 `node tools/build-theme-manager.mjs`。PowerShell 脚本无需编译。
- 源码安装仍使用 `windows/scripts/install-dream-skin.ps1`，需先退出托盘和 Codex。
- Setup 用户运行新版本安装包覆盖更新；开发者构建 Setup 时需包含相同脚本和面板产物。更新前退出 Codex 和 Dream Skin 托盘，遵循现有安装维护检查。
- 日常使用原有管理入口或用户明确创建的 Launch 图标。构建和安装不等于创建 Launch；需要时进入面板点击创建／修复按钮。

本地更新保持版本号不变，不表示已发布新 Release。运行引擎未激活前，旧面板仍代表旧版本；构建成功、payload 准备完成和真实 Codex 验证需要分别记录。

源码修改后应重新构建受影响项目；需要验证实际安装版时再更新运行文件。单元检查或示意图不能代替保存组合、两份 Launch 启动及真实渲染测试；完整 Setup 构建、全新安装、升级和卸载应单独列出已测与未测范围。

## 验收记录（2026-10-17）

本节记录此功能的本地开发验证，版本基线为 1.5.21，并非新 Release 的发布或支持承诺。环境为 Windows 11 家庭版中文版、Build 26200、x64，官方 Codex 来自 Microsoft Store，最近核对版本为 26.1013.3656.0；面板使用 .NET SDK 8.0.425 构建。

### 用户实测

下列结果来自测试用户的明确反馈，与自动化断言分开记录。测试对象为当前用户现有安装中的示意预览开发版；不能据此推定已覆盖全新源码安装或正式 Setup 安装。

| 项目 | 结果与依据 | 范围 |
| --- | --- | --- |
| 默认面板与界面示意预览 | 2026-10-16 用户确认界面正常、满意 | 当前默认窗口；不涵盖英文或全部 DPI |
| 保存主题和背景组合 | 2026-10-17 用户确认正常 | 当前安装版的实际保存流程 |
| 创建／修复默认启动快捷方式 | 2026-10-17 用户确认正常 | 面板按钮生成／修复桌面与目录两份 Launch |
| 桌面 Launch 启动 | 2026-10-17 用户确认正常 | 使用已保存的主题和背景启动 Codex |
| 目录 Launch 启动 | 2026-10-17 用户确认正常 | 使用相同保存组合启动 Codex；不是 Setup 安装目录的独立认证 |

### 自动化与本机检查

| 检查 | 已有结果 | 证据边界 |
| --- | --- | --- |
| Windows Node 检查 | 2026-10-16，36 项通过 | 保存／快捷方式主体阶段；不是最新窗口排版测试 |
| Windows PowerShell 回归 | 2026-10-16，完整 PS 5.1 隔离回归通过；双目标快捷方式专项在 PS 5.1／7 各 32 项通过 | 使用隔离数据和替代路径；覆盖双目标写入、归属、拒绝与回滚等，不等于两种安装包实测 |
| 面板 Core 检查 | 2026-10-16，80 项通过 | 配色／透明度／焦点、结果校验、图片边界、日志读取和脱敏等；不连接真实 Codex |
| 原生测试项目构建 | 2026-10-17，Release 构建通过，0 警告、0 错误 | 编译 App 与 NativeTests；本次没有重新发布单文件面板 |
| 原生窗口与系统接口 | 2026-10-17，最终 review 修复后重建及全部断言通过，退出码 0 | 单实例、互斥锁、字面参数、合成像素、中文两页默认／最小窗口、主题刷新／替换／删除的草稿归属、空列表预览及回收站内容完整性；布局图片此前已人工核对 |
| 现有开发版安装更新 | 2026-10-16，经正常 bootstrap 更新后配套文件一致，原有主题、图片、偏好及核对的入口保留 | 本地开发 payload 更新；没有构建或安装新的 Setup.exe |

原生测试最初只检查控件存在，虽然断言通过，人工查看图片仍发现 640 × 560 最小窗口的预览说明与后续行重叠。修复位于 `App/Program.cs`：按可用宽度计算内容高度，空间不足时纵向滚动，保留预览最小高度。`NativeTests/Program.cs` 随后增加相邻行不重叠断言，重建、复跑和图片核对均通过。该修复只更新源码和测试构建输出；按测试用户要求暂不重新发布或安装，当前安装版仍不包含此修复。

最终代码审查还发现：给主题 B 选自定义背景后删除 B，刷新时因选择事件被抑制，背景草稿可能跟随自动改选的主题 A。`RefreshStore` 现按目录与主题 ID 比较刷新前后的身份，只在身份变化时清理草稿并更新说明与预览；无主题时清理旧图。新增原生断言覆盖同身份保留、同目录换 ID、删除后回退及空列表，修复后全部通过。此收尾修复同样尚未安装，不将此前用户实测追记成已验收此修复。

自动化入口如下（均从仓库根运行；Node 和 .NET SDK 需已可用）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\tests\run-tests.ps1
dotnet run --project windows/theme-manager/Tests/DreamSkin.ThemeManager.Tests.csproj -c Release
dotnet run --project windows/theme-manager/NativeTests/DreamSkin.ThemeManager.NativeTests.csproj -c Release
```

原生测试应在 Windows 测试用户会话运行。它会用生成的主题和日志绘制窗口图片，并把自行生成的测试目录送入真实回收站以核对内容；该测试项保留在回收站。测试不以真实用户主题为删除目标。详细命令与手工检查范围见 [原生面板说明](../windows/theme-manager/README.md)。测试日志和生成图片只保留本地，不随产品源码提交。

### 尚未验证或需要后续确认

- 新的最小窗口和自动改选草稿归属修复尚未在实际安装版复验；已安装版本与最新源码应分别描述。
- 英文长文案、其他 DPI／显示缩放、键盘操作及辅助功能未完成本轮人工验收；语言选择逻辑测试通过不代表这些布局都通过。
- 当前组合的保存和两入口启动由用户确认通过；取消／确认重启、外部并发编辑、故障恢复及真实窗口 0%／100%／跟随主题未完成本轮完整人工矩阵，相关隔离断言不能替代实际窗口验证。
- 完整 Setup 构建、全新安装、覆盖升级、卸载及真实 Setup 登记目录落点尚未实测，拟交 CI／维护者确认补测；不把此安排写成 CI 已完成。
- 本功能针对 Windows 专用启动入口，不等于官方 Codex 原图标伴随启动，也不覆盖 macOS 同类需求。

English review summary: the tester explicitly accepted saving the theme/background, creating or repairing both shortcuts, and launching the saved combination from each shortcut. Core checks (80), earlier Windows Node checks (36), PowerShell regressions and the latest native fixture checks passed within the scopes above. Native image inspection exposed a minimum-window overlap; final code review also found an image draft carrying over after automatic theme reselection. Both source fixes and their native assertions passed, but neither fix has been installed. Full Setup lifecycle, English/scaling acceptance and the remaining live failure/recovery matrix are still unverified. See the source map above for implementation ownership; local logs and private screenshots are excluded from the contribution.
