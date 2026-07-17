((themeConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_SCENE_STATE__";
  const SCENE_ATTR = "data-dream-scene";
  const RENDERER_VERSION = 7;
  const THEME = themeConfig && typeof themeConfig === "object" ? themeConfig : {};
  const SCENE = THEME.scene && typeof THEME.scene === "object" ? THEME.scene : null;
  const previous = window[STATE_KEY];
  previous?.cleanup?.();

  const removeScene = () => {
    document.querySelectorAll(`[${SCENE_ATTR}]`).forEach((node) => node.remove());
    document.querySelectorAll([
      ".dream-skin-scene-enhanced",
      ".dream-skin-home-flow",
      ".dream-skin-native-hero-region",
      ".dream-skin-native-composer-region",
      ".dream-skin-native-banner-region",
      ".dream-skin-home",
    ].join(",")).forEach((node) => {
      node.classList.remove(
        "dream-skin-scene-enhanced",
        "dream-skin-home-flow",
        "dream-skin-native-hero-region",
        "dream-skin-native-composer-region",
        "dream-skin-native-banner-region",
        "dream-skin-home",
      );
      delete node.dataset.dreamSceneSignature;
    });
  };

  if (!SCENE || !Array.isArray(SCENE.actions)) {
    removeScene();
    delete window[STATE_KEY];
    return { installed: false, reason: "theme-without-scene" };
  }

  const signature = `${RENDERER_VERSION}:${JSON.stringify(SCENE)}`;
  const applySceneTokens = () => {
    const root = document.documentElement;
    if (!root) return;
    const shell = root.classList.contains("dream-theme-light") || root.getAttribute("data-dream-shell") === "light"
      ? "light" : "dark";
    const palette = THEME.palettes?.[shell] || THEME.palettes?.dark || THEME.colors || {};
    const variables = {
      "--ds-bg": palette.background,
      "--ds-panel": palette.panel,
      "--ds-panel-2": palette.panelAlt,
      "--ds-green": palette.accent,
      "--ds-lime": palette.accentAlt,
      "--ds-cyan": palette.secondary,
      "--ds-purple": palette.highlight,
      "--ds-text": palette.text,
      "--ds-muted": palette.muted,
      "--ds-line": palette.line,
      "--ds-scene-card-text": palette[SCENE.chrome?.cardText] || palette.text,
      "--ds-scene-icon": palette[SCENE.chrome?.iconColor] || palette.background,
      "--ds-scene-icon-surface": palette[SCENE.chrome?.iconSurface] || palette.accent,
    };
    for (const [name, value] of Object.entries(variables)) {
      if (typeof value === "string" && value) root.style.setProperty(name, value);
    }
    const appearance = THEME.sceneAppearance && typeof THEME.sceneAppearance === "object"
      ? THEME.sceneAppearance
      : THEME.appearance && typeof THEME.appearance === "object" ? THEME.appearance : {};
    const background = appearance.background || {};
    const surface = appearance.surface || {};
    root.style.setProperty("--dream-overlay-opacity", String((Number(background.overlay) || 24) / 100));
    root.style.setProperty("--dream-panel-blur", `${Number(surface.blur) || 18}px`);
    root.style.setProperty("--dream-radius", `${Number(surface.radius) || 16}px`);
    root.style.setProperty("--dream-shadow-opacity", String((Number(surface.shadow) || 34) / 100));
    root.style.setProperty("--dream-art-position", `${Number(background.focusX) || 50}% ${Number(background.focusY) || 50}%`);
    root.style.setProperty("--dream-art-size", `${Math.max(100, Number(background.zoom) || 100)}% auto`);
  };
  const icons = Object.freeze({
    spark: "M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z",
    code: "m8 9-3 3 3 3 M16 9l3 3-3 3 M14 5l-4 14",
    build: "M12 5v14 M5 12h14",
    review: "m5 12 4 4L19 6",
    repair: "M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-3 3-3-3 3-3Z",
    plan: "M8 6h11 M8 12h11 M8 18h11 M4 6h.01 M4 12h.01 M4 18h.01",
    chart: "M4 19V5 M4 19h16 M8 15l4-4 3 3 5-7",
    pen: "m4 20 4-1 10-10-3-3L5 16l-1 4Z M13 8l3 3",
    ship: "M12 19V5 M7 10l5-5 5 5 M5 19h14",
    research: "m21 21-4.3-4.3 M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z",
    monitor: "M4 5h16v11H4z M8 20h8 M12 16v4",
    cloud: "M7 18h11a4 4 0 0 0 .6-8A7 7 0 0 0 5.2 8.5 4.5 4.5 0 0 0 7 18Z",
    mountain: "m3 19 6-11 4 7 2-3 6 7H3Z M9 8l2 4",
    sword: "m14.5 5.5 4-2-2 4-8 8-3-3 8-8Z M5 15l4 4 M3 21l3-3",
    gear: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M4 12h2 M18 12h2 M12 4v2 M12 18v2 M6.3 6.3l1.4 1.4 M16.3 16.3l1.4 1.4 M17.7 6.3l-1.4 1.4 M7.7 16.3l-1.4 1.4",
    mecha: "M8 4h8l3 5-2 10H7L5 9l3-5Z M9 10h6 M10 15h4",
    pet: "M8 14c-3-2-4 3-1 5 2 2 8 2 10 0 3-2 2-7-1-5-2-4-6-4-8 0Z M6 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M18 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    moon: "M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z",
    flame: "M12 22c5 0 8-3 8-8 0-4-2-7-6-11 0 4-2 6-4 7 0-2-1-3-2-4-1 4-4 6-4 10 0 3 3 6 8 6Z M9 18c0-2 1-3 3-5 0 2 2 3 2 5",
    signal: "M5 12a7 7 0 0 1 14 0 M8 15a4 4 0 0 1 8 0 M12 19h.01",
    wand: "m15 4 5 5L9 20l-5-5L15 4Z M6 4v4 M4 6h4 M19 15v4 M17 17h4",
    compass: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M15 9l-2 4-4 2 2-4 4-2Z",
    coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M9 9c0-1 1-2 3-2s3 1 3 2-1 2-3 2-3 1-3 2 1 2 3 2 3-1 3-2 M12 5v14",
    palette: "M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3-4-6-9-6Z M7 10h.01 M9 6h.01 M14 6h.01 M17 9h.01",
  });

  const iconNode = (name, className = "dream-skin-scene-icon") => {
    const icon = document.createElement("span");
    icon.className = className;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", icons[name] || icons.spark);
    svg.appendChild(path);
    icon.appendChild(svg);
    return icon;
  };

  const sceneElement = (className, icon) => {
    const node = document.createElement("div");
    node.className = className;
    node.setAttribute(SCENE_ATTR, "true");
    if (icon) node.appendChild(iconNode(icon));
    return node;
  };
  const textNode = (tag, className, value) => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = String(value || "");
    return node;
  };
  const closestDirectChild = (ancestor, node) => {
    let current = node;
    while (current?.parentElement && current.parentElement !== ancestor) current = current.parentElement;
    return current?.parentElement === ancestor ? current : null;
  };
  const findHome = () => [...document.querySelectorAll('[role="main"]')].find((candidate) =>
    candidate.querySelector('[data-feature="game-source"]') &&
    candidate.querySelector(".composer-surface-chrome")) ||
    document.querySelector('[data-testid="home-icon"]')?.closest('[role="main"]') || null;

  const focusComposer = (home, prompt) => {
    const editor = home.querySelector('.composer-surface-chrome [contenteditable="true"]') ||
      home.querySelector(".composer-surface-chrome textarea");
    if (!editor) return false;
    editor.focus();
    if ((editor.textContent || editor.value || "").trim()) return true;
    if (editor instanceof HTMLTextAreaElement) {
      editor.value = prompt;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    try { document.execCommand("insertText", false, prompt); }
    catch {
      editor.textContent = prompt;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
    }
    return true;
  };

  const openProjectSelector = (home) => {
    const selector = home.querySelector('.group\\/project-selector > button') ||
      document.querySelector('.group\\/project-selector > button') ||
      [...home.querySelectorAll("button")].find((button) =>
        /选择项目|select project/i.test(`${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`));
    if (!selector) return false;
    selector.click();
    return true;
  };

  const openNativeComposerMenu = (home, sectionLabel, activate = false) => {
    const trigger = home.querySelector('[data-composer-navigation-target="add-context"]') ||
      document.querySelector('[data-composer-navigation-target="add-context"]');
    if (!trigger) return false;
    const focusSection = (attempt = 0) => {
      const nativeMenu = home.querySelector(".composer-home-top-menu") || document.querySelector(".composer-home-top-menu");
      if (!nativeMenu) {
        if (attempt < 10) setTimeout(() => focusSection(attempt + 1), 40);
        return;
      }
      const heading = [...nativeMenu.querySelectorAll("div")].find((node) =>
        node.children.length === 0 && (node.textContent || "").trim() === sectionLabel);
      const labeledButton = [...nativeMenu.querySelectorAll("button")].find((node) =>
        (node.innerText || node.textContent || "").trim().split("\n")[0] === sectionLabel);
      const target = heading?.closest("button") || heading?.parentElement?.querySelector("button") || labeledButton;
      if (!target && attempt < 10) return setTimeout(() => focusSection(attempt + 1), 40);
      if (activate) target?.click();
      else {
        const scroller = nativeMenu.querySelector(".vertical-scroll-fade-mask");
        if (scroller && heading) scroller.scrollTop = Math.max(0, heading.offsetTop - scroller.offsetTop);
      }
    };
    setTimeout(() => {
      const nativeMenu = document.querySelector(".composer-home-top-menu");
      const visible = nativeMenu && nativeMenu.getBoundingClientRect().height > 0;
      if (!visible && trigger.getAttribute("data-state") === "open") {
        trigger.click();
        setTimeout(() => trigger.click(), 35);
      } else if (!visible) trigger.click();
      setTimeout(focusSection, 40);
    }, 80);
    return true;
  };

  const runAction = (home, action, command) => {
    if (command === "project" && openNativeComposerMenu(home, "项目", true)) return;
    if (command === "project" && openProjectSelector(home)) return;
    if (command === "context" && openNativeComposerMenu(home, "添加")) return;
    if (command === "tools" && openNativeComposerMenu(home, "插件")) return;
    if (command === "skills" && openNativeComposerMenu(home, "智能体")) return;
    focusComposer(home, `请帮我${action.title}：`);
  };

  const render = (home) => {
    if (!home) return removeScene();
    if (home.dataset.dreamSceneSignature === signature && home.querySelector(`[${SCENE_ATTR}]`)) return;
    removeScene();
    home.dataset.dreamSceneSignature = signature;
    home.classList.add("dream-skin-home", "dream-skin-scene-enhanced");
    const gameSource = home.querySelector('[data-feature="game-source"]');
    const composerSurface = home.querySelector(".composer-surface-chrome");
    const homeFlow = closestDirectChild(home, gameSource) || home.firstElementChild;
    const nativeHero = closestDirectChild(homeFlow, gameSource);
    const nativeComposer = closestDirectChild(homeFlow, composerSurface);
    if (!homeFlow || !nativeComposer) return;
    homeFlow.classList.add("dream-skin-home-flow");
    nativeHero?.classList.add("dream-skin-native-hero-region");
    nativeComposer.classList.add("dream-skin-native-composer-region");
    [...nativeComposer.children].find((node) => node.querySelector?.(".home-banners"))
      ?.classList.add("dream-skin-native-banner-region");

    const shell = sceneElement("dream-skin-scene-shell");
    const heroSurface = sceneElement("dream-skin-scene-hero-surface");
    const identity = sceneElement("dream-skin-scene-identity", SCENE.identity?.icon);
    identity.appendChild(textNode("b", "", SCENE.identity?.shortName || THEME.name));
    const hero = sceneElement("dream-skin-scene-hero");
    hero.append(
      textNode("span", "dream-skin-scene-eyebrow", SCENE.hero?.eyebrow || THEME.brandSubtitle),
      textNode("strong", "", SCENE.hero?.title || "我们该构建什么？"),
      textNode("small", "", SCENE.hero?.description || THEME.tagline),
    );
    const tags = document.createElement("div");
    tags.className = "dream-skin-scene-tags";
    for (const tag of SCENE.hero?.tags || []) tags.appendChild(textNode("i", "", tag));
    hero.appendChild(tags);
    heroSurface.append(identity, hero);

    const actions = sceneElement("dream-skin-scene-actions");
    actions.setAttribute("aria-label", "场景快捷操作");
    const menuItems = [
      ["start", "build", "开始此任务", "把方向带入输入框"],
      ["context", "research", "梳理上下文", "先明确范围与依赖"],
      ["tools", "gear", "使用工具", "打开 Codex 原生插件"],
      ["skills", "spark", "查看技能", "打开 Codex 原生智能体"],
      ["project", "compass", "选择项目", "切换当前工作目录"],
    ];
    SCENE.actions.slice(0, 4).forEach((action, index) => {
      const slot = sceneElement("dream-skin-scene-action-slot");
      slot.dataset.tone = action.tone || "accent";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dream-skin-scene-action-button";
      button.setAttribute(SCENE_ATTR, "true");
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", `${action.title}，打开快捷操作`);
      const card = sceneElement("dream-skin-scene-action", action.icon);
      const copy = document.createElement("span");
      copy.replaceChildren(textNode("b", "", action.title), textNode("small", "", action.detail));
      card.append(copy, textNode("i", "dream-skin-scene-badge", action.badge));
      button.appendChild(card);
      const menu = sceneElement("dream-skin-scene-menu");
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", `${action.title}快捷操作`);
      menu.hidden = true;
      for (const [command, icon, label, detail] of menuItems) {
        const item = document.createElement("button");
        item.type = "button";
        item.setAttribute("role", "menuitem");
        item.dataset.command = command;
        const menuCopy = document.createElement("span");
        menuCopy.append(textNode("b", "", label), textNode("small", "", detail));
        item.append(iconNode(icon, "dream-skin-scene-menu-icon"), menuCopy);
        const activate = (event) => {
          event.preventDefault();
          event.stopPropagation();
          runAction(home, action, command);
          menu.hidden = true;
          button.setAttribute("aria-expanded", "false");
        };
        let mouseActivated = false;
        item.addEventListener("mousedown", (event) => {
          mouseActivated = true;
          activate(event);
          setTimeout(() => { mouseActivated = false; }, 250);
        });
        item.addEventListener("click", (event) => {
          if (mouseActivated) {
            mouseActivated = false;
            event.preventDefault();
            event.stopPropagation();
          } else activate(event);
        });
        menu.appendChild(item);
      }
      button.addEventListener("click", () => {
        const willOpen = menu.hidden;
        actions.querySelectorAll(".dream-skin-scene-menu").forEach((node) => { node.hidden = true; });
        actions.querySelectorAll('[aria-expanded="true"]').forEach((node) => node.setAttribute("aria-expanded", "false"));
        menu.hidden = !willOpen;
        button.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) menu.querySelector("button")?.focus();
      });
      menu.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.focus();
      });
      slot.append(button, menu);
      actions.appendChild(slot);
      if (index === 0) slot.dataset.primary = "true";
    });
    shell.append(heroSurface, actions);
    homeFlow.insertBefore(shell, nativeComposer);

    const companion = sceneElement("dream-skin-scene-companion", SCENE.identity?.icon);
    const companionCopy = document.createElement("span");
    companionCopy.append(
      textNode("b", "", SCENE.identity?.shortName || THEME.name),
      textNode("small", "", SCENE.hero?.eyebrow || THEME.brandSubtitle),
    );
    companion.appendChild(companionCopy);
    nativeComposer.appendChild(companion);
  };

  let scheduled = false;
  const ensure = () => {
    scheduled = false;
    applySceneTokens();
    render(findHome());
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(ensure, 120);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(ensure, 4000);
  const cleanup = () => {
    observer.disconnect();
    clearInterval(timer);
    removeScene();
    if (window[STATE_KEY]?.cleanup === cleanup) delete window[STATE_KEY];
    return true;
  };
  window[STATE_KEY] = { cleanup, ensure, observer, timer, version: RENDERER_VERSION, themeId: THEME.id || "custom" };
  ensure();
  return { installed: true, version: RENDERER_VERSION, themeId: THEME.id || "custom" };
})(__DREAM_SKIN_THEME_JSON__)
