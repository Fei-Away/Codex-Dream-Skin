/**
 * Platform-neutral state policy for optional Codex pet integrations.
 *
 * This module deliberately does not open CDP or spawn app-server.  Callers
 * provide DOM and app-server snapshots, which keeps the core skin injector
 * independent from optional pet integrations.
 */

export const STATE_SOURCE_MODES = Object.freeze(["auto", "dom", "app-server"]);

export function normalizeStateSource(value) {
  const normalized = String(value || "auto").trim().toLowerCase();
  return STATE_SOURCE_MODES.includes(normalized) ? normalized : "auto";
}

export function createStateSourcePolicy(value = "auto") {
  const mode = normalizeStateSource(value);
  return Object.freeze({
    mode,
    allowDom: true,
    allowAppServer: mode !== "dom",
    requireAppServer: mode === "app-server",
    fallbackToDom: mode === "auto",
  });
}

/**
 * Resolve the selected sidebar row before consulting detailed task state.
 * A row without its running marker is never revived by stale app-server data.
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
  const activeFlags = Array.isArray(flags) ? flags : [];
  if (activeFlags.includes("waitingOnApproval")) return "waitingOnApproval";
  if (activeFlags.includes("waitingOnUserInput")) return "waitingOnUserInput";
  return null;
}

export function selectPetState({ policy = createStateSourcePolicy(), uiProbe, knownThreadIds, domActivity, appServerFlags } = {}) {
  const selected = resolveSelectedThread(uiProbe, knownThreadIds);
  if (!selected.threadId || !selected.running) {
    return Object.freeze({ threadId: selected.threadId, state: "idle", source: "sidebar-gate" });
  }

  const domState = domActivityToPetState(domActivity);
  const appServerState = appServerFlagsToPetState(appServerFlags);
  if (policy.allowAppServer && appServerState) {
    return Object.freeze({ threadId: selected.threadId, state: appServerState, source: "app-server" });
  }
  if (domState) {
    return Object.freeze({ threadId: selected.threadId, state: domState, source: "dom" });
  }
  if (policy.requireAppServer) {
    return Object.freeze({ threadId: selected.threadId, state: "idle", source: "app-server-unavailable" });
  }
  return Object.freeze({ threadId: selected.threadId, state: "reasoning", source: "dom-fallback" });
}
