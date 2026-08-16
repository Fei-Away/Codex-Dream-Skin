/**
 * Platform-neutral DOM state contract for optional Codex pet integrations.
 *
 * The caller provides DOM snapshots and, when enabled, normalized app-server
 * messages. The transport and process lifecycle remain optional to the pet
 * integration rather than becoming a core skin dependency.
 */

export const STATE_SOURCE_MODES = Object.freeze(["auto", "dom", "app-server"]);

export function normalizeStateSource(value) {
  const normalized = String(value || "auto").trim().toLowerCase();
  return STATE_SOURCE_MODES.includes(normalized) ? normalized : "auto";
}

export function createStateSourcePolicy(stateSource = "auto") {
  const mode = normalizeStateSource(stateSource);
  return Object.freeze({
    mode,
    allowDom: true,
    allowAppServer: mode !== "dom",
    requireAppServer: mode === "app-server",
    fallbackToDom: mode === "auto",
  });
}

function extractThreadId(value) {
  const raw = String(value || "");
  const uuid = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return uuid?.[0] || (raw.startsWith("client-new-thread:") ? raw : null);
}

function eventThreadId(message) {
  const params = message?.params || {};
  return extractThreadId(
    params.threadId
      || params.conversationId
      || params.turn?.threadId
      || params.item?.threadId
      || params.item?.conversationId,
  );
}

function mapItemType(itemType, item = {}) {
  const type = String(itemType || "");
  if (type === "commandExecution") {
    const command = String(item.command || item.commandLine || item.input || "");
    return /(?:^|[\\/ ])(?:cat|type|Get-Content|rg|findstr|Select-String)\b/i.test(command)
      ? "fileRead"
      : "commandExecution";
  }
  if (["fileRead", "fileChange", "mcpToolCall", "webSearch", "plan", "reasoning"].includes(type)) return type;
  return null;
}

/**
 * Resolve the selected sidebar row before consulting visible activity.
 * A row without its running marker is never revived by stale task activity.
 */
export function resolveSelectedThread(uiProbe, knownThreadIds = new Set()) {
  const probe = uiProbe && typeof uiProbe === "object" ? uiProbe : {};
  const details = Array.isArray(probe.details) ? probe.details : [];
  const selected = details[0] || null;
  const selectedRaw = String(selected?.id || "");
  const uuid = selectedRaw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const selectedId = uuid?.[0] || (selectedRaw.startsWith("client-new-thread:") ? selectedRaw : null);
  const candidates = Array.isArray(probe.ids) ? probe.ids : [];
  const candidateId = candidates.find((id) => knownThreadIds.has(id)) || null;
  return Object.freeze({
    threadId: selectedId || candidateId,
    running: selected?.running === true,
    title: String(selected?.title || ""),
  });
}

export function domActivityToPetState(activitySignal) {
  if (activitySignal === "waitingOnApproval") return "waitingOnApproval";
  if (activitySignal === "waitingOnUserInput") return "waitingOnUserInput";
  if (activitySignal === "active") return "reasoning";
  return null;
}

export function appServerFlagsToPetState(flags) {
  const activeFlags = Array.isArray(flags) ? flags.map(String) : [];
  const known = [
    "waitingOnApproval",
    "waitingOnUserInput",
    "commandExecution",
    "fileRead",
    "fileChange",
    "mcpToolCall",
    "webSearch",
    "plan",
    "reasoning",
  ];
  return known.find((state) => activeFlags.includes(state)) || null;
}

/** Normalize one app-server notification without owning its transport. */
export function appServerEventToPetState(message, currentThreadId = null) {
  const method = String(message?.method || "");
  const params = message?.params || {};
  const threadId = eventThreadId(message);
  if (currentThreadId && threadId && threadId !== currentThreadId) return null;

  if ([
    "item/commandExecution/requestApproval",
    "item/permissions/requestApproval",
    "item/fileChange/requestApproval",
    "execCommandApproval",
    "applyPatchApproval",
  ].includes(method)) {
    return { state: "waitingOnApproval", threadId, terminal: false };
  }

  if (method === "thread/status/changed") {
    const flagged = appServerFlagsToPetState(params.status?.activeFlags);
    if (flagged) return { state: flagged, threadId, terminal: false };
    if (params.status?.type === "active") return { state: "reasoning", threadId, terminal: false };
    if (params.status?.type === "systemError") return { state: "failed", threadId, terminal: true };
    return null;
  }

  if (method === "turn/started") return { state: "reasoning", threadId, terminal: false };
  if (method === "turn/completed" || method === "task_complete" || method === "task/completed") {
    const status = String(params.turn?.status || params.status || "completed").toLowerCase();
    if (status === "failed" || status === "error") return { state: "failed", threadId, terminal: true };
    if (status === "interrupted" || status === "aborted" || status === "cancelled") return { state: "aborted", threadId, terminal: true };
    return { state: "completed", threadId, terminal: true };
  }

  if (method === "item/started") {
    const state = mapItemType(params.item?.type, params.item);
    return state ? { state, threadId, terminal: false } : null;
  }
  if (method === "item/completed") return { state: "think", threadId, terminal: false };
  if (method === "reasoning/text/delta" || method === "reasoning/summaryTextDelta") {
    return { state: "reasoning", threadId, terminal: false };
  }
  if ([
    "item/agentMessage/delta",
    "item/commandExecution/outputDelta",
    "item/fileChange/outputDelta",
    "item/plan/delta",
  ].includes(method)) {
    return { state: "think", threadId, terminal: false };
  }
  return null;
}

function latestAppServerState({ appServerState, appServerFlags, appServerEvents, threadId }) {
  if (appServerState) return { state: String(appServerState), threadId, terminal: false };
  const flagged = appServerFlagsToPetState(appServerFlags);
  if (flagged) return { state: flagged, threadId, terminal: false };
  const events = Array.isArray(appServerEvents) ? appServerEvents : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const mapped = appServerEventToPetState(events[index], threadId);
    if (mapped) return mapped;
  }
  return null;
}

export function selectPetState({
  uiProbe,
  knownThreadIds,
  domActivity,
  appServerState,
  appServerFlags,
  appServerEvents,
  stateSource = "auto",
} = {}) {
  const selected = resolveSelectedThread(uiProbe, knownThreadIds);
  const policy = createStateSourcePolicy(stateSource);
  if (!selected.threadId || !selected.running) {
    return Object.freeze({ threadId: selected.threadId, state: "idle", source: "sidebar-gate" });
  }

  const domState = policy.allowDom ? domActivityToPetState(domActivity) : null;
  // A visible approval/input card is a stronger UI fact than generic
  // reasoning, so never hide it behind an app-server refinement.
  if (domState === "waitingOnApproval" || domState === "waitingOnUserInput") {
    return Object.freeze({ threadId: selected.threadId, state: domState, source: "dom" });
  }

  const server = policy.allowAppServer
    ? latestAppServerState({ appServerState, appServerFlags, appServerEvents, threadId: selected.threadId })
    : null;
  if (server) return Object.freeze({ threadId: selected.threadId, state: server.state, source: "app-server" });
  if (domState) return Object.freeze({ threadId: selected.threadId, state: domState, source: "dom" });
  return Object.freeze({
    threadId: selected.threadId,
    state: "reasoning",
    source: policy.requireAppServer ? "app-server-fallback" : "dom",
  });
}
