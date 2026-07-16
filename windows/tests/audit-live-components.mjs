#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_PORT = 9347;
const DEFAULT_TIMEOUT_MS = 10000;

const SCENARIOS = {
  "task-output": {
    description: "Task conversation with the floating thread summary/output panel open.",
    preconditions: [
      {
        key: "native-sidebar",
        component: "01",
        expected: 1,
        selector: "aside.app-shell-left-panel"
      },
      {
        key: "native-composer",
        component: "02",
        expected: 1,
        selector: ".composer-surface-chrome"
      },
      {
        key: "native-output-panel",
        component: "11",
        expected: 1,
        selector: '[data-pip-obstacle="thread-summary-panel"]'
      },
      {
        key: "native-sidebar-separator",
        component: "01",
        expected: 1,
        selector: 'aside.app-shell-left-panel [role="separator"]'
      }
    ],
    contracts: [
      {
        key: "sidebar-is-component-01",
        component: "01",
        expected: 1,
        selector: 'aside.app-shell-left-panel[data-miku-component~="01"]',
        sampleSelector: "aside.app-shell-left-panel"
      },
      {
        key: "composer-is-component-02",
        component: "02",
        expected: 1,
        selector: '.composer-surface-chrome[data-miku-component~="02"]',
        sampleSelector: ".composer-surface-chrome"
      },
      {
        key: "output-panel-is-component-11",
        component: "11",
        expected: 1,
        selector: '[data-pip-obstacle="thread-summary-panel"]:is([data-miku-component~="11"], :has([data-miku-component~="11"]))',
        sampleSelector: '[data-pip-obstacle="thread-summary-panel"]'
      },
      {
        key: "sidebar-separator-is-not-component-10",
        component: "10",
        expected: 0,
        selector: 'aside.app-shell-left-panel [role="separator"][data-miku-component~="10"]',
        sampleSelector: 'aside.app-shell-left-panel [role="separator"]'
      }
    ]
  },
  "home": {
    description: "New-task home with the native suggestions and primary composer visible.",
    preconditions: [
      {
        key: "native-home-root",
        component: "03",
        minimum: 1,
        selector: '[role="main"]:has([data-testid="home-icon"])'
      },
      {
        key: "native-home-composer",
        component: "02",
        minimum: 1,
        selector: "main .composer-surface-chrome"
      },
      {
        key: "four-visible-native-suggestion-cards",
        component: "03",
        expected: 4,
        visibleOnly: true,
        selector: '[role="main"]:has([data-testid="home-icon"]) [class~="group/home-suggestions"] button'
      }
    ],
    contracts: [
      {
        key: "home-route-is-component-03",
        component: "03",
        minimum: 1,
        selector: '[role="main"].miku-home[data-miku-component~="03"]:has([data-testid="home-icon"])',
        sampleSelector: '[role="main"]:has([data-testid="home-icon"])'
      },
      {
        key: "home-primary-composer-is-component-02",
        component: "02",
        minimum: 1,
        selector: 'main .composer-surface-chrome[data-miku-component~="02"]',
        sampleSelector: "main .composer-surface-chrome"
      }
    ]
  },
  "diff": {
    description: "Right-side Diff tab with its single native tabpanel root visible.",
    preconditions: [
      {
        key: "native-diff-tabpanel",
        component: "04",
        expected: 1,
        selector: '[role="tabpanel"][data-app-shell-tab-panel-controller="right"][data-tab-id="diff"]'
      }
    ],
    contracts: [
      {
        key: "diff-surface-is-component-04",
        component: "04",
        expected: 1,
        selector: '[role="tabpanel"][data-app-shell-tab-panel-controller="right"][data-tab-id="diff"].miku-diff-surface[data-miku-component~="04"]',
        sampleSelector: '[role="tabpanel"][data-app-shell-tab-panel-controller="right"][data-tab-id="diff"]'
      },
      {
        key: "diff-has-only-one-component-04-surface-owner",
        component: "04",
        expected: 1,
        selector: '.miku-diff-surface[data-miku-component~="04"]',
        sampleSelector: '[role="tabpanel"][data-app-shell-tab-panel-controller="right"][data-tab-id="diff"]'
      },
      {
        key: "diff-sidebar-separator-is-not-component-10",
        component: "10",
        expected: 0,
        selector: 'aside.app-shell-left-panel [role="separator"][data-miku-component~="10"]',
        sampleSelector: 'aside.app-shell-left-panel [role="separator"]'
      }
    ]
  },
  "settings-general": {
    description: "Settings General route with the native settings sidebar search visible.",
    preconditions: [
      {
        key: "native-settings-sidebar-search",
        component: "05",
        minimum: 1,
        selector: 'aside.app-shell-left-panel [role="searchbox"]'
      },
      {
        key: "native-settings-card",
        component: "05",
        minimum: 1,
        selector: "section > .overflow-hidden.rounded-2xl.border, section > div > .overflow-hidden.rounded-2xl.border"
      }
    ],
    contracts: [
      {
        key: "settings-route-is-component-05",
        component: "05",
        minimum: 1,
        selector: 'main.miku-settings-shell[data-miku-component~="05"]',
        sampleSelector: "main.main-surface, main"
      },
      {
        key: "settings-card-is-component-05",
        component: "05",
        minimum: 1,
        selector: 'section > .overflow-hidden.rounded-2xl.border.miku-settings-card[data-miku-component~="05"], section > div > .overflow-hidden.rounded-2xl.border.miku-settings-card[data-miku-component~="05"]',
        sampleSelector: "section > .overflow-hidden.rounded-2xl.border, section > div > .overflow-hidden.rounded-2xl.border"
      }
    ]
  },
  "plugins": {
    description: "Plugins marketplace route with its native search input visible.",
    preconditions: [
      {
        key: "native-plugins-search",
        component: "06",
        minimum: 1,
        selector: "#plugins-page-search"
      }
    ],
    contracts: [
      {
        key: "plugins-route-is-component-06",
        component: "06",
        minimum: 1,
        selector: 'main.miku-plugins-page[data-miku-component~="06"]',
        sampleSelector: "main:has(#plugins-page-search)"
      }
    ]
  },
  "scheduled": {
    description: "Scheduled tasks route with its native search input visible.",
    preconditions: [
      {
        key: "native-scheduled-search",
        component: "07",
        minimum: 1,
        selector: "#scheduled-page-search"
      }
    ],
    contracts: [
      {
        key: "scheduled-route-is-component-07",
        component: "07",
        minimum: 1,
        selector: 'main.miku-scheduled-page[data-miku-component~="07"]',
        sampleSelector: "main:has(#scheduled-page-search)"
      }
    ]
  },
  "terminal": {
    description: "Terminal scene with a native xterm surface and the shell sidebar resize separator visible.",
    preconditions: [
      {
        key: "native-xterm-surface",
        component: "10",
        minimum: 1,
        selector: ".xterm"
      },
      {
        key: "native-sidebar-resize-separator",
        component: "01",
        minimum: 1,
        selector: 'aside.app-shell-left-panel [role="separator"]'
      }
    ],
    contracts: [
      {
        key: "terminal-surface-or-host-is-component-10",
        component: "10",
        minimum: 1,
        selector: '.xterm[data-miku-component~="10"], [data-miku-component~="10"]:has(.xterm)',
        sampleSelector: ".xterm"
      },
      {
        key: "terminal-sidebar-separator-is-not-component-10",
        component: "10",
        expected: 0,
        selector: 'aside.app-shell-left-panel [role="separator"][data-miku-component~="10"]',
        sampleSelector: 'aside.app-shell-left-panel [role="separator"]'
      }
    ]
  },
  "popover": {
    description: "Profile popover with its single native menu open.",
    preconditions: [
      {
        key: "native-profile-menu",
        component: "09",
        expected: 1,
        selector: '[role="menu"]'
      }
    ],
    contracts: [
      {
        key: "profile-menu-is-component-09",
        component: "09",
        expected: 1,
        selector: '[role="menu"].miku-popover[data-miku-component~="09"]',
        sampleSelector: '[role="menu"]'
      },
      {
        key: "popover-sidebar-separator-is-not-component-10",
        component: "10",
        expected: 0,
        selector: 'aside.app-shell-left-panel [role="separator"][data-miku-component~="10"]',
        sampleSelector: 'aside.app-shell-left-panel [role="separator"]'
      }
    ]
  },
  "quick-chat": {
    description: "Quick Chat overlay on the primary Codex renderer.",
    preconditions: [
      {
        key: "native-quick-chat-obstacle",
        component: "08",
        minimum: 1,
        selector: '[data-pip-obstacle="quick-chat"]'
      }
    ],
    contracts: [
      {
        key: "quick-chat-route-is-component-08",
        component: "08",
        minimum: 1,
        selector: '[data-pip-obstacle="quick-chat"].miku-quick-chat[data-miku-component~="08"]',
        sampleSelector: '[data-pip-obstacle="quick-chat"]'
      },
      {
        key: "non-quick-chat-dialog-is-not-component-08",
        component: "08",
        expected: 0,
        selector: '[role="dialog"]:not([data-pip-obstacle="quick-chat"])[data-miku-component~="08"]',
        sampleSelector: '[role="dialog"]:not([data-pip-obstacle="quick-chat"])'
      },
      {
        key: "quick-chat-resize-separator-is-not-component-10",
        component: "10",
        expected: 0,
        selector: '[data-pip-obstacle="quick-chat"] [role="separator"][data-miku-component~="10"]',
        sampleSelector: '[data-pip-obstacle="quick-chat"] [role="separator"]'
      },
      {
        key: "quick-chat-composer-is-component-08",
        component: "08",
        minimum: 1,
        selector: '[data-pip-obstacle="quick-chat"] .composer-surface-chrome[data-miku-component~="08"]',
        sampleSelector: '[data-pip-obstacle="quick-chat"] .composer-surface-chrome'
      },
      {
        key: "quick-chat-composer-is-not-component-02",
        component: "02",
        expected: 0,
        selector: '[data-pip-obstacle="quick-chat"] .composer-surface-chrome[data-miku-component~="02"]',
        sampleSelector: '[data-pip-obstacle="quick-chat"] .composer-surface-chrome'
      }
    ]
  },
  "profile": {
    description: "Profile analytics route with its native usage heatmap visible.",
    preconditions: [
      {
        key: "native-profile-usage-heatmap",
        component: "12",
        minimum: 1,
        selector: '[role="img"][class*="--profile-usage-level"]'
      }
    ],
    contracts: [
      {
        key: "profile-usage-heatmap-is-component-12",
        component: "12",
        minimum: 1,
        selector: '[role="img"][class*="--profile-usage-level"][data-miku-component~="12"]',
        sampleSelector: '[role="img"][class*="--profile-usage-level"]'
      },
      {
        key: "profile-route-is-component-12",
        component: "12",
        minimum: 1,
        selector: 'main.miku-profile-page[data-miku-component~="12"]',
        sampleSelector: 'main:has([role="img"][class*="--profile-usage-level"])'
      }
    ]
  },
  "appearance": {
    description: "Appearance route with its native theme input and state controls visible.",
    preconditions: [
      {
        key: "native-appearance-theme-input",
        component: "13",
        minimum: 1,
        selector: 'input[name="appearance-theme"]'
      }
    ],
    contracts: [
      {
        key: "appearance-route-is-component-13",
        component: "13",
        minimum: 1,
        selector: 'main:has(input[name="appearance-theme"]).miku-appearance-page[data-miku-component~="13"]',
        sampleSelector: 'main:has(input[name="appearance-theme"])'
      },
      {
        key: "appearance-state-controls-include-component-14",
        component: "14",
        minimum: 1,
        selector: 'main:has(input[name="appearance-theme"]) [data-miku-component~="14"]',
        sampleSelector: 'main:has(input[name="appearance-theme"]) [role="switch"], main:has(input[name="appearance-theme"]) [role="tab"], main:has(input[name="appearance-theme"]) [role="checkbox"]'
      }
    ]
  },
  "pets": {
    description: "Pets route with the native pet-size control visible.",
    preconditions: [
      {
        key: "native-pet-size-control",
        component: "13",
        minimum: 1,
        selector: "#pet-size"
      }
    ],
    contracts: [
      {
        key: "pets-route-is-component-13",
        component: "13",
        minimum: 1,
        selector: 'main:has(#pet-size).miku-pets-page[data-miku-component~="13"]',
        sampleSelector: "main:has(#pet-size)"
      }
    ]
  }
};

