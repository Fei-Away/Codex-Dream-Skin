# Codex 初音主题组件覆盖矩阵

## 目标

以 `references/` 中 13 张 Codex 桌面端截图为唯一布局事实来源，保留原信息架构、密度、分栏逻辑和状态语义，仅重做视觉语言。最终交付必须是可分别审阅、替换和迭代的独立 UI 组件图，不是一张完整界面总览图。

> 本矩阵记录的是 **设计资产覆盖**：哪些真实界面有参考截图和对应组件板。它不声明当前 Codex DOM selector 已命中，也不声明路由已通过交互或视觉验收。运行时状态以 `qa-inventory.md` 为准。

## 2.0.3 运行时落地状态

- Dark 路由基线已通过 live contract 与逐张视觉复核，覆盖组件 01–13。
- Light 只对 Home 与 Settings General 完成视觉 smoke，不外推为全 Light 路由验收。
- 组件 14 的 hover、disabled、loading 等通用状态未逐项人工触发，保持 Partial。
- 本地截图只作验收证据，保存在被 Git 忽略的 `runtime/qa/`；逐路由文件名和结果见 `qa-inventory.md`。

## 由真实截图支持的设计组件

| 组件族 | 参考图 | 必须覆盖的状态 |
| --- | --- | --- |
| 应用外壳与全局侧栏 | 01、03、04、05、08 | 默认、hover、active、pinned、badge、project expanded/collapsed、account footer |
| 任务对话画布 | 01、03 | 用户消息、助手消息、处理状态、引用、正文、操作图标、滚动区域 |
| 输入编排器 | 01、04、10、12 | 空、已输入、带附件、模型选择、权限/自定义、语音、发送可用/禁用 |
| 新任务空状态 | 04 | mascot、标题、四类建议卡、workspace selector、底部 composer |
| 修改摘要与审查卡 | 01、03、12 | collapsed、expanded、文件行、增删计数、undo、review、overflow |
| 设置外壳与表单控件 | 02、13 | nav、search、section、card、row、toggle、select、segmented、link、divider |
| 插件市场 | 05 | tabs、search、installed strip、public/personal、category、plugin card、install/installed |
| 自动化 / 已安排任务 | 08 | filter、unread、enabled、paused、next run、suggestion、create |
| 快捷聊天浮窗 | 07 | empty、recent list、composer、minimized、focused、overlay |
| 侧栏悬浮信息卡 | 09 | metadata、branch、schedule、pin、archive、pointer alignment |
| 账户与用量菜单 | 06 | usage meter、plan、reset、pet、settings、logout、warning/normal |
| 分屏启动器与底部终端 | 10、11 | split dividers、launcher rows、shortcut badges、terminal tabs、focused/unfocused |
| 输出与后台进程面板 | 12 | empty、running、success、failed、truncated command、add action |
| 个人资料与数据分析 | 13 | avatar、privacy/share/edit、metrics、heatmap levels、insights、plugin ranking |

## 根据同一组件契约做的设计层补齐

以下页面没有独立截图，但必须沿用真实设置壳和现有控件，不允许发明新的导航结构：

- Appearance：主题模式、强调色、背景/前景色、字体、透明侧栏、代码主题和主题导入/分享。
- Pets：宠物选择、预览、启用/隐藏、尺寸或行为设置（只做组件视觉稿，不虚构当前产品能力）。
- 独立 Diff：文件树、代码行号、added/removed/modified、inline comment、review footer。
- 通用状态：loading、empty、error、disabled、focus、keyboard focus、selected、notification dot、tooltip、toast。

## 固定视觉方向

- 主题：未来舞台感的初音未来插画主题，但保持专业编码工具气质。
- 主色：Miku turquoise `#39C5BB`，高亮 `#22D3C5`，次要粉色 `#FF4FA3`。
- 深色基底：`#07131F` / `#0B1F2A`；浅色基底应有独立的高对比方案，不是简单反相。
- 信息优先级不变；正文、代码和关键状态的对比度优先于装饰。
- 插画元素以发丝曲线、声波、音符、发光边缘、格栅和小型 Miku 形象作为低干扰结构元素；不得遮挡文字、Diff、终端或点击目标。
- 图标、圆角、阴影、描边、间距和状态颜色必须形成统一 token 系统。

## 独立交付资产

1. `01-app-shell-sidebar.png`
2. `02-task-conversation-composer.png`
3. `03-new-task-empty-state.png`
4. `04-change-summary-diff.png`
5. `05-settings-controls.png`
6. `06-plugins-marketplace.png`
7. `07-scheduled-tasks.png`
8. `08-quick-chat-panel.png`
9. `09-popovers-account-task.png`
10. `10-split-launcher-terminal.png`
11. `11-output-process-panel.png`
12. `12-profile-analytics.png`
13. `13-appearance-pets.png`
14. `14-states-tokens.png`

每张图只展示对应组件族及其关键状态，可用紧凑的 component board，但不得组合成一张完整 Codex 应用截图。

以上 14 项均已生成并保存在独立设计源 `codex-miku-ui-theme/components/`。本运行时仓库不重复提交这些 PNG，只在 `component-spec-manifest.json` 保存去除会话标识后的文件名、尺寸、哈希与参考图映射元数据快照；静态测试不会把该快照冒充成本仓 PNG 重算结果。
