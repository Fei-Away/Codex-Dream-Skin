function rgb(hex) {
  const match = String(hex || "").trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return { r: value >> 16, g: (value >> 8) & 255, b: value & 255 };
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const color = rgb(hex);
  if (!color) return 0;
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(left, right) {
  const high = Math.max(luminance(left), luminance(right));
  const low = Math.min(luminance(left), luminance(right));
  return Number(((high + 0.05) / (low + 0.05)).toFixed(2));
}

export function evaluateReadability({ accent, surface, ink }) {
  const textRatio = contrastRatio(ink, surface);
  const controlRatio = contrastRatio(accent, surface);
  return {
    text: { ratio: textRatio, target: 4.5, pass: textRatio >= 4.5 },
    controls: { ratio: controlRatio, target: 3, pass: controlRatio >= 3 },
  };
}

export function evaluatePaletteReadability(palette) {
  return evaluateReadability({
    accent: palette.accent,
    surface: palette.panel,
    ink: palette.text,
  });
}

export function recommendVariant(surface) {
  return luminance(surface) >= 0.5 ? "light" : "dark";
}

export function buildNativeThemePayload(input) {
  return {
    codeThemeId: "codex",
    theme: {
      accent: input.accent,
      contrast: Number(input.contrast ?? 62),
      fonts: { code: null, ui: null },
      ink: input.ink,
      opaqueWindows: true,
      semanticColors: {
        diffAdded: input.diffAdded,
        diffRemoved: input.diffRemoved,
        skill: input.skill,
      },
      surface: input.surface,
    },
    variant: input.variant,
  };
}

function toHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function chroma({ r, g, b }) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

// 只在本机 Canvas 采样，不上传用户图片。
export async function sampleImageAccent(source) {
  const bitmap = source instanceof ImageBitmap ? source : await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, 64, 64);
  if (!(source instanceof ImageBitmap)) bitmap.close();
  const pixels = context.getImageData(0, 0, 64, 64).data;
  let best = { score: -1, color: { r: 124, g: 255, b: 70 } };
  for (let index = 0; index < pixels.length; index += 16) {
    if (pixels[index + 3] < 220) continue;
    const color = { r: pixels[index], g: pixels[index + 1], b: pixels[index + 2] };
    const light = luminance(toHex(color));
    if (light < 0.16 || light > 0.78) continue;
    const score = chroma(color) * (1 - Math.abs(light - 0.46));
    if (score > best.score) best = { score, color };
  }
  return toHex(best.color);
}
