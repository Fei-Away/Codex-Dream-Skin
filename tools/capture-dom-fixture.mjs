#!/usr/bin/env node
/**
 * Codex Dream Skin · DOM 结构快照工具（macOS / Windows 双端通用）
 * ================================================================
 * 从一个正在运行、带本机 CDP 调试端口的官方 Codex 桌面端导出
 * 「脱敏 DOM 结构快照」（fixture），用于：
 *   1. 对比 macOS / Windows 同版本 DOM 是否同源（结构 / data-testid / CSS Modules 类名）
 *   2. 离线回归：Codex 升级后在快照上批量验证皮肤选择器（doctor / CI）
 *
 * 用法（两端完全相同，需 Node >= 22）：
 *   node capture-dom-fixture.mjs                     # 单次快照：抓当前屏幕状态
 *   node capture-dom-fixture.mjs --watch             # 巡游模式：挂着脚本，你在 app 里点一圈，
 *                                                    #   每个新状态（路由/菜单/明暗…）自动抓一份，
 *                                                    #   Ctrl+C 结束并写盘
 *   node capture-dom-fixture.mjs --port 9341         # 指定端口
 *   node capture-dom-fixture.mjs --out fixture.json  # 指定输出文件
 *   node capture-dom-fixture.mjs --wait 45           # 等待 Codex 就绪的秒数（默认 30）
 *
 * 前提：Codex 需带 --remote-debugging-port 启动（Dream Skin 启动器默认如此；
 *       mac 默认端口 9341，Windows 默认 9335，被占用时会自动偏移，本脚本会扫描）。
 *
 * 隐私边界（脚本对页面只读，不写入任何内容）：
 *   - 不采集任何文本内容（仅记录「该节点是否含直接文本」的布尔值）
 *   - 属性值只保留结构类白名单（role / type / data-* / aria-* 等，且值 <= 80 字符）；
 *     其余属性（href / src / title / aria-label / placeholder / value / style …）只记属性名
 *   - URL 只保留协议与文件基名；窗口标题不采集
 *   - 皮肤自身注入的节点 / 类名 / 属性会被过滤，快照 ≈ 原生 DOM（皮肤开着也能抓）
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const TOOL_VERSION = "1.1.0";
const DEFAULT_WAIT_SECONDS = 30;
const MAX_TARGETS = 4;

const SELECTOR_CONTRACT_PATH = new URL("./selectors.json", import.meta.url);
const SELECTOR_CONTRACT = JSON.parse(await fs.readFile(SELECTOR_CONTRACT_PATH, "utf8"));
const PROBES = SELECTOR_CONTRACT.selectors.map(({ key, selector, tier, scope, required }) => ({
  key,
  selector,
  tier,
  scope,
  required,
}));

const CAPTURE_CFG = {
  maxNodes: 30000,
  maxDepth: 45,
  maxChildren: 300,
  maxClasses: 4000,
  maxTestids: 400,
};

/**
 * 页面侧采集函数。整体 toString() 后注入页面执行，因此必须完全自包含，
 * 不得引用本文件的任何外部变量。所有脱敏规则都集中在这里。
 */