function usage() {
  return [
    "Usage: node windows/tests/audit-live-components.mjs [options]",
    "",
    "Options:",
    `  --port <port>             CDP loopback port (default: ${DEFAULT_PORT})`,
    "  --scenario <name>         Live contract scenario (default: task-output)",
    `  --timeout-ms <ms>         Discovery/evaluation timeout (default: ${DEFAULT_TIMEOUT_MS})`,
    "  --screenshot <path.png>   Save the current scene without sending input or navigation events",
    "  --list-scenarios          Print available scenario names",
    "  --help                    Print this help",
    "",
    "The audit is read-only: it uses /json/list, Runtime.evaluate, and optional Page.captureScreenshot."
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    scenario: "task-output",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    screenshot: null,
    help: false,
    listScenarios: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--scenario") options.scenario = String(argv[++index] || "");
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else if (arg === "--screenshot") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) {
        throw new Error("--screenshot requires a PNG output path.");
      }
      options.screenshot = path.resolve(value);
    }
    else if (arg === "--list-scenarios") options.listScenarios = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 120000) {
    throw new Error(`Invalid timeout: ${options.timeoutMs}`);
  }
  if (options.screenshot && path.extname(options.screenshot).toLowerCase() !== ".png") {
    throw new Error(`Screenshot path must end in .png: ${options.screenshot}`);
  }
  if (!SCENARIOS[options.scenario]) {
    throw new Error(`Unknown scenario: ${options.scenario}`);
  }
  return options;
}

