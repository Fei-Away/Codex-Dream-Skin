import { themeRuntime } from "/runtime/theme-tokens.mjs";
import { buildNativeThemePayload, evaluatePaletteReadability } from "/readability.js";

function setText(container, selector, value) {
  const node = container.querySelector(selector);
  if (node) node.textContent = value || "";
}

function renderScene(container, theme) {
  const scene = theme.scene || {};
  setText(container, "[data-preview-name]", scene.hero?.title || theme.name || "Dream Skin");
  setText(container, "[data-preview-brand]", scene.hero?.eyebrow || theme.brandSubtitle || "CODEX DREAM SKIN");
  setText(container, "[data-preview-tagline]", scene.hero?.description || theme.tagline || "Make something wonderful.");
  setText(container, "[data-preview-composer]", scene.composer?.label || "场景输入");
  const tags = container.querySelector("[data-preview-tags]");
  if (tags) {
    tags.replaceChildren(...(scene.hero?.tags || []).map((tag) => {
      const node = document.createElement("i");
      node.textContent = tag;
      return node;
    }));
  }
  const actions = container.querySelector("[data-preview-actions]");
  if (actions) {
    actions.replaceChildren(...(scene.actions || []).slice(0, 4).map((action) => {
      const card = document.createElement("article");
      const icon = document.createElement("i");
      const copy = document.createElement("span");
      const title = document.createElement("b");
      const detail = document.createElement("small");
      icon.textContent = action.icon === "code" ? "</>" : "✦";
      title.textContent = action.title;
      detail.textContent = action.detail;
      copy.replaceChildren(title, detail);
      card.replaceChildren(icon, copy);
      return card;
    }));
  }
}

function renderContrast(container, palette) {
  const report = evaluatePaletteReadability(palette);
  for (const [name, result] of Object.entries(report)) {
    const card = container.querySelector(`[data-contrast-${name}]`);
    if (!card) continue;
    card.classList.toggle("pass", result.pass);
    card.classList.toggle("fail", !result.pass);
    card.querySelector("b").textContent = `${result.ratio.toFixed(2)}:1`;
  }
}

export function nativeThemeText(theme) {
  return `codex-theme-v1:${JSON.stringify(buildNativeThemePayload(theme.nativeAppearance))}`;
}

export function setPreviewView(container, view) {
  container.querySelectorAll("[data-preview-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.previewView === view);
  });
  container.querySelectorAll("[data-preview-pane]").forEach((pane) => {
    pane.classList.toggle("active", pane.dataset.previewPane === view);
  });
}

export function renderThemePreview(container, theme, imageUrl = "") {
  if (!container || !theme?.palettes || !theme?.appearance) return;
  const previewPalette = theme._previewPalette === "light" ? "light" : "dark";
  const runtime = themeRuntime({ ...theme, shellMode: previewPalette }, previewPalette);
  for (const [name, value] of Object.entries(runtime.variables)) container.style.setProperty(name, value);
  container.dataset.previewShell = runtime.shell;
  container.dataset.dreamDecoration = runtime.attributes.decoration;
  container.dataset.dreamTypography = runtime.attributes.typography;
  if (imageUrl) container.style.setProperty("--preview-image", `url("${imageUrl}")`);
  setText(container, "[data-preview-shell]", runtime.shell === "light" ? "浅色" : "深色");
  renderScene(container, theme);
  renderContrast(container, theme.palettes[runtime.shell]);
  container.dataset.nativeTheme = nativeThemeText(theme);
}

export const previewLabels = {
  runtime: "运行效果",
  reference: "设计参考",
};
