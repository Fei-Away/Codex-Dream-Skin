import assert from "node:assert/strict";
import { appServerEventToPetState, normalizeStateSource, selectPetState } from "../scripts/codex-state-bridge.mjs";
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

const domModeIgnoresServerFlag = selectPetState({
  uiProbe: runningProbe,
  domActivity: null,
  appServerFlags: ["waitingOnApproval"],
  stateSource: "dom",
});
assert.deepEqual(domModeIgnoresServerFlag, {
  threadId,
  state: "reasoning",
  source: "dom",
});

const enhancedFlag = selectPetState({
  uiProbe: runningProbe,
  appServerFlags: ["commandExecution"],
  stateSource: "dom-plus",
});
assert.deepEqual(enhancedFlag, {
  threadId,
  state: "commandExecution",
  source: "app-server",
});

const eventStates = [
  ["commandExecution", "commandExecution", { command: "Write-Output test" }],
  ["fileRead", "commandExecution", { command: "Get-Content README.md" }],
  ["fileChange", "fileChange", {}],
  ["mcpToolCall", "mcpToolCall", {}],
  ["webSearch", "webSearch", {}],
  ["plan", "plan", {}],
  ["reasoning", "reasoning", {}],
];
for (const [expected, type, item] of eventStates) {
  assert.equal(appServerEventToPetState({ method: "item/started", params: {
    threadId,
    item: { type, ...item },
  } }, threadId)?.state, expected);
}
assert.equal(appServerEventToPetState({
  method: "turn/completed",
  params: { threadId, turn: { status: "completed" } },
}, threadId)?.state, "completed");
assert.equal(appServerEventToPetState({
  method: "turn/completed",
  params: { threadId, turn: { status: "interrupted" } },
}, threadId)?.state, "aborted");
assert.equal(appServerEventToPetState({
  method: "item/started",
  params: { threadId: "00000000-0000-0000-0000-000000000001", item: { type: "webSearch" } },
}, threadId), null);

const transitions = [];
const bridge = createPetStateBridge({
  stateMap: { idle: {}, reasoning: {}, waitingOnApproval: {} },
  onStateChange: (next, previous) => transitions.push([previous, next]),
});
bridge.sync({ uiProbe: runningProbe, domActivity: "active" });
bridge.sync({ uiProbe: finishedProbe });
assert.equal(bridge.runtime.state, "idle");
assert.deepEqual(transitions, [["idle", "reasoning"], ["reasoning", "idle"]]);

const enhancedBridge = createPetStateBridge({
  stateSource: "dom-plus",
  stateMap: { idle: {}, reasoning: {}, commandExecution: {} },
});
enhancedBridge.sync({ uiProbe: runningProbe });
enhancedBridge.ingestAppServer({
  method: "item/started",
  params: { threadId, item: { type: "commandExecution" } },
});
assert.equal(enhancedBridge.runtime.state, "commandExecution");
assert.equal(normalizeStateSource("auto"), "dom-plus");
assert.equal(normalizeStateSource("app-server"), "dom-plus");
assert.equal(normalizeStateSource("dom"), "dom");

console.log("pet-state-bridge tests passed");
