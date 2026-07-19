((cssText, artDataUrl, rawConfig, rawSelectors, rawSubjectDataUrl) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
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
    "dream-motion-active",
    "dream-motion-calm",
    "dream-motion-concert",
    "dream-motion-reduced",
  ];
  const ROOT_PROPERTIES = [
    "--dream-art",
    "--dream-art-position",
    "--dream-focus-x",
    "--dream-focus-y",
    "--dream-accent",
    "--dream-accent-ink",
    "--dream-image-luma",
    "--dream-subject",
  ];
  const HOME_UTILITY_CLASS = "dream-home-utility";
  const installToken = {};
  let samplingNativeShell = false;
  let observer = null;
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));
  const luminance = (red, green, blue) => {
    const linear = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const resolveCssColor = (value) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext?.("2d", { willReadFrequently: true });
      if (!context) return null;
      const acceptsColor = (sentinel) => {
        context.fillStyle = sentinel;
        const baseline = context.fillStyle;
        try { context.fillStyle = value; } catch { return false; }
        return context.fillStyle !== baseline;
      };
      if (!acceptsColor("#010203") && !acceptsColor("#040506")) return null;
      context.clearRect?.(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect?.(0, 0, 1, 1);
      const pixels = context.getImageData?.(0, 0, 1, 1)?.data;
      if (!pixels || pixels.length < 4) return null;
      return [pixels[0], pixels[1], pixels[2], pixels[3] / 255];
    } catch {
      return null;
    }
  };
  const accentInkFor = (rgba, appearance, fallback) => {
    const color = rgba ?? [...fallback, 1];
    const alpha = Math.min(1, Math.max(0, Number(color[3] ?? 1)));
    const backdrop = appearance === "dark" ? [31, 33, 36] : [250, 249, 247];
    const channels = color.slice(0, 3).map((channel, index) => {
      const value = Number(channel);
      const clamped = Number.isFinite(value) ? Math.min(255, Math.max(0, value)) : backdrop[index];
      return clamped * alpha + backdrop[index] * (1 - alpha);
    });
    const backgroundLuminance = luminance(...channels);
    const blackContrast = (backgroundLuminance + .05) / .05;
    const whiteContrast = 1.05 / (backgroundLuminance + .05);
    return blackContrast >= whiteContrast ? "rgb(0 0 0)" : "rgb(255 255 255)";
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
    const motion = config.motion && typeof config.motion === "object" ? config.motion : {};
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
    const metadataRatio = Number(config?.artMetadata?.ratio);
    const motionNumber = (candidate, fallback) => hasNumber(candidate) ? clamp(candidate) : fallback;
    return {
      appearance,
      safeArea,
      taskMode,
      focusX: hasNumber(art.focusX) ? clamp(art.focusX) : null,
      focusY: hasNumber(art.focusY) ? clamp(art.focusY) : null,
      accent: safeAccent,
      initialAspect: Number.isFinite(metadataRatio) && metadataRatio > 0 ? metadataRatio : null,
      motion: {
        enabled: motion.enabled === true,
        preset: ["calm", "concert"].includes(motion.preset) ? motion.preset : "calm",
        intensity: motionNumber(motion.intensity, .55),
        speed: motionNumber(motion.speed, .42),
        parallax: motionNumber(motion.parallax, .22),
        particles: motion.particles !== false,
        waveform: motion.waveform !== false,
        pauseWhenHidden: motion.pauseWhenHidden !== false,
      },
    };
  };

  const defaultSelectorGroups = {
    shell: ["main.main-surface", "main"],
    sidebar: ["aside.app-shell-left-panel", "aside"],
    composer: [".composer-surface-chrome", '[contenteditable="true"]', "textarea"],
    main: ['[role="main"]', "main"],
    home: ['[role="main"]:has([data-testid="home-icon"])'],
    utility: ['[class*="_homeUtilityBar_"]'],
  };
  const selectorGroups = Object.fromEntries(Object.entries(defaultSelectorGroups).map(([name, fallback]) => {
    const requested = rawSelectors?.[name];
    return [name, Array.isArray(requested) && requested.every((selector) => typeof selector === "string")
      ? requested : fallback];
  }));
  const queryAll = (name, scope = document) => {
    const matches = [];
    for (const selector of selectorGroups[name] || []) {
      try {
        for (const node of scope.querySelectorAll(selector)) {
          if (!matches.includes(node)) matches.push(node);
        }
      } catch {}
    }
    return matches;
  };
  const queryFirst = (name, scope = document) => queryAll(name, scope)[0] || null;
  const isCodexEntryUrl = (value) => {
    if (typeof value !== "string") return false;
    const baseUrl = value.split(/[?#]/, 1)[0];
    return baseUrl === "app://-/index.html" || baseUrl === "app://codex/" ||
      baseUrl.startsWith("app://codex/");
  };
  const isCodexEntryPage = () => {
    try {
      return document.title === "Codex" && isCodexEntryUrl(location.href);
    } catch {
      return false;
    }
  };

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  previous?.motion?.destroy?.();
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);
  if (previous?.subjectUrl) URL.revokeObjectURL(previous.subjectUrl);
  const objectUrlFromData = (dataUrl) => {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || "image/png";
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };
  const artUrl = objectUrlFromData(artDataUrl);
  const subjectUrl = objectUrlFromData(rawSubjectDataUrl);
  const config = normalizeConfig(rawConfig);
  const configuredAccent = config.accent ? resolveCssColor(config.accent) : null;
  let profile = {
    ...defaultProfile,
    aspect: config.initialAspect ?? defaultProfile.aspect,
  };
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamVersion = "4";
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

  let motionController = null;
  const createMotionController = (chrome) => {
    if (!config.motion.enabled || !chrome || typeof chrome.appendChild !== "function") return null;

    const artLayer = document.createElement("div");
    artLayer.className = "dream-motion-art";
    const subjectLayer = document.createElement("div");
    subjectLayer.className = subjectUrl
      ? "dream-motion-subject" : "dream-motion-subject dream-motion-subject-fallback";
    const canvas = document.createElement("canvas");
    canvas.id = "codex-dream-skin-motion";
    canvas.setAttribute?.("aria-hidden", "true");
    const hairCanvas = document.createElement("canvas");
    chrome.appendChild(artLayer);
    chrome.appendChild(subjectLayer);
    chrome.appendChild(canvas);

    const context = canvas.getContext?.("2d") ?? null;
    const hairContext = hairCanvas.getContext?.("2d") ?? null;
    const reducedQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? { matches: false };
    const requestFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => setTimeout(() => callback(Date.now()), 32);
    const cancelFrame = typeof window.cancelAnimationFrame === "function"
      ? window.cancelAnimationFrame.bind(window) : clearTimeout;
    const now = () => globalThis.performance?.now?.() ?? Date.now();
    let reduced = Boolean(reducedQuery.matches);
    let alive = true;
    let frame = null;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let subjectImage = null;
    let subjectImageReady = false;
    let hairDpr = .5;
    let lastHairTextureTime = -Infinity;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const hairLocks = [
      {
        anchor: [.585, .14], phase: 0, strength: 1,
        points: [
          [.545, .105], [.602, .102], [.635, .185], [.644, .32], [.61, .47],
          [.565, .61], [.515, .735], [.455, .82], [.39, .885], [.35, .835],
          [.375, .72], [.43, .605], [.487, .47], [.52, .285],
        ],
      },
      {
        anchor: [.525, .285], phase: 1.75, strength: .72, opacity: .74,
        points: [
          [.505, .27], [.55, .285], [.55, .405], [.515, .525], [.465, .625],
          [.415, .715], [.365, .89], [.325, .875], [.335, .755], [.38, .66],
          [.435, .56], [.48, .435],
        ],
      },
      {
        anchor: [.77, .105], phase: .85, strength: 1.08,
        points: [
          [.75, .04], [.817, .035], [.872, .098], [.91, .195], [.95, .275],
          [.997, .305], [1, .575], [.94, .55], [.89, .48], [.84, .405],
          [.802, .29], [.775, .18],
        ],
      },
      {
        anchor: [.835, .245], phase: 2.6, strength: .82, opacity: .78,
        points: [
          [.81, .215], [.86, .22], [.905, .275], [.955, .305], [1, .325],
          [1, .405], [.965, .385], [.915, .35], [.862, .32], [.825, .29],
        ],
      },
      {
        anchor: [.625, .165], phase: 3.8, strength: .3, opacity: .58,
        points: [
          [.61, .155], [.632, .16], [.642, .235], [.636, .32], [.62, .405],
          [.607, .39], [.616, .305], [.607, .225],
        ],
      },
    ];

    const seededRandom = (seedValue) => {
      let seed = seedValue >>> 0;
      return () => {
        seed += 0x6d2b79f5;
        let value = seed;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    };

    const rebuildParticles = () => {
      const random = seededRandom((width * 73856093) ^ (height * 19349663));
      const density = config.motion.preset === "concert" ? 26 : 15;
      const count = Math.max(8, Math.min(36, Math.round(density * Math.sqrt(width * height / 2073600))));
      particles = Array.from({ length: count }, (_, index) => {
        const onStage = random() > .22;
        return {
          x: onStage ? .44 + random() * .56 : random() * .52,
          y: random(),
          radius: .7 + random() * 2.2,
          phase: random() * Math.PI * 2,
          drift: .18 + random() * .72,
          speed: .16 + random() * .52,
          kind: index % 9 === 0 ? "star" : index % 4 === 0 ? "diamond" : "dot",
          color: index % 3,
        };
      });
    };

    const resize = () => {
      const nextWidth = Math.max(1, Math.round(window.innerWidth || document.documentElement?.clientWidth || 1280));
      const nextHeight = Math.max(1, Math.round(window.innerHeight || document.documentElement?.clientHeight || 720));
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      const pixelCap = Math.sqrt(4200000 / Math.max(1, width * height));
      dpr = Math.max(.5, Math.min(.78, Number(window.devicePixelRatio) || 1, pixelCap));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      if (canvas.style) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      context?.setTransform?.(dpr, 0, 0, dpr, 0, 0);
      hairDpr = Math.max(.35, Math.min(dpr, .55));
      hairCanvas.width = Math.max(1, Math.round(width * hairDpr));
      hairCanvas.height = Math.max(1, Math.round(height * hairDpr));
      hairContext?.setTransform?.(hairDpr, 0, 0, hairDpr, 0, 0);
      lastHairTextureTime = -Infinity;
      rebuildParticles();
    };

    const drawStar = (x, y, radius, rotation) => {
      if (!context) return;
      context.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const angle = rotation - Math.PI / 2 + point * Math.PI / 5;
        const distance = point % 2 === 0 ? radius : radius * .42;
        const px = x + Math.cos(angle) * distance;
        const py = y + Math.sin(angle) * distance;
        if (point === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
    };

    const drawWaveform = (time) => {
      if (!context || !config.motion.waveform) return;
      const endX = width * .59;
      const baseline = height * .575;
      const strength = (5 + config.motion.intensity * 10) * Math.min(1, width / 1200);
      const gradient = context.createLinearGradient?.(0, 0, endX, 0);
      if (gradient) {
        gradient.addColorStop(0, "rgba(128, 239, 255, 0.04)");
        gradient.addColorStop(.42, `rgba(159, 233, 255, ${(.08 + config.motion.intensity * .08).toFixed(3)})`);
        gradient.addColorStop(1, "rgba(234, 170, 255, 0)");
      }
      context.save();
      context.strokeStyle = gradient || "rgba(154, 233, 255, .12)";
      context.lineWidth = 1.2;
      context.beginPath();
      for (let x = 0; x <= endX; x += 7) {
        const envelope = Math.sin(Math.PI * x / Math.max(1, endX)) ** 1.4;
        const y = baseline + Math.sin(x * .026 + time * 1.2) * strength * envelope +
          Math.sin(x * .071 - time * .7) * strength * .28 * envelope;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      context.restore();
    };

    const getSubjectGeometry = () => {
      const imageWidth = Number(subjectImage?.naturalWidth || subjectImage?.width || 0);
      const imageHeight = Number(subjectImage?.naturalHeight || subjectImage?.height || 0);
      if (!(imageWidth > 0 && imageHeight > 0)) return null;
      const overscan = Math.max(width, height) * .04;
      const layerWidth = width + overscan * 2;
      const layerHeight = height + overscan * 2;
      const scale = Math.max(layerWidth / imageWidth, layerHeight / imageHeight);
      const renderedWidth = imageWidth * scale;
      const renderedHeight = imageHeight * scale;
      const focusX = clamp(config.focusX ?? profile.focusX);
      const focusY = clamp(config.focusY ?? profile.focusY);
      return {
        imageWidth,
        imageHeight,
        scale,
        offsetX: -overscan + (layerWidth - renderedWidth) * focusX,
        offsetY: -overscan + (layerHeight - renderedHeight) * focusY,
        originX: -overscan + layerWidth * .73,
        originY: -overscan + layerHeight * .52,
      };
    };

    const applySubjectTransform = (target, motion, geometry) => {
      if (!target || !motion || !geometry) return;
      target.translate(motion.x, motion.y);
      target.translate(geometry.originX, geometry.originY);
      target.rotate(motion.rotate);
      target.scale(motion.scale, motion.scale);
      target.translate(-geometry.originX, -geometry.originY);
    };

    const drawHairTexture = (time, motion) => {
      if (!context || !hairContext || !subjectImageReady || !subjectImage ||
        typeof context.drawImage !== "function" || typeof hairContext.drawImage !== "function" ||
        typeof hairContext.clip !== "function") return;
      const geometry = getSubjectGeometry();
      if (!geometry) return;
      const toX = (value) => geometry.offsetX + value * geometry.imageWidth * geometry.scale;
      const toY = (value) => geometry.offsetY + value * geometry.imageHeight * geometry.scale;
      const swingDegrees = .34 + config.motion.intensity * .9;
      const swingSpeed = .56 + config.motion.speed * .58;

      if (time - lastHairTextureTime >= .12) {
        lastHairTextureTime = time;
        hairContext.save();
        hairContext.setTransform?.(hairDpr, 0, 0, hairDpr, 0, 0);
        hairContext.clearRect(0, 0, width, height);
        hairContext.globalCompositeOperation = "source-over";
        applySubjectTransform(hairContext, motion, geometry);
        for (const lock of hairLocks) {
          const sway = Math.sin(time * swingSpeed + lock.phase);
          const flutter = Math.sin(time * (swingSpeed * 1.67) + lock.phase * 1.31);
          const angle = sway * swingDegrees * lock.strength * Math.PI / 180;
          const stretch = 1 + flutter * config.motion.intensity * .0022 * lock.strength;
          const anchorX = toX(lock.anchor[0]);
          const anchorY = toY(lock.anchor[1]);
          const xs = lock.points.map(([x]) => x);
          const ys = lock.points.map(([, y]) => y);
          const sourceLeft = Math.max(0, Math.min(...xs) * geometry.imageWidth - 3);
          const sourceTop = Math.max(0, Math.min(...ys) * geometry.imageHeight - 3);
          const sourceRight = Math.min(geometry.imageWidth, Math.max(...xs) * geometry.imageWidth + 3);
          const sourceBottom = Math.min(geometry.imageHeight, Math.max(...ys) * geometry.imageHeight + 3);

          hairContext.save();
          hairContext.globalAlpha = lock.opacity ?? (.82 + config.motion.intensity * .12);
          hairContext.translate(anchorX, anchorY);
          hairContext.rotate(angle);
          hairContext.scale(1, stretch);
          hairContext.translate(-anchorX, -anchorY);
          hairContext.beginPath();
          lock.points.forEach(([x, y], index) => {
            if (index === 0) hairContext.moveTo(toX(x), toY(y));
            else hairContext.lineTo(toX(x), toY(y));
          });
          hairContext.closePath();
          hairContext.clip();
          hairContext.drawImage(
            subjectImage,
            sourceLeft, sourceTop, sourceRight - sourceLeft, sourceBottom - sourceTop,
            geometry.offsetX + sourceLeft * geometry.scale,
            geometry.offsetY + sourceTop * geometry.scale,
            (sourceRight - sourceLeft) * geometry.scale,
            (sourceBottom - sourceTop) * geometry.scale,
          );
          hairContext.restore();
        }
        hairContext.restore();
      }
      context.save();
      context.globalAlpha = .94;
      context.drawImage(hairCanvas, 0, 0, width, height);
      context.restore();
    };

    const drawHairHighlights = (time, motion) => {
      if (!context || !subjectUrl) return;
      const strands = [
        [.615, .14, .57, .29, .47, .55, .43, .78, 0],
        [.59, .18, .52, .34, .42, .63, .39, .88, 1.4],
        [.64, .16, .62, .38, .55, .63, .49, .82, 2.5],
        [.755, .105, .84, .17, .93, .31, .985, .43, .8],
        [.80, .14, .89, .25, .96, .43, .995, .58, 2.1],
        [.825, .21, .90, .38, .94, .58, .985, .72, 3.2],
        [.56, .29, .53, .48, .48, .69, .45, .93, 4.1],
      ];
      const amplitude = (2.2 + config.motion.intensity * 5.2) * Math.min(1, width / 1600);
      const geometry = getSubjectGeometry();
      const mapX = (value) => geometry
        ? geometry.offsetX + value * geometry.imageWidth * geometry.scale : value * width;
      const mapY = (value) => geometry
        ? geometry.offsetY + value * geometry.imageHeight * geometry.scale : value * height;
      context.save();
      if (geometry) applySubjectTransform(context, motion, geometry);
      context.globalCompositeOperation = "screen";
      context.lineCap = "round";
      for (let index = 0; index < strands.length; index += 1) {
        const [sx, sy, c1x, c1y, c2x, c2y, ex, ey, phase] = strands[index];
        const sway = Math.sin(time * (.82 + config.motion.speed * .72) + phase) * amplitude;
        const flutter = Math.sin(time * 1.45 + phase * 1.7) * amplitude * .42;
        context.beginPath();
        context.moveTo(mapX(sx), mapY(sy));
        context.bezierCurveTo(
          mapX(c1x) + sway * .25, mapY(c1y) + flutter,
          mapX(c2x) + sway, mapY(c2y) - flutter * .35,
          mapX(ex) + sway * 1.35, mapY(ey) + flutter,
        );
        context.strokeStyle = index % 2
          ? `rgba(174, 245, 255, ${(.12 + config.motion.intensity * .12).toFixed(3)})`
          : `rgba(220, 187, 255, ${(.10 + config.motion.intensity * .11).toFixed(3)})`;
        context.lineWidth = .65 + (index % 3) * .28;
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.stroke();
      }
      context.restore();
    };

    const drawParticles = (time) => {
      if (!context || !config.motion.particles) return;
      const colors = ["163, 246, 255", "244, 187, 255", "255, 224, 210"];
      context.save();
      context.globalCompositeOperation = "screen";
      for (const particle of particles) {
        const travel = (time * particle.speed * (.022 + config.motion.speed * .035) + particle.phase) % 1;
        const x = particle.x * width + Math.sin(time * particle.drift + particle.phase) * (3 + config.motion.intensity * 8);
        const y = ((particle.y - travel + 1.2) % 1.2) * height;
        const twinkle = .32 + .68 * (.5 + .5 * Math.sin(time * (1.2 + particle.drift) + particle.phase));
        const alpha = (.055 + config.motion.intensity * .18) * twinkle * (particle.x < .45 ? .45 : 1);
        const radius = particle.radius * (.72 + config.motion.intensity * .58);
        context.fillStyle = `rgba(${colors[particle.color]}, ${alpha.toFixed(3)})`;
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        if (particle.kind === "star") {
          drawStar(x, y, radius * 2.2, time * .12 + particle.phase);
        } else if (particle.kind === "diamond") {
          context.save();
          context.translate(x, y);
          context.rotate(Math.PI / 4 + Math.sin(time * .25 + particle.phase) * .2);
          context.fillRect(-radius, -radius, radius * 2, radius * 2);
          context.restore();
        } else {
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.restore();
    };

    const render = (timestamp, scheduleNext = true) => {
      frame = null;
      if (!alive) return;
      if (!reduced && render.lastTimestamp && timestamp - render.lastTimestamp < 48) {
        schedule();
        return;
      }
      render.lastTimestamp = timestamp;
      resize();
      const time = timestamp / 1000;
      pointer.x += (pointer.targetX - pointer.x) * .045;
      pointer.y += (pointer.targetY - pointer.y) * .045;
      const driftSpeed = .12 + config.motion.speed * .22;
      const autoX = Math.sin(time * driftSpeed) * .52 + Math.sin(time * driftSpeed * .37) * .22;
      const autoY = Math.cos(time * driftSpeed * .74) * .46;
      const reach = (7 + config.motion.parallax * 24) * config.motion.intensity;
      const artX = (pointer.x * config.motion.parallax + autoX * .34) * reach;
      const artY = (pointer.y * config.motion.parallax + autoY * .28) * reach;
      const artScale = 1.034 + config.motion.intensity * .012 + Math.sin(time * .22) * .0025;
      artLayer.style.transform = `translate3d(${artX.toFixed(2)}px, ${artY.toFixed(2)}px, 0) scale(${artScale.toFixed(5)})`;

      const breath = Math.sin(time * (.72 + config.motion.speed * .36));
      const subjectX = artX * 1.12 + Math.sin(time * .58) * config.motion.intensity * 1.8;
      const subjectY = artY * 1.08 + breath * config.motion.intensity * 1.7;
      const subjectScale = 1.002 + (breath + 1) * config.motion.intensity * .0014;
      const subjectRotate = Math.sin(time * .46) * config.motion.intensity * .12;
      subjectLayer.style.transform = `translate3d(${subjectX.toFixed(2)}px, ${subjectY.toFixed(2)}px, 0) ` +
        `rotate(${subjectRotate.toFixed(3)}deg) scale(${subjectScale.toFixed(5)})`;
      const subjectMotion = {
        x: subjectX,
        y: subjectY,
        scale: subjectScale,
        rotate: subjectRotate * Math.PI / 180,
      };
      if (context) {
        context.setTransform?.(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);
        drawWaveform(time);
        drawHairTexture(time, subjectMotion);
        drawHairHighlights(time, subjectMotion);
        drawParticles(time);
      }
      if (scheduleNext && !reduced && !(config.motion.pauseWhenHidden && document.hidden)) schedule();
    };

    const schedule = () => {
      if (!alive || reduced || frame !== null || (config.motion.pauseWhenHidden && document.hidden)) return;
      frame = requestFrame(render);
    };
    const cancel = () => {
      if (frame !== null) cancelFrame(frame);
      frame = null;
    };
    const onPointerMove = (event) => {
      pointer.targetX = clamp((Number(event.clientX) / Math.max(1, width) - .5) * 2, -1, 1);
      pointer.targetY = clamp((Number(event.clientY) / Math.max(1, height) - .5) * 2, -1, 1);
    };
    const onPointerLeave = () => { pointer.targetX = 0; pointer.targetY = 0; };
    const onVisibility = () => {
      if (config.motion.pauseWhenHidden && document.hidden) cancel();
      else schedule();
    };
    const onReducedChange = (event) => {
      reduced = Boolean(event.matches);
      document.documentElement?.classList.toggle("dream-motion-reduced", reduced);
      if (reduced) {
        cancel();
        pointer.x = 0; pointer.y = 0; pointer.targetX = 0; pointer.targetY = 0;
        render(now(), false);
      } else schedule();
    };

    window.addEventListener?.("pointermove", onPointerMove, { passive: true });
    window.addEventListener?.("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener?.("resize", resize, { passive: true });
    document.addEventListener?.("visibilitychange", onVisibility);
    reducedQuery.addEventListener?.("change", onReducedChange);
    document.documentElement?.classList.toggle("dream-motion-reduced", reduced);
    resize();
    if (subjectUrl && typeof Image === "function") {
      const image = new Image();
      subjectImage = image;
      image.decoding = "async";
      image.onload = () => {
        if (!alive || subjectImage !== image) return;
        subjectImageReady = Number(image.naturalWidth || image.width) > 0 &&
          Number(image.naturalHeight || image.height) > 0;
        if (reduced) render(now(), false);
        else schedule();
      };
      image.onerror = () => {
        if (subjectImage === image) subjectImageReady = false;
      };
      image.src = subjectUrl;
    }
    if (reduced) render(now(), false);
    else schedule();

    return {
      chrome,
      hairTextureCount: hairLocks.length,
      get hairTextureReady() { return subjectImageReady; },
      destroy() {
        if (!alive) return;
        alive = false;
        cancel();
        window.removeEventListener?.("pointermove", onPointerMove);
        window.removeEventListener?.("pointerleave", onPointerLeave);
        window.removeEventListener?.("resize", resize);
        document.removeEventListener?.("visibilitychange", onVisibility);
        reducedQuery.removeEventListener?.("change", onReducedChange);
        if (subjectImage) {
          subjectImage.onload = null;
          subjectImage.onerror = null;
          subjectImage.src = "";
          subjectImage = null;
          subjectImageReady = false;
        }
        artLayer.remove?.();
        subjectLayer.remove?.();
        canvas.remove?.();
      },
    };
  };

  const stopMotion = () => {
    motionController?.destroy?.();
    motionController = null;
    const state = window[STATE_KEY];
    if (state?.installToken === installToken) state.motion = null;
  };

  const syncMotion = (chrome) => {
    if (!config.motion.enabled) {
      stopMotion();
      return;
    }
    if (motionController?.chrome === chrome) return;
    stopMotion();
    motionController = createMotionController(chrome);
    const state = window[STATE_KEY];
    if (state?.installToken === installToken) state.motion = motionController;
  };

  const clearSkinDom = () => {
    stopMotion();
    const root = document.documentElement;
    root?.classList.remove(...ROOT_CLASSES);
    for (const property of ROOT_PROPERTIES) root?.style.removeProperty(property);
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-task").forEach((node) => node.classList.remove("dream-task"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.querySelectorAll(`.${HOME_UTILITY_CLASS}`).forEach((node) => node.classList.remove(HOME_UTILITY_CLASS));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
  };

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
    const accent = configuredAccent ? config.accent : `rgb(${profile.accent.join(" ")})`;
    const accentInk = accentInkFor(configuredAccent, appearance, profile.accent);
    root.classList.toggle("dream-theme-light", appearance === "light");
    root.classList.toggle("dream-theme-dark", appearance === "dark");
    root.classList.toggle("dream-art-wide", profile.aspect >= 1.75);
    root.classList.toggle("dream-art-standard", profile.aspect < 1.75);
    root.classList.toggle("dream-motion-active", config.motion.enabled);
    root.classList.toggle("dream-motion-calm", config.motion.enabled && config.motion.preset === "calm");
    root.classList.toggle("dream-motion-concert", config.motion.enabled && config.motion.preset === "concert");
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
    root.style.setProperty("--dream-subject", `url("${subjectUrl || artUrl}")`);
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

    const legacyShell = document.querySelector("main.main-surface") &&
      document.querySelector("aside.app-shell-left-panel");
    const modernShell = isCodexEntryPage() && queryFirst("main");
    if (!legacyShell && !modernShell) {
      clearSkinDom();
      return;
    }
    const shellMain = queryFirst("shell") || queryFirst("main");
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
    if (style.dataset.dreamVersion !== "4") {
      style.textContent = cssText;
      style.dataset.dreamVersion = "4";
    }

    const home = queryFirst("home");
    const mainCandidates = queryAll("main");
    if (!mainCandidates.length) mainCandidates.push(shellMain);
    for (const candidate of mainCandidates) {
      candidate.classList.toggle("dream-home", candidate === home);
      candidate.classList.toggle("dream-task", candidate !== home);
    }
    const utilityBars = new Set(home ? queryAll("utility", home) : []);
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
    syncMotion(chrome);
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    clearSkinDom();
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    stopMotion();
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    if (state?.subjectUrl) URL.revokeObjectURL(state.subjectUrl);
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
    ensure, cleanup, observer, timer, scheduler, artUrl, subjectUrl, profile, config,
    motion: motionController, installToken, version: "1.3.1",
  };
  ensure();
  analyzeArt().then((result) => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken || window.__CODEX_DREAM_SKIN_DISABLED__) return;
    profile = result;
    state.profile = result;
    ensure();
  });
  return { installed: true, version: "1.3.1", adaptive: true, motion: config.motion.enabled };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_THEME_JSON__, __DREAM_SELECTORS_JSON__, __DREAM_SUBJECT_JSON__)
