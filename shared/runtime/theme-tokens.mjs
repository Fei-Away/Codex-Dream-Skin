import { toRgba } from "../theme-core/color.mjs";

function fraction(value) {
  return String(Number((Number(value) / 100).toFixed(3)));
}

export function themeRuntime(theme, detectedShell = "dark") {
  const shell = theme.shellMode === "light" || theme.shellMode === "dark"
    ? theme.shellMode
    : theme.shellMode === "recommended"
      ? theme.nativeAppearance?.variant || "dark"
    : detectedShell === "light" ? "light" : "dark";
  const palette = theme.palettes[shell];
  const { background, surface, decoration } = theme.appearance;
  const chrome = theme.scene?.chrome || {};
  const color = (token, fallback) => palette[token] || fallback;
  return {
    shell,
    attributes: {
      decoration: decoration.style,
      typography: theme.appearance.typography,
    },
    variables: {
      "--ds-bg": palette.background,
      "--ds-panel": palette.panel,
      "--ds-panel-2": palette.panelAlt,
      "--ds-green": palette.accent,
      "--ds-lime": palette.accentAlt,
      "--ds-cyan": palette.secondary,
      "--ds-purple": palette.highlight,
      "--ds-text": palette.text,
      "--ds-muted": palette.muted,
      "--ds-line": toRgba(palette.line, palette.lineOpacity),
      "--ds-scene-icon": color(chrome.iconColor, palette.background),
      "--ds-scene-icon-surface": color(chrome.iconSurface, palette.accent),
      "--ds-scene-badge": color(chrome.badgeColor, palette.highlight),
      "--ds-scene-card-text": color(chrome.cardText, palette.text),
      "--dream-art-position": `${background.focusX}% ${background.focusY}%`,
      "--dream-art-size": background.zoom === 100 ? "cover" : `${background.zoom}% auto`,
      "--dream-overlay-opacity": fraction(background.overlay),
      "--dream-panel-opacity": fraction(surface.opacity),
      "--dream-panel-percent": `${surface.opacity}%`,
      "--dream-panel-blur": `${surface.blur}px`,
      "--dream-radius": `${surface.radius}px`,
      "--dream-shadow-opacity": fraction(surface.shadow),
      "--dream-decoration-opacity": fraction(decoration.intensity),
    },
  };
}
