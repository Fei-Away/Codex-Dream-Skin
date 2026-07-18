# Codex Dream Skin 纯背景生图提示词

本文按 `docs/images/gallery/skin-01.jpg` ～ `skin-08.jpg` 的视觉方向，拆解为可直接生成的**纯背景图**提示词。

图库原图是带 Codex 界面的效果预览，不能直接作为主题素材。本文提示词只生成铺满画布的背景艺术，不生成窗口、侧栏、卡片、输入框或任何文字。

如果你只需要一份与画廊无关、可直接复制的无人物/人物/参考图编辑模板，请优先使用独立的 [`reference-background-prompt-guide.md`](./reference-background-prompt-guide.md)。

## 先看实际预设：它和下面的概念图不是一回事

本文件从 `docs/images/gallery/skin-01.jpg` ～ `skin-08.jpg` 拆的是**概念方向**，不是仓库当前置顶的实机预设。先按下面的路径判断你手里的文件是什么：

| 你要做的事 | 应看的文件 | 说明 |
|---|---|---|
| 直接切换当前置顶主题 | `macos/presets/preset-arina-hashimoto/theme.json` + `background.jpg`；Windows 对应 `windows/assets/theme.json` + `dream-reference.jpg` | 两端都播种「桥本有菜」；不是 `docs/images/presets/*-light/dark` 截图 |
| 重新生成一张纯背景 | 本文件的通用模板或 [`reference-background-prompt-guide.md`](./reference-background-prompt-guide.md) | 输出应是独立的 `2560 × 1440`、16:9 图片，不是截图 |
| 只看效果或找风格 | `docs/images/gallery/skin-01.jpg` ～ `skin-08.jpg` | 带 UI 的概念效果图，不能改名为 `background.jpg` 后导入 |
| 查看当前主题在浅/暗色下的实机结果 | `docs/images/presets/arina-hashimoto-light.jpg`、`arina-hashimoto-dark.jpg` | 仅预览，包含真实控件，不能作为背景素材 |

特别注意：`skin-01` 的粉色玫瑰方向与 `preset-arina-hashimoto` 有相近气质，但**不是同一文件、同一尺寸或同一资产**。`skin-01`～`skin-08` 只提供灵感；实际预设以 `macos/presets/preset-*` 目录中的 `theme.json` + `background.jpg` 为准。任何 `banner-*.png` / `generated-*.png` 实验图也不自动获得预设或发行资格；真人肖像和模型输出必须先完成权利核验。

另外，`docs/images/hero-banner-red-white.png` 与 `macos/assets/portal-hero.png` 是旧的 3:1 首页横幅资源，不是这份文档推荐的 16:9 通用背景母版。

生成草稿建议先放在仓库外；通过统一检查后，才将纯背景导出为 `background.jpg`，和 `theme.json` 一起组成新的 `macos/presets/preset-<slug>/`。`docs/images/` 只保存文档图和预览，不是运行时主题目录。

## 建议参数

- 母版画布：推荐 `2560 × 1440`（16:9）。提示词不能替代生成器尺寸设置，必须在生成器界面或 API 中同时选择该尺寸；导入脚本可能按需缩到最长边 2400。
- 首页专用导出：只在明确不用于任务页时，另裁一份 `3072 × 1024`（3:1）横幅。不要把 3:1 当作通用母版，也不要把带 UI 的效果截图反推成背景。
- 质量：高；写实人物建议使用最高人物细节档。
- 格式：PNG 母版；导入主题前转换为高质量 JPEG，最终文件不超过 16 MB。
- 构图：左侧 `x=0%～52%` 为低信息安全区；主视觉中心放在 `x=68%～76%`，脸、手和识别性道具控制在 `x=62%～88%`，非关键装饰最多延伸到 `x=90%`；任何关键内容距四边至少 8%。
- 垂直安全：脸部/核心物体建议落在 `y=20%～52%`，手和次要主体落在 `y=30%～70%`，全部关键内容控制在 `y=16%～72%`；顶部与底部只放能自然延展的环境，避免超宽窗口裁切或底部输入框遮挡后断头、断手。
- 浅/暗兼容：安全区要有连续、低频、低对比的明暗变化，避免纯白烧穿或纯黑死区；同一张图在浅色壳上能承载深色文字，在暗色壳叠加遮罩后仍保留层次。
- 参考图：可把对应 `skin-XX.jpg` 作为风格参考，但必须保留提示词里的“纯背景、无 UI”硬约束。
- 肖像：通用模板默认生成**原创虚构成年人物**。只有在你拥有肖像与素材使用权时，才上传清晰成年身份参考图；不得用姓名诱导模型模仿未授权真人。所有 Image 编号以实际上传顺序为准；省略可选图时，必须同步删掉对应句子并重新编号。

## 专业通用模板（优先使用）

把花括号变量替换成你的方向；没有授权人物参考时保留“original fictional adult”默认值。这份结构先锁画布与区域，再分开参考职责、可见场景、材质、光线和色板，最后重申不可变条件。不要只复制负面词，正向场景描述才决定成图。