function pageCapture(CFG, PROBE_LIST) {
  if (typeof document === "undefined" || !document || !document.documentElement ||
    document.readyState === "loading") {
    return { notReady: true, readyState: (typeof document !== "undefined" && document) ? document.readyState : "no-document" };
  }
  var stats = {
    nodes: 0,
    truncatedDepth: 0,
    truncatedChildren: 0,
    truncatedMax: 0,
    skinNodesSkipped: 0,
    skinClassesFiltered: 0,
  };
  var classSet = new Set();
  var testidSet = new Set();
  var roleSet = new Set();
  // Keep the fixture focused on the native renderer.  The shared runtime has
  // no business-node classes, but its constructable-sheet fallback and the
  // transient operation toast are still observable DOM nodes while a switch
  // is in flight.  Filter the complete owned namespace so a snapshot taken
  // during an operation cannot become a false selector baseline.
  var SKIN_NODE_ID = {
    "codex-dream-skin-style": true,
    "codex-dream-skin-chrome": true,
    "chatgpt-dream-skin-operation": true,
  };
  var SKIN_CLASS = /^(?:dream-|codex-dream-skin(?:-|$))/;
  var VALUE_OK = /^(?:role|type|dir|name|hidden|disabled|contenteditable|tabindex|data-[a-z0-9-]+|aria-(?:expanded|selected|checked|current|hidden|haspopup|modal|orientation|live|disabled|pressed))$/i;
  var VALUE_SENSITIVE = /name|title|label|value|content|url|href|path|text|user|email/i;

  function serialize(el, depth) {
    if (!el || !el.tagName) return null;
    if (stats.nodes >= CFG.maxNodes) {
      stats.truncatedMax += 1;
      return null;
    }
    if (el.id && SKIN_NODE_ID[el.id]) {
      stats.skinNodesSkipped += 1;
      return null;
    }
    stats.nodes += 1;
    var node = { t: el.tagName.toLowerCase() };
    if (el.id && el.id.length <= 64) node.i = el.id;
    var classes = [];
    for (var ci = 0; ci < el.classList.length; ci += 1) {
      var cls = el.classList[ci];
      if (SKIN_CLASS.test(cls)) {
        stats.skinClassesFiltered += 1;
        continue;
      }
      classes.push(cls);
      classSet.add(cls);
    }
    if (classes.length) node.c = classes.slice(0, 48);
    var attrs = null;
    var present = null;
    for (var ai = 0; ai < el.attributes.length; ai += 1) {
      var attr = el.attributes[ai];
      var name = attr.name;
      if (name === "class" || name === "id") continue;
      if (name.indexOf("data-dream") === 0) continue;
      var takeValue = VALUE_OK.test(name) && attr.value.length <= 80 &&
        !(name.indexOf("data-") === 0 && VALUE_SENSITIVE.test(name));
      if (takeValue) {
        (attrs = attrs || {})[name] = attr.value;
        if (name === "data-testid") testidSet.add(attr.value);
        if (name === "role") roleSet.add(attr.value);
      } else {
        (present = present || []).push(name);
      }
    }
    if (attrs) node.a = attrs;
    if (present) node.o = present.slice(0, 24);
    var child = el.firstChild;
    while (child) {
      if (child.nodeType === 3 && child.nodeValue && child.nodeValue.trim()) {
        node.x = 1;
        break;
      }
      child = child.nextSibling;
    }
    if (el.shadowRoot) node.sr = el.shadowRoot.childElementCount;
    var kids = el.children;
    if (kids.length) {
      if (depth >= CFG.maxDepth) {
        stats.truncatedDepth += 1;
        node.d = kids.length;
      } else {
        if (kids.length > CFG.maxChildren) {
          stats.truncatedChildren += 1;
          node.n = kids.length;
        }
        var out = [];
        var limit = Math.min(kids.length, CFG.maxChildren);
        for (var ki = 0; ki < limit; ki += 1) {
          var serialized = serialize(kids[ki], depth + 1);
          if (serialized) out.push(serialized);
          if (stats.nodes >= CFG.maxNodes) break;
        }
        if (out.length) node.k = out;
      }
    }
    return node;
  }

  var tree = serialize(document.documentElement, 0);

  var modules = {};
  classSet.forEach(function (cls) {
    var match = /^_([A-Za-z][A-Za-z0-9-]*?)_([a-z0-9]{3,12})(?:_\d+)?$/.exec(cls);
    if (match) (modules[match[1]] = modules[match[1]] || []).push(match[2]);
  });
  Object.keys(modules).forEach(function (name) {
    modules[name] = Array.from(new Set(modules[name])).sort();
  });

  var probes = PROBE_LIST.map(function (probe) {
    try {
      var found = document.querySelectorAll(probe.selector);
      var entry = { key: probe.key, tier: probe.tier, selector: probe.selector, count: found.length };
      if (found.length) {
        var first = found[0];
        var sampleClasses = [];
        for (var i = 0; i < first.classList.length && sampleClasses.length < 3; i += 1) {
          if (!SKIN_CLASS.test(first.classList[i])) sampleClasses.push(first.classList[i]);
        }
        entry.sample = { t: first.tagName.toLowerCase(), c: sampleClasses };
        var sampleTestid = first.getAttribute("data-testid");
        if (sampleTestid) entry.sample.testid = sampleTestid;
      }
      return entry;
    } catch (error) {
      return {
        key: probe.key,
        tier: probe.tier,
        selector: probe.selector,
        error: String((error && error.message) || error).slice(0, 120),
      };
    }
  });

  var features = {
    hasSelector: (function () {
      try { return CSS.supports("selector(:has(*))"); } catch (error) { return false; }
    })(),
    adoptedStyleSheets: "adoptedStyleSheets" in document,
    constructableStyleSheet: (function () {
      try { return Boolean(new CSSStyleSheet()); } catch (error) { return false; }
    })(),
    navigationApi: typeof navigation !== "undefined" && Boolean(navigation) &&
      typeof navigation.addEventListener === "function",
    registerProperty: typeof CSS !== "undefined" && typeof CSS.registerProperty === "function",
  };

  function nativeClasses(el) {
    var out = [];
    if (!el) return out;
    for (var i = 0; i < el.classList.length; i += 1) {
      if (!SKIN_CLASS.test(el.classList[i])) out.push(el.classList[i]);
    }
    return out;
  }
  function themeAttrs(el) {
    var out = {};
    if (!el) return out;
    ["data-theme", "data-appearance", "data-color-mode"].forEach(function (name) {
      var value = el.getAttribute(name);
      if (value) out[name] = String(value).slice(0, 40);
    });
    return out;
  }

  var root = document.documentElement;
  var skinState = window.__CODEX_DREAM_SKIN_STATE__;
  var pathname = "";
  try { pathname = location.pathname.split("/").pop() || ""; } catch (error) {}
  var route = "";
  try { route = location.hash ? location.hash.split("?")[0].slice(0, 64) : ""; } catch (error) {}

  var classes = Array.from(classSet).sort();
  var classesTruncated = classes.length > CFG.maxClasses;
  if (classesTruncated) classes = classes.slice(0, CFG.maxClasses);

  return {
    meta: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      screen: { width: (screen && screen.width) || 0, height: (screen && screen.height) || 0 },
      urlProtocol: location.protocol,
      urlFile: pathname.slice(0, 80),
      route: route,
    },
    skin: {
      active: Boolean(skinState),
      disabled: window.__CODEX_DREAM_SKIN_DISABLED__ === true,
      version: (skinState && skinState.version) || null,
      themeId: (skinState && skinState.themeId) || null,
      revision: (skinState && skinState.revision) || null,
    },
    appearance: {
      rootClasses: nativeClasses(root),
      bodyClasses: nativeClasses(document.body),
      rootThemeAttrs: themeAttrs(root),
      bodyThemeAttrs: themeAttrs(document.body),
      computedColorScheme: (function () {
        try { return getComputedStyle(root).colorScheme || ""; } catch (error) { return ""; }
      })(),
      prefersDark: (function () {
        try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (error) { return null; }
      })(),
    },
    features: features,
    summaries: {
      uniqueClassCount: classSet.size,
      classes: classes,
      classesTruncated: classesTruncated,
      modules: modules,
      testids: Array.from(testidSet).sort().slice(0, CFG.maxTestids),
      roles: Array.from(roleSet).sort(),
    },
    probes: probes,
    stats: stats,
    tree: tree,
  };
}

