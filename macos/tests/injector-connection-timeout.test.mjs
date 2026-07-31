import assert from "node:assert/strict";
import { connectCodexTargets } from "../scripts/injector.mjs";

const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;

class NeverOpeningWebSocket {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close() {}
}

globalThis.fetch = async () => ({
  ok: true,
  async json() {
    return [{
      type: "page",
      id: "current-main",
      url: "app://-/index.html",
      webSocketDebuggerUrl: "ws://127.0.0.1:9341/devtools/page/current-main",
    }];
  },
});
globalThis.WebSocket = NeverOpeningWebSocket;

try {
  const startedAt = Date.now();
  await assert.rejects(
    connectCodexTargets(9341, 80),
    /No verified ChatGPT renderer/,
  );
  const elapsed = Date.now() - startedAt;
  assert.ok(
    elapsed < 500,
    `The 80ms discovery budget must cap the full target connection attempt (elapsed ${elapsed}ms).`,
  );
} finally {
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
}

console.log("PASS: renderer discovery honors its global timeout budget.");
