# Codex Dream Skin 参考图生图提示词

这份文档只生成会铺在真实 Codex 控件下方的**纯背景图**。推荐母版为 `2560 × 1440`、16:9；效果图、窗口截图、侧栏、卡片和输入框都不是背景素材。

> 公共模板默认生成原创虚构成年人物，不指定或模仿名人、私人个体、受版权保护角色或在世艺术家的标志性风格。只有在你确实拥有肖像和素材使用权时，才使用“已授权身份参考”段落。生成结果不代表 OpenAI/Codex 官方视觉或背书。

English guide: [`reference-background-prompt-guide.en.md`](./reference-background-prompt-guide.en.md)

## 当前实测精选置顶：桥本有菜

- **实际可切换主题**：`macos/presets/preset-arina-hashimoto/`；Windows 使用 `windows/assets/theme.json` 与 byte-identical 的 `windows/assets/dream-reference.jpg` 组成播种源，两端首装都会播种「桥本有菜」。
- **用户提供的纯背景源图**：`docs/images/presets/arina-hashimoto-source.png`（`1672 × 941`）；preset 中的 `2560 × 1440` JPEG 是标准化发行副本，不会凭空增加源图细节。
- **真实运行效果**：`arina-hashimoto-light.jpg` 与 `arina-hashimoto-dark.jpg` 是浅色/暗色实机截图，只用于预览，不能导入为背景。
- **与历史示例的关系**：它是当前实际预设，不是 `docs/images/gallery/skin-01.jpg`，也不是 skin-01～08 的概念效果图。skin-01 只提供相近的粉色玫瑰视觉方向和 UI 文案参考。

该素材由用户说明为桥本有菜参考版，并按维护者明确要求作为源图、可切换预设和实机预览随仓库收录；这只记录素材指向与收录决定，不构成肖像、生成或再分发授权声明。`macos/NOTICE.md` 已将相关文件排除在 MIT 软件许可之外，使用者与下游分发者仍需独立核验相应权利。下面的公共可复制提示词继续使用原创虚构成年人物。

## 先分清：实际预设、纯背景、效果图和提示词

README 里的“效果图”不等于可以导入的背景。下面这些文件职责不同，不能互相替换：

| 类型 | 仓库路径 | 作用 | 能否直接作为完整主题导入 |
|---|---|---|---|
| **实际可切换预设（当前置顶）** | `macos/presets/preset-arina-hashimoto/`；Windows 的播种源为 `windows/assets/theme.json` + byte-identical 的 `dream-reference.jpg` | 两端都会播种「桥本有菜」；macOS 用脚本/菜单栏切换，Windows 用系统托盘切换 | **可以** |
| **纯背景源图** | `docs/images/presets/arina-hashimoto-source.png` | 用户提供的原始纯背景，约 `1672 × 941`；只有图片，没有 `theme.json` | **不能作为完整主题**；可手动换图，但应先检查比例和裁切 |
| **真实实机效果预览** | `docs/images/presets/arina-hashimoto-light.jpg`、`arina-hashimoto-dark.jpg` | 浅色/暗色 Codex 注入截图，包含真实侧栏、卡片和输入框 | **不可以** |
| **概念效果图** | `docs/images/gallery/skin-01.jpg` ～ `skin-08.jpg` | 只表达八种视觉方向的带 UI 示例；配套的 `background-generation-prompts.md` 按这些方向拆解 | **不可以** |
| **实验/历史图片** | `docs/images/banner-*.png`、`docs/images/generated-*.png` | 尚未批准的本地实验图或参考图；不属于任何 preset pack | **不可以**，也不要未经权利核验放进发行包 |

`docs/images/hero-banner-red-white.png` 与 `macos/assets/portal-hero.png` 是旧的 3:1 横幅资源，不是当前 16:9 通用主题母版；除非明确只做首页横幅，否则不要拿它们替代 `preset-*/background.jpg`。

一句话判断：**要切换主题看 `macos/presets/preset-*`；要生成新图看本指南；要看视觉方向看 `docs/images/gallery/`；要看真实运行结果看 `docs/images/presets/*-light.jpg` / `*-dark.jpg`。** `theme.json` 和 `background.jpg` 同在一个 `preset-*` 目录时才是一套可播种的主题；`docs/images/` 是文档/归档目录，不是主题库的镜像。

