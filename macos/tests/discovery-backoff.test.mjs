import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISCOVERY_BACKOFF,
  discoveryLogIntervalMs,
  nextDiscoveryDelayMs,
} from "../scripts/injector.mjs";

/** Replay the watcher's failure loop and report what it costs over a window. */
function simulateOutage(totalMs) {
  let delay = DISCOVERY_BACKOFF.initialMs;
  let elapsed = 0;
  let polls = 0;
  while (elapsed < totalMs) {
    delay = nextDiscoveryDelayMs(delay, elapsed);
    elapsed += delay;
    polls += 1;
  }
  return { polls, finalDelay: delay };
}

test("a short outage still reconnects fast", () => {
  // A reload or navigation fails discovery for well under a second. The first
  // retries must stay in the low hundreds of ms or the skin visibly lags back.
  let delay = DISCOVERY_BACKOFF.initialMs;
  delay = nextDiscoveryDelayMs(delay, 0);
  assert.ok(delay <= 200, `first retry was ${delay}ms`);
  delay = nextDiscoveryDelayMs(delay, delay);
  assert.ok(delay <= 300, `second retry was ${delay}ms`);
  const { finalDelay } = simulateOutage(2000);
  assert.equal(finalDelay, DISCOVERY_BACKOFF.ceilingMs, "2s outage stays on the fast ceiling");
});

test("a closed Codex stops costing two polls per second", () => {
  // #218: the flat 500ms ceiling meant ~2 polls/sec forever. Ten minutes of
  // that is ~1200 polls; the escalating ceiling has to be far below it.
  const { polls } = simulateOutage(10 * 60 * 1000);
  assert.ok(polls < 60, `ten idle minutes still cost ${polls} polls`);
  const flatCeilingPolls = (10 * 60 * 1000) / DISCOVERY_BACKOFF.ceilingMs;
  assert.ok(polls < flatCeilingPolls / 10, "must be an order of magnitude cheaper than the old loop");
});

test("the ceiling escalates only after the documented thresholds", () => {
  const justBeforeIdle = nextDiscoveryDelayMs(
    DISCOVERY_BACKOFF.idleCeilingMs,
    DISCOVERY_BACKOFF.idleAfterMs - 1,
  );
  assert.equal(justBeforeIdle, DISCOVERY_BACKOFF.ceilingMs);

  const atIdle = nextDiscoveryDelayMs(
    DISCOVERY_BACKOFF.ceilingMs,
    DISCOVERY_BACKOFF.idleAfterMs,
  );
  assert.ok(atIdle > DISCOVERY_BACKOFF.ceilingMs && atIdle <= DISCOVERY_BACKOFF.idleCeilingMs);

  const atDormant = nextDiscoveryDelayMs(
    DISCOVERY_BACKOFF.idleCeilingMs,
    DISCOVERY_BACKOFF.dormantAfterMs,
  );
  assert.ok(atDormant > DISCOVERY_BACKOFF.idleCeilingMs);
  assert.ok(atDormant <= DISCOVERY_BACKOFF.dormantCeilingMs);
});

test("the delay never exceeds the dormant ceiling or goes backwards", () => {
  let delay = DISCOVERY_BACKOFF.initialMs;
  let previous = 0;
  for (let elapsed = 0; elapsed < 30 * 60 * 1000; elapsed += delay) {
    delay = nextDiscoveryDelayMs(delay, elapsed);
    assert.ok(delay <= DISCOVERY_BACKOFF.dormantCeilingMs, `delay grew to ${delay}`);
    assert.ok(delay >= previous || previous > DISCOVERY_BACKOFF.ceilingMs, "must not oscillate down");
    previous = delay;
  }
  assert.equal(delay, DISCOVERY_BACKOFF.dormantCeilingMs);
});

test("a corrupt current delay falls back to the initial value", () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    const delay = nextDiscoveryDelayMs(bad, 0);
    assert.ok(delay > 0 && delay <= DISCOVERY_BACKOFF.ceilingMs, `${bad} produced ${delay}`);
  }
});

test("error logging thins out with the backoff instead of every 2s", () => {
  assert.equal(discoveryLogIntervalMs(DISCOVERY_BACKOFF.initialMs), 2000, "fast path keeps 2s");
  assert.ok(
    discoveryLogIntervalMs(DISCOVERY_BACKOFF.dormantCeilingMs) >= 30_000,
    "a dormant watcher must not fill injector-error.log",
  );
  assert.ok(
    discoveryLogIntervalMs(DISCOVERY_BACKOFF.dormantCeilingMs)
      <= DISCOVERY_BACKOFF.dormantCeilingMs * 2,
    "but it must still prove it is alive",
  );
});