```text
USE CASE: {photorealistic-natural / stylized-concept}
ASSET TYPE: Adaptive desktop wallpaper for Codex
PRIMARY REQUEST: Create one standalone desktop wallpaper, exactly 2560×1440 pixels, 16:9 landscape, opaque, edge-to-edge continuous artwork. This is the source background that will sit underneath a real Codex interface, not an application screenshot, not a UI concept, and not a poster.

COMPOSITION: Reserve x=0%–52% as a calm text-safe zone with low visual information, low local contrast, and continuous natural texture. Place the visual subject center at x=68%–76%; keep the face, hands, and all identity-critical details within x=62%–88%, with nonessential decoration extending no farther than x=90%. Keep all critical vertical details within y=16%–72%, place the face or primary focal object within y=20%–52%, hands and secondary focal details within y=30%–70%, and keep every essential detail at least 8% away from every canvas edge. The left safe zone must contain no face, hands, dense flowers, sharp architecture, bright flare, or hard edge.

INPUT IMAGE CONTRACT:
- Image 1, if supplied, is the skin-XX UI concept screenshot. Use it only for palette, lighting, atmosphere, approximate focal placement, and broad composition. It is a visual reference, never an edit target.
- Image 2, if supplied, is a clean environment or material reference. Use it only for scenery, physical materials, color grading, depth of field, and lighting. Do not copy text, logos, branded elements, characters, or a signature style.
- Image 3, if supplied, must be a clearly adult identity reference used only after the user confirms the necessary likeness and asset rights. Use it only for identity and natural adult proportions. If it is absent, use one original fictional adult and do not infer identity from Image 1 or Image 2.
REFERENCE HANDLING: Generate a completely new image from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct every occluded region as the same continuous physical environment. Image numbers always follow actual upload order; renumber this contract when an optional image is omitted.

SCENE: {describe 5–12 visible environment objects, wardrobe, props, season, and atmosphere}. Concentrate detail, saturated accents, and directional lighting around the right-side subject. Rebuild the left side as one believable continuation of the same scene, never as an empty rectangle or artificial panel.

SUBJECT AND RIGHTS: Show one original fictional adult {woman/man/person/character} by default. If and only if an authorized Image 3 is supplied, preserve that adult subject's identity and natural proportions. Do not imitate any other named public figure, celebrity, private person, copyrighted character, brand mascot, or living artist's signature style.

CAPTURE OR MEDIUM: {one dominant camera/lens context for photorealism, or one bounded illustration/production medium}. Use one coherent perspective and depth treatment.

MATERIALS: {name 3–6 concrete materials or surfaces and describe how they absorb, scatter, or reflect light}.

LIGHTING AND MOOD: {light direction, softness, time of day, rim/fill behavior, and emotional tone}.

COLOR PALETTE: {4–6 named colors}; keep the strongest contrast and highest-frequency detail around the right-side focal area.

LIGHT/DARK COMPATIBILITY: Use broad tonal separation and a controlled midtone range. Avoid featureless pure white and crushed pure black in the left safe zone. Preserve subtle texture after either a light translucent wash or a dark translucent overlay. Keep the focal subject distinct without relying on UI-like borders.

INVARIANTS: One continuous physical scene across x=0%–100%, one perspective, one primary subject at most, all critical content inside the crop-safe coordinates, natural anatomy, no vertical seam, and no surviving UI geometry or pixels from any reference. Output only the final opaque wallpaper.

AVOID: screenshot, UI, software window, sidebar, panel, card, rounded rectangle, button, icon, input box, composer, code editor, cursor, device frame, poster layout, readable text, typography, name, signature, logo, watermark, split screen, collage, polaroid, blank white panel, duplicate person, extra limbs, malformed hands, cropped face, cropped hands.
```

通用负面词（支持 negative prompt 的生成器直接粘贴）：

```text
UI, UX, GUI, application interface, software window, desktop screenshot, browser, mockup, title bar, traffic-light controls, menu bar, sidebar, navigation, dashboard, panel, card, rounded rectangle, button, icon, badge, input box, composer, chat box, code editor, terminal, status bar, cursor, device frame, poster layout, typography, letters, words, Chinese text, numbers, logo, signature, label, watermark, border, split screen, collage, polaroid, blank white panel, fake interface, child, underage, celebrity likeness, public figure likeness, copyrighted character, duplicate person, extra limbs, extra fingers, malformed hands, cropped face, cropped hands
```

### 浅色 / 暗色方向补充句

通用模板已经要求双外观兼容。如果想控制主题气质，可在正向提示词末尾追加其一：

```text
LIGHT-LEANING VERSION: Use warm ivory or pale neutral atmosphere with enough fine texture and midtone definition to remain visible beneath a light shell. Keep the left safe zone bright but never blank white; reserve darker accents for the right-side subject.
```

```text
DARK-LEANING VERSION: Use charcoal, midnight blue, deep brown, or muted jewel-tone atmosphere with lifted shadow detail. Keep the left safe zone calm but never crushed black; reserve the brightest highlights for the right-side subject and avoid glare behind interface text.
```

## 概念效果图方向对照

