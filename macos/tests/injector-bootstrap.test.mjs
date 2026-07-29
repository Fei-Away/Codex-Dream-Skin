import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as injector from "../scripts/injector.mjs";

const { earlyPayloadFor } = injector;

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");

function createFixture({ topFrame = true, protocol = "app:" } = {}) {
  const observers = [];
  const timers = new Map();
  const intervals = new Map();
  const listeners = new Map();
  let nextTimer = 1;
  const markers = { shell: false, sidebar: false };
  const window = { installs: [], location: { protocol, search: "" } };
  window.top = topFrame ? window : {};
  const context = {
    window,
    document: {
      documentElement: {},
      addEventListener(type, listener) { listeners.set(type, listener); },
      removeEventListener(type, listener) {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
      querySelector(selector) {
        if (selector === "main.main-surface") return markers.shell ? {} : null;
        if (selector === "aside.app-shell-left-panel") return markers.sidebar ? {} : null;
        return null;
      },
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.connected = true;
        observers.push(this);
      }
      observe() {}
      disconnect() { this.connected = false; }
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback) {
      const id = nextTimer++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
  };
  const tick = () => {
    for (const observer of observers) {
      if (observer.connected) observer.callback([]);
    }
    for (const callback of [...intervals.values()]) callback();
  };
  return { context, intervals, listeners, markers, observers, tick, timers };
}

test("early injection uses one bounded bootstrap and installs only in the top-level app shell", () => {
  const guarded = createFixture();
  vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
  assert.equal(guarded.observers.length, 0, "Bootstrap must not retain a broad subtree MutationObserver.");
  assert.equal(guarded.intervals.size, 1, "A missing shell should have one bounded polling bootstrap.");
  guarded.markers.shell = true;
  guarded.tick();
  assert.deepEqual(guarded.context.window.installs, [], "A main surface without the Codex sidebar is not sufficient.");
  guarded.markers.sidebar = true;
  guarded.tick();
  assert.deepEqual(guarded.context.window.installs, ["guarded"]);
  assert.equal(guarded.intervals.size, 0, "A successful install must clear its bootstrap interval.");

  for (const fixture of [
    createFixture({ topFrame: false }),
    createFixture({ protocol: "https:" }),
  ]) {
    vm.runInNewContext(earlyPayloadFor('window.installs.push("unexpected")', "ignored"), fixture.context);
    assert.deepEqual(fixture.context.window.installs, []);
    assert.equal(fixture.observers.length, 0);
    assert.equal(fixture.intervals.size, 0);
    assert.equal(fixture.timers.size, 0);
  }
});

test("same-revision Runtime.evaluate replaces the previous bootstrap instead of stacking work", () => {
  const generations = createFixture();
  for (let index = 0; index < 40; index += 1) {
    vm.runInNewContext(
      earlyPayloadFor('window.installs.push("same")', "same"),
      generations.context,
    );
  }
  assert.equal(generations.observers.length, 0);
  assert.equal(generations.intervals.size, 1, "Only the newest bootstrap interval may remain active.");
  assert.equal(generations.timers.size, 1, "Only the newest bootstrap timeout may remain active.");
  assert.equal(generations.listeners.size, 1, "Only the newest DOM-ready listener may remain active.");
  generations.markers.shell = true;
  generations.markers.sidebar = true;
  generations.tick();
  assert.deepEqual(generations.context.window.installs, ["same"]);
  assert.equal(generations.context.window.__CODEX_DREAM_SKIN_EARLY_APPLIED__, "same");
});

test("same-revision reconnect skips a healthy renderer but restores a missing state", () => {
  const ready = createFixture();
  ready.markers.shell = true;
  ready.markers.sidebar = true;
  const payload = `
    window.installs.push("same");
    window.__CODEX_DREAM_SKIN_STATE__ = {
      revision: "same",
      ensure() {},
      cleanup() {},
    };
  `;
  vm.runInNewContext(earlyPayloadFor(payload, "same"), ready.context);
  vm.runInNewContext(earlyPayloadFor(payload, "same"), ready.context);
  assert.deepEqual(
    ready.context.window.installs,
    ["same"],
    "A reconnect must not rebuild a healthy renderer at the same revision.",
  );

  delete ready.context.window.__CODEX_DREAM_SKIN_STATE__;
  vm.runInNewContext(earlyPayloadFor(payload, "same"), ready.context);
  assert.deepEqual(
    ready.context.window.installs,
    ["same", "same"],
    "A stale applied marker must not block recovery after renderer state cleanup.",
  );
});

test("an early bootstrap aborts if its target navigates to the avatar overlay", () => {
  const navigated = createFixture();
  vm.runInNewContext(
    earlyPayloadFor('window.installs.push("unexpected")', "navigated"),
    navigated.context,
  );
  navigated.context.window.location.search = "?initialRoute=%2Favatar-overlay";
  navigated.markers.shell = true;
  navigated.markers.sidebar = true;
  navigated.tick();
  assert.deepEqual(navigated.context.window.installs, []);
  assert.equal(navigated.intervals.size, 0);
  assert.equal(navigated.timers.size, 0);
});

test("an unused early bootstrap releases its timer and listener at the deadline", () => {
  const expired = createFixture();
  vm.runInNewContext(
    earlyPayloadFor('window.installs.push("unexpected")', "expired"),
    expired.context,
  );
  assert.equal(expired.intervals.size, 1);
  assert.equal(expired.listeners.size, 1);
  const [timeout] = expired.timers.values();
  timeout();
  assert.equal(expired.intervals.size, 0);
  assert.equal(expired.listeners.size, 0);
  assert.equal(expired.context.window.__CODEX_DREAM_SKIN_EARLY_BOOTSTRAP__, undefined);
});

test("auxiliary app routes are rejected before a CDP session is opened", () => {
  assert.equal(typeof injector.isValidCdpPageTarget, "function");
  const target = {
    type: "page",
    id: "target-1",
    url: "app://-/index.html",
    webSocketDebuggerUrl: "ws://127.0.0.1:9341/devtools/page/target-1",
  };
  assert.equal(injector.isValidCdpPageTarget(target, 9341), true);
  assert.equal(injector.isValidCdpPageTarget({
    ...target,
    url: "app://-/index.html?initialRoute=%2Favatar-overlay",
  }, 9341), false);
});

test("a failed CDP domain handshake closes the just-opened socket", async () => {
  assert.equal(typeof injector.CdpSession, "function");
  const previousWebSocket = globalThis.WebSocket;
  let socket = null;
  class FakeWebSocket {
    constructor() {
      socket = this;
      this.closed = false;
      this.listeners = new Map();
      queueMicrotask(() => this.emit("open"));
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    emit(type, event = {}) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
    close() {
      this.closed = true;
      this.emit("close");
    }
  }
  globalThis.WebSocket = FakeWebSocket;
  try {
    const session = new injector.CdpSession({
      id: "target-1",
      webSocketDebuggerUrl: "ws://127.0.0.1:9341/devtools/page/target-1",
    }, 9341);
    session.send = async () => { throw new Error("Runtime.enable timed out"); };
    await assert.rejects(session.open(), /Runtime\.enable timed out/);
    assert.equal(socket.closed, true);
    assert.equal(session.closed, true);
  } finally {
    globalThis.WebSocket = previousWebSocket;
  }
});

const discoveryStart = source.indexOf("record.earlyScriptId = await registerEarly");
const probeStart = source.indexOf("const probe = await waitForCodexProbe", discoveryStart);
assert.ok(discoveryStart >= 0 && probeStart > discoveryStart, "Early registration must happen before full shell probing.");
assert.match(
  source,
  /finally\s*\{[\s\S]*Promise\.all\(\[\.\.\.sessions\.values\(\)\][\s\S]*removeEarly\(record\)/,
  "Watcher shutdown must unregister persistent Page scripts before closing CDP sessions.",
);
assert.match(
  source,
  /const earlyApplied = await session\.evaluate\([\s\S]*if \(!earlyApplied\) \{[\s\S]*applyToSession/,
  "The watcher must not run the full payload twice after a successful early install.",
);
assert.match(
  source,
  /const suggestionLabelColorsMatch = visibleSuggestionLabels\.every\([\s\S]{0,2500}visibleSuggestionLabels\.length >= result\.visibleCardCount[\s\S]{0,160}result\.suggestionLabelColorsMatch/,
  "Live verification must reject visible home suggestion labels that diverge from the themed card color.",
);