async function discoverTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const targets = await response.json();
      const target = targets.find((item) => (
        item?.type === "page" &&
        typeof item.url === "string" &&
        item.url.startsWith("app://") &&
        !item.url.includes("initialRoute=%2Fchatgpt%2Fquick-chat-prewarm") &&
        typeof item.webSocketDebuggerUrl === "string" &&
        item.webSocketDebuggerUrl.startsWith(`ws://127.0.0.1:${port}/`)
      ));
      if (target) return target;
      lastError = new Error("No app:// page target in /json/list");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `No Codex renderer target on 127.0.0.1:${port}: ${lastError?.message || "timed out"}`
  );
}

class CdpSession {
  constructor(target, timeoutMs) {
    this.target = target;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async open() {
    if (typeof WebSocket !== "function") {
      throw new Error("This live audit requires a Node.js runtime with global WebSocket support.");
    }
    this.socket = new WebSocket(this.target.webSocketDebuggerUrl);
    this.socket.addEventListener("message", (event) => this.onMessage(event));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP WebSocket open timed out")), this.timeoutMs);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP WebSocket open failed"));
      }, { once: true });
    });
    return this;
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
    else pending.resolve(message.result);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false
    });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return response.result?.value;
  }

  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("CDP session closed"));
    }
    this.pending.clear();
    this.socket?.close();
  }
}

