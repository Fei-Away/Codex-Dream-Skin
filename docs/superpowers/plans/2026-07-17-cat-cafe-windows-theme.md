# 一杯猫暖阳咖啡店 Windows Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bundled Windows light theme named `一杯猫 · 暖阳咖啡店` using the supplied 2912 × 1632 cat-cafe PNG and warm translucent surfaces.

**Architecture:** Extend the validated palette with optional surface colors, apply them as root CSS variables, and seed a second bundled saved theme without changing the current default. Reuse the existing theme store, injector, tray, pause, switch, and restore paths.

**Tech Stack:** PowerShell 5.1, Node.js ESM, browser JavaScript/CSS, JSON, PNG.

## Global Constraints

- Windows only; optimize for Codex light appearance.
- Preserve the source composition; do not generatively redraw it.
- Colors: `#FFE8B0`, `#9B6B52`, and accent `#E99A72`.
- Target warm-white opacity: sidebar 76%, cards 68%, raised/input surface 88%.
- Task routes reduce background prominence relative to home.
- Do not modify official binaries, WindowsApps, `app.asar`, API keys, Base URLs, or provider configuration.
- Keep CDP on `127.0.0.1`; add no runtime dependency.

---

### Task 1: Theme-specific surface palette

**Files:**
- Modify: `windows/scripts/injector.mjs`
- Modify: `windows/assets/renderer-inject.js`
- Modify: `windows/tests/run-tests.ps1`
- Modify: `windows/tests/renderer-inject.test.mjs`

**Interfaces:**
- Consumes: `palette.surface`, `palette.surfaceRaised`, and `palette.sidebar`.
- Produces: overrides for `--dream-surface`, `--dream-surface-raised`, and `--dream-sidebar`.

- [ ] **Step 1: Write failing injector tests**

Create a temporary theme in `run-tests.ps1` with these values and require `--check-payload` exit `0`; replace `surface` with `url(https://invalid.example)` and require non-zero:

```json
{"accent":"#E99A72","surface":"rgb(255 250 240 / .68)","surfaceRaised":"rgb(255 250 240 / .88)","sidebar":"rgb(255 250 240 / .76)"}
```

- [ ] **Step 2: Verify the test fails**

Run `powershell -NoProfile -ExecutionPolicy Bypass -File windows/tests/run-tests.ps1`.
Expected: FAIL because the extra palette fields are not preserved and validated.

- [ ] **Step 3: Implement palette validation and payload mapping**

In `loadTheme()` validate the exact supported keys:

```js
for (const key of ["accent", "surface", "surfaceRaised", "sidebar"]) {
  if (typeof palette[key] !== "string" || !palette[key].trim()) continue;
  const color = palette[key].trim();
  if (!/^(?:#[\da-f]{3,8}|(?:rgb|hsl|oklch|oklab)\([^;{}]{1,96}\))$/i.test(color)) {
    throw new Error(`palette.${key} is not a supported CSS color`);
  }
  theme.palette[key] = color;
}
```

Map all four values into the renderer configuration with the same camelCase names.

- [ ] **Step 4: Write failing renderer tests**

In `renderer-inject.test.mjs`, inject the palette above. Assert the three root properties equal their palette values, then assert cleanup removes them.

- [ ] **Step 5: Verify the renderer test fails**

Run `node windows/tests/renderer-inject.test.mjs`.
Expected: FAIL because the surface properties are not applied.

- [ ] **Step 6: Apply and clean up CSS variables**

Add the three properties to `ROOT_PROPERTIES`. In `applyProfile()` use:

```js
for (const [property, value] of [
  ["--dream-surface", config.surface],
  ["--dream-surface-raised", config.surfaceRaised],
  ["--dream-sidebar", config.sidebar],
]) {
  if (value) root.style.setProperty(property, value);
  else root.style.removeProperty(property);
}
```

- [ ] **Step 7: Verify and commit**

Run `node windows/tests/renderer-inject.test.mjs` and the full Windows test. Expect exit `0`. Commit:

```powershell
git add windows/scripts/injector.mjs windows/assets/renderer-inject.js windows/tests/run-tests.ps1 windows/tests/renderer-inject.test.mjs
git commit -m "feat(windows): support theme surface palette"
```

### Task 2: Cat-cafe preset and idempotent seeding