路径分类不代表肖像或再分发许可。当前 `preset-arina-hashimoto` 含维护者指示收录的用户提供真人/AI 肖像素材；仓库公开包含这些文件并不授予或证明肖像、生成、商业使用或再次分发权利，具体边界以 `macos/NOTICE.md` 为准。

生成新图时先在仓库外保存草稿并按文末清单验收；通过后，才把**纯背景**等比导出为 `background.jpg`，与对应的 `theme.json` 放进新的 `macos/presets/preset-<slug>/`。不要把草稿、带 UI 的截图或未核验真人图放进 `docs/images/` 再误以为它会成为可切换主题。

## skin-01 概念图里的文案：只作 UI 叠加参考

`docs/images/gallery/skin-01.jpg` 是一张概念效果图；它把文案、侧栏数据和拍立得一起画进了整张 UI。下面的文字是从该图整理出的**需求参考**，不是纯背景图的一部分。生成时应明确要求 `no readable text`，再由真实 UI 或独立装饰层渲染；这样文字不会在不同窗口比例下被裁切，也不会出现 AI 乱码。

| 概念位置 | 参考文案 | 当前建议 |
|---|---|---|
| 顶部品牌标题 | `桥本有菜专属定制皮肤` | 只有在肖像与再分发权利已确认时才使用；当前运行时不显示该品牌层，留作未来独立 UI 字段 |
| 顶部副标题 | `Codex App 限定版` | 当前运行时不显示；不烘焙到 `background.jpg` |
| 花体签名 | `Arina Hashimoto♡` | 独立签名层；当前基础运行时没有通用签名字段，未实现前不要伪装成背景文字 |
| 首页主标题 | `我们该构建什么？` | 保留 Codex 原生标题；当前主题不替换用户项目、任务、消息或主标题 |
| 首页副标题 | `与有菜一起，用灵感创造无限可能` | macOS 当前可用 `tagline` 显示；Windows 当前不渲染主题文案，留作后续独立字段 |
| 输入框占位 | `随心输入，让灵感陪你一起写代码吧～` | 仅在产品明确允许自定义占位时使用；不能覆盖用户已输入内容 |
| 右下拍立得文案 | `一直陪伴，是最温暖的慰藉 ♥` | 独立 sticker 的 caption；效果图字形较糊，正式发布前以确认稿为准 |

这张表**不表示仓库已经支持所有字段**。当前主题名只稳定显示在 macOS 菜单栏 / Windows 托盘等切换入口；macOS 首页支持 `tagline`，但顶部品牌、副标题、状态、quote、签名、拍立得和独立装饰都不在当前可见运行时契约内，Windows 也暂不渲染主题文案。没有对应 schema 与 renderer 能力时，宁可不显示，也不要把文字或小照片拼进背景图。若以后实现 sticker，照片应作为主题目录里的独立 `sticker-*.jpg`，由装饰层在首页/任务页按断点显示，并设置 `pointer-events: none`；不要把它当成第二个背景或让它遮住 composer。

人物姓名、肖像和这组文案都属于特定预设的内容，不应复制到“通用模板”里。没有相应授权时，改用原创虚构成年人物，并删除姓名、作品名和可识别身份词。

## 先固定 Image 1 / 2 / 3 的职责

参考图越多，越要明确“哪张图只负责什么”。标准顺序如下：

| 输入 | 角色 | 可以参考 | 绝对不能做 |
|---|---|---|---|
| **Image 1** | UI 效果图 / Codex 实机截图 | 色板、光线、氛围、人物大致位置、整体构图 | 不能当作修图底稿；不能擦 UI、临摹 UI、保留任何文字或控件 |
| **Image 2** | 可选的纯风格 / 场景参考图 | 材质、花材、环境、调色、景深和光影 | 不能从中推断人物身份；不复制 Logo、文字、角色设定或签名风格 |
| **Image 3** | 可选的已授权成年人物身份参考 | 仅用于脸部身份、成年年龄、发型和自然人体比例的一致性 | 用户未明确确认必要权利时不得上传或使用；不从中抽取 UI 或背景构图 |

上表的编号指实际上传顺序。生成器或 CLI 会把第一个输入称为 Image 1，不会为缺失的参考图保留空号。如果省略 Image 2，原本的身份参考就会变成实际 Image 2，必须同步改写 Prompt 中的编号。不要在 Prompt 里引用一张没有上传的图。

