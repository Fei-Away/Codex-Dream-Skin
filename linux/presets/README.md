# 预设主题 · Preset packs

这个目录放 **Codex Dream Skin 的 Linux 内置预设主题**。deb 安装时 postinst 不写用户目录
（它以 root 运行，不能写进用户状态树）；tar.gz 的 `install.sh` 会幂等地把每个 `preset-*/`
播种到用户主题库 `~/.local/state/codex-dream-skin/themes/`。两种安装方式下，第一次启动
`dreamskin` 都会自动补种并预选默认预设，装完即可在菜单「已保存的主题」（菜单 5）或
`dreamskin theme apply <id>` 里直接切换。完整安装说明见
[`docs/install-linux.md`](../../docs/install-linux.md)。

> This folder holds the bundled preset themes for Linux. The first `dreamskin`
> start seeds each `preset-*/` into the user theme library, so a fresh install
> ships with a ready-to-use skin.

## 内置预设

公开 Linux 安装包（deb 与 tar.gz）只随附 `preset-gothic-void-crusade/`
（Gothic Void Crusade / 哥特虚空远征）：社区作者提供的原创哥特科幻背景，浅色与暗色
截图均来自真实 Codex 注入，不是 AI 绘制的整窗 UI。

`preset-arina-hashimoto/`（桥本有菜 / Arina Hashimoto）不出现在公开 Linux 安装包中，
与 macOS 发行政策保持一致——该维护者提供的精选预设是单独记录的发行例外，文件清单和
限制见 [`macos/NOTICE.md`](../../macos/NOTICE.md)。这不表示以后可以提交其他可识别真人
素材。

## 一套预设的结构

```
preset-<slug>/
├── theme.json        # schemaVersion 1，与 assets/theme.json 同一格式
└── background.jpg    # 背景图（横向，JPEG）
```

- 目录名与 `theme.json` 的 `id` **必须**都是 `preset-<slug>` 形式（`slug` 用小写英文 + 连字符）。播种只管理 `preset-*`，绝不会碰用户自己「换一张图」保存的 `custom-*` 主题。
- `image` 字段只能是**本目录内**的文件名（不能是路径），格式 `png` / `jpg` / `jpeg` / `webp`，≤ 10 MB（建议 < 1 MB）。
- `appearance` **必须如实声明背景图成立的模式**（这是规范，不是可选项）：
  - `"auto"`——仅限浅色、暗色外壳下都协调的图，且两种模式都实测过。皮肤跟随 Codex 客户端的浅暗设置切换外壳。
  - `"dark"` / `"light"`——单模专属图（如深色大教堂、纯白极简）。皮肤外壳固定为该模式，不随客户端切换。
  - 暗色专属画作声明 `auto` 是缺陷不是偏好：客户端处于浅色时，Codex 原生组件（差异卡片、任务条等）按浅色渲染，会与暗图直接打架（#134 曾因此返修）。拿不准就按图的实际明暗写死，不要照抄模板默认值。
- 人物/场景背景优先提交 `2560 × 1440`（16:9）母版；主视觉放在右侧约 58%～88%，左侧约 50%～58% 保持低信息、低对比。禁止把效果截图、窗口 mockup 或任何带 UI 的图片命名为 `background.*`。

## theme.json 字段全解（投稿必读）

以 `preset-gothic-void-crusade/theme.json` 为参考模板。除标注「可选」外均建议如实填写；文案留空会退回内置默认值，不会报错但会显得敷衍。

### 文案字段（界面哪里能看到）

| 字段 | 显示位置 |
| --- | --- |
| `name` | 首页标题上方的主题名眉标（强调色小字） |
| `tagline` | 首页标题下方一行副标语 |
| `quote` | 首页右下角手写体口号（斜排，随强调色） |
| `brandSubtitle` / `statusText` | 皮肤 chrome 的品牌角标与状态文案（部分布局下隐藏） |
| `projectPrefix` / `projectLabel` | 「选择项目」按钮的前缀与占位文案 |
| `promoTitle` / `promoSub` / `promoUrl` | 分享/宣传场景使用，可选 |

