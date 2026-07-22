import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  LatestFrameDispatcher,
  audioPushExpression,
  createDeterministicAudioFrame,
  earlyPayloadFor,
  normalizeAudioFeatureFrame,
  normalizeAudioFps,
} from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");

function createFixture() {
  const observers = [];
  const timers = new Map();
  let nextTimer = 1;
  const markers = { shell: false, sidebar: false };
  const context = {
    window: { installs: [] },
    document: {
      documentElement: {},
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
  };
  return { context, markers, observers };
}

const guarded = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
assert.deepEqual(guarded.context.window.installs, [], "Auxiliary app targets must remain untouched.");
guarded.markers.shell = true;
guarded.observers[0].callback([]);
assert.deepEqual(guarded.context.window.installs, [], "A main surface without the Codex sidebar is not sufficient.");

const generations = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("old")', "old"), generations.context);
vm.runInNewContext(earlyPayloadFor('window.installs.push("new")', "new"), generations.context);
generations.markers.shell = true;
generations.markers.sidebar = true;
for (const observer of generations.observers) observer.callback([]);
assert.deepEqual(
  generations.context.window.installs,
  ["new"],
  "A stale early script must yield to the newest watcher generation.",
);
assert.equal(generations.context.window.__CODEX_DREAM_SKIN_EARLY_APPLIED__, "new");

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

for (const fps of [10, 20, 30]) assert.equal(normalizeAudioFps(fps), fps);
for (const invalid of [0, 15, 60, NaN, "30fps"]) {
  assert.throws(() => normalizeAudioFps(invalid), /10, 20, or 30/);
}

const deterministic = createDeterministicAudioFrame(7, 30);
assert.deepEqual(deterministic, createDeterministicAudioFrame(7, 30));
assert.equal(deterministic.bands.length, 64);
assert.ok(deterministic.bands.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
assert.doesNotMatch(audioPushExpression(deterministic, 30), /samples|pcm|rawAudio/i);
assert.throws(
  () => normalizeAudioFeatureFrame({ ...deterministic, samples: [0.1] }),
  /unsupported field/,
);
assert.throws(
  () => normalizeAudioFeatureFrame({ ...deterministic, bands: deterministic.bands.slice(1) }),
  /exactly 64 bands/,
);
assert.throws(
  () => normalizeAudioFeatureFrame({ ...deterministic, rms: Number.POSITIVE_INFINITY }),
  /finite and normalized/,
);

for (const fps of [10, 20, 30]) {
  let clock = 0;
  const sent = [];
  const dispatcher = new LatestFrameDispatcher(async (frame) => {
    sent.push(frame.sequence);
    clock += 0.5;
    return { accepted: true, sequence: frame.sequence };
  }, () => clock);
  for (let sequence = 1; sequence <= fps; sequence += 1) {
    dispatcher.offer(createDeterministicAudioFrame(sequence, fps));
    await dispatcher.drain();
    clock += 1000 / fps;
  }
  const metrics = await dispatcher.close();
  assert.equal(metrics.sent, fps);
  assert.equal(metrics.accepted, fps);
  assert.equal(metrics.transportDropped, 0);
  assert.equal(metrics.failed, 0);
  assert.equal(metrics.maxBuffered, 0);
  assert.equal(metrics.lastAcceptedSequence, fps);
  assert.deepEqual(sent, Array.from({ length: fps }, (_, index) => index + 1));
}

let overloadResolve;
const overloadedSent = [];
const overloaded = new LatestFrameDispatcher((frame) => {
  overloadedSent.push(frame.sequence);
  if (frame.sequence === 1) {
    return new Promise((resolve) => { overloadResolve = resolve; });
  }
  return Promise.resolve({ accepted: true, sequence: frame.sequence });
});
overloaded.offer(createDeterministicAudioFrame(1));
overloaded.offer(createDeterministicAudioFrame(2));
overloaded.offer(createDeterministicAudioFrame(3));
await Promise.resolve();
overloadResolve({ accepted: true, sequence: 1 });
const overloadMetrics = await overloaded.drain();
assert.deepEqual(overloadedSent, [1, 3]);
assert.equal(overloadMetrics.sent, 3);
assert.equal(overloadMetrics.accepted, 2);
assert.equal(overloadMetrics.transportDropped, 1);
assert.equal(overloadMetrics.maxBuffered, 1);
assert.equal(overloadMetrics.lastAcceptedSequence, 3);
assert.throws(
  () => overloaded.offer(createDeterministicAudioFrame(3)),
  /increase strictly/,
);

let closingResolve;
const closingSent = [];
const closing = new LatestFrameDispatcher((frame) => {
  closingSent.push(frame.sequence);
  return new Promise((resolve) => { closingResolve = resolve; });
});
closing.offer(createDeterministicAudioFrame(1));
closing.offer(createDeterministicAudioFrame(2));
await Promise.resolve();
const closingPromise = closing.close();
closingResolve({ accepted: true, sequence: 1 });
const closingMetrics = await closingPromise;
assert.deepEqual(closingSent, [1]);
assert.equal(closingMetrics.sent, 2);
assert.equal(closingMetrics.accepted, 1);
assert.equal(closingMetrics.transportDropped, 1);
assert.equal(closingMetrics.maxBuffered, 1);
assert.throws(() => closing.offer(createDeterministicAudioFrame(3)), /closed/);

console.log("PASS: early injection is shell-guarded, generation-safe, and removed on shutdown.");