| 图片 | 可复用的视觉方向 |
|---|---|
| `skin-01` | 原创成年女性，粉色玫瑰美妆主题；有授权时才上传成年身份参考图 |
| `skin-02` | 中国传统财神 Q 版程序员形象 |
| `skin-03` | 无特定人物，红白未来城市与巨型能量球体 |
| `skin-04` | 原创成年男性，清透鼠尾草时尚主题；有授权时使用参考占位 |
| `skin-05` | 无特定真人，ENFP 灵感型动漫少年 |
| `skin-06` | 原创成年女性，蓝紫星夜美妆主题；有授权时使用参考占位 |
| `skin-07` | 原创成年虚拟歌姬，青蓝未来舞台主题 |
| `skin-08` | 原创成年男性，舞台黑金主题；有授权时使用参考占位 |

这些方向只拆视觉语言，不主张任何人物或角色身份。精确人物版必须使用你有权使用的清晰成年肖像参考图；未取得肖像权、角色权或素材授权的成图不应提交为仓库内置预设或公开再分发。

## 生成时的统一检查

成图必须同时满足以下条件：

1. 生成器实际尺寸参数与最终文件都是 `2560 × 1440`、16:9；不是拉伸非 16:9 图片得到的假比例。
2. 输出是从边缘铺满到边缘的新壁纸，不是擦除 UI 后的截图、应用 mockup、海报或拼图。
3. 左侧 `x=0%–52%` 能叠加 Codex 原生标题和正文，没有脸、手、密集花朵或强光斑，但也不是空白/死黑矩形。
4. 同一环境、透视、地平线、光线和空气透视要自然连续到 `x=0%–100%`；`x=45%–62%` 没有垂直分割缝。
5. 按 16:9、16:10、4:3 与超宽窗口分别做 `cover` 预览后，脸、手、头顶、麦克风或其他识别性道具仍完整，底部 composer 不遮住关键内容。
6. 分别叠加浅色与暗色半透明蒙层后，左侧原生文字可读，右侧主体仍有层次，没有纯白烧穿或纯黑死区。
7. 画面里没有任何可读文字、姓名、签名、品牌、徽章、标签、Logo 或水印。
8. 画面里没有窗口边框、菜单栏、侧栏、卡片、按钮、图标、输入框、聊天/代码面板、鼠标指针、设备外框或伪装界面的圆角矩形。
9. 人物明确成年，自然且没有重复/多余/畸形的脸、手指或肢体；走授权身份流程时，实际上传编号与 Prompt 完全一致。

---

## skin-01｜粉系玫瑰人物主题

视觉拆解：高调柔光、奶油白与樱花粉、玫瑰、花瓣、珠光闪点、薄纱与柔软皮草质感；人物居右，左侧是可叠字的梦幻浅粉留白。

```text
Use case: photorealistic-natural
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one standalone 2560×1440, 16:9 desktop wallpaper as opaque, edge-to-edge continuous artwork. Generate only the underlying romantic rose environment that will sit beneath the real interface.
Input image contract: Image 1, if supplied, is the skin-01 UI concept screenshot and contributes only palette, lighting, atmosphere, approximate subject placement, and broad composition; it is never an edit target. Image 2, if supplied, is a clean floral/environment reference and contributes only materials, floral language, color grading, depth, and lighting. Image 3, if supplied, is a clearly adult identity reference used only after the user confirms the necessary likeness and asset rights; otherwise generate one original fictional adult and do not infer identity from Image 1 or Image 2.
Reference handling: Generate a completely new image from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct all occluded areas as one continuous rose-garden studio with no retained text, controls, or interface geometry.

Scene and subject: show one original fictional adult woman in a romantic beauty-editorial portrait, placed entirely in the right 35% of the canvas. Give her balanced delicate facial proportions, expressive eyes, long glossy black twin ponytails, airy bangs, soft natural pink makeup, and a gentle confident expression. She wears delicate white fluffy hair ornaments, a blush-pink chiffon dress with translucent ruffled sleeves, subtle crystal embroidery, and a small white faux-fur shoulder wrap. Her hands form one elegant natural pose near her collarbone. If an authorized Image 3 is supplied, preserve only that adult subject's identity, adult age, facial proportions, hairstyle, body proportions, expression, and natural anatomy; do not add a second person.

Environment: a luxurious pastel rose garden studio with clusters of pink and ivory roses concentrated on the far right and lower-right edge, translucent blush curtains, soft-focus floral layers, floating rose petals, pearlescent dust, tiny warm star-like glints, and creamy circular bokeh. Keep the left 55% as a smooth cream-to-blush atmospheric gradient with only a few extremely faint watercolor leaves and sparse petals. The left side must remain calm, bright, low-contrast, and readable under dark interface text. Keep the bottom-left and center-left especially clean.

Composition and crop safety: reserve x=0%–52% as the low-information native-content zone and blend naturally through x=45%–62%. Keep the complete face, hands, hair ornaments, and essential clothing within x=62%–88% and y=16%–72%; face y=20%–52%; hands y=30%–70%; all critical detail at least 8% from every edge. Keep nonessential flowers and curtain detail within x=56%–90%. One scene, no vertical seam.

Capture and finish: eye-level beauty-editorial portrait with a restrained 85 mm lens feel and natural waist-up three-quarter framing, shallow optical depth, realistic skin texture, natural anatomy, polished photorealism without plastic CGI skin.

Materials: varied translucent rose petals, matte chiffon, soft faux-fur fibers, restrained crystal highlights, fine curtain weave, pearlescent dust, and natural skin micro-texture.

Lighting and palette: high-key diffused beauty lighting, soft window glow from the upper left, gentle rim light around dark hair, calm romantic atmosphere. Palette: warm ivory, pearl white, sakura pink, dusty rose, restrained muted-berry accents, with enough midtone detail to survive both light and dark translucent overlays.

Invariants: one newly generated physical scene across x=0%–100%, one adult subject only, coherent lighting and perspective, natural hands, crop-safe face and hands, no surviving UI pixels or geometry. Return only the opaque wallpaper.
Avoid: screenshot, UI, software window, sidebar, card, button, icon, input box, chat panel, code panel, device frame, poster, readable text, letters, name, signature, logo, watermark, split screen, collage, polaroid, blank white panel, celebrity or private-person likeness without authorized Image 3, copyrighted character, child or underage appearance, duplicate person, extra limbs, malformed hands, cropped face, cropped hands.
```

