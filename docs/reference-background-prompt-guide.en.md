# Codex Dream Skin Reference Image Prompts

This guide generates **wallpaper artwork only** for use beneath real Codex controls. The recommended master is `2560 × 1440`, 16:9. A screenshot, app mockup, sidebar, card, or composer is not a usable theme background.

Chinese guide: [`reference-background-prompt-guide.md`](./reference-background-prompt-guide.md)

> Public prompts default to an original fictional adult. They do not name or imitate a celebrity, private individual, copyrighted character, or living artist's signature style. Use an authorized identity reference only when you hold the necessary likeness and asset rights. Generated artwork is not an official OpenAI/Codex visual or endorsement.

## Current Tested Feature: Arina Hashimoto

- **Switchable theme:** `macos/presets/preset-arina-hashimoto/`; Windows seeds from `windows/assets/theme.json` plus the byte-identical `windows/assets/dream-reference.jpg`. Both installers seed Arina Hashimoto.
- **User-supplied pure source:** `docs/images/presets/arina-hashimoto-source.png` (`1672 × 941`). The preset's `2560 × 1440` JPEG is a standardized release derivative and does not create additional source detail.
- **Real runtime results:** `arina-hashimoto-light.jpg` and `arina-hashimoto-dark.jpg` are light/dark screenshots for preview only. They are not importable wallpapers.
- **Relationship to earlier examples:** this is the current tested preset, not `docs/images/gallery/skin-01.jpg` and not one of the skin-01–08 concept mockups. skin-01 contributes only a related pink-rose direction and UI-copy reference.

The user describes this material as an Arina Hashimoto reference version, and the maintainer explicitly directed that its source, switchable preset, and runtime previews be included in the repository. That records the intended reference and inclusion decision; it is not a likeness, generation, or redistribution license. `macos/NOTICE.md` excludes the listed files from the MIT software license, and users and downstream distributors must review the relevant rights independently. The public copy-ready prompt below still uses an original fictional adult.

## Separate Presets, Source Art, Screenshots, And Concepts

The “effect” shown in a README is not automatically an importable wallpaper. These paths have different jobs:

| Type | Repository path | What it is | A complete theme? |
|---|---|---|---|
| **Current featured preset** | `macos/presets/preset-arina-hashimoto/`; Windows seeds from `windows/assets/theme.json` plus the byte-identical `dream-reference.jpg` | A cross-platform theme pack containing a UI-free wallpaper; both installers seed Arina Hashimoto | **Yes** |
| **Pure source art** | `docs/images/presets/arina-hashimoto-source.png` | User-supplied source wallpaper around `1672 × 941`; no `theme.json` | **No**; it can be selected as an image, but is not a complete pack |
| **Real injected previews** | `docs/images/presets/arina-hashimoto-light.jpg`, `arina-hashimoto-dark.jpg` | Light/dark Codex screenshots containing real controls | **No** |
| **Concept gallery** | `docs/images/gallery/skin-01.jpg`–`skin-08.jpg` | UI effect mockups used only to communicate visual directions | **No** |
| **Experimental/history images** | `docs/images/banner-*.png`, `docs/images/generated-*.png` | Unapproved local experiments or references | **No**; do not ship without rights/provenance review |

`docs/images/hero-banner-red-white.png` and `macos/assets/portal-hero.png` are legacy 3:1 banner assets, not the current 16:9 universal-theme master. Do not substitute either for `preset-*/background.jpg` unless the output is intentionally homepage-banner-only.

Rule of thumb: **switch themes from `macos/presets/preset-*`; generate from this guide; study directions in `docs/images/gallery/`; inspect runtime results in `docs/images/presets/*-light.jpg` / `*-dark.jpg`.** A `theme.json` and a `background.jpg` in the same `preset-*` directory form a seedable theme; `docs/images/` is documentation/archive space, not a mirror of the theme library.

Path classification is not a likeness or redistribution license. The current `preset-arina-hashimoto` contains user-provided human/AI portrait material included at the maintainer's direction. Public repository inclusion neither grants nor proves likeness, generation, commercial-use, or further-redistribution rights; see `macos/NOTICE.md` for the file-level boundary.

Save new generations outside the repository while drafting and run the acceptance checklist at the end. Only after approval should you export the **pure wallpaper** as `background.jpg` beside its `theme.json` in a new `macos/presets/preset-<slug>/`. Do not place drafts, UI screenshots, or unverified human-likeness images in `docs/images/` and assume they become switchable themes.

## Copy From The skin-01 Concept: Render It In UI, Not In The Image Prompt

