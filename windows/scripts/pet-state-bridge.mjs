import { selectPetState } from "./codex-state-bridge.mjs";
import { createPetRuntime } from "./pet-runtime.mjs";

/**
 * Compose the DOM state contract with a pet runtime. The caller owns the
 * adapter that collects snapshots from Codex; this object is safe to use from
 * a CDP watcher, a native host, or a future extension process.
 */
export function createPetStateBridge({ stateMap = { idle: {} }, onStateChange } = {}) {
  const runtime = createPetRuntime({ stateMap, onStateChange });

  return Object.freeze({
    runtime,
    sync(snapshot = {}) {
      const selected = selectPetState(snapshot);
      runtime.setState(selected.state);
      return selected;
    },
    reset() {
      runtime.reset();
      return { state: runtime.state, source: "reset" };
    },
  });
}