## skin-02｜财神打工主题

视觉拆解：奶油宣纸底、春节红金、祥云、元宝、金币、幽默的财神程序员；右侧信息丰富，左侧温暖干净。

```text
Use case: stylized-concept
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one standalone 2560×1440, 16:9 desktop wallpaper as opaque, edge-to-edge continuous artwork.
Input image contract: Image 1, if supplied, is the skin-02 UI concept screenshot and contributes only palette, lighting, atmosphere, focal placement, and broad composition; it is never an edit target. Image 2, if supplied, is a clean environment/material reference only. No identity image is used for this original mascot scene.
Reference handling: Generate from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct all occluded regions as the same continuous illustrated environment and retain no text or interface geometry.

Scene and subject: on the right 38% of the canvas, show one original cheerful, clearly middle-aged God-of-Wealth-inspired programmer mascot with compact stylized proportions, seated at a warm wooden desk. He wears an ornate traditional red ceremonial robe and rounded red-and-gold hat with jade accents, has a friendly mustache and short beard, playful dark sunglasses, holds a plain takeaway drink in one hand and gives a thumbs-up with the other. A dark laptop with a completely blank lid sits on the desk. Surround the desk with a few gold ingots, floating ancient coins, a red envelope, one abacus, neatly stacked blank books, and small celebratory ornaments. Any monitor or book surface must be blank with no writing, charts, symbols, or logos.

Environment and composition: warm ivory rice-paper background with delicate gold fiber texture. Use stylized auspicious clouds, curved cloud ribbons, tiny gold sparkles, and a few floating coins to lead the eye toward the right-side character. Keep x=0%–52% low-detail, using only very faint cloud line art and a soft warm cream gradient. Do not place any character, desk, coin cluster, or high-contrast decoration in the left text-safe zone.

Composition and crop safety: keep the complete character, both hands, desk silhouette, and essential props within x=62%–88% and y=16%–72%; focal face y=20%–52%; hands y=30%–70%; all essential detail at least 8% from every edge. Blend naturally through x=45%–62%; no vertical seam.

Medium and materials: refined contemporary Chinese New Year commercial illustration, hand-painted gouache with clean digital linework, subtle rice-paper grain, red lacquer, brushed gold, warm wood, matte ceramic cup, and jade accents.

Lighting and palette: warm morning side light, soft dimensional shading, premium but humorous rather than juvenile. Palette: ivory, antique gold, cinnabar red, dark brown, restrained jade green, with usable midtones under light or dark overlays.

Invariants: one continuous illustrated scene, one original adult mascot, coherent perspective and light, natural readable hand poses, and no surviving UI pixels or geometry. Return only the opaque wallpaper.
Avoid: screenshot, UI, software window, sidebar, card, button, icon, input field, dashboard, chart, speech bubble, white rounded panel, readable text, Chinese characters, numbers, label, logo, watermark, Codex mark, duplicate character, duplicate limbs, malformed hands, cropped face, cropped hands.
```

## skin-03｜红白未来城市主题

视觉拆解：极简白色留白、珊瑚红天穹、巨型发光球体、垂直能量光柱、未来城市与镜面广场；无近景人物，适合作为直接背景。

