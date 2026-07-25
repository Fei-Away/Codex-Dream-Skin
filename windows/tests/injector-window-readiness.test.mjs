import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { verifySession } from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const startPath = path.resolve(here, "../scripts/start-dream-skin.ps1");

const selectors = {
  shell: "main.main-surface",
  sidebar: "aside.app-shell-left-panel",
  composer: ".composer-surface-chrome",
  home: '[role="main"]:has([data-testid="home-icon"])',
  settings: 'input[name="appearance-theme"]',
  themePreview: '[data-testid="theme-preview"]',
};

function makeRect(width = 800, height = 600, x = 0, y = 0) {
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function makeElement({ rect = makeRect(), style = {}, visible = true } = {}) {
  return {
    isConnected: true,
    _style: {
      display: "block",
      visibility: "visible",
      contentVisibility: "visible",
      opacity: "1",
      ...style,
    },
    getBoundingClientRect: () => rect,
    checkVisibility: () => visible,
    querySelector: () => null,
  };
}

function makeHome(options = {}) {
  const home = makeElement(options);
  const hero = makeElement(options.hero ?? {});
  home.firstElementChild = { firstElementChild: { firstElementChild: hero } };
  return home;
}

function makeDomFixture({
  scope = { level: "L1", baseState: "thread" },
  shell = makeElement(),
  sidebar = makeElement(),
  composer = makeElement(),
  home = null,
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
      if (selector === selectors.home) return home;
      if (selector === selectors.settings || selector === selectors.themePreview) return settings;
      return null;
    },
    querySelectorAll: () => [],
    getElementById: (id) => id === "codex-dream-skin-style" ? styleNode : null,
  };
  const window = {
    __CODEX_DREAM_SKIN_STATE__: {
      version: "1.5.3",
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
  });
  assert.deepEqual(session.calls, [
    { method: "Browser.getWindowForTarget", params: { targetId: "page-main" } },
    { method: "Browser.getWindowBounds", params: { windowId: 41 } },
  ]);
});

test("visible settings and home anchors are the only L0 structure exceptions", async () => {
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
      scope: { level: "L0", baseState: "home" },
      shell: null,
      sidebar: null,
      home: makeHome({ rect: makeRect(900, 650, 20, 20) }),
    }),
  });
  assert.equal(home.result.pass, true);

  const noAnchor = await verify({
    dom: makeDomFixture({
      scope: { level: "L0", baseState: "settings" },
      shell: null,
      sidebar: null,
    }),
  });
  assert.equal(noAnchor.result.pass, false);
  assert.equal(noAnchor.result.readiness.structurePass, false);
});

test("missing or unsupported Browser window APIs fail closed", async () => {
  const missing = await verify({
    bindingError: new Error("No window with given target found (-32000)"),
  });
  assert.equal(missing.result.pass, false);
  assert.equal(missing.result.nativeWindow.reason, "target-window-unavailable");

  const unsupported = await verify({
    bindingError: new Error("'Browser.getWindowForTarget' wasn't found (-32601)"),
  });
  assert.equal(unsupported.result.pass, false);
  assert.equal(unsupported.result.nativeWindow.reason, "browser-window-api-unavailable");

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
