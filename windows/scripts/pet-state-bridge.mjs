import { createStateSourcePolicy, selectPetState } from "./codex-state-bridge.mjs";
import { createPetRuntime } from "./pet-runtime.mjs";

/**
 * Compose a source policy with a pet runtime.  The caller owns the adapters
 * that collect snapshots from Codex; this object is safe to use from a CDP
 * watcher, a native host, or a future extension process.
 */
export function createPetStateBridge({ stateMap = { idle: {} }, stateSource = "auto", onStateChange } = {}) {
  const policy = createStateSourcePolicy(stateSource);
  const runtime = createPetRuntime({ stateMap, onStateChange });

  return Object.freeze({
    policy,
    runtime,
    sync(snapshot = {}) {
      const selected = selectPetState({ ...snapshot, policy });
      runtime.setState(selected.state);
      return selected;
    },
    reset() {
      runtime.reset();
      return { state: runtime.state, source: "reset" };
    },
  });
}