```text
Use case: cinematic-environment
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one standalone 2560×1440, 16:9 desktop wallpaper as opaque, edge-to-edge continuous cinematic environment artwork.
Input image contract: Image 1, if supplied, is the skin-03 UI concept screenshot and contributes only palette, lighting, atmosphere, focal placement, and broad composition; it is never an edit target. Image 2, if supplied, is a clean architecture/material reference only. No portrait or identity reference is used.
Reference handling: Generate from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct every occluded region as the same physical city and sky, with no retained text, controls, or interface geometry.

Composition: preserve the left 48% as luminous white and very pale blush negative space with a smooth atmospheric fade. Build the main futuristic city from the center-right to the far right. A colossal translucent coral-red energy sphere rises above the horizon, its lower half intersecting a sleek white city. A razor-thin vertical beam of white-red light descends through the center of the sphere into a distant portal structure. Long reflective white promenades and fine red light paths converge toward the portal. Add elegant blade-like towers, soft clouds inside and behind the sphere, a few small hovering ring-shaped craft, and tiny distant human silhouettes only near the horizon to establish scale.

Visual treatment: optimistic clean science fiction, monumental and serene rather than dystopian, pearlescent white architecture, translucent glass dome, fine luminous network lines across the sphere, misty volumetric atmosphere, glossy reflections, soft sunrise bloom, subtle star particles. The transition into the left text-safe area must be gradual, quiet, and almost white. Keep all strong red structures and the energy beam to the right of center.

Composition and crop safety: reserve x=0%–52% as the low-information native-content zone and blend naturally through x=45%–62%. Keep the horizon focal point, sphere center, portal, and essential structures within x=62%–88% and y=16%–72%, at least 8% from every edge. One horizon and perspective, no vertical seam.

Medium and materials: premium cinematic concept art with photoreal environment rendering; pearlescent composite architecture, translucent structural glass, polished stone promenades, fine emissive paths, suspended mist, and physically coherent reflections.

Lighting and palette: brilliant white sunrise daylight mixed with coral-red glow, pale rose mist, soft rim highlights, high dynamic range but gentle contrast on the left. Palette: pearl white, coral red, pale blush, cool silver, small charcoal accents; no gritty cyberpunk clutter.

Invariants: one continuous physical environment across x=0%–100%, one horizon, coherent light and reflection direction, no foreground portrait, all critical geometry crop-safe, and no surviving UI pixels or geometry. Return only the opaque wallpaper.
Avoid: screenshot, UI, software window, sidebar, card, button, icon, input field, chat panel, rounded interface rectangle, device frame, poster, readable text, giant typography, OpenAI or Codex logo, watermark, split screen, dark border, gritty cyberpunk clutter.
```

## skin-04｜清透鼠尾草人物主题

视觉拆解：奶油白、灰绿色、亚麻纸感、植物枝叶、折纸鹤、纤细星光；人物是温柔自然的浅色男士杂志肖像。

```text
Use case: photorealistic-natural
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one standalone 2560×1440, 16:9 desktop wallpaper as opaque, edge-to-edge continuous artwork.
Input image contract: Image 1, if supplied, is the skin-04 UI concept screenshot and contributes only palette, lighting, atmosphere, approximate subject placement, and broad composition; it is never an edit target. Image 2, if supplied, is a clean botanical/environment reference only. Image 3, if supplied, is a clearly adult identity reference used only after the user confirms the necessary likeness and asset rights; otherwise generate one original fictional adult and infer no identity from Image 1 or Image 2.
Reference handling: Generate from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct every occluded region as one continuous cream studio and retain no text or interface geometry.

Scene and subject: show one original fictional adult man in a quiet fashion-editorial portrait, positioned in the right 34% of the canvas. Give him balanced natural facial proportions, softly tousled short black hair, clean styling, calm eye contact, and a relaxed pose with one hand lightly supporting the side of his face. He wears a pale sage-gray knitted cardigan over a simple warm-white shirt. If an authorized Image 3 is supplied, preserve only that adult subject's identity, adult age, facial proportions, hairstyle, body proportions, expression, and natural anatomy; do not add a second person.

Environment: an airy cream studio with subtle handmade paper and linen texture. Place translucent olive and eucalyptus leaves around the far right and lower-right edges, with two or three extremely delicate botanical shadows. Add one small folded-paper crane near the right edge, a few thin hand-drawn star glints, faint stitched curves, and sparse pale-gold dust. Keep the left 58% as warm ivory negative space with a barely visible sage wash and only one faint botanical silhouette near the outer edge. Avoid dense decoration behind the future title area.

Composition and crop safety: reserve x=0%–52% as the low-information native-content zone and blend naturally through x=45%–62%. Keep the complete face, supporting hand, hair, and essential clothing within x=62%–88% and y=16%–72%; face y=20%–52%; hand y=30%–70%; all critical detail at least 8% from every edge. One continuous studio, no vertical seam.

Capture and finish: eye-level lifestyle portrait with a restrained 85 mm lens feel, natural waist-up framing, shallow optical depth, realistic skin and knit detail, gentle analog film grain, clean Korean/Japanese lifestyle editorial.

Materials: hand-made paper fiber, washed linen, matte knit wool, translucent eucalyptus and olive leaves, folded warm-white paper, and sparse pale-gold dust.

Lighting and palette: diffuse overcast window light, soft natural shadows, low saturation, calm and refined. Palette: warm ivory, parchment, pale sage, moss gray, muted champagne gold, with enough midtone texture for light and dark overlays.

Invariants: one newly generated continuous studio, one adult subject only, natural anatomy and hand pose, coherent light and depth, all critical details crop-safe, and no surviving UI pixels or geometry. Return only the opaque wallpaper.
Avoid: screenshot, UI, software window, sidebar, card, button, icon, badge, input box, white rounded rectangle, readable text, handwriting, name, signature, stamp, label, logo, watermark, polaroid, ticket, celebrity or private-person likeness without authorized Image 3, child or underage appearance, duplicate person, extra limbs, malformed hands, cropped face, cropped hand.
```

## skin-05｜彩色灵感小宇宙主题

