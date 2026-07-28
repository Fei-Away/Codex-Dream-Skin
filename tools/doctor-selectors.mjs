#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_WAIT_SECONDS = 30;
const CONTRACT_PATH = fileURLToPath(new URL("./selectors.json", import.meta.url));

export function scopesForState({ baseState, overlay }) {
  const scopes = new Set([baseState]);
  if (baseState !== "settings") scopes.add("all");
  if (overlay) scopes.add("overlay");
  return scopes;
}

export function selectorMatchesScope(scope, state) {
  const scopes = scopesForState(state);
  const tokens = String(scope || "all").toLowerCase().match(/[a-z]+/g) || ["all"];
  return tokens.some((token) => token !== "config" && scopes.has(token));
}

export function gradeDoctorResult(contract, pageResult) {
  const counts = new Map(pageResult.probes.map((probe) => [probe.key, probe]));
  const state = { baseState: pageResult.baseState, overlay: pageResult.overlay };
  const tiers = { L1: [], L2: [] };
  for (const selector of contract.selectors) {
    if (!selectorMatchesScope(selector.scope, state)) continue;
    const probe = counts.get(selector.key) || { count: 0, error: "not evaluated" };
    const configScoped = /(?:^|\s)config(?:\s|$)/i.test(selector.scope || "");
    const status = probe.error ? "error" : probe.count > 0 ? "ok" : configScoped ? "miss(config)" : "miss";
    if (tiers[selector.tier]) tiers[selector.tier].push({
      key: selector.key,
      status,
      count: probe.count || 0,
      required: Boolean(selector.required),
      error: probe.error || null,
    });
  }
  const pass = tiers.L1.every((probe) => !probe.required || probe.status === "ok");
  return {
    schema: "codex-dream-skin-selector-doctor/1",
    state: pageResult.overlay ? "overlay" : pageResult.baseState,
    baseState: pageResult.baseState,
    overlay: pageResult.overlay,
    appearance: pageResult.appearance,
    tiers,
    pass,
    exitCode: pass ? 0 : 1,
  };
}

export function formatDoctorResult(result) {
  const lines = [
    `state=${result.state} appearance=${result.appearance}` +
      (result.overlay ? ` base=${result.baseState}` : ""),
  ];
  for (const tier of ["L1", "L2"]) {
    const entries = result.tiers[tier];
    lines.push(`${tier} ${entries.length ? entries.map((entry) => `${entry.key}:${entry.status}`).join(" ") : "none"}`);
  }
  lines.push(`exit ${result.exitCode}`);
  return lines.join("\n");
}

function pageDoctor(selectors, stableTestids = []) {
  const byKey = new Map(selectors.map((probe) => [probe.key, probe]));
  const evaluated = new Map();
  const evaluate = function (probe) {
    if (evaluated.has(probe.key)) return evaluated.get(probe.key);
    let result;
    try {
      result = { key: probe.key, count: document.querySelectorAll(probe.selector).length };
    } catch (error) {
      result = { key: probe.key, count: 0, error: String((error && error.message) || error).slice(0, 160) };
    }
    evaluated.set(probe.key, result);
    return result;
  };
  const count = function (key) {
    const probe = byKey.get(key);
    return probe ? evaluate(probe).count : 0;
  };
  const stableTestidCount = function (testid) {
    if (!testid || !stableTestids.includes(testid)) return 0;
    const selector = `[data-testid="${testid}"]`;
    try { return document.querySelectorAll(selector).length; } catch { return 0; }
  };
  // These probes are the small state-classification set.  Once the base route
  // and overlay state are known, every remaining selector is evaluated only if
  // its declared scope is active.  This keeps doctor output useful on settings
  // pages and avoids turning optional home probes into a hidden global scan.
  const overlay = count("overlay-menu") > 0 || count("overlay-dialog") > 0 ||
    count("overlay-popper") > 0;
  let baseState = "thread";
  if (count("appearance-radio") > 0 || stableTestidCount("theme-preview") > 0) baseState = "settings";
  else if (count("home-icon") > 0 || count("home-route") > 0) baseState = "home";
  else if (count("shell-main") === 0) baseState = "settings";

  const activeScopes = new Set([baseState]);
  if (baseState !== "settings") activeScopes.add("all");
  if (overlay) activeScopes.add("overlay");
  const scopeActive = function (scope) {
    const tokens = String(scope || "all").toLowerCase().match(/[a-z]+/g) || ["all"];
    return tokens.some((token) => token !== "config" && activeScopes.has(token));
  };
  const probes = selectors.filter((probe) => scopeActive(probe.scope)).map(evaluate);

  const root = document.documentElement;
  let appearance = "light";
  if (root && root.classList.contains("electron-dark")) appearance = "dark";
  else if (root && root.classList.contains("electron-light")) appearance = "light";
  else {
    try { appearance = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch {}
  }
  return { baseState, overlay, appearance, probes };
}

function parseArgs(argv) {
  const options = { port: null, waitSeconds: DEFAULT_WAIT_SECONDS, json: false };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--wait") options.waitSeconds = Number(argv[++index]);
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node tools/doctor-selectors.mjs [--port N] [--wait seconds] [--json]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.port !== null && (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535)) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isFinite(options.waitSeconds) || options.waitSeconds < 0 || options.waitSeconds > 600) {
    throw new Error(`Invalid wait: ${options.waitSeconds}`);
  }
  return options;
}

