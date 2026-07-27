// Canonical cross-platform renderer. Run tools/sync-runtime-assets.mjs after editing.
((cssText, artDataUrl, themeConfig, videoConfig) => {
  const SELECTOR_CONTRACT = {"schema":"codex-dream-skin-selectors/1","selectors":[{"key":"shell-main","selector":"main.main-surface","tier":"L1","scope":"all","required":true},{"key":"left-panel","selector":"aside.app-shell-left-panel","tier":"L1","scope":"all","required":true},{"key":"header-tint","selector":"header.app-header-tint","tier":"L1","scope":"all","required":true},{"key":"home-icon","selector":"[data-testid=\"home-icon\"]","tier":"L1","scope":"home","required":true},{"key":"home-route","selector":"[role=\"main\"]:has([data-testid=\"home-icon\"])","tier":"L1","scope":"home","required":true},{"key":"home-route-css","selector":"[role=\"main\"]","tier":"L1","scope":"home","required":true},{"key":"home-banners","selector":".home-banners","tier":"L2","scope":"home","required":false},{"key":"composer-chrome","selector":".composer-surface-chrome","tier":"L2","scope":"home+thread","required":false},{"key":"composer-toolbar","selector":".composer-surface-chrome [class*=\"_footer_\"]","tier":"L2","scope":"home+thread","required":false},{"key":"home-utility","selector":"[class*=\"_homeUtilityBar_\"]","tier":"L2","scope":"home","required":false},{"key":"game-source","selector":"[data-feature=\"game-source\"]","tier":"L2","scope":"home","required":false},{"key":"home-suggestions","selector":".group\\/home-suggestions","tier":"L2","scope":"home","required":false},{"key":"project-selector","selector":".group\\/project-selector","tier":"L2","scope":"home config","required":false},{"key":"markdown","selector":"[class*=\"_markdown\"]","tier":"L2","scope":"thread","required":false},{"key":"thread-surface","selector":".thread-scroll-container","tier":"L2","scope":"thread","required":false},{"key":"message","selector":"[data-message-author-role]","tier":"L2","scope":"thread","required":false},{"key":"appearance-radio","selector":"input[name=\"appearance-theme\"]","tier":"L2","scope":"settings","required":false},{"key":"overlay-menu","selector":"[role=\"menu\"]","tier":"L2","scope":"overlay","required":false},{"key":"overlay-dialog","selector":"[role=\"dialog\"]","tier":"L2","scope":"overlay","required":false},{"key":"overlay-popper","selector":"[data-radix-popper-content-wrapper]","tier":"L2","scope":"overlay","required":false}],"stableTestids":["app-shell-header-context-menu-surface","home-icon","theme-preview"]};
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const DISABLED_KEY = "__CODEX_DREAM_SKIN_DISABLED__";
  const STYLE_REGISTRY_KEY = "__CODEX_DREAM_SKIN_STYLE_SHEETS__";
  const STYLE_ID = "codex-dream-skin-style";
  const BACKGROUND_STAGE_ID = "codex-dream-skin-background-stage";
  const VIDEO_INPUT_ID = "codex-dream-skin-video-input";
  const SHELL_ATTR = "data-dream-shell";
  const PART_ATTR = "data-ds-part";
  const ROOT_ATTRS = [
    "data-dream-skin", SHELL_ATTR,
    "data-dream-art-wide", "data-dream-art-safe", "data-dream-task-mode",
    "data-dream-art-safe-area", "data-dream-art-task-mode", "data-dream-art-aspect",
    "data-dream-art-ready", "data-dream-media", "data-dream-video-ready",
  ];
  const VERSION = __DREAM_SKIN_VERSION_JSON__;
  const STYLE_REVISION = __DREAM_SKIN_STYLE_REVISION_JSON__;
  const PAYLOAD_REVISION = __DREAM_SKIN_PAYLOAD_REVISION_JSON__;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
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
    "--dream-skin-project-label", "--dream-skin-brand-subtitle", "--dream-skin-status",
    "--dream-skin-quote", "--dream-skin-art",
    "--ds-theme-color-background", "--ds-theme-color-panel",
    "--ds-theme-color-panel-alt", "--ds-theme-color-accent",
    "--ds-theme-color-accent-alt", "--ds-theme-color-secondary",
    "--ds-theme-color-highlight", "--ds-theme-color-text",
    "--ds-theme-color-muted", "--ds-theme-color-line",
    "--ds-theme-font-family", "--ds-theme-font-scale",
    "--ds-theme-surface-radius", "--ds-theme-surface-opacity",
    "--ds-theme-surface-blur", "--ds-theme-surface-border-alpha",
    "--ds-theme-surface-shadow", "--ds-theme-image-focus-x",
    "--ds-theme-image-focus-y", "--ds-theme-image-zoom",
    "--ds-theme-image-dim", "--ds-theme-image-task-intensity",
    "--ds-theme-density-scale", "--ds-theme-motion-level",
  ];
  const selectorByKey = new Map(SELECTOR_CONTRACT.selectors.map((entry) => [entry.key, entry]));
  const stableTestidSelector = (testid) => SELECTOR_CONTRACT.stableTestids?.includes(testid)
    ? `[data-testid="${testid}"]` : null;
  const installToken = {};
  const existingAnalysisCache = window[ANALYSIS_CACHE_KEY];
  const analysisCache = existingAnalysisCache && typeof existingAnalysisCache.get === "function" &&
    typeof existingAnalysisCache.set === "function" ? existingAnalysisCache : new Map();
  window[ANALYSIS_CACHE_KEY] = analysisCache;
  let artAnalysis = typeof THEME.artKey === "string" ? analysisCache.get(THEME.artKey) ?? null : null;
  const normalizedVideoConfig = typeof videoConfig === "string"
    ? { mode: "server", url: videoConfig }
    : videoConfig && typeof videoConfig === "object" ? videoConfig : null;
  const videoUrl = typeof normalizedVideoConfig?.url === "string"
    ? normalizedVideoConfig.url : null;
  const videoMode = normalizedVideoConfig?.mode === "blob" ? "blob"
    : /^https?:\/\//i.test(videoUrl || "") ? "server" : null;
  const videoSource = videoMode === "server" ? videoUrl : null;
  const videoFallbackSource = typeof normalizedVideoConfig?.fallbackUrl === "string" &&
    normalizedVideoConfig.fallbackUrl ? normalizedVideoConfig.fallbackUrl : null;
  const videoEnabled = videoMode === "blob" || Boolean(videoSource);
  let backgroundState = null;
  let handedOffVideo = null;
  let videoGeneration = 0;
  let videoFailed = false;
  let videoReady = false;
  let videoError = null;
  let analysisTimer = null;
  let rootObserver = null;
  let partObserver = null;
  let bodyReadyHandler = null;
  let styleMode = null;
  let styleNode = null;
  let styleSheet = null;
  const mediaTransitions = [];
  const now = () => typeof performance === "object" && typeof performance.now === "function"
    ? performance.now() : Date.now();
  const metrics = {
    ensureCalls: 0,
    rootPasses: 0,
    routePasses: 0,
    layoutReads: 0,
    attributeWrites: 0,
    styleWrites: 0,
    styleRepairs: 0,
    partPasses: 0,
    partWrites: 0,
    navigationEvents: 0,
    safetyPasses: 0,
    analysisRuns: 0,
    analysisCacheHits: artAnalysis ? 1 : 0,
    firstEnsureMs: null,
    analysisMs: null,
  };

  const previous = window[STATE_KEY];
  const previousHandoff = videoEnabled && typeof previous?.handoffVideo === "function"
    ? previous.handoffVideo() : null;
  if (previousHandoff) handedOffVideo = { ...previousHandoff, preserve: true };
  if (typeof previous?.cleanup === "function") previous.cleanup();
  window[DISABLED_KEY] = false;

  const existingStyleRegistry = window[STYLE_REGISTRY_KEY];
  const styleRegistry = existingStyleRegistry instanceof Set ? existingStyleRegistry : new Set();
  window[STYLE_REGISTRY_KEY] = styleRegistry;
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();

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

  const parseRgb = (value) => {
    if (!value || value === "transparent") return null;
    const hex = String(value).trim().match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      const rgbHex = hex[1].length <= 4
        ? hex[1].slice(0, 3).split("").map((digit) => `${digit}${digit}`).join("")
        : hex[1].slice(0, 6);
      const number = Number.parseInt(rgbHex, 16);
      return { r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
    }
    const m = String(value).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const rgbString = (value) => {
    const rgb = parseRgb(value);
    return rgb ? [rgb.r, rgb.g, rgb.b]
      .map((channel) => Math.round(clamp(channel, 0, 255)))
      .join(" ") : null;
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

  const detectShellAppearance = () => {
    const root = document.documentElement;
    if (root?.classList?.contains("electron-dark")) return "dark";
    if (root?.classList?.contains("electron-light")) return "light";
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch {}
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
    return detectShellAppearance();
  };

  const applyTheme = (root, shell) => {
    const declaredColors = THEME.colors && typeof THEME.colors === "object" ? THEME.colors : {};
    const legacyPalette = THEME.palette && typeof THEME.palette === "object" ? THEME.palette : {};
    // macOS themes use the full `colors` contract; older Windows themes used
    // `palette.accent`. Accept both while keeping one renderer source.
    const colors = Object.keys(declaredColors).length ? declaredColors : legacyPalette;
    const hasExplicitKeyList = Array.isArray(THEME.explicitColorKeys);
    const explicit = new Set(hasExplicitKeyList ? THEME.explicitColorKeys : []);
    if (!hasExplicitKeyList && (THEME.colorMode === "explicit" || !Object.hasOwn(THEME, "colorMode"))) {
      for (const key of Object.keys(declaredColors)) explicit.add(key);
    }
    if (typeof legacyPalette.accent === "string") explicit.add("accent");
    const adaptive = makeAdaptivePalette(artAnalysis?.accentRgb, shell);
    const legacyLight = (THEME.appearance === undefined || THEME.appearance === "auto")
      && THEME.colorMode !== "explicit" && shell === "light";
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
    const publicColors = {
      "--ds-theme-color-background": variables["--ds-bg"],
      "--ds-theme-color-panel": variables["--ds-panel"],
      "--ds-theme-color-panel-alt": variables["--ds-panel-2"],
      "--ds-theme-color-accent": variables["--ds-green"],
      "--ds-theme-color-accent-alt": variables["--ds-lime"],
      "--ds-theme-color-secondary": variables["--ds-cyan"],
      "--ds-theme-color-highlight": variables["--ds-purple"],
      "--ds-theme-color-text": variables["--ds-text"],
      "--ds-theme-color-muted": variables["--ds-muted"],
      "--ds-theme-color-line": variables["--ds-line"],
    };
    for (const [name, value] of Object.entries(publicColors)) {
      if (typeof value === "string" && value) setStyleProperty(root, name, value);
    }
    setStyleProperty(root, "--ds-theme-surface-radius", "12px");
    setStyleProperty(root, "--ds-theme-surface-opacity", "1");
    setStyleProperty(root, "--ds-theme-surface-blur", "0px");
    setStyleProperty(root, "--ds-theme-font-family", "system");
    setStyleProperty(root, "--ds-theme-font-scale", "1");
    setStyleProperty(root, "--ds-theme-surface-border-alpha", "0.14");
    setStyleProperty(root, "--ds-theme-surface-shadow", "soft");
    setStyleProperty(root, "--ds-theme-image-zoom", "1");
    setStyleProperty(root, "--ds-theme-image-dim", "0");
    setStyleProperty(root, "--ds-theme-image-task-intensity", "0.35");
    setStyleProperty(root, "--ds-theme-density-scale", "standard");
    setStyleProperty(root, "--ds-theme-motion-level", "standard");
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
    setStyleProperty(root, "--dream-skin-quote", cssString(THEME.quote || "MAKE SOMETHING WONDERFUL"));
    setStyleProperty(root, "--dream-skin-brand-subtitle", cssString(
      THEME.brandSubtitle || "CODEX DREAM SKIN",
    ));
    setStyleProperty(root, "--dream-skin-status", cssString(THEME.statusText || "DREAM SKIN ONLINE"));
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
    setStyleProperty(root, "--ds-theme-image-focus-x", String(Number(focusX.toFixed(4))));
    setStyleProperty(root, "--ds-theme-image-focus-y", String(Number(focusY.toFixed(4))));
  };

  const detachBackgroundVideoListeners = (state) => {
    if (!state) return;
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }
    try { state.video.removeEventListener("error", state.onError); } catch {}
    try { state.video.removeEventListener("loadeddata", state.onReady); } catch {}
    try { state.video.removeEventListener("playing", state.onReady); } catch {}
    try { state.video.removeEventListener("ended", state.onEnded); } catch {}
    try { state.video.removeEventListener("stalled", state.onStalled); } catch {}
    try { state.video.removeEventListener("abort", state.onAbort); } catch {}
    try { state.video.removeEventListener("emptied", state.onEmptied); } catch {}
    try { state.video.removeEventListener("timeupdate", state.onTimeUpdate); } catch {}
    try { document.removeEventListener("visibilitychange", state.onVisibility); } catch {}
  };

  const removeBackgroundStage = () => {
    const state = backgroundState;
    backgroundState = null;
    if (!state) {
      document.getElementById(BACKGROUND_STAGE_ID)?.remove();
      if (handedOffVideo) {
        try { handedOffVideo.video.pause(); handedOffVideo.video.remove(); } catch {}
        if (handedOffVideo.objectUrl) {
          try { URL.revokeObjectURL(handedOffVideo.objectUrl); } catch {}
        }
        handedOffVideo = null;
      }
      return;
    }
    if (handedOffVideo?.video === state.video) {
      // Preserve only the decoded frame and object URL. The superseded runtime
      // must not keep visibility/media listeners that can restart this node.
      detachBackgroundVideoListeners(state);
      handedOffVideo = null;
      return;
    }
    try { state.video.pause(); } catch {}
    detachBackgroundVideoListeners(state);
    try { state.video.removeAttribute("src"); state.video.load(); } catch {}
    if (state.objectUrl) {
      try { URL.revokeObjectURL(state.objectUrl); } catch {}
    }
    state.stage.remove();
    if (handedOffVideo) {
      try { handedOffVideo.video.pause(); handedOffVideo.video.remove(); } catch {}
      if (handedOffVideo.objectUrl) {
        try { URL.revokeObjectURL(handedOffVideo.objectUrl); } catch {}
      }
      handedOffVideo = null;
    }
  };

  const captureVideoError = (error = null, video = backgroundState?.video) => {
    videoError = {
      name: error?.name || null,
      message: error?.message || null,
      mediaCode: video?.error?.code ?? null,
      readyState: video?.readyState ?? null,
      networkState: video?.networkState ?? null,
    };
  };

  const isCurrentVideoState = (state) => Boolean(
    state && backgroundState === state && state.generation === videoGeneration,
  );

  const fallbackToImage = (error = null, expectedState = null) => {
    if (expectedState && !isCurrentVideoState(expectedState)) return false;
    if (videoFailed) return;
    captureVideoError(error, expectedState?.video ?? backgroundState?.video);
    videoFailed = true;
    videoReady = false;
    removeBackgroundStage();
    const root = document.documentElement;
    if (root) applyRootState(root);
    return true;
  };

  const revealVideo = (state) => {
    if (!isCurrentVideoState(state) || videoFailed || videoReady) return;
    // The replacement element stays inline-hidden while the verified previous
    // video remains visible. Reveal it only after Chromium produced a frame.
    try { state.video.style.opacity = ""; } catch {}
    // The poster is useful only before the first decoded frame. Keeping it on
    // a live element lets Chromium expose the static image again during a
    // transient stall or buffer reset, which looks like image/video flashing.
    try { state.video.removeAttribute("poster"); } catch {}
    videoReady = true;
    const root = document.documentElement;
    if (root) applyRootState(root);
    if (handedOffVideo) {
      const oldVideo = handedOffVideo.video;
      const oldObjectUrl = handedOffVideo.objectUrl;
      handedOffVideo = null;
      try { oldVideo.pause(); oldVideo.remove(); } catch {}
      if (oldObjectUrl) {
        try { URL.revokeObjectURL(oldObjectUrl); } catch {}
      }
    }
  };

  const isTransientBackgroundPause = (error, video) => {
    const hidden = document.visibilityState === "hidden" || document.hidden;
    if (!hidden) return false;
    const message = String(error?.message || "").toLowerCase();
    if (error?.name === "AbortError" && /background media|save power|paused/.test(message)) return true;
    // Chromium can emit an empty media error while the app target reports
    // hidden, even though the loopback response is valid. Treat that event as
    // transient and retry instead of exposing the fallback image.
    if (!video?.error && !message) return true;
    return !video?.error && /failed to fetch|network|load|media/.test(message);
  };

  const isTransientVideoError = (error, video) => {
    if (isTransientBackgroundPause(error, video)) return true;
    const code = video?.error?.code ?? null;
    // MEDIA_ERR_ABORTED, MEDIA_ERR_NETWORK, and Chromium's empty error object
    // are recoverable while a source is being replaced or the page is hidden.
    return code === null || code === 1 || code === 2;
  };

  const retryTransientVideo = (state) => {
    if (!state || videoFailed || !state.video.src || state.retryCount >= 20) return false;
    if (document.visibilityState === "hidden" || document.hidden) {
      // Chromium may suspend an already-valid media element for as long as
      // the renderer stays hidden. Do not spend the finite retry budget while
      // playback is intentionally unavailable; visibilitychange resumes it.
      state.pendingPlay = true;
      return true;
    }
    if (state.retryTimer) return true;
    state.retryCount += 1;
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      if (!isCurrentVideoState(state) || videoFailed || !state.video.src) return;
      if (document.visibilityState === "hidden" || document.hidden) {
        state.pendingPlay = true;
        return;
      }
      Promise.resolve(state.video.play?.()).then(() => {
        if (!isCurrentVideoState(state) || videoFailed) return;
        state.pendingPlay = false;
        revealVideo(state);
      }).catch(state.onError);
    }, 500);
    return true;
  };

  const ensureVideoInput = () => {
    if (videoMode !== "blob" || !document?.createElement) return null;
    let input = document.getElementById(VIDEO_INPUT_ID);
    if (input) return input;
    input = document.createElement("input");
    input.type = "file";
    input.id = VIDEO_INPUT_ID;
    input.accept = "video/mp4";
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    Object.assign(input.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
    });
    (document.body || document.documentElement)?.appendChild(input);
    return input;
  };

  const mediaTokenFromUrl = (source) => {
    try {
      const parsed = new URL(source);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return /^\/media\/([a-f0-9]{32})$/i.exec(parsed.pathname)?.[1] ?? null;
    } catch {
      return null;
    }
  };

  const playVideoObjectUrl = async (state, objectUrl) => {
    if (!isCurrentVideoState(state) || videoFailed) return false;
    if (state.objectUrl && state.objectUrl !== objectUrl) {
      try { URL.revokeObjectURL(state.objectUrl); } catch {}
    }
    state.objectUrl = objectUrl;
    state.video.src = objectUrl;
    state.video.load();
    if (document.visibilityState === "hidden" || document.hidden) {
      state.pendingPlay = true;
      return true;
    }
    if (state.video.readyState < 1) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Video metadata load timed out"));
        }, 15000);
        const cleanup = () => {
          clearTimeout(timer);
          state.video.removeEventListener("loadedmetadata", onMetadata);
          state.video.removeEventListener("error", onError);
        };
        const onMetadata = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error("Video metadata could not be loaded")); };
        state.video.addEventListener("loadedmetadata", onMetadata, { once: true });
        state.video.addEventListener("error", onError, { once: true });
      });
    }
    await state.video.play();
    if (!isCurrentVideoState(state) || videoFailed) return false;
    state.pendingPlay = false;
    // play() is the fallback for shells that do not expose a usable
    // loadeddata/playing event to the injected runtime.
    revealVideo(state);
    return true;
  };

  const loadVideoFromUrl = async (state, source) => {
    if (!state || state.loading) return false;
    state.loading = true;
    try {
    const token = mediaTokenFromUrl(source);
    const headers = token ? { "X-Codex-Dream-Skin-Token": token } : undefined;
    const response = await fetch(source, { credentials: "omit", headers });
    if (!response.ok) throw new Error("Video request failed: " + response.status);
    const blob = await response.blob();
    if (!isCurrentVideoState(state) || videoFailed) return false;
    return playVideoObjectUrl(state, URL.createObjectURL(blob));
    } finally {
      state.loading = false;
    }
  };

  const fallbackToServer = async (expectedState = null) => {
    const state = expectedState ?? backgroundState;
    if (!isCurrentVideoState(state) || !videoFallbackSource || state.fallbackStarted) return false;
    state.fallbackStarted = true;
    try {
      return await loadVideoFromUrl(state, videoFallbackSource);
    } catch (error) {
      fallbackToImage(error, state);
      return false;
    }
  };

  const handleVideoFailure = (state, error = null) => {
    if (!isCurrentVideoState(state) || videoFailed) return false;
    captureVideoError(error, state.video);
    if (isTransientVideoError(error, state.video) && retryTransientVideo(state)) {
      state.pendingPlay = true;
      return false;
    }
    if (videoFallbackSource && !state.fallbackStarted) {
      void fallbackToServer(state);
      return false;
    }
    return fallbackToImage(error, state);
  };

  const attachVideoFile = async () => {
    if (videoMode !== "blob") return false;
    const input = ensureVideoInput();
    ensureBackgroundStage();
    const state = backgroundState;
    const file = input?.files?.[0];
    if (!state || !file) return false;
    try {
      await playVideoObjectUrl(state, URL.createObjectURL(file));
      applyRootState(document.documentElement);
      return true;
    } catch (error) {
      return handleVideoFailure(state, error);
    }
  };

  const ensureBackgroundStage = () => {
    if (!videoEnabled || videoFailed || !document?.createElement) return;
    ensureVideoInput();
    if (backgroundState?.stage?.parentElement) return;
    const previousVideo = handedOffVideo?.video?.parentElement ? handedOffVideo.video : null;
    const stage = handedOffVideo?.stage?.parentElement
      ? handedOffVideo.stage
      : document.getElementById(BACKGROUND_STAGE_ID) || document.createElement("div");
    stage.id = BACKGROUND_STAGE_ID;
    // A failed or superseded handoff can leave an older video in the shared
    // stage. Keep at most the one explicitly handed off by the immediately
    // previous runtime; two playable nodes can alternate frames and posters.
    for (const child of [...(stage.children || [])]) {
      if (child === previousVideo) continue;
      const staleSource = typeof child.src === "string" ? child.src : "";
      try { child.pause?.(); } catch {}
      try { child.removeAttribute?.("src"); child.load?.(); } catch {}
      try { child.remove?.(); } catch {}
      if (staleSource.startsWith("blob:")) {
        try { URL.revokeObjectURL(staleSource); } catch {}
      }
    }
    if (!previousVideo) stage.replaceChildren?.();
    if (previousVideo && !stage.parentElement) {
      const parent = document.body || document.documentElement;
      if (!parent) return;
      if (typeof parent.prepend === "function") parent.prepend(stage);
      else parent.appendChild(stage);
    }
    // The video is a viewport background, not a main-surface decoration. Keep
    // it under the app root so the sidebar, main content, and native overlays
    // all share one continuous moving background.
    const parent = stage.parentElement || document.body || document.documentElement;
    if (!parent) return;

    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.poster = artUrl;
    video.setAttribute("aria-hidden", "true");
    // `data-dream-media="video"` intentionally remains set during a ready
    // handoff so CSS keeps the previous video visible. Prevent that selector
    // from exposing the pending replacement or its poster before first frame.
    video.style.opacity = "0";
    const onError = (error = null) => {
      // A detached video can still deliver abort/error after a new theme has
      // installed. Its event must never fail the newer media generation.
      if (!isCurrentVideoState(state)) return;
      handleVideoFailure(state, error);
    };
    const onVisibility = () => {
      if (videoFailed || document.visibilityState === "hidden" || document.hidden) return;
      if (videoMode === "server" && !state.loading && !video.src) {
        void loadVideoFromUrl(state, videoSource).catch(onError);
        return;
      }
      if (video.src) {
        Promise.resolve(video.play?.()).then(() => {
          state.pendingPlay = false;
          revealVideo(state);
        }).catch(onError);
      }
    };
    const onReady = () => revealVideo(state);
    const onEnded = () => {
      if (videoFailed || backgroundState !== state || document.visibilityState === "hidden" || document.hidden) return;
      state.pendingPlay = true;
      try { video.currentTime = 0; } catch {}
      Promise.resolve(video.play?.()).then(() => {
        state.pendingPlay = false;
        revealVideo(state);
      }).catch(onError);
    };
    const onStalled = () => {
      if (videoFailed || !isCurrentVideoState(state)) return;
      state.pendingPlay = true;
      retryTransientVideo(state);
    };
    const onAbort = () => {
      if (videoFailed || !isCurrentVideoState(state)) return;
      state.pendingPlay = true;
      retryTransientVideo(state);
    };
    const onEmptied = () => {
      if (videoFailed || !isCurrentVideoState(state) || !video.src) return;
      state.pendingPlay = true;
      retryTransientVideo(state);
    };
    const onTimeUpdate = () => {
      if (videoFailed || !isCurrentVideoState(state)) return;
      const currentTime = Number(video.currentTime);
      if (!Number.isFinite(currentTime)) return;
      if (currentTime < state.lastPlaybackTime ||
          currentTime - state.lastPlaybackTime >= 0.1) {
        state.lastPlaybackTime = currentTime;
        state.retryCount = 0;
        state.pendingPlay = false;
      }
    };
    const state = {
      stage, video, onError, onVisibility, onReady, onEnded, onStalled, onAbort, onEmptied,
      onTimeUpdate,
      generation: ++videoGeneration,
      objectUrl: null, fallbackStarted: false, retryTimer: null, retryCount: 0,
      loading: false, pendingPlay: false, lastPlaybackTime: -1,
    };
    backgroundState = state;
    video.addEventListener("error", onError);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("playing", onReady);
    video.addEventListener("ended", onEnded);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("abort", onAbort);
    video.addEventListener("emptied", onEmptied);
    video.addEventListener("timeupdate", onTimeUpdate);
    document.addEventListener("visibilitychange", onVisibility);
    stage.appendChild(video);
    if (typeof parent.prepend === "function") parent.prepend(stage);
    else parent.appendChild(stage);
    if (videoMode === "server") {
      void loadVideoFromUrl(backgroundState, videoSource).catch(onError);
    }
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

  const installStyle = () => {
    try {
      if (!("adoptedStyleSheets" in document) || typeof CSSStyleSheet !== "function") {
        throw new Error("Constructable stylesheets are unavailable");
      }
      const sheet = new CSSStyleSheet();
      if (typeof sheet.replaceSync !== "function") throw new Error("replaceSync is unavailable");
      sheet.replaceSync(cssText);
      const retained = [...document.adoptedStyleSheets]
        .filter((candidate) => !styleRegistry.has(candidate));
      document.adoptedStyleSheets = [...retained, sheet];
      styleRegistry.clear();
      styleRegistry.add(sheet);
      document.getElementById(STYLE_ID)?.remove();
      styleSheet = sheet;
      styleMode = "adopted";
      return;
    } catch {
      styleSheet = null;
    }

    styleNode = document.getElementById(STYLE_ID) || document.createElement("style");
    styleNode.id = STYLE_ID;
    styleNode.textContent = cssText;
    if (!styleNode.parentElement) (document.head || document.documentElement).appendChild(styleNode);
    styleMode = "style";
  };

  const ensureStyle = () => {
    if (styleMode === "adopted" && styleSheet) {
      const current = [...document.adoptedStyleSheets];
      if (!current.includes(styleSheet)) {
        document.adoptedStyleSheets = [...current, styleSheet];
        metrics.styleRepairs += 1;
      }
      return;
    }
    if (styleNode && document.getElementById(STYLE_ID) !== styleNode) {
      document.getElementById(STYLE_ID)?.remove();
      (document.head || document.documentElement).appendChild(styleNode);
      metrics.styleRepairs += 1;
    }
  };

  installStyle();

  const applyRootState = (root) => {
    metrics.rootPasses += 1;
    ensureStyle();
    const shell = resolvedShell();
    setAttribute(root, "data-dream-skin", "active");
    setAttribute(root, SHELL_ATTR, shell);
    const mediaReady = videoEnabled && !videoFailed && videoReady;
    const handoffReady = videoEnabled && !videoFailed &&
      handedOffVideo?.ready === true && Boolean(handedOffVideo.video?.parentElement);
    const mediaState = mediaReady || handoffReady
      ? "video"
      : videoEnabled && !videoFailed ? "video-pending" : "image-fallback";
    const previousMedia = mediaTransitions[mediaTransitions.length - 1];
    if (!previousMedia || previousMedia.state !== mediaState ||
        previousMedia.videoReady !== videoReady) {
      mediaTransitions.push({
        state: mediaState,
        videoReady,
        handoffReady,
        at: Date.now(),
      });
      if (mediaTransitions.length > 16) mediaTransitions.shift();
    }
    setAttribute(root, "data-dream-media", mediaState);
    setAttribute(root, "data-dream-video-ready", videoReady ? "true" : "false");
    // Keep the poster image visible until the video has produced a frame. This
    // avoids a blank flash while a replacement media source is loading.
    setStyleProperty(root, "--dream-skin-art", mediaState === "video" ? "none" : `url("${artUrl}")`);
    applyTheme(root, shell);
    applyArtMetadata(root);
    return shell;
  };

  const selectorHit = (key) => {
    const selector = selectorByKey.get(key)?.selector;
    if (!selector) return false;
    try { return Boolean(document.querySelector(selector)); } catch { return false; }
  };

  const stableTestidHit = (testid) => {
    const selector = stableTestidSelector(testid);
    if (!selector) return false;
    try { return Boolean(document.querySelector(selector)); } catch { return false; }
  };

  const partNodes = new Set();
  const queryAll = (selector) => {
    if (!selector) return [];
    try { return [...document.querySelectorAll(selector)]; } catch { return []; }
  };
  const selectorNodes = (key) => queryAll(selectorByKey.get(key)?.selector);
  const addPart = (desired, part, nodes) => {
    for (const node of nodes) {
      if (node && typeof node.setAttribute === "function" && !desired.has(node)) {
        desired.set(node, part);
      }
    }
  };
  const refreshParts = () => {
    metrics.partPasses += 1;
    const desired = new Map();
    addPart(desired, "root", [document.documentElement]);
    addPart(desired, "sidebar", selectorNodes("left-panel"));
    addPart(desired, "main", selectorNodes("shell-main"));
    addPart(desired, "header", selectorNodes("header-tint"));
    addPart(desired, "home", selectorNodes("home-route"));
    addPart(desired, "project-list", selectorNodes("project-selector"));
    addPart(desired, "thread", selectorNodes("thread-surface"));
    addPart(desired, "message", selectorNodes("message"));
    addPart(desired, "composer", selectorNodes("composer-chrome"));
    addPart(desired, "composer-toolbar", selectorNodes("composer-toolbar"));
    addPart(desired, "dialog", selectorNodes("overlay-dialog"));
    const homeHero = selectorNodes("home-icon")[0]?.parentElement;
    addPart(desired, "home-hero", homeHero ? [homeHero] : []);

    for (const node of partNodes) {
      if (!desired.has(node)) {
        node.removeAttribute?.(PART_ATTR);
        metrics.partWrites += 1;
      }
    }
    partNodes.clear();
    for (const [node, part] of desired) {
      if (node.getAttribute?.(PART_ATTR) !== part) {
        node.setAttribute(PART_ATTR, part);
        metrics.partWrites += 1;
      }
      partNodes.add(node);
    }
  };

  const removeParts = () => {
    for (const node of partNodes) node.removeAttribute?.(PART_ATTR);
    partNodes.clear();
    for (const node of queryAll(`[${PART_ATTR}]`)) node.removeAttribute?.(PART_ATTR);
  };

  const scopeMatches = (scope, baseState, overlay) => {
    const active = new Set([baseState]);
    if (baseState !== "settings") active.add("all");
    if (overlay) active.add("overlay");
    const tokens = String(scope || "all").toLowerCase().match(/[a-z]+/g) || ["all"];
    return tokens.some((token) => token !== "config" && active.has(token));
  };

  const detectScope = () => {
    const overlay = selectorHit("overlay-menu") || selectorHit("overlay-dialog") ||
      selectorHit("overlay-popper");
    let baseState = "thread";
    if (selectorHit("appearance-radio") || stableTestidHit("theme-preview")) baseState = "settings";
    else if (selectorHit("home-icon") || selectorHit("home-route")) baseState = "home";
    else if (!selectorHit("shell-main")) baseState = "settings";
    const missingL1 = SELECTOR_CONTRACT.selectors
      .filter((entry) => entry.tier === "L1" && entry.required &&
        scopeMatches(entry.scope, baseState, overlay) && !selectorHit(entry.key))
      .map((entry) => entry.key);
    return {
      state: overlay ? "overlay" : baseState,
      baseState,
      overlay,
      // Settings replaces (or partially replaces) the app shell on macOS and
      // can retain a shell on Windows.  It is therefore always an L0 scope;
      // never treat the absence of the home/thread L1 anchors as a failure.
      level: baseState === "settings" || missingL1.length ? "L0" : "L1",
      missingL1,
    };
  };

  const refreshScope = () => {
    metrics.routePasses += 1;
    const scope = detectScope();
    const state = window[STATE_KEY];
    if (state?.installToken === installToken) state.scope = scope;
    return scope;
  };

  const ensure = ({ root: rootPass = true, scope: scopePass = false, parts: partPass = false } = {}) => {
    if (window[DISABLED_KEY]) return;
    const root = document.documentElement;
    if (!root) return;
    metrics.ensureCalls += 1;
    // Commit the media mode before touching the stage. This prevents the
    // previous body image from being painted during a video-theme swap.
    if (rootPass) applyRootState(root);
    if (rootPass) ensureBackgroundStage();
    if (partPass) refreshParts();
    if (scopePass) refreshScope();
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window[DISABLED_KEY] = true;
    const root = document.documentElement;
    for (const name of ROOT_ATTRS) root?.removeAttribute(name);
    for (const attribute of [...(root?.attributes || [])]) {
      if (attribute.name.startsWith("data-dream-")) root.removeAttribute(attribute.name);
    }
    for (const name of THEME_VARIABLES) root?.style.removeProperty(name);
    for (const property of [...(root?.style || [])]) {
      if (property.startsWith("--dream-") || property.startsWith("--ds-")) {
        root.style.removeProperty(property);
      }
    }
    removeParts();
    state?.rootObserver?.disconnect();
    state?.partObserver?.disconnect();
    if (bodyReadyHandler && typeof document.removeEventListener === "function") {
      document.removeEventListener("DOMContentLoaded", bodyReadyHandler);
    }
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (analysisTimer) clearTimeout(analysisTimer);
    removeBackgroundStage();
    document.getElementById(VIDEO_INPUT_ID)?.remove();
    if (state?.mediaHandler && state?.mediaQuery) {
      try { state.mediaQuery.removeEventListener("change", state.mediaHandler); } catch {}
    }
    if (state?.navigationHandler && state?.navigation) {
      try { state.navigation.removeEventListener("navigate", state.navigationHandler); } catch {}
    }
    if (styleSheet) {
      try {
        document.adoptedStyleSheets = [...document.adoptedStyleSheets]
          .filter((candidate) => candidate !== styleSheet);
      } catch {}
      styleRegistry.delete(styleSheet);
    }
    styleNode?.remove();
    if (document.getElementById(STYLE_ID) === styleNode) document.getElementById(STYLE_ID)?.remove();
    if (styleRegistry.size === 0) delete window[STYLE_REGISTRY_KEY];
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null, root: false, scope: false, parts: false };
  const flushScheduledEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = null;
    const pending = { root: scheduler.root, scope: scheduler.scope, parts: scheduler.parts };
    scheduler.root = false;
    scheduler.scope = false;
    scheduler.parts = false;
    ensure(pending);
  };
  const scheduleEnsure = ({ root = false, scope = false, parts = false } = {}, delay = 64) => {
    scheduler.root ||= root;
    scheduler.scope ||= scope;
    scheduler.parts ||= parts;
    if (scheduler.timeout) return;
    scheduler.timeout = setTimeout(flushScheduledEnsure, delay);
  };
  if (typeof MutationObserver === "function") {
    rootObserver = new MutationObserver(() => scheduleEnsure({ root: true }));
    partObserver = new MutationObserver(() => scheduleEnsure({ parts: true }, 80));
  }

  let mediaQuery = null;
  let mediaHandler = null;
  try {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaHandler = () => scheduleEnsure({ root: true });
  } catch {}

  const navigationApi = window.navigation && typeof window.navigation.addEventListener === "function"
    ? window.navigation : null;
  const navigationHandler = navigationApi ? () => {
    metrics.navigationEvents += 1;
    scheduleEnsure({ scope: true, parts: true }, 180);
  } : null;

  window[STATE_KEY] = {
    ensure,
    cleanup,
    rootObserver,
    partObserver,
    timer: null,
    scheduler,
    mediaQuery,
    mediaHandler,
    navigation: navigationApi,
    navigationHandler,
    artUrl,
    videoUrl: videoSource,
    videoMode,
    get videoFailed() { return videoFailed; },
    get videoReady() { return videoReady; },
    get videoError() { return videoError; },
    mediaTransitions,
    ensureVideoInput,
    attachVideoFile,
    useVideoFallback: fallbackToServer,
    handoffVideo: () => {
      const state = backgroundState;
      if (!state?.stage?.parentElement || !state.video?.parentElement) return null;
      handedOffVideo = {
        stage: state.stage,
        video: state.video,
        objectUrl: state.objectUrl,
        ready: videoReady && !videoFailed,
      };
      return { ...handedOffVideo };
    },
    installToken,
    styleMode,
    styleNode,
    styleSheet,
    styleRevision: STYLE_REVISION,
    analysis: artAnalysis,
    artMetadata: ART_METADATA,
    scope: null,
    selectorsSchema: SELECTOR_CONTRACT.schema,
    metrics,
    version: VERSION,
    themeId: THEME.id || "custom",
    revision: PAYLOAD_REVISION,
    detectShellAppearance,
  };
  const firstEnsureStartedAt = now();
  ensure({ root: true, parts: true });
  const initialScope = refreshScope();
  metrics.firstEnsureMs = Number((now() - firstEnsureStartedAt).toFixed(3));

  const observeAttributes = (node) => {
    if (!rootObserver || !node) return;
    rootObserver.observe(node, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
    });
  };
  const observePartTree = (node) => {
    if (!partObserver || !node) return;
    partObserver.observe(node, { childList: true, subtree: true });
  };
  observeAttributes(document.documentElement);
  const observeBody = () => {
    observeAttributes(document.body);
    observePartTree(document.body);
  };
  if (document.body) observeBody();
  else if (typeof document.addEventListener === "function") {
    bodyReadyHandler = () => {
      if (!window[DISABLED_KEY]) {
        observeBody();
        scheduleEnsure({ parts: true }, 0);
      }
    };
    document.addEventListener("DOMContentLoaded", bodyReadyHandler, { once: true });
  }
  const timer = setInterval(() => {
    metrics.safetyPasses += 1;
    ensure({ root: true });
  }, 30000);
  window[STATE_KEY].timer = timer;
  if (mediaHandler && mediaQuery && typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", mediaHandler);
  }
  if (navigationHandler && navigationApi) {
    navigationApi.addEventListener("navigate", navigationHandler);
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
    ensure({ root: true });
  }).catch(() => {});
  return {
    installed: true,
    version: VERSION,
    themeId: THEME.id || "custom",
    revision: PAYLOAD_REVISION,
    shell: resolvedShell(),
    scope: initialScope,
    styleMode,
    analysis: artAnalysis,
  };
})(__DREAM_SKIN_CSS_JSON__, __DREAM_SKIN_ART_JSON__, __DREAM_SKIN_THEME_JSON__, __DREAM_SKIN_VIDEO_JSON__)