**Files:**
- Create: `windows/presets/preset-cat-cafe/theme.json`
- Create: `windows/presets/preset-cat-cafe/cat-cafe.png`
- Modify: `windows/scripts/theme-windows.ps1`
- Modify: `windows/tests/run-tests.ps1`

**Interfaces:**
- Consumes: `F:\广东传宏国际文化发展有限公司\产品\墨灵\一杯猫\电商\微信图片_20241114185826.png` during implementation.
- Produces: saved theme id `preset-cat-cafe`, light appearance, center focus/safe area, and ambient task mode.

- [ ] **Step 1: Write failing seed tests**

Change `run-tests.ps1` to expect two bundled themes. Find `preset-cat-cafe`; assert its name, `appearance = light`, `safeArea = center`, `taskMode = ambient`, accent `#E99A72`, and `.png` image. Update later saved-theme counts from 1→2 and 2→3.

- [ ] **Step 2: Verify the seed test fails**

Run the full Windows test. Expected: FAIL because `preset-cat-cafe` is absent.

- [ ] **Step 3: Create exact theme metadata**

```json
{
  "schemaVersion": 1,
  "id": "preset-cat-cafe",
  "name": "一杯猫 · 暖阳咖啡店",
  "image": "cat-cafe.png",
  "appearance": "light",
  "art": {"focusX": 0.5, "focusY": 0.5, "safeArea": "center", "taskMode": "ambient"},
  "palette": {
    "accent": "#E99A72",
    "surface": "rgb(255 250 240 / .68)",
    "surfaceRaised": "rgb(255 250 240 / .88)",
    "sidebar": "rgb(255 250 240 / .76)"
  }
}
```

- [ ] **Step 4: Copy and validate the artwork**

Copy the source byte-for-byte to `cat-cafe.png`. Require identical SHA-256 hashes and use the existing metadata helper to confirm PNG, 2912 × 1632, under 16 MB and 50 MP.

- [ ] **Step 5: Seed without replacing the default**

In `Initialize-DreamSkinThemeStore`, copy the new preset directory into `$paths.Saved\preset-cat-cafe` only when its `theme.json` is absent. Apply the existing no-reparse and image assertions before copying/following files. Do not modify `$paths.Active`; romantic rose remains first-run active.

- [ ] **Step 6: Verify idempotency and commit**

Run the full Windows test twice; both must exit `0` with exactly two bundled themes. Commit:

```powershell
git add windows/presets/preset-cat-cafe windows/scripts/theme-windows.ps1 windows/tests/run-tests.ps1
git commit -m "feat(windows): add cat cafe theme preset"
```

### Task 3: Documentation and final verification

**Files:**
- Modify: `windows/README.md`
- Modify: `windows/README.en.md`
- Modify: `windows/CHANGELOG.md`

**Interfaces:** Consumes the preset id/name from Task 2 and produces accurate Windows-only selection and rights guidance.

- [ ] **Step 1: Document the preset**

In both READMEs, state that fresh installs seed `桥本有菜` and `一杯猫 · 暖阳咖啡店`, that cat-cafe targets light appearance, and that public redistribution requires confirmed artwork rights. Do not claim macOS support.

- [ ] **Step 2: Update the changelog**

Add under the current unreleased heading:

```markdown
- Added the Windows light preset `一杯猫 · 暖阳咖啡店` with warm translucent surfaces and ambient task-page artwork.
```

- [ ] **Step 3: Run final automated verification**

```powershell
node --check windows/scripts/injector.mjs
node --check windows/assets/renderer-inject.js
node windows/tests/renderer-inject.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File windows/tests/run-tests.ps1
git diff --check
```

Expected: every command exits `0`; syntax checks and `git diff --check` are silent, and tests print their existing PASS summaries.

- [ ] **Step 4: Perform live verification when Codex is available**

Install/start from the working tree, select the cat-cafe preset in light appearance, and inspect home/task readability, switching, pause, and restore. If live CDP or Codex is unavailable, record it as unverified rather than claiming success.

- [ ] **Step 5: Commit and review scope**

```powershell
git add windows/README.md windows/README.en.md windows/CHANGELOG.md
git commit -m "docs(windows): document cat cafe preset"
git status --short
git log -4 --oneline
git diff HEAD~3 --stat
```

Expected: only the declared theme, tests, docs, specification, and plan files changed.