最稳定的第一轮是只使用 Image 1，生成原创虚构成年人物。只有在用户明确确认必要的肖像和素材使用权后，才切换到 Image 3 身份参考流程；本文档不代表对任何具体素材做授权声明。

像“桥本有菜”这类具体真人姓名不能写进默认公共 Prompt 来诱导模型模仿。若你确实拥有必要授权，只在本地授权流程中把清晰的成年身份图作为 Image 3，并按下方“已授权身份参考”模板生成；否则请使用原创虚构成年人物版本。

## 使用前先设置尺寸

提示词中的 `2560 × 1440` 不能替代生成器自己的尺寸设置。请在生成器界面或 API 参数中同时选择 `2560 × 1440`；不支持该尺寸时，先生成最高质量的 16:9 横图，再在导出工具中裁切为 16:9 并缩放到 `2560 × 1440`。不要把非 16:9 图片直接拉伸变形。

Dream Skin 使用 `cover` 铺满窗口，因此 16:10、4:3 和超宽窗口必然会裁掉少量边缘。使用右侧人物构图时，建议主题配置为：

```json
{
  "appearance": "auto",
  "art": {
    "focusX": 0.72,
    "focusY": 0.45,
    "safeArea": "left",
    "taskMode": "ambient"
  }
}
```

`safeArea: "left"` 表示左侧留给原生内容，窄窗口会优先保住右侧主体；此时边缘保护优先于 `focusX`。关键内容仍必须放进下面的 crop-safe 区，CSS 无法让所有比例同时展示原图的全部像素。

| 区域 | 推荐坐标 | 要求 |
|---|---:|---|
| 原生内容安全区 | `x=0%–52%` | 连续环境、低信息、低局部对比；不要放脸、手、密集花卉或强光斑 |
| 自然过渡区 | `x=45%–62%` | 留白自然过渡到主视觉，不能像矩形面板或左右拼图 |
| 关键主体安全区 | `x=62%–88%` | 脸、手、发饰和识别性道具必须留在这里；非关键装饰最多延伸到 `x=90%` |
| 纵向安全区 | `y=16%–72%` | 脸建议 `y=20%–52%`，手建议 `y=30%–70%`；底部输入框可能覆盖更低区域 |
| 边缘保护 | 关键内容距边 ≥ `8%` | 不要让头发、手、文字替代物或关键道具贴边 |

同一张图要兼容浅色和暗色外观：左侧保留柔和中间调与细微纹理，不要纯白烧穿或纯黑死区；最强对比和最高频细节集中在主体附近。

下面的完整 Prompt 都按同一顺序编写：**用途/资产类型 → 画布与构图 → 参考图合约 → 场景与单一主体 → 拍摄/媒介 → 材质 → 光线 → 色板 → 不可变条件 → 针对性排除项**。复制时保留这个顺序，不要只留下“精美、高级、8K”之类形容词；可见的物件、材质和光线比空泛质量词更有用。

## 公共通用基线：柔光玫瑰纯背景（原创虚构成年人物）

这段不包含姓名、签名、小照片、文案或任何 UI，可以直接生成当前精选预设同方向的背景：

