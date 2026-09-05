/**
 * Generic pet state runtime.  Animation assets and rendering remain the
 * responsibility of the pet package; this module only validates and emits
 * normalized states.
 */

export function createPetRuntime({ stateMap = {}, initialState = "idle", onStateChange = () => {} } = {}) {
  const hasState = (state) => Object.prototype.hasOwnProperty.call(stateMap, state);
  let currentState = hasState(initialState) ? initialState : "idle";

  const normalize = (state) => {
    const candidate = String(state || "idle");
    return hasState(candidate) ? candidate : "idle";
  };

  return Object.freeze({
    get state() {
      return currentState;
    },
    normalize,
    setState(nextState) {
      const next = normalize(nextState);
      if (next === currentState) return false;
      const previous = currentState;
      currentState = next;
      onStateChange(next, previous);
      return true;
    },
    reset() {
      return this.setState("idle");
    },
  });
}
