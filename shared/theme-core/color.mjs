const HEX = /^#([0-9a-f]{6})$/i;
const RGB = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i;

export function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function parseColor(value) {
  const source = String(value || "").trim();
  const hex = HEX.exec(source);
  if (hex) {
    const raw = hex[1].toLowerCase();
    return {
      hex: `#${raw}`,
      opacity: 1,
      rgb: [0, 2, 4].map((offset) => Number.parseInt(raw.slice(offset, offset + 2), 16)),
    };
  }
  const rgb = RGB.exec(source);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map((channel) => Math.round(clamp(channel, 0, 255)));
  return {
    hex: `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
    opacity: rgb[4] === undefined ? 1 : clamp(rgb[4], 0, 1),
    rgb: channels,
  };
}

export function normalizeHex(value, fallback) {
  return parseColor(value)?.hex || fallback;
}

export function mixHex(left, right, rightWeight) {
  const a = parseColor(left)?.rgb;
  const b = parseColor(right)?.rgb;
  if (!a || !b) throw new Error("无法混合无效颜色");
  const weight = clamp(rightWeight, 0, 1);
  const channels = a.map((channel, index) => Math.round(channel * (1 - weight) + b[index] * weight));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function toRgba(hex, opacity) {
  const color = parseColor(hex);
  if (!color) throw new Error(`无效颜色：${hex}`);
  const alpha = clamp(opacity, 0, 1);
  return `rgba(${color.rgb.join(", ")}, ${Number(alpha.toFixed(3))})`;
}