```text
Use case: photorealistic-natural
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one new standalone 2560×1440, 16:9 desktop wallpaper as edge-to-edge continuous artwork. Generate only the underlying romantic rose scene that will sit beneath a real application interface.
Input image contract:
- Image 1 is a UI screenshot or concept mockup. Use it only for palette, lighting, atmosphere, subject placement, and broad composition. It is not an edit target.
- Image 2, if supplied, is a clean style or environment reference. Use it only for materials, floral language, color grading, depth of field, and lighting. Do not infer identity, copy text, or copy branded elements from it.
- Identity mode for this prompt is ORIGINAL FICTIONAL ADULT. Do not attach or use Image 3. Do not infer a real identity from Image 1 or Image 2. For an identity-preserving result, stop and use the separately authorized workflow below.
Reference handling: Generate a completely new image from scratch. Do not copy, trace, clean up, erase UI from, or retain any interface element from the references. Reconstruct all areas hidden by Image 1's interface as one continuous natural environment.

Scene/backdrop: A luxurious pastel rose-garden studio with pink and ivory rose clusters concentrated around the right side, translucent blush curtains, soft-focus floral depth, sparse floating petals, pearlescent dust, tiny warm star-like glints, and restrained creamy bokeh. Continue the same environment naturally across the entire canvas. Keep x=0%–52% calm, bright, low-contrast, and low-detail with a smooth warm-ivory-to-blush atmosphere, extremely faint watercolor leaves, and only a few sparse petals. Keep the bottom-left and center-left especially quiet.

Subject: One original fictional adult woman in a refined romantic beauty-editorial portrait. She is clearly adult and is not based on any named or recognizable person. Give her balanced delicate facial proportions, expressive eyes, long glossy black twin ponytails, airy bangs, soft natural pink makeup, and a gentle confident expression. She wears delicate white fluffy hair ornaments, a blush-pink chiffon dress with translucent ruffled sleeves, subtle crystal embroidery, and a small white faux-fur shoulder wrap. Her hands form one natural relaxed pose near her collarbone.

Style/medium: Premium Japanese romantic beauty editorial, polished photorealism, realistic skin texture, natural anatomy, delicate fabric micro-detail, shallow depth of field, no plastic CGI skin.
Capture context: Eye-level editorial portrait with a restrained 85 mm lens feel and a natural waist-up three-quarter framing; realistic optical depth and no extreme wide-angle distortion.
Composition/framing: Reserve x=0%–52% for the calm text-safe environment. Keep the complete critical silhouette, face, hands, hair ornaments, and clothing details within x=62%–88% and y=16%–72%. Place the face within y=20%–52% and the hands within y=30%–70%. Keep nonessential flowers and curtain detail within x=56%–90%. Keep all critical details at least 8% away from every edge. Create one continuous scene with no vertical seam or split-panel effect.
Materials/detail: Real rose petals with varied translucency, matte chiffon, soft faux-fur fibers, restrained crystal highlights, translucent curtain weave, and natural skin micro-texture. Keep reflective sparkle sparse and physically coherent.
Lighting/mood: High-key diffused beauty lighting, soft window glow from the upper left, gentle rim light around dark hair, calm romantic atmosphere.
Color palette: Warm ivory, pearl white, sakura pink, dusty rose, with restrained muted-berry accents and enough midtone detail to survive both light and dark translucent overlays.

Constraints: Pure wallpaper only. No readable text and no interface. One adult person only, natural hands, coherent perspective, continuous edge-to-edge background.
Avoid: screenshot, UI, UX, GUI, software window, browser, mockup, title bar, menu bar, sidebar, navigation, dashboard, panel, card, rounded rectangle, button, icon, badge, input box, composer, chat panel, code panel, terminal, cursor, device frame, poster layout, typography, letters, words, Chinese text, numbers, name, signature, logo, label, watermark, border, split screen, collage, polaroid, blank white panel, celebrity likeness, public figure likeness, private-person likeness, copyrighted character, child, underage appearance, duplicate person, duplicate face, extra limbs, extra hands, extra fingers, malformed hands, cropped face, cropped hands.
```

## 模板 A：无人物通用背景

下面是可改写模板。复制前必须把所有 `[REPLACE: ...]` 替换为具体内容；不要再额外粘贴上面的柔光玫瑰段落。

