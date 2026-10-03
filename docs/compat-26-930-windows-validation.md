# Windows：Codex 26.924–26.930 兼容修复验收

本页交给 Windows AI 在真实桌面执行。目标是验证本修复 PR 的会话恢复、活动页面选择、输入框装饰层和工具页壁纸。仅检出、构建、安装及测试；不要合并、提升版本、发布或关闭 Issue。PowerShell 源文件保持冻结，可运行仓库已有脚本，不得修改或生成脚本。不得修改官方 Codex、WindowsApps、app.asar、签名或系统执行策略。

本修复还清除 26.930 页面外层、侧栏内层和设置页整页容器的重复底色，并让 auto 外观识别原生 `data-theme`。Verify 通过不能替代下面的背景与交互检查。用户已授权在性能问题修复并验证后创建 PR；本页不代表性能修复已经完成，创建后填写实际 PR 编号和 HEAD。

## 1. 检出并锁定被测提交

使用干净的专用 clone，在仓库根目录执行。将 `PR_NUMBER` 替换为本修复 PR 编号；不要检出上游 #416 或 #418 代替综合修复。

```text
gh pr checkout PR_NUMBER --repo Fei-Away/Codex-Dream-Skin
git status --short
git rev-parse HEAD
gh pr view PR_NUMBER --repo Fei-Away/Codex-Dream-Skin --json number,url,headRefOid
node --version
```

记录完整 HEAD、PR URL、Windows 版本/架构、官方 Codex 完整版本（不能只写“最新版”）、显示缩放和窗口尺寸。优先在 26.930 上执行；若可用再覆盖 26.924。未安装的版本记“未测”，不要为降级覆盖用户现有官方安装。HEAD 必须等于 PR 的 `headRefOid`。

## 2. 回归与安装来源

Node.js 22+；下面命令从仓库根执行，每条检查退出码，失败先记录，不以视觉正常替代失败。

```text
node tools/sync-runtime-assets.mjs --check
node --test tools/active-page-verification.test.mjs
node --test tools/*.test.mjs windows/tests/*.test.mjs
node windows/scripts/injector.mjs --check-payload
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\tests\run-tests.ps1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\tests\installer-static.tests.ps1
pwsh.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\tests\run-tests.ps1
pwsh.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\tests\installer-static.tests.ps1
git diff --check
```

缺少 PowerShell 7 时记录本机缺口，并核对同一提交 CI 的 PowerShell 7 job；不能写成本机通过。通配符由 Node 22 处理。

优先下载该 PR 的现有 CI Setup 产物：

```text
gh pr checks PR_NUMBER --repo Fei-Away/Codex-Dream-Skin
gh run view RUN_ID --repo Fei-Away/Codex-Dream-Skin --json headSha,event,conclusion,url
gh run download RUN_ID --repo Fei-Away/Codex-Dream-Skin --name CodexDreamSkin-setup --dir .local-evidence/windows-setup
```

`RUN_ID` 来自该 PR CI 链接，`headSha` 必须等于锁定 HEAD，相关 Windows job 必须成功。保留 run URL、产物名及本地 Setup SHA-256。不得取公共 v1.5.18 Release 的旧包来测新代码。产物过期或不可用时，可在该 HEAD 使用仓库既有构建入口（Inno Setup 6.7.1；不改脚本）：

```text
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\installer\build-release.ps1 -OutputDirectory .\.local-evidence\windows-setup
```

## 3. 备份、安装和运行时身份

先保存用户工作并正常退出本次要测试的 Codex 和 Dream Skin 托盘。不要按进程名批量杀掉其他实例。将 `%LOCALAPPDATA%\CodexDreamSkin` 和实际 Codex 配置目录中的 `config.toml` 复制到用户本地备份目录；不存在则记录为新安装。确认目录不是链接/reparse point，备份不上传。配置及状态可能含敏感信息，勿打印全文。保留既有稳定版安装包作为恢复来源。

运行第 2 步得到的 `CodexDreamSkin-Setup-v1.5.18.exe`，按已有安装向导完成。**本 PR 不提升版本，界面显示 1.5.18 不能证明新代码已安装。** 不手工覆盖运行中的 engine，不只启动源码里的新 injector 而留下旧托盘运行时。