视觉拆解：米白手账纸、青绿/黄色/珊瑚色、热血动漫少年、贴纸感涂鸦、闪电、星星、彩带和自由笔触；欢乐、有行动感。

```text
Use case: stylized-concept
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one standalone 2560×1440, 16:9 desktop wallpaper as opaque, edge-to-edge continuous artwork.
Input image contract: Image 1, if supplied, is the skin-05 UI concept screenshot and contributes only palette, lighting, atmosphere, approximate subject placement, and broad composition; it is never an edit target. Image 2, if supplied, is a clean paper/collage material reference only. No identity reference is used; the character must remain original.
Reference handling: Generate from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct every occluded region as the same continuous sketchbook scene and retain no text or interface geometry.

Scene and subject: an original adult anime-style young man occupies the right 36% of the canvas. He has messy dark-brown hair with a few colorful clips, bright expressive eyes, a wide optimistic smile, and a dynamic foreshortened pose reaching one open hand toward the viewer. He wears an oversized color-block streetwear jacket in turquoise, teal, sunflower yellow, coral, and white, decorated only with abstract patches such as a small smiley face, star, flower, and geometric shapes. Do not use any letters, words, numbers, brand marks, or recognizable character costume.

Environment and composition: warm cream sketchbook-paper background with subtle fibers. Around the right-side character, add lively hand-drawn doodles, curved marker strokes, confetti, stars, lightning bolts, tiny hearts, paint swashes, paper-tape fragments, and playful geometric stickers. Use turquoise, lemon yellow, coral red, sky blue, and small lavender accents. Keep the left 52% open and low-density: a light cream-to-pale-yellow wash with only a few thin teal arcs and tiny distant confetti marks. Preserve a clean area through the center-left and bottom-left for interface content.

Composition and crop safety: reserve x=0%–52% as the low-information native-content zone and blend naturally through x=45%–62%. Keep the complete face, reaching hand, silhouette, and essential costume detail within x=62%–88% and y=16%–72%; face y=20%–52%; reaching hand y=30%–70%; all critical detail at least 8% from every edge. One continuous paper surface, no vertical seam.

Medium and materials: premium original anime key visual mixed with editorial notebook collage, crisp expressive line art, soft cel shading, warm fibrous sketchbook paper, translucent marker strokes, matte gouache swashes, torn paper tape, and flat geometric stickers.

Lighting and palette: bright diffused daylight with subtle paper shadows and a clean silhouette; joyful and energetic without becoming juvenile or chaotic. Palette: turquoise, deep teal, sunflower yellow, coral, sky blue, warm cream, tiny lavender accents, with usable midtones beneath light or dark overlays.

Invariants: one continuous illustration, one original clearly adult character only, coherent foreshortening, one natural reaching hand, all critical details crop-safe, and no surviving UI pixels or geometry. Return only the opaque wallpaper.
Avoid: screenshot, UI, software window, sidebar, card, button, icon, input field, dashboard, speech bubble, white rounded panel, readable text, letters, ENFP label, numbers, name tag, logo, watermark, copyrighted character, child or underage appearance, duplicate person, extra limbs, malformed hand, cropped face, cropped hand.
```

## skin-06｜蓝紫星夜人物主题

视觉拆解：高饱和蓝紫星空、粉色与青色辉光、蝴蝶、心形光环、闪钻粒子；人物是华丽夜景美妆肖像，放在右侧。

```text
Use case: photorealistic-stylized
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one standalone 2560×1440, 16:9 desktop wallpaper as opaque, edge-to-edge continuous artwork.
Input image contract: Image 1, if supplied, is the skin-06 UI concept screenshot and contributes only palette, lighting, atmosphere, approximate subject placement, and broad composition; it is never an edit target. Image 2, if supplied, is a clean cosmic-stage/environment reference only. Image 3, if supplied, is a clearly adult identity reference used only after the user confirms the necessary likeness and asset rights; otherwise generate one original fictional adult and infer no identity from Image 1 or Image 2.
Reference handling: Generate from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct every occluded region as one continuous cosmic stage and retain no text or interface geometry.

Scene and subject: show one original fictional adult woman in a glamorous evening beauty portrait, positioned in the right 34% of the canvas. Give her balanced elegant facial proportions, long flowing dark hair, refined luminous makeup, dangling crystal earrings, and a poised expression while one hand rests lightly near her cheek. She wears a tasteful lavender-violet evening dress with subtle crystal detail. If an authorized Image 3 is supplied, preserve only that adult subject's identity, adult age, facial proportions, hairstyle, body proportions, expression, and natural anatomy; do not add a second person.

Environment: a dreamy cosmic stage made of deep cobalt, electric blue, violet, magenta, and cyan aurora gradients. Add layered star fields, fine glitter trails, iridescent butterflies, a few translucent heart-shaped light rings, soft nebula haze, tiny diamond glints, and violet-blue bokeh. Concentrate the most detailed butterflies, light rings, and sparkles around the subject and far-right edge. Keep the left 54% as a smooth blue-to-violet atmospheric gradient with sparse small stars and a subtle soft glow, leaving a calm readable text-safe area.

Composition and crop safety: reserve x=0%–52% as the low-information native-content zone and blend naturally through x=45%–62%. Keep the complete face, near-cheek hand, hair, and essential dress detail within x=62%–88% and y=16%–72%; face y=20%–52%; hand y=30%–70%; all critical detail at least 8% from every edge. One continuous stage, no vertical seam.

Capture and finish: eye-level evening beauty portrait with a restrained 85 mm lens feel, natural waist-up framing, shallow optical depth, realistic skin and hair detail, photoreal subject integrated naturally into a stylized cosmic environment.

Materials: glossy dark hair, faceted crystal earrings, matte-lustre evening fabric, translucent butterfly wings, fine suspended glitter, soft nebula haze, and restrained glass-like light rings.

Lighting and palette: soft beauty key light on the face, cinematic blue and magenta rim light, realistic crystal reflections, vivid but controlled contrast. Palette: deep cobalt, electric blue, violet, magenta, cyan, restrained pearl highlights, with lifted shadow detail under dark overlays.

Invariants: one newly generated continuous stage, one adult subject only, natural anatomy and hand pose, coherent light and depth, all critical details crop-safe, and no surviving UI pixels or geometry. Return only the opaque wallpaper.
Avoid: screenshot, UI, software window, sidebar, card, button, icon, input field, chat panel, white rounded rectangle, readable text, handwriting, person name, signature, badge, logo, watermark, polaroid, celebrity or private-person likeness without authorized Image 3, child or underage appearance, duplicate person, extra limbs, malformed hands, cropped face, cropped hand.
```

