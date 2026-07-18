// Semantic theme tokens (schema v2). A v2 theme.json provides a partial
// "tokens" object; every omitted token falls back to a default expression that
// matches the shipped stylesheet exactly, so schema v1 themes and partial v2
// themes render identically to the current visuals. Defaults may reference the
// core adaptive variables (--ds-bg, --ds-accent-rgb, ...); explicit overrides
// from theme authors must be literal CSS colors or conservative CSS values.
export const THEME_SCHEMA_VERSION = 2;

export const DEFAULT_THEME_TOKENS = {
  shared: {
    typography: {
      uiFont: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei UI", "Segoe UI", system-ui, sans-serif',
      displayFont: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei UI", "Segoe UI", system-ui, sans-serif',
      monoFont: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
      quoteFont: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif',
      bodySize: "14px",
      smallSize: "13px",
      titleSize: "clamp(19px, 1.85vw, 27px)",
      labelSize: "12px",
      bodyLineHeight: "1.5",
      headingWeight: "760",
      labelWeight: "720",
      letterSpacing: "0",
      sidebarItemWeight: "445",
      sidebarSelectedWeight: "600",
      sidebarSectionSize: "12px",
      sidebarBrandSize: "19px",
      sidebarBrandWeight: "800",
    },
    shape: {
      sidebarRadius: "0 16px 16px 0",
      mainRadius: "16px 0 0 0",
      heroRadius: "22px",
      cardRadius: "18px",
      composerRadius: "22px",
      messageRadius: "16px",
      popoverRadius: "14px",
      controlRadius: "10px",
      pillRadius: "999px",
      avatarRadius: "50%",
      borderWidth: "1px",
      focusWidth: "2px",
    },
    layout: {
      contentMaxWidth: "1180px",
      heroHeight: "clamp(248px, 31cqw, 376px)",
      heroInset: "44px",
      heroTextWidth: "min(46%, 520px)",
      heroTextPadding: "0 38px",
      homeLeadHeight: "440px",
      cardMinHeight: "118px",
      cardPadding: "14px 13px 12px",
      cardGap: "10px",
      cardIconSize: "38px",
      cardGlyphSize: "21px",
      cardDirection: "column",
      cardAlign: "stretch",
      cardTextAlign: "center",
      cardCopyAlign: "center",
      cardIconMargin: "0 auto",
      composerMaxWidth: "100%",
      selectedIndicatorWidth: "3px",
      sidebarRowHeight: "36px",
      sidebarRowRadius: "10px",
      sidebarRowPaddingX: "8px",
      sidebarRowGap: "8px",
      sidebarListGap: "1px",
      sidebarIconSize: "16px",
      sidebarHeaderHeight: "52px",
    },
    motion: {
      fast: "160ms",
      normal: "180ms",
      slow: "260ms",
      easing: "cubic-bezier(.22, 1, .36, 1)",
      hoverLift: "-2px",
      decorationDuration: "4.6s",
    },
    blur: {
      content: "14px",
      composer: "16px",
      popover: "12px",
    },
  },
  dark: {
    color: {
      canvas: "var(--ds-bg)",
      canvasAlt: "var(--ds-bg)",
      canvasPatternPrimary: "transparent",
      canvasPatternSecondary: "transparent",
      sidebar: "rgb(var(--ds-panel-rgb) / .98)",
      sidebarAlt: "rgb(var(--ds-bg-rgb) / .96)",
      sidebarBorder: "var(--ds-line)",
      sidebarText: "var(--ds-text)",
      sidebarMuted: "rgb(var(--ds-muted-rgb) / .92)",
      sidebarIcon: "rgb(var(--ds-muted-rgb) / .96)",
      sidebarHover: "rgb(var(--ds-accent-rgb) / .09)",
      sidebarSelected: "rgb(var(--ds-accent-rgb) / .12)",
      sidebarSelectedBorder: "rgb(var(--ds-accent-rgb) / .22)",
      sidebarSelectedText: "var(--ds-text)",
      main: "var(--ds-bg)",
      mainAlt: "var(--ds-bg)",
      mainBorder: "var(--ds-line)",
      header: "rgb(var(--ds-panel-rgb) / .90)",
      headerAlt: "rgb(var(--ds-panel-rgb) / .90)",
      headerBorder: "var(--ds-line)",
      text: "var(--ds-text)",
      textMuted: "var(--ds-muted)",
      textSoft: "var(--ds-text)",
      textOnMedia: "var(--ds-text)",
      textOnMediaMuted: "rgb(var(--ds-text-rgb) / .76)",
      accent: "var(--ds-accent)",
      accentHover: "var(--ds-accent)",
      accentActive: "var(--ds-accent)",
      accentSecondary: "var(--ds-secondary)",
      accentTertiary: "var(--ds-highlight)",
      accentContrast: "var(--ds-on-accent)",
      accentSoft: "rgb(var(--ds-accent-rgb) / .12)",
      focusRing: "rgb(var(--ds-accent-rgb) / .52)",
      surface: "var(--ds-panel)",
      surfaceElevated: "var(--ds-panel-2)",
      surfaceTranslucent: "rgb(var(--ds-panel-rgb) / .88)",
      code: "var(--ds-panel-2)",
      codeText: "var(--ds-text)",
      codeBorder: "var(--ds-line)",
      card: "rgb(var(--ds-panel-rgb) / .90)",
      cardAlt: "rgb(var(--ds-panel-rgb) / .90)",
      cardBorder: "rgb(var(--ds-muted-rgb) / .18)",
      cardHoverBorder: "rgb(var(--ds-accent-rgb) / .42)",
      cardText: "var(--ds-text)",
      cardIcon: "var(--ds-accent)",
      cardIconText: "var(--ds-on-accent)",
      message: "rgb(var(--ds-panel-rgb) / .44)",
      messageBorder: "rgb(var(--ds-muted-rgb) / .12)",
      messageUser: "rgb(var(--ds-panel-2-rgb) / .94)",
      messageUserText: "var(--ds-text)",
      messageAssistant: "rgb(var(--ds-panel-rgb) / .44)",
      messageAssistantText: "var(--ds-text)",
      composer: "rgb(var(--ds-panel-rgb) / .94)",
      composerAlt: "rgb(var(--ds-panel-rgb) / .88)",
      composerBorder: "rgb(var(--ds-muted-rgb) / .18)",
      composerText: "var(--ds-text)",
      composerPlaceholder: "rgb(var(--ds-muted-rgb) / .82)",
      control: "rgb(var(--ds-panel-2-rgb) / .94)",
      controlHover: "rgb(var(--ds-accent-rgb) / .09)",
      controlSelected: "rgb(var(--ds-accent-rgb) / .12)",
      controlText: "var(--ds-text)",
      controlPrimary: "var(--ds-accent)",
      controlPrimaryHover: "var(--ds-accent)",
      controlPrimaryText: "var(--ds-on-accent)",
      project: "rgb(var(--ds-panel-rgb) / .92)",
      projectAlt: "rgb(var(--ds-panel-rgb) / .92)",
      projectBorder: "rgb(var(--ds-muted-rgb) / .16)",
      hero: "var(--ds-panel)",
      heroBorder: "rgb(var(--ds-accent-rgb) / .30)",
      heroOverlay: "rgb(var(--ds-bg-rgb) / .90)",
      heroOverlaySoft: "rgb(var(--ds-bg-rgb) / .18)",
      popover: "rgb(var(--ds-panel-rgb) / .98)",
      popoverBorder: "var(--ds-line)",
      popoverText: "var(--ds-text)",
      tooltip: "var(--ds-panel-2)",
      tooltipText: "var(--ds-text)",
      backdrop: "rgba(0, 0, 0, .38)",
      divider: "var(--ds-line)",
      scrollbar: "rgb(var(--ds-accent-rgb) / .38)",
      selection: "rgb(var(--ds-accent-rgb) / .24)",
      success: "#2aae67",
      warning: "#c88200",
      danger: "#d94856",
      info: "#2786c4",
      decorationPrimary: "var(--ds-accent)",
      decorationSecondary: "var(--ds-secondary)",
      quote: "rgb(var(--ds-muted-rgb) / .72)",
    },
    effect: {
      canvasPatternOpacity: "0",
      decorationOpacity: "0",
      chromeOpacity: "1",
      composerMarkerOpacity: "1",
      taskMediaStartOpacity: "95%",
      taskMediaMiddleOpacity: "86%",
      taskMediaEndOpacity: "64%",
      sidebarShadow: "10px 0 30px rgb(var(--ds-bg-rgb) / .22)",
      mainShadow: "-8px 0 28px rgb(var(--ds-bg-rgb) / .18)",
      heroShadow: "0 16px 38px rgb(var(--ds-bg-rgb) / .30)",
      cardShadow: "0 8px 22px rgb(var(--ds-bg-rgb) / .18)",
      cardHoverShadow: "0 12px 28px rgb(var(--ds-bg-rgb) / .24)",
      messageShadow: "0 8px 24px rgb(var(--ds-bg-rgb) / .10)",
      composerShadow: "0 10px 28px rgb(var(--ds-bg-rgb) / .24)",
      popoverShadow: "0 14px 36px rgb(var(--ds-bg-rgb) / .32)",
      mediaTextShadow: "0 1px 2px rgb(var(--ds-bg-rgb) / .72), 0 0 10px rgb(var(--ds-bg-rgb) / .46)",
      accentGlow: "none",
    },
  },
  light: {
    color: {
      canvas: "var(--ds-bg)",
      canvasAlt: "var(--ds-bg)",
      canvasPatternPrimary: "transparent",
      canvasPatternSecondary: "transparent",
      sidebar: "rgb(var(--ds-panel-rgb) / .98)",
      sidebarAlt: "rgb(var(--ds-bg-rgb) / .96)",
      sidebarBorder: "var(--ds-line)",
      sidebarText: "var(--ds-text)",
      sidebarMuted: "rgb(var(--ds-muted-rgb) / .92)",
      sidebarIcon: "rgb(var(--ds-muted-rgb) / .96)",
      sidebarHover: "rgb(var(--ds-accent-rgb) / .09)",
      sidebarSelected: "rgb(var(--ds-accent-rgb) / .12)",
      sidebarSelectedBorder: "rgb(var(--ds-accent-rgb) / .22)",
      sidebarSelectedText: "var(--ds-text)",
      main: "var(--ds-bg)",
      mainAlt: "var(--ds-bg)",
      mainBorder: "var(--ds-line)",
      header: "rgb(var(--ds-panel-rgb) / .90)",
      headerAlt: "rgb(var(--ds-panel-rgb) / .90)",
      headerBorder: "var(--ds-line)",
      text: "var(--ds-text)",
      textMuted: "var(--ds-muted)",
      textSoft: "var(--ds-text)",
      textOnMedia: "var(--ds-text)",
      textOnMediaMuted: "rgb(var(--ds-text-rgb) / .76)",
      accent: "var(--ds-accent)",
      accentHover: "var(--ds-accent)",
      accentActive: "var(--ds-accent)",
      accentSecondary: "var(--ds-secondary)",
      accentTertiary: "var(--ds-highlight)",
      accentContrast: "var(--ds-on-accent)",
      accentSoft: "rgb(var(--ds-accent-rgb) / .12)",
      focusRing: "rgb(var(--ds-accent-rgb) / .35)",
      surface: "var(--ds-panel)",
      surfaceElevated: "var(--ds-panel-2)",
      surfaceTranslucent: "rgb(var(--ds-panel-rgb) / .86)",
      code: "var(--ds-panel-2)",
      codeText: "var(--ds-text)",
      codeBorder: "var(--ds-line)",
      card: "rgb(var(--ds-panel-rgb) / .90)",
      cardAlt: "rgb(var(--ds-panel-rgb) / .90)",
      cardBorder: "rgb(var(--ds-muted-rgb) / .18)",
      cardHoverBorder: "rgb(var(--ds-accent-rgb) / .42)",
      cardText: "var(--ds-text)",
      cardIcon: "var(--ds-accent)",
      cardIconText: "var(--ds-on-accent)",
      message: "rgb(var(--ds-panel-rgb) / .72)",
      messageBorder: "rgb(var(--ds-muted-rgb) / .12)",
      messageUser: "rgb(var(--ds-panel-2-rgb) / .94)",
      messageUserText: "var(--ds-text)",
      messageAssistant: "rgb(var(--ds-panel-rgb) / .72)",
      messageAssistantText: "var(--ds-text)",
      composer: "rgb(var(--ds-panel-rgb) / .94)",
      composerAlt: "rgb(var(--ds-panel-rgb) / .88)",
      composerBorder: "rgb(var(--ds-muted-rgb) / .18)",
      composerText: "var(--ds-text)",
      composerPlaceholder: "rgb(var(--ds-muted-rgb) / .78)",
      control: "rgb(var(--ds-panel-2-rgb) / .94)",
      controlHover: "rgb(var(--ds-accent-rgb) / .09)",
      controlSelected: "rgb(var(--ds-accent-rgb) / .12)",
      controlText: "var(--ds-text)",
      controlPrimary: "var(--ds-accent)",
      controlPrimaryHover: "var(--ds-accent)",
      controlPrimaryText: "var(--ds-on-accent)",
      project: "rgb(var(--ds-panel-rgb) / .92)",
      projectAlt: "rgb(var(--ds-panel-rgb) / .92)",
      projectBorder: "rgb(var(--ds-muted-rgb) / .16)",
      hero: "var(--ds-panel)",
      heroBorder: "rgb(var(--ds-accent-rgb) / .30)",
      heroOverlay: "rgb(var(--ds-panel-rgb) / .96)",
      heroOverlaySoft: "rgb(var(--ds-panel-rgb) / .20)",
      popover: "rgb(var(--ds-panel-rgb) / .98)",
      popoverBorder: "var(--ds-line)",
      popoverText: "var(--ds-text)",
      tooltip: "var(--ds-panel-2)",
      tooltipText: "var(--ds-text)",
      backdrop: "rgba(34, 39, 42, .20)",
      divider: "var(--ds-line)",
      scrollbar: "rgb(var(--ds-accent-rgb) / .38)",
      selection: "rgb(var(--ds-accent-rgb) / .16)",
      success: "#2aae67",
      warning: "#c88200",
      danger: "#d94856",
      info: "#2786c4",
      decorationPrimary: "var(--ds-accent)",
      decorationSecondary: "var(--ds-secondary)",
      quote: "rgb(var(--ds-muted-rgb) / .72)",
    },
    effect: {
      canvasPatternOpacity: "0",
      decorationOpacity: "0",
      chromeOpacity: "1",
      composerMarkerOpacity: "1",
      taskMediaStartOpacity: "95%",
      taskMediaMiddleOpacity: "86%",
      taskMediaEndOpacity: "64%",
      sidebarShadow: "10px 0 30px rgb(var(--ds-bg-rgb) / .22)",
      mainShadow: "-8px 0 28px rgb(var(--ds-bg-rgb) / .18)",
      heroShadow: "0 16px 38px rgb(var(--ds-bg-rgb) / .30)",
      cardShadow: "0 8px 22px rgb(var(--ds-bg-rgb) / .18)",
      cardHoverShadow: "0 12px 28px rgb(var(--ds-bg-rgb) / .24)",
      messageShadow: "0 8px 24px rgb(var(--ds-bg-rgb) / .10)",
      composerShadow: "0 10px 28px rgb(var(--ds-bg-rgb) / .24)",
      popoverShadow: "0 14px 36px rgb(var(--ds-bg-rgb) / .32)",
      mediaTextShadow: "none",
      accentGlow: "none",
    },
  },
};