`docs/images/gallery/skin-01.jpg` is a concept effect image. It paints copy, sidebar data, and the small polaroid into one complete UI. The strings below are a **requirements reference** extracted from that image, not part of the wallpaper bitmap. Keep `no readable text` in the generation prompt and render these strings later as live UI or independent decoration; otherwise they will blur or crop when the window changes size.

| Concept location | Reference copy | Current recommendation |
|---|---|---|
| Top brand title | `桥本有菜专属定制皮肤` | Use only after likeness and redistribution rights are confirmed; the current runtime does not show this brand layer, so keep it as a future UI field |
| Top subtitle | `Codex App 限定版` | Not visible in the current runtime; do not bake it into `background.jpg` |
| Script signature | `Arina Hashimoto♡` | Independent signature layer; the base runtime has no generic signature field yet |
| Home title | `我们该构建什么？` | Keep the native Codex title; the current theme does not replace project, task, message, or primary-title data |
| Home subtitle | `与有菜一起，用灵感创造无限可能` | macOS can currently show it through `tagline`; Windows does not yet render theme copy |
| Composer placeholder | `随心输入，让灵感陪你一起写代码吧～` | Use only where product configuration explicitly permits a custom placeholder; never overwrite user input |
| Bottom-right polaroid copy | `一直陪伴，是最温暖的慰藉 ♥` | Caption for an independent sticker; the concept glyphs are low-resolution, so confirm the final copy before release |

This table does **not** claim that every field is implemented. Theme names are currently visible in the macOS menu-bar and Windows tray switchers; macOS shows `tagline` on the home route, while Windows does not yet render theme copy. Brand, subtitle, status, quote, signature, polaroid, and independently positioned decoration are outside the current visible runtime contract. Until corresponding schema and renderer support exists, omit those elements instead of flattening them into the background. If stickers are implemented later, keep each image as an independent `sticker-*.jpg` in the theme directory, render it through a pointer-events-free decoration layer, and hide or reposition it at homepage/task/narrow-window breakpoints. Do not treat it as a second background or let it cover the composer.

Names, likenesses, and this copy belong to a specific preset and should not be copied into the generic templates. Without the required rights, use an original fictional adult and remove names, work titles, and identifying terms.

## Fix The Role Of Each Reference

Use this order when all three references are supplied:

| Input | Role | Allowed use | Never do this |
|---|---|---|---|
| **Image 1** | UI screenshot or effect mockup | Palette, lighting, atmosphere, approximate subject placement, and broad composition | Do not edit, erase, trace, or retain its UI, text, or controls |
| **Image 2** | Optional clean style/environment reference | Materials, scenery, grading, depth of field, and lighting | Do not infer identity or copy text, logos, characters, or a signature style |
| **Image 3** | Optional adult identity reference | Identity consistency only, and only after the user explicitly confirms the necessary likeness and asset rights | Do not use it without that confirmation; do not take UI or background composition from it |

Image numbers follow the actual upload order. Generators and the CLI do not reserve a blank number for an omitted image. If Image 2 is omitted, the next uploaded reference becomes the actual Image 2 and the prompt must be renumbered. Never refer to an image that was not uploaded.

The safest first pass uses Image 1 only and generates an original fictional adult. This guide makes no rights claim about any specific person or asset.

Names of specific real people (for example, “Arina Hashimoto”) must not be put in a public default prompt to induce imitation. If you genuinely hold the necessary rights, use a clear adult identity image as Image 3 only in the local authorized workflow below; otherwise use the original-fictional-adult version.

## Set The Output Size

Prompt text cannot replace the generator's size control. Select `2560 × 1440` in the generator UI or API as well. If that exact size is unavailable, generate the highest-quality 16:9 landscape output, crop it to 16:9, and then resize it to `2560 × 1440`. Do not stretch a non-16:9 image.

Dream Skin uses `cover`, so 16:10, 4:3, and ultrawide windows crop some source pixels. For a right-side portrait, use this theme metadata:

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

`safeArea: "left"` reserves the left side for native content and prioritizes the right-side subject on narrower windows. Edge preservation takes priority over `focusX` in that mode.

| Zone | Recommended coordinates | Requirement |
|---|---:|---|
| Native-content safe zone | `x=0%–52%` | Continuous low-detail, low-local-contrast environment; no face, hands, dense flowers, or bright flare |
| Natural transition | `x=45%–62%` | Blend naturally into the focal area; no panel edge or split-screen seam |
| Critical subject zone | `x=62%–88%` | Keep the face, hands, hair ornaments, and identifying props here; nonessential decoration may reach `x=90%` |
| Vertical safe zone | `y=16%–72%` | Face `y=20%–52%`; hands `y=30%–70%`; the composer may cover lower content |
| Edge protection | at least `8%` | Do not place critical details against any edge |

