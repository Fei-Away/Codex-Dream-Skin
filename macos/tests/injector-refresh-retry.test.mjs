import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = await fs.readFile(path.resolve(here, "../scripts/injector.mjs"), "utf8");
const start = source.indexOf("  const refreshPayload = async (");
const end = source.indexOf("\n  let pendingPreferenceOnly", start);
assert.ok(start >= 0 && end > start, "watcher refresh must remain extractable");
const retryStart = source.indexOf("      const dueRefreshes = ");
const retryEnd = source.indexOf("\n      const cycleRecovery", retryStart);
assert.ok(retryStart >= 0 && retryEnd > retryStart, "watcher retry scheduling must remain extractable");

test("a failed preference refresh retries the same revision and clears its debt only after verification", async () => {
  const oldPayload = { revision: "old", theme: { id: "test", name: "Test" } };
  const nextPayload = {
    revision: "new",
    payload: "new payload",
    theme: { id: "test", name: "Test" },
    timings: { buildMs: 1 },
  };
  const record = {
    session: { closed: false, close() { this.closed = true; } },
    appliedRevision: "old",
    earlyScriptId: null,
    earlyScriptIds: new Set(),
    needsLoadFallback: false,
  };
  let applications = 0;
  let verifications = 0;
  let timeoutNext = false;
  const context = vm.createContext({
    current: oldPayload,
    sessions: new Map([["renderer", record]]),
    mutationEpoch: 0,
    refreshGeneration: 0,
    activeOperation: null,
    controlOnly: false,
    options: { themeDir: "/test", timeoutMs: 1000 },
    async loadPayload() { return nextPayload; },
    nextOperationToken() { return "test-token"; },
    async registerEarlyForRecord() { return "early-script"; },
    async removeEarlyIdentifier() { return true; },
    async applyToSession() {
      applications += 1;
      if (timeoutNext) throw new Error("CDP command timed out: Runtime.evaluate");
      if (applications === 1) throw new Error("transient renderer failure");
    },
    async waitForAppliedPayloadSession() {
      verifications += 1;
      return true;
    },
    async presentOperationUi() {},
    console: { log() {}, error() {} },
    Date,
  });
  const refreshPayload = vm.runInContext(`${source.slice(start, end)}\nrefreshPayload`, context);

  await refreshPayload({ preferenceOnly: true });
  assert.equal(record.appliedRevision, "old");
  assert.equal(record.refreshFailures, 1);
  assert.ok(record.refreshRetryAt > Date.now());
  assert.equal(context.current.revision, "new", "new targets should still receive the desired payload");

  await refreshPayload({ preferenceOnly: true });
  assert.equal(applications, 2, "an unchanged disk revision must be reapplied to a stale renderer");
  assert.equal(verifications, 1);
  assert.equal(record.appliedRevision, "new");
  assert.equal(record.refreshRetryAt, 0);
  assert.equal(record.refreshFailures, 0);

  await refreshPayload({ preferenceOnly: true });
  assert.equal(applications, 2, "a verified renderer needs no further refresh");

  timeoutNext = true;
  nextPayload.revision = "newer";
  await refreshPayload({ preferenceOnly: true });
  assert.equal(record.session.closed, true,
    "a timed-out CDP connection must be released for target discovery to reconnect");
  assert.equal(record.appliedRevision, "new", "the timed-out payload is still unverified");
});

test("watcher schedules an expired refresh debt without a new file change", async () => {
  const record = {
    session: { closed: false },
    appliedRevision: "old",
    refreshRetryAt: 1500,
  };
  const calls = [];
  const context = vm.createContext({
    sessions: new Map([["renderer", record]]),
    current: { revision: "new" },
    refreshRetryInFlight: false,
    refreshGeneration: 4,
    reloadChain: Promise.resolve(),
    controlOnly: false,
    activeOperation: null,
    Date: { now: () => 2000 },
    async refreshPayload(options) { calls.push(options); },
    console: { error() {} },
  });
  vm.runInContext(source.slice(retryStart, retryEnd), context);
  assert.equal(context.refreshRetryInFlight, true);
  await context.reloadChain;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].preferenceOnly, true);
  assert.equal(calls[0].generation, 4);
  assert.equal(context.refreshRetryInFlight, false);
});