### colors 调色板（键 → 界面用途）

所有键都会被注入为主题变量，整套皮肤 UI 跟着走：

| 键 | 用途 |
| --- | --- |
| `background` | 整窗兜底底色（背景图未盖住的区域、body 底） |
| `panel` / `panelAlt` | 半透明面板底：侧栏、卡片、composer、右侧工具面板的毛玻璃都从它调透明度 |
| `accent` / `accentAlt` | 强调色：建议卡圆圈与图标、主题名眉标、口号、状态点、聚焦描边 |
| `secondary` / `highlight` | 次强调/高亮（粒子、渐变、hover 等点缀） |
| `text` | 正文字色（标题、卡片文字都强制跟随） |
| `muted` | 次要文字与大多数描边（卡片/面板边框按它调透明度） |
| `line` | 分隔线与细描边 |

- 颜色必须与背景图协调：`accent` 建议直接从画面主体取色（Gothic 取的是烛金 `#c8a55a`）。
- 声明 `appearance: dark` 的主题请给暗底亮字；`light` 反之；`auto` 主题两种模式都要自查对比度。

### art 元数据

`art.focusX` / `art.focusY`（`0..1`，画面主体位置）、`art.safeArea`（`auto | left | right | center | none`，低信息留白侧）、`art.taskMode`（`auto | ambient | banner | full | off`，任务页呈现）。显式值优先于引擎自动分析；拿不准可先不填，实测后补。

## 素材红线（务必阅读）

内置预设会随仓库与安装包分发，**不是**「个人本地示意」。为避免把维护者和使用者拖进法律风险，只接受：

- ✅ **原创**或你**拥有授权**的图像；
- ✅ 明确 **CC0 / 公有领域 / 允许再分发**的素材；
- ✅ 纯程序化生成的抽象 / 渐变 / 几何背景。
- ✅ 原创虚构的成年人物形象，且能说明生成/授权来源、没有模仿可识别真人。

除非维护者事先完成独立权利审核并在 `NOTICE.md` 逐项记录，否则**不接受**（PR 会被拒绝）：

- ❌ 真人肖像（明星、网红、AV 演员等）——涉肖像权，且本仓库带 MIT 与商业赞助；
- ❌ 受版权保护的动漫 / 游戏 / 影视角色与截图；
- ❌ 任何你无权再分发的第三方素材。

提交预设即视为你声明：对该素材拥有分发与再授权的权利。

## 贡献方式

没有 Linux 环境或想用自制原图，也可以直接放 `preset-<slug>/background.jpg` + 手写
`theme.json`（照抄任一现有预设改配色即可）。

生成纯背景前建议直接使用 [`docs/reference-background-prompt-guide.md`](../../docs/reference-background-prompt-guide.md) 的 16:9 通用模板、浅/暗兼容约束和负面词；八种概念图的逐张拆解另见 [`docs/background-generation-prompts.md`](../../docs/background-generation-prompts.md)。

## 提交前自检

```bash
# 单独校验一套预设是否是合法可注入的主题包
node linux/scripts/injector.mjs --check-payload --theme-dir linux/presets/preset-<slug>/

# 跑完整测试（含预设合法性 + 播种幂等）
bash linux/tests/run-tests.sh
```

`theme.json` 字段含义见 `../assets/theme.json` 与 `scripts/write-theme.mjs`；`colors` 十个键请与背景图协调（`accent` / `secondary` / `highlight` 会体现在原生控件的强调色上）。

脚本自检通过后，请在实机至少过一遍以下路由（PR 里附截图）：

1. 首页：主题名眉标、标题、tagline、右下口号、四张建议卡（图标应在圆圈正中）；
2. 输入框聚焦后的建议下拉（应为紧凑行，不是大空卡）；
3. Pull Requests 页与「Toggle side panel」打开的 Review · Terminal · Browser · Files 侧面板（应为毛玻璃，不是原生黑底）；
4. 任务页（按 `taskMode` 检查横幅/环境模式）；
5. `appearance: auto` 的主题需浅、暗两种外壳各跑一遍上述路由。