从仓库根比较源文件与实际安装 engine 的身份，下面仅输出文件名及摘要：

```powershell
$compatEngine = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\engine'
$compatFiles = @('scripts\injector.mjs', 'assets\renderer-inject.js', 'assets\dream-skin.css', 'assets\theme-preferences.mjs')
foreach ($compatRelative in $compatFiles) {
  $compatSource = Join-Path '.\windows' $compatRelative
  $compatInstalled = Join-Path $compatEngine $compatRelative
  $compatSourceHash = (Get-FileHash -LiteralPath $compatSource -Algorithm SHA256).Hash
  $compatInstalledHash = (Get-FileHash -LiteralPath $compatInstalled -Algorithm SHA256).Hash
  [pscustomobject]@{ File = $compatRelative; Source = $compatSourceHash; Installed = $compatInstalledHash; Match = ($compatSourceHash -eq $compatInstalledHash) }
  if ($compatSourceHash -ne $compatInstalledHash) { throw 'Installed engine does not match the checked-out PR.' }
}
```

四项均匹配后从已安装的快捷方式/托盘启动。同版本 1.5.18 的 bootstrap 可能复用旧 engine；版本号相同不能跳过上述四项检查。若 Setup 没更新同版本 engine，记录失败并使用仓库现有源码安装入口重新安装，再重复身份检查。只运行已有脚本，保持 PowerShell 源文件冻结：

```text
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\windows\scripts\install-dream-skin.ps1
```

## 4. 原生桌面用例

使用自己创建的无敏感信息测试会话。记录前后画面和结构性 verify 结果，不截取用户私人会话，不输出会话标题、URL、token 或配置。窗口保持可见、未最小化。每次验收使用安装后的 Verify 入口：

```powershell
& powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File (Join-Path $compatEngine 'scripts\verify-dream-skin.ps1')
$LASTEXITCODE
```

