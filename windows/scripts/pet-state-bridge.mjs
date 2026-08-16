import { selectPetState, normalizeStateSource } from "./codex-state-bridge.mjs";
import { createPetRuntime } from "./pet-runtime.mjs";

/**
 * Compose the DOM state contract with a pet runtime. The caller owns the
 * adapter that collects snapshots from Codex; this object is safe to use from
 * a CDP watcher, a native host, or a future extension process.
 */
export function createPetStateBridge({ stateMap = { idle: {} }, onStateChange, stateSource = "auto" } = {}) {
  const runtime = createPetRuntime({ stateMap, onStateChange });
  const mode = normalizeStateSource(stateSource);
  let lastSnapshot = { stateSource: mode };

  const sync = (snapshot = {}) => {
    lastSnapshot = { ...lastSnapshot, ...snapshot, stateSource: snapshot.stateSource || mode };
    const selected = selectPetState(lastSnapshot);
    runtime.setState(selected.state);
    return selected;
  };

  return Object.freeze({
    runtime,
    stateSource: mode,
    sync,
    ingestAppServer(message) {
      const events = Array.isArray(lastSnapshot.appServerEvents)
        ? [...lastSnapshot.appServerEvents, message].slice(-64)
        : [message];
      return sync({ appServerEvents: events });
    },
    reset() {
      runtime.reset();
      return { state: runtime.state, source: "reset" };
    },
  });
}
