import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Deterministic, dependency-free preset generator.
// Produces abstract gradient/aurora backgrounds (no photos, no likeness, no
// third-party IP) plus a matching theme.json for each bundled preset. Re-running
// it yields byte-identical output, so committed assets stay diff-stable.
//
//   node macos/presets/generate-presets.mjs
//
// Add a preset by appending to PRESETS below and re-running.

const here = path.dirname(fileURLToPath(import.meta.url));
const WIDTH = 1920;
const HEIGHT = 1200;

// ---- tiny PNG encoder (RGB, filter 0, zlib IDAT) ----------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgb) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  // 10,11,12 = compression / filter / interlace = 0
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- math helpers -----------------------------------------------------------

const clamp = (value, lo, hi) => (value < lo ? lo : value > hi ? hi : value);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// Deterministic per-pixel dither so gradients avoid 8-bit banding without a RNG.
function dither(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295 - 0.5;
}

const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

// Screen blend keeps overlapping light glows luminous instead of muddy.
const screen = (base, light) => 255 - ((255 - base) * (255 - light)) / 255;

// ---- renderer ---------------------------------------------------------------

function render(spec) {
  const top = hex(spec.bg[0]);
  const bottom = hex(spec.bg[1]);
  // "screen" adds luminous glows on dark bases; "tint" lerps toward a saturated
  // color, which is the only way glows stay visible on a light base.
  const blend = spec.blend ?? "screen";
  const lights = spec.lights.map((l) => ({ ...l, rgb: hex(l.color) }));
  const rgb = Buffer.alloc(WIDTH * HEIGHT * 3);
  const aspect = WIDTH / HEIGHT;

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / (HEIGHT - 1);
    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / (WIDTH - 1);
      // Diagonal base gradient (top color settles toward the bottom color).
      const t = clamp(u * 0.32 + v * 0.68, 0, 1);
      let r = lerp(top[0], bottom[0], t);
      let g = lerp(top[1], bottom[1], t);
      let b = lerp(top[2], bottom[2], t);

      // Additive-ish light glows via screen blend.
      for (const light of lights) {
        const dx = (u - light.x) * aspect;
        const dy = v - light.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= light.r) continue;
        const w = smooth(1 - dist / light.r) * light.intensity;
        if (blend === "tint") {
          r = lerp(r, light.rgb[0], w);
          g = lerp(g, light.rgb[1], w);
          b = lerp(b, light.rgb[2], w);
        } else {
          r = screen(r, light.rgb[0] * w);
          g = screen(g, light.rgb[1] * w);
          b = screen(b, light.rgb[2] * w);
        }
      }

      // Vignette: gently darken toward the edges to frame native chrome.
      const cx = (u - 0.5) * aspect;
      const cy = v - 0.5;
      const vignette = 1 - spec.vignette * smooth(clamp((cx * cx + cy * cy) / 0.5, 0, 1));
      r *= vignette;
      g *= vignette;
      b *= vignette;

      const n = dither(x, y) * spec.dither;
      const i = (y * WIDTH + x) * 3;
      rgb[i] = clamp(Math.round(r + n), 0, 255);
      rgb[i + 1] = clamp(Math.round(g + n), 0, 255);
      rgb[i + 2] = clamp(Math.round(b + n), 0, 255);
    }
  }
  return rgb;
}

// ---- preset specs -----------------------------------------------------------

const PROMO = {
  promoTitle: "感谢 Passion8 赞助",
  promoSub: "passion8.cc",
  promoUrl: "https://passion8.cc/register?aff=TuPe",
};

