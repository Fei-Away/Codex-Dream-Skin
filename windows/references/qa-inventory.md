# QA inventory

## User-visible claims

1. The home screen paints one UI-free wallpaper continuously across sidebar and main content, with a live native heading, the real project utility/composer surface, and any suggestion cards rendered by the current Codex host.
2. Sidebar, main area, header, and composer use coordinated readability layers; home remains expressive while normal task routes use a stronger quiet veil.
3. All real Codex controls remain interactive; the skin is not a screenshot overlay.
4. The skin survives route changes and renderer reloads while the injector daemon runs.
5. The official Store package and `app.asar` remain unchanged.
6. Restore removes the injected DOM/CSS and install/restore can be repeated.
7. Restore closes the saved CDP listener before reopening Codex normally.

## Functional checks

- Home feature card: click one card and confirm the real composer is populated or the normal action occurs.
- Project selector: click the real project chip under the "选择项目" label and confirm the native project menu opens.
- Sidebar: open a real task, then return to New Task.
- Task side panel: open and close the native thread panel twice, resize the window, and repeat; the toggle must remain visible and clickable.
- Composer: type text, verify caret/readability, then clear it without sending.
- Reload: use CDP `Page.reload`, wait, and confirm the injection marker returns.
- Pet overlay: open a desktop pet and confirm its auxiliary window stays transparent with no skin background or decoration layer behind it.
- Restore/reapply cycle: remove live skin, verify marker absent, apply again, verify marker present.
- Update resilience: resolve the current `OpenAI.Codex` Appx location dynamically for launch. A versioned path saved for cleanup must be revalidated against the registered package full/family identity before any process is stopped.
- Restart consent: an existing normal Codex window is never force-closed without explicit CLI authorization or shortcut confirmation.
- Shortcut policy: installed launch, restore, tray, and tray-child commands use `RemoteSigned` without `Bypass`; Internet-zone markers are removed only from hash-verified managed PowerShell copies.
- Config safety: Chinese project names, LF/CRLF choice, quoted target keys, table-header comments, and unrelated TOML sections survive install/selective restore; ambiguous target shapes fail unchanged, exact recovery keeps a copy of the replaced current file, and install refuses both registered and state-recorded old Codex processes.
- Theme safety: empty/over-16 MB images, over-16384px/50MP dimensions, path escapes, symlinks/junctions, malformed JSON, and unsupported formats are rejected before payload construction.
- Tray lifecycle: pause/resume reflects the clicked state, bundled Arina Hashimoto theme is present on first install, and complete restore terminates any separately launched tray before it can reapply the skin.

## Visual checks

- 1280x820 initial home: the declared focus stays in frame, the text-safe side remains readable, the real project utility row and composer form one coherent surface, and no horizontal scrolling appears.
- Narrower window: accept Codex's native responsive card reduction or omission; no essential control is covered and wallpaper cropping preserves the focus/safe-area contract.
- Normal task: the wallpaper is visibly quieter than home, messages keep high contrast, and composer does not overlap content.
- Inspect the sidebar, header, wallpaper edges, native card labels when present, project utility row, composer controls, scrollbar, dialogs, and menus.
- Reject black/transparent sidebar artifacts, clipped controls, duplicated/disconnected project labels, rasterized native controls, fake UI inside the wallpaper, weak contrast, or decorations intercepting clicks.

## Exploratory checks

- Start when the debug port is occupied: fail with a clear message or use a caller-selected port.
- Start after Codex updates: package discovery and injection still work without patching installed files.
- Tamper `state.json` with a reused PID: if the PID is still live but its identity differs, confirm cleanup fails closed and preserves `state.json`; if the PID is gone, confirm the stale record is replaced only after confirming no process is running, without stopping an unrelated process.
- Serve a fake `app://` CDP target or remote/mismatched WebSocket URL and confirm both launcher and injector reject it. Reuse the port with a new Browser ID and confirm the existing watcher exits without reconnecting.
- Force verification failure and confirm the injector, state file, and newly launched debug session are rolled back.
- Start two operations concurrently and confirm the second fails clearly without changing config, state, or processes.
- Close Codex without restore and confirm the Browser identity anchor closes and the watcher exits without reconnecting or rapidly growing logs.

## Automated checks

- `tests/run-tests.ps1`: strict UTF-8/no-BOM writes, UTF-16 rejection, LF/CRLF preservation, concurrent-write detection, exact backup/recovery, `[desktop]`-scoped restore, ambiguous TOML rejection, non-ASCII paths, Appx/state identity, argument quoting, theme seeding/import/save/switch/pause, byte/dimension limits, junction rejection, payload construction, Browser ID, loopback URL rejection, and renderer isolation for transparent auxiliary windows.
- `node --check` for the injector and renderer payload.
- Live Windows signoff remains required for Store process ownership, restart consent, screenshot, and CDP closure.
