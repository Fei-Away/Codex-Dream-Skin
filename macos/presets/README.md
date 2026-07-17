# 预设主题 · Preset packs

这个目录放 **Codex Dream Skin 的内置预设主题**。安装时 `install-dream-skin-macos.sh` 会把每个 `preset-*/` 幂等地播种到用户主题库 `~/Library/Application Support/CodexDreamSkinStudio/themes/`，装完即可在**菜单栏「已保存的主题」**或 `switch-theme-macos.sh --id <id>` 里直接切换。

> This folder holds the bundled preset themes. Install seeds each `preset-*/` into the user theme library, so a fresh install ships with ready-to-use skins.

## 内置实测预设

当前内置 `preset-gothic-void-crusade/`（Gothic Void Crusade）与
`preset-arina-hashimoto/`（桥本有菜 / Arina Hashimoto）两套实机验证主题。
前者是社区作者提供的原创哥特科幻背景；后者使用一张
`2560 × 1440`（16:9）纯背景：左侧低信息留白承载 Codex 原生标题，人物和花卉主视觉集中在右侧。浅色与暗色截图均来自真实 Codex 注入，不是 AI 绘制的整窗 UI。

来源尺寸必须如实区分：归档的用户源图（不随 preset 播种）是 `1672 × 941` PNG；preset 内的 `background.jpg` 保持其近 16:9 构图，标准化导出为 `2560 × 1440` JPEG，并不代表补回或新增了源图细节。派生文件使用 `sips -z 1440 2560 -s format jpeg -s formatOptions 90` 生成。

- 可导入/可播种的主题素材只有 [`background.jpg`](./preset-arina-hashimoto/background.jpg) 与 [`theme.json`](./preset-arina-hashimoto/theme.json)。
- 用户提供的 byte-identical 源 PNG 单独归档在 [`docs/images/presets/arina-hashimoto-source.png`](../../docs/images/presets/arina-hashimoto-source.png)，不放进 preset pack，因此不会被安装脚本播种为多余文件。
- 当前浅色、暗色实测文档截图均为 `2308 × 1572` Retina JPEG（CSS viewport `1154 × 786`），来自同一真实 Codex 首页；为保护未发送草稿，截图时仅用临时本地样式隐藏输入文字并收起编辑区，没有修改草稿内容或伪造皮肤效果。它们包含真实侧栏、项目工具栏和输入框，**只作预览，绝不能当背景导入**。
- 背景是用户提供的 AI 生成示例，不代表 OpenAI/Codex 官方视觉或背书；公开分发前仍需确认人物、模型输出与素材使用权。
- 该维护者提供的精选预设是单独记录的发行例外，不纳入 MIT 软件许可；文件清单和限制见 [`../NOTICE.md`](../NOTICE.md)。这不表示以后可以提交其他可识别真人素材。

安装后可直接切换：

```bash
~/.codex/codex-dream-skin-studio/scripts/switch-theme-macos.sh \
  --id preset-arina-hashimoto
```

## 一套预设的结构

```
preset-<slug>/
├── theme.json        # schemaVersion 1，与 assets/theme.json 同一格式
└── background.jpg    # 背景图（横向，JPEG）
```

- 目录名与 `theme.json` 的 `id` **必须**都是 `preset-<slug>` 形式（`slug` 用小写英文 + 连字符）。播种只管理 `preset-*`，绝不会碰用户自己「换一张图」保存的 `custom-*` 主题。
- `image` 字段只能是**本目录内**的文件名（不能是路径），格式 `png` / `jpg` / `jpeg` / `webp`，≤ 16 MB（建议 < 1 MB）。
- 人物/场景背景优先提交 `2560 × 1440`（16:9）母版；主视觉放在右侧约 58%～88%，左侧约 50%～58% 保持低信息、低对比。禁止把效果截图、窗口 mockup 或任何带 UI 的图片命名为 `background.*`。

## 素材红线（务必阅读）

内置预设会随仓库分发，**不是**「个人本地示意」。为避免把维护者和使用者拖进法律风险，只接受：

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

没有 mac 或想用自制原图，也可以直接放 `preset-<slug>/background.jpg` + 手写 `theme.json`（照抄任一现有预设改配色即可）。

生成纯背景前建议直接使用 [`docs/reference-background-prompt-guide.md`](../../docs/reference-background-prompt-guide.md) 的 16:9 通用模板、浅/暗兼容约束和负面词；八种概念图的逐张拆解另见 [`docs/background-generation-prompts.md`](../../docs/background-generation-prompts.md)。

## 提交前自检

```bash
# 单独校验一套预设是否是合法可注入的主题包
node macos/scripts/injector.mjs --check-payload --theme-dir macos/presets/preset-<slug>/

# 跑完整测试（含预设合法性 + 播种幂等）
cd macos && npm test
```

`theme.json` 字段含义见 `../assets/theme.json` 与 `scripts/write-theme.mjs`；`colors` 十个键请与背景图协调（`accent` / `secondary` / `highlight` 会体现在原生控件的强调色上）。
