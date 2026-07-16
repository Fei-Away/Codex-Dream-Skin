((cssText, themeConfig, artDataUrl) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const VERSION = "1.1.0";
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const defaults = {
    name: "Codex Dream Skin",
    brandSubtitle: "CODEX DREAM SKIN",
    tagline: "与灵感一起，把每天写成作品 ♡",
    projectPrefix: "选择项目 · ",
    projectLabel: "♡  选择项目",
    quote: "Make something wonderful",
    signature: "Dream Skin ♡",
    colors: {
      background: "#fff3f9",
      panel: "#ffffff",
      panelAlt: "#fff7fb",
      accent: "#b65cff",
      accentAlt: "#cf61f0",
      secondary: "#ff73bd",
      highlight: "#8b3dce",
      text: "#4c2364",
      muted: "#9e58bd",
      line: "rgba(221, 122, 184, .42)",
    },
  };
  const theme = {
    ...defaults,
    ...(themeConfig || {}),
    colors: { ...defaults.colors, ...((themeConfig || {}).colors || {}) },
  };

  const text = (value, fallback, max = 120) => {
    const next = typeof value === "string" && value.trim() ? value : fallback;
    return next.length > max ? next.slice(0, max) : next;
  };
  const cssString = (value, fallback) => JSON.stringify(text(value, fallback, 160));

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);

  const comma = artDataUrl.indexOf(",");
  const binary = atob(artDataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const mime = artDataUrl.slice(5, comma).split(";")[0] || "image/png";
  const artUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));

  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamVersion = VERSION;
  }

  const themeVars = [
    ["--dream-ink", theme.colors.text],
    ["--dream-purple", theme.colors.accent],
    ["--dream-violet", theme.colors.highlight],
    ["--dream-pink", theme.colors.secondary],
    ["--dream-blush", theme.colors.background],
    ["--dream-pearl", theme.colors.panel],
    ["--dream-line", theme.colors.line],
    ["--dream-panel-alt", theme.colors.panelAlt],
    ["--dream-accent-alt", theme.colors.accentAlt],
    ["--dream-muted", theme.colors.muted],
    ["--dream-tagline-content", cssString(theme.tagline, defaults.tagline)],
    ["--dream-project-prefix-content", cssString(theme.projectPrefix, defaults.projectPrefix)],
    ["--dream-project-label-content", cssString(theme.projectLabel, defaults.projectLabel)],
  ];

  const applyThemeVars = (root) => {
    for (const [name, value] of themeVars) root.style.setProperty(name, value);
  };

  const removeThemeVars = (root) => {
    for (const [name] of themeVars) root.style.removeProperty(name);
  };

  const setChromeText = (chrome) => {
    chrome.querySelector(".dream-brand b").textContent = text(theme.name, defaults.name, 80);
    chrome.querySelector(".dream-brand small").textContent = text(theme.brandSubtitle, defaults.brandSubtitle, 80);
    chrome.querySelector(".dream-signature").textContent = text(theme.signature, defaults.signature, 80);
    chrome.querySelector(".dream-ribbon strong").textContent = text(theme.quote, defaults.quote, 100);
  };

  const ensure = () => {
    if (window.__CODEX_DREAM_SKIN_DISABLED__) return;
    const root = document.documentElement;
    if (!root) return;
    root.classList.add("codex-dream-skin");
    root.style.setProperty("--dream-art", `url("${artUrl}")`);
    applyThemeVars(root);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== VERSION) {
      style.textContent = cssText;
      style.dataset.dreamVersion = VERSION;
    }

    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    for (const candidate of document.querySelectorAll('[role="main"].dream-home')) {
      if (candidate !== home) candidate.classList.remove("dream-home");
    }
    if (home) home.classList.add("dream-home");

    if (!shellMain || !document.body) return;
    shellMain.classList.toggle("dream-home-shell", Boolean(home));
    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML = `
        <div class="dream-brand"><span class="dream-note">♫</span><span><b></b><small></small></span></div>
        <div class="dream-signature"></div>
        <div class="dream-sparkles"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="dream-ribbon"><span>♡</span><strong></strong><span>✦</span></div>
        <div class="dream-polaroid"></div>`;
      document.body.appendChild(chrome);
    }
    setChromeText(chrome);
    const shellBox = shellMain.getBoundingClientRect();
    chrome.style.left = `${Math.round(shellBox.left)}px`;
    chrome.style.top = `${Math.round(shellBox.top)}px`;
    chrome.style.width = `${Math.round(shellBox.width)}px`;
    chrome.style.height = `${Math.round(shellBox.height)}px`;
    chrome.classList.toggle("dream-home-shell", Boolean(home));
  };

  const cleanup = () => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    document.documentElement?.classList.remove("codex-dream-skin");
    document.documentElement?.style.removeProperty("--dream-art");
    if (document.documentElement) removeThemeVars(document.documentElement);
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    const state = window[STATE_KEY];
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
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
  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    timer,
    scheduler,
    artUrl,
    version: VERSION,
    themeName: text(theme.name, defaults.name, 80),
  };
  ensure();
  return { installed: true, version: VERSION, themeName: window[STATE_KEY].themeName };
})(__DREAM_CSS_JSON__, __DREAM_THEME_JSON__, __DREAM_ART_JSON__)