## skin-07｜青蓝虚拟歌姬主题

视觉拆解：青蓝不对称发型的原创虚拟歌姬、薄荷青/天蓝/珊瑚/粉紫渐变、音乐波形、星星、心形和全息丝带；轻盈甜美的未来舞台感。

```text
Use case: stylized-concept
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one standalone 2560×1440, 16:9 desktop wallpaper as opaque, edge-to-edge continuous artwork.
Input image contract: Image 1, if supplied, is the skin-07 UI concept screenshot and contributes only palette, lighting, atmosphere, approximate subject placement, and broad composition; it is never an edit target. Image 2, if supplied, is a clean stage/holographic-material reference only. No identity reference is used; the singer must remain an original fictional adult design.
Reference handling: Generate from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct every occluded region as the same continuous digital stage and retain no text or interface geometry.

Scene and subject: show one original fictional adult virtual singer in a polished premium anime key visual, placed in the right 36% of the canvas. Give her a distinctive asymmetrical seafoam-to-cobalt hairstyle with one long braided side ponytail and one shorter curled side tail, luminous violet-teal eyes, and a sculptural ear-cuff microphone rather than a recognizable franchise headset. Use a joyful performance pose with one hand near the ear-cuff. She wears an original pearl-white, seafoam, coral, plum, and charcoal stage costume with translucent holographic fabric and crystalline accessories; no necktie, serial number, or iconic costume motif. Keep the character design consistent and original; do not imitate a copyrighted character or place a name, number, brand, or readable mark inside the image.

Environment and composition: a luminous pastel digital stage with soft cyan, sky blue, lavender, pink, and pearl-white gradients. Add flowing holographic ribbons, abstract music waveforms with no notes or text, tiny five-point stars, translucent hearts, equalizer-like light particles, soft lens flares, and floating crystal confetti. Concentrate saturated detail behind and around the right-side singer. Keep the left 54% calm and airy with a pale aqua-to-white glow, a faint horizontal waveform, and only sparse tiny star dust. Preserve low contrast in the center-left and bottom-left.

Composition and crop safety: reserve x=0%–52% as the low-information native-content zone and blend naturally through x=45%–62%. Keep the complete face, near-ear hand, hair silhouette, and essential costume detail within x=62%–88% and y=16%–72%; face y=20%–52%; hand y=30%–70%; all critical detail at least 8% from every edge. One continuous stage, no vertical seam.

Medium and materials: premium original anime key visual, crisp linework, soft cel shading blended with pearlescent 3D light, luminous hair strands, translucent holographic fabric, iridescent ribbons, faceted crystal accessories, and weightless confetti.

Lighting and palette: pastel concert glow with soft cyan key light, lavender-pink rim light, restrained lens flare, clear silhouette, cheerful futuristic atmosphere. Palette: seafoam, sky blue, pearl white, coral, lavender, plum, small charcoal accents, with enough midtone definition beneath light or dark overlays.

Invariants: one continuous illustration, one original clearly adult virtual singer only, coherent costume and hair design, natural hand pose, all critical details crop-safe, and no surviving UI pixels or geometry. Return only the opaque wallpaper.
Avoid: screenshot, UI, software window, sidebar, card, button, icon, input field, dashboard, white rounded panel, readable text, letters, numbers, character name, serial mark, branding, signature, logo, watermark, recognizable copyrighted character, iconic franchise costume or headset, child or underage appearance, duplicate person, extra limbs, malformed hands, cropped face, cropped hand.
```

## skin-08｜舞台黑金人物主题

视觉拆解：近黑舞台、暖金轮廓光、黑色礼服男歌手、复古麦克风、茉莉花、星点和细密声波粒子；克制、成熟、电影感。