```text
Use case: stylized-concept
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one new standalone 2560×1440, 16:9 desktop wallpaper as edge-to-edge continuous artwork.
Input image contract:
- Image 1, if supplied, is a UI screenshot or effect mockup. Use it only for palette, lighting, atmosphere, focal placement, and broad composition. It is a visual reference, never an edit target.
- Image 2, if supplied, is a clean environment or material reference. Use it only for scenery, materials, color grading, depth, and lighting. Do not copy text, logos, characters, or a signature style.
- No identity image is used in this no-person prompt. Do not infer a person or character from either reference.
Reference handling: Generate a completely new image from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct every region hidden by the interface as the same continuous physical environment.
Scene/backdrop: [REPLACE: environment, season, architecture or landscape, materials, and mood]. Concentrate detailed structures, saturated accents, directional light, and small props between x=62%–88%. Continue the same environment through x=0%–52% using broad gradients, atmosphere, mist, sky, wall or paper texture, or soft foliage shadows. The left side must not look like an empty white rectangle or an artificial panel.
Style/medium: [REPLACE: cinematic environment, premium illustration, or photoreal editorial set].
Composition/framing: Keep the primary focal point near x=68%–76% and y=24%–55%. Keep every essential structure inside x=62%–88% and y=16%–72%, at least 8% from every edge. Use coherent perspective and one continuous scene with no vertical seam.
Materials/detail: [REPLACE: 3–6 concrete surfaces or materials and how they react to light].
Lighting/mood: [REPLACE: light direction, time of day, and mood].
Color palette: Controlled midtones, lifted shadow detail, restrained highlights, and subtle texture beneath either a light translucent wash or a dark translucent overlay.
Invariants: One physical environment, one perspective, continuous depth, no person, no interface, no readable text, no logo, and no watermark. Return only the opaque edge-to-edge wallpaper.
Avoid: screenshot, UI, software window, sidebar, navigation, dashboard, panel, card, rounded rectangle, button, icon, badge, input box, composer, code editor, terminal, cursor, device frame, poster layout, typography, letters, words, numbers, logo, signature, watermark, split screen, collage, blank white panel.
```

## 直接复制：用户确认已授权的成年身份参考

这是“参考图生成新背景”，不是修改参考人像原文件。只有当用户明确确认拥有必要权利时才使用 Image 3；否则不上传身份图，继续用上面的原创虚构人物版本。

```text
Use case: identity-preserve
Asset type: adaptive Codex desktop wallpaper
Primary request: Generate one new standalone 2560×1440, 16:9 desktop wallpaper. Place the adult subject from Image 3 naturally inside a newly generated continuous environment.
Input images:
- Image 1 is a UI screenshot or effect mockup used only for palette, lighting, atmosphere, subject placement, and broad composition. It is not an edit target.
- Image 2 is an optional clean style or environment reference used only for materials, scenery, color grading, depth of field, and lighting. Do not infer identity from Image 1 or Image 2.
- Image 3 is an adult identity reference supplied only after the user explicitly confirmed the necessary likeness and asset rights. Use Image 3 only for identity, adult age, facial proportions, hairstyle, body proportions, expression, and natural anatomy.
Reference handling: Generate from scratch. Do not erase UI from, clean up, trace, or reproduce Image 1. Rebuild all occluded areas as one continuous environment. Do not copy text, logos, UI, background composition, or unrelated styling from Image 3.
Subject: Preserve the Image 3 adult subject's facial identity, adult age, facial proportions, hairstyle, body proportions, expression, and natural anatomy consistently. Do not add another person.
Scene/backdrop: Create a luxurious pastel rose-garden studio with pink and ivory rose clusters concentrated around the right side, translucent blush curtains, soft-focus floral depth, sparse floating petals, pearlescent dust, tiny warm star-like glints, and restrained creamy bokeh. Continue the same environment naturally across the full canvas. Keep x=0%–52% calm, bright, low-contrast, and low-detail with a smooth warm-ivory-to-blush atmosphere, extremely faint watercolor leaves, and only a few sparse petals. Keep the bottom-left and center-left especially quiet.
Composition/framing: Keep all critical identity details within x=62%–88% and y=16%–72%; face y=20%–52%; hands y=30%–70%; at least 8% edge padding. One continuous scene, no split panel.
Style/medium: Premium Japanese romantic beauty editorial, polished photorealism, realistic skin texture, natural anatomy, delicate fabric micro-detail, shallow depth of field, no plastic CGI skin.
Capture context: Eye-level editorial portrait with a restrained 85 mm lens feel and a natural waist-up three-quarter framing; preserve realistic optical depth and avoid wide-angle facial distortion.
Materials/detail: Real rose petals with varied translucency, matte chiffon, soft faux-fur fibers, restrained crystal highlights, translucent curtain weave, and natural skin micro-texture.
Lighting/mood: High-key diffused beauty lighting, soft window glow from the upper left, a gentle rim light around dark hair, and matched skin, hair, fabric, and environmental shadows.
Color palette: Warm ivory, pearl white, sakura pink, dusty rose, with restrained muted-berry accents and enough midtone detail to survive both light and dark translucent overlays.
Constraints: Change the setting and styling only as requested. Preserve identity and adult appearance. Pure wallpaper only; no interface; no readable text; no logo; no watermark.
Avoid: identity drift, altered face, age regression, childish appearance, duplicate person, duplicate face, extra limbs, extra hands, extra fingers, malformed hands, cropped face, cropped hands, screenshot, UI, software window, sidebar, card, button, input box, composer, typography, signature, logo, watermark, copyrighted character.
```

