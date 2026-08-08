import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { SKIN_VERSION, verifySession } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const startPath = path.resolve(here, "../scripts/start-dream-skin.ps1");

const selectors = {
  shell: 'main:is(.main-surface, [data-app-shell-main-surface], [class*="_MainContentSurface_"])',
  sidebar: "aside.app-shell-left-panel",
  composer: ".composer-surface-chrome",
  homeIcon: '[data-testid="home-icon"]',
  home: '[role="main"]:has([data-testid="home-icon"])',
  gameSource: '[data-feature="game-source"]',
  suggestions: ".group\\/home-suggestions",
  settings: 'input[name="appearance-theme"]',
  themePreview: '[data-testid="theme-preview"]',
};

function makeRect(width = 800, height = 600, x = 0, y = 0) {
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function makeElement({
  rect = makeRect(),
  style = {},
  visible = true,
  text = "",
  children = [],
} = {}) {
  const element = {
    isConnected: true,
    textContent: text,
    _style: {
      display: "block",
      visibility: "visible",
      contentVisibility: "visible",
      opacity: "1",
      color: "rgb(240, 240, 240)",
      ...style,
    },
    childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
    children,
    getBoundingClientRect: () => rect,
    checkVisibility: () => visible,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return element;
}

function makeSuggestionButton({
  rect = makeRect(220, 80, 40, 300),
  color = "rgb(210, 210, 210)",
  labelColor = color,
  text = "Suggestion",
} = {}) {
  const label = makeElement({
    rect: makeRect(180, 24, rect.x + 12, rect.y + 12),
    style: { color: labelColor },
    text,
  });
  return {
    ...makeElement({ rect, style: { color } }),
    getBoundingClientRect: () => rect,
    querySelectorAll: () => [label],
  };
}

function makeHome(options = {}) {
  const home = makeElement(options);
  const hero = makeElement(options.hero ?? {});
  home.firstElementChild = { firstElementChild: { firstElementChild: hero } };
  const suggestions = options.suggestions ?? null;
  home.querySelector = (selector) => selector === selectors.suggestions ? suggestions : null;
  return home;
}

function makeDomFixture({
  scope = { level: "L1", baseState: "thread", missingL1: [] },
  shell = makeElement(),
  sidebar = makeElement(),
  composer = makeElement(),
  home = null,
  homeSignal = null,
  genericMain = null,
  genericInput = null,
  settings = null,
  visibilityState = "visible",
  hidden = false,
  viewportWidth = 1280,
  viewportHeight = 800,
} = {}) {
  const styleNode = {};
  const documentElement = {
    scrollWidth: viewportWidth,
    clientWidth: viewportWidth,
    scrollHeight: viewportHeight,
    clientHeight: viewportHeight,
    getAttribute: (name) => name === "data-dream-skin" ? "active" : null,
  };
  const document = {
    documentElement,
    adoptedStyleSheets: [],
    visibilityState,
    hidden,
    querySelector(selector) {
      if (selector === selectors.shell) return shell;
      if (selector === selectors.sidebar) return sidebar;
      if (selector === selectors.composer) return composer;
      if (selector === selectors.homeIcon) return null;
      if (selector === selectors.home) return home;
      if (selector === selectors.gameSource || selector === selectors.suggestions) return homeSignal;
      if (selector === '[data-ds-part="main"], [data-ds-part="home"]') return genericMain ?? home;
      if (selector === '[data-ds-part="composer"]') return genericInput;
      if (selector === selectors.settings || selector === selectors.themePreview) return settings;
      return null;
    },
    querySelectorAll: () => [],
    getElementById: (id) => id === "codex-dream-skin-style" ? styleNode : null,
  };
  const window = {
    __CODEX_DREAM_SKIN_STATE__: {
      version: SKIN_VERSION,
      themeId: "fixture-theme",
      revision: "fixture-revision",
      styleMode: "style",
      styleNode,
      scope,
    },
  };
  return {
    document,
    window,
    innerWidth: viewportWidth,
    innerHeight: viewportHeight,
    getComputedStyle: (node) => node?._style ?? {},
  };
}

function makeSession({
  dom = makeDomFixture(),
  bindingError = null,
  windowId = 41,
  bindingBounds = { width: 1280, height: 800, windowState: "normal" },
  currentBounds = null,
  boundsError = null,
} = {}) {
  const calls = [];
  return {
    calls,
    async send(method, params) {
      calls.push({ method, params });
      if (method === "Browser.getWindowForTarget") {
        if (bindingError) throw bindingError;
        return { windowId, bounds: bindingBounds };
      }
      if (method === "Browser.getWindowBounds") {
        if (boundsError) throw boundsError;
        return { bounds: currentBounds ?? bindingBounds };
      }
      throw new Error(`Unexpected CDP method: ${method}`);
    },
    async evaluate(expression) {
      return vm.runInNewContext(expression, dom);
    },
  };
}

async function verify(overrides = {}) {
  const session = makeSession(overrides);
  const result = await verifySession(
    session,
    "page-main",
    "fixture-theme",
    "fixture-revision",
  );
  return { result, session };
}

test("normal L1 renderer requires and records the exact target window binding", async () => {
  const { result, session } = await verify();
  assert.equal(result.pass, true);
  assert.deepEqual({ ...result.readiness }, {
    windowPass: true,
    documentPass: true,
    viewportPass: true,
    structurePass: true,
    nativeWindowPass: true,
    fallbackWindowPass: false,
  });
  assert.deepEqual(session.calls, [
    { method: "Browser.getWindowForTarget", params: { targetId: "page-main" } },
    { method: "Browser.getWindowBounds", params: { windowId: 41 } },
  ]);
});

test("visible settings is the only L0 structure exception", async () => {
  const settings = await verify({
    dom: makeDomFixture({
      scope: { level: "L0", baseState: "settings" },
      shell: null,
      sidebar: null,
      settings: makeElement({ rect: makeRect(480, 320, 80, 60) }),
    }),
  });
  assert.equal(settings.result.pass, true);

  const home = await verify({
    dom: makeDomFixture({
      scope: {
        level: "L0",
        baseState: "home",
        missingL1: ["left-panel"],
      },
      shell: null,
      sidebar: null,
      home: makeHome({ rect: makeRect(900, 650, 20, 20) }),
    }),
  });
  assert.equal(home.result.pass, false);
  assert.equal(home.result.readiness.structurePass, false);

  const fallbackHome = makeHome({ rect: makeRect(900, 650, 20, 20) });
  const lateHomeIconSignal = {
    closest: (selector) => selector === '[role="main"]' ? fallbackHome : null,
  };
  const lateHomeIcon = await verify({
    dom: makeDomFixture({
      scope: { level: "L0", baseState: "home" },
      shell: null,
      sidebar: null,
      home: null,
      homeSignal: lateHomeIconSignal,
    }),
  });
  assert.equal(lateHomeIcon.result.homePresent, true);
  assert.equal(lateHomeIcon.result.pass, false);
  assert.equal(lateHomeIcon.result.readiness.structurePass, false);

  const noAnchor = await verify({
    dom: makeDomFixture({
      scope: { level: "L0", baseState: "settings" },
      shell: null,
      sidebar: null,
    }),
  });
  assert.equal(noAnchor.result.pass, false);
  assert.equal(noAnchor.result.readiness.structurePass, false);

  const generic = await verify({
    dom: makeDomFixture({
      shell: null,
      sidebar: null,
      home: null,
      genericMain: makeElement({ rect: makeRect(900, 650, 20, 20) }),
      genericInput: makeElement({ rect: makeRect(620, 80, 180, 620) }),
    }),
  });
  assert.equal(generic.result.pass, true);
  assert.equal(generic.result.readiness.structurePass, true);

  const genericL0 = await verify({
    dom: makeDomFixture({
      scope: {
        level: "L0",
        baseState: "thread",
        missingL1: ["shell-main", "left-panel", "header-tint"],
      },
      shell: null,
      sidebar: null,
      home: null,
      genericMain: makeElement({ rect: makeRect(900, 650, 20, 20) }),
      genericInput: makeElement({ rect: makeRect(620, 80, 180, 620) }),
    }),
  });
  assert.equal(genericL0.result.pass, false,
    "Generic app parts must not turn an L0 thread with missing shell/header anchors into visible success.");
  assert.equal(genericL0.result.readiness.structurePass, false);

  const falseHome = await verify({
    dom: makeDomFixture({
      scope: { level: "L1", baseState: "home", missingL1: [] },
      home: null,
      homeSignal: null,
      genericMain: makeElement({ rect: makeRect(900, 650, 20, 20) }),
      genericInput: makeElement({ rect: makeRect(620, 80, 180, 620) }),
    }),
  });
  assert.equal(falseHome.result.homePresent, false);
  assert.equal(falseHome.result.pass, false,
    "A renderer that claims Home must expose a real Home identity signal.");
});

test("home verification matches macOS and does not require a fixed suggestion-card count", async () => {
  const oneSuggestion = {
    querySelectorAll: (selector) => selector === "button"
      ? [makeSuggestionButton({ text: "One real card" })]
      : [],
  };
  const homeWithOneSuggestion = await verify({
    dom: makeDomFixture({
      home: makeHome({
        rect: makeRect(900, 650, 20, 20),
        hero: { rect: makeRect(800, 260, 40, 60) },
        suggestions: oneSuggestion,
      }),
    }),
  });
  assert.equal(homeWithOneSuggestion.result.homePresent, true);
  assert.equal(homeWithOneSuggestion.result.visibleCardCount, 1);
  assert.equal(homeWithOneSuggestion.result.pass, true);

  const mismatchedSuggestion = {
    querySelectorAll: (selector) => selector === "button"
      ? [makeSuggestionButton({
        text: "Hidden by mismatched text color",
        color: "rgb(210, 210, 210)",
        labelColor: "rgb(10, 10, 10)",
      })]
      : [],
  };
  const badHome = await verify({
    dom: makeDomFixture({
      home: makeHome({
        rect: makeRect(900, 650, 20, 20),
        hero: { rect: makeRect(800, 260, 40, 60) },
        suggestions: mismatchedSuggestion,
      }),
    }),
  });
  assert.equal(badHome.result.suggestionLabelColorsMatch, false);
  assert.equal(badHome.result.pass, false);
});

// Regression for #256. The previous version of this test asserted that a
// -32000 "no window with given target found" reply must fail verification, and
// went further than macOS by demanding the same for -32601. Codex 26.721.x
// (Chrome/150) answers -32000 for the app's real, focused, on-screen window --
// confirmed live over CDP: the error is byte-identical before and after
// actually activating the window, while documentVisibility correctly flips
// hidden -> visible. Locking that in meant Windows could never verify on that
// build, i.e. the assertion protected the bug. Both codes now mean "the Browser
// window API told us nothing", and the renderer's own visibility evidence
// decides. The fail-closed part that is real -- a hidden document -- is
// asserted below and must stay.
test("uninformative Browser window replies defer to the renderer, hidden documents still fail", async () => {
  for (const [label, bindingError] of [
    ["window-not-found", new Error("No window with given target found (-32000)")],
    ["window-not-found-by-code", Object.assign(new Error("Browser window not found"), { cdpCode: -32000 })],
    ["domain-unsupported", new Error("'Browser.getWindowForTarget' wasn't found (-32601)")],
    ["domain-unsupported-by-code", Object.assign(new Error("Protocol method unavailable"), { cdpCode: -32601 })],
    ["domain-unsupported-prose", new Error("Method not found (-32601)")],
  ]) {
    const visible = await verify({ bindingError });
    assert.equal(visible.result.pass, true,
      `${label}: a visible, laid-out renderer must still verify when CDP cannot resolve the native window.`);
    assert.equal(visible.result.nativeWindow.unsupported, true, label);
    assert.equal(visible.result.nativeWindow.pass, false, label);
    assert.equal(visible.result.readiness.windowPass, true, label);
    assert.equal(visible.result.readiness.nativeWindowPass, false, label);
    assert.equal(visible.result.readiness.fallbackWindowPass, true, label);

    const hidden = await verify({
      bindingError,
      dom: makeDomFixture({ visibilityState: "hidden", hidden: true }),
    });
    assert.equal(hidden.result.pass, false,
      `${label}: a hidden document must fail even when the native window check is unusable.`);
    assert.equal(hidden.result.readiness.documentPass, false, label);

    const tiny = await verify({
      bindingError,
      dom: makeDomFixture({ viewportWidth: 319, viewportHeight: 239 }),
    });
    assert.equal(tiny.result.pass, false,
      `${label}: an unreasonable viewport must fail even when the native window check is unusable.`);
    assert.equal(tiny.result.readiness.viewportPass, false, label);

    const noStructure = await verify({
      bindingError,
      dom: makeDomFixture({ shell: null, sidebar: null }),
    });
    assert.equal(noStructure.result.pass, false,
      `${label}: a missing L1 shell must fail even when the native window check is unusable.`);
    assert.equal(noStructure.result.readiness.structurePass, false, label);
  }
});

test("distinguishable window reasons keep their labels", async () => {
  const notFound = await verify({
    bindingError: new Error("No window with given target found (-32000)"),
  });
  assert.equal(notFound.result.nativeWindow.reason, "browser-window-not-found");

  const unsupported = await verify({
    bindingError: new Error("'Browser.getWindowForTarget' wasn't found (-32601)"),
  });
  assert.equal(unsupported.result.nativeWindow.reason, "browser-window-api-unavailable");
});

test("unrecognized window transport failures still fail closed", async () => {
  // Anything that is not a "the API cannot answer" signal -- a dropped socket,
  // a timeout, an unclassified protocol code -- has no fallback and must fail.
  for (const bindingError of [
    new Error("CDP socket closed"),
    new Error("CDP command timed out: Browser.getWindowForTarget"),
    Object.assign(new Error("Internal error (-32603)"), { cdpCode: -32603 }),
  ]) {
    const result = await verify({ bindingError });
    assert.equal(result.result.pass, false, bindingError.message);
    assert.equal(result.result.nativeWindow.reason, "target-window-unavailable", bindingError.message);
    assert.notEqual(result.result.nativeWindow.unsupported, true, bindingError.message);
    assert.equal(result.result.readiness.windowPass, false, bindingError.message);
  }

  const zeroWindowId = await verify({ windowId: 0 });
  assert.equal(zeroWindowId.result.pass, false);
  assert.equal(zeroWindowId.result.nativeWindow.reason, "invalid-window-binding");
  assert.equal(zeroWindowId.session.calls.length, 1,
    "An invalid target binding must not be reused for a bounds query.");
});

test("minimized and undersized native windows fail closed", async () => {
  const minimized = await verify({
    currentBounds: { width: 1280, height: 800, windowState: "minimized" },
  });
  assert.equal(minimized.result.pass, false);
  assert.equal(minimized.result.nativeWindow.reason, "window-not-visible");

  const zeroArea = await verify({
    currentBounds: { width: 0, height: 800, windowState: "normal" },
  });
  assert.equal(zeroArea.result.pass, false);
  assert.equal(zeroArea.result.nativeWindow.reason, "window-bounds-too-small");

  const onePixel = await verify({
    currentBounds: { width: 1, height: 1, windowState: "normal" },
  });
  assert.equal(onePixel.result.pass, false);
  assert.equal(onePixel.result.nativeWindow.reason, "window-bounds-too-small");
});

test("hidden documents and unreasonable viewports cannot pass", async () => {
  const hidden = await verify({ dom: makeDomFixture({ visibilityState: "hidden", hidden: true }) });
  assert.equal(hidden.result.pass, false);
  assert.equal(hidden.result.readiness.documentPass, false);

  const tiny = await verify({
    dom: makeDomFixture({ viewportWidth: 319, viewportHeight: 239 }),
  });
  assert.equal(tiny.result.pass, false);
  assert.equal(tiny.result.readiness.viewportPass, false);
});

test("zero-size and CSS-hidden shell anchors cannot satisfy L1", async () => {
  const zeroRect = await verify({
    dom: makeDomFixture({ shell: makeElement({ rect: makeRect(0, 0) }) }),
  });
  assert.equal(zeroRect.result.pass, false);
  assert.equal(zeroRect.result.readiness.structurePass, false);

  const displayNone = await verify({
    dom: makeDomFixture({ shell: makeElement({ style: { display: "none" } }) }),
  });
  assert.equal(displayNone.result.pass, false);
  assert.equal(displayNone.result.readiness.structurePass, false);

  const unknownScope = await verify({
    dom: makeDomFixture({ scope: null }),
  });
  assert.equal(unknownScope.result.pass, false);
  assert.equal(unknownScope.result.readiness.structurePass, false);
});

test("start cannot announce active after renderer verification exhausts its deadline", async () => {
  const source = await fs.readFile(startPath, "utf8");
  const verifyStart = source.indexOf("$verifyDeadline =");
  const successBreak = source.indexOf("if ($verify.ExitCode -eq 0) { break }", verifyStart);
  const failureThrow = source.indexOf('throw "Dream Skin verification failed.', successBreak);
  const startupCatch = source.indexOf("$startupError = $_", failureThrow);
  const stateCleanup = source.indexOf("Remove-Item -LiteralPath $StatePath", startupCatch);
  const rethrow = source.indexOf("throw $startupError", stateCleanup);
  const activeMessage = source.indexOf('Write-Host "Codex Dream Skin is active', rethrow);
  assert.ok(verifyStart >= 0 && successBreak > verifyStart,
    "Startup must only leave the verify loop on a zero injector exit code.");
  assert.ok(failureThrow > successBreak && startupCatch > failureThrow,
    "A nonzero verify result must reach the startup rollback after its bounded retry window.");
  assert.ok(stateCleanup > startupCatch && rethrow > stateCleanup && activeMessage > rethrow,
    "Verification failure must clear transient state and rethrow before the active message.");
});
