/**
 * Platform-neutral DOM state contract for optional Codex pet integrations.
 *
 * This module deliberately does not open CDP or spawn another process.  The
 * caller provides a DOM snapshot, which keeps the core skin injector
 * independent from optional pet integrations.
 */

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

export function selectPetState({ uiProbe, knownThreadIds, domActivity } = {}) {
  const selected = resolveSelectedThread(uiProbe, knownThreadIds);
  if (!selected.threadId || !selected.running) {
    return Object.freeze({ threadId: selected.threadId, state: "idle", source: "sidebar-gate" });
  }

  const domState = domActivityToPetState(domActivity);
  if (domState) {
    return Object.freeze({ threadId: selected.threadId, state: domState, source: "dom" });
  }
  return Object.freeze({ threadId: selected.threadId, state: "reasoning", source: "dom" });
}