## 模板 C：从效果图重新生成纯背景

效果图只作为视觉参考，不是 edit target。不要让模型“擦掉 UI”；它必须重新生成一张被 UI 遮住的连续场景。

```text
Use case: photorealistic-natural
Asset type: adaptive Codex desktop wallpaper generated from a UI reference
Input images: Image 1 is a UI screenshot used only for style, palette, lighting, atmosphere, subject placement, and broad composition. Image 2, if supplied, is a clean style or environment reference only. Image 3 may be used only in the separately authorized adult-identity workflow; otherwise it must be absent.
Primary request: Generate one completely new standalone 2560×1440, 16:9 wallpaper representing the continuous source artwork that could exist beneath Image 1's interface.
Reference use: Do not reproduce, trace, retain, clean up, or redesign any interface element from Image 1. Discard the entire software-window concept and reconstruct every occluded region as one natural continuous environment. Do not infer a real identity, copyrighted character, brand mascot, or artist signature style from Image 1 or Image 2.
Scene transfer: Preserve only the reference's broad environment category, visible physical materials, lighting direction, atmospheric depth, palette relationships, and approximate focal balance. Invent new scene detail for all occluded regions. Keep one coherent horizon, perspective, and lighting setup across x=0%–100%.
Composition/framing: Reserve x=0%–52% as calm low-contrast environment; natural transition x=45%–62%; keep critical subject details in x=62%–88% and y=16%–72%; face or primary object y=20%–52%; hands y=30%–70%; critical details at least 8% from all edges.
Style/lighting/palette: Match only the broad medium, color relationships, contrast hierarchy, light direction, and depth-of-field logic requested above; do not copy a living artist's signature style. Preserve usable midtones beneath both light and dark translucent overlays.
Invariants: One newly generated physical scene, one perspective, continuous depth, all critical details crop-safe, and no surviving pixels or geometry from the reference interface.
Output contract: Return only the new opaque edge-to-edge wallpaper. Not a cleaned screenshot, not a UI mockup, not a redesigned app, and not a poster. No readable text, logos, signatures, panels, cards, buttons, input boxes, or watermarks.
```

## 文案和小照片：现在不烘焙，支持后再独立叠加

姓名、签名、标题和“与 `[主题人物名]` 一起，用灵感创造无限可能”等文案不能烘焙进背景位图。当前只有 macOS 首页 `tagline` 属于可见文案字段；主题名用于两端的切换入口，其他文案字段尚未形成跨平台可见契约。需要这些内容时，应先实现对应 schema 与真实 UI 层，再由 UI 渲染；不要仅写入 `theme.json` 就假定会显示。

拍立得或小照片也不能画在 `background.jpg` 里。只有在对应 schema 和 renderer 真正实现以后，才将它作为主题包中的独立素材，并在确认照片与人物权利后，由 `theme.json` 的贴纸/装饰层引用和定位。当前运行时尚无该可见字段，所以现在应直接省略小照片，不要仅向 `theme.json` 写一个未识别字段，也不要为了视觉还原把它合并进背景。实现后，它才能在首页卡片、任务页输入框或窄窗口中单独隐藏。

## GPT Image 2 CLI 参数示例（不会自动执行）