Keep subtle midtone texture in the left zone so it remains usable beneath either a light or dark translucent layer. Reserve the strongest contrast and highest-frequency detail for the subject area.

Every complete prompt below follows the same order: **use/asset type → canvas and layout → reference contract → scene and one primary subject → capture/medium → materials → lighting → palette → invariants → targeted exclusions**. Keep that order when adapting a prompt. Concrete visible objects, materials, and light behavior are more useful than a stack of vague quality adjectives.

## Public Baseline: Copy-Ready Soft Rose With An Original Fictional Adult

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

## Custom Environment Template

Replace every `[REPLACE: ...]` field before generation. Do not append the full Soft Rose prompt as well.

```text
Use case: stylized-concept
Asset type: adaptive Codex desktop wallpaper
Primary request: Create one new standalone 2560×1440, 16:9 desktop wallpaper as edge-to-edge continuous artwork.
Input image contract:
- Image 1, if supplied, is a UI screenshot or effect mockup. Use it only for palette, lighting, atmosphere, focal placement, and broad composition. It is a visual reference, never an edit target.
- Image 2, if supplied, is a clean environment or material reference. Use it only for scenery, materials, color grading, depth, and lighting. Do not copy text, logos, characters, or a signature style.
- No identity image is used in this no-person prompt. Do not infer a person or character from either reference.
Reference handling: Generate a completely new image from scratch. Do not erase UI from, trace, clean up, or reproduce Image 1. Reconstruct every region hidden by the interface as the same continuous physical environment.
Scene/backdrop: [REPLACE: environment, season, architecture or landscape, materials, and mood]. Concentrate detail between x=62%–88%. Continue the same environment through x=0%–52% using broad gradients, atmosphere, mist, sky, wall or paper texture, or soft foliage shadows. The left must not look like an empty white rectangle or an interface panel.
Style/medium: [REPLACE: cinematic environment, premium illustration, or photoreal editorial set].
Composition/framing: Primary focal point x=68%–76%, y=24%–55%. Keep every essential structure within x=62%–88% and y=16%–72%, at least 8% from every edge. One continuous perspective, no vertical seam.
Materials/detail: [REPLACE: 3–6 concrete surfaces or materials and how they react to light].
Lighting/mood: [REPLACE: light direction, time of day, and mood].
Color palette: Controlled midtones, lifted shadows, restrained highlights, and subtle texture beneath light or dark translucent overlays.
Invariants: One physical environment, one perspective, continuous depth, no person, no interface, no readable text, no logo, and no watermark. Return only the opaque edge-to-edge wallpaper.
Avoid: screenshot, UI, software window, sidebar, navigation, dashboard, panel, card, rounded rectangle, button, icon, input box, composer, code editor, terminal, cursor, device frame, poster, typography, letters, words, numbers, logo, signature, watermark, split screen, collage, blank white panel.
```

## Copy-Ready User-Confirmed Authorized Adult Identity Reference

This generates a new image from references; it does not edit the original portrait. Use Image 3 only after the user explicitly confirms the necessary rights. Otherwise omit the identity image and use the original-fictional-adult prompt.

