import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {
  isPrimaryOperationUiTarget,
  operationUiExpression,
  terminalOperationUiState,
  watchOperationState,
} from "../scripts/injector.mjs";

assert.equal(isPrimaryOperationUiTarget({ url: "app://-/index.html" }), true);
assert.equal(isPrimaryOperationUiTarget({ url: "app://-/index.html?initialRoute=%2Fspace" }), true);
assert.equal(isPrimaryOperationUiTarget({ url: "app://-/index.html?initialRoute=%2Favatar-overlay" }), false);
assert.equal(isPrimaryOperationUiTarget({ url: "app://-/detached-window.html?initialRoute=%2Fdetached-window" }), false);
assert.equal(isPrimaryOperationUiTarget({ url: "https://example.com/index.html" }), false);

assert.equal(terminalOperationUiState("success"), "success");
assert.equal(terminalOperationUiState("paused"), "success");
assert.equal(terminalOperationUiState("failed"), "error");
assert.equal(terminalOperationUiState("cancelled"), "cancelled");
assert.equal(terminalOperationUiState("applying"), null);

for (const action of ["update", "show"]) {
  for (const dataset of [
    { operationToken: "123:1234567890123:1", state: "success" },
    { operationToken: "123:1234567890123:1", state: "loading", terminalPending: "true" },
  ]) {
    const host = { dataset };
    const result = vm.runInNewContext(
      operationUiExpression(action, dataset.operationToken, "loading", "old progress"),
      {
        document: { getElementById: () => host },
        window: {},
        location: { protocol: "app:", pathname: "/index.html", search: "" },
        URLSearchParams,
      },
    );
    assert.equal(result.stale, true, `${action} replaced a terminal state with loading`);
    assert.equal(host.dataset.state, dataset.state);
  }
}

const completedContext = {
  document: { getElementById: () => null },
  window: {},
  location: { protocol: "app:", pathname: "/index.html", search: "" },
  URLSearchParams,
};
const completedToken = "123:1234567890123:2";
assert.equal(vm.runInNewContext(
  operationUiExpression("hide", completedToken), completedContext,
).removed, true);
assert.equal(vm.runInNewContext(
  operationUiExpression("show", completedToken, "loading", "late progress"), completedContext,
).stale, true);

const stalePetHost = { dataset: { operationToken: completedToken }, remove() { this.removed = true; } };
const petContext = {
  document: { getElementById: () => stalePetHost },
  window: {},
  location: { protocol: "app:", pathname: "/index.html", search: "?initialRoute=%2Favatar-overlay" },
  URLSearchParams,
};
assert.equal(vm.runInNewContext(
  operationUiExpression("show", completedToken, "loading", "pet progress"), petContext,
).excluded, true);
assert.equal(stalePetHost.removed, true, "a progress card stranded in the pet overlay must be removed");

let liveHost;
let routeCheck;
const movingPage = { protocol: "app:", pathname: "/index.html", search: "" };
const makeNode = () => ({
  dataset: {}, style: { setProperty() {} }, setAttribute() {}, append() {},
  attachShadow() { return { append() {}, querySelector() { return null; } }; },
  remove() { liveHost = null; },
});
const movingContext = {
  document: {
    getElementById() { return liveHost; },
    querySelector() { return null; },
    createElement() { return makeNode(); },
    body: {},
    documentElement: {
      getBoundingClientRect() { return { top: 0, left: 0, width: 1000, height: 800 }; },
      append(node) { liveHost = node; },
    },
  },
  window: {}, location: movingPage, URLSearchParams,
  innerWidth: 1000, innerHeight: 800,
  getComputedStyle() { return { backgroundColor: "rgb(255, 255, 255)" }; },
  matchMedia() { return { matches: true }; },
  setTimeout() { return 1; }, clearTimeout() {},
  setInterval(callback) { routeCheck = callback; return 2; }, clearInterval() {},
};
assert.equal(vm.runInNewContext(
  operationUiExpression("show", completedToken, "loading", "applying"), movingContext,
).visible, true);
assert.ok(liveHost);
movingPage.search = "?initialRoute=%2Favatar-overlay";
routeCheck();
assert.equal(liveHost, null, "a main page progress card must clear after the renderer becomes a pet overlay");

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-operation-watch-"));
const statePath = path.join(directory, "operation-state.plist");
const token = "123:1234567890123:1";
const writeState = async (status) => {
  const temporary = `${statePath}.tmp`;
  await fs.writeFile(temporary, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>operationToken</key><string>${token}</string>
<key>status</key><string>${status}</string>
<key>message</key><string>${status}</string>
<key>updatedAt</key><integer>1234567890</integer>
</dict></plist>`);
  await fs.rename(temporary, statePath);
};
const waitForStatus = async (events, status) => {
  const deadline = Date.now() + 2500;
  while (!events.includes(status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(events.includes(status), `operation watcher missed ${status}`);
};

let close;
try {
  await writeState("applying");
  const events = [];
  close = await watchOperationState(statePath, (operation) => {
    events.push(operation.status);
  });
  await waitForStatus(events, "applying");
  await writeState("success");
  await waitForStatus(events, "success");
  assert.deepEqual(events, ["applying", "success"]);
} finally {
  close?.();
  await fs.rm(directory, { recursive: true, force: true });
}

// Exercise the actual watcher with a silent filesystem source so success can
// only arrive through its periodic reconciliation, independent of fs.watch.
let snapshot = { token, status: "applying", updatedAt: 1 };
const auditedEvents = [];
let stoppedWatching = false;
const silentWatch = vm.runInNewContext(`(${watchOperationState.toString()})`, {
  path,
  readOperationState: async () => snapshot,
  watchFs: () => ({ on() {}, close() { stoppedWatching = true; } }),
  setTimeout, clearTimeout, setInterval, clearInterval, console,
});
const stopAudit = await silentWatch("/fixture/operation-state.plist", (operation) => {
  auditedEvents.push(operation.status);
});
try {
  snapshot = { token, status: "success", updatedAt: 2 };
  await waitForStatus(auditedEvents, "success");
  assert.deepEqual(auditedEvents, ["applying", "success"]);
} finally {
  stopAudit();
}
assert.equal(stoppedWatching, true);

// An old completion cannot remove another operation's loading host.
const newerHost = { dataset: { operationToken: "123:1234567890124:1", state: "loading" } };
assert.equal(vm.runInNewContext(operationUiExpression("hide", token), {
  document: { getElementById: () => newerHost },
  window: {}, URLSearchParams,
  location: { protocol: "app:", pathname: "/index.html", search: "" },
}).removed, false);
assert.equal(newerHost.dataset.state, "loading");

for (const state of ["error", "cancelled"]) {
  movingPage.search = "";
  vm.runInNewContext(operationUiExpression("show", token, "loading"), movingContext);
  // Avoid the minimum-loading delay to inspect the terminal state directly.
  Object.values(movingContext.window).find((value) => value?.token === token).startedAt = 0;
  assert.equal(vm.runInNewContext(
    operationUiExpression("update", token, state, state), movingContext,
  ).state, state);
  assert.equal(liveHost.dataset.state, state);
  assert.equal(liveHost.dataset.visible, "true", `${state} feedback must remain visible`);
}