```text
Use case: photorealistic-cinematic
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one standalone 2560×1440, 16:9 desktop wallpaper as opaque, edge-to-edge continuous artwork.
Input image contract: Image 1, if supplied, is the skin-08 UI concept screenshot and contributes only palette, lighting, atmosphere, approximate subject placement, and broad composition; it is never an edit target. Image 2, if supplied, is a clean stage/material reference only. Image 3, if supplied, is a clearly adult identity reference used only after the user confirms the necessary likeness and asset rights; otherwise generate one original fictional adult and infer no identity from Image 1 or Image 2.
Reference handling: Generate from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct every occluded region as one continuous concert stage and retain no text or interface geometry.

Scene and subject: show one original fictional adult man in a cinematic fashion portrait, positioned in the right 34% of the canvas. Give him balanced refined facial proportions, softly tousled black hair, natural styling, a calm confident gaze, and a relaxed seated pose with one hand near his chin. He wears a tailored black velvet and satin suit with extremely subtle gold embroidery and an open-collar ivory silk shirt. If an authorized Image 3 is supplied, preserve only that adult subject's identity, adult age, facial proportions, hairstyle, body proportions, expression, and natural anatomy; do not add a second person.

Environment: an intimate dark concert stage with near-black lacquered surfaces, deep espresso shadows, warm out-of-focus spotlights, thin gold rim lights, and a vintage metallic microphone placed near the far-right foreground. Add a few white jasmine flowers and dark green leaves along the right and lower-right edge, tiny champagne-gold star specks, a delicate horizontal sound-wave made only of abstract glowing particles, and subtle red-brown reflections. Keep the left 56% as a calm near-black-to-charcoal gradient with faint warm haze and very sparse gold dust. Do not place the face, microphone, flowers, or bright lights in the left text-safe zone.

Composition and crop safety: reserve x=0%–52% as the low-information native-content zone and blend naturally through x=45%–62%. Keep the complete face, near-chin hand, microphone, and essential clothing within x=62%–88% and y=16%–72%; face y=20%–52%; hand y=30%–70%; all critical detail at least 8% from every edge. One continuous stage, no vertical seam.

Capture and finish: eye-level cinematic concert portrait with a restrained 85 mm lens feel, natural waist-up seated framing, shallow optical depth, realistic skin and hair, elegant premium editorial finish.

Materials: black velvet, satin lapels, ivory silk, aged brushed microphone metal, near-black lacquer, soft jasmine petals, dark leaves, and suspended champagne-gold dust.

Lighting and palette: low-key soft warm key light, thin gold edge light on black fabric and hair, subtle red-brown reflections, rich shadows without crushing detail. Palette: near-black, charcoal, espresso, champagne gold, ivory, restrained oxblood accents.

Invariants: one newly generated continuous stage, one adult subject only, natural anatomy and hand pose, coherent light and depth, all critical details crop-safe, and no surviving UI pixels or geometry. Return only the opaque wallpaper.
Avoid: screenshot, UI, software window, sidebar, card, button, icon, input field, chat panel, white rounded rectangle, readable text, handwriting, person name, signature, badge, logo, watermark, polaroid, celebrity or private-person likeness without authorized Image 3, child or underage appearance, duplicate person, extra limbs, malformed hands, cropped face, cropped hand.
```

## 参考图模式补充句

如果生成器总是照着效果图复制 UI，把下面这段放到提示词最开头，并提高指令权重：

```text
Use the supplied screenshot only to infer palette, subject styling, lighting, atmosphere, and broad composition. Do not reproduce, trace, imitate, or retain any interface element from the screenshot. Remove the entire app window and rebuild the occluded regions as one continuous natural background scene. The output is the source wallpaper that would exist underneath the interface, not a cleaned screenshot and not a redesigned interface.
```

如果生成器支持负面提示词，可额外使用：

```text
UI, UX, app interface, software window, desktop screenshot, mockup, title bar, menu bar, sidebar, navigation, dashboard, panel, card, rounded rectangle, button, icon, badge, input box, chat box, code editor, status bar, cursor, device frame, poster layout, typography, letters, words, Chinese text, numbers, logo, signature, label, watermark, border
```

## 当前仓库已有的纯背景

- 用户提供的「桥本有菜」byte-identical 源图：`docs/images/presets/arina-hashimoto-source.png`（`1672 × 941` PNG）
- macOS 实测精选可切换背景：`macos/presets/preset-arina-hashimoto/background.jpg`（由上述源 PNG 派生为 `2560 × 1440` JPEG；标准化尺寸不代表增加源图细节）
- 对应浅/暗真实截图：`docs/images/presets/arina-hashimoto-light.jpg`、`arina-hashimoto-dark.jpg`（仅预览，禁止当背景导入）
- 红白未来城市纯背景：`docs/images/hero-banner-red-white.png`（`2168 × 725`、约 3:1，仅适合首页横幅）
- 红白未来城市运行时副本：`macos/assets/portal-hero.png`（同为 3:1，不是通用 16:9 母版）

其余 `docs/images/gallery/skin-XX.jpg` 都是效果预览，不应直接导入主题。用户提供的 AI 示例不代表 OpenAI/Codex 官方视觉或背书；公开再分发前请确认肖像、模型输出和素材权利。