const PRESETS = [
  {
    slug: "midnight-aurora",
    name: "午夜极光",
    tagline: "深蓝夜幕里流动的极光，安静又有张力。",
    quote: "MAKE SOMETHING WONDERFUL",
    bg: ["#0a0e1a", "#0d1730"],
    lights: [
      { x: 0.72, y: 0.28, r: 0.62, color: "#2de1c2", intensity: 0.5 },
      { x: 0.9, y: 0.62, r: 0.55, color: "#7b6cff", intensity: 0.42 },
      { x: 0.55, y: 0.85, r: 0.5, color: "#1f6dff", intensity: 0.3 },
    ],
    vignette: 0.32,
    dither: 1.3,
    colors: {
      background: "#0a0e1a", panel: "#111a2e", panelAlt: "#16233f",
      accent: "#2de1c2", accentAlt: "#5cf0d6", secondary: "#7b6cff",
      highlight: "#00d4a0", text: "#eaf4ff", muted: "#93a6c4",
      line: "rgba(45, 225, 194, .26)",
    },
  },
  {
    slug: "sakura-dawn",
    name: "樱粉晨曦",
    tagline: "把喜欢的粉色调进工作台，温柔但不刺眼。",
    quote: "MAKE SOMETHING WONDERFUL",
    blend: "tint",
    bg: ["#fbeaef", "#f3d4e0"],
    lights: [
      { x: 0.72, y: 0.26, r: 0.64, color: "#ff8fa6", intensity: 0.5 },
      { x: 0.92, y: 0.7, r: 0.56, color: "#ffc891", intensity: 0.44 },
      { x: 0.54, y: 0.92, r: 0.52, color: "#d3a8ec", intensity: 0.4 },
    ],
    vignette: 0.08,
    dither: 1.2,
    colors: {
      background: "#fdf3f5", panel: "#ffffff", panelAlt: "#fff5f8",
      accent: "#f0607a", accentAlt: "#f7889c", secondary: "#f5a3b3",
      highlight: "#d84a68", text: "#3a2a30", muted: "#9a8288",
      line: "rgba(240, 96, 122, .22)",
    },
  },
  {
    slug: "amber-dusk",
    name: "琥珀黄昏",
    tagline: "暖金色的黄昏光，适合长时间的深夜编码。",
    quote: "MAKE SOMETHING WONDERFUL",
    bg: ["#17110c", "#2a1c10"],
    lights: [
      { x: 0.76, y: 0.72, r: 0.66, color: "#ffb347", intensity: 0.5 },
      { x: 0.9, y: 0.32, r: 0.5, color: "#ff7a45", intensity: 0.4 },
      { x: 0.5, y: 0.95, r: 0.5, color: "#ffd27a", intensity: 0.32 },
    ],
    vignette: 0.34,
    dither: 1.3,
    colors: {
      background: "#17110c", panel: "#241a12", panelAlt: "#31241a",
      accent: "#ffb347", accentAlt: "#ffc772", secondary: "#ff8a5c",
      highlight: "#ffd27a", text: "#fff3e6", muted: "#c4a888",
      line: "rgba(255, 179, 71, .26)",
    },
  },
  {
    slug: "forest-mist",
    name: "森野薄雾",
    tagline: "墨绿与晨雾，给屏幕一点自然的呼吸。",
    quote: "MAKE SOMETHING WONDERFUL",
    bg: ["#0d1a16", "#122a20"],
    lights: [
      { x: 0.72, y: 0.3, r: 0.62, color: "#7fd1b9", intensity: 0.46 },
      { x: 0.9, y: 0.66, r: 0.52, color: "#c8e6a0", intensity: 0.36 },
      { x: 0.52, y: 0.9, r: 0.5, color: "#4db892", intensity: 0.3 },
    ],
    vignette: 0.32,
    dither: 1.3,
    colors: {
      background: "#0d1a16", panel: "#14261e", panelAlt: "#1b3328",
      accent: "#7fd1b9", accentAlt: "#a2e0cb", secondary: "#a8d98a",
      highlight: "#4db892", text: "#e8f5ee", muted: "#94b3a4",
      line: "rgba(127, 209, 185, .26)",
    },
  },
  {
    slug: "cyber-neon",
    name: "赛博霓虹",
    tagline: "近黑底色上的品红与青，高对比的赛博感。",
    quote: "MAKE SOMETHING WONDERFUL",
    bg: ["#07070d", "#0e0a1a"],
    lights: [
      { x: 0.7, y: 0.3, r: 0.58, color: "#16e0ff", intensity: 0.5 },
      { x: 0.92, y: 0.68, r: 0.56, color: "#ff2d95", intensity: 0.5 },
      { x: 0.5, y: 0.9, r: 0.5, color: "#b14dff", intensity: 0.36 },
    ],
    vignette: 0.36,
    dither: 1.4,
    colors: {
      background: "#07070d", panel: "#12101f", panelAlt: "#1a1630",
      accent: "#16e0ff", accentAlt: "#5eeaff", secondary: "#ff2d95",
      highlight: "#b14dff", text: "#eafcff", muted: "#8f93b8",
      line: "rgba(22, 224, 255, .26)",
    },
  },
];

function themeFor(spec) {
  return {
    schemaVersion: 1,
    id: `preset-${spec.slug}`,
    name: spec.name,
    brandSubtitle: "CODEX DREAM SKIN",
    tagline: spec.tagline,
    projectPrefix: "选择项目 · ",
    projectLabel: "◉  选择项目",
    statusText: "DREAM SKIN ONLINE",
    quote: spec.quote,
    image: "background.jpg",
    colors: spec.colors,
    ...PROMO,
  };
}

for (const spec of PRESETS) {
  const dir = path.join(here, `preset-${spec.slug}`);
  await fs.mkdir(dir, { recursive: true });
  const pngPath = path.join(dir, "background.png");
  const jpgPath = path.join(dir, "background.jpg");
  await fs.writeFile(pngPath, encodePng(WIDTH, HEIGHT, render(spec)));
  // Gradients compress ~10x as JPEG with no visible loss; sips ships with macOS.
  execFileSync(
    "/usr/bin/sips",
    ["-s", "format", "jpeg", "-s", "formatOptions", "86", pngPath, "--out", jpgPath],
    { stdio: "ignore" },
  );
  await fs.rm(pngPath, { force: true });
  await fs.writeFile(
    path.join(dir, "theme.json"),
    `${JSON.stringify(themeFor(spec), null, 2)}\n`,
  );
  const { size } = await fs.stat(jpgPath);
  console.log(`preset-${spec.slug}: ${(size / 1024).toFixed(0)} KB`);
}
console.log(`Generated ${PRESETS.length} presets at ${WIDTH}×${HEIGHT}.`);