| 用例 | 操作 | 通过标准 |
| --- | --- | --- |
| 首页 → 旧会话 | 打开至少两条先前创建的测试会话 | 右侧消息、滚动区域和 composer 不消失、不折叠；已有会话仍可读可滚动 |
| 新会话 | 首页输入一条无敏感信息测试提示并发送 | 输入、发送、响应和滚动正常；路由外层不是零高度/隐藏 |
| 缓存导航 | 首页 → 测试会话 A → 首页 → 测试会话 B → 首页，重复两轮 | 留在 DOM 中的 inactive Home 不夺取当前页面识别；活动页 Verify 成功，不因旧 Home 报失败 |
| 装饰与输入 | 点击 composer、键入、多行输入、选中文字、打开模型/附件等已有菜单 | 26.930 footer 的装饰背景不遮住壁纸或正文，不截获输入/点击；真实工具栏和控件保留 |
| 切主题与重应用 | 在已有合法主题间执行 A → B → A 切换，然后执行托盘重应用，正常退出并重开后再次检查四项运行时摘要 | 活动会话内容、输入和导航保留，新背景/CSS 生效；无错误的“成功”提示 |
| 深浅色 | 原生外观依次切换深色/浅色，重复首页与会话检查 | 文字可读、composer 可用、背景稳定，无白色/黑色实心残层遮挡 |
| Auto 外观 | 选择 appearance=auto 的现有合法主题，在原生设置中深色 → 浅色 → 深色；再使用固定深/浅色主题 | auto 的 `data-dream-shell` 跟随原生 `data-theme`，固定主题仍遵守自身 appearance；菜单与正文可读 |
| 重复底色回归 | 同一主题依次打开首页、含表格/代码的会话、设置常规与外观、插件；与恢复后的原生界面对照 | 页面整层和侧栏内层不额外覆盖壁纸；设置页背景可见；卡片、菜单、输入框仍有可读底色。不能只用 DOM 中存在背景图片作为通过依据 |
| 上传透明度 | 使用休闲室内居家（`colors.panel=#1e1e1e55`），检查主页面、侧栏、标题栏、设置卡片、输入框、菜单、用户消息和代码块，再切回 Gothic | 背景采用明确声明的 alpha（55/ff≈0.333），文字/图标自身 opacity 不变；未设置本地覆盖的 Gothic 等无显式 alpha 主题采用默认 30% 透明（背景 alpha 0.70）。不得把局部 Safe CSS 的元素 opacity 当全局透明度 |
| 附件与搜索叠字回归 | 在已有多行正文的会话中使用居家 33% 面板，打开附件建议列表及聊天搜索（cmdk）弹窗，使其覆盖正文；在固定 dark + 原生 light、固定 light + 原生 dark 下分别检查，再切回无 alpha 的 Gothic | 附件列表实际绘制面板与搜索弹窗模糊底层文字，不透出可辨识的会话字形；列表标题、说明、选中项和搜索输入仍清晰，键盘选择、Esc 关闭及鼠标点击正常。保留上传背景 alpha，不靠改成不透明背景或降低文字 opacity 遮盖问题；无作者 alpha 主题也应在默认或用户透明度下保持弹层文字清晰 |
| 表格展开与回复边框 | 使用居家透明主题打开含表格的真实回复，点击表格展开，截图检查整屏遮罩、预览卡片、表头和嵌套表格底色；以真实鼠标点击关闭按钮返回会话。再切浅色和无 alpha 主题重复，并对照图片预览及普通对话框 | 遮罩遵守显式 background alpha（无声明且无本地覆盖时为 70% 不透明），实际表格卡片仅绘制一次 panelAlt alpha（无声明且无本地覆盖时为 70% 不透明）；全屏 dialog 不再叠加第二层卡片/模糊，bg-inherit 子层不重复加深。不能仅凭 computed alpha 通过，截图须无嵌套色块和异常黑幕；文字清晰、回复边框可辨且不裁切正文，关闭按钮真实点击有效；非表格图片预览和普通弹窗不受表格专用规则影响 |
| 标题栏接缝 | 首页、会话、设置间往返，展开/收起侧栏及调整宽度，在顶部背景明显的位置截图 | 标题栏与正文使用连续的遮罩，无亮带或新增双重深色条带；插件页固定标题在列表顶部及滚动后均无额外模糊/深色横条；顶部按钮和窗口拖动可用。记录 Chromium 的 CSS anchor positioning 支持情况 |
| 固定主题与原生外观不同 | 使用居家固定 dark 主题，在原生 light 下检查首页标题、最近聊天、新聊天/搜索/导航图标、输入文字和光标、模型菜单；再切晨雾山水 light | 前景色遵守皮肤且可读；透明度不因修复文字而改变；真正浅色主题仍使用深色文字 |
| 统一 Markdown 底色与无 alpha 主题 | 使用居家透明主题及未声明背景 alpha 的晨雾山水 light，分别在原生 dark/light 下打开代码块、表格操作条、模型菜单和搜索弹窗；再用无 alpha 的固定 dark 重复 | 代码块与表格操作条始终采用当前皮肤 panelAlt，不因原生外观一致或缺少 alpha 而回退到原生白底/黑底；声明 alpha 时保留透明度，未声明且无本地覆盖时默认 30% 透明（alpha 0.70）。菜单/弹窗在外观错配时底色与皮肤前景配套；文字可读且语法类别颜色差异保留 |
| 菜单与代码块混色 | 原生 light + 居家 dark，打开模式/权限/模型菜单、含代码的会话，再切真正 light 主题 | 菜单说明文字清晰，警告语义色保留；菜单不透出清晰底层文字；代码头与正文统一；关键字、字符串、数字、变量保持原生语法配色差异，注释可读，不能被统一刷成白色或正文色 |
| 摘要与侧栏交互 | 打开摘要/置顶摘要，收起左侧，再点“显示侧边栏”，反复三次，并关闭摘要 | 每次左侧可恢复；注意原生摘要切换可能自动收起侧栏，不把它记为皮肤状态损坏；检查真实鼠标命中与顶部按钮 |
| 窄窗口 | 缩到客户端允许的窄窗口，切换侧栏并导航 | 输入仍可到达，消息不折叠，无新增横向溢出、叠层或挡住按钮 |
| 工具路由 | 分别打开 Projects（项目）、Pull Requests（代码审查的 PR 列表与详情）、Customize（个性化/自定义，含滚动固定头部），再检查 Settings 与会话；以实际版本入口为准 | 背景连续显示，原生内容和操作可用；无 composer 的真实工具页不被强制视为损坏 |
| 任务背景模式 | 分别使用 ambient / banner / full / off 的合法测试主题，往返首页和会话 | 保持各模式既有语义；off 不被新增 footer 规则强行开启任务壁纸；composer 尺寸和点击正常 |
| 缩放 | 100% 与 125%，侧栏展开/收起，重复首页与会话导航 | 无聊天消失、误判或新遮挡；#371 的 Windows 8px 亮带作为独立观察项记录，本 PR 不声称修复 |
| 真失败 | 最小化目标窗口后 Verify，再恢复并 Verify；完全退出本次测试目标后 Verify | 不可见/无目标时不能报告已验证成功；恢复可见后可再次成功。记录退出码和结构性原因 |
| 恢复官方外观 | 执行下一节 Restore 并从官方入口启动 | 正常官方界面、会话保留、调试会话结束，无残留主题遮罩 |

