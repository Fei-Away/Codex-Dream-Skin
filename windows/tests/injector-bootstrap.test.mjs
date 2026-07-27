import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  earlyPayloadFor,
  isThemeUpdateInProgress,
  loadTheme,
} from "../scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorPath = path.resolve(here, "../scripts/injector.mjs");
const source = await fs.readFile(injectorPath, "utf8");

function mp4Fixture(marker) {
  const fileTypeBox = Buffer.alloc(24);
  fileTypeBox.writeUInt32BE(fileTypeBox.length, 0);
  fileTypeBox.write("ftyp", 4, "ascii");
  fileTypeBox.write("isom", 8, "ascii");
  fileTypeBox.writeUInt32BE(512, 12);
  fileTypeBox.write("isom", 16, "ascii");
  fileTypeBox.write("mp41", 20, "ascii");
  return Buffer.concat([fileTypeBox, Buffer.from(marker, "ascii")]);
}

function createFixture() {
  const domReady = [];
  const timers = new Map();
  const intervals = new Map();
  let nextTimer = 1;
  let nextInterval = 1;
  const markers = { shell: false, sidebar: false, main: false, settings: false };
  let root = {};
  let body = {};
  const context = {
    window: { installs: [] },
    location: { protocol: "app:" },
    document: {
      get documentElement() { return root; },
      get body() { return body; },
      addEventListener(type, callback) { if (type === "DOMContentLoaded") domReady.push(callback); },
      querySelector(selector) {
        if (selector === "main.main-surface") return markers.shell ? {} : null;
        if (selector === "aside.app-shell-left-panel") return markers.sidebar ? {} : null;
        if (selector === "[role=\"main\"]") return markers.main ? {} : null;
        if (selector.includes("appearance-theme") || selector.includes("theme-preview")) {
          return markers.settings ? {} : null;
        }
        return null;
      },
    },
    setTimeout(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval(callback) {
      const id = nextInterval++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
  };
  return {
    context,
    markers,
    makeNotReady() { root = null; body = null; },
    makeReady() { root = {}; body = {}; },
    fireDomReady() { for (const callback of [...domReady]) callback(); },
    tick() { for (const callback of [...intervals.values()]) callback(); },
    observers: [],
  };
}

const guarded = createFixture();
vm.runInNewContext(earlyPayloadFor('window.installs.push("guarded")', "guarded"), guarded.context);
assert.deepEqual(guarded.context.window.installs, [], "Auxiliary app targets must remain untouched.");
assert.equal(guarded.observers.length, 0, "Early bootstrap must not install a broad MutationObserver.");
guarded.markers.shell = true;
guarded.tick();
assert.deepEqual(guarded.context.window.installs, [], "A shell without its sidebar is not sufficient for identity.");
guarded.markers.sidebar = true;
guarded.tick();
assert.deepEqual(guarded.context.window.installs, ["guarded"]);

const generations = createFixture();
generations.makeNotReady();
generations.markers.shell = true;
generations.markers.sidebar = true;
vm.runInNewContext(earlyPayloadFor('window.installs.push("old")', "old"), generations.context);
vm.runInNewContext(earlyPayloadFor('window.installs.push("new")', "new"), generations.context);
generations.makeReady();
generations.fireDomReady();
assert.deepEqual(
  generations.context.window.installs,
  ["new"],
  "A stale early script must yield to the newest watcher generation.",
);
assert.equal(generations.context.window.__CODEX_DREAM_SKIN_EARLY_APPLIED__, "new");

const earlyStart = source.indexOf("export function earlyPayloadFor");
const earlySource = source.slice(earlyStart, earlyStart + 2200);
assert.ok(earlyStart >= 0, "Early payload helper must remain exported for bootstrap tests.");
assert.doesNotMatch(earlySource, /MutationObserver|childList|subtree/,
  "Early bootstrap must not observe the entire renderer DOM.");
assert.match(earlySource, /DOMContentLoaded/);
assert.match(earlySource, /setInterval\(install, 250\)/);
const registrationStart = source.indexOf("earlyScriptId = await registerEarlyPayload");
const evaluateStart = source.indexOf("await session.evaluate(earlyPayloadFor", registrationStart);
const probeStart = source.indexOf("const probe = await waitForCodexProbe", registrationStart);
assert.ok(registrationStart >= 0 && evaluateStart > registrationStart && probeStart > evaluateStart,
  "New targets must register and run the early payload before full shell probing.");
assert.match(source, /if \(earlyInjectionFallback\) attachLoadFallback\(/,
  "Load-event reinjection must be attached only when early injection falls back.");
assert.match(source, /if \(!fallbackTargets\.get\(id\)\) return;/,
  "Fallback listeners must stay inert after a successful early registration.");
assert.match(source, /Page\.removeScriptToEvaluateOnNewDocument/,
  "Watcher shutdown and theme refresh must unregister persistent Page scripts.");
assert.match(source, /DOM\.setFileInputFiles/,
  "Windows video themes must use CDP file injection instead of exposing a local file URL.");
assert.match(source, /videoTransport[\s\S]*mode: "blob"/,
  "Windows video payloads must prefer Blob transport when no fallback URL is supplied.");
assert.match(source, /Page\.setBypassCSP[\s\S]*enabled: true/,
  "Windows video fallback fetches must enable CSP bypass only through the verified injector.");
assert.match(source, /Page\.enable[\s\S]*Page\.setBypassCSP/,
  "Windows video fallback fetches must enable CSP bypass before replaying media payloads.");
const mediaPolicyStart = source.indexOf("async function enableMediaFetchForSession");
const mediaPolicyEnd = source.indexOf("async function applyToSession", mediaPolicyStart);
assert.doesNotMatch(source.slice(mediaPolicyStart, mediaPolicyEnd), /Page\.reload/,
  "Windows video theme imports must not force a full page reload and visible flash.");
assert.match(source, /mode: "blob", fallbackUrl: stagedMedia\.url/,
  "Windows watch mode must prefer CDP file injection with a controlled fallback transport.");
assert.match(source, /videoHandle\.createReadStream[\s\S]*fingerprintHash\.update\(chunk\)/,
  "Windows theme fingerprints must stream video content instead of retaining a full MP4 buffer.");
assert.doesNotMatch(source, /videoBytes\s*=\s*videoPath\s*\?\s*await fs\.readFile/,
  "Windows watcher audits must not allocate the entire video solely to fingerprint it.");
assert.match(source, /rejectedSourceStamp[\s\S]*candidateTheme\.sourceStamp === rejectedSourceStamp/,
  "A renderer-rejected video revision must not be reapplied until its source files change.");
assert.match(source, /verifyCodexPortOwner\(port\)[\s\S]*DreamSkinNativeWindowProbe[\s\S]*EnumChildWindows/,
  "Electron window fallback must bind a visible native window to the verified official Codex executable.");
assert.match(source, /source: "verified-codex-process-window"/,
  "Native-window fallback evidence must identify its process-window binding source.");
assert.match(source, /updateError\.deferred[\s\S]*live theme update deferred for a hidden renderer/,
  "A hidden renderer must defer a live switch instead of terminating the watcher during rollback.");
assert.match(source, /rendererVerificationAccepted\(lastResult, allowHiddenApplied\)/,
  "Startup verification must be able to accept only the explicit hidden-renderer defer state.");
assert.match(source, /themeUpdatePending[\s\S]*isThemeUpdateInProgress\(options\.themeDir\)/,
  "The watcher must not load a partially committed active-theme transaction.");
const updateCommit = source.indexOf("Keep the previous media server alive until every renderer verifies the update");
const updateApply = source.indexOf("await applyToSession(session, loadedPayload.payload, loadedPayload);", updateCommit);
const commitIndex = source.indexOf("await mediaServers.commit(paused ? null : stagedMedia);", updateApply);
assert.ok(updateCommit >= 0 && updateApply > updateCommit && commitIndex > updateApply,
  "Windows theme updates must keep the previous media server until renderer verification succeeds, then publish staged media.");
const traySource = await fs.readFile(path.resolve(here, "../scripts/tray-dream-skin.ps1"), "utf8");
const verifiedOperationStart = traySource.indexOf("function Invoke-DreamSkinVerifiedThemeOperation");
const verifiedOperationEnd = traySource.indexOf("function Set-DreamSkinAutoStart", verifiedOperationStart);
const verifiedOperationSource = traySource.slice(verifiedOperationStart, verifiedOperationEnd);
assert.ok(verifiedOperationStart >= 0 && verifiedOperationEnd > verifiedOperationStart,
  "Windows tray must expose one verified transaction for image, video, and saved-theme switches.");
for (const requiredBoundary of [
  "Copy-DreamSkinActiveThemeSnapshot",
  "Ensure-DreamSkinWatcher",
  "Request-DreamSkinCodexActivation",
  "Confirm-DreamSkinThemeApplied",
  "Restore-DreamSkinActiveThemeSnapshot",
]) {
  assert.ok(verifiedOperationSource.includes(requiredBoundary),
    `Verified tray switching is missing ${requiredBoundary}.`);
}
assert.equal(
  traySource.match(/Invoke-DreamSkinVerifiedThemeOperation -Action/g)?.length,
  3,
  "Image, video, and saved-theme tray actions must all use verified switching.",
);
assert.match(
  traySource,
  /function Invoke-DreamSkinTrayThemeOperation \{[\s\S]*?\[scriptblock\]\$Operation[\s\S]*?return & \$Operation/,
  "The serialized tray helper must not shadow the verified operation's Action callback.",
);
assert.equal(
  traySource.match(/Invoke-DreamSkinTrayThemeOperation -Operation/g)?.length,
  4,
  "Every serialized tray operation must use the non-shadowing Operation parameter.",
);

assert.match(source, /async function verifyCodexPortOwner\(port\)/,
  "Windows identity rebind must verify the loopback listener belongs to the recorded Codex executable.");
assert.match(source, /rebound verified CDP browser identity/,
  "Windows watch mode must report a successful verified identity rebind.");
assert.match(source, /listAppTargets\(options\.port, identityState\.browserId\)/,
  "Windows watch mode must bind target discovery to the current browser identity.");
assert.match(source, /identityState\.generation !== identityGeneration/,
  "Windows target setup must abort when the browser identity rotates mid-connection.");
assert.match(source, /candidate\.open\(\)[\s\S]*confirmedBrowserId !== nextBrowserId/,
  "Identity rebinding must reopen and revalidate the candidate browser identity.");
assert.match(source, /await cleanupIdentitySessions\(\)/,
  "Identity rebinding must discard sessions anchored to the old browser identity.");
assert.doesNotMatch(source, /LOOPBACK_HOSTS = new Set\(\["127\.0\.0\.1", "localhost"/,
  "Windows CDP validation must not widen beyond the loopback address required by the startup contract.");

const fingerprintRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-fingerprint-"));
try {
  await fs.copyFile(path.resolve(here, "../assets/dream-reference.jpg"), path.join(fingerprintRoot, "background.jpg"));
  await fs.writeFile(path.join(fingerprintRoot, "background.mp4"), mp4Fixture("AAAA"));
  await fs.writeFile(path.join(fingerprintRoot, "theme.json"), JSON.stringify({
    id: "fingerprint-fixture", name: "Fingerprint fixture", image: "background.jpg", video: "background.mp4",
  }));
  const first = await loadTheme(fingerprintRoot);
  await fs.writeFile(path.join(fingerprintRoot, "background.mp4"), mp4Fixture("BBBB"));
  const second = await loadTheme(fingerprintRoot);
  assert.notEqual(first.fingerprint, second.fingerprint,
    "Replacing an MP4 under the same filename must change the theme fingerprint.");

  const updateMarker = path.join(fingerprintRoot, ".theme-update-in-progress");
  await fs.writeFile(updateMarker, "fixture-update");
  assert.equal(await isThemeUpdateInProgress(fingerprintRoot), true,
    "A fresh active-theme marker must hold the watcher on its verified payload.");
  await assert.rejects(
    loadTheme(fingerprintRoot),
    /still being committed/,
    "Theme loading must reject a writer's in-progress active files.",
  );
  const staleMarkerTime = new Date(Date.now() - 180000);
  await fs.utimes(updateMarker, staleMarkerTime, staleMarkerTime);
  assert.equal(await isThemeUpdateInProgress(fingerprintRoot), false,
    "A stale marker must not freeze the watcher indefinitely after a crashed writer.");
  await fs.unlink(updateMarker);
  assert.equal(await isThemeUpdateInProgress(fingerprintRoot), false);
} finally {
  await fs.rm(fingerprintRoot, { recursive: true, force: true });
}
