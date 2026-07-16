# Design QA — Dongge three-theme pack 1.3.0

Date: 2026-07-16  
Viewport: 1280×820  
Final result: passed

## Visual targets

- Wittgenstein marginalia mock: `/Users/ronnie/.codex/generated_images/019f6963-6e53-7592-80c4-aec54a5b1e39/exec-acc0e3f0-c67c-4db7-92aa-f671e38cc621.png`
- dbskill blueprint mock: `/Users/ronnie/.codex/generated_images/019f6963-6e53-7592-80c4-aec54a5b1e39/exec-f97e104a-82bb-4568-9506-1415bad0411b.png`
- Psychological-problem placard mock: `/Users/ronnie/.codex/generated_images/019f6963-6e53-7592-80c4-aec54a5b1e39/exec-cab3cc76-8f52-4f6f-84cd-26eeefdb3a16.png`

## Live captures

- Marginalia: `/Users/ronnie/Library/Application Support/CodexDreamSkinStudio/audit/18-marginalia-home.png`
- Blueprint: `/Users/ronnie/Library/Application Support/CodexDreamSkinStudio/audit/19-blueprint-home.png`
- Placard: `/Users/ronnie/Library/Application Support/CodexDreamSkinStudio/audit/20-placard-home.png`

## Comparison

All three implementations preserve the selected target hierarchy: one restrained rounded hero, right-side Dongge portrait, left-side native title space, four numbered native suggestion cards, project selector, and native composer. The live build intentionally keeps Codex's real sidebar and current project/task names rather than reproducing fake mock data.

- Marginalia keeps warm paper, language/use/context whiteboard notes, and editorial brick-red accents.
- Blueprint switches the accent system to cobalt blue and keeps the open-source whiteboard flow readable without sci-fi decoration.
- Placard retains the accurate `心理问题` physical sign and the strongest red editorial identity without becoming a short-video poster.

## Blocking checks

- P0: none.
- P1: none.
- P2: none.
- Four real suggestion cards visible and clickable in home state.
- Project selector and composer remain native and visible.
- No horizontal or vertical document overflow at 1280×820.
- Decorative chrome reports `pointer-events: none`.
- Runtime verification reports version `1.3.0` and `pass: true` for all three themes.
- Engine remains intact under Application Support and is not renamed to `scripts.DISABLED`.

## P3 follow-up

- Native suggestion copy varies by Codex release and user locale; the theme does not replace those labels.
- Windows payloads pass static validation on macOS; final Windows screenshot QA still requires a Windows host.
