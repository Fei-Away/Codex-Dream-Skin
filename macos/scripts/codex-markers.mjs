export const CODEX_DOM_SELECTORS = Object.freeze({
  shell: Object.freeze([
    "main.main-surface",
    'main[role="main"]',
    '[data-testid="app-shell-main"]',
  ]),
  sidebar: Object.freeze([
    "aside.app-shell-left-panel",
    '[data-testid="app-shell-left-panel"]',
    'aside[class*="app-shell-left"]',
  ]),
  composer: Object.freeze([
    ".composer-surface-chrome",
    '[data-testid="composer"]',
    '[data-testid="composer-container"]',
    '[role="textbox"][contenteditable="true"]',
  ]),
  main: Object.freeze([
    '[role="main"]',
    'main[role="main"]',
    "main.main-surface",
  ]),
  homeSignal: Object.freeze([
    '[data-testid="home-icon"]',
    '[data-feature="game-source"]',
    ".group\\/home-suggestions",
  ]),
  home: Object.freeze([
    '[role="main"].dream-skin-home',
    "main.dream-skin-home",
  ]),
  suggestions: Object.freeze([
    ".group\\/home-suggestions",
    '[data-testid="home-suggestions"]',
  ]),
  projectButton: Object.freeze([
    ".group\\/project-selector > button",
    '[data-testid="project-selector"] button',
    'button[data-testid="project-selector"]',
  ]),
});

export const CODEX_PROBE_MARKERS = Object.freeze(["shell", "sidebar", "composer", "main"]);

export function inspectCodexMarkers(querySelector, selectorGroups) {
  if (typeof querySelector !== "function") throw new TypeError("querySelector must be a function");
  const nodes = {};
  const matches = {};
  for (const [name, selectors] of Object.entries(selectorGroups)) {
    nodes[name] = null;
    matches[name] = null;
    for (const selector of selectors) {
      try {
        const node = querySelector(selector);
        if (!node) continue;
        nodes[name] = node;
        matches[name] = selector;
        break;
      } catch {
        // A stale or malformed fallback must not abort the remaining probes.
      }
    }
  }
  const markers = Object.fromEntries(Object.entries(nodes).map(([name, node]) => [name, Boolean(node)]));
  const missing = Object.entries(markers).filter(([, present]) => !present).map(([name]) => name);
  return { nodes, markers, matches, missing };
}

export function isCodexMarkerSet(markers) {
  return Boolean(markers?.shell && markers?.sidebar);
}

export function buildCodexMarkerInspectionSource(variableName = "markerInspection") {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(variableName)) throw new Error("Invalid marker variable name");
  return `const ${variableName} = (${inspectCodexMarkers.toString()})((selector) => document.querySelector(selector), ${JSON.stringify(CODEX_DOM_SELECTORS)});`;
}
