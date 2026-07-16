# QA inventory

## User-visible claims

1. The home screen visibly matches the selected Dongge reference: a warm paper-toned whiteboard hero, right-side portrait, `心理问题 / 试试就知道 / dbskill` treatment, native suggestion cards, and skinned native composer.
2. The sidebar uses the warm off-white, charcoal, and restrained brick-red theme rather than merely changing the accent color.
3. All real Codex controls remain interactive; the skin is not a screenshot overlay.
4. The skin survives route changes and renderer reloads while the injector daemon runs.
5. The official Store package and `app.asar` remain unchanged.
6. Restore removes the injected DOM/CSS and install/restore can be repeated.

## Functional checks

- Home feature card: click one card and confirm the real composer is populated or the normal action occurs.
- Project selector: click the real project chip under the "选择项目" label and confirm the native project menu opens.
- Sidebar: open a real task, then return to New Task.
- Composer: type text, verify caret/readability, then clear it without sending.
- Reload: use CDP `Page.reload`, wait, and confirm the injection marker returns.
- Restore/reapply cycle: remove live skin, verify marker absent, apply again, verify marker present.
- Update resilience: resolve the current `OpenAI.Codex` Appx location dynamically; never store a versioned WindowsApps path.

## Visual checks

- 1280x820 initial home: hero, four native cards, real project selector, and composer are all visible without horizontal scrolling.
- Narrower window: accept Codex's native responsive reduction to two or three suggestion cards; no essential control or the subject's face is covered.
- Normal task: messages remain readable and composer does not overlap content.
- Inspect the sidebar, header, hero crop, card labels, composer controls, scrollbar, top status, and quote.
- Reject black/transparent sidebar artifacts, clipped cards, duplicated/disconnected project labels, rasterized native controls, weak contrast, or decorations intercepting clicks.

## Exploratory checks

- Start when the debug port is occupied: fail with a clear message or use a caller-selected port.
- Start after Codex updates: package discovery and injection still work without patching installed files.