```text
Use case: identity-preserve
Asset type: adaptive Codex desktop wallpaper
Primary request: Generate one new standalone 2560×1440, 16:9 desktop wallpaper. Place the adult subject from Image 3 naturally inside a newly generated continuous environment.
Input images:
- Image 1 is a UI screenshot or effect mockup used only for palette, lighting, atmosphere, subject placement, and broad composition. It is not an edit target.
- Image 2 is an optional clean style or environment reference used only for materials, scenery, color grading, depth of field, and lighting. Do not infer identity from Image 1 or Image 2.
- Image 3 is an adult identity reference supplied only after the user explicitly confirmed the necessary likeness and asset rights. Use Image 3 only for identity, adult age, facial proportions, hairstyle, body proportions, expression, and natural anatomy.
Reference handling: Generate from scratch. Do not erase UI from, clean up, trace, or reproduce Image 1. Rebuild all occluded areas as one continuous environment. Do not copy text, logos, UI, background composition, or unrelated styling from Image 3.
Subject: Preserve the Image 3 adult subject's facial identity, adult age, facial proportions, hairstyle, body proportions, expression, and natural anatomy. Do not add another person.
Scene/backdrop: Create a luxurious pastel rose-garden studio with pink and ivory rose clusters concentrated around the right side, translucent blush curtains, soft-focus floral depth, sparse floating petals, pearlescent dust, tiny warm star-like glints, and restrained creamy bokeh. Continue the same environment naturally across the full canvas. Keep x=0%–52% calm, bright, low-contrast, and low-detail with a smooth warm-ivory-to-blush atmosphere, extremely faint watercolor leaves, and only a few sparse petals. Keep the bottom-left and center-left especially quiet.
Composition/framing: Keep all critical identity details within x=62%–88% and y=16%–72%; face y=20%–52%; hands y=30%–70%; at least 8% edge padding. One continuous scene, no split panel.
Style/medium: Premium Japanese romantic beauty editorial, polished photorealism, realistic skin texture, natural anatomy, delicate fabric micro-detail, shallow depth of field, no plastic CGI skin.
Capture context: Eye-level editorial portrait with a restrained 85 mm lens feel and a natural waist-up three-quarter framing; preserve realistic optical depth and avoid wide-angle facial distortion.
Materials/detail: Real rose petals with varied translucency, matte chiffon, soft faux-fur fibers, restrained crystal highlights, translucent curtain weave, and natural skin micro-texture.
Lighting/mood: High-key diffused beauty lighting, soft window glow from the upper left, a gentle rim light around dark hair, and matched skin, hair, fabric, and environmental shadows.
Color palette: Warm ivory, pearl white, sakura pink, dusty rose, with restrained muted-berry accents and enough midtone detail to survive both light and dark translucent overlays.
Constraints: Preserve identity and adult appearance. Pure wallpaper only; no interface; no readable text; no logo; no watermark.
Avoid: identity drift, altered face, age regression, childish appearance, duplicate person, duplicate face, extra limbs, extra hands, extra fingers, malformed hands, cropped face, cropped hands, screenshot, UI, software window, sidebar, card, button, input box, composer, typography, signature, logo, watermark, copyrighted character.
```

## Regenerate From A UI Reference

Treat the screenshot as a reference, never as an edit target:

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

## Keep Copy And Small Photos Out Of The Bitmap Until Overlay Support Exists

Do not bake names, signatures, titles, or copy such as “Create without limits with `[subject name]`” into the bitmap. Today, only the macOS home `tagline` is a visible copy field; theme names appear in both platforms' switching controls, and the remaining copy fields do not yet have a cross-platform visible contract. Implement the relevant schema and real UI layer before relying on those fields; merely adding them to `theme.json` does not make them visible.

Do not bake a polaroid or small photo into `background.jpg` either. Only after the corresponding schema and renderer capability is implemented should it become a separate theme asset and, after confirming the necessary photo and likeness rights, be positioned by a `theme.json` sticker/decoration layer. The current runtime has no such visible field, so omit the photo today: do not add an unrecognized field to `theme.json`, and do not merge the photo into the wallpaper. Once implemented, the independent layer can be hidden around native cards, the composer, and narrow layouts.

## GPT Image 2 CLI Example

This optional example does not run automatically. Executing it reads `OPENAI_API_KEY`, calls the OpenAI API, and may incur charges. `--image` order defines Image 1 / 2 / 3.

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

For the user-confirmed authorized workflow, append `--image ./references/image-3-authorized-adult.png` and use the complete authorized prompt above. Remove omitted inputs and renumber the prompt to match.

## Retry And Acceptance

- If UI survives, start a new generation with: `Image 1 is a visual reference, never an edit target. Generate a new continuous source wallpaper from scratch and discard every interface element.`
- If a seam appears, require one physical environment, lighting setup, perspective, and atmospheric depth across `x=0%–100%`.
- If the head, hands, or bottom crop, move all critical details back into `x=62%–88%` / `y=16%–72%`; face `y=20%–52%`; hands `y=30%–70%`; edge padding at least `8%`.
- If identity drifts, verify actual image numbering and restate that Image 3 supplies identity only. Do not bypass an API refusal; use the original fictional workflow.

Reject the asset unless the file is actually `2560 × 1440`, contains one continuous edge-to-edge wallpaper with no UI or readable text, preserves every crop-safe coordinate above, survives `cover` previews at 16:9 / 16:10 / 4:3 / ultrawide, remains readable beneath light and dark overlays, and keeps all copy and small-photo assets outside the bitmap.

Before import, preview the image with `cover` at 16:9, 16:10, 4:3, and ultrawide ratios; verify both light and dark overlays; confirm that the face, hands, and critical props remain intact; and import the wallpaper, never a README preview screenshot.

For prompts matching the eight concept-gallery directions, see [`background-generation-prompts.md`](./background-generation-prompts.md).
