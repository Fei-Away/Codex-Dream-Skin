((cssText, artDataUrl, themeConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_DREAM_SKIN_DISABLED__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const RETRO_SHELL_ID = "codex-retro-shell";
  const RETRO_SHELL_VERSION = "4";
  const RETRO_COMPOSER_VERSION = "2";
  const RETRO_PROMPT_STORAGE_KEY = "codex-dream-skin:prompts:v1";
  const RETRO_PROMPT_LIMIT = 24;
  const RETRO_PROMPT_DEFAULTS = [
    {
      id: "review",
      label: "代码审查",
      text: "请审查当前改动，重点关注正确性、安全性、边界情况、兼容性和潜在回归；按优先级列出问题，并给出文件与行号。",
    },
    {
      id: "bug",
      label: "定位并修复 Bug",
      text: "请定位并修复这个问题。先复现并分析根因，再给出最小改动方案，最后运行相关测试验证。",
    },
    {
      id: "refactor",
      label: "重构并保持现有行为",
      text: "请在保持现有行为和对外接口不变的前提下重构这部分代码，优先提升可读性、可维护性和测试覆盖率。",
    },
    {
      id: "tests",
      label: "补充测试",
      text: "请为本次改动补充或完善测试，覆盖正常流程、边界情况和失败路径，并实际运行测试。",
    },
    {
      id: "explain",
      label: "解释这段代码",
      text: "请解释这段代码的工作流程、关键数据流、依赖关系和可能的风险；先给结论，再展开细节。",
    },
    {
      id: "pr",
      label: "生成 PR 描述",
      text: "请整理当前改动，生成标准 PR 描述，包括背景、变更内容、验证结果、风险和后续事项。",
    },
    {
      id: "visual-qa",
      label: "对照截图检查",
      text: "请对照参考截图逐项检查布局、间距、字体、颜色、溢出和响应式表现，并直接修复可验证的问题。",
    },
  ];
  const RETRO_NATIVE_ENV_CLASS = "dream-retro-native-env-hidden";
  const RETRO_ENV_ATTR = "data-retro-environment";
  const RETRO_FRIENDS_HIDDEN_ATTR = "data-retro-friends-hidden";
  const RETRO_SETTINGS_ATTR = "data-retro-settings";
  const RETRO_SETTINGS_SURFACE_ATTR = "data-retro-settings-surface";
  const SHELL_ATTR = "data-dream-shell";
  const ART_ATTRS = [
    "data-dream-art-wide", "data-dream-art-safe", "data-dream-task-mode",
    "data-dream-art-safe-area", "data-dream-art-task-mode", "data-dream-art-aspect",
    "data-dream-art-ready",
  ];
  const VERSION = __DREAM_SKIN_VERSION_JSON__;
  const STYLE_REVISION = __DREAM_SKIN_STYLE_REVISION_JSON__;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const RETRO_LAYOUT = THEME.layoutMode === "qq2007";
  const ART = THEME.art && typeof THEME.art === "object" ? THEME.art : {};
  const ART_METADATA = THEME.artMetadata && typeof THEME.artMetadata === "object"
    ? THEME.artMetadata : null;
  const ANALYSIS_CACHE_KEY = "__CODEX_DREAM_SKIN_ANALYSIS_CACHE__";
  const THEME_VARIABLES = [
    "--ds-bg", "--ds-panel", "--ds-panel-2", "--ds-green", "--ds-lime",
    "--ds-cyan", "--ds-purple", "--ds-text", "--ds-muted", "--ds-line",
    "--ds-bg-rgb", "--ds-panel-rgb", "--ds-panel-2-rgb", "--ds-accent-rgb",
    "--ds-accent-alt-rgb", "--ds-secondary-rgb", "--ds-highlight-rgb",
    "--ds-text-rgb", "--ds-muted-rgb", "--ds-line-rgb",
    "--dream-art-focus-x", "--dream-art-focus-y", "--dream-art-position",
    "--dream-skin-focus-x", "--dream-skin-focus-y", "--dream-skin-art-position",
    "--dream-skin-name", "--dream-skin-tagline", "--dream-skin-project-prefix",
    "--dream-skin-project-label",
  ];
  const installToken = {};
  const existingAnalysisCache = window[ANALYSIS_CACHE_KEY];
  const analysisCache = existingAnalysisCache && typeof existingAnalysisCache.get === "function" &&
    typeof existingAnalysisCache.set === "function" ? existingAnalysisCache : new Map();
  window[ANALYSIS_CACHE_KEY] = analysisCache;
  let artAnalysis = typeof THEME.artKey === "string" ? analysisCache.get(THEME.artKey) ?? null : null;
  let analysisTimer = null;
  let samplingNativeShell = false;
  let rootObserver = null;
  let routeObserver = null;
  let lastRetroRouteSignature = "";
  const now = () => typeof performance === "object" && typeof performance.now === "function"
    ? performance.now() : Date.now();
  const metrics = {
    ensureCalls: 0,
    rootPasses: 0,
    routePasses: 0,
    layoutReads: 0,
    attributeWrites: 0,
    styleWrites: 0,
    textWrites: 0,
    analysisRuns: 0,
    analysisCacheHits: artAnalysis ? 1 : 0,
    firstEnsureMs: null,
    analysisMs: null,
  };
  window[DISABLED_KEY] = false;

  const previous = window[STATE_KEY];
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();

  if (previous?.observer) previous.observer.disconnect();
  if (previous?.rootObserver) previous.rootObserver.disconnect();
  if (previous?.routeObserver) previous.routeObserver.disconnect();
  if (previous?.resizeObserver) previous.resizeObserver.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.routeTimer) clearInterval(previous.routeTimer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(previous.scheduler.frame);
  }
  if (previous?.analysisTimer) clearTimeout(previous.analysisTimer);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
  if (previous?.routeActionHandler && typeof document.removeEventListener === "function") {
    document.removeEventListener("click", previous.routeActionHandler);
  }
  if (previous?.promptMenuCleanup) previous.promptMenuCleanup();
  if (previous?.mediaHandler && previous?.mediaQuery) {
    try { previous.mediaQuery.removeEventListener("change", previous.mediaHandler); } catch {}
  }

  const cssString = (value) => JSON.stringify(String(value ?? ""));

  const setStyleProperty = (root, name, value) => {
    if (root.style.getPropertyValue(name) !== value) {
      root.style.setProperty(name, value);
      metrics.styleWrites += 1;
    }
  };

  const setAttribute = (root, name, value) => {
    const normalized = String(value);
    if (root.getAttribute(name) !== normalized) {
      root.setAttribute(name, normalized);
      metrics.attributeWrites += 1;
    }
  };

  const setTextContent = (node, value) => {
    if (node && node.textContent !== value) {
      node.textContent = value;
      metrics.textWrites += 1;
    }
  };

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const hex = String(value).trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const number = Number.parseInt(hex[1], 16);
      return { r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
    }
    const m = String(value).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const rgbString = (value) => {
    const rgb = parseRgb(value);
    return rgb ? `${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)}` : null;
  };

  const rgbToHex = ({ r, g, b }) => `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;

  const rgbToHsl = ({ r, g, b }) => {
    const values = [r, g, b].map((value) => value / 255);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const lightness = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue;
    if (max === values[0]) hue = (values[1] - values[2]) / delta + (values[1] < values[2] ? 6 : 0);
    else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
    else hue = (values[0] - values[1]) / delta + 4;
    return { h: hue * 60, s: saturation, l: lightness };
  };

  const hslToRgb = ({ h, s, l }) => {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
      const neutral = Math.round(l * 255);
      return { r: neutral, g: neutral, b: neutral };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset) => {
      let t = hue + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: channel(1 / 3) * 255, g: channel(0) * 255, b: channel(-1 / 3) * 255 };
  };

  const luminance = ({ r, g, b }) => {
    const lin = [r, g, b].map((c) => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  /** Detect Codex app light/dark shell for CSS branching. */
  const detectShellMode = () => {
    const root = document.documentElement;
    const body = document.body;
    const cls = `${root.className || ""} ${body?.className || ""}`.toLowerCase();

    if (/\b(dark|theme-dark|appearance-dark)\b/.test(cls)) return "dark";
    if (/\b(light|theme-light|appearance-light)\b/.test(cls)) return "light";

    const dataTheme = (
      root.getAttribute("data-theme") ||
      root.getAttribute("data-appearance") ||
      root.getAttribute("data-color-mode") ||
      body?.getAttribute("data-theme") ||
      body?.getAttribute("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    // Radios in profile menu (if present in DOM)
    const checked = document.querySelector('input[name="appearance-theme"]:checked');
    if (checked) {
      const label = (checked.getAttribute("aria-label") || checked.value || "").toLowerCase();
      if (label.includes("暗") || label.includes("dark")) return "dark";
      if (label.includes("浅") || label.includes("light")) return "light";
      if (label.includes("系统") || label.includes("system")) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    }

    // The skin itself declares color-scheme on :root.  Once installed,
    // reading getComputedStyle(root) directly would therefore keep `auto`
    // themes locked to the previous shell mode. Temporarily remove only our
    // own root class/attribute, sample the native computed scheme, then restore
    // synchronously. Mutation records created by this probe are drained below
    // so the root observer does not schedule a redundant ensure pass.
    try {
      const hadSkin = root.classList.contains("codex-dream-skin");
      const savedShell = root.getAttribute(SHELL_ATTR);
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove("codex-dream-skin");
      if (savedShell !== null) root.removeAttribute(SHELL_ATTR);
      let colorScheme = "";
      try {
        colorScheme = getComputedStyle(root).colorScheme || "";
      } finally {
        if (hadSkin) root.classList.add("codex-dream-skin");
        if (savedShell !== null) root.setAttribute(SHELL_ATTR, savedShell);
        rootObserver?.takeRecords?.();
        samplingNativeShell = false;
      }
      if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
      if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
    } catch {
      samplingNativeShell = false;
    }

    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}

    // Only use surface luminance before the skin owns those surfaces. Sampling
    // our own translucent layers would create route-dependent light/dark flips.
    if (!root.classList.contains("codex-dream-skin")) {
      const samples = [
        body,
        document.querySelector("main.main-surface"),
        document.querySelector("aside.app-shell-left-panel"),
      ].filter(Boolean);
      let votesLight = 0;
      let votesDark = 0;
      for (const el of samples) {
        try {
          const rgb = parseRgb(getComputedStyle(el).backgroundColor);
          if (!rgb) continue;
          const L = luminance(rgb);
          if (L >= 0.55) votesLight += 1;
          else if (L <= 0.25) votesDark += 1;
        } catch {}
      }
      if (votesLight > votesDark) return "light";
      if (votesDark > votesLight) return "dark";
    }
    return "light";
  };

  const makeAdaptivePalette = (sample, shell) => {
    const source = sample || { r: 108, g: 126, b: 136 };
    const hsl = rgbToHsl(source);
    const hue = hsl.s < 0.12 ? 214 : hsl.h;
    const saturation = clamp(hsl.s, 0.38, 0.72);
    const accent = hslToRgb({ h: hue, s: saturation, l: shell === "light" ? 0.42 : 0.66 });
    const accentAlt = hslToRgb({ h: hue + 12, s: saturation * 0.82, l: shell === "light" ? 0.52 : 0.73 });
    const secondary = hslToRgb({ h: hue - 24, s: saturation * 0.64, l: shell === "light" ? 0.56 : 0.62 });
    const highlight = hslToRgb({ h: hue + 24, s: saturation * 0.76, l: shell === "light" ? 0.36 : 0.58 });
    const neutral = (lightness, chroma = 0.08) => rgbToHex(hslToRgb({ h: hue, s: chroma, l: lightness }));
    return shell === "light" ? {
      background: neutral(0.965, 0.07),
      panel: neutral(0.987, 0.035),
      panelAlt: neutral(0.945, 0.09),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.13, 0.10),
      muted: neutral(0.42, 0.08),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .24)`,
    } : {
      background: neutral(0.055, 0.045),
      panel: neutral(0.085, 0.04),
      panelAlt: neutral(0.125, 0.05),
      accent: rgbToHex(accent),
      accentAlt: rgbToHex(accentAlt),
      secondary: rgbToHex(secondary),
      highlight: rgbToHex(highlight),
      text: neutral(0.93, 0.025),
      muted: neutral(0.69, 0.03),
      line: `rgba(${Math.round(accent.r)}, ${Math.round(accent.g)}, ${Math.round(accent.b)}, .28)`,
    };
  };

  const resolvedShell = () => {
    if (THEME.appearance === "light" || THEME.appearance === "dark") return THEME.appearance;
    // Image luminance may tune accents and scrims, but auto appearance follows
    // Codex/ChatGPT (or the OS fallback) so a bright wallpaper cannot flip a
    // native dark session back to a light shell after analysis.
    return detectShellMode();
  };

  const applyTheme = (root, shell) => {
    const colors = THEME.colors || {};
    const explicit = new Set(Array.isArray(THEME.explicitColorKeys) ? THEME.explicitColorKeys : []);
    const adaptive = makeAdaptivePalette(artAnalysis?.accentRgb, shell);
    const legacyLight = !THEME.appearance && shell === "light";
    const structural = new Set(["background", "panel", "panelAlt", "text", "muted"]);
    const pick = (name) => {
      const allowExplicit = explicit.has(name) && !(legacyLight && structural.has(name));
      return allowExplicit && typeof colors[name] === "string" ? colors[name] : adaptive[name];
    };
    const accent = pick("accent");
    const accentAlt = explicit.has("accentAlt") ? pick("accentAlt") : (explicit.has("accent") ? accent : adaptive.accentAlt);
    const variables = {
      "--ds-bg": pick("background"),
      "--ds-panel": pick("panel"),
      "--ds-panel-2": pick("panelAlt"),
      "--ds-green": accent,
      "--ds-lime": accentAlt,
      "--ds-cyan": pick("secondary"),
      "--ds-purple": pick("highlight"),
      "--ds-text": pick("text"),
      "--ds-muted": pick("muted"),
      "--ds-line": explicit.has("line") && typeof colors.line === "string" ? colors.line : adaptive.line,
    };

    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === "string" && value) setStyleProperty(root, name, value);
    }
    const rgbVariables = {
      "--ds-bg-rgb": variables["--ds-bg"],
      "--ds-panel-rgb": variables["--ds-panel"],
      "--ds-panel-2-rgb": variables["--ds-panel-2"],
      "--ds-accent-rgb": variables["--ds-green"],
      "--ds-accent-alt-rgb": variables["--ds-lime"],
      "--ds-secondary-rgb": variables["--ds-cyan"],
      "--ds-highlight-rgb": variables["--ds-purple"],
      "--ds-text-rgb": variables["--ds-text"],
      "--ds-muted-rgb": variables["--ds-muted"],
      "--ds-line-rgb": variables["--ds-line"],
    };
    for (const [name, value] of Object.entries(rgbVariables)) {
      const rgb = rgbString(value);
      if (rgb) setStyleProperty(root, name, rgb);
    }
    setStyleProperty(root, "--dream-skin-name", cssString(THEME.name || "Codex Dream Skin"));
    setStyleProperty(root, "--dream-skin-tagline", cssString(THEME.tagline || "Make something wonderful."));
    setStyleProperty(root, "--dream-skin-project-prefix", cssString(THEME.projectPrefix || "选择项目 · "));
    setStyleProperty(root, "--dream-skin-project-label", cssString(THEME.projectLabel || "◉  选择项目"));
  };

  const applyArtMetadata = (root) => {
    const profile = artAnalysis || ART_METADATA;
    const inferredSafe = profile?.safeArea || "center";
    const safeArea = ART.safeArea && ART.safeArea !== "auto" ? ART.safeArea : inferredSafe;
    const canonicalSafe = ["left", "right", "center", "none"].includes(safeArea)
      ? safeArea : "center";
    const focusX = typeof ART.focusX === "number" ? ART.focusX
      : profile?.focusX ?? (safeArea === "left" ? 0.72 : safeArea === "right" ? 0.28 : 0.5);
    const focusY = typeof ART.focusY === "number" ? ART.focusY : profile?.focusY ?? 0.5;
    const taskMode = ART.taskMode && ART.taskMode !== "auto"
      ? ART.taskMode : profile?.taskMode || "ambient";
    const wide = profile?.wide || false;
    const aspect = profile?.aspect || "unknown";
    const focusXValue = `${(clamp(focusX, 0, 1) * 100).toFixed(2)}%`;
    const focusYValue = `${(clamp(focusY, 0, 1) * 100).toFixed(2)}%`;

    setAttribute(root, "data-dream-art-wide", wide ? "true" : "false");
    setAttribute(root, "data-dream-art-safe", canonicalSafe);
    setAttribute(root, "data-dream-task-mode", taskMode);
    setAttribute(root, "data-dream-art-safe-area", safeArea);
    setAttribute(root, "data-dream-art-task-mode", taskMode);
    setAttribute(root, "data-dream-art-aspect", aspect);
    setAttribute(root, "data-dream-art-ready", artAnalysis ? "true" : "false");
    setStyleProperty(root, "--dream-art-focus-x", focusXValue);
    setStyleProperty(root, "--dream-art-focus-y", focusYValue);
    setStyleProperty(root, "--dream-art-position", `${focusXValue} ${focusYValue}`);
    setStyleProperty(root, "--dream-skin-focus-x", focusXValue);
    setStyleProperty(root, "--dream-skin-focus-y", focusYValue);
    setStyleProperty(root, "--dream-skin-art-position", `${focusXValue} ${focusYValue}`);
  };

  const analyzeArt = () => new Promise((resolve) => {
    const startedAt = now();
    metrics.analysisRuns += 1;
    if (typeof window.Image !== "function" || !document?.createElement) {
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(null);
      return;
    }
    const image = new window.Image();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (analysisTimer) clearTimeout(analysisTimer);
      analysisTimer = null;
      metrics.analysisMs = Number((now() - startedAt).toFixed(3));
      resolve(value);
    };
    analysisTimer = setTimeout(() => finish(null), 6000);
    image.onerror = () => finish(null);
    image.onload = () => {
      try {
        const ratio = image.naturalWidth / image.naturalHeight;
        if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("Invalid image dimensions");
        const maxDimension = 96;
        const width = Math.max(16, Math.round(ratio >= 1 ? maxDimension : maxDimension * ratio));
        const height = Math.max(16, Math.round(ratio >= 1 ? maxDimension / ratio : maxDimension));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const samples = new Array(width * height);
        const bins = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
        let lightTotal = 0;
        let count = 0;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            if (data[offset + 3] < 32) continue;
            const rgb = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
            const light = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
            const hsl = rgbToHsl(rgb);
            samples[y * width + x] = { light, saturation: hsl.s };
            lightTotal += light;
            count += 1;
            if (hsl.s >= 0.16 && hsl.l >= 0.16 && hsl.l <= 0.86) {
              const bin = bins[Math.min(23, Math.floor(hsl.h / 15))];
              const weight = hsl.s * (1 - Math.abs(hsl.l - 0.52) * 0.85);
              bin.weight += weight;
              bin.r += rgb.r * weight;
              bin.g += rgb.g * weight;
              bin.b += rgb.b * weight;
            }
          }
        }
        if (!count) throw new Error("Image has no visible pixels");
        const brightness = lightTotal / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let pixels = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = samples[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              pixels += 1;
              const previous = x > start ? samples[y * width + x - 1] : null;
              const above = y > 0 ? samples[(y - 1) * width + x] : null;
              if (previous) { edges += Math.abs(sample.light - previous.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = pixels ? total / pixels : 0;
          const variance = pixels ? Math.max(0, totalSquared / pixels - mean * mean) : 1;
          return Math.sqrt(variance) * 0.58 + (edgeCount ? edges / edgeCount : 1) * 0.42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * 0.38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * 0.86) safeArea = "left";
        else if (rightInformation < leftInformation * 0.86) safeArea = "right";

        let saliencyTotal = 0;
        let saliencyX = 0;
        let saliencyY = 0;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const sample = samples[y * width + x];
            if (!sample) continue;
            const previous = x > 0 ? samples[y * width + x - 1] : null;
            const above = y > 0 ? samples[(y - 1) * width + x] : null;
            const edge = (previous ? Math.abs(sample.light - previous.light) : 0) +
              (above ? Math.abs(sample.light - above.light) : 0);
            const weight = 0.01 + Math.abs(sample.light - brightness) * 0.48 +
              sample.saturation * 0.34 + edge * 0.28;
            saliencyTotal += weight;
            saliencyX += (x + 0.5) / width * weight;
            saliencyY += (y + 0.5) / height * weight;
          }
        }
        let focusX = saliencyTotal ? saliencyX / saliencyTotal : 0.5;
        let focusY = saliencyTotal ? saliencyY / saliencyTotal : 0.5;
        if (safeArea === "left") focusX = Math.max(0.64, focusX);
        if (safeArea === "right") focusX = Math.min(0.36, focusX);
        focusX = clamp(focusX, 0.12, 0.88);
        focusY = clamp(focusY, 0.18, 0.82);

        const accentBin = bins.reduce((best, candidate) => candidate.weight > best.weight ? candidate : best, bins[0]);
        const accentRgb = accentBin.weight > 0 ? {
          r: accentBin.r / accentBin.weight,
          g: accentBin.g / accentBin.weight,
          b: accentBin.b / accentBin.weight,
        } : null;
        const aspect = ratio >= 2.25 ? "ultrawide" : ratio >= 1.45 ? "wide"
          : ratio >= 1.08 ? "landscape" : ratio >= 0.9 ? "square" : "portrait";
        finish({
          width: image.naturalWidth,
          height: image.naturalHeight,
          ratio,
          wide: ratio >= 1.75,
          aspect,
          brightness,
          shell: brightness >= 0.58 ? "light" : "dark",
          safeArea,
          focusX,
          focusY,
          taskMode: ratio >= 2.25 ? "banner" : "ambient",
          accentRgb,
        });
      } catch {
        finish(null);
      }
    };
    image.src = artUrl;
  });

  let chromeParts = null;
  let observedShellMain = null;
  let resizeObserver = null;
  const hiddenNativeEnvironmentLayers = new Set();
  let retroShell = null;
  let retroComposer = null;
  let retroPromptMenu = null;
  let retroPromptAnchor = null;
  let retroPromptOutsideHandler = null;
  let retroPromptItems = null;
  let retroPromptMode = "list";
  let retroPromptEditingId = null;
  let nativeEnvironmentShown = false;
  const retroSidebarLabels = new Map([
    ["New chat", "新建任务"],
    ["Pull requests", "拉取请求"],
    ["Sites", "站点"],
    ["Scheduled", "已安排"],
    ["Plugins", "插件"],
    ["Pinned", "置顶"],
    ["Projects", "项目"],
    ["Show more", "展开显示"],
  ]);

  const syncRetroSidebarLabels = () => {
    if (!RETRO_LAYOUT) return;
    for (const candidate of document.querySelectorAll("aside.app-shell-left-panel button, aside.app-shell-left-panel a")) {
      const text = (candidate.textContent || "").replace(/\s+/g, " ").trim();
      const label = retroSidebarLabels.get(text);
      if (label) {
        candidate.setAttribute("data-retro-label", label);
        const labelNode = [...candidate.querySelectorAll("span, div")].find((node) =>
          node.children.length === 0 && (node.textContent || "").replace(/\s+/g, " ").trim() === text);
        labelNode?.setAttribute("data-retro-label", label);
      }
    }
  };

  const isRetroVisible = (node) => {
    if (!node || !node.isConnected) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
      style.visibility !== "hidden" && style.opacity !== "0";
  };

  const retroActionLabel = (node) => [
    node.getAttribute("aria-label"),
    node.getAttribute("title"),
    node.textContent,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const findNativeAction = (patterns) => {
    const candidates = [...document.querySelectorAll("button, a, [role=button], [role=link], [role=menuitem]")];
    return candidates.find((candidate) => {
      return !candidate.closest(`#${RETRO_SHELL_ID}`) && isRetroVisible(candidate) &&
        patterns.some((pattern) => pattern.test(retroActionLabel(candidate)));
    }) || null;
  };

  const clickNativeAction = (patterns) => {
    const target = findNativeAction(patterns);
    if (!target) return false;
    target.click();
    return true;
  };

  const focusNativeComposer = () => {
    const composer = document.querySelector(".composer-surface-chrome");
    const target = composer?.querySelector("textarea, [contenteditable=\"true\"]");
    if (!target) return false;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
    return true;
  };

  const retroSettingsLabels = new Set([
    "General", "Profile", "Appearance", "Voice", "Configuration", "Personalization",
    "Pets", "Keyboard shortcuts", "Usage & billing", "Account", "Appshots",
    "Browser", "Computer use", "Hooks", "Connections", "Git", "Environments", "Worktrees",
    "Archived chats",
  ]);

  const isRetroSettingsRoute = () => {
    if (!document.body) return false;
    const actions = [...document.querySelectorAll(
      "button, a, [aria-label], [role=button], [role=link], [role=menuitem], [role=tab]",
    )];
    const hasBack = actions.some((candidate) => !candidate.closest(`#${RETRO_SHELL_ID}`) && isRetroVisible(candidate) &&
      /^(back to app|返回应用)$/i.test(retroActionLabel(candidate)));
    if (hasBack) return true;
    const hasSettingsNavigation = actions.some((candidate) => {
      if (candidate.closest(`#${RETRO_SHELL_ID}`) || !isRetroVisible(candidate)) return false;
      const label = (candidate.getAttribute("aria-label") || candidate.textContent || "")
        .replace(/\s+/g, " ").trim();
      return retroSettingsLabels.has(label);
    });
    if (hasSettingsNavigation) return true;
    return [...document.querySelectorAll("h1, h2, h3")].some((candidate) =>
      isRetroVisible(candidate) && /^(environments|环境)$/i.test((candidate.textContent || "").trim()));
  };

  const retroRouteSignature = () => {
    const settings = RETRO_LAYOUT && isRetroSettingsRoute();
    const hasMain = Boolean(document.querySelector("main.main-surface"));
    return `${settings ? "settings" : "app"}|${hasMain ? "main" : "surface"}`;
  };

  const syncRetroSettingsSurface = (settings) => {
    const root = document.documentElement;
    if (!root || !document.body) return;
    if (!settings) {
      root.removeAttribute(RETRO_SETTINGS_ATTR);
      document.querySelectorAll(`[${RETRO_SETTINGS_SURFACE_ATTR}]`).forEach((candidate) => {
        candidate.removeAttribute(RETRO_SETTINGS_SURFACE_ATTR);
      });
      return;
    }
    setAttribute(root, RETRO_SETTINGS_ATTR, "true");
    const appRoot = [...document.body.children].find((candidate) =>
      candidate.id !== RETRO_SHELL_ID && candidate.id !== CHROME_ID && candidate.nodeName !== "STYLE");
    for (const candidate of document.querySelectorAll(`[${RETRO_SETTINGS_SURFACE_ATTR}]`)) {
      if (candidate !== appRoot) candidate.removeAttribute(RETRO_SETTINGS_SURFACE_ATTR);
    }
    if (appRoot) setAttribute(appRoot, RETRO_SETTINGS_SURFACE_ATTR, "true");
  };

  const syncRetroSettingsControls = (shell, settings) => {
    const back = shell?.querySelector('[data-retro-action="settings-back"]');
    if (!back) return;
    back.hidden = !settings;
    back.setAttribute("aria-hidden", String(!settings));
    back.tabIndex = settings ? 0 : -1;
  };

  const retroSessionTitle = () => {
    const selectors = [
      'main.main-surface > header.app-header-tint [data-app-action-thread-title]',
      'main.main-surface > header.app-header-tint [data-thread-title]',
      '[data-app-action-thread-title]',
      '[data-thread-title]',
    ];
    for (const selector of selectors) {
      for (const candidate of document.querySelectorAll(selector)) {
        const text = (candidate.textContent || candidate.getAttribute("aria-label") || candidate.getAttribute("title") || "")
          .replace(/\s+/g, " ").trim();
        if (text && !/^(Codex|\.\.\.|⌄)$/i.test(text)) return text;
      }
    }
    return "当前会话名称";
  };

  const syncRetroTitle = (shell) => {
    const title = retroSessionTitle();
    const label = shell?.querySelector(".retro-titlebar-label");
    setTextContent(label, `Codex 2007 - ${title}`);
    if (label) label.title = title;
  };

  const syncRetroFriendsPanel = (shell) => {
    const hidden = document.documentElement?.getAttribute(RETRO_FRIENDS_HIDDEN_ATTR) === "true";
    const toggle = shell?.querySelector('[data-retro-action="chat"]');
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(!hidden));
      toggle.setAttribute("aria-label", hidden ? "显示聊天好友" : "隐藏聊天好友");
      toggle.title = hidden ? "显示 Codex 好友" : "隐藏 Codex 好友";
    }
    const close = shell?.querySelector('[data-retro-action="close-friends"]');
    if (close) {
      close.setAttribute("aria-label", "关闭 Codex 好友");
      close.title = "关闭 Codex 好友";
    }
  };

  const toggleRetroFriendsPanel = () => {
    const root = document.documentElement;
    if (!root) return;
    const hidden = root.getAttribute(RETRO_FRIENDS_HIDDEN_ATTR) === "true";
    setAttribute(root, RETRO_FRIENDS_HIDDEN_ATTR, String(!hidden));
    syncRetroFriendsPanel(retroShell);
  };

  const retroComposerTarget = (composer) =>
    composer?.querySelector("textarea, [contenteditable=\"true\"]") || null;

  const retroComposerText = (composer) => {
    const target = retroComposerTarget(composer);
    if (!target) return "";
    return String("value" in target ? target.value : target.innerText || target.textContent || "")
      .replace(/\u200b/g, "")
      .trim();
  };

  const cleanRetroPromptValue = (value, max, singleLine = false) => {
    if (typeof value !== "string") return "";
    const normalized = value
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/g, "");
    const trimmed = singleLine ? normalized.replace(/\s+/g, " ").trim() : normalized.trim();
    return Array.from(trimmed).slice(0, max).join("");
  };

  const normalizeRetroPrompts = (value) => {
    if (!Array.isArray(value)) return null;
    const seen = new Set();
    const prompts = [];
    value.slice(0, RETRO_PROMPT_LIMIT).forEach((candidate, index) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
      const id = cleanRetroPromptValue(candidate.id, 80, true) || `prompt-${index + 1}`;
      const label = cleanRetroPromptValue(candidate.label, 48, true) || `Prompt ${index + 1}`;
      const text = cleanRetroPromptValue(candidate.text, 1400);
      if (!text || seen.has(id)) return;
      seen.add(id);
      prompts.push({ id, label, text });
    });
    return prompts;
  };

  const cloneRetroPrompts = (prompts) => prompts.map((prompt) => ({ ...prompt }));

  const retroPromptStorage = () => {
    try { return window.localStorage; } catch { return null; }
  };

  const retroPromptStorageKey = () =>
    `${RETRO_PROMPT_STORAGE_KEY}:${cleanRetroPromptValue(String(THEME.id || "custom"), 80, true) || "custom"}`;

  const baseRetroPrompts = () => {
    const configured = normalizeRetroPrompts(THEME.prompts);
    return cloneRetroPrompts(configured?.length ? configured : RETRO_PROMPT_DEFAULTS);
  };

  const loadRetroPrompts = () => {
    const storage = retroPromptStorage();
    if (!storage) return baseRetroPrompts();
    try {
      const raw = storage.getItem(retroPromptStorageKey());
      if (!raw) return baseRetroPrompts();
      const stored = normalizeRetroPrompts(JSON.parse(raw));
      return stored ?? baseRetroPrompts();
    } catch {
      return baseRetroPrompts();
    }
  };

  const saveRetroPrompts = (prompts) => {
    const normalized = normalizeRetroPrompts(prompts) || [];
    retroPromptItems = normalized;
    const storage = retroPromptStorage();
    if (!storage) return false;
    try {
      storage.setItem(retroPromptStorageKey(), JSON.stringify(normalized));
      return true;
    } catch {
      return false;
    }
  };

  const getRetroPrompts = () => {
    if (!retroPromptItems) retroPromptItems = loadRetroPrompts();
    return retroPromptItems;
  };

  const retroPromptById = (id) => getRetroPrompts().find((prompt) => prompt.id === id) || null;

  const nextRetroPromptId = () => {
    let id = `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let suffix = 1;
    while (retroPromptById(id)) id = `prompt-${Date.now().toString(36)}-${suffix++}`;
    return id;
  };

  const insertRetroComposerText = (value, { append = false } = {}) => {
    const composer = document.querySelector(".composer-surface-chrome");
    const target = retroComposerTarget(composer);
    if (!target) return false;
    const text = String(value ?? "");
    target.focus({ preventScroll: true });
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const start = append ? target.value.length : target.selectionStart ?? target.value.length;
      const end = append ? target.value.length : target.selectionEnd ?? start;
      target.setRangeText(text, start, end, "end");
      target.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }));
      return true;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch {}
    if (!inserted) {
      const paragraph = target.querySelector("p:last-child") || target;
      const fallback = document.createTextNode(text);
      const fallbackRange = document.createRange();
      fallbackRange.selectNodeContents(paragraph);
      fallbackRange.collapse(false);
      fallbackRange.insertNode(fallback);
      fallbackRange.setStartAfter(fallback);
      fallbackRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(fallbackRange);
    }
    target.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }));
    return true;
  };

  const retroPromptNode = (tagName, className, text) => {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const retroPromptActionButton = (action, label, promptId = "", className = "") => {
    const button = retroPromptNode("button", className, label);
    button.type = "button";
    button.dataset.retroPromptAction = action;
    if (promptId) button.dataset.retroPromptId = promptId;
    button.setAttribute("aria-label", label);
    return button;
  };

  const positionRetroPromptMenu = () => {
    if (!retroPromptMenu || !retroPromptAnchor?.getBoundingClientRect) return;
    const anchorRect = retroPromptAnchor.getBoundingClientRect();
    const menuRect = retroPromptMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 1024;
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 768;
    const margin = 8;
    const left = clamp(anchorRect.left, margin, Math.max(margin, viewportWidth - menuRect.width - margin));
    let top = anchorRect.top - menuRect.height - 6;
    if (top < margin) {
      top = Math.min(viewportHeight - menuRect.height - margin, anchorRect.bottom + 6);
    }
    retroPromptMenu.style.left = `${Math.round(left)}px`;
    retroPromptMenu.style.top = `${Math.round(Math.max(margin, top))}px`;
  };

  const closeRetroPromptMenu = () => {
    if (retroPromptOutsideHandler) {
      document.removeEventListener("click", retroPromptOutsideHandler);
      retroPromptOutsideHandler = null;
    }
    retroPromptMenu?.remove();
    retroPromptMenu = null;
    retroPromptAnchor = null;
    retroPromptMode = "list";
    retroPromptEditingId = null;
  };

  const insertRetroPrompt = (prompt) => {
    if (!prompt) return false;
    const composer = retroComposer || document.querySelector(".composer-surface-chrome");
    const target = retroComposerTarget(composer);
    if (!target) return false;
    const current = String("value" in target ? target.value : target.innerText || target.textContent || "");
    const prefix = current.trim() ? "\n\n" : "";
    const inserted = insertRetroComposerText(`${prefix}${prompt.text}`, { append: true });
    if (inserted) syncRetroComposerState(composer);
    return inserted;
  };

  const renderRetroPromptMenu = () => {
    if (!retroPromptMenu) return;
    retroPromptMenu.textContent = "";
    const title = retroPromptMode === "list" ? "常用 Prompt"
      : retroPromptMode === "manage" ? "管理 Prompt"
        : retroPromptEditingId ? "编辑 Prompt" : "新建 Prompt";
    const header = retroPromptNode("div", "retro-prompt-header");
    const headerTitle = retroPromptNode("div", "retro-prompt-title");
    if (retroPromptMode !== "list") {
      headerTitle.appendChild(retroPromptActionButton("back", "返回" , "", "retro-prompt-back"));
    }
    headerTitle.appendChild(retroPromptNode("strong", "", title));
    header.appendChild(headerTitle);
    const close = retroPromptActionButton("close", "关闭", "", "retro-prompt-close");
    close.textContent = "×";
    header.appendChild(close);
    retroPromptMenu.appendChild(header);

    if (retroPromptMode === "list") {
      const list = retroPromptNode("div", "retro-prompt-list");
      const prompts = getRetroPrompts();
      if (!prompts.length) {
        list.appendChild(retroPromptNode("div", "retro-prompt-empty", "还没有保存的 Prompt，点击下方新建。"));
      }
      for (const prompt of prompts) {
        const item = retroPromptActionButton("insert", "", prompt.id, "retro-prompt-item");
        const main = retroPromptNode("span", "retro-prompt-item-main");
        main.appendChild(retroPromptNode("strong", "retro-prompt-item-label", prompt.label));
        main.appendChild(retroPromptNode(
          "small",
          "retro-prompt-item-preview",
          prompt.text.replace(/\s+/g, " ").trim(),
        ));
        item.appendChild(main);
        item.setAttribute("title", prompt.text);
        list.appendChild(item);
      }
      retroPromptMenu.appendChild(list);
      const footer = retroPromptNode("div", "retro-prompt-footer");
      footer.appendChild(retroPromptActionButton("manage", "⚙ 管理 Prompt"));
      footer.appendChild(retroPromptActionButton("new", "＋ 新建 Prompt", "", "retro-prompt-primary"));
      retroPromptMenu.appendChild(footer);
    } else if (retroPromptMode === "manage") {
      const list = retroPromptNode("div", "retro-prompt-list retro-prompt-manage-list");
      const prompts = getRetroPrompts();
      if (!prompts.length) {
        list.appendChild(retroPromptNode("div", "retro-prompt-empty", "暂无 Prompt，点击下方新建。"));
      }
      prompts.forEach((prompt, index) => {
        const row = retroPromptNode("div", "retro-prompt-manage-row");
        const main = retroPromptActionButton("edit", "", prompt.id, "retro-prompt-manage-main");
        main.appendChild(retroPromptNode("strong", "retro-prompt-item-label", prompt.label));
        main.appendChild(retroPromptNode("small", "retro-prompt-item-preview", prompt.text.replace(/\s+/g, " ").trim()));
        row.appendChild(main);
        const controls = retroPromptNode("span", "retro-prompt-manage-controls");
        const up = retroPromptActionButton("up", "上移", prompt.id, "retro-prompt-control");
        const down = retroPromptActionButton("down", "下移", prompt.id, "retro-prompt-control");
        up.disabled = index === 0;
        down.disabled = index === prompts.length - 1;
        controls.appendChild(up);
        controls.appendChild(down);
        controls.appendChild(retroPromptActionButton("delete", "删除", prompt.id, "retro-prompt-control retro-prompt-danger"));
        row.appendChild(controls);
        list.appendChild(row);
      });
      retroPromptMenu.appendChild(list);
      const footer = retroPromptNode("div", "retro-prompt-footer");
      footer.appendChild(retroPromptActionButton("new", "＋ 新建 Prompt", "", "retro-prompt-primary"));
      retroPromptMenu.appendChild(footer);
    } else {
      const current = retroPromptById(retroPromptEditingId);
      const form = retroPromptNode("div", "retro-prompt-form");
      const labelField = retroPromptNode("label", "retro-prompt-field");
      labelField.appendChild(retroPromptNode("span", "", "名称"));
      const labelInput = retroPromptNode("input");
      labelInput.type = "text";
      labelInput.maxLength = 48;
      labelInput.value = current?.label || "";
      labelInput.dataset.retroPromptField = "label";
      labelInput.placeholder = "例如：检查安全问题";
      labelField.appendChild(labelInput);
      form.appendChild(labelField);
      const textField = retroPromptNode("label", "retro-prompt-field");
      textField.appendChild(retroPromptNode("span", "", "Prompt 内容"));
      const textInput = retroPromptNode("textarea");
      textInput.rows = 7;
      textInput.maxLength = 1400;
      textInput.value = current?.text || "";
      textInput.dataset.retroPromptField = "text";
      textInput.placeholder = "输入点击后要填入输入框的内容";
      textField.appendChild(textInput);
      form.appendChild(textField);
      form.appendChild(retroPromptNode("div", "retro-prompt-error"));
      retroPromptMenu.appendChild(form);
      const footer = retroPromptNode("div", "retro-prompt-footer retro-prompt-form-actions");
      footer.appendChild(retroPromptActionButton("cancel", "取消"));
      footer.appendChild(retroPromptActionButton("save", "保存", "", "retro-prompt-primary"));
      retroPromptMenu.appendChild(footer);
    }
    positionRetroPromptMenu();
  };

  const saveRetroPromptForm = () => {
    const labelField = retroPromptMenu?.querySelector('[data-retro-prompt-field="label"]');
    const textField = retroPromptMenu?.querySelector('[data-retro-prompt-field="text"]');
    const error = retroPromptMenu?.querySelector(".retro-prompt-error");
    const label = cleanRetroPromptValue(labelField?.value || "", 48, true);
    const text = cleanRetroPromptValue(textField?.value || "", 1400);
    if (!label || !text) {
      if (error) error.textContent = "请填写名称和 Prompt 内容。";
      return;
    }
    const prompts = getRetroPrompts();
    if (retroPromptEditingId) {
      const index = prompts.findIndex((prompt) => prompt.id === retroPromptEditingId);
      if (index >= 0) prompts[index] = { id: retroPromptEditingId, label, text };
    } else {
      prompts.push({ id: nextRetroPromptId(), label, text });
    }
    saveRetroPrompts(prompts);
    retroPromptMode = "manage";
    retroPromptEditingId = null;
    renderRetroPromptMenu();
  };

  const openRetroPromptMenu = (anchor) => {
    closeRetroPromptMenu();
    retroPromptItems = loadRetroPrompts();
    retroPromptAnchor = anchor;
    retroPromptMenu = retroPromptNode("div", "retro-prompt-menu");
    retroPromptMenu.setAttribute("role", "dialog");
    retroPromptMenu.setAttribute("aria-label", "常用 Prompt");
    retroPromptMenu.addEventListener("click", handleRetroPromptMenuClick);
    document.body?.appendChild(retroPromptMenu);
    renderRetroPromptMenu();
    retroPromptOutsideHandler = (event) => {
      const target = event.target;
      if (retroPromptMenu?.contains(target) || retroPromptAnchor?.contains(target)) return;
      closeRetroPromptMenu();
    };
    document.addEventListener("click", retroPromptOutsideHandler);
    positionRetroPromptMenu();
  };

  const toggleRetroPromptMenu = (anchor) => {
    if (retroPromptMenu && retroPromptAnchor === anchor) closeRetroPromptMenu();
    else openRetroPromptMenu(anchor);
  };

  const handleRetroPromptMenuClick = (event) => {
    const target = event.target.closest("[data-retro-prompt-action]");
    if (!target || !retroPromptMenu?.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    const action = target.dataset.retroPromptAction;
    const id = target.dataset.retroPromptId;
    if (action === "close") return closeRetroPromptMenu();
    if (action === "back") {
      retroPromptMode = "list";
      retroPromptEditingId = null;
      return renderRetroPromptMenu();
    }
    if (action === "insert") {
      if (insertRetroPrompt(retroPromptById(id))) closeRetroPromptMenu();
      return;
    }
    if (action === "manage") {
      retroPromptMode = "manage";
      return renderRetroPromptMenu();
    }
    if (action === "new" || action === "edit") {
      retroPromptMode = "edit";
      retroPromptEditingId = action === "edit" ? id : null;
      return renderRetroPromptMenu();
    }
    if (action === "cancel") {
      retroPromptMode = "manage";
      retroPromptEditingId = null;
      return renderRetroPromptMenu();
    }
    if (action === "save") return saveRetroPromptForm();
    if (action === "delete") {
      saveRetroPrompts(getRetroPrompts().filter((prompt) => prompt.id !== id));
      return renderRetroPromptMenu();
    }
    if (action === "up" || action === "down") {
      const prompts = getRetroPrompts();
      const index = prompts.findIndex((prompt) => prompt.id === id);
      const next = action === "up" ? index - 1 : index + 1;
      if (index >= 0 && next >= 0 && next < prompts.length) {
        [prompts[index], prompts[next]] = [prompts[next], prompts[index]];
        saveRetroPrompts(prompts);
        renderRetroPromptMenu();
      }
    }
  };

  const retroComposerHasAttachments = (composer) => {
    const host = composer?.querySelector('[class*="_attachmentsDefault_"]');
    return Boolean(host && (host.children.length > 0 || host.textContent?.trim()));
  };

  const syncRetroComposerState = (composer) => {
    if (!RETRO_LAYOUT || !composer) return;
    const root = document.documentElement;
    const hasAttachments = retroComposerHasAttachments(composer);
    const text = retroComposerText(composer);
    const editor = retroComposerTarget(composer);
    const editorScroller = composer.querySelector('[class*="_footer_"] [class*="overflow-y-auto"]');
    const overflowing = Boolean((editorScroller || editor) &&
      (editorScroller || editor).scrollHeight > (editorScroller || editor).clientHeight + 2);
    const baseState = hasAttachments ? (text ? "mixed" : "attachments") : (text ? "text" : "empty");
    const state = overflowing ? `${baseState}-scroll` : baseState;
    const height = hasAttachments ? 214 : 178;
    const reserve = hasAttachments ? 228 : 192;
    setStyleProperty(root, "--retro-composer-height", `${height}px`);
    setStyleProperty(root, "--retro-history-reserve", `${reserve}px`);
    setAttribute(composer, "data-retro-composer-state", state);
    setAttribute(composer, "data-retro-composer-has-attachments", String(hasAttachments));
    setAttribute(composer, "data-retro-composer-overflow", String(overflowing));
  };

  const createRetroComposerToolbar = () => {
    const toolbar = document.createElement("div");
    toolbar.className = "retro-composer-toolbar";
    toolbar.dataset.retroComposerToolbar = RETRO_COMPOSER_VERSION;
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "输入工具");
    toolbar.innerHTML = `
      <div class="retro-composer-toolbar-group">
        <button type="button" data-retro-composer-action="emoji" aria-label="表情" title="表情">
          <span class="retro-composer-tool-icon" aria-hidden="true">☺</span><b>表情</b>
        </button>
        <button type="button" data-retro-composer-action="image" aria-label="图片" title="选择图片">
          <span class="retro-composer-tool-icon" aria-hidden="true">▧</span><b>图片</b>
        </button>
        <button type="button" data-retro-composer-action="attach" aria-label="附加" title="附加文件">
          <span class="retro-composer-tool-icon" aria-hidden="true">∞</span><b>附加</b><i aria-hidden="true">⌄</i>
        </button>
      </div>
      <span class="retro-composer-toolbar-spacer" aria-hidden="true"></span>
      <button type="button" class="retro-composer-lightning" data-retro-composer-action="lightning" aria-label="输入快捷操作" title="输入快捷操作">
        <span aria-hidden="true">ϟ</span>
      </button>`;
    return toolbar;
  };

  const createRetroComposerBottomTools = () => {
    const tools = document.createElement("div");
    tools.className = "retro-composer-bottom-tools";
    tools.dataset.retroComposerBottomTools = RETRO_COMPOSER_VERSION;
    tools.setAttribute("role", "group");
    tools.setAttribute("aria-label", "编辑工具");
    tools.innerHTML = `
      <button type="button" data-retro-composer-action="prompts" aria-label="常用 Prompt" title="常用 Prompt">A</button>
      <button type="button" data-retro-composer-action="emoji" aria-label="表情" title="表情">☺</button>`;
    return tools;
  };

  const bindRetroComposerEvents = (composer) => {
    if (!composer || composer.dataset.retroComposerEventsBound === RETRO_COMPOSER_VERSION) return;
    composer.addEventListener("click", (event) => {
      const target = event.target.closest("[data-retro-composer-action]");
      if (!target || !composer.contains(target)) return;
      event.preventDefault();
      const action = target.dataset.retroComposerAction;
      if (action === "emoji") insertRetroComposerText("🙂");
      if (action === "prompts") toggleRetroPromptMenu(target);
      if (action === "image" || action === "attach") {
        composer.querySelector('button[aria-label="Add files and more"]')?.click();
      }
      if (action === "format") focusNativeComposer();
      if (action === "lightning") focusNativeComposer();
      syncRetroComposerState(composer);
    });
    composer.addEventListener("input", () => syncRetroComposerState(composer));
    composer.addEventListener("change", () => syncRetroComposerState(composer));
    composer.dataset.retroComposerEventsBound = RETRO_COMPOSER_VERSION;
  };

  const teardownRetroComposer = () => {
    closeRetroPromptMenu();
    document.querySelectorAll("[data-retro-composer-toolbar], [data-retro-composer-bottom-tools]")
      .forEach((node) => node.remove());
    document.querySelectorAll("[data-retro-native-add-file]")
      .forEach((node) => node.removeAttribute("data-retro-native-add-file"));
    document.documentElement?.style.removeProperty("--retro-composer-height");
    document.documentElement?.style.removeProperty("--retro-history-reserve");
    retroComposer = null;
  };

  const ensureRetroComposer = () => {
    if (!RETRO_LAYOUT) {
      teardownRetroComposer();
      return null;
    }
    const composer = document.querySelector(".composer-surface-chrome");
    if (!composer) {
      teardownRetroComposer();
      return null;
    }
    let toolbar = composer.querySelector("[data-retro-composer-toolbar]");
    if (toolbar && toolbar.dataset.retroComposerToolbar !== RETRO_COMPOSER_VERSION) {
      toolbar.remove();
      toolbar = null;
    }
    if (!toolbar) {
      toolbar = createRetroComposerToolbar();
      composer.insertBefore(toolbar, composer.firstElementChild);
    }
    let bottomTools = composer.querySelector("[data-retro-composer-bottom-tools]");
    if (bottomTools && bottomTools.dataset.retroComposerBottomTools !== RETRO_COMPOSER_VERSION) {
      bottomTools.remove();
      bottomTools = null;
    }
    if (!bottomTools) {
      const leftCell = composer.querySelector('[class~="col-start-1"][class~="row-start-2"]');
      const actionHost = [...(leftCell?.querySelectorAll("div") || [])].find((node) =>
        node.classList.contains("min-w-0") && node.classList.contains("items-center")) || leftCell;
      if (actionHost) {
        bottomTools = createRetroComposerBottomTools();
        actionHost.insertBefore(bottomTools, actionHost.firstElementChild);
      }
    }
    for (const button of composer.querySelectorAll('button[aria-label="Add files and more"]')) {
      button.setAttribute("data-retro-native-add-file", "true");
    }
    bindRetroComposerEvents(composer);
    syncRetroComposerState(composer);
    retroComposer = composer;
    return composer;
  };

  const syncRetroStatusBar = (shell) => {
    const status = shell?.querySelector("[data-retro-status]");
    if (!status) return;
    const composer = document.querySelector(".composer-surface-chrome");
    const composerText = [...(composer?.querySelectorAll("button") ?? [])]
      .map((candidate) => (candidate.innerText || candidate.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const model = composerText.find((text) => /(?:Luna|GPT|Claude|模型|Max)/i.test(text));
    const time = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    status.textContent = `安全　${model || "在线"}　${time}`;
    status.title = model ? `当前模型：${model}` : "当前会话在线";
  };

  const collectNativeEnvironmentLayers = () => {
    const layers = new Set();
    const headers = [...document.querySelectorAll("header")].filter((candidate) =>
      /^Environment$/i.test((candidate.textContent || "").trim()));
    for (const header of headers) {
      const layer = header.closest("div.pointer-events-none.absolute") ||
        header.closest('div[class*="pointer-events-none"][class*="absolute"]');
      if (layer) layers.add(layer);
    }
    for (const layer of document.querySelectorAll('[data-pip-obstacle="thread-summary-panel"]')) {
      const hasEnvironment = [...layer.querySelectorAll("span, button")].some((candidate) =>
        /^Environment$/i.test((candidate.textContent || "").trim()));
      if (hasEnvironment) layers.add(layer);
    }
    return [...layers];
  };

  const syncNativeEnvironmentLayer = () => {
    if (nativeEnvironmentShown || document.documentElement?.getAttribute(RETRO_ENV_ATTR) === "shown") {
      nativeEnvironmentShown = true;
      return;
    }
    for (const layer of collectNativeEnvironmentLayers()) {
      layer.classList.add(RETRO_NATIVE_ENV_CLASS);
      hiddenNativeEnvironmentLayers.add(layer);
    }
  };

  const restoreNativeEnvironmentLayers = () => {
    for (const layer of hiddenNativeEnvironmentLayers) layer.classList.remove(RETRO_NATIVE_ENV_CLASS);
    for (const layer of document.querySelectorAll(`.${RETRO_NATIVE_ENV_CLASS}`)) {
      layer.classList.remove(RETRO_NATIVE_ENV_CLASS);
    }
    hiddenNativeEnvironmentLayers.clear();
  };

  const teardownRetroShell = () => {
    teardownRetroComposer();
    restoreNativeEnvironmentLayers();
    document.querySelectorAll("[data-retro-label]").forEach((candidate) => {
      candidate.removeAttribute("data-retro-label");
    });
    nativeEnvironmentShown = false;
    document.documentElement?.removeAttribute(RETRO_ENV_ATTR);
    document.documentElement?.removeAttribute(RETRO_FRIENDS_HIDDEN_ATTR);
    document.documentElement?.removeAttribute(RETRO_SETTINGS_ATTR);
    document.querySelectorAll(`[${RETRO_SETTINGS_SURFACE_ATTR}]`).forEach((candidate) => {
      candidate.removeAttribute(RETRO_SETTINGS_SURFACE_ATTR);
    });
    document.getElementById(RETRO_SHELL_ID)?.remove();
    retroShell = null;
  };

  const bindRetroShellEvents = (shell) => {
    if (!shell || shell.dataset.retroEventsBound === "true") return;
    shell.addEventListener("click", (event) => {
      const target = event.target.closest("[data-retro-action]");
      if (!target) return;
      event.preventDefault();
      const action = target.dataset.retroAction;
      const actions = {
        "new-chat": [/^new chat$/i, /^新建任务$/],
        scheduled: [/^scheduled$/i, /^已安排$/],
        plugins: [/^plugins$/i, /^插件$/],
        sites: [/^sites$/i, /^站点$/],
        "pull-requests": [/^pull requests?$/i, /^拉取请求$/],
        "open-settings": [/^settings(?:\s+⌘,)?$/i, /^设置$/],
      };
      if (action === "settings-back") {
        const nativeBack = findNativeAction([/^back to app$/i, /^返回应用$/]);
        if (nativeBack) {
          nativeBack.click();
        } else {
          const fallback = [...document.querySelectorAll(
            'button[aria-label="Back"], a[aria-label="Back"], [role="link"]',
          )].find((candidate) => isRetroVisible(candidate) &&
            /^(back|返回)$/i.test(retroActionLabel(candidate)));
          fallback?.click();
        }
        return;
      }
      if (actions[action]) clickNativeAction(actions[action]);
      if (action === "focus-composer") focusNativeComposer();
      if (action === "chat" || action === "close-friends") toggleRetroFriendsPanel();
      if (action === "show-environment") {
        if (!collectNativeEnvironmentLayers().length) return;
        nativeEnvironmentShown = true;
        document.documentElement?.setAttribute(RETRO_ENV_ATTR, "shown");
        restoreNativeEnvironmentLayers();
        target.hidden = true;
        target.setAttribute("aria-hidden", "true");
      }
    });
    shell.dataset.retroEventsBound = "true";
  };

  const ensureRetroShell = (home, settings = false) => {
    if (!RETRO_LAYOUT || !document.body) return null;
    let shell = document.getElementById(RETRO_SHELL_ID);
    if (shell && shell.dataset.retroShellVersion !== RETRO_SHELL_VERSION) {
      shell.remove();
      shell = null;
    }
    if (!shell || shell.parentElement !== document.body) {
      shell?.remove();
      shell = document.createElement("div");
      shell.id = RETRO_SHELL_ID;
      shell.dataset.retroShellVersion = RETRO_SHELL_VERSION;
      shell.setAttribute("data-retro-route", settings ? "settings" : home ? "home" : "task");
      shell.innerHTML = `
        <div class="retro-titlebar" aria-hidden="true">
          <span class="retro-titlebar-logo">C</span>
          <span class="retro-titlebar-label">Codex 2007 - 当前会话名称</span>
          <span class="retro-window-buttons"><i></i><i></i><i></i></span>
        </div>
        <nav class="retro-toolbar" aria-label="Codex 2007 工具栏">
          <button type="button" class="retro-settings-back" data-retro-action="settings-back" aria-label="返回应用" title="返回应用" hidden><span>↩</span><b>返回应用</b></button>
          <button type="button" data-retro-action="new-chat" aria-label="新建任务" title="新建任务"><span>✎</span><b>新建任务</b></button>
          <button type="button" data-retro-action="scheduled" aria-label="已安排" title="已安排"><span>◷</span><b>已安排</b></button>
          <span class="retro-toolbar-separator" aria-hidden="true"></span>
          <button type="button" data-retro-action="focus-composer" aria-label="当前会话" title="聚焦当前会话"><span>▣</span><b>当前会话</b></button>
          <button type="button" data-retro-action="plugins" aria-label="插件" title="插件"><span>✣</span><b>插件</b></button>
          <button type="button" data-retro-action="sites" aria-label="站点" title="站点"><span>▤</span><b>站点</b></button>
          <button type="button" data-retro-action="pull-requests" aria-label="拉取请求" title="拉取请求"><span>⑂</span><b>拉取请求</b></button>
          <button type="button" data-retro-action="chat" aria-label="显示聊天好友" title="显示 Codex 好友" aria-controls="codex-retro-friends-panel"><span>☏</span><b>聊天</b></button>
        </nav>
        <aside id="codex-retro-friends-panel" class="retro-friends-panel" aria-label="Codex 好友">
          <header>
            <strong><button type="button" class="retro-panel-close" data-retro-action="close-friends">×</button>Codex 好友</strong>
            <span class="retro-panel-tools">↗⌄</span>
          </header>
          <section class="retro-assistant-card">
            <div class="retro-mascot" aria-hidden="true"><span>›_‹</span></div>
            <div class="retro-online"><i></i><b>Codex 小蓝</b><em>LV 07</em></div>
            <p>代码有问题？找我！<br>我是你的智能伙伴 Codex<br>陪你写代码、改 Bug、查文档，超可靠哦！</p>
            <div class="retro-quick-actions" aria-label="常用功能">
              <button type="button" data-retro-action="focus-composer" title="当前任务"><span>▣</span></button>
              <button type="button" data-retro-action="sites" title="项目"><span>▤</span></button>
              <button type="button" data-retro-action="scheduled" title="已安排"><span>★</span></button>
              <button type="button" data-retro-action="open-settings" title="设置"><span>⚙</span></button>
              <button type="button" data-retro-action="show-environment" title="Environment"><span>☁</span></button>
            </div>
          </section>
          <section class="retro-friend-list">
            <header><span>⌄</span>我的好友 <em>（2/8）</em><b>⌃</b></header>
            <div class="retro-friend-row"><span class="retro-avatar retro-avatar-one">A</span><b>Asta Xie</b><i>●</i></div>
            <div class="retro-friend-row"><span class="retro-avatar retro-avatar-two">C</span><b>Codex 小蓝</b><i>●</i></div>
          </section>
      </aside>
        <footer class="retro-dock" aria-hidden="true">
          <span>◉</span><span>●</span><span>★</span><span>✉</span><span>▣</span><span>◈</span>
          <span class="retro-dock-spacer"></span><small data-retro-status>安全　在线　00:00</small>
        </footer>`;
      document.body.appendChild(shell);
    }
    bindRetroShellEvents(shell);
    shell.dataset.retroRoute = settings ? "settings" : home ? "home" : "task";
    retroShell = shell;
    syncRetroTitle(shell);
    syncRetroFriendsPanel(shell);
    syncRetroSettingsControls(shell, settings);
    nativeEnvironmentShown = document.documentElement?.getAttribute(RETRO_ENV_ATTR) === "shown";
    if (nativeEnvironmentShown) restoreNativeEnvironmentLayers();
    const friendList = shell.querySelector(".retro-friend-list");
    const quickActionsHost = shell.querySelector(".retro-assistant-card") || friendList;
    let quickActions = shell.querySelector(".retro-quick-actions");
    if (!quickActions && quickActionsHost) {
      friendList.querySelector('[data-retro-action="show-environment"]')?.remove();
      quickActions = document.createElement("div");
      quickActions.className = "retro-quick-actions";
      quickActions.setAttribute("aria-label", "常用功能");
      quickActions.innerHTML = `
        <button type="button" data-retro-action="focus-composer" title="当前任务"><span>▣</span></button>
        <button type="button" data-retro-action="sites" title="项目"><span>▤</span></button>
        <button type="button" data-retro-action="scheduled" title="已安排"><span>★</span></button>
        <button type="button" data-retro-action="open-settings" title="设置"><span>⚙</span></button>
        <button type="button" data-retro-action="show-environment" title="Environment"><span>☁</span></button>`;
      quickActionsHost.appendChild(quickActions);
    }
    const environmentButton = quickActions?.querySelector('[data-retro-action="show-environment"]');
    if (environmentButton) {
      const environmentAvailable = nativeEnvironmentShown || collectNativeEnvironmentLayers().length > 0;
      environmentButton.hidden = nativeEnvironmentShown;
      environmentButton.disabled = !environmentAvailable;
      environmentButton.setAttribute("aria-hidden", String(nativeEnvironmentShown));
      environmentButton.setAttribute("aria-disabled", String(!environmentAvailable));
      environmentButton.title = environmentAvailable ? "Environment" : "Environment 暂不可用";
    }
    syncRetroStatusBar(shell);
    syncNativeEnvironmentLayer();
    return shell;
  };

  const ensureStyle = (root) => {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = cssText;
      style.dataset.dreamSkinVersion = VERSION;
      (document.head || root).appendChild(style);
    } else if (style.dataset.dreamSkinStyleRevision !== STYLE_REVISION) {
      style.textContent = cssText;
    }
    style.dataset.dreamSkinVersion = VERSION;
    style.dataset.dreamSkinStyleRevision = STYLE_REVISION;
    return style;
  };

  const applyRootState = (root) => {
    metrics.rootPasses += 1;
    ensureStyle(root);
    const shell = resolvedShell();
    setAttribute(root, SHELL_ATTR, shell);
    setStyleProperty(root, "--dream-skin-art", `url("${artUrl}")`);
    applyTheme(root, shell);
    applyArtMetadata(root);
    root.classList.add("codex-dream-skin");
    root.classList.remove("dream-retro-2007");
    root.classList.toggle("dream-retro-2007-layout", RETRO_LAYOUT);
    return shell;
  };

  const syncRouteState = (shell, { layout = false } = {}) => {
    metrics.routePasses += 1;
    const root = document.documentElement;
    if (!root) return;
    shell ||= root.getAttribute(SHELL_ATTR) || resolvedShell();
    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const settings = RETRO_LAYOUT && isRetroSettingsRoute();
    const homeIndicator = document.querySelector('[data-testid="home-icon"]');
    const home = homeIndicator?.closest('[role="main"]') ||
      [...document.querySelectorAll('[role="main"]')].find((candidate) =>
        candidate.querySelector('[data-feature="game-source"]') &&
        candidate.querySelector('.group\\\\/home-suggestions')) || null;
    for (const candidate of document.querySelectorAll('[role="main"].dream-skin-home')) {
      if (candidate !== home) candidate.classList.remove("dream-skin-home");
    }
    if (home) home.classList.add("dream-skin-home");
    const homeUtilityBars = new Set(home
      ? home.querySelectorAll('[class*="_homeUtilityBar_"]')
      : []);
    for (const candidate of document.querySelectorAll(".dream-skin-home-utility")) {
      if (!homeUtilityBars.has(candidate)) candidate.classList.remove("dream-skin-home-utility");
    }
    for (const candidate of homeUtilityBars) candidate.classList.add("dream-skin-home-utility");

    if (!document.body) return;
    if (RETRO_LAYOUT) {
      syncRetroSettingsSurface(settings);
      ensureRetroShell(Boolean(home), settings);
      if (shellMain) {
        ensureRetroComposer();
        syncRetroSidebarLabels();
      } else {
        teardownRetroComposer();
      }
    }
    else teardownRetroShell();
    if (!shellMain) return;
    if (observedShellMain !== shellMain) {
      resizeObserver?.disconnect();
      resizeObserver?.observe(shellMain);
      observedShellMain = shellMain;
      layout = true;
    }
    shellMain.classList.toggle("dream-skin-home-shell", Boolean(home));
    let chrome = document.getElementById(CHROME_ID);
    let created = false;
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <div class="dream-skin-brand">
          <span class="dream-skin-portal-mark">◉</span>
          <span><b></b><small></small></span>
        </div>
        <div class="dream-skin-status"><i></i><span></span></div>
        <div class="dream-skin-quote"></div>
        <div class="dream-skin-particles"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="dream-skin-orbit"></div>`;
      document.body.appendChild(chrome);
      created = true;
      chromeParts = null;
    }
    if (!chromeParts || chromeParts.chrome !== chrome) {
      chromeParts = {
        chrome,
        name: chrome.querySelector(".dream-skin-brand b"),
        subtitle: chrome.querySelector(".dream-skin-brand small"),
        status: chrome.querySelector(".dream-skin-status span"),
        quote: chrome.querySelector(".dream-skin-quote"),
      };
    }
    setTextContent(chromeParts.name, THEME.name || "Codex Dream Skin");
    setTextContent(chromeParts.subtitle, THEME.brandSubtitle || "CODEX DREAM SKIN");
    setTextContent(chromeParts.status, THEME.statusText || "DREAM SKIN ONLINE");
    setTextContent(chromeParts.quote, THEME.quote || "MAKE SOMETHING WONDERFUL");
    if (layout || created) {
      metrics.layoutReads += 1;
      const shellBox = shellMain.getBoundingClientRect();
      setStyleProperty(chrome, "left", `${Math.round(shellBox.left)}px`);
      setStyleProperty(chrome, "top", `${Math.round(shellBox.top)}px`);
      setStyleProperty(chrome, "width", `${Math.round(shellBox.width)}px`);
      setStyleProperty(chrome, "height", `${Math.round(shellBox.height)}px`);
    }
    chrome.classList.toggle("dream-skin-home-shell", Boolean(home));
    if (chrome.dataset.dreamShell !== shell) {
      chrome.dataset.dreamShell = shell;
      metrics.attributeWrites += 1;
    }
  };

  const ensure = ({ root: rootPass = true, route = true, layout = true } = {}) => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    metrics.ensureCalls += 1;
    const shell = rootPass ? applyRootState(root) : null;
    if (route) {
      syncRouteState(shell, { layout });
      if (RETRO_LAYOUT) lastRetroRouteSignature = retroRouteSignature();
    }
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window[DISABLED_KEY] = true;
    document.documentElement?.classList.remove("codex-dream-skin", "dream-retro-2007", "dream-retro-2007-layout");
    document.documentElement?.removeAttribute(SHELL_ATTR);
    for (const name of ART_ATTRS) document.documentElement?.removeAttribute(name);
    document.documentElement?.style.removeProperty("--dream-skin-art");
    for (const name of THEME_VARIABLES) document.documentElement?.style.removeProperty(name);
    document.querySelectorAll(".dream-skin-home").forEach((node) => node.classList.remove("dream-skin-home"));
    document.querySelectorAll(".dream-skin-home-shell").forEach((node) => node.classList.remove("dream-skin-home-shell"));
    document.querySelectorAll(".dream-skin-home-utility").forEach((node) => node.classList.remove("dream-skin-home-utility"));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    teardownRetroShell();
    state?.observer?.disconnect();
    state?.rootObserver?.disconnect();
    state?.routeObserver?.disconnect();
    state?.resizeObserver?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.routeTimer) clearInterval(state.routeTimer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.scheduler.frame);
    }
    if (analysisTimer) clearTimeout(analysisTimer);
    if (state?.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null, frame: null, root: false, route: false, layout: false };
  const flushScheduledEnsure = () => {
    if (scheduler.frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(scheduler.frame);
    }
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.frame = null;
    scheduler.timeout = null;
    const pending = { root: scheduler.root, route: scheduler.route, layout: scheduler.layout };
    scheduler.root = false;
    scheduler.route = false;
    scheduler.layout = false;
    ensure(pending);
  };
  const scheduleEnsure = ({ root = false, route = true, layout = false } = {}) => {
    scheduler.root ||= root;
    scheduler.route ||= route;
    scheduler.layout ||= layout;
    if (scheduler.timeout || scheduler.frame !== null) return;
    if (typeof requestAnimationFrame === "function") {
      scheduler.frame = requestAnimationFrame(flushScheduledEnsure);
      scheduler.timeout = setTimeout(flushScheduledEnsure, 96);
    } else {
      scheduler.timeout = setTimeout(flushScheduledEnsure, 64);
    }
  };
  const observer = new MutationObserver(() => scheduleEnsure({ route: true }));
  const routeActionHandler = (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("button, a, [role=button], [role=link], [role=menuitem]")
      : null;
    if (!target || target.closest(`#${RETRO_SHELL_ID}`)) return;
    const label = retroActionLabel(target);
    if (!/^(settings(?:\s+⌘,)?|back to app|返回应用)$/i.test(label)) return;
    queueMicrotask(() => ensure({ root: false, route: true, layout: true }));
  };
  rootObserver = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure({ root: true, route: true });
  });
  routeObserver = new MutationObserver(() => {
    const signature = retroRouteSignature();
    if (signature === lastRetroRouteSignature) return;
    scheduleEnsure({ route: true, layout: true });
  });
  const resizeHandler = () => scheduleEnsure({ route: true, layout: true });
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => scheduleEnsure({ route: true, layout: true }));
  }

  let mediaQuery = null;
  let mediaHandler = null;
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaHandler = () => scheduleEnsure({ root: true, route: true });
  } catch {}

  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    rootObserver,
    routeObserver,
    routeActionHandler,
    routeTimer: null,
    resizeObserver,
    timer: null,
    scheduler,
    resizeHandler,
    mediaQuery,
    mediaHandler,
    artUrl,
    installToken,
    analysis: artAnalysis,
    artMetadata: ART_METADATA,
    metrics,
    version: VERSION,
    themeId: THEME.id || "custom",
    detectShellMode,
    promptMenuCleanup: closeRetroPromptMenu,
  };
  const firstEnsureStartedAt = now();
  ensure({ layout: !previous || !document.getElementById(CHROME_ID) });
  metrics.firstEnsureMs = Number((now() - firstEnsureStartedAt).toFixed(3));
  if (previous?.artUrl && previous.artUrl !== artUrl) URL.revokeObjectURL(previous.artUrl);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  lastRetroRouteSignature = retroRouteSignature();
  routeObserver.observe(document.body || document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-current", "data-state"],
    characterData: true,
    childList: true,
    subtree: true,
  });
  if (typeof document.addEventListener === "function") {
    document.addEventListener("click", routeActionHandler);
  }
  rootObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode", "style"],
  });
  if (document.body) {
    rootObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode", "style"],
    });
  }
  const timer = setInterval(() => ensure(), 4000);
  window[STATE_KEY].timer = timer;
  window.addEventListener("resize", resizeHandler, { passive: true });
  if (mediaHandler && mediaQuery) {
    mediaQuery.addEventListener("change", mediaHandler);
  }
  const routeTimer = setInterval(() => {
    const signature = retroRouteSignature();
    if (signature === lastRetroRouteSignature) return;
    lastRetroRouteSignature = signature;
    ensure({ root: false, route: true, layout: true });
  }, 500);
  window[STATE_KEY].routeTimer = routeTimer;
  const analysisPromise = artAnalysis ? Promise.resolve(null) : analyzeArt();
  window[STATE_KEY].analysisTimer = analysisTimer;
  analysisPromise.then((analysis) => {
    const state = window[STATE_KEY];
    if (!analysis || state?.installToken !== installToken || window[DISABLED_KEY]) return;
    artAnalysis = analysis;
    state.analysis = analysis;
    if (typeof THEME.artKey === "string") {
      analysisCache.set(THEME.artKey, analysis);
      while (analysisCache.size > 8) analysisCache.delete(analysisCache.keys().next().value);
    }
    ensure({ root: true, route: false, layout: false });
  }).catch(() => {});
  return {
    installed: true,
    version: VERSION,
    themeId: THEME.id || "custom",
    shell: resolvedShell(),
    analysis: artAnalysis,
  };
})(__DREAM_SKIN_CSS_JSON__, __DREAM_SKIN_ART_JSON__, __DREAM_SKIN_THEME_JSON__)
