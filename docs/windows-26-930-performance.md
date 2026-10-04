# Windows 26.930 adaptation and performance verification

The Windows follow-up to PR #423 keeps `runtime/`, macOS production code/assets, and author theme packages unchanged. Windows CSS is generated from the shared source through explicit Home and reduced-motion adapters, then the Windows shell rules. The macOS test runner now checks these platform outputs through the canonical generator instead of assuming CSS byte identity. This is an unreleased PR change, not a version bump.

## Changes

- Exclude the modern `group/home-composer-layout` from the legacy hero sizing chain. Verify now rejects a Home composer outside the viewport.
- Remove duplicate Windows menu painting and native inset gutters. Match the menu scrim to the main surface; square only the docked sidebar's two internal corners. Keep responsive/peeking sidebars unchanged.
- Blur the outer thread composer to prevent scrolled message text showing through it; preserve author colors and alpha.
- Offer a visible theme manager. Treat verified child completion as success, defer selected-theme writes until after restart consent, and roll back failures without overwriting newer changes. Recheck Browser ID before restarting a confirmed hidden session.
- Under Windows `prefers-reduced-motion: reduce`, replace the universal `transition-duration: .01ms` with `transition: none`. Preserve animation duration/completion behavior, scroll behavior and the normal-motion branch.

## Measured performance

Tested on official Windows Codex 26.930.3930.0, at 200% display scaling, a visible 1183 × 600 CSS-pixel viewport, and the `juzizhoutou` community theme. The test conversation contains a short Markdown table and JavaScript block. The OS reports reduced motion enabled.

Initial 6.5-second samples intermittently showed long style recalculations with the skin active. CSS rule ablation isolated the reduced-motion transition declaration: removing animation declarations or simplifying cached selector specificity did not provide the same improvement. A nonzero duration still creates transition work across the native tree when inherited styles change.

For a bounded diagnostic, mutate an otherwise unused inherited custom property on `document.documentElement`, force style resolution with `getComputedStyle(document.body).color`, and time it with `performance.now()`. Restore the property afterwards. Alternate original → fixed → fixed → original in the same page, four measurements per group:

| Declaration | Samples | Median | Range |
| --- | ---: | ---: | ---: |
| `transition-duration: .01ms !important` | 8 | 297.8 ms | 280.7–375.2 ms |
| `transition: none !important` | 8 | 77.0 ms | 64.0–86.9 ms |

This diagnostic decreased about 74%. It deliberately invalidates inherited styles and is **not** a claim that ordinary scrolling is 74% faster.

After the fix, two alternating-order rounds of 6.5-second idle and scripted scroll samples each recorded **zero long tasks** with the skin on and off. Skin-on rAF p95 was 16.7–16.8 ms, maximum 33.4 ms; renderer main-thread time was 0.237–0.255 s idle and 0.306–0.352 s scrolling. The scroll fixture had a 314 px range. rAF gaps are not actual dropped-frame counts, and renderer task time is not total CPU. Background app activity and this single machine limit generalization. Native mouse scrolling and unsent Chinese input were checked separately; synthetic scrolling is not native input evidence.

## Verification scope

The local portable Windows/tools Node suite, generated-asset sync and both platform payload checks pass. Native Windows observations cover the top seam, docked sidebar corners, scrolled content behind the composer, the test table/code, and unsent input. Local macOS shell-dependent Node cases cannot execute on Windows (`/bin/bash` and POSIX filesystem behavior); macOS validation belongs to CI. Full install/restart and final CI results are recorded in the PR rather than inferred from source-payload checks.

Private screenshots, raw timing samples, state/config files and temporary diagnostic scripts stay local. This report does not establish complete multi-theme, multi-DPI or multi-version coverage.
