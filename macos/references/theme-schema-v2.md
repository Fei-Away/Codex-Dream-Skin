# Theme schema v2

`theme.json` files may declare `schemaVersion: 2` and provide a semantic
design-token tree under `tokens`. The runtime keeps accepting schema v1
themes unchanged; v1 files are never rewritten and render exactly as before.

## Structure

```json
{
  "schemaVersion": 2,
  "id": "my-theme",
  "name": "My Theme",
  "image": "background.png",
  "appearance": "auto",
  "art": { "safeArea": "auto", "taskMode": "auto" },
  "tokens": {
    "shared": {
      "typography": {},
      "shape": {},
      "layout": {},
      "motion": {},
      "blur": {}
    },
    "dark": { "color": {}, "effect": {} },
    "light": { "color": {}, "effect": {} }
  }
}
```

`tokens` is a partial override: any omitted token falls back to a default
expression that resolves against the adaptive core variables (`--ds-bg`,
`--ds-accent-rgb`, …), so partial v2 themes stay coherent with the image
analysis engine, `appearance`, and `art.*` composition controls, which all
keep working for v2 themes.

## Token groups

- `typography`: UI, display, monospace and quote font stacks; sizes, weights,
  line height and letter spacing, plus sidebar item/selected weights and the
  sidebar section and brand type scale.
- `shape`: radii and border/focus widths for the shell, hero, cards,
  messages, composer, controls and popovers.
- `layout`: content width, hero geometry, Home lead height, card direction,
  spacing and icon geometry, composer width, and sidebar density (row height,
  radius, padding, gaps, icon size and header height).
- `motion`: transition durations, easing, hover lift and decoration timing.
- `blur`: content, composer and popover backdrop blur.
- `color`: canvas, sidebar (including selected-item text), header, surfaces,
  code blocks, text, accent states, cards, messages, composer, controls,
  project selector, hero, popovers, tooltips, selection, scrollbars, status
  colors and decorative elements.
- `effect`: per-mode canvas/decoration/chrome/composer-marker/task-media
  opacity, shadows, media text shadow and accent glow.

## Runtime model

The injector normalizes every theme (v1 or v2) with `buildThemeTokens()` and
exposes the values as `--ds-<group>-<token>` CSS variables, for example:

```text
tokens.light.color.messageUser  -> --ds-color-message-user
tokens.dark.effect.cardShadow   -> --ds-effect-card-shadow
tokens.shared.shape.cardRadius  -> --ds-shape-card-radius
```

The semantic stylesheet layer only activates for themes whose source file
declares `schemaVersion: 2` (the renderer sets `data-dream-tokens="2"`), so
existing v1 presets and custom themes are pixel-identical to previous
releases. Explicit v2 color tokens for the ten core roles (canvas, surface,
surfaceElevated, accent, cardIcon, accentSecondary, accentTertiary, text,
textMuted, divider) also steer the matching legacy `--ds-*` variable and its
derived `-rgb` channels, keeping every selector coherent.

## Safety and compatibility

- Colors must be hex, `rgb(a)`, `hsl(a)`, or `transparent`.
- Other token values allow only a conservative CSS-value character set
  (including `var()`/`calc()`/`clamp()` and `rgb(<r g b> / a)`) and reject
  declaration separators, braces, markup, backticks, and backslashes.
- Theme images must remain inside their theme directory and use PNG, JPEG,
  or WebP.
- Schema v1 `colors` values are additionally mapped to the closest v2
  semantic roles at load time so the semantic variables stay coherent; the
  original file is not rewritten.