const COLOR_PATTERN = /^(?:transparent|#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+%?)?\s*\)|hsla?\(\s*[\d.]+(?:deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+%?)?\s*\))$/i;
// Conservative CSS-value charset for non-color tokens. Allows var()/calc()/
// clamp(), font stacks, and `rgb(<r g b> / a)` shadows; rejects declaration
// separators, braces, markup, backticks, and backslashes.
const SAFE_CSS_PATTERN = /^[#(),./%\-\s\dA-Za-z"']+$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function tokenValue(value, path) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Theme token ${path} must be a string or number.`);
  }
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 280 || /[;{}<>`\\]/.test(normalized)) {
    throw new Error(`Theme token ${path} contains an unsafe CSS value.`);
  }
  if (path.includes(".color.") && !COLOR_PATTERN.test(normalized)) {
    throw new Error(`Theme token ${path} must be a CSS color.`);
  }
  if (!path.includes(".color.") && !SAFE_CSS_PATTERN.test(normalized)) {
    throw new Error(`Theme token ${path} contains unsupported characters.`);
  }
  return normalized;
}

function mergeTokens(defaults, overrides, explicitPaths, path = "tokens") {
  const result = {};
  if (overrides !== undefined
    && (!overrides || typeof overrides !== "object" || Array.isArray(overrides))) {
    throw new Error(`Theme token group ${path} must be an object.`);
  }
  const source = overrides || {};
  for (const key of Object.keys(source)) {
    if (!Object.hasOwn(defaults, key)) {
      throw new Error(`Theme token ${path}.${key} is not supported.`);
    }
  }
  for (const [key, fallback] of Object.entries(defaults)) {
    const nextPath = `${path}.${key}`;
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
      result[key] = mergeTokens(fallback, source[key], explicitPaths, nextPath);
    } else if (Object.hasOwn(source, key)) {
      result[key] = tokenValue(source[key], nextPath);
      explicitPaths.add(nextPath);
    } else {
      result[key] = fallback;
    }
  }
  return result;
}

function markLegacyColor(tokens, explicitPaths, mode, key, value) {
  if (typeof value !== "string" || !COLOR_PATTERN.test(value.trim())) return;
  tokens[mode].color[key] = value.trim();
  explicitPaths.add(`tokens.${mode}.color.${key}`);
}

// Schema v1 `colors` map to the closest v2 semantic roles so the flattened
// semantic variables stay coherent for legacy themes. Core `--ds-*` variables
// for v1 themes are still resolved by the adaptive palette + explicit color
// keys pipeline in the renderer; this migration only feeds the semantic set.
function migrateLegacyColors(raw, tokens, explicitPaths) {
  const colors = raw.colors && typeof raw.colors === "object" ? raw.colors : {};
  markLegacyColor(tokens, explicitPaths, "dark", "canvas", colors.background);
  markLegacyColor(tokens, explicitPaths, "dark", "mainAlt", colors.background);
  markLegacyColor(tokens, explicitPaths, "dark", "surface", colors.panel);
  markLegacyColor(tokens, explicitPaths, "dark", "surfaceElevated", colors.panelAlt);
  markLegacyColor(tokens, explicitPaths, "dark", "accent", colors.accent);
  markLegacyColor(tokens, explicitPaths, "light", "accent", colors.accent);
  markLegacyColor(tokens, explicitPaths, "dark", "cardIcon", colors.accentAlt);
  markLegacyColor(tokens, explicitPaths, "light", "cardIcon", colors.accentAlt);
  markLegacyColor(tokens, explicitPaths, "dark", "accentSecondary", colors.secondary);
  markLegacyColor(tokens, explicitPaths, "light", "accentSecondary", colors.secondary);
  markLegacyColor(tokens, explicitPaths, "dark", "accentTertiary", colors.highlight);
  markLegacyColor(tokens, explicitPaths, "light", "accentTertiary", colors.highlight);
  markLegacyColor(tokens, explicitPaths, "dark", "text", colors.text);
  markLegacyColor(tokens, explicitPaths, "dark", "textMuted", colors.muted);
  markLegacyColor(tokens, explicitPaths, "dark", "divider", colors.line);
}

function kebab(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function flattenVariables(groups, explicitPaths, mode) {
  const variables = {};
  const explicit = {};
  for (const [group, values] of Object.entries(groups)) {
    for (const [name, value] of Object.entries(values)) {
      const variable = `--ds-${kebab(group)}-${kebab(name)}`;
      variables[variable] = String(value);
      if (explicitPaths.has(`tokens.${mode}.${group}.${name}`)) {
        explicit[variable] = String(value);
      }
    }
  }
  return { variables, explicit };
}

// Resolve the tokens of a raw theme config (schema v1 or v2) into the full
// token tree, flattened per-mode CSS variables, and the subset the theme
// author explicitly provided (used by the renderer to override the adaptive
// palette without ever inheriting default var() expressions circularly).
export function buildThemeTokens(raw) {
  if (!raw || typeof raw !== "object" || ![1, THEME_SCHEMA_VERSION].includes(raw.schemaVersion)) {
    throw new Error("Theme config has an unsupported schemaVersion.");
  }
  if (raw.schemaVersion === THEME_SCHEMA_VERSION && raw.tokens !== undefined
    && (!raw.tokens || typeof raw.tokens !== "object" || Array.isArray(raw.tokens))) {
    throw new Error("Theme tokens must be an object.");
  }
  const explicitPaths = new Set();
  const tokens = raw.schemaVersion === THEME_SCHEMA_VERSION && raw.tokens
    ? mergeTokens(DEFAULT_THEME_TOKENS, raw.tokens, explicitPaths)
    : clone(DEFAULT_THEME_TOKENS);
  if (raw.schemaVersion === 1) migrateLegacyColors(raw, tokens, explicitPaths);
  const shared = flattenVariables(tokens.shared, explicitPaths, "shared");
  const dark = flattenVariables(tokens.dark, explicitPaths, "dark");
  const light = flattenVariables(tokens.light, explicitPaths, "light");
  return {
    tokens,
    cssVariables: { shared: shared.variables, dark: dark.variables, light: light.variables },
    explicitCssVariables: { shared: shared.explicit, dark: dark.explicit, light: light.explicit },
    variableCount: Object.keys(shared.variables).length
      + Object.keys(dark.variables).length
      + Object.keys(light.variables).length,
  };
}

export function createThemeTokens(overrides = {}) {
  return mergeTokens(DEFAULT_THEME_TOKENS, overrides, new Set());
}
