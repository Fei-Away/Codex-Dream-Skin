((cssText, artDataUrl, themeConfig, duoIcons, duoWidgetArt, duoForegroundArt, duoLoungeArt, duoLoungeBodyArt, duoLoungeLeftLegsArt, duoLoungeRightLegsArt, duoLoungeBlinkArt) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_DREAM_SKIN_DISABLED__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const MOTION_STAGE_ID = "codex-dream-skin-motion-stage";
  const DUO_WIDGET_ID = "codex-dream-skin-sidebar-widget";
  const DUO_ICON_ATTR = "data-dream-character-icon";
  const DUO_ROLE_ATTR = "data-dream-character-role";
  const DUO_KIND_ATTR = "data-dream-character-kind";
  const DUO_NATIVE_ICON_ATTR = "data-dream-native-icon";
  const SHELL_ATTR = "data-dream-shell";
  const THEME_ATTR = "data-dream-theme-id";
  const MOTION_ATTR = "data-dream-motion-state";
  const DUO_FOREGROUND_MODE_ATTR = "data-dream-duo-foreground-mode";
  const DUO_THEME_ID = "preset-sky-garden-duo";
  const DUO_OVERLAY_SELECTOR = [
    '[role="dialog"]',
    '[role="menu"]',
    '[role="listbox"]',
    '[data-radix-popper-content-wrapper]',
    '[class*="z-[60]"]',
    '[class*="thread-floating-content"]',
  ].join(",");
  const ART_ATTRS = [
    "data-dream-art-wide", "data-dream-art-safe", "data-dream-task-mode",
    "data-dream-art-safe-area", "data-dream-art-task-mode", "data-dream-art-aspect",
    "data-dream-art-ready",
  ];
  const VERSION = __DREAM_SKIN_VERSION_JSON__;
  const STYLE_REVISION = __DREAM_SKIN_STYLE_REVISION_JSON__;
  const PAYLOAD_REVISION = __DREAM_SKIN_PAYLOAD_REVISION_JSON__;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const ART = THEME.art && typeof THEME.art === "object" ? THEME.art : {};
  const ART_METADATA = THEME.artMetadata && typeof THEME.artMetadata === "object"
    ? THEME.artMetadata : null;
  const IS_DUO_THEME = THEME.id === DUO_THEME_ID;
  const DUO_ICONS = duoIcons && typeof duoIcons === "object" ? duoIcons : {};
  const DUO_WIDGET_ART = typeof duoWidgetArt === "string" ? duoWidgetArt : "";
  const DUO_FOREGROUND_ART = typeof duoForegroundArt === "string" ? duoForegroundArt : "";
  const DUO_LOUNGE_ART = typeof duoLoungeArt === "string" ? duoLoungeArt : "";
  const DUO_LOUNGE_BODY_ART = typeof duoLoungeBodyArt === "string" ? duoLoungeBodyArt : "";
  const DUO_LOUNGE_LEFT_LEGS_ART = typeof duoLoungeLeftLegsArt === "string" ? duoLoungeLeftLegsArt : "";
  const DUO_LOUNGE_RIGHT_LEGS_ART = typeof duoLoungeRightLegsArt === "string" ? duoLoungeRightLegsArt : "";
  const DUO_LOUNGE_BLINK_ART = typeof duoLoungeBlinkArt === "string" ? duoLoungeBlinkArt : "";
  const HAS_DUO_ICONS = Object.keys(DUO_ICONS).length > 0;
  const DUO_PALETTES = {
    light: {
      background: "#edf3ff",
      panel: "#f8faff",
      panelAlt: "#e7edfb",
      accent: "#7899d4",
      accentAlt: "#a8c1ef",
      secondary: "#8b78c9",
      highlight: "#6653aa",
      text: "#25293a",
      muted: "#6c7693",
      line: "rgba(120, 153, 212, .30)",
    },
    dark: {
      background: "#10131f",
      panel: "#171b2a",
      panelAlt: "#20263a",
      accent: "#9dbbff",
      accentAlt: "#c3d5ff",
      secondary: "#a08be5",
      highlight: "#8067cf",
      text: "#f1f4ff",
      muted: "#a8b0cb",
      line: "rgba(157, 187, 255, .32)",
    },
  };
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
    "--dream-motion-x", "--dream-motion-y", "--dream-duo-foreground-height",
    "--dream-duo-lounge-left", "--dream-duo-lounge-top", "--dream-duo-lounge-right",
    "--dream-duo-lounge-translate-x", "--dream-duo-lounge-height",
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
    motionFrames: 0,
    motionPointerEvents: 0,
    motionStageCreates: 0,
    motionAvoidanceChecks: 0,
    motionAvoidanceMode: "normal",
    sidebarWidgetCreates: 0,
    characterIconCreates: 0,
    motionActive: false,
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

  previous?.motion?.dispose?.();
  previous?.removeDuoCharacterIcons?.();
  document.getElementById(DUO_WIDGET_ID)?.remove();
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.rootObserver) previous.rootObserver.disconnect();
  if (previous?.resizeObserver) previous.resizeObserver.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.scheduler?.frame != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(previous.scheduler.frame);
  }
  if (previous?.analysisTimer) clearTimeout(previous.analysisTimer);
  if (previous?.resizeHandler) window.removeEventListener("resize", previous.resizeHandler);
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
    const dedicated = IS_DUO_THEME ? DUO_PALETTES[shell] : null;
    const legacyLight = !THEME.appearance && shell === "light";
    const structural = new Set(["background", "panel", "panelAlt", "text", "muted"]);
    const pick = (name) => {
      if (dedicated && typeof dedicated[name] === "string") return dedicated[name];
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
      "--ds-line": dedicated?.line || (
        explicit.has("line") && typeof colors.line === "string" ? colors.line : adaptive.line
      ),
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
  let duoMotion = null;

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
    setAttribute(root, THEME_ATTR, THEME.id || "custom");
    setStyleProperty(root, "--dream-skin-art", `url("${artUrl}")`);
    applyTheme(root, shell);
    applyArtMetadata(root);
    if (!root.classList.contains("codex-dream-skin")) root.classList.add("codex-dream-skin");
    return shell;
  };

  const createDuoMotion = (root, shellMain) => {
    document.getElementById(MOTION_STAGE_ID)?.remove();
    const stage = document.createElement("div");
    stage.id = MOTION_STAGE_ID;
    stage.setAttribute("aria-hidden", "true");
    const animatedLounge = Boolean(
      DUO_LOUNGE_ART && DUO_LOUNGE_BODY_ART &&
      DUO_LOUNGE_LEFT_LEGS_ART && DUO_LOUNGE_RIGHT_LEGS_ART,
    );
    const loungeMarkup = DUO_LOUNGE_ART ? `
      <div class="dream-duo-lounge${animatedLounge ? " dream-duo-lounge-animated" : ""}">
        <img class="dream-duo-lounge-static" src="${DUO_LOUNGE_ART}" alt="">
        ${animatedLounge ? `<div class="dream-duo-lounge-rig">
          <img class="dream-duo-lounge-left-legs" src="${DUO_LOUNGE_LEFT_LEGS_ART}" alt="">
          <img class="dream-duo-lounge-right-legs" src="${DUO_LOUNGE_RIGHT_LEGS_ART}" alt="">
          <img class="dream-duo-lounge-body" src="${DUO_LOUNGE_BODY_ART}" alt="">
          ${DUO_LOUNGE_BLINK_ART ? `<img class="dream-duo-lounge-blink" src="${DUO_LOUNGE_BLINK_ART}" alt="">` : ""}
        </div>` : ""}
      </div>` : "";
    stage.innerHTML = `
      <div class="dream-duo-art"></div>
      <div class="dream-duo-light dream-duo-light-flow"></div>
      ${loungeMarkup}
      ${DUO_FOREGROUND_ART ? `<img class="dream-duo-characters" src="${DUO_FOREGROUND_ART}" alt="">` : ""}
      <div class="dream-duo-petals">${"<i></i>".repeat(14)}</div>`;
    shellMain.appendChild(stage);
    metrics.motionStageCreates += 1;
    metrics.motionActive = true;

    let disposed = false;
    let blockerResizeObserver = null;
    const observedBlockers = new Set();
    const blockerSizes = new WeakMap();
    const loungePositionVariables = [
      "--dream-duo-lounge-left",
      "--dream-duo-lounge-top",
      "--dream-duo-lounge-right",
      "--dream-duo-lounge-translate-x",
      "--dream-duo-lounge-height",
    ];

    const visibleRect = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect?.();
      const style = getComputedStyle(node);
      if (
        !rect || rect.width < 160 || rect.height < 80
        || style.display === "none" || style.visibility === "hidden"
        || Number(style.opacity) === 0
      ) return null;
      return {
        left: Number(rect.left), top: Number(rect.top),
        right: Number(rect.right), bottom: Number(rect.bottom),
        width: Number(rect.width), height: Number(rect.height),
      };
    };
    const blockingRects = () => {
      const candidates = new Set();
      for (const node of document.querySelectorAll(DUO_OVERLAY_SELECTOR)) {
        const rect = visibleRect(node);
        if (!rect) continue;
        const style = getComputedStyle(node);
        if (style.pointerEvents !== "none") {
          candidates.add(node);
          continue;
        }
        const descendants = [...(node.querySelectorAll?.("*") ?? [])]
          .map((child) => ({ child, rect: visibleRect(child), style: getComputedStyle(child) }))
          .filter((entry) => entry.rect && entry.style.pointerEvents !== "none")
          .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
        if (descendants[0]) candidates.add(descendants[0].child);
      }
      return [...candidates]
        .map((node) => ({ node, rect: visibleRect(node) }))
        .filter((entry) => entry.rect);
    };
    const blockerSize = (node) => {
      const rect = node?.getBoundingClientRect?.();
      if (!rect) return "";
      return `${Math.round(Number(rect.width) || 0)}:${Math.round(Number(rect.height) || 0)}`;
    };
    const clearLoungePosition = () => {
      for (const name of loungePositionVariables) {
        if (!root.style.getPropertyValue(name)) continue;
        root.style.removeProperty(name);
        metrics.styleWrites += 1;
      }
    };
    const positionLoungeAbove = (blockers, main, viewportHeight) => {
      if (!blockers.length) {
        clearLoungePosition();
        return;
      }
      const primary = blockers.reduce((largest, entry) => {
        if (!largest) return entry;
        const area = entry.rect.width * entry.rect.height;
        const largestArea = largest.rect.width * largest.rect.height;
        return area > largestArea ? entry : largest;
      }, null);
      const mainLeft = Number(main.left) || 0;
      const mainTop = Number(main.top) || 0;
      const mainWidth = Number(main.width) || 0;
      const mainHeight = Number(main.height) || 0;
      const defaultLoungeHeight = clamp(viewportHeight * 0.13, 96, 132);
      const minimumTop = Math.max(8, 12 - mainTop);
      const loungeSizingOverlap = 4;
      const loungeEdgeOverlap = 12;
      const availableAbove = primary.rect.top - mainTop - minimumTop + loungeSizingOverlap;
      const loungeHeight = clamp(Math.min(defaultLoungeHeight, availableAbove), 48, defaultLoungeHeight);
      const loungeWidth = Math.min(mainWidth * 0.42, 360, loungeHeight * (1942 / 809));
      const rawCenter = primary.rect.left - mainLeft + primary.rect.width / 2;
      const center = clamp(rawCenter, loungeWidth / 2 + 12, mainWidth - loungeWidth / 2 - 12);
      const maximumTop = Math.max(minimumTop, mainHeight - loungeHeight - 8);
      const top = clamp(primary.rect.top - mainTop - loungeHeight + loungeEdgeOverlap, minimumTop, maximumTop);
      setStyleProperty(root, "--dream-duo-lounge-left", `${Math.round(center)}px`);
      setStyleProperty(root, "--dream-duo-lounge-top", `${Math.round(top)}px`);
      setStyleProperty(root, "--dream-duo-lounge-right", "auto");
      setStyleProperty(root, "--dream-duo-lounge-translate-x", "-50%");
      setStyleProperty(root, "--dream-duo-lounge-height", `${Math.round(loungeHeight)}px`);
    };
    const updateAvoidance = () => {
      if (disposed) return "normal";
      metrics.motionAvoidanceChecks += 1;
      const main = shellMain.getBoundingClientRect?.();
      if (!main || main.width <= 0 || main.height <= 0) return "normal";
      const viewportWidth = Math.max(1, Number(window.innerWidth) || main.width);
      const viewportHeight = Math.max(1, Number(window.innerHeight) || main.height);
      const mainLeft = Number(main.left) || 0;
      const mainTop = Number(main.top) || 0;
      const mainRight = Number.isFinite(Number(main.right)) ? Number(main.right) : mainLeft + main.width;
      const mainBottom = Number.isFinite(Number(main.bottom)) ? Number(main.bottom) : mainTop + main.height;
      const desiredHeight = clamp(main.height * 0.44, 300, 460);
      const desiredWidth = Math.min(main.width * 0.42, desiredHeight * 0.75);
      const rightOffset = clamp(viewportWidth * 0.018, 10, 28);
      const bottomOffset = clamp(viewportHeight * 0.018, 8, 22);
      const zone = {
        left: mainRight - rightOffset - desiredWidth,
        right: mainRight - rightOffset,
        top: mainBottom - bottomOffset - desiredHeight,
        bottom: mainBottom - bottomOffset,
      };
      const blockers = blockingRects();
      positionLoungeAbove(blockers, main, viewportHeight);
      const nextBlockers = new Set(blockers.map((entry) => entry.node));
      for (const blocker of observedBlockers) {
        if (nextBlockers.has(blocker)) continue;
        blockerResizeObserver?.unobserve?.(blocker);
        observedBlockers.delete(blocker);
        blockerSizes.delete(blocker);
      }
      for (const blocker of nextBlockers) {
        if (observedBlockers.has(blocker)) continue;
        blockerSizes.set(blocker, blockerSize(blocker));
        blockerResizeObserver?.observe(blocker);
        observedBlockers.add(blocker);
      }
      const overlaps = blockers.map((entry) => entry.rect).filter((rect) =>
        rect.left < zone.right && rect.right > zone.left
        && rect.top < zone.bottom && rect.bottom > zone.top
      );
      let mode = "normal";
      let safeHeight = null;
      if (overlaps.length) {
        const blockingBottom = Math.max(...overlaps.map((rect) => Math.min(mainBottom, rect.bottom)));
        const availableHeight = Math.floor(zone.bottom - blockingBottom - 12);
        if (availableHeight < desiredHeight - 4) {
          if (availableHeight >= 240) {
            mode = "scaled";
            safeHeight = clamp(availableHeight, 240, desiredHeight);
          } else {
            mode = "hidden";
          }
        }
      }
      metrics.motionAvoidanceMode = mode;
      if (mode === "normal") root.removeAttribute(DUO_FOREGROUND_MODE_ATTR);
      else setAttribute(root, DUO_FOREGROUND_MODE_ATTR, mode);
      if (safeHeight === null) {
        if (root.style.getPropertyValue("--dream-duo-foreground-height")) {
          root.style.removeProperty("--dream-duo-foreground-height");
          metrics.styleWrites += 1;
        }
      }
      else setStyleProperty(root, "--dream-duo-foreground-height", `${Math.round(safeHeight)}px`);
      return mode;
    };
    if (typeof ResizeObserver === "function") {
      blockerResizeObserver = new ResizeObserver((entries) => {
        let changed = false;
        for (const entry of entries || []) {
          const blocker = entry?.target;
          if (!observedBlockers.has(blocker)) continue;
          const nextSize = blockerSize(blocker);
          if (nextSize === blockerSizes.get(blocker)) continue;
          blockerSizes.set(blocker, nextSize);
          changed = true;
        }
        if (changed) updateAvoidance();
      });
    }
    const visibilityHandler = () => {
      setAttribute(root, MOTION_ATTR, document.hidden ? "paused" : "running");
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      blockerResizeObserver?.disconnect();
      observedBlockers.clear();
      clearLoungePosition();
      document.removeEventListener("visibilitychange", visibilityHandler);
      stage.remove();
      root.removeAttribute(MOTION_ATTR);
      root.removeAttribute(DUO_FOREGROUND_MODE_ATTR);
      root.style.removeProperty("--dream-duo-foreground-height");
      metrics.motionActive = false;
    };

    document.addEventListener("visibilitychange", visibilityHandler);
    visibilityHandler();
    updateAvoidance();
    return { stage, main: shellMain, dispose, updateAvoidance };
  };

  const DUO_NAV_TARGETS = [
    { role: "newTask", kind: "nav", aliases: ["新建任务", "new task", "new chat"] },
    { role: "pullRequests", kind: "nav", aliases: ["拉取请求", "pull requests", "pull request"] },
    { role: "sites", kind: "nav", aliases: ["站点", "sites", "site"] },
    { role: "scheduled", kind: "nav", aliases: ["已安排", "计划任务", "scheduled"] },
    { role: "plugins", kind: "nav", aliases: ["插件", "plugins", "plugin"] },
    { role: "search", kind: "search", aliases: ["搜索", "search"] },
  ];
  const DUO_CONTROL_TARGETS = [
    {
      role: "newTask",
      kind: "control",
      aliases: ["添加附件", "添加文件", "附加", "attach", "add files", "add context"],
    },
    {
      role: "permissions",
      kind: "control",
      aliases: ["完全访问", "权限", "full access", "permissions", "permission"],
    },
    { role: "send", kind: "control", aliases: ["发送", "发送消息", "send", "send message"] },
  ];

  const normalizedControlText = (value) => String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();

  const targetMatches = (target, aliases) => {
    const metadata = ["aria-label", "title", "data-testid"]
      .map((name) => normalizedControlText(target.getAttribute?.(name)))
      .filter(Boolean);
    const text = normalizedControlText(target.textContent);
    return aliases.some((rawAlias) => {
      const alias = normalizedControlText(rawAlias);
      if (!alias) return false;
      if (metadata.some((value) => value === alias || value.includes(alias))) return true;
      return text === alias || text.startsWith(`${alias} `);
    });
  };

  const clearDuoCharacterTarget = (target) => {
    target.querySelectorAll?.(`[${DUO_ICON_ATTR}]`).forEach((node) => node.remove());
    target.querySelectorAll?.(`[${DUO_NATIVE_ICON_ATTR}]`).forEach((node) => {
      node.removeAttribute(DUO_NATIVE_ICON_ATTR);
    });
    target.removeAttribute?.(DUO_ROLE_ATTR);
    target.removeAttribute?.(DUO_KIND_ATTR);
  };

  const removeDuoCharacterIcons = () => {
    document.querySelectorAll(`[${DUO_ICON_ATTR}]`).forEach((node) => node.remove());
    document.querySelectorAll(`[${DUO_ROLE_ATTR}]`).forEach((node) => {
      node.removeAttribute(DUO_ROLE_ATTR);
      node.removeAttribute(DUO_KIND_ATTR);
    });
    document.querySelectorAll(`[${DUO_NATIVE_ICON_ATTR}]`).forEach((node) => {
      node.removeAttribute(DUO_NATIVE_ICON_ATTR);
    });
  };

  const decorateDuoCharacterTarget = (target, definition) => {
    const src = DUO_ICONS[definition.role];
    if (!target || typeof src !== "string" || !src.startsWith("data:image/webp;base64,")) return false;
    const existing = target.querySelector?.(`[${DUO_ICON_ATTR}]`);
    if (existing?.getAttribute?.(DUO_ICON_ATTR) !== definition.role) existing?.remove();
    if (!target.querySelector?.(`[${DUO_ICON_ATTR}]`)) {
      const icon = document.createElement("span");
      icon.className = "dream-duo-character-icon";
      icon.setAttribute(DUO_ICON_ATTR, definition.role);
      icon.setAttribute("aria-hidden", "true");
      const image = document.createElement("img");
      image.src = src;
      image.alt = "";
      image.decoding = "async";
      image.draggable = false;
      icon.appendChild(image);
      if (typeof target.insertBefore === "function") target.insertBefore(icon, target.firstChild || null);
      else target.prepend?.(icon);
      metrics.characterIconCreates += 1;
    }
    target.setAttribute(DUO_ROLE_ATTR, definition.role);
    target.setAttribute(DUO_KIND_ATTR, definition.kind);
    const nativeIcon = target.querySelector?.("svg");
    nativeIcon?.setAttribute(DUO_NATIVE_ICON_ATTR, "true");
    return true;
  };

  const syncDuoCharacterTargets = (selector, definitions, matched) => {
    const usedRoles = new Set();
    for (const target of document.querySelectorAll(selector)) {
      const definition = definitions.find((candidate) =>
        !usedRoles.has(candidate.role) && targetMatches(target, candidate.aliases));
      if (!definition) continue;
      if (decorateDuoCharacterTarget(target, definition)) {
        matched.add(target);
        usedRoles.add(definition.role);
      }
    }
  };

  const ensureDuoCharacterIcons = () => {
    if (!IS_DUO_THEME || !HAS_DUO_ICONS) {
      removeDuoCharacterIcons();
      return;
    }
    const matched = new Set();
    syncDuoCharacterTargets(
      "aside.app-shell-left-panel button, aside.app-shell-left-panel a",
      DUO_NAV_TARGETS,
      matched,
    );
    syncDuoCharacterTargets(".composer-surface-chrome button", DUO_CONTROL_TARGETS, matched);
    for (const target of document.querySelectorAll(`[${DUO_ROLE_ATTR}]`)) {
      if (!matched.has(target)) clearDuoCharacterTarget(target);
    }
  };

  const ensureDuoWidget = () => {
    const existing = document.getElementById(DUO_WIDGET_ID);
    if (!IS_DUO_THEME || !DUO_WIDGET_ART) {
      existing?.remove();
      return null;
    }
    const sidebar = document.querySelector("aside.app-shell-left-panel");
    const scroller = sidebar?.querySelector?.(".vertical-scroll-fade-mask");
    if (!scroller) {
      existing?.remove();
      return null;
    }
    if (existing?.parentElement === scroller) return existing;
    existing?.remove();
    const widget = document.createElement("div");
    widget.id = DUO_WIDGET_ID;
    widget.setAttribute("aria-hidden", "true");
    widget.innerHTML = `
      <span class="dream-duo-widget-copy">
        <strong>天空花园</strong>
        <small>白昼 · 暗夜</small>
      </span>
      <span class="dream-duo-widget-stars"><i></i><i></i><i></i></span>
      <img src="${DUO_WIDGET_ART}" alt="">`;
    scroller.insertBefore(widget, scroller.children[1] || null);
    metrics.sidebarWidgetCreates += 1;
    return widget;
  };

  const syncRouteState = (shell, { layout = false } = {}) => {
    metrics.routePasses += 1;
    const root = document.documentElement;
    if (!root) return;
    shell ||= root.getAttribute(SHELL_ATTR) || resolvedShell();
    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
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

    ensureDuoCharacterIcons();

    if (!shellMain || !document.body) return;
    if (IS_DUO_THEME) {
      ensureDuoWidget();
      if (
        !duoMotion
        || duoMotion.main !== shellMain
        || document.getElementById(MOTION_STAGE_ID) !== duoMotion.stage
      ) {
        duoMotion?.dispose();
        duoMotion = createDuoMotion(root, shellMain);
        const state = window[STATE_KEY];
        if (state?.installToken === installToken) state.motion = duoMotion;
      }
      duoMotion?.updateAvoidance?.();
    } else {
      document.getElementById(DUO_WIDGET_ID)?.remove();
      duoMotion?.dispose();
      duoMotion = null;
      root.removeAttribute(MOTION_ATTR);
      document.getElementById(MOTION_STAGE_ID)?.remove();
    }
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
    if (route) syncRouteState(shell, { layout });
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window[DISABLED_KEY] = true;
    document.documentElement?.classList.remove("codex-dream-skin");
    document.documentElement?.removeAttribute(SHELL_ATTR);
    document.documentElement?.removeAttribute(THEME_ATTR);
    document.documentElement?.removeAttribute(MOTION_ATTR);
    document.documentElement?.removeAttribute(DUO_FOREGROUND_MODE_ATTR);
    for (const name of ART_ATTRS) document.documentElement?.removeAttribute(name);
    document.documentElement?.style.removeProperty("--dream-skin-art");
    for (const name of THEME_VARIABLES) document.documentElement?.style.removeProperty(name);
    document.querySelectorAll(".dream-skin-home").forEach((node) => node.classList.remove("dream-skin-home"));
    document.querySelectorAll(".dream-skin-home-shell").forEach((node) => node.classList.remove("dream-skin-home-shell"));
    document.querySelectorAll(".dream-skin-home-utility").forEach((node) => node.classList.remove("dream-skin-home-utility"));
    removeDuoCharacterIcons();
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(DUO_WIDGET_ID)?.remove();
    duoMotion?.dispose();
    duoMotion = null;
    document.getElementById(MOTION_STAGE_ID)?.remove();
    state?.observer?.disconnect();
    state?.rootObserver?.disconnect();
    state?.resizeObserver?.disconnect();
    if (state?.timer) clearInterval(state.timer);
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
  rootObserver = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure({ root: true, route: true });
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
    revision: PAYLOAD_REVISION,
    motion: duoMotion,
    removeDuoCharacterIcons,
    detectShellMode,
  };
  const firstEnsureStartedAt = now();
  ensure({ layout: !previous || !document.getElementById(CHROME_ID) });
  window[STATE_KEY].motion = duoMotion;
  metrics.firstEnsureMs = Number((now() - firstEnsureStartedAt).toFixed(3));
  if (previous?.artUrl && previous.artUrl !== artUrl) URL.revokeObjectURL(previous.artUrl);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
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
    revision: PAYLOAD_REVISION,
    shell: resolvedShell(),
    analysis: artAnalysis,
  };
})(
  __DREAM_SKIN_CSS_JSON__,
  __DREAM_SKIN_ART_JSON__,
  __DREAM_SKIN_THEME_JSON__,
  __DREAM_DUO_ICONS_JSON__,
  __DREAM_DUO_WIDGET_ART_JSON__,
  __DREAM_DUO_FOREGROUND_ART_JSON__,
  __DREAM_DUO_LOUNGE_ART_JSON__,
  __DREAM_DUO_LOUNGE_BODY_ART_JSON__,
  __DREAM_DUO_LOUNGE_LEFT_LEGS_ART_JSON__,
  __DREAM_DUO_LOUNGE_RIGHT_LEGS_ART_JSON__,
  __DREAM_DUO_LOUNGE_BLINK_ART_JSON__
)
