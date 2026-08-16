import assert from "node:assert/strict";
import { selectPetState } from "../scripts/codex-state-bridge.mjs";
import { createPetStateBridge } from "../scripts/pet-state-bridge.mjs";

const threadId = "019fd5ae-eb5b-7e01-bb4e-32b021aefd56";
const runningProbe = {
  ids: [threadId],
  details: [{ id: threadId, running: true, title: "running task" }],
};
const finishedProbe = {
  ids: [threadId],
  details: [{ id: threadId, running: false, title: "finished task" }],
};

const staleCompletion = selectPetState({
  uiProbe: finishedProbe,
});
assert.deepEqual(staleCompletion, {
  threadId,
  state: "idle",
  source: "sidebar-gate",
});

const domOnly = selectPetState({
  uiProbe: runningProbe,
  domActivity: "waitingOnApproval",
});
assert.deepEqual(domOnly, {
  threadId,
  state: "waitingOnApproval",
  source: "dom",
});

const staleServerFlagIsIgnored = selectPetState({
  uiProbe: runningProbe,
  domActivity: null,
  appServerFlags: ["waitingOnApproval"],
});
assert.deepEqual(staleServerFlagIsIgnored, {
  threadId,
  state: "reasoning",
  source: "dom",
});

const transitions = [];
const bridge = createPetStateBridge({
  stateMap: { idle: {}, reasoning: {}, waitingOnApproval: {} },
  onStateChange: (next, previous) => transitions.push([previous, next]),
});
bridge.sync({ uiProbe: runningProbe, domActivity: "active" });
bridge.sync({ uiProbe: finishedProbe });
assert.equal(bridge.runtime.state, "idle");
assert.deepEqual(transitions, [["idle", "reasoning"], ["reasoning", "idle"]]);

console.log("pet-state-bridge tests passed");
