const paletteFields = [
  "background", "panel", "panelAlt", "accent", "accentAlt",
  "secondary", "highlight", "text", "muted", "line",
];
const textFields = [
  "name", "tagline", "quote", "brandSubtitle",
  "statusText", "projectPrefix", "projectLabel",
];
const states = new WeakMap();
const defaultActions = [
  { icon: "code", title: "探索并理解代码", detail: "梳理结构、依赖与调用路径。", badge: "分析", tone: "accent" },
  { icon: "build", title: "构建新功能", detail: "把想法实现为可验证的改动。", badge: "构建", tone: "secondary" },
  { icon: "review", title: "审查与改进", detail: "检查风险并提出清晰建议。", badge: "审查", tone: "accentAlt" },
  { icon: "repair", title: "修复问题", detail: "定位根因并验证恢复路径。", badge: "修复", tone: "highlight" },
];

const darkDefaults = {
  background: "#071116", panel: "#0b1a20", panelAlt: "#10272c",
  accent: "#7cff46", accentAlt: "#a7ff75", secondary: "#36d7e8",
  highlight: "#f0bd4f", text: "#f2fff7", muted: "#a7c2ba",
  line: "#7cff46", lineOpacity: 0.32,
};

function mix(left, right, weight) {
  const channels = [1, 3, 5].map((offset) => Math.round(
    Number.parseInt(left.slice(offset, offset + 2), 16) * (1 - weight)
    + Number.parseInt(right.slice(offset, offset + 2), 16) * weight,
  ));
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function deriveLightPalette(dark = darkDefaults) {
  return {
    ...dark,
    background: mix(dark.background, "#ffffff", 0.92),
    panel: mix(dark.panel, "#ffffff", 0.96),
    panelAlt: mix(dark.panelAlt, "#ffffff", 0.9),
    text: mix(dark.background, "#000000", 0.68),
    muted: mix(dark.muted, "#000000", 0.42),
    lineOpacity: Math.min(0.28, Number(dark.lineOpacity ?? 0.22)),
  };
}

function parseLegacyLine(value) {
  const rgba = String(value || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/i);
  if (!rgba) return { line: /^#[0-9a-f]{6}$/i.test(value || "") ? value : darkDefaults.line, lineOpacity: 0.32 };
  const line = `#${rgba.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
  return { line, lineOpacity: rgba[4] === undefined ? 1 : Number(rgba[4]) };
}

function initialPalettes(theme) {
  const legacy = { ...darkDefaults, ...(theme.colors || {}), ...parseLegacyLine(theme.colors?.line) };
  const dark = { ...darkDefaults, ...(theme.palettes?.dark || legacy) };
  return {
    dark,
    light: { ...deriveLightPalette(dark), ...(theme.palettes?.light || {}) },
  };
}

function savePalette(form) {
  const state = states.get(form);
  if (!state) return;
  const next = {};
  for (const field of paletteFields) next[field] = form.elements[field].value;
  next.lineOpacity = Number(form.elements.lineOpacity.value) / 100;
  state.palettes[state.activePalette] = next;
}

function loadPalette(form, name) {
  const state = states.get(form);
  const palette = state.palettes[name];
  state.activePalette = name;
  for (const field of paletteFields) form.elements[field].value = palette[field];
  form.elements.lineOpacity.value = Math.round(palette.lineOpacity * 100);
  form.querySelectorAll("[data-palette]").forEach((button) => button.classList.toggle("active", button.dataset.palette === name));
  updateRangeValues(form);
}

function updateRangeValues(form) {
  form.querySelectorAll('input[type="range"]').forEach((input) => {
    const output = form.querySelector(`[data-range-value="${input.name}"]`);
    if (!output) return;
    output.textContent = `${input.value}${["blur", "radius"].includes(input.name) ? " px" : "%"}`;
  });
}

function snapshot(form, imageData = null) {
  savePalette(form);
  const data = new FormData(form);
  const payload = {
    schemaVersion: 3,
    _previewPalette: states.get(form).activePalette,
    imageData,
    shellMode: data.get("shellMode"),
    palettes: structuredClone(states.get(form).palettes),
    appearance: {
      background: Object.fromEntries(["focusX", "focusY", "zoom", "overlay"].map((key) => [key, Number(data.get(key))])),
      surface: {
        opacity: Number(data.get("surfaceOpacity")),
        blur: Number(data.get("blur")),
        radius: Number(data.get("radius")),
        shadow: Number(data.get("shadow")),
      },
      decoration: { style: data.get("decorationStyle"), intensity: Number(data.get("decorationIntensity")) },
      typography: data.get("typography"),
    },
  };
  for (const name of textFields) payload[name] = data.get(name);
  payload.scene = {
    kind: "custom-scene",
    identity: { icon: data.get("sceneIcon"), shortName: data.get("sceneShortName") },
    hero: {
      eyebrow: data.get("brandSubtitle"),
      title: data.get("heroTitle"),
      description: data.get("heroDescription"),
      tags: String(data.get("heroTags") || "").split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 4),
    },
    actions: defaultActions.map((fallback, index) => ({
      ...fallback,
      icon: data.get(`action${index + 1}Icon`) || fallback.icon,
      title: data.get(`action${index + 1}Title`) || fallback.title,
      detail: data.get(`action${index + 1}Detail`) || fallback.detail,
    })),
    widget: {
      icon: "signal",
      title: data.get("widgetTitle"),
      lines: String(data.get("widgetLines") || "").split("/").map((line) => line.trim()).filter(Boolean).slice(0, 3),
      visible: true,
    },
    composer: { icon: "wand", label: data.get("composerLabel"), hint: data.get("composerHint") },
    chrome: { iconColor: "background", iconSurface: "accent", badgeColor: "highlight", cardText: "text" },
  };
  payload.nativeAppearance = {
    variant: data.get("nativeVariant"),
    accent: data.get("nativeAccent"),
    surface: data.get("nativeSurface"),
    ink: data.get("nativeInk"),
    contrast: Number(data.get("nativeContrast")),
    diffAdded: data.get("nativeDiffAdded"),
    diffRemoved: data.get("nativeDiffRemoved"),
    skill: data.get("nativeSkill"),
  };
  return payload;
}

function setValue(form, name, value) {
  if (form.elements[name] && value !== undefined && value !== null) form.elements[name].value = value;
}

export function setThemeFormValues(form, theme = {}) {
  form.reset();
  states.set(form, { activePalette: "dark", palettes: initialPalettes(theme), callback: states.get(form)?.callback });
  const defaults = {
    name: "我的新主题", tagline: "把喜欢的画面变成可交互的 Codex 工作台。",
    quote: "MAKE SOMETHING WONDERFUL", brandSubtitle: "CODEX DREAM SKIN",
    statusText: "DREAM SKIN ONLINE", projectPrefix: "选择项目 · ", projectLabel: "◉  选择项目",
  };
  for (const field of textFields) form.elements[field].value = theme[field] || defaults[field];
  const appearance = theme.appearance || {};
  const values = {
    shellMode: theme.shellMode || "auto", typography: appearance.typography || "system",
    decorationStyle: appearance.decoration?.style || "orbit",
    decorationIntensity: appearance.decoration?.intensity ?? 42,
    focusX: appearance.background?.focusX ?? 58, focusY: appearance.background?.focusY ?? 50,
    zoom: appearance.background?.zoom ?? 100, overlay: appearance.background?.overlay ?? 24,
    surfaceOpacity: appearance.surface?.opacity ?? 88, blur: appearance.surface?.blur ?? 18,
    radius: appearance.surface?.radius ?? 18, shadow: appearance.surface?.shadow ?? 34,
  };
  for (const [name, value] of Object.entries(values)) setValue(form, name, value);
  const scene = theme.scene || {};
  const sceneValues = {
    sceneShortName: scene.identity?.shortName || theme.name || defaults.name,
    sceneIcon: scene.identity?.icon || "spark",
    heroTitle: scene.hero?.title || "我们该构建什么？",
    heroDescription: scene.hero?.description || theme.tagline || defaults.tagline,
    heroTags: (scene.hero?.tags || ["构建", "审查", "解释"]).join("，"),
    widgetTitle: scene.widget?.title || "今日状态",
    widgetLines: (scene.widget?.lines || ["保持专注", "小步验证"]).join(" / "),
    composerLabel: scene.composer?.label || "场景输入",
    composerHint: scene.composer?.hint || "让 Codex 构建、审查或解释…",
  };
  for (const [name, value] of Object.entries(sceneValues)) setValue(form, name, value);
  defaultActions.forEach((fallback, index) => {
    const action = scene.actions?.[index] || fallback;
    setValue(form, `action${index + 1}Title`, action.title || fallback.title);
    setValue(form, `action${index + 1}Detail`, action.detail || fallback.detail);
    setValue(form, `action${index + 1}Icon`, action.icon || fallback.icon);
  });
  const native = theme.nativeAppearance || {};
  const nativeValues = {
    nativeVariant: native.variant || (theme.shellMode === "light" ? "light" : "dark"),
    nativeAccent: native.accent || states.get(form).palettes.dark.accent,
    nativeSurface: native.surface || states.get(form).palettes.dark.panel,
    nativeInk: native.ink || states.get(form).palettes.dark.text,
    nativeContrast: native.contrast ?? 62,
    nativeDiffAdded: native.diffAdded || states.get(form).palettes.dark.accentAlt,
    nativeDiffRemoved: native.diffRemoved || states.get(form).palettes.dark.highlight,
    nativeSkill: native.skill || states.get(form).palettes.dark.secondary,
  };
  for (const [name, value] of Object.entries(nativeValues)) setValue(form, name, value);
  loadPalette(form, "dark");
  states.get(form).callback?.(snapshot(form));
}

export function bindThemeEditor(form, callback) {
  const state = states.get(form) || { activePalette: "dark", palettes: initialPalettes({}) };
  state.callback = callback;
  states.set(form, state);
  if (form.dataset.editorBound) return;
  form.dataset.editorBound = "true";
  form.addEventListener("input", () => { updateRangeValues(form); callback(snapshot(form)); });
  form.addEventListener("change", () => callback(snapshot(form)));
  form.querySelectorAll("[data-palette]").forEach((button) => button.addEventListener("click", () => {
    savePalette(form);
    loadPalette(form, button.dataset.palette);
    callback(snapshot(form));
  }));
  form.querySelector("[data-generate-palette]").addEventListener("click", () => {
    savePalette(form);
    states.get(form).palettes.light = deriveLightPalette(states.get(form).palettes.dark);
    loadPalette(form, "light");
    callback(snapshot(form));
  });
}

export function themeFormPayload(form, imageData) {
  return snapshot(form, imageData);
}

function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

export async function readImageFile(file) {
  if (!file) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 3200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return fileDataUrl(file);
  }
}
