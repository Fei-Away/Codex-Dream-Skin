import path from "node:path";
import { clamp, mixHex, normalizeHex, parseColor, toRgba } from "./color.mjs";

const paletteDefaults = {
  background: "#071116",
  panel: "#0b1a20",
  panelAlt: "#10272c",
  accent: "#7cff46",
  accentAlt: "#a7ff75",
  secondary: "#36d7e8",
  highlight: "#f0bd4f",
  text: "#f2fff7",
  muted: "#a7c2ba",
  line: "#7cff46",
  lineOpacity: 0.32,
};

const defaultActions = [
  { icon: "code", title: "探索并理解代码", detail: "梳理结构、依赖与调用路径。", badge: "分析", tone: "accent" },
  { icon: "build", title: "构建新功能", detail: "把想法实现为可验证的改动。", badge: "构建", tone: "secondary" },
  { icon: "review", title: "审查与改进", detail: "检查风险并提出清晰建议。", badge: "审查", tone: "accentAlt" },
  { icon: "repair", title: "修复问题", detail: "定位根因并验证恢复路径。", badge: "修复", tone: "highlight" },
];

const sceneDefaults = {
  kind: "custom-scene",
  identity: { icon: "spark", shortName: "Dream Skin" },
  hero: { eyebrow: "DREAM SKIN", title: "我们该构建什么？", description: "让场景服务于清晰的工作。", tags: [] },
  actions: defaultActions,
  widget: { icon: "signal", title: "今日状态", lines: ["保持专注", "小步验证"], visible: true },
  composer: { icon: "wand", label: "场景输入", hint: "让 Codex 构建、审查或解释…" },
  chrome: { iconColor: "background", iconSurface: "accent", badgeColor: "highlight", cardText: "text" },
};

export const themeDefaults = {
  schemaVersion: 3,
  name: "我的 Codex Dream Skin",
  brandSubtitle: "CODEX DREAM SKIN",
  tagline: "把喜欢的画面变成可交互的 Codex 工作台。",
  projectPrefix: "选择项目 · ",
  projectLabel: "◉  选择项目",
  statusText: "DREAM SKIN ONLINE",
  quote: "MAKE SOMETHING WONDERFUL",
  shellMode: "auto",
  palettes: {
    dark: paletteDefaults,
    light: {
      ...paletteDefaults,
      background: "#f4f7f6",
      panel: "#ffffff",
      panelAlt: "#edf3f1",
      text: "#18211e",
      muted: "#63716c",
      lineOpacity: 0.22,
    },
  },
  appearance: {
    background: { focusX: 58, focusY: 50, zoom: 100, overlay: 24 },
    surface: { opacity: 88, blur: 18, radius: 18, shadow: 34 },
    decoration: { style: "orbit", intensity: 42 },
    typography: "system",
  },
  scene: sceneDefaults,
  nativeAppearance: {
    variant: "dark",
    accent: paletteDefaults.accent,
    surface: paletteDefaults.panel,
    ink: paletteDefaults.text,
    contrast: 62,
    diffAdded: paletteDefaults.accentAlt,
    diffRemoved: paletteDefaults.highlight,
    skill: paletteDefaults.secondary,
  },
};

const textLimits = {
  name: 80,
  brandSubtitle: 80,
  tagline: 160,
  projectPrefix: 80,
  projectLabel: 80,
  statusText: 80,
  quote: 80,
};
const shellModes = new Set(["auto", "recommended", "light", "dark"]);
const decorations = new Set(["none", "grid", "orbit", "sparkles", "grain"]);
const typography = new Set(["system", "technical", "editorial", "rounded"]);
const sceneKinds = new Set(["custom-scene", "official-scene"]);
const icons = new Set([
  "spark", "code", "build", "review", "repair", "plan", "chart", "pen", "ship", "research",
  "monitor", "cloud", "mountain", "sword", "gear", "mecha", "pet", "moon", "flame", "signal",
  "wand", "compass", "coin", "palette",
]);
const tones = new Set(["accent", "accentAlt", "secondary", "highlight"]);
const colorTokens = new Set(["background", "panel", "panelAlt", "accent", "accentAlt", "secondary", "highlight", "text", "muted"]);

function text(value, fallback, limit) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : fallback;
}

function normalizePalette(input = {}, fallback = paletteDefaults) {
  const lineSource = parseColor(input.line);
  const palette = {};
  for (const key of ["background", "panel", "panelAlt", "accent", "accentAlt", "secondary", "highlight", "text", "muted"]) {
    palette[key] = normalizeHex(input[key], fallback[key]);
  }
  palette.line = lineSource?.hex || normalizeHex(fallback.line, palette.accent);
  palette.lineOpacity = clamp(
    input.lineOpacity ?? lineSource?.opacity,
    0,
    1,
    fallback.lineOpacity,
  );
  return palette;
}

export function deriveLightPalette(dark) {
  const source = normalizePalette(dark);
  return normalizePalette({
    ...source,
    background: mixHex(source.background, "#ffffff", 0.92),
    panel: mixHex(source.panel, "#ffffff", 0.96),
    panelAlt: mixHex(source.panelAlt, "#ffffff", 0.9),
    text: mixHex(source.background, "#000000", 0.68),
    muted: mixHex(source.muted, "#000000", 0.42),
  }, themeDefaults.palettes.light);
}

