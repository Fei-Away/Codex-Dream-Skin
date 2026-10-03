import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import * as macos from '../macos/scripts/injector.mjs';
import * as windows from '../windows/scripts/injector.mjs';

const selectors = {
  shell: 'main:is(.main-surface, [data-app-shell-main-surface], [class*="_MainContentSurface_"])',
  sidebar: 'aside.app-shell-left-panel',
  composer: ':is(.composer-surface-chrome, [class*="_ComposerLayoutRoot_"], [data-composer-surface-variant][data-composer-radius-variant])',
  home: '[role="main"]:has([data-testid="home-icon"])',
  icon: '[data-testid="home-icon"]',
  main: '[data-ds-part="main"], [data-ds-part="home"]',
  input: '[data-ds-part="composer"]',
};
function element({ visible = true, connected = true, inactive = false, x = 10 } = {}) {
  return {
    closest: (selector) => selector === '[data-app-shell-active-page="false"]' && inactive ? {} : null,
    isConnected: connected, children: [], childNodes: [],
    getBoundingClientRect: () => ({ x, y: 10, width: 800, height: 600, right: x + 800, bottom: 610 }),
    checkVisibility: () => visible,
    querySelector: () => null, querySelectorAll: () => [],
    _style: { display: visible ? 'block' : 'none', visibility: 'visible', opacity: '1' },
  };
}
function fixture(version, overrides = {}, baseState = 'thread') {
  const nodes = {
    shell: [element()], sidebar: [element()], composer: [element()],
    home: [], icon: [], main: [], input: [], ...overrides,
  };
  const lookup = (selector) => nodes[Object.keys(selectors).find((key) => selectors[key] === selector)] ?? [];
  const styleNode = {};
  return {
    innerWidth: 1280, innerHeight: 800,
    getComputedStyle: (node) => node._style,
    document: {
      visibilityState: 'visible', hidden: false, adoptedStyleSheets: [],
      documentElement: { scrollWidth: 1280, clientWidth: 1280, scrollHeight: 800, clientHeight: 800,
        getAttribute: () => 'active' },
      querySelector: (selector) => lookup(selector)[0] ?? null,
      querySelectorAll: lookup,
      getElementById: () => styleNode,
    },
    window: { __CODEX_DREAM_SKIN_STATE__: { version, themeId: 'fixture', revision: 'r1',
      styleMode: 'style', styleNode, scope: { level: 'L1', baseState, missingL1: [] } } },
  };
}
for (const [platform, api] of [['macOS', macos], ['Windows', windows]]) {
  async function verify(overrides, baseState) {
    const dom = fixture(api.SKIN_VERSION, overrides, baseState);
    const session = {
      target: { id: 'target' },
      evaluate: async (expression) => vm.runInNewContext(expression, dom),
      send: async (method) => {
        const bounds = { width: 1280, height: 800, windowState: 'normal' };
        if (method === 'Browser.getWindowForTarget') return { windowId: 42, bounds };
        if (method === 'Browser.getWindowBounds') return { bounds };
        throw new Error(`Unexpected CDP method ${method}`);
      },
    };
    return platform === 'Windows'
      ? api.verifySession(session, 'target', 'fixture', 'r1')
      : api.verifySession(session, 'fixture', 'r1');
  }
  test(`${platform}: inactive cached Home does not invalidate visible thread`, async () => {
    const home = element({ visible: false, inactive: true });
    home.firstElementChild = element({ visible: false });
    const icon = element({ visible: false });
    icon.closest = (selector) => selector === '[role="main"]' ? home : home.closest(selector);
    const result = await verify({ home: [home], icon: [icon] });
    assert.equal(result.homePresent, false);
    assert.notEqual(result.homeRoute, true);
    assert.equal(result.pass, true);
  });
  test(`${platform}: later visible shell, sidebar and composer win over cached matches`, async () => {
    const result = await verify(Object.fromEntries(['shell', 'sidebar', 'composer'].map((key) =>
      [key, [element({ visible: false }), element()]])));
    for (const key of ['shell', 'sidebar', 'composer']) assert.equal(result[key]?.visible, true, key);
    assert.equal(result.pass, true);
  });
  test(`${platform}: hidden Home icon identifies its visible parent route`, async () => {
    const home = element();
    home.firstElementChild = element();
    const icon = element({ visible: false });
    icon.closest = (selector) => selector === '[role="main"]' ? home : home.closest(selector);
    // No strict :has match: home identity can come from the signal's parent.
    const result = await verify({ icon: [icon] }, 'home');
    assert.equal(result.homePresent, true);
    assert.equal(result.pass, true);
  });
  test(`${platform}: later active Home is selected after cached Home and hidden signals`, async () => {
    const cached = element({ visible: false, inactive: true });
    const active = element();
    active.firstElementChild = element();
    const icons = [cached, active].map((home) => Object.assign(element({ visible: false }), { closest: (selector) => selector === '[role="main"]' ? home : home.closest(selector) }));
    const result = await verify({ home: [cached, active], icon: icons }, 'home');
    assert.equal(result.homePresent, true);
    assert.equal(result.hero?.visible, true);
    assert.equal(result.pass, true);
  });
  test(`${platform}: inactive anchors are rejected even before cached layout disappears`, async () => {
    const result = await verify({ shell: [element({ inactive: true })],
      composer: [element({ inactive: true })] });
    assert.notEqual(result.shell?.visible, true);
    assert.notEqual(result.composer?.visible, true);
    assert.equal(result.pass, false);
  });
  test(`${platform}: all-hidden composer never supplies visible fallback structure`, async () => {
    const result = await verify({ shell: [], sidebar: [], main: [element()],
      composer: [element({ visible: false })], input: [element({ visible: false })] });
    assert.notEqual(result.composer?.visible, true);
    assert.notEqual(result.genericInput?.visible, true);
    assert.equal(result.pass, false);
  });
  test(`${platform}: detached and offscreen anchors cannot verify a renderer`, async () => {
    for (const invalid of [{ connected: false }, { x: 1400 }]) {
      const result = await verify({ shell: [element(invalid)] });
      assert.notEqual(result.shell?.visible, true);
      assert.equal(result.pass, false);
    }
  });
}