如果“真失败”的最小化检查受窗口管理器行为影响，记录原始结果和可见性状态，不修改脚本强行通过。仅记录错误摘要；不得为负例破坏主题文件、关闭安全校验或修改官方 DOM/安装文件。Node 回归另行覆盖 detached、offscreen、隐藏 composer 和多候选锚点。

### 标题栏必须使用系统鼠标验收

使用真实鼠标或操作系统输入注入（例如 Windows SendInput）逐一点击左侧展开/收起、右上角“…”、摘要开关和新标签页；记录每次出现的菜单或布局变化。摘要开关与侧栏组合连续操作三轮，100% / 125% 缩放各测一次；再拖动标题栏空白处，确认窗口仍能移动。不要只检查按钮存在或执行 DOM click、Playwright/CDP click：这些点击可能绕过 Electron 的原生拖动区域，曾出现自动化通过而用户完全点不动的回归。

可同时记录标题栏 `::after` 的 computed `-webkit-app-region`，装饰层不能继承 `drag`；`pointer-events: none` 本身不能证明系统鼠标不被拦截。没有系统鼠标验证能力时明确填“未验证”，不能据 CDP 结果标记通过。

代码块对照覆盖四种组合：原生 light / dark × 固定 light / dark 主题。同外观组合保留客户端原生语法配色；外观相反时使用与皮肤明暗对应的原生调色板。用含关键字、字符串、数字、变量和注释的 JavaScript 示例截图，不以只有一种 token 的片段验收；代码复制、换行和滚动仍应正常。

### 有界的同页性能对照

此项用于确认皮肤是否引入明显卡顿，不预先认定性能问题已修复。选择无敏感内容的同一测试会话，固定窗口大小、缩放、原生明暗、滚动起点、主题及透明度；等待回复完成，不在流式生成或后台更新期间测量。使用现有暂停/恢复主题入口切换 skin on/off，并确认实际状态；如果必须重启才能卸载皮肤，记录该差异，不能把两次不同页面状态当成严格对照。

每个场景只做两轮交替对照：第一轮 on → off，第二轮 off → on。预先确定每段相同的短时长和操作节奏，分别测试静置、上下滚动、输入草稿、菜单开合和设置页滚动。草稿只键入无敏感测试文字，**不要发送**，每段结束清除；菜单与设置使用相同入口，不额外触发模型请求。首次加载/预热单列，不混入稳态记录。仅在失败或结果无法比较时补测并解释原因，避免无限采样。

使用可用的 Chromium Performance/系统性能工具记录每段超过 50 ms 的 long task 次数及总时长、帧延迟/丢帧、renderer CPU、样式重算次数及耗时；保持采样工具和开销一致。只保存聚合性能数据和必要结构信息，关闭截图与包含输入、DOM 文本、网络正文的采集，不记录草稿、会话内容或凭据。采集工具不提供某指标时填“不可用”，不要把缺失记成零。