function buildAuditExpression(scenario) {
  const payload = JSON.stringify({
    preconditions: scenario.preconditions,
    contracts: scenario.contracts
  });

  return `(() => {
    const groups = ${payload};
    const describe = (node) => {
      if (!node) return null;
      return {
        tag: node.tagName,
        id: node.id || null,
        role: node.getAttribute("role"),
        testid: node.getAttribute("data-testid"),
        pipObstacle: node.getAttribute("data-pip-obstacle"),
        mikuComponent: node.getAttribute("data-miku-component"),
        ariaExpanded: node.getAttribute("aria-expanded"),
        className: typeof node.className === "string" ? node.className.slice(0, 320) : null,
        parent: node.parentElement ? {
          tag: node.parentElement.tagName,
          role: node.parentElement.getAttribute("role"),
          pipObstacle: node.parentElement.getAttribute("data-pip-obstacle"),
          mikuComponent: node.parentElement.getAttribute("data-miku-component"),
          className: typeof node.parentElement.className === "string"
            ? node.parentElement.className.slice(0, 220)
            : null
        } : null
      };
    };
    const inspect = (contract) => {
      let nodes;
      let selectorError = null;
      try {
        nodes = [...document.querySelectorAll(contract.selector)];
        if (contract.visibleOnly) {
          nodes = nodes.filter((node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return !node.hidden &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number(style.opacity || "1") > 0 &&
              rect.width > 0 &&
              rect.height > 0 &&
              node.getClientRects().length > 0;
          });
        }
      } catch (error) {
        nodes = [];
        selectorError = error.message;
      }
      let candidate = nodes[0] || null;
      if (!candidate && contract.sampleSelector) {
        try { candidate = document.querySelector(contract.sampleSelector); } catch {}
      }
      const matched = nodes.length;
      const usesMinimum = Number.isInteger(contract.minimum);
      const threshold = usesMinimum ? contract.minimum : contract.expected;
      return {
        key: contract.key,
        component: contract.component,
        expected: threshold,
        minimum: usesMinimum ? contract.minimum : null,
        matchMode: usesMinimum ? "minimum" : "exact",
        visibleOnly: Boolean(contract.visibleOnly),
        matched,
        selector: contract.selector,
        sample: describe(candidate),
        missing: Math.max(0, threshold - matched),
        unexpected: usesMinimum ? 0 : Math.max(0, matched - contract.expected),
        selectorError,
        pass: !selectorError && (usesMinimum ? matched >= contract.minimum : matched === contract.expected)
      };
    };
    return {
      rootSkinned: document.documentElement.classList.contains("codex-miku-skin"),
      manifestComponentCount: window.__CODEX_MIKU_SKIN_STATE__?.manifest?.components?.length ?? null,
      preconditions: groups.preconditions.map(inspect),
      contracts: groups.contracts.map(inspect)
    };
  })()`;
}

