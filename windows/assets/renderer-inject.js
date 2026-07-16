((cssText, artDataUrl, manifest, requestedTone) => {
  const STATE_KEY = "__CODEX_MIKU_SKIN_STATE__";
  const STYLE_ID = "codex-miku-skin-style";
  const CHROME_ID = "codex-miku-skin-chrome";
  const ROOT_CLASS = "codex-miku-skin";
  const tone = requestedTone === "light" ? "light" : "dark";
  const version = String(manifest?.version || "0.0.0");
  window.__CODEX_MIKU_SKIN_DISABLED__ = false;

  const legacy = window.__CODEX_DREAM_SKIN_STATE__;
  if (legacy?.cleanup) {
    try { legacy.cleanup(); } catch {}
  }
  document.documentElement?.classList.remove("codex-dream-skin");
  document.getElementById("codex-dream-skin-style")?.remove();
  document.getElementById("codex-dream-skin-chrome")?.remove();

  const previous = window[STATE_KEY];
  previous?.observer?.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);

  const fingerprintArt = (input) => {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return input.length + ":" + (hash >>> 0).toString(16).padStart(8, "0");
  };
  const artFingerprint = fingerprintArt(artDataUrl);
  const reuseArtUrl = Boolean(
    previous?.artUrl && previous?.artFingerprint === artFingerprint
  );
  const artUrl = reuseArtUrl ? previous.artUrl : (() => {
    const comma = artDataUrl.indexOf(",");
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  })();
  if (previous?.artUrl && !reuseArtUrl) {
    URL.revokeObjectURL(previous.artUrl);
  }

  const MARKER_CLASSES = [
    "miku-shell-sidebar",
    "miku-shell-separator",
    "miku-task-surface",
    "miku-composer",
    "miku-home",
    "miku-change-summary",
    "miku-diff-surface",
    "miku-settings-shell",
    "miku-settings-section",
    "miku-settings-card",
    "miku-plugins-page",
    "miku-plugin-surface",
    "miku-scheduled-page",
    "miku-scheduled-surface",
    "miku-dialog",
    "miku-quick-chat",
    "miku-quick-chat-composer",
    "miku-popover",
    "miku-neutral-separator",
    "miku-separator",
    "miku-split-launcher",
    "miku-terminal",
    "miku-output-host",
    "miku-output-panel",
    "miku-output-row",
    "miku-profile-page",
    "miku-profile-heatmap",
    "miku-appearance-page",
    "miku-pets-page",
    "miku-pet-surface",
    "miku-theme-preview",
    "miku-state-control"
  ];

  const createMarkerRegistry = () => {
    const registry = new Map();
    const register = (node, className, componentId) => {
      if (!(node instanceof Element)) return;
      let entry = registry.get(node);
      if (!entry) {
        entry = { classes: new Set(), componentIds: new Set() };
        registry.set(node, entry);
      }
      if (className) entry.classes.add(className);
      if (componentId) entry.componentIds.add(componentId);
    };
    const registerAll = (selector, className, componentId, limit = 64, root = document) => {
      let count = 0;
      for (const node of root.querySelectorAll(selector)) {
        if (count >= limit) break;
        register(node, className, componentId);
        count += 1;
      }
    };
    return { registry, register, registerAll };
  };

  const reconcileMarkers = (registry) => {
    for (const node of document.querySelectorAll(".miku-surface-marker, [data-miku-component]")) {
      node.classList.remove("miku-surface-marker", ...MARKER_CLASSES);
      node.removeAttribute("data-miku-component");
    }
    for (const [node, entry] of registry) {
      if (!node.isConnected) continue;
      node.classList.add("miku-surface-marker", ...entry.classes);
      if (entry.componentIds.size > 0) {
        node.dataset.mikuComponent = [...entry.componentIds].sort().join(" ");
      }
    }
  };

  const ensure = () => {
    if (window.__CODEX_MIKU_SKIN_DISABLED__) return;
    const root = document.documentElement;
    if (!root) return;

    root.classList.add(ROOT_CLASS);
    root.dataset.mikuTone = tone;
    root.style.setProperty("--miku-art", 'url("' + artUrl + '")');

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.mikuVersion !== version || style.textContent !== cssText) {
      style.textContent = cssText;
      style.dataset.mikuVersion = version;
    }

    const shellMain = document.querySelector("main.main-surface") || document.querySelector("main");
    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    const composer = shellMain?.querySelector(".composer-surface-chrome") || null;
    const sidebar = document.querySelector("aside.app-shell-left-panel") || document.querySelector("body > aside");
    const settingsSearch = sidebar?.querySelector('[role="searchbox"], input[type="search"]') || null;
    const profileSignature = shellMain?.querySelector(
      '[role="img"][class*="--profile-usage-level"]'
    ) || null;
    const appearanceSignature = shellMain?.querySelector('input[name="appearance-theme"]') || null;
    const petsSignature = shellMain?.querySelector('#pet-size, [data-testid*="pet" i]') || null;
    const pluginSignature = shellMain?.querySelector("#plugins-page-search") || null;
    const scheduledSignature = shellMain?.querySelector("#scheduled-page-search") || null;
    const quickChatDialog = document.querySelector(
      '[role="dialog"][data-pip-obstacle="quick-chat"]'
    );
    const outputHost = document.querySelector('[data-pip-obstacle="thread-summary-panel"]');
    const changeHeader = document.querySelector('[class~="group/turn-diff-header"]');
    const { registry, register, registerAll } = createMarkerRegistry();

    if (shellMain) {
      shellMain.dataset.mikuView = home
        ? "home"
        : composer
          ? "task"
          : "utility";
    }

    register(sidebar, "miku-shell-sidebar", "01");
    if (sidebar) {
      for (const separator of sidebar.querySelectorAll('[role="separator"]')) {
        register(separator, "miku-shell-separator", "01");
      }
    }

    if (composer) {
      register(composer, "miku-composer", "02");
      if (shellMain && !home) register(shellMain, "miku-task-surface", "02");
    }
    register(home, "miku-home", "03");

    if (changeHeader) {
      const changeSummary = changeHeader.parentElement || changeHeader;
      register(changeSummary, "miku-change-summary", "04");
    }
    const exactDiffPanel = document.querySelector(
      '[role="tabpanel"][data-app-shell-tab-panel-controller="right"][data-tab-id="diff"]'
    );
    register(exactDiffPanel, "miku-diff-surface", "04");

    if (settingsSearch && shellMain) {
      register(shellMain, "miku-settings-shell", "05");
      registerAll(
        'section, fieldset, [data-testid*="settings-card" i]',
        "miku-settings-section",
        "05",
        48,
        shellMain
      );
      registerAll(
        'section > .overflow-hidden.rounded-2xl.border, section > div > .overflow-hidden.rounded-2xl.border, fieldset > .overflow-hidden.rounded-2xl.border',
        "miku-settings-card",
        "05",
        48,
        shellMain
      );
    }

    const pluginNodes = pluginSignature && shellMain
      ? [...shellMain.querySelectorAll(
          '[role="button"][class~="rounded-2xl"][class~="border-token-border/40"]'
        )]
      : [];
    if (pluginSignature && shellMain) register(shellMain, "miku-plugins-page", "06");
    for (const node of pluginNodes.slice(0, 64)) register(node, "miku-plugin-surface", "06");

    const scheduledNodes = scheduledSignature && shellMain
      ? [...shellMain.querySelectorAll('[role="listitem"]')]
      : [];
    if (scheduledSignature && shellMain) register(shellMain, "miku-scheduled-page", "07");
    for (const node of scheduledNodes.slice(0, 64)) register(node, "miku-scheduled-surface", "07");

    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      const isQuickChat = dialog === quickChatDialog;
      register(dialog, isQuickChat ? "miku-quick-chat" : "miku-dialog", isQuickChat ? "08" : null);
      if (isQuickChat) {
        register(
          dialog.querySelector(".composer-surface-chrome"),
          "miku-quick-chat-composer",
          "08"
        );
      }
    }
    registerAll('[role="menu"], [data-radix-popper-content-wrapper]', "miku-popover", "09", 24);

    const terminals = [...document.querySelectorAll('.xterm, [data-testid*="terminal" i]')];
    for (const terminal of terminals.slice(0, 12)) register(terminal, "miku-terminal", "10");
    registerAll(
      '[data-testid*="launcher" i], [data-testid*="split" i]',
      "miku-split-launcher",
      "10",
      24
    );
    for (const separator of document.querySelectorAll('[role="separator"]')) {
      if (sidebar?.contains(separator)) continue;
      const terminalRegion = separator.parentElement?.querySelector(
        '.xterm, [data-testid*="terminal" i]'
      );
      register(
        separator,
        terminalRegion ? "miku-separator" : "miku-neutral-separator",
        terminalRegion ? "10" : null
      );
    }

    if (outputHost) {
      register(outputHost, "miku-output-host", "11");
      const outputPanel = outputHost.querySelector(
        '[class~="rounded-3xl"][class~="bg-token-dropdown-background"]'
      ) || outputHost.firstElementChild;
      register(outputPanel, "miku-output-panel", "11");
      for (const row of outputHost.querySelectorAll('[class~="group/summary-panel-item"]')) {
        register(row, "miku-output-row", "11");
      }
    }

    if (profileSignature && shellMain) {
      register(shellMain, "miku-profile-page", "12");
      for (const heatmapNode of shellMain.querySelectorAll(
        '[role="img"][class*="--profile-usage-level"]'
      )) {
        register(heatmapNode, "miku-profile-heatmap", "12");
      }
    }

    if (appearanceSignature && shellMain) {
      register(shellMain, "miku-appearance-page", "13");
      registerAll('[data-testid="theme-preview"]', "miku-theme-preview", "13", 12, shellMain);
    }
    if (petsSignature && shellMain) {
      register(shellMain, "miku-pets-page", "13");
      for (const avatar of shellMain.querySelectorAll('[data-testid="codex-avatar"]')) {
        register(
          avatar.closest('button, [role="button"]') || avatar.parentElement,
          "miku-pet-surface",
          "13"
        );
      }
    }

    registerAll('[role="switch"], [role="tab"], [role="checkbox"]', "miku-state-control", "14", 96);
    reconcileMarkers(registry);

    if (!shellMain || !document.body) return;
    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      chrome.innerHTML =
        '<div class="miku-stage-hero"></div>' +
        '<div class="miku-stage-wordmark"><b>MIKU STAGE</b><small>FUTURE SOUND / CODE MODE</small></div>' +
        '<div class="miku-stage-index">01</div>' +
        '<div class="miku-stage-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>';
      document.body.appendChild(chrome);
    }
    const shellBox = shellMain.getBoundingClientRect();
    chrome.style.left = Math.round(shellBox.left) + "px";
    chrome.style.top = Math.round(shellBox.top) + "px";
    chrome.style.width = Math.round(shellBox.width) + "px";
    chrome.style.height = Math.round(shellBox.height) + "px";
    chrome.classList.toggle("miku-home-shell", Boolean(home));
    chrome.dataset.mikuView = shellMain.dataset.mikuView || "utility";
    const routeIndex = quickChatDialog
      ? "08"
      : profileSignature
      ? "12"
      : appearanceSignature || petsSignature
        ? "13"
        : settingsSearch
          ? "05"
          : pluginSignature
            ? "06"
            : scheduledSignature
              ? "07"
          : home
            ? "03"
            : composer
              ? "02"
              : "UI";
    const indexNode = chrome.querySelector(".miku-stage-index");
    if (indexNode) indexNode.textContent = routeIndex;
  };

  const cleanup = () => {
    window.__CODEX_MIKU_SKIN_DISABLED__ = true;
    const root = document.documentElement;
    root?.classList.remove(ROOT_CLASS);
    root?.removeAttribute("data-miku-tone");
    root?.style.removeProperty("--miku-art");
    document.querySelectorAll(".miku-surface-marker, [data-miku-component]").forEach((node) => {
      node.classList.remove("miku-surface-marker", ...MARKER_CLASSES);
      node.removeAttribute("data-miku-component");
    });
    document.querySelectorAll("[data-miku-view]").forEach((node) => node.removeAttribute("data-miku-view"));
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
    artFingerprint,
    manifest,
    tone,
    version
  };
  ensure();
  return {
    installed: true,
    version,
    tone,
    componentCount: Array.isArray(manifest?.components) ? manifest.components.length : 0,
    matchedComponentIds: [...new Set(
      [...document.querySelectorAll("[data-miku-component]")]
        .flatMap((node) => (node.dataset.mikuComponent || "").split(" "))
        .filter(Boolean)
    )].sort()
  };
})(__MIKU_CSS_JSON__, __MIKU_ART_JSON__, __MIKU_MANIFEST_JSON__, __MIKU_TONE_JSON__)