| 场景 | 轮次/顺序 | on/off 实际状态 | 采样时长 | long task >50 ms 次数/总时长 | 帧延迟/丢帧 | CPU | 样式重算次数/耗时 | 可比性与限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 静置 / 滚动 / 输入 / 菜单 / 设置 | 1 或 2 | on 或 off | 实测 | 实测 | 实测 | 实测 | 实测 | 重启、加载、后台任务或指标缺失 |

逐场景比较两轮是否出现可复现退化，记录用户可感知的输入延迟、滚动停顿及菜单卡住。报告实际数据及差异，不设未经验证的性能结论或把一次平滑操作当作通过；Windows 结果与 Mac 分开报告。若仍卡顿，保留最短复现与对应聚合数据，性能项标记未通过或待定位。

Mac 实测参考：同一台 Intel Mac 的有效可见页面样本中，相同 6.5 秒滚动，修复前样式重算耗时 0.6982 秒，出现 5 次 102–117 ms long task；修复后为 0.4020 秒（约减少 42%），出现 54 ms、61 ms 两次 long task。Work → Codex 标签变化耗时由 885 ms 降至 704 ms，Codex → Work 由 816 ms 降至 678 ms；官方原生对照分别为 498 ms、455 ms。

以上仅为单台 Intel Mac 的有限样本，不是统计保证；隐藏页面样本已剔除。修复后仍有延迟，官方原生对照也存在延迟，不能据此声称完全消除卡顿。Windows 性能尚未验证，须独立执行上述对照。

### 社区皮肤与真实对话

从 Gallery 下载各主题当前获批版本的 Windows ZIP，使用正式导入入口；不要直接使用 macOS 包或跳过 manifest/Safe CSS 验证。若该版本不提供 Windows 包，记录原因并选择同类获批主题替代。Mac 对照使用了以下版本：

| 主题 | 获批版本 ID | 外观 |
| --- | --- | --- |
| 晨雾山水 | `ver_018ad695fbb33b12e141` | light |
| 休闲室内居家 | `ver_34a73ec14a33630c2578` | dark |
| Cyber · 紫罗兰永恒花园 · Violet Evergarden | `ver_62e2656cf8ca7b275b2f` | dark |
| 月下松岚 | `ver_8af62d14f5a0bc7639b8` | dark |

每套至少检查首页、已有会话、发送新消息、设置外观页，并截图。通过客户端模型菜单选择 `gpt-6-astra`（界面可能显示 `6 Astra`），发送无工具提示，确认真实助手回复；错误页、重连、仅显示用户消息不能算通过。另用一条提示要求中文标题、三行 Markdown 表格和 JavaScript 代码块，检查复制、表格展开、代码换行和滚动。记录实际模型、主题名及版本。不得在报告中复制 provider 凭据。

Mac 对照环境为 Intel x86_64、官方 ChatGPT/Codex 26.930.31730；以上四套均已实际应用并收到 6 Astra 回复。Mac 导航与设置截图不能替代 Windows 的原生交互证据。

### 每主题透明度偏好（Windows 本地文件入口）

背景透明度优先级：**用户对该主题的本地覆盖 > 作者明确提供的背景 alpha > 默认 30% 透明（alpha 0.70）**。透明度百分比与不透明度相反：`transparency: 0` 表示不透明（alpha 1），`100` 表示完全透明（alpha 0）。作者 `colors.panel=#1e1e1e55` 在无覆盖时仍为 alpha 55/ff≈0.333，即约 66.7% 透明；`colors.background` / `colors.panelAlt` 自身明确 alpha 优先于作者 panel 回退。四/八位 hex、带 alpha 的 rgba（含 0、1）是明确声明；六位 hex、普通 rgb 不是。不得把局部 Safe CSS 的元素 opacity 当作全局背景透明度，文字和图标不能随背景变淡。

本轮 Windows 托盘没有新增透明度 UI，使用状态目录内的偏好文件测试；macOS 滑杆不代表 Windows 已实现同样入口。实际路径是 `%LOCALAPPDATA%\CodexDreamSkin\theme-preferences.json`，不在 `engine` 或主题包内。先备份已有偏好文件，保持本次测试托盘/受管 Codex 运行以检查自动更新；使用编辑器完整保存有效 JSON，不要覆盖其他主题的记录。

