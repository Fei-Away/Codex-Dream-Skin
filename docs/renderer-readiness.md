# Shared Renderer Readiness

The Controller plan's B1 extraction puts the renderer verdict in
`runtime/renderer-readiness.mjs`. The sync tool generates identical copies in
both platform asset directories. Both injectors call that module after their
existing DOM and native-window probes; it has no DOM, CDP, filesystem or
process dependencies.

## Evidence And Verdict

The shared predicate requires the installed skin version, stylesheet, clean
business classes, visible document, usable viewport, native-window evidence,
complete route structure and absence of horizontal overflow. Expected theme
and revision are matched whenever the caller supplies them. Vertical scrolling
is allowed.

Ordinary routes require L1 with no missing required anchors and either a
visible shell/sidebar or registered generic main/input parts. A visible Home
may be ready before its optional composer or suggestion cards appear. L0 is
accepted only for settings with a visible settings control. Home must expose
its actual visible container and either a usable hero or generic main content;
any visible suggestion cards need readable labels.

The adapters map native observations to `ready`, `unsupported` or `not-ready`.
An unsupported Browser window API may use document evidence. An invalid
binding, minimized window or unrecognized transport failure remains not ready.
The existing per-platform CDP error classification and target binding calls
stay in the injectors.

## Normalized Differences

The previous predicates had different names and a few incomplete checks.
These decisions are explicit so later changes cannot silently choose one
platform's behavior:

| Observation | Shared rule |
| --- | --- |
| Windows `pass`/`unsupported`, macOS native `status` | Adapters map to the same three native states; original details are retained |
| Windows `settingsAnchor`, macOS `settings` | The Windows adapter supplies the canonical settings observation |
| macOS did not observe the Home container's box | Both probes now require a visible Home container, matching the existing Windows check |
| macOS only checked `visibilityState` | Both reject a document that explicitly reports `hidden`, even if other fields disagree |
| Windows viewport had only lower bounds | Both require finite dimensions from 320 x 240 through 65536 x 65536 |
| Missing overflow evidence could pass on macOS | Both require an explicit `x: false` observation |

These checks do not change selectors, platform discovery, CSS, launch,
cancellation, recovery, stored state, or the default user entry point.
`checks` on macOS and `readiness` on Windows retain their existing field names
and meanings. Windows still reports native binding separately from document
and viewport readiness; the final `pass` uses all three.

## Verification

`tools/renderer-readiness.test.mjs` applies the same fixtures to the canonical
module, both packaged copies and both injector adapters. It covers route
states, optional/late controls, hidden and invalid windows, viewport limits,
overflow, stale payloads, missing evidence and mutation-free evaluation.
Existing platform window/DOM and bounded-wait tests exercise the real probes
against isolated fixtures.

Resource lists and installer preflight include the new module. A source bundle
missing it must not replace a valid managed engine. CI verifies the macOS
application/DMG and Windows PowerShell 5.1/7 and Setup.exe paths. These checks
do not substitute for the separate native-client acceptance required before a
public Release.