下面是 [`gpt-image`](https://github.com/wuyoscar/gpt_image_2_skill) CLI 的参数对照，不是本项目的必需依赖。实际执行会读取 `OPENAI_API_KEY`、调用 OpenAI API 并可能产生费用；下面命令只作示例，本文档不会代为生图。

原创虚构人物流程（Image 1 + 可选 Image 2）：

```bash
gpt-image \
  --model gpt-image-2 \
  --size 2560x1440 \
  --quality high \
  --background opaque \
  --format png \
  --n 1 \
  --image ./references/image-1-ui.png \
  --image ./references/image-2-style.png \
  --prompt 'PASTE THE COMPLETE ORIGINAL-FICTIONAL-ADULT PROMPT HERE' \
  --file ./dream-skin-wallpaper.png
```

用户确认已授权的身份流程再追加第三个 `--image`，并把 `--prompt` 替换为上面“用户确认已授权”的完整 Prompt：

```bash
  --image ./references/image-3-authorized-adult.png
```

`--image` 的顺序就是 Prompt 中的 Image 1 / 2 / 3。省略可选图时要同步删除该行并重新编号。`gpt-image-2` 可接受符合约束的自定义尺寸，`2560x1440` 的两条边均为 16 的倍数。仍要在生成后检查实际文件像素，不要只信 Prompt 里的尺寸文字。

## 失败后怎么重试

每次只修一类问题，保留其他约束不变。如果生成器支持连续编辑，重试时仍要重申“纯背景、无 UI、安全区”这些不可变条件。

| 失败现象 | 重试方法 |
|---|---|
| 仍然生成侧栏、卡片或输入框 | 新建一次生成，不要继续“擦掉 UI”。把这句放到最开头：`Image 1 is a visual reference, never an edit target. Generate a new continuous source wallpaper from scratch and discard every interface element.` |
| 左右像两张图拼接 | 追加：`Continue the same physical environment, lighting, perspective, and atmospheric depth through x=0%–100%; no seam, no panel edge, no split-screen composition.` |
| 头、手或底部被裁 | 不要换成奇怪比例。要求把所有关键内容重新收进 `x=62%–88%` / `y=16%–72%`，脸 `y=20%–52%`，手 `y=30%–70%`，距边至少 `8%`。 |
| 左侧变成空白或死黑矩形 | 要求左侧继续真实环境的中间调、柔和材质和弱光影，但继续保持低信息、低局部对比。 |
| 出现文字、Logo、水印或假卡片 | 删除 Prompt 里所有需要显示的文案，重申 `no readable text, no typography, no logo, no watermark, no card, no polaroid`；文案和小照片只有在对应 schema / renderer 已实现时才作为独立 UI 素材，否则省略。 |
| 原创人物意外像某个真人 | 删除姓名、作品名和可识别标签，换成原创虚构成年人物，改变发型、脸型和服装组合后重新生成。 |
| 已授权身份发生漂移 | 确认实际 Image 编号，重申 Image 3 只提供身份和成年外观，减少与脸部冲突的风格词。若 API 拒绝，不绕过安全限制；改用原创虚构人物流程。 |
| 尺寸不是 `2560 × 1440` | 先检查生成器的真实 `size` 参数。不支持时使用最高质量 16:9 横图，等比裁切后再缩放到 `2560 × 1440`，不要拉伸。 |

## 验收清单（任何一项失败都不导入）

1. 生成器的实际尺寸参数和最终文件都是 `2560 × 1440`、16:9；文件为 PNG 或高质量 JPEG。
2. 输出是一张独立、连续、铺满画布的纯壁纸，不是清理后的截图、UI mockup、海报或拼图。
3. Image 1 只贡献氛围和大构图，Image 2 只贡献风格/环境；未走授权流程时没有使用 Image 3。
4. 左侧 `x=0%–52%` 安静但不是空白或死黑矩形；过渡区 `x=45%–62%` 没有分割缝。
5. 关键主体在 `x=62%–88%` / `y=16%–72%`，脸在 `y=20%–52%`，手在 `y=30%–70%`，所有关键内容距四边至少 `8%`。
6. 分别按 16:9、16:10、4:3 和超宽窗口预览 `cover` 裁切，脸、手、头顶和识别性道具仍完整。
7. 叠加浅色与暗色半透明蒙层后，左侧原生文字可读，右侧主体仍有层次，没有纯白烧穿或纯黑死区。
8. 没有窗口、侧栏、卡片、输入框、菜单、按钮、图标、光标、设备框、可读文字、Logo、签名或水印。
9. 人物明确成年，脸和手没有截断、重复或畸形；若使用身份参考，已由用户确认必要权利且实际编号与 Prompt 一致。
10. 姓名、标题、标语和小照片都不在背景位图内；仅在对应 schema / renderer 已实现时，才作为独立素材由 `theme.json` 与真实 UI 叠加，否则不显示。
11. 最终导入的是纯背景，不是 README 里的浅色/暗色实机截图。

需要按现有八张概念图逐张还原视觉方向时，再参考 [`background-generation-prompts.md`](./background-generation-prompts.md)。