function summarize(options, target, scenario, result) {
  const preconditionFailures = result.preconditions.filter((item) => !item.pass);
  const contractFailures = result.contracts.filter((item) => !item.pass);
  const missing = result.contracts
    .filter((item) => item.missing > 0)
    .map((item) => item.key);
  const unexpected = result.contracts
    .filter((item) => item.unexpected > 0)
    .map((item) => item.key);
  const passingContracts = result.contracts.length - contractFailures.length;
  const pass = result.rootSkinned && preconditionFailures.length === 0 && contractFailures.length === 0;

  return {
    test: "miku-live-selector-contract",
    scenario: options.scenario,
    description: scenario.description,
    port: options.port,
    target: {
      targetId: target.id,
      renderer: "app://"
    },
    rootSkinned: result.rootSkinned,
    manifestComponentCount: result.manifestComponentCount,
    expected: {
      preconditions: result.preconditions.length,
      contracts: result.contracts.length
    },
    matched: {
      preconditions: result.preconditions.length - preconditionFailures.length,
      contracts: passingContracts
    },
    selector: Object.fromEntries(result.contracts.map((item) => [item.key, item.selector])),
    sample: Object.fromEntries(result.contracts.map((item) => [item.key, item.sample])),
    missing,
    unexpected,
    preconditions: result.preconditions,
    contracts: result.contracts,
    pass
  };
}

async function captureCurrentScene(session, outputPath) {
  const response = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });
  if (typeof response?.data !== "string" || response.data.length === 0) {
    throw new Error("Page.captureScreenshot returned no PNG data.");
  }
  const png = Buffer.from(response.data, "base64");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, png);
  return { path: outputPath, bytes: png.length };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.listScenarios) {
    console.log(Object.keys(SCENARIOS).join("\n"));
    return;
  }

  const scenario = SCENARIOS[options.scenario];
  const target = await discoverTarget(options.port, options.timeoutMs);
  const session = await new CdpSession(target, options.timeoutMs).open();
  try {
    const result = await session.evaluate(buildAuditExpression(scenario));
    const report = summarize(options, target, scenario, result);
    report.screenshot = options.screenshot
      ? await captureCurrentScene(session, options.screenshot)
      : null;
    console.log(JSON.stringify(report, null, 2));
    if (!report.pass) process.exitCode = 2;
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(`[miku-live-contract] ${error.message}`);
  process.exitCode = 1;
});
