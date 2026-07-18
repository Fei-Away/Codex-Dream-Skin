((cssText, artDataUrl, rawConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const DOCK_ID = "codex-dream-skin-utility-dock";
  const ROOT_CLASSES = [
    "codex-dream-skin",
    "dream-theme-light",
    "dream-theme-dark",
    "dream-art-wide",
    "dream-art-standard",
    "dream-focus-left",
    "dream-focus-center",
    "dream-focus-right",
    "dream-safe-left",
    "dream-safe-center",
    "dream-safe-right",
    "dream-safe-none",
    "dream-task-ambient",
    "dream-task-banner",
    "dream-task-off",
    "dream-focus-mode",
  ];
  const ROOT_PROPERTIES = [
    "--dream-art",
    "--dream-art-position",
    "--dream-focus-x",
    "--dream-focus-y",
    "--dream-accent",
    "--dream-accent-ink",
    "--dream-image-luma",
  ];
  const HOME_UTILITY_CLASS = "dream-home-utility";
  const installToken = {};
  let samplingNativeShell = false;
  let observer = null;
  let dockScroller = null;
  let focusTimer = null;
  let focusState = { active: false, sidebarWasExpanded: false, startedAt: 0 };
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));
  const luminance = (red, green, blue) => {
    const linear = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const defaultProfile = {
    appearance: "dark",
    accent: [108, 131, 142],
    focusX: .5,
    focusY: .5,
    aspect: 1.6,
    luma: .32,
    safeArea: "center",
  };

  const normalizeConfig = (value) => {
    const config = value && typeof value === "object" ? value : {};
    const art = config.art && typeof config.art === "object" ? config.art : {};
    const hasNumber = (candidate) =>
      (typeof candidate === "number" || (typeof candidate === "string" && candidate.trim() !== "")) &&
      Number.isFinite(Number(candidate));
    const requestedAccent = typeof config?.palette?.accent === "string"
      ? config.palette.accent.trim()
      : "";
    const safeAccent = /^(?:#[\da-f]{3,8}|(?:rgb|hsl|oklch|oklab)\([^;{}]{1,96}\))$/i.test(requestedAccent)
      ? requestedAccent
      : null;
    const appearance = ["auto", "light", "dark"].includes(config.appearance)
      ? config.appearance
      : "auto";
    const safeArea = ["auto", "left", "right", "center", "none"].includes(art.safeArea)
      ? art.safeArea
      : "auto";
    const taskMode = ["auto", "ambient", "banner", "off"].includes(art.taskMode)
      ? art.taskMode
      : "auto";
    const features = config.features && typeof config.features === "object" ? config.features : {};
    const metadataRatio = Number(config?.artMetadata?.ratio);
    return {
      appearance,
      safeArea,
      taskMode,
      focusX: hasNumber(art.focusX) ? clamp(art.focusX) : null,
      focusY: hasNumber(art.focusY) ? clamp(art.focusY) : null,
      accent: safeAccent,
      initialAspect: Number.isFinite(metadataRatio) && metadataRatio > 0 ? metadataRatio : null,
      utilityDock: features.utilityDock === true,
    };
  };

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.focusTimer) clearInterval(previous.focusTimer);
  previous?.restoreFocus?.();
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);
  const artUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();
  const config = normalizeConfig(rawConfig);
  let profile = {
    ...defaultProfile,
    aspect: config.initialAspect ?? defaultProfile.aspect,
  };
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamVersion = "3";
  }

  const analyzeArt = () => new Promise((resolve) => {
    if (typeof Image !== "function") {
      resolve(defaultProfile);
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        const width = 48;
        const height = Math.max(12, Math.round(width * image.naturalHeight / image.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        let count = 0;
        let totalRed = 0;
        let totalGreen = 0;
        let totalBlue = 0;
        let totalBrightness = 0;
        const samples = [];
        const sampleMap = new Array(width * height);
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] < 96) continue;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const light = (.2126 * red + .7152 * green + .0722 * blue) / 255;
          const sample = { red, green, blue, light, index: offset / 4 };
          samples.push(sample);
          sampleMap[sample.index] = sample;
          totalRed += red;
          totalGreen += green;
          totalBlue += blue;
          totalBrightness += light;
          count += 1;
        }
        if (!count) throw new Error("Image contains no opaque pixels");
        const average = [totalRed / count, totalGreen / count, totalBlue / count];
        const averageBrightness = totalBrightness / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let sampleCount = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = sampleMap[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              sampleCount += 1;
              const previousSample = x > start ? sampleMap[y * width + x - 1] : null;
              const above = y > 0 ? sampleMap[(y - 1) * width + x] : null;
              if (previousSample) { edges += Math.abs(sample.light - previousSample.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = sampleCount ? total / sampleCount : 0;
          const variance = sampleCount ? Math.max(0, totalSquared / sampleCount - mean * mean) : 1;
          return Math.sqrt(variance) * .58 + (edgeCount ? edges / edgeCount : 1) * .42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * .38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * .86) safeArea = "left";
        else if (rightInformation < leftInformation * .86) safeArea = "right";
        let focusWeight = 0;
        let focusX = 0;
        let focusY = 0;
        let accentWeight = 0;
        let accent = [0, 0, 0];
        for (const sample of samples) {
          const x = sample.index % width;
          const y = Math.floor(sample.index / width);
          const difference = Math.sqrt(
            (sample.red - average[0]) ** 2 +
            (sample.green - average[1]) ** 2 +
            (sample.blue - average[2]) ** 2,
          ) / 441.7;
          const saliency = .03 + difference ** 1.35;
          focusX += (x / Math.max(1, width - 1)) * saliency;
          focusY += (y / Math.max(1, height - 1)) * saliency;
          focusWeight += saliency;
          const max = Math.max(sample.red, sample.green, sample.blue);
          const min = Math.min(sample.red, sample.green, sample.blue);
          const saturation = max ? (max - min) / max : 0;
          const usableLight = 1 - Math.min(1, Math.abs(sample.light - .46) / .54);
          const weight = saturation ** 2 * (.15 + usableLight);
          accent[0] += sample.red * weight;
          accent[1] += sample.green * weight;
          accent[2] += sample.blue * weight;
          accentWeight += weight;
        }
        const resolvedAccent = accentWeight > 1
          ? accent.map((channel) => Math.round(channel / accentWeight))
          : average.map((channel) => Math.round(channel));
        let resolvedFocusX = clamp(focusX / focusWeight);
        if (safeArea === "left") resolvedFocusX = Math.max(.64, resolvedFocusX);
        if (safeArea === "right") resolvedFocusX = Math.min(.36, resolvedFocusX);
        resolve({
          appearance: averageBrightness >= .58 ? "light" : "dark",
          accent: resolvedAccent,
          focusX: resolvedFocusX,
          focusY: clamp(focusY / focusWeight),
          aspect: image.naturalWidth / Math.max(1, image.naturalHeight),
          luma: clamp(averageBrightness),
          safeArea,
        });
      } catch {
        resolve(defaultProfile);
      }
    };
    image.onerror = () => resolve(defaultProfile);
    image.src = artUrl;
  });

  const detectShellAppearance = () => {
    const root = document.documentElement;
    const body = document.body;
    const classes = `${root?.className || ""} ${body?.className || ""}`
      .toLowerCase()
      .replace(/\bdream-theme-(?:dark|light)\b/g, "");
    if (/\b(dark|electron-dark|theme-dark|appearance-dark)\b/.test(classes)) return "dark";
    if (/\b(light|electron-light|theme-light|appearance-light)\b/.test(classes)) return "light";

    const dataTheme = (
      root?.getAttribute?.("data-theme") ||
      root?.getAttribute?.("data-appearance") ||
      root?.getAttribute?.("data-color-mode") ||
      body?.getAttribute?.("data-theme") ||
      body?.getAttribute?.("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    try {
      const hadSkin = root?.classList?.contains?.("codex-dream-skin");
      const savedSkinClasses = hadSkin
        ? ROOT_CLASSES.filter((className) => root.classList.contains(className))
        : [];
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove(...ROOT_CLASSES);
      try {
        const colorScheme = getComputedStyle(root).colorScheme || "";
        if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
        if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
      } finally {
        if (hadSkin) root.classList.add(...savedSkinClasses);
        observer?.takeRecords?.();
        samplingNativeShell = false;
      }
    } catch {
      samplingNativeShell = false;
    }
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}
    return "light";
  };

  const clearSkinDom = () => {
    const root = document.documentElement;
    root?.classList.remove(...ROOT_CLASSES);
    for (const property of ROOT_PROPERTIES) root?.style.removeProperty(property);
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-task").forEach((node) => node.classList.remove("dream-task"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.querySelectorAll(`.${HOME_UTILITY_CLASS}`).forEach((node) => node.classList.remove(HOME_UTILITY_CLASS));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(DOCK_ID)?.remove();
    dockScroller?.removeEventListener?.("scroll", updateDockState);
    dockScroller = null;
  };

  const sidebarTrigger = () => document.querySelector('[data-app-shell-sidebar-trigger]');
  const threadScroller = () => document.querySelector(".thread-scroll-container");
  const sidebarIsExpanded = () => {
    const trigger = sidebarTrigger();
    const label = trigger?.getAttribute?.("aria-label") || "";
    if (/hide|collapse|关闭|隐藏|收起/i.test(label)) return true;
    if (/show|expand|打开|显示|展开/i.test(label)) return false;
    const rect = document.querySelector("aside.app-shell-left-panel")?.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 80);
  };
  const motionEnabled = () => {
    try { return !window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; }
  };
  const threadTurns = (scroller) => scroller?.querySelectorAll
    ? [...scroller.querySelectorAll("[data-turn-key]")]
      .map((element) => ({ element, rect: element.getBoundingClientRect?.() }))
      .filter(({ rect }) => rect && rect.height > 1)
    : [];
  const scrollThreadBy = (scroller, delta) => {
    if (!scroller || !Number.isFinite(delta)) return false;
    scroller.scrollTo?.({
      top: scroller.scrollTop + delta,
      behavior: motionEnabled() ? "smooth" : "auto",
    });
    return true;
  };
  const scrollToCurrentTurnTop = () => {
    const scroller = threadScroller();
    if (!scroller) return false;
    const turns = threadTurns(scroller);
    if (!turns.length) return scrollThreadBy(scroller, -Math.max(160, scroller.clientHeight * .82));
    const viewport = scroller.getBoundingClientRect?.() || {
      top: 0,
      bottom: scroller.clientHeight,
      height: scroller.clientHeight,
    };
    const viewportHeight = Math.max(1, viewport.height || viewport.bottom - viewport.top || scroller.clientHeight);
    const tolerance = Math.max(6, Math.min(16, viewportHeight * .018));
    const alignedIndex = turns.findIndex(({ rect }) =>
      Math.abs(rect.top - viewport.top) <= tolerance && rect.bottom > viewport.top + tolerance);
    if (alignedIndex >= 0) {
      if (alignedIndex > 0) return scrollThreadBy(scroller, turns[alignedIndex - 1].rect.top - viewport.top);
      return scrollThreadBy(scroller, -Math.max(160, scroller.clientHeight * .82));
    }
    const readingY = viewport.top + viewportHeight * .5;
    let currentIndex = turns.findIndex(({ rect }) => rect.top <= readingY && rect.bottom > readingY);
    if (currentIndex < 0) {
      let bestVisible = -1;
      let bestOverlap = 0;
      for (let index = 0; index < turns.length; index += 1) {
        const { rect } = turns[index];
        const overlap = Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top));
        if (overlap > bestOverlap) { bestOverlap = overlap; bestVisible = index; }
      }
      currentIndex = bestVisible;
    }
    if (currentIndex < 0) return scrollThreadBy(scroller, -Math.max(160, scroller.clientHeight * .82));
    const current = turns[currentIndex];
    if (current.rect.top >= viewport.top - tolerance) {
      if (currentIndex > 0) return scrollThreadBy(scroller, turns[currentIndex - 1].rect.top - viewport.top);
      return scrollThreadBy(scroller, -Math.max(160, scroller.clientHeight * .82));
    }
    return scrollThreadBy(scroller, current.rect.top - viewport.top);
  };
  const formatFocusElapsed = (elapsedMs) => {
    const totalSeconds = Math.max(0, Math.floor(Number(elapsedMs) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };
  const renderFocusTimer = () => {
    const output = document.getElementById("codex-dream-skin-focus-timer");
    if (!output) return;
    const label = formatFocusElapsed(focusState.active && focusState.startedAt
      ? Date.now() - focusState.startedAt : 0);
    output.textContent = label;
    output.setAttribute("aria-label", `Focus time ${label}`);
  };
  const stopFocusTimer = () => {
    if (focusTimer) clearInterval(focusTimer);
    focusTimer = null;
    renderFocusTimer();
  };
  const restoreFocus = () => {
    if (!focusState.active) return;
    document.documentElement?.classList.remove("dream-focus-mode");
    if (focusState.sidebarWasExpanded && !sidebarIsExpanded()) sidebarTrigger()?.click?.();
    focusState = { active: false, sidebarWasExpanded: false, startedAt: 0 };
    stopFocusTimer();
  };
  const setFocusMode = (active) => {
    const root = document.documentElement;
    const trigger = sidebarTrigger();
    if (!root || !trigger) return;
    if (active && !focusState.active) {
      focusState = { active: true, sidebarWasExpanded: sidebarIsExpanded(), startedAt: Date.now() };
      if (focusState.sidebarWasExpanded) trigger.click?.();
      root.classList.add("dream-focus-mode");
      stopFocusTimer();
      renderFocusTimer();
      focusTimer = setInterval(renderFocusTimer, 1000);
    } else if (!active && focusState.active) {
      restoreFocus();
    }
    updateDockState();
  };
  const DOCK_ICONS = {
    focus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4"/><circle cx="12" cy="12" r="3.2"/></svg>',
    sidebar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M8.5 4v16M5.5 8h.01M5.5 12h.01"/></svg>',
    top: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M7 12l5-5 5 5M12 7v12"/></svg>',
    bottom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h14M7 12l5 5 5-5M12 5v12"/></svg>',
  };
  const makeDockItem = (dock, action, label, onClick) => {
    const item = document.createElement("div");
    item.className = "dream-dock-item";
    item.dataset.dockItem = action;
    const button = document.createElement("button");
    button.type = "button";
    button.id = `codex-dream-skin-dock-${action}`;
    button.className = "dream-dock-button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = DOCK_ICONS[action];
    button.addEventListener("click", onClick);
    const tooltip = document.createElement("span");
    tooltip.className = "dream-dock-tooltip";
    tooltip.textContent = label;
    tooltip.setAttribute("role", "tooltip");
    item.appendChild(button);
    item.appendChild(tooltip);
    dock.appendChild(item);
    return button;
  };
  function ensureDock() {
    if (!config.utilityDock) {
      document.getElementById(DOCK_ID)?.remove();
      return null;
    }
    let dock = document.getElementById(DOCK_ID);
    if (!dock || dock.parentElement !== document.body) {
      dock?.remove();
      dock = document.createElement("nav");
      dock.id = DOCK_ID;
      dock.className = "dream-utility-dock";
      dock.setAttribute("aria-label", "Task utility dock");
      makeDockItem(dock, "focus", "Focus mode", () => setFocusMode(!focusState.active));
      const timer = document.createElement("output");
      timer.id = "codex-dream-skin-focus-timer";
      timer.className = "dream-focus-timer";
      timer.textContent = "00:00";
      dock.appendChild(timer);
      makeDockItem(dock, "sidebar", "Show or hide sidebar", () => sidebarTrigger()?.click?.());
      makeDockItem(dock, "top", "Current turn or previous turn", scrollToCurrentTurnTop);
      makeDockItem(dock, "bottom", "Latest message", () => {
        const scroller = threadScroller();
        scroller?.scrollTo?.({ top: scroller.scrollHeight, behavior: motionEnabled() ? "smooth" : "auto" });
      });
      document.body.appendChild(dock);
    }
    const currentScroller = threadScroller();
    if (currentScroller !== dockScroller) {
      dockScroller?.removeEventListener?.("scroll", updateDockState);
      dockScroller = currentScroller;
      dockScroller?.addEventListener?.("scroll", updateDockState, { passive: true });
    }
    updateDockState();
    return dock;
  }
  function updateDockState() {
    const dock = document.getElementById(DOCK_ID);
    if (!dock) return;
    const focusButton = document.getElementById("codex-dream-skin-dock-focus");
    const sidebarButton = document.getElementById("codex-dream-skin-dock-sidebar");
    const topButton = document.getElementById("codex-dream-skin-dock-top");
    const bottomButton = document.getElementById("codex-dream-skin-dock-bottom");
    const scroller = threadScroller();
    const canScroll = Boolean(scroller && scroller.scrollHeight > scroller.clientHeight + 1);
    if (focusButton) {
      focusButton.setAttribute("aria-pressed", String(focusState.active));
      focusButton.classList.toggle("is-active", focusState.active);
    }
    if (sidebarButton) {
      sidebarButton.disabled = focusState.active || !sidebarTrigger();
      sidebarButton.setAttribute("aria-pressed", String(sidebarIsExpanded()));
    }
    if (topButton) topButton.disabled = !canScroll;
    if (bottomButton) bottomButton.disabled = !canScroll;
    renderFocusTimer();
  }

  const applyProfile = (root) => {
    const focusX = config.focusX ?? profile.focusX;
    const focusY = config.focusY ?? profile.focusY;
    const appearance = config.appearance === "auto" ? detectShellAppearance() : config.appearance;
    const focus = focusX < .4 ? "left" : focusX > .6 ? "right" : "center";
    const safeArea = config.safeArea === "auto" ? (profile.safeArea ||
      (focus === "left" ? "right" : focus === "right" ? "left" : "center")) : config.safeArea;
    const taskMode = config.taskMode === "auto"
      ? profile.aspect >= 2.25 ? "banner" : "ambient"
      : config.taskMode;
    const accent = config.accent || `rgb(${profile.accent.join(" ")})`;
    const accentInk = luminance(...profile.accent) > .42 ? "rgb(26 24 28)" : "rgb(250 248 251)";
    root.classList.toggle("dream-theme-light", appearance === "light");
    root.classList.toggle("dream-theme-dark", appearance === "dark");
    root.classList.toggle("dream-art-wide", profile.aspect >= 1.75);
    root.classList.toggle("dream-art-standard", profile.aspect < 1.75);
    for (const value of ["left", "center", "right"]) {
      root.classList.toggle(`dream-focus-${value}`, focus === value);
    }
    for (const value of ["left", "center", "right", "none"]) {
      root.classList.toggle(`dream-safe-${value}`, safeArea === value);
    }
    for (const value of ["ambient", "banner", "off"]) {
      root.classList.toggle(`dream-task-${value}`, taskMode === value);
    }
    root.style.setProperty("--dream-art", `url("${artUrl}")`);
    root.style.setProperty("--dream-art-position", `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`);
    root.style.setProperty("--dream-focus-x", String(focusX));
    root.style.setProperty("--dream-focus-y", String(focusY));
    root.style.setProperty("--dream-accent", accent);
    root.style.setProperty("--dream-accent-ink", accentInk);
    root.style.setProperty("--dream-image-luma", profile.luma.toFixed(3));
  };

  const ensure = () => {
    if (window.__CODEX_DREAM_SKIN_DISABLED__) return;
    const root = document.documentElement;
    if (!root || !document.body) return;

    // Main Codex shell is the content surface. The left rail is optional: Codex
    // removes or rebuilds aside.app-shell-left-panel while collapsing/expanding
    // it, and clearing the skin there flashes native colors over the active theme.
    // True auxiliary windows (pets, blank targets) still have no main surface, so
    // they continue to clear residual skin state.
    const shellMain = document.querySelector("main.main-surface") ||
      document.querySelector("main") ||
      document.querySelector('[role="main"]');
    if (!shellMain) {
      clearSkinDom();
      return;
    }

    root.classList.add("codex-dream-skin");
    applyProfile(root);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== "3") {
      style.textContent = cssText;
      style.dataset.dreamVersion = "3";
    }

    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    const mainCandidates = [...document.querySelectorAll('[role="main"]')];
    if (!mainCandidates.length) mainCandidates.push(shellMain);
    for (const candidate of mainCandidates) {
      candidate.classList.toggle("dream-home", candidate === home);
      candidate.classList.toggle("dream-task", candidate !== home);
    }
    const utilityBars = new Set(home ? home.querySelectorAll('[class*="_homeUtilityBar_"]') : []);
    for (const candidate of document.querySelectorAll(`.${HOME_UTILITY_CLASS}`)) {
      if (!utilityBars.has(candidate)) candidate.classList.remove(HOME_UTILITY_CLASS);
    }
    for (const candidate of utilityBars) candidate.classList.add(HOME_UTILITY_CLASS);
    shellMain.classList.toggle("dream-home-shell", Boolean(home));

    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      document.body.appendChild(chrome);
    }
    chrome.classList.toggle("dream-home-shell", Boolean(home));
    ensureDock();
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    clearSkinDom();
    restoreFocus();
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.focusTimer) clearInterval(state.focusTimer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  observer = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
  });
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure, cleanup, restoreFocus, scrollToCurrentTurnTop, observer, timer, focusTimer, scheduler,
    artUrl, profile, config, installToken, version: "1.2.0",
  };
  ensure();
  analyzeArt().then((result) => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken || window.__CODEX_DREAM_SKIN_DISABLED__) return;
    profile = result;
    state.profile = result;
    ensure();
  });
  return { installed: true, version: "1.2.0", adaptive: true, utilityDock: config.utilityDock };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_THEME_JSON__)