/** 页面侧轻量签名：探针命中位 + 路由 + 根类名。签名变化 = 出现新状态。同样自包含。 */
function pageSignature(PROBE_LIST) {
  if (typeof document === "undefined" || !document || !document.documentElement) return { notReady: true };
  var bits = [];
  for (var i = 0; i < PROBE_LIST.length; i += 1) {
    try {
      bits.push(document.querySelectorAll(PROBE_LIST[i].selector).length ? 1 : 0);
    } catch (error) {
      bits.push(8);
    }
  }
  var route = "";
  try { route = location.hash ? location.hash.split("?")[0].slice(0, 64) : ""; } catch (error) {}
  var rootClasses = "";
  try {
    rootClasses = Array.prototype.filter.call(document.documentElement.classList, function (cls) {
      return !/^(?:dream-|codex-dream-skin(?:-|$))/.test(cls);
    }).sort().join(".");
  } catch (error) {}
  return { s: bits.join("") + "|" + route + "|" + rootClasses };
}

function parseArgs(argv) {
  const options = { port: null, out: null, waitSeconds: DEFAULT_WAIT_SECONDS, watch: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--out") options.out = path.resolve(argv[++i]);
    else if (arg === "--wait") options.waitSeconds = Number(argv[++i]);
    else if (arg === "--watch") options.watch = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("用法: node capture-dom-fixture.mjs [--watch] [--port N] [--out file.json] [--wait 秒]");
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  if (options.port !== null && (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535)) {
    throw new Error(`无效端口: ${options.port}`);
  }
  if (!Number.isFinite(options.waitSeconds) || options.waitSeconds < 0 || options.waitSeconds > 600) {
    throw new Error(`无效等待秒数: ${options.waitSeconds}`);
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

/** 读取双端 Dream Skin 状态文件里记录的实际端口（端口被占用时会偏移）。 */
async function stateFilePorts() {
  const files = [];
  if (process.platform === "darwin") {
    files.push(path.join(os.homedir(), "Library/Application Support/CodexDreamSkinStudio/state.json"));
  } else if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const root = path.join(process.env.LOCALAPPDATA, "CodexDreamSkin");
    files.push(path.join(root, "state.json"));
    try {
      for (const entry of await fs.readdir(root)) {
        if (entry.endsWith(".json")) files.push(path.join(root, entry));
      }
    } catch {}
  }
  const ports = [];
  for (const file of files.slice(0, 12)) {
    try {
      const stat = await fs.stat(file);
      if (stat.size > 256 * 1024) continue;
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
  const list = [];
  if (options.port) list.push(options.port);
  const envPort = Number(process.env.CODEX_DREAM_SKIN_PORT);
  if (Number.isInteger(envPort) && envPort >= 1024) list.push(envPort);
  list.push(...(await stateFilePorts()));
  for (let offset = 0; offset < 5; offset += 1) list.push(9341 + offset);
  for (let offset = 0; offset < 5; offset += 1) list.push(9335 + offset);
  list.push(9222);
  return [...new Set(list)];
}

function isValidPageTarget(item, port) {
  if (item?.type !== "page" || !item.webSocketDebuggerUrl) return false;
  try {
    const url = new URL(item.webSocketDebuggerUrl);
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" ||
      url.hostname === "::1" || url.hostname === "[::1]";
    return url.protocol === "ws:" && loopback && Number(url.port) === port &&
      url.pathname.startsWith("/devtools/page/");
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function discover(options) {
  const deadline = Date.now() + options.waitSeconds * 1000;
  const candidates = await candidatePorts(options);
  let announced = false;
  for (;;) {
    for (const port of candidates) {
      try {
        const version = await fetchJson(port, "/json/version");
        return { port, version };
      } catch {}
    }
    if (Date.now() >= deadline) return null;
    if (!announced) {
      console.log(`未发现 CDP 端口，等待 Codex 就绪…（扫描 ${candidates.join(", ")}，共 ${options.waitSeconds}s）`);
      announced = true;
    }
    await sleep(1500);
  }
}

async function waitForPageTargets(port, deadline) {
  for (;;) {
    let targets = [];
    try {
      const list = await fetchJson(port, "/json/list", 2000);
      targets = (Array.isArray(list) ? list : []).filter((item) => isValidPageTarget(item, port));
    } catch {}
    const appTargets = targets.filter((item) => String(item.url || "").startsWith("app://"));
    if (appTargets.length) return { targets: appTargets, appShell: true };
    if (Date.now() >= deadline) return { targets, appShell: false };
    await sleep(1200);
  }
}

class CdpSession {
  constructor(target, port) {
    this.ws = new WebSocket(new URL(target.webSocketDebuggerUrl).href);
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    void port;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { this.ws.close(); } catch {}
        reject(new Error("CDP WebSocket 连接超时"));
      }, 6000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP WebSocket 连接失败")); }, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () => this.close());
    this.ws.addEventListener("error", () => this.close());
    return this;
  }

  onMessage(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (!message?.id) return;
    const waiter = this.pending.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timeout);
    this.pending.delete(message.id);
    if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
    else waiter.resolve(message.result);
  }

  send(method, params = {}, timeoutMs = 30000) {
    if (this.closed) return Promise.reject(new Error("CDP 会话已关闭"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 命令超时: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`页面执行失败: ${String(detail).slice(0, 200)}`);
    }
    return result.result?.value;
  }

  close() {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("CDP 会话已关闭"));
    }
    this.pending.clear();
    if (!this.closed) {
      try { this.ws.close(); } catch {}
    }
    this.closed = true;
  }
}

function buildExpression() {
  return `(${pageCapture.toString()})(${JSON.stringify(CAPTURE_CFG)}, ${JSON.stringify(PROBES)})`;
}

function buildSignatureExpression() {
  return `(${pageSignature.toString()})(${JSON.stringify(PROBES)})`;
}

function deriveLabel(data) {
  const hit = (key) => (data.probes.find((probe) => probe.key === key)?.count ?? 0) > 0;
  let base = "state";
  if (hit("overlay-dialog")) base = "dialog";
  else if (hit("overlay-menu") || hit("overlay-popper")) base = "menu";
  else if (hit("home-icon")) base = "home";
  else if (hit("markdown")) base = "thread";
  else if (hit("shell-main")) base = "route";
  const scheme = data.appearance?.computedColorScheme || "";
  return scheme ? `${base}-${scheme}` : base;
}

async function connectFirstAppTarget(port) {
  const { targets } = await waitForPageTargets(port, Date.now() + 15000);
  if (!targets.length) return null;
  const target = targets[0];
  const session = await new CdpSession(target, port).open();
  const url = String(target.url || "");
  return { session, url: url.startsWith("app://") ? url.slice(0, 120) : `${url.split(":")[0]}://…` };
}

async function watchMode(options, found) {
  const expression = buildExpression();
  const signatureExpression = buildSignatureExpression();
  const states = [];
  const seen = new Set();
  let stopped = false;
  let interrupts = 0;
  process.on("SIGINT", () => {
    interrupts += 1;
    if (interrupts >= 2) process.exit(130);
    stopped = true;
    console.log("\n收到 Ctrl+C，正在写盘…（再按一次强制退出）");
  });

  console.log(
    "\n巡游模式已启动：请在 Codex 里依次操作，每个新状态会自动抓取——\n" +
    "  1. 首页（建议卡片那屏）\n" +
    "  2. 打开一个会话/任务页（最好有 AI 回复内容）\n" +
    "  3. 收起再展开左侧栏\n" +
    "  4. 打开头像/设置菜单（能看到外观选项的那个）\n" +
    "  5. 切换 亮色/暗色 外观（再切回来）\n" +
    "  6. 打开项目选择下拉\n" +
    "全部点完后回到终端按 Ctrl+C 结束。\n",
  );

  let connection = null;
  let pendingSignature = null;
  let stableTicks = 0;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (!stopped && Date.now() < deadline && states.length < 16) {
    if (!connection || connection.session.closed) {
      connection?.session.close();
      connection = await connectFirstAppTarget(found.port).catch(() => null);
      if (!connection) {
        await sleep(1500);
        continue;
      }
    }
    let signature = null;
    try {
      signature = await connection.session.evaluate(signatureExpression);
    } catch {
      await sleep(900);
      continue;
    }
    if (!signature || signature.notReady) {
      await sleep(900);
      continue;
    }
    if (signature.s !== pendingSignature) {
      pendingSignature = signature.s;
      stableTicks = 0;
    } else {
      stableTicks += 1;
    }
    // 同一签名连续两拍（约 1.4s）才算稳定，避开动画/过渡半态
    if (stableTicks === 1 && !seen.has(signature.s)) {
      try {
        const data = await connection.session.evaluate(expression);
        if (data && !data.error && !data.notReady) {
          seen.add(signature.s);
          const label = deriveLabel(data);
          states.push({ index: states.length + 1, label, url: connection.url, signature: signature.s, data });
          console.log(`  ✔ 状态 #${states.length}: ${label}（节点 ${data.stats.nodes}）`);
        }
      } catch (error) {
        console.log(`  ⚠ 本状态抓取失败: ${String(error.message || error).slice(0, 80)}（继续监听）`);
      }
    }
    await sleep(700);
  }
  connection?.session.close();
  if (states.length >= 16) console.log("已达单次巡游状态上限（16）。");
  if (!states.length) {
    console.error("没有捕获到任何状态。");
    process.exit(4);
  }

  const fixture = {
    schema: "codex-dom-fixture/1",
    tool: { name: "capture-dom-fixture", version: TOOL_VERSION, mode: "watch" },
    capturedAt: new Date().toISOString(),
    host: { platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version },
    cdp: { port: found.port, version: found.version },
    targets: states,
  };
  const outFile = options.out ??
    path.resolve(`codex-dom-fixture-${os.platform()}-watch-${timestamp()}.json`);
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const body = JSON.stringify(fixture, null, 1);
  await fs.writeFile(outFile, body);
  console.log(`\n共捕获 ${states.length} 个状态:`);
  for (const state of states) console.log(`  #${state.index} ${state.label}`);
  console.log(`→ 已写入 ${outFile}（${(body.length / 1024 / 1024).toFixed(2)} MB）`);
  console.log("下一步: 把该 JSON 文件发回分析方。");
  process.exitCode = 0;
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function printTargetSummary(entry) {
  const data = entry.data;
  console.log(`\n── 页面 ${entry.index}${entry.url ? ` · ${entry.url}` : ""} ──`);
  if (data.error) {
    console.log(`  采集失败: ${data.error}`);
    return;
  }
  const skin = data.skin.active
    ? `皮肤已注入 v${data.skin.version ?? "?"} theme=${data.skin.themeId ?? "?"}（快照已过滤皮肤痕迹）`
    : "无皮肤（原生 DOM）";
  console.log(`  ${skin}`);
  console.log(`  节点 ${data.stats.nodes} · 唯一类名 ${data.summaries.uniqueClassCount} · testid ${data.summaries.testids.length} · 外观 ${data.appearance.computedColorScheme || "?"}`);
  for (const probe of data.probes) {
    const status = probe.error ? `⚠ ${probe.error}` : probe.count > 0 ? `✔ ${probe.count}` : "✘ 0";
    console.log(`  ${probe.tier.padEnd(4)} ${probe.selector.padEnd(46)} ${status}`);
  }
  const features = data.features;
  console.log(`  特性: :has ${features.hasSelector ? "✔" : "✘"} · adoptedStyleSheets ${features.adoptedStyleSheets ? "✔" : "✘"} · constructable ${features.constructableStyleSheet ? "✔" : "✘"} · navigationApi ${features.navigationApi ? "✔" : "✘"} · registerProperty ${features.registerProperty ? "✔" : "✘"}`);
}

async function main() {
  if (typeof WebSocket !== "function") {
    console.error("此脚本需要 Node.js 22+（内置 WebSocket）。当前版本: " + process.version);
    process.exit(2);
  }
  const options = parseArgs(process.argv);
  const found = await discover(options);
  if (!found) {
    console.error(
      "未发现可用的 CDP 端口。请先用 Dream Skin 启动器启动 Codex：\n" +
      "  macOS   : ~/.codex/codex-dream-skin-studio/scripts/start-dream-skin-macos.sh（或仓库 macos/scripts/ 下同名脚本）\n" +
      "  Windows : powershell -File .\\windows\\scripts\\start-dream-skin.ps1\n" +
      "或手动: <Codex 可执行文件> --remote-debugging-address=127.0.0.1 --remote-debugging-port=9341\n" +
      "然后重跑本脚本（可用 --port 指定端口，--wait 延长等待）。",
    );
    process.exit(2);
  }
  console.log(`✔ CDP 端口 ${found.port} · ${found.version?.Browser ?? "unknown"}`);

  if (options.watch) {
    await watchMode(options, found);
    return;
  }

  const { targets, appShell } = await waitForPageTargets(found.port, Date.now() + 15000);
  if (!targets.length) {
    console.error("该端口上没有可用的页面 target（Codex 窗口尚未创建？稍后重试或加大 --wait）。");
    process.exit(3);
  }
  if (!appShell) console.log("提示: 未发现 app:// 页面，将采集该端口上的全部页面 target。");

  const expression = buildExpression();
  const captured = [];
  for (const [index, target] of targets.slice(0, MAX_TARGETS).entries()) {
    const url = String(target.url || "");
    const safeUrl = url.startsWith("app://") ? url.slice(0, 120) : `${url.split(":")[0]}://…`;
    let session = null;
    try {
      session = await new CdpSession(target, found.port).open();
      let data = await session.evaluate(expression);
      const readyDeadline = Date.now() + 25000;
      while (data?.notReady && Date.now() < readyDeadline) {
        await sleep(1200);
        data = await session.evaluate(expression);
      }
      if (data?.notReady) data = { error: `页面始终未就绪 (readyState=${data.readyState})` };
      captured.push({ index: index + 1, url: safeUrl, data });
    } catch (error) {
      captured.push({ index: index + 1, url: safeUrl, data: { error: String(error.message || error) } });
    } finally {
      session?.close();
    }
  }

  const usable = captured.filter((entry) => !entry.data.error);
  if (!usable.length) {
    for (const entry of captured) printTargetSummary(entry);
    console.error("\n所有页面采集均失败。");
    process.exit(4);
  }

  const fixture = {
    schema: "codex-dom-fixture/1",
    tool: { name: "capture-dom-fixture", version: TOOL_VERSION },
    capturedAt: new Date().toISOString(),
    host: { platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version },
    cdp: { port: found.port, version: found.version },
    targets: captured,
  };
  const outFile = options.out ??
    path.resolve(`codex-dom-fixture-${os.platform()}-${timestamp()}.json`);
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const body = JSON.stringify(fixture, null, 1);
  await fs.writeFile(outFile, body);

  for (const entry of captured) printTargetSummary(entry);
  console.log(`\n→ 已写入 ${outFile}（${(body.length / 1024 / 1024).toFixed(2)} MB）`);
  console.log("下一步: 把该 JSON 文件发回分析方；另一平台运行同一脚本后对比两份快照。");
}

process.on("unhandledRejection", (reason) => {
  console.error(`警告: ${String((reason && reason.message) || reason).slice(0, 120)}`);
});

main().catch((error) => {
  console.error(`失败: ${error.message}`);
  process.exit(1);
});