async function fetchJson(port, pathname, timeoutMs = 900) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function stateFilePorts() {
  const files = [];
  if (process.platform === "darwin") {
    files.push(path.join(os.homedir(), "Library/Application Support/CodexDreamSkinStudio/state.json"));
  } else if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    files.push(path.join(process.env.LOCALAPPDATA, "CodexDreamSkin", "state.json"));
  }
  const ports = [];
  for (const file of files) {
    try {
      const data = JSON.parse(await fs.readFile(file, "utf8"));
      for (const key of ["port", "cdpPort", "debugPort"]) {
        const value = Number(data?.[key]);
        if (Number.isInteger(value) && value >= 1024 && value <= 65535) ports.push(value);
      }
    } catch {}
  }
  return ports;
}

async function candidatePorts(options) {
  const ports = [];
  if (options.port) ports.push(options.port);
  const envPort = Number(process.env.CODEX_DREAM_SKIN_PORT);
  if (Number.isInteger(envPort) && envPort >= 1024 && envPort <= 65535) ports.push(envPort);
  ports.push(...await stateFilePorts());
  for (let offset = 0; offset < 5; offset += 1) ports.push(9341 + offset);
  for (let offset = 0; offset < 5; offset += 1) ports.push(9335 + offset);
  ports.push(9222);
  return [...new Set(ports)];
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function discover(options) {
  const ports = await candidatePorts(options);
  const deadline = Date.now() + options.waitSeconds * 1000;
  do {
    for (const port of ports) {
      try {
        await fetchJson(port, "/json/version");
        const targets = await fetchJson(port, "/json/list", 2000);
        const target = (Array.isArray(targets) ? targets : []).find((item) => {
          if (item?.type !== "page" || !String(item.url || "").startsWith("app://")) return false;
          try {
            const url = new URL(item.webSocketDebuggerUrl);
            return url.protocol === "ws:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname) &&
              Number(url.port) === port && url.pathname.startsWith("/devtools/page/");
          } catch { return false; }
        });
        if (target) return { port, target };
      } catch {}
    }
    if (Date.now() >= deadline) break;
    await sleep(1200);
  } while (true);
  return null;
}

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.pending = new Map();
    this.nextId = 1;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP WebSocket connection timed out")), 6000);
      this.socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP WebSocket connection failed")); }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    return this;
  }

  send(method, params = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Page evaluation failed");
    return result.result?.value;
  }

  close() {
    try { this.socket.close(); } catch {}
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("CDP session closed"));
    }
    this.pending.clear();
  }
}

async function main() {
  if (typeof WebSocket !== "function") throw new Error(`Node.js 22+ is required (current ${process.version})`);
  const options = parseArgs(process.argv);
  const contract = JSON.parse(await fs.readFile(CONTRACT_PATH, "utf8"));
  const found = await discover(options);
  if (!found) throw new Error("No loopback Codex CDP page target was found");
  const session = await new CdpSession(found.target.webSocketDebuggerUrl).open();
  try {
    const pageResult = await session.evaluate(
      `(${pageDoctor.toString()})(${JSON.stringify(contract.selectors)}, ${JSON.stringify(contract.stableTestids || [])})`,
    );
    const result = gradeDoctorResult(contract, pageResult);
    result.port = found.port;
    if (options.json) console.log(JSON.stringify(result));
    else console.log(formatDoctorResult(result));
    process.exitCode = result.exitCode;
  } finally {
    session.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`error=${JSON.stringify(String(error.message || error))}`);
    console.error("exit 2");
    process.exitCode = 2;
  });
}