1. 在托盘选中待测主题，从 `%LOCALAPPDATA%\CodexDreamSkin\active-theme\theme.json` **只读取 `id` 字段**。JSON 的 key 使用此 ID，不使用显示名称、Gallery 版本 ID 或文件夹名。
2. 用文本编辑器打开偏好文件；不存在则创建 UTF-8 JSON。保留已有 `themes` 中其他条目，将下面 `ACTUAL_THEME_ID` 替换为该主题 ID。不要修改安装包、主题 ZIP、`theme.json`、`theme.css` 或 manifest。

```json
{
  "schemaVersion": 1,
  "themes": {
    "ACTUAL_THEME_ID": { "transparency": 30 }
  }
}
```

3. 保存后等待 watcher 自动更新，确认当前主题无需重启就真正重新注入。依次将该条目的数字改为 `0`、`100`、`30`，每次完整保存后检查自动更新；不要把数字写成字符串或误写为 alpha。随后正常退出并重新启动本次测试应用，验证设置仍保留。
4. 重置时仅删除 `themes` 中该主题 ID 的整个条目，保留 `schemaVersion: 1` 和其他主题记录。没有其他记录时合法文件为 `{"schemaVersion":1,"themes":{}}`。重置后重新应用。

| 用例 | 通过标准 |
| --- | --- |
| 无覆盖的居家主题 | 作者 panel alpha≈0.333 保留，不被默认 0.70 覆盖 |
| 无覆盖的历史无 alpha 主题 | 默认 30% 透明（alpha 0.70），不再使用旧的不同区域固定透明度 |
| 覆盖 0 / 100 / 30 | 对应背景 alpha 1 / 0 / 0.70；主区、左侧、标题栏、卡片、输入框和弹层背景一致遵守覆盖；文字、图标、光标、边框及交互不随之淡出 |
| 左右一致性 | 同一背景的侧栏/主区及标题栏衔接无额外深色条、双层底色；不能仅凭 computed alpha 验收，截图检查实际叠层 |
| 每主题持久性 | A 设 30，B 设 0，A → B → A；退出重开后分别恢复各自覆盖，不串主题 |
| 删除覆盖重置 | 居家恢复作者 alpha≈0.333，无作者 alpha 的主题恢复默认 0.70；其他主题偏好不变 |
| 包内容不变 | 调整前后主题三件套与 manifest 内容未改变；偏好只保存在本地状态文件 |

记录实际主题 ID、覆盖值、重启/切换后的结果及本地脱敏截图。不存在 Windows 设置入口时按本段文件方式执行，不修改冻结的 PowerShell 来添加入口。社区新增必填透明度字段不在本轮范围内。

## 5. 恢复

优先使用已安装引擎的现有恢复命令，按提示仅重启本次测试实例：

```powershell
& powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File (Join-Path $compatEngine 'scripts\restore-dream-skin.ps1') -RestoreBaseTheme -PromptRestart
```

退出测试托盘，正常退出测试 Codex，从官方入口启动确认恢复。若需要退回旧引擎，用之前保留的稳定版安装包重新安装；主题/配置备份留在本地，不盲目覆盖当前配置。只有确认配置损坏且常规恢复无效时，才按 [Windows 说明](../windows/README.md) 的 `-RecoverConfigBackup` 恢复流程处理。不要删除用户主题/会话、清空配置或绕过执行策略。

## 6. 回报模板

```text
PR / HEAD：
Windows / 架构 / 缩放：
官方 Codex 完整版本：
Dream Skin 显示版本：1.5.18（源码身份另验）
CI run URL / headSha / 相关 job：
Setup 来源 / SHA-256：
四项 source/installed 摘要匹配：
Node / PowerShell 5.1 / PowerShell 7 回归及退出码：
各原生用例：通过 / 失败 / 未测（原因）
每主题透明度：作者默认 / 0 / 100 / 30 / 切换持久性 / 删除覆盖重置：
性能对照：五场景各两轮 on/off、聚合数据及限制：
失败的最短重现与结构性错误：
恢复结果：
本地脱敏证据路径：
仍待验证：
```

验收报告区分 fixture、CI 和真实 Windows 桌面证据；macOS 证据不能替代 Windows。不要把 PR 检出、CI 成功或安装完成写成原生验收通过。