function normalizeAppearance(input = {}) {
  const background = input.background || {};
  const surface = input.surface || {};
  const decoration = input.decoration || {};
  const defaults = themeDefaults.appearance;
  return {
    background: {
      focusX: clamp(background.focusX, 0, 100, defaults.background.focusX),
      focusY: clamp(background.focusY, 0, 100, defaults.background.focusY),
      zoom: clamp(background.zoom, 80, 160, defaults.background.zoom),
      overlay: clamp(background.overlay, 0, 80, defaults.background.overlay),
    },
    surface: {
      opacity: clamp(surface.opacity, 40, 100, defaults.surface.opacity),
      blur: clamp(surface.blur, 0, 30, defaults.surface.blur),
      radius: clamp(surface.radius, 0, 24, defaults.surface.radius),
      shadow: clamp(surface.shadow, 0, 100, defaults.surface.shadow),
    },
    decoration: {
      style: decorations.has(decoration.style) ? decoration.style : defaults.decoration.style,
      intensity: clamp(decoration.intensity, 0, 100, defaults.decoration.intensity),
    },
    typography: typography.has(input.typography) ? input.typography : defaults.typography,
  };
}

function shortText(value, fallback, limit = 80) {
  return text(value, fallback, limit);
}

function normalizeScene(input = {}, theme = themeDefaults) {
  const identity = input.identity || {};
  const hero = input.hero || {};
  const widget = input.widget || {};
  const composer = input.composer || {};
  const chrome = input.chrome || {};
  const actions = Array.from({ length: 4 }, (_, index) => {
    const action = input.actions?.[index] || {};
    const fallback = defaultActions[index];
    return {
      icon: icons.has(action.icon) ? action.icon : fallback.icon,
      title: shortText(action.title, fallback.title, 48),
      detail: shortText(action.detail, fallback.detail, 96),
      badge: shortText(action.badge, fallback.badge, 24),
      tone: tones.has(action.tone) ? action.tone : fallback.tone,
    };
  });
  return {
    kind: sceneKinds.has(input.kind) ? input.kind : sceneDefaults.kind,
    identity: {
      icon: icons.has(identity.icon) ? identity.icon : sceneDefaults.identity.icon,
      shortName: shortText(identity.shortName, theme.name || sceneDefaults.identity.shortName, 40),
    },
    hero: {
      eyebrow: shortText(hero.eyebrow, theme.name || sceneDefaults.hero.eyebrow, 48),
      title: shortText(hero.title, sceneDefaults.hero.title, 80),
      description: shortText(hero.description, theme.tagline || sceneDefaults.hero.description, 140),
      tags: (Array.isArray(hero.tags) ? hero.tags : []).slice(0, 4).map((tag) => shortText(tag, "场景", 20)),
    },
    actions,
    widget: {
      icon: icons.has(widget.icon) ? widget.icon : sceneDefaults.widget.icon,
      title: shortText(widget.title, sceneDefaults.widget.title, 48),
      lines: (Array.isArray(widget.lines) ? widget.lines : sceneDefaults.widget.lines).slice(0, 3)
        .map((line) => shortText(line, "保持专注", 56)),
      visible: widget.visible !== false,
    },
    composer: {
      icon: icons.has(composer.icon) ? composer.icon : sceneDefaults.composer.icon,
      label: shortText(composer.label, sceneDefaults.composer.label, 48),
      hint: shortText(composer.hint, sceneDefaults.composer.hint, 100),
    },
    chrome: Object.fromEntries(Object.entries(sceneDefaults.chrome).map(([key, fallback]) => [
      key,
      colorTokens.has(chrome[key]) ? chrome[key] : fallback,
    ])),
  };
}

function normalizeNativeAppearance(input = {}, palettes) {
  const variant = input.variant === "light" ? "light" : "dark";
  const palette = palettes[variant];
  return {
    variant,
    accent: normalizeHex(input.accent, palette.accent),
    surface: normalizeHex(input.surface, palette.panel),
    ink: normalizeHex(input.ink, palette.text),
    contrast: clamp(input.contrast, 0, 100, 62),
    diffAdded: normalizeHex(input.diffAdded, palette.accentAlt),
    diffRemoved: normalizeHex(input.diffRemoved, palette.highlight),
    skill: normalizeHex(input.skill, palette.secondary),
  };
}

export function normalizeTheme(input = {}, options = {}) {
  const id = String(options.id || input.id || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,48}$/i.test(id)) throw new Error("主题 ID 无效");
  const image = String(input.image || "").trim();
  if (!image || image !== path.basename(image) || !/^[\w.-]+\.(png|jpe?g|webp)$/i.test(image)) {
    throw new Error("主题图片必须是主题目录内的 PNG、JPEG 或 WebP 文件");
  }

  const isV1 = Number(input.schemaVersion || 1) < 2 || !input.palettes;
  const dark = normalizePalette(isV1 ? input.colors : input.palettes?.dark);
  const light = isV1
    ? deriveLightPalette(dark)
    : normalizePalette(input.palettes?.light, deriveLightPalette(dark));
  const result = {
    schemaVersion: 3,
    id,
    image,
    shellMode: shellModes.has(input.shellMode) ? input.shellMode : themeDefaults.shellMode,
    palettes: { dark, light },
    appearance: normalizeAppearance(input.appearance),
  };
  for (const [key, limit] of Object.entries(textLimits)) {
    result[key] = text(input[key], themeDefaults[key], limit);
  }
  result.scene = normalizeScene(input.scene, result);
  result.nativeAppearance = normalizeNativeAppearance(input.nativeAppearance, result.palettes);
  return result;
}

export { toRgba } from "./color.mjs";
