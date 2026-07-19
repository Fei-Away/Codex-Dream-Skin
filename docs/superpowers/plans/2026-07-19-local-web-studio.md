# Local Web Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dependency-free, loopback-only browser control panel that starts from one macOS launcher, supports first-time installation, and manages Dream Skin themes safely.

**Architecture:** A shell launcher validates the official Codex bundle and starts a short-lived Node HTTP service with a FIFO readiness handshake. Focused Node modules implement request validation, theme storage, fixed platform actions, cross-process mutation locking, and job tracking; a local static web UI calls only the allowlisted API. Existing macOS scripts remain the source of truth for Codex/CDP lifecycle behavior.

**Tech Stack:** Bash, Node.js 20+ built-in modules, Node test runner, plain HTML/CSS/JavaScript, existing macOS `sips`, `codesign`, `open`, and Dream Skin scripts.

## Global Constraints

- Support macOS and the official Codex Desktop application only.
- Use only the official Codex application's signed bundled Node.js 20 or newer; do not require global Node.js.
- Add no npm, Python, Docker, browser-framework, remote font, CDN, or analytics dependency.
- Bind the control service explicitly to IPv4 `127.0.0.1`; never bind `0.0.0.0`, `::`, a LAN address, or a runtime-resolved hostname.
- Keep Codex CDP loopback-only and verify the listener and renderer identity through existing helpers.
- Never modify the official `.app`, `app.asar`, code signature, API keys, or Base URLs.
- Never expose an arbitrary command, executable, working directory, output path, CDP URL, host, or unrestricted filesystem path through the API.
- Spawn fixed repository scripts with argument arrays and `shell: false`; never use `eval`, `bash -c`, or shell interpolation for browser data.
- Preserve strict UTF-8, atomic writes, recoverable backup, and unrelated TOML content.
- Require explicit browser confirmation before restarting a running Codex instance or fully restoring the official appearance.
- Limit source images to 50 MB and prepared images to 16 MB; support PNG, JPEG, HEIC, TIFF, and WebP accepted by macOS.
- Use two-space indentation in shell, JavaScript, JSON, and CSS.
- Treat the feature as release-worthy: update `macos/CHANGELOG.md` and bump `macos/VERSION` and `macos/package.json` together from `1.1.2` to `1.2.0` only in the release task.

## File Structure

| File | Responsibility |
| --- | --- |
| `macos/scripts/web-studio-shared.mjs` | Constants, typed errors, validation, image sniffing, safe identifiers, request authority checks |
| `macos/scripts/web-studio-theme-store.mjs` | Prepare, save, list, activate, delete, and reset user themes under known roots |
| `macos/scripts/web-studio-executor.mjs` | Cross-process mutation lock and allowlisted install/session/verify/restore actions |
| `macos/scripts/web-studio-server.mjs` | Loopback HTTP server, token/FIFO handshake, routing, bounded body parsing, jobs, idle shutdown |
| `macos/assets/web-studio/index.html` | Accessible page structure and local-only asset references |
| `macos/assets/web-studio/studio.css` | Responsive presentation and theme preview styling |
| `macos/assets/web-studio/studio-client.mjs` | Token lifecycle, API client, validation helpers, job polling |
| `macos/assets/web-studio/studio.js` | DOM binding, image preview, forms, confirmations, dashboard rendering |
| `macos/scripts/open-web-studio-macos.sh` | Signed-runtime validation, FIFO creation, server bootstrap, browser opening |
| `macos/Open Dream Skin Studio.command` | Repository/customer double-click entry point with installed-engine fallback |
| `macos/tests/web-studio-shared.test.mjs` | Protocol and security primitive tests |
| `macos/tests/web-studio-theme-store.test.mjs` | Theme storage, image validation, and atomicity tests |
| `macos/tests/web-studio-executor.test.mjs` | Fixed command construction, restart gate, lock, and operation tests |
| `macos/tests/web-studio-server.test.mjs` | HTTP authority, auth, routes, size limits, jobs, and lifecycle tests |
| `macos/tests/web-studio-client.test.mjs` | Client token, response, validation, and polling tests |
| `macos/tests/run-tests.sh` | Run the new Node tests as part of the full macOS suite |
| `macos/scripts/install-dream-skin-macos.sh` | Install the browser launcher alongside existing desktop launchers |
| `macos/scripts/build-client-release.sh` | Make the browser launcher the visible customer ZIP entry point |
| `macos/scripts/build-release.sh` | Preserve executable permissions for the new launcher and scripts |
| `macos/README.md` | Browser-control quick start and security boundary |
| `macos/CLIENT_DEPLOY_PROMPT.md` | Customer deployment instructions for the new entry point |
| `docs/platforms.md` | macOS-only browser control-panel capability |
| `macos/CHANGELOG.md` | Version 1.2.0 user-visible changes |
| `macos/VERSION` | Release version `1.2.0` |
| `macos/package.json` | Package version `1.2.0` |

---

### Task 1: Shared Protocol and Security Primitives

**Files:**
- Create: `macos/scripts/web-studio-shared.mjs`
- Create: `macos/tests/web-studio-shared.test.mjs`
- Modify: `macos/tests/run-tests.sh:12-14,71-74`

**Interfaces:**
- Consumes: Node built-ins `node:crypto` and `node:path`.
- Produces: `LIMITS`, `THEME_ID_PATTERN`, `WebStudioError`, `validateThemeFields(input)`, `validateThemeId(value)`, `safeChild(root, id)`, `sniffImage(bytes)`, `tokenMatches(actual, expected)`, and `assertRequestAuthority({ host, origin, expectedHost, mutating })`.

- [ ] **Step 1: Write failing protocol tests**

Create tests covering exact limits, Unicode truncation by code points, six-digit colors, unknown-field rejection, safe IDs, traversal, image magic bytes, constant-time token behavior, and Host/Origin rules:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  LIMITS,
  WebStudioError,
  assertRequestAuthority,
  safeChild,
  sniffImage,
  tokenMatches,
  validateThemeFields,
  validateThemeId,
} from "../scripts/web-studio-shared.mjs";

test("normalizes allowed theme fields and rejects unknown fields", () => {
  assert.deepEqual(validateThemeFields({
    name: "  测试主题  ",
    tagline: "工作台",
    quote: "BUILD",
    accent: "#AABBCC",
    secondary: "#36d7e8",
    highlight: "#642a8c",
    apply: true,
    allowRestart: false,
  }), {
    name: "测试主题",
    tagline: "工作台",
    quote: "BUILD",
    accent: "#aabbcc",
    secondary: "#36d7e8",
    highlight: "#642a8c",
    apply: true,
    allowRestart: false,
  });
  assert.throws(() => validateThemeFields({ name: "x", command: "rm" }), /unknown field/i);
  assert.throws(() => validateThemeFields({ name: "x", accent: "red" }), /six-digit/i);
  assert.equal(LIMITS.sourceImageBytes, 50 * 1024 * 1024);
  assert.equal(LIMITS.preparedImageBytes, 16 * 1024 * 1024);
});

test("accepts generated theme ids and rejects traversal", () => {
  assert.equal(validateThemeId("img-20260719153000-a1b2c3d4"), "img-20260719153000-a1b2c3d4");
  assert.throws(() => validateThemeId("../theme"), /invalid theme id/i);
  assert.equal(safeChild("/tmp/themes", "img-20260719153000-a1b2c3d4"), "/tmp/themes/img-20260719153000-a1b2c3d4");
});

test("sniffs supported images by content", () => {
  assert.equal(sniffImage(Buffer.from("ffd8ffe00010", "hex")), "jpeg");
  assert.equal(sniffImage(Buffer.from("89504e470d0a1a0a", "hex")), "png");
  assert.equal(sniffImage(Buffer.from("524946460000000057454250", "hex")), "webp");
  assert.equal(sniffImage(Buffer.from("49492a0008000000", "hex")), "tiff");
  assert.equal(sniffImage(Buffer.from("000000186674797068656963", "hex")), "heic");
  assert.throws(() => sniffImage(Buffer.from("hello")), /unsupported image/i);
});

test("requires exact loopback authority and same origin for mutations", () => {
  assert.doesNotThrow(() => assertRequestAuthority({
    host: "127.0.0.1:9460",
    origin: "http://127.0.0.1:9460",
    expectedHost: "127.0.0.1:9460",
    mutating: true,
  }));
  assert.throws(() => assertRequestAuthority({
    host: "evil.example",
    origin: "http://127.0.0.1:9460",
    expectedHost: "127.0.0.1:9460",
    mutating: true,
  }), WebStudioError);
  assert.throws(() => assertRequestAuthority({
    host: "127.0.0.1:9460",
    origin: "https://evil.example",
    expectedHost: "127.0.0.1:9460",
    mutating: true,
  }), WebStudioError);
  assert.equal(tokenMatches("secret", "secret"), true);
  assert.equal(tokenMatches("secret", "other"), false);
});
```

- [ ] **Step 2: Register and run the test to verify failure**

Add before the final doctor check in `tests/run-tests.sh`:

```bash
while IFS= read -r test_file; do
  "$NODE" --test "$test_file"
done < <(/usr/bin/find "$ROOT/tests" -maxdepth 1 -type f -name 'web-studio-*.test.mjs' -print | /usr/bin/sort)
```

Run: `cd macos && npm test`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web-studio-shared.mjs`.

- [ ] **Step 3: Implement the shared module**

Use these exported shapes and fail closed on unknown input:

```js
import { timingSafeEqual } from "node:crypto";
import path from "node:path";

export const LIMITS = Object.freeze({
  jsonBytes: 64 * 1024,
  sourceImageBytes: 50 * 1024 * 1024,
  preparedImageBytes: 16 * 1024 * 1024,
  multipartBytes: 51 * 1024 * 1024,
  jobLogLines: 120,
});
export const THEME_ID_PATTERN = /^img-[0-9]{14}-[a-f0-9]{8}$/;
const THEME_FIELDS = new Set([
  "name", "tagline", "quote", "accent", "secondary", "highlight", "apply", "allowRestart",
]);

export class WebStudioError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "WebStudioError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function validateThemeId(value) {
  if (typeof value !== "string" || !THEME_ID_PATTERN.test(value)) {
    throw new WebStudioError("validation_error", "Invalid theme id.");
  }
  return value;
}

export function safeChild(root, id) {
  const valid = validateThemeId(id);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, valid);
  if (path.dirname(resolved) !== resolvedRoot) {
    throw new WebStudioError("validation_error", "Theme path escaped its managed root.");
  }
  return resolved;
}
```

Implement `validateThemeFields` with defaults from `customize-theme-macos.sh`, code-point limits of 80/160/80, booleans only for `apply` and `allowRestart`, and `/^#[0-9a-f]{6}$/i` colors. Implement `sniffImage` for the tested signatures and `tokenMatches` by comparing equal-length SHA-256 digests. `assertRequestAuthority` must compare exact strings and require `Origin` only for mutating methods.

- [ ] **Step 4: Run the focused and full tests**

Run: `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test macos/tests/web-studio-shared.test.mjs`

Expected: all protocol tests PASS.

Run: `cd macos && npm test`

Expected: existing suite and the new protocol tests PASS.

- [ ] **Step 5: Commit**

```bash
git add macos/scripts/web-studio-shared.mjs macos/tests/web-studio-shared.test.mjs macos/tests/run-tests.sh
git commit -m "feat(macos): add web studio protocol guards"
```

---

### Task 2: Theme Library and Atomic Activation

**Files:**
- Create: `macos/scripts/web-studio-theme-store.mjs`
- Create: `macos/tests/web-studio-theme-store.test.mjs`

**Interfaces:**
- Consumes: `LIMITS`, `WebStudioError`, `safeChild`, `sniffImage`, `validateThemeFields`, and the existing `write-theme.mjs` CLI.
- Produces: `createThemeStore({ stateRoot, projectRoot, nodePath, runFile, now, randomHex })` returning `{ listThemes, saveTheme, activateTheme, deleteTheme, applyDemo, activeTheme, resolveThemeImage }`.
- `saveTheme({ bytes: Buffer, fields: ThemeFields }): Promise<ThemeSummary>`.
- `ThemeSummary` is `{ id, name, tagline, quote, colors, imageUrl: string, active: boolean, bundled: boolean }`; `imageUrl` is an API path, never a filesystem path.

- [ ] **Step 1: Write failing theme-store tests**

Use temporary roots and an injected `runFile` that copies the input to `background.jpg` and writes a valid `theme.json`. Cover Unicode names, generated IDs, list order, atomic activation, delete-active rejection, demo reset, 50 MB rejection, unsupported magic, and failed conversion preserving the previous active theme:

```js
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const jpegBytes = () => Buffer.from("ffd8ffe000104a464946", "hex");
const pngBytes = () => Buffer.from("89504e470d0a1a0a00000000", "hex");
const validFields = (name) => ({
  name,
  tagline: "测试口号",
  quote: "BUILD",
  accent: "#7cff46",
  secondary: "#36d7e8",
  highlight: "#642a8c",
  apply: false,
  allowRestart: false,
});

async function fixtureStore(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dream-web-theme-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stateRoot = path.join(root, "state");
  const projectRoot = path.join(root, "project");
  await fs.mkdir(path.join(projectRoot, "scripts"), { recursive: true });
  let failure = null;
  const runFile = async (file, args) => {
    if (failure) throw failure;
    if (file === "/usr/bin/sips") {
      await fs.copyFile(args.at(-3), args.at(-1));
      return { stdout: "", stderr: "" };
    }
    const outputDir = args[args.indexOf("--output-dir") + 1];
    const image = args[args.indexOf("--image") + 1];
    const name = args[args.indexOf("--name") + 1];
    await fs.writeFile(path.join(outputDir, "theme.json"), `${JSON.stringify({
      schemaVersion: 1,
      id: "fixture",
      name,
      tagline: "测试口号",
      quote: "BUILD",
      image,
      colors: { accent: "#7cff46", secondary: "#36d7e8", highlight: "#642a8c" },
    })}\n`, { mode: 0o600 });
    return { stdout: "", stderr: "" };
  };
  const store = createThemeStore({
    stateRoot,
    projectRoot,
    nodePath: "/signed/node",
    runFile,
    now: () => new Date("2026-07-19T15:30:00Z"),
    randomHex: () => "a1b2c3d4",
  });
  store.setRunFileFailure = (value) => { failure = value; };
  return store;
}

test("saves, lists, and atomically activates a Unicode theme", async (t) => {
  const store = await fixtureStore(t);
  const saved = await store.saveTheme({ bytes: jpegBytes(), fields: validFields("海边主题") });
  assert.match(saved.id, /^img-[0-9]{14}-[a-f0-9]{8}$/);
  await store.activateTheme(saved.id);
  assert.equal((await store.activeTheme()).name, "海边主题");
  assert.equal((await store.listThemes()).filter((theme) => theme.active).length, 1);
});

test("failed preparation leaves the active theme unchanged", async (t) => {
  const store = await fixtureStore(t);
  const first = await store.saveTheme({ bytes: jpegBytes(), fields: validFields("旧主题") });
  await store.activateTheme(first.id);
  store.setRunFileFailure(new Error("sips failed"));
  await assert.rejects(store.saveTheme({ bytes: pngBytes(), fields: validFields("新主题") }), /sips failed/);
  assert.equal((await store.activeTheme()).id, first.id);
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test macos/tests/web-studio-theme-store.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web-studio-theme-store.mjs`.

- [ ] **Step 3: Implement server-generated theme storage**

Use one incoming directory under `themes/`, mode `0700`, and write uploads mode `0600`. Generate IDs as `img-${YYYYMMDDhhmmss}-${randomHex(4)}`. Convert to JPEG with fixed arguments:

```js
await runFile("/usr/bin/sips", [
  "-s", "format", "jpeg",
  "-s", "formatOptions", "84",
  "-Z", "3200",
  sourcePath,
  "--out", preparedPath,
]);
await runFile(nodePath, [
  path.join(projectRoot, "scripts/write-theme.mjs"),
  "custom", "--output-dir", incoming,
  "--image", "background.jpg",
  "--name", fields.name,
  "--tagline", fields.tagline,
  "--quote", fields.quote,
  "--accent", fields.accent,
  "--secondary", fields.secondary,
  "--highlight", fields.highlight,
]);
```

Reject a prepared file above `LIMITS.preparedImageBytes`. Rename the completed incoming directory to its final ID only after validating `theme.json`. Activate via `theme.next.<pid>` and `theme.previous.<pid>` sibling directories, restoring the previous directory if the final rename fails. Never follow a theme-directory symlink. Return API image URLs in the form `/api/themes/<id>/image`.

- [ ] **Step 4: Run focused and full tests**

Run: `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test macos/tests/web-studio-theme-store.test.mjs`

Expected: all theme-store tests PASS.

Run: `cd macos && npm test`

Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add macos/scripts/web-studio-theme-store.mjs macos/tests/web-studio-theme-store.test.mjs
git commit -m "feat(macos): add atomic web theme library"
```

---

### Task 3: Fixed Platform Executor and Cross-process Lock

**Files:**
- Create: `macos/scripts/web-studio-executor.mjs`
- Create: `macos/tests/web-studio-executor.test.mjs`

**Interfaces:**
- Consumes: `createThemeStore({ stateRoot, projectRoot, nodePath, runFile, now, randomHex })`, existing macOS scripts, and `WebStudioError`.
- Produces: `createWebStudioExecutor({ sourceRoot, installRoot, stateRoot, nodePath, runFile, inspectLockOwner })` returning `{ status, themes, themeImage, verificationScreenshot, install, createTheme, applyTheme, deleteTheme, applyDemo, reapply, pause, verify, restore }`.
- Every mutating method accepts an object containing `progress(message)` plus its explicitly documented fields and returns JSON-safe data.
- Produces error codes `conflict`, `not_installed`, `restart_required`, `verification_failed`, and `operation_failed` through `WebStudioError`.

- [ ] **Step 1: Write failing executor tests**

Inject a recording `runFile` and temporary source/install/state roots. Assert exact script paths and argument arrays, `shell: false`, install root switching, deep status parsing, restart gating, screenshot confinement, restore confirmation, mutation conflict, and stale-lock recovery:

```js
async function executorFixture(t, status = { codexRunning: false, cdpOk: false, port: 9341 }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dream-web-executor-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const installRoot = path.join(root, "installed");
  const stateRoot = path.join(root, "state");
  await Promise.all([
    fs.mkdir(path.join(sourceRoot, "scripts"), { recursive: true }),
    fs.mkdir(path.join(installRoot, "scripts"), { recursive: true }),
    fs.mkdir(stateRoot, { recursive: true }),
  ]);
  const commands = [];
  const runFile = async (file, args, options = { shell: false }) => {
    commands.push({ file, args, options });
    if (file.endsWith("status-dream-skin-macos.sh")) {
      return { stdout: `${JSON.stringify({ ...status, injectorAlive: false, session: "off", themeName: "" })}\n`, stderr: "" };
    }
    return { stdout: "{}\n", stderr: "" };
  };
  const executor = createWebStudioExecutor({
    sourceRoot,
    installRoot,
    stateRoot,
    nodePath: "/signed/node",
    runFile,
    inspectLockOwner: async () => ({ alive: false, matches: false }),
  });
  return {
    executor,
    lastCommand: () => commands.at(-1),
    script: (name) => path.join(installRoot, "scripts", name),
  };
}

test("requires restart authorization without verified CDP", async (t) => {
  const fixture = await executorFixture(t, { codexRunning: true, cdpOk: false });
  await assert.rejects(
    fixture.executor.reapply({ allowRestart: false, progress() {} }),
    (error) => error.code === "restart_required",
  );
  await fixture.executor.reapply({ allowRestart: true, progress() {} });
  assert.deepEqual(fixture.lastCommand(), {
    file: fixture.script("start-dream-skin-macos.sh"),
    args: ["--port", "9341", "--restart-existing"],
    options: { shell: false },
  });
});

test("restore requires the exact confirmation", async (t) => {
  const fixture = await executorFixture(t);
  await assert.rejects(
    fixture.executor.restore({ confirmation: "yes", allowRestart: true, progress() {} }),
    (error) => error.code === "validation_error",
  );
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test macos/tests/web-studio-executor.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web-studio-executor.mjs`.

- [ ] **Step 3: Implement fixed actions and lock discipline**

Implement `runFixed(file, args)` with `spawn(file, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] })`, bounded stdout/stderr, and a nonzero-exit `WebStudioError`. The executor must never accept `file`, `args`, or output paths from callers.

Use `web-studio/mutation.lock` created with `fs.open(lockPath, "wx", 0o600)`. Store `{ pid, startedAt, operation }`; on collision, call injected `inspectLockOwner` and remove only a proven stale lock. The production inspector runs fixed `/bin/ps -p <validated-pid> -o lstart= -o command=` arguments and considers the owner valid only when both the recorded start time and the canonical `web-studio-server.mjs` path match. Always release in `finally`.

Map actions exactly:

```js
const script = (root, name) => path.join(root, "scripts", name);

install:
  runFixed(script(sourceRoot, "install-dream-skin-macos.sh"), ["--no-launch"])
status:
  runFixed(script(activeRoot(), "status-dream-skin-macos.sh"), ["--json", "--deep"])
pause:
  runFixed(script(installRoot, "pause-dream-skin-macos.sh"), [])
verify:
  runFixed(script(installRoot, "verify-dream-skin-macos.sh"), ["--screenshot", managedScreenshot])
restore:
  runFixed(script(installRoot, "restore-dream-skin-macos.sh"), ["--restore-base-theme", "--restart-codex"])
```

For `reapply` and apply-after-activation, read deep status. If `codexRunning && !cdpOk && !allowRestart`, throw `restart_required`. Otherwise run `start-dream-skin-macos.sh --port <validated-state-port>` and append `--restart-existing` only when authorized and required. Validate the port as an integer from 1024 through 65535.

`status()` returns `{ installed, version, codexRunning, cdpOk, injectorAlive, session, port, themeName, recentLogs }`. Read only the final 40 lines from the known injector, start, and web-studio error logs; cap every line at 500 code points and redact the home directory, bearer-token pattern, and `/tmp` paths. `themeImage(id)` and `verificationScreenshot()` return `{ path, contentType }` only after resolving a regular non-symlink file beneath the managed theme or verification root.

- [ ] **Step 4: Run focused and full tests**

Run: `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test macos/tests/web-studio-executor.test.mjs`

Expected: executor tests PASS and recorded commands contain no shell strings.

Run: `cd macos && npm test`

Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add macos/scripts/web-studio-executor.mjs macos/tests/web-studio-executor.test.mjs
git commit -m "feat(macos): add fixed web studio actions"
```

---

### Task 4: Authenticated Loopback HTTP Server and Jobs

**Files:**
- Create: `macos/scripts/web-studio-server.mjs`
- Create: `macos/tests/web-studio-server.test.mjs`

**Interfaces:**
- Consumes: shared guards and `createWebStudioExecutor({ sourceRoot, installRoot, stateRoot, nodePath, runFile, inspectLockOwner })`.
- Produces: `createWebStudioServer({ host, port, readyFifo, assetRoot, executor, idleMs, jobRetentionMs, randomBytes })` returning `{ listen, close, address }`.
- CLI accepts only `--port <9460-9560>`, `--ready-fifo <absolute path under /tmp>`, `--source-root <absolute root>`, and `--idle-ms <positive integer>`; it rejects all other flags.
- Job JSON is `{ id, operation, state, createdAt, startedAt, finishedAt, progress, logs, result, error }` with states `queued|running|succeeded|failed`.

- [ ] **Step 1: Write failing HTTP tests**

Start the server on port `0` with a fake executor and deterministic token bytes. Test:

- Static `GET /` returns CSP and no remote assets.
- Every `/api/*` request requires `X-Dream-Skin-Token`.
- Exact Host is required.
- Mutation Origin must equal `http://<expectedHost>`.
- `OPTIONS`, invalid methods, unknown routes, unknown fields, and permissive CORS are rejected.
- JSON above 64 KB and multipart above 51 MB are rejected before executor invocation.
- Mutation returns `202`, progresses through job states, bounds logs to 120 lines, and expires.
- Concurrent mutations surface `conflict` from the executor.
- Theme image route returns only a file resolved by the theme store, with `nosniff` and private caching.
- Idle shutdown waits for active jobs.

Use real HTTP requests:

```js
async function serverFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dream-web-server-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const assetRoot = path.join(root, "assets");
  await fs.mkdir(assetRoot);
  await Promise.all([
    fs.writeFile(path.join(assetRoot, "index.html"), "<!doctype html><title>Studio</title>"),
    fs.writeFile(path.join(assetRoot, "studio.css"), "body{color:black}"),
    fs.writeFile(path.join(assetRoot, "studio-client.mjs"), "export const ready=true;"),
    fs.writeFile(path.join(assetRoot, "studio.js"), "import './studio-client.mjs';"),
  ]);
  const themeImagePath = path.join(root, "theme.jpg");
  const screenshotPath = path.join(root, "verification.png");
  await fs.writeFile(themeImagePath, Buffer.from("ffd8ffe0", "hex"));
  await fs.writeFile(screenshotPath, Buffer.from("89504e470d0a1a0a", "hex"));
  const executor = createFakeExecutor({ themeImagePath, screenshotPath });
  const server = createWebStudioServer({
    host: "127.0.0.1",
    port: 0,
    readyFifo: null,
    assetRoot,
    executor,
    idleMs: 60_000,
    jobRetentionMs: 60_000,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  await server.listen();
  t.after(() => server.close());
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const token = Buffer.alloc(32, 7).toString("base64url");
  return {
    origin,
    token,
    async job(jobId) {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const response = await fetch(`${origin}/api/jobs/${jobId}`, {
          headers: { "X-Dream-Skin-Token": token },
        });
        const job = await response.json();
        if (job.state === "succeeded" || job.state === "failed") return job;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("job did not finish");
    },
  };
}

function createFakeExecutor({ themeImagePath, screenshotPath }) {
  const terminal = async ({ progress = () => {} } = {}) => {
    progress("完成");
    return { pass: true };
  };
  return {
    status: async () => ({ installed: true, version: "1.1.2", recentLogs: [] }),
    themes: async () => [],
    themeImage: async () => ({ path: themeImagePath, contentType: "image/jpeg" }),
    verificationScreenshot: async () => ({ path: screenshotPath, contentType: "image/png" }),
    install: terminal,
    createTheme: terminal,
    applyTheme: terminal,
    deleteTheme: terminal,
    applyDemo: terminal,
    reapply: terminal,
    pause: terminal,
    verify: terminal,
    restore: terminal,
  };
}

const response = await fetch(`${fixture.origin}/api/session/pause`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "origin": fixture.origin,
    "x-dream-skin-token": fixture.token,
  },
  body: "{}",
});
assert.equal(response.status, 202);
const { jobId } = await response.json();
assert.equal((await fixture.job(jobId)).state, "succeeded");
assert.equal(response.headers.get("access-control-allow-origin"), null);
```

- [ ] **Step 2: Run the server test to verify failure**

Run: `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test macos/tests/web-studio-server.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web-studio-server.mjs`.

- [ ] **Step 3: Implement routing, parsing, jobs, and headers**

Serve only an exact map:

```js
const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/studio.css", ["studio.css", "text/css; charset=utf-8"]],
  ["/studio-client.mjs", ["studio-client.mjs", "text/javascript; charset=utf-8"]],
  ["/studio.js", ["studio.js", "text/javascript; charset=utf-8"]],
]);
```

Set these headers on every response:

```text
Content-Security-Policy: default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Cache-Control: no-store
```

For JSON, stream-count bytes and abort above `LIMITS.jsonBytes`. For multipart, stream-count above `LIMITS.multipartBytes`, construct a WHATWG `Request` from the bounded body, call `formData()`, require exactly one `image` file, and convert its `arrayBuffer()` to `Buffer`. Pass only `validateThemeFields` output and sniffed image bytes to the executor. Add authenticated `GET /api/themes/:id/image` and `GET /api/verification/screenshot` routes; both resolve only executor-owned managed files and return bytes with `nosniff` and `Cache-Control: private, no-store`.

Route only this fixed operation map:

```text
GET    /api/status                    -> executor.status
GET    /api/themes                    -> executor.themes
GET    /api/themes/:id/image          -> executor.themeImage
POST   /api/install                   -> job(executor.install)
POST   /api/themes                    -> job(executor.createTheme)
POST   /api/themes/:id/apply          -> job(executor.applyTheme)
DELETE /api/themes/:id                -> job(executor.deleteTheme)
POST   /api/demo/apply                -> job(executor.applyDemo)
POST   /api/session/reapply           -> job(executor.reapply)
POST   /api/session/pause             -> job(executor.pause)
POST   /api/verify                    -> job(executor.verify)
GET    /api/verification/screenshot   -> executor.verificationScreenshot
POST   /api/restore                   -> job(executor.restore)
GET    /api/jobs/:id                  -> job registry lookup
```

Return validation failures as `{ "error": { "code": "validation_error", "message": "Invalid request.", "details": null } }`, never as HTML or a raw stack trace.

Generate `randomBytes(32).toString("base64url")` inside the server. After listening, open the existing FIFO for a single write, send `http://127.0.0.1:<port>/#token=<token>\n`, close it, and never log the URL. Refuse a ready path that is not an absolute FIFO under `/tmp` by checking `lstat().isFIFO()` and mode ownership.

- [ ] **Step 4: Run focused and full tests**

Run: `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test macos/tests/web-studio-server.test.mjs`

Expected: all HTTP and job tests PASS.

Run: `cd macos && npm test`

Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add macos/scripts/web-studio-server.mjs macos/tests/web-studio-server.test.mjs
git commit -m "feat(macos): serve authenticated local studio"
```

---

### Task 5: Browser Dashboard and Theme Preview

**Files:**
- Create: `macos/assets/web-studio/index.html`
- Create: `macos/assets/web-studio/studio.css`
- Create: `macos/assets/web-studio/studio-client.mjs`
- Create: `macos/assets/web-studio/studio.js`
- Create: `macos/tests/web-studio-client.test.mjs`

**Interfaces:**
- Consumes: Task 4 API and job shapes.
- Produces from `studio-client.mjs`: `readSessionToken(location, history, storage)`, `createApiClient({ origin, token, fetchImpl })`, `pollJob({ api, jobId, onUpdate, intervalMs })`, `validateImageFile(file)`, and `normalizeColor(value)`.
- `studio.js` imports these functions and owns DOM state; it exports nothing.

- [ ] **Step 1: Write failing client tests**

Test fragment extraction/removal, `sessionStorage`, token header on every API call, exact JSON/multipart calls, non-JSON error fallback, polling success/failure, client-side 50 MB rejection, and color normalization:

```js
class MapStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

test("moves the fragment token into session storage and cleans the URL", () => {
  const storage = new MapStorage();
  const replaced = [];
  const token = readSessionToken(
    { hash: "#token=abc123", pathname: "/", search: "" },
    { replaceState: (...args) => replaced.push(args) },
    storage,
  );
  assert.equal(token, "abc123");
  assert.equal(storage.getItem("dreamSkinToken"), "abc123");
  assert.equal(replaced.length, 1);
});

test("adds the token header without enabling CORS", async () => {
  const calls = [];
  const api = createApiClient({
    origin: "http://127.0.0.1:9460",
    token: "secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ installed: true });
    },
  });
  await api.status();
  assert.equal(calls[0].init.headers["X-Dream-Skin-Token"], "secret");
  assert.equal(calls[0].init.mode, "same-origin");
});
```

- [ ] **Step 2: Run the client test to verify failure**

Run: `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test macos/tests/web-studio-client.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `studio-client.mjs`.

- [ ] **Step 3: Implement the testable client module**

Keep the token only in `sessionStorage` and memory. `createApiClient` must expose exact methods matching the API table, set `mode: "same-origin"`, never set credentials for another origin, and treat `{ error: { code, message, details } }` as a typed client error. `pollJob` stops only at `succeeded` or `failed` and calls `onUpdate` for every response.

- [ ] **Step 4: Build accessible local HTML and CSS**

Use semantic markup with these stable IDs so `studio.js` stays small and tests/verification can target the page:

```html
<main id="studio" aria-busy="true">
  <header class="studio-header">
    <div><p class="eyebrow">CODEX DREAM SKIN</p><h1>本地主题控制台</h1></div>
    <output id="connection-status" role="status">正在连接…</output>
  </header>
  <section id="install-panel" hidden aria-labelledby="install-title">
    <h2 id="install-title">安装 Dream Skin</h2>
    <p id="install-summary">安装到用户目录，不修改官方 Codex 应用或签名。</p>
    <button id="install-button" type="button">一键安装</button>
  </section>
  <section id="dashboard" hidden>
    <form id="theme-form">
      <label id="drop-zone" for="theme-image">拖入或选择一张横向图片</label>
      <input id="theme-image" name="image" type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/tiff" required>
      <img id="image-preview" alt="所选主题图片预览" hidden>
      <input id="theme-name" name="name" maxlength="80" value="我的 Codex Dream Skin" required>
      <details id="advanced-settings">
        <summary>高级设置</summary>
        <label>首页标语<input id="theme-tagline" name="tagline" maxlength="160" value="把喜欢的画面变成可交互的 Codex 工作台。"></label>
        <label>装饰引语<input id="theme-quote" name="quote" maxlength="80" value="MAKE SOMETHING WONDERFUL"></label>
        <label>主色<input id="theme-accent" name="accent" type="color" value="#7cff46"></label>
        <label>辅色<input id="theme-secondary" name="secondary" type="color" value="#36d7e8"></label>
        <label>高光<input id="theme-highlight" name="highlight" type="color" value="#642a8c"></label>
      </details>
      <button id="apply-theme" type="submit">保存并应用</button>
    </form>
    <section id="saved-themes" aria-live="polite">
      <h2>已保存主题</h2><ul id="theme-list"></ul>
    </section>
    <section id="maintenance-actions">
      <h2>维护</h2>
      <button id="reapply-button" type="button">重新应用</button>
      <button id="pause-button" type="button">暂停皮肤</button>
      <button id="verify-button" type="button">验证并截图</button>
      <button id="demo-button" type="button">恢复演示主题</button>
      <button id="restore-button" type="button">恢复官方界面</button>
    </section>
    <details id="diagnostics-panel"><summary>诊断信息</summary>
      <pre id="diagnostic-log"></pre><button id="copy-log" type="button">复制诊断信息</button>
    </details>
  </section>
  <section id="job-panel" hidden aria-live="polite">
    <h2 id="job-title">正在处理</h2><progress id="job-progress"></progress>
    <p id="job-message"></p><pre id="job-log"></pre>
  </section>
  <dialog id="confirm-dialog">
    <form method="dialog"><p id="confirm-message"></p>
      <button value="cancel">取消</button><button id="confirm-action" value="confirm">确认</button>
    </form>
  </dialog>
</main>
<script type="module" src="/studio.js"></script>
```

The preview must reflect the production crop rules: home banner `right center`, task background `58% center`, with a CSS-only frosted overlay and no fake Codex controls. Provide visible focus styles, sufficient contrast, reduced-motion handling, and responsive layout without external assets.

- [ ] **Step 5: Bind UI behavior**

On load, read and clear the fragment, create the API client, fetch status/themes, and show install or dashboard. Use `URL.createObjectURL` and revoke the previous URL. Submit `FormData` with only the allowed fields. Render all server values with `textContent`, never `innerHTML`. Fetch managed theme images and verification screenshots with the authenticated API client, turn response blobs into object URLs, and revoke them when replaced. Render theme switch and delete buttons with `data-theme-id` values only after client-side ID validation. Populate diagnostics from the bounded `recentLogs` array and copy only that rendered text.

For `restart_required`, show an explicit dialog, then repeat the same operation with `allowRestart: true`. For restore, require the user to click a button labeled `恢复官方界面并重启 Codex`, then send `{ confirmation: "restore-official", allowRestart: true }`. Preserve form fields after validation errors.

- [ ] **Step 6: Run focused, syntax, and full tests**

Run: `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test macos/tests/web-studio-client.test.mjs`

Expected: client tests PASS.

Run: `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --check macos/assets/web-studio/studio.js`

Expected: exit 0.

Run: `cd macos && npm test`

Expected: full suite PASS and payload checks remain unchanged.

- [ ] **Step 7: Commit**

```bash
git add macos/assets/web-studio macos/tests/web-studio-client.test.mjs
git commit -m "feat(macos): add local theme dashboard"
```

---

### Task 6: Double-click Bootstrap, Installation, and Packaging

**Files:**
- Create: `macos/scripts/open-web-studio-macos.sh`
- Create: `macos/Open Dream Skin Studio.command`
- Modify: `macos/scripts/install-dream-skin-macos.sh:22-40,76-91`
- Modify: `macos/scripts/build-client-release.sh:20-39`
- Modify: `macos/scripts/build-release.sh:15-24`
- Modify: `macos/tests/run-tests.sh`

**Interfaces:**
- Consumes: `common-macos.sh`, `web-studio-server.mjs`, and the installed/source engine layout.
- Produces: a repository and customer-visible `Open Dream Skin Studio.command`; installed desktop launcher `Codex Dream Skin Studio.command`.

- [ ] **Step 1: Add failing static packaging assertions**

Extend `tests/run-tests.sh` with assertions that:

```bash
[ -x "$ROOT/Open Dream Skin Studio.command" ]
[ -x "$ROOT/scripts/open-web-studio-macos.sh" ]
/usr/bin/grep -q 'Open Dream Skin Studio.command' "$ROOT/scripts/build-client-release.sh"
/usr/bin/grep -q 'Codex Dream Skin Studio.command' "$ROOT/scripts/install-dream-skin-macos.sh"
! /usr/bin/grep -R -n -E 'web-studio-server\.mjs.*--token|DREAM_SKIN_WEB_TOKEN' "$ROOT" >/dev/null
```

Run: `cd macos && npm test`

Expected: FAIL because the launcher files do not exist.

- [ ] **Step 2: Implement the bootstrap shell script**

The script must source `common-macos.sh`, call `discover_codex_app` and `require_macos_runtime`, select a port from `9460` through `9560`, and create a FIFO:

```bash
READY_DIR="$(/usr/bin/mktemp -d /tmp/codex-dream-web-ready.XXXXXX)"
/bin/chmod 700 "$READY_DIR"
FIFO="$READY_DIR/ready.fifo"
/usr/bin/mkfifo -m 600 "$FIFO"
cleanup() { /bin/rm -f "$FIFO"; /bin/rmdir "$READY_DIR" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
exec 3<> "$FIFO"

/usr/bin/nohup "$NODE" "$SCRIPT_DIR/web-studio-server.mjs" \
  --port "$PORT" \
  --ready-fifo "$FIFO" \
  --source-root "$PROJECT_ROOT" \
  --idle-ms 1800000 \
  >>"$STATE_ROOT/web-studio-server.log" \
  2>>"$STATE_ROOT/web-studio-server-error.log" 3>&- &
SERVER_PID=$!

if ! IFS= read -r -t 20 READY_URL <&3; then
  /bin/kill -TERM "$SERVER_PID" 2>/dev/null || true
  fail "Local control service did not become ready within 20 seconds."
fi
exec 3>&-
/bin/rm -f "$FIFO"
/bin/rmdir "$READY_DIR"
trap - EXIT INT TERM
case "$READY_URL" in
  "http://127.0.0.1:"*"/#token="*) ;;
  *) /bin/kill -TERM "$SERVER_PID" 2>/dev/null || true; fail "Local control service returned an invalid URL." ;;
esac
/usr/bin/open "$READY_URL"
```

Never print `READY_URL`. On server failure, show a concise `osascript` alert pointing to the error log.

- [ ] **Step 3: Implement repository and installed launchers**

`Open Dream Skin Studio.command` must prefer the installed engine when present and fall back to its own repository root:

```bash
#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
INSTALLED="$HOME/.codex/codex-dream-skin-studio/scripts/open-web-studio-macos.sh"
if [ -x "$INSTALLED" ]; then exec "$INSTALLED"; fi
exec "$ROOT/scripts/open-web-studio-macos.sh"
```

In the installer, create `~/Desktop/Codex Dream Skin Studio.command` using the existing guarded `write_launcher` helper. Add the file to restore `--uninstall` cleanup only; ordinary restore must retain it so users can reinstall from the page.

- [ ] **Step 4: Make the customer ZIP open the web installer**

Change the visible ZIP launcher to `打开 Codex 主题控制台.command` and make it execute the hidden engine's `Open Dream Skin Studio.command`. Update `使用说明.txt` to tell users to double-click that file; retain the complete hidden engine. Ensure chmod covers the new scripts and launchers.

- [ ] **Step 5: Run static, package, and full tests**

Run: `cd macos && npm test`

Expected: all static and runtime tests PASS.

Run: `cd macos && ./scripts/build-client-release.sh /tmp/codex-dream-skin-web-client.zip`

Expected: exit 0; archive contains `打开 Codex 主题控制台.command`, `.codex-dream-skin-studio/Open Dream Skin Studio.command`, `scripts/web-studio-server.mjs`, and `assets/web-studio/index.html`.

Inspect: `/usr/bin/unzip -l /tmp/codex-dream-skin-web-client.zip`

- [ ] **Step 6: Commit**

```bash
git add "macos/Open Dream Skin Studio.command" macos/scripts/open-web-studio-macos.sh macos/scripts/install-dream-skin-macos.sh macos/scripts/build-client-release.sh macos/scripts/build-release.sh macos/tests/run-tests.sh
git commit -m "feat(macos): launch web studio by double click"
```

---

### Task 7: Documentation and 1.2.0 Release Metadata

**Files:**
- Modify: `macos/README.md:17-67`
- Modify: `macos/CLIENT_DEPLOY_PROMPT.md`
- Modify: `docs/platforms.md:15-46`
- Modify: `macos/CHANGELOG.md:1-3`
- Modify: `macos/VERSION`
- Modify: `macos/package.json:3`
- Modify: `macos/scripts/common-macos.sh` at `SKIN_VERSION`
- Modify: version literals in `macos/scripts/build-client-release.sh` and version assertions in `macos/tests/run-tests.sh`

**Interfaces:**
- Consumes: completed feature behavior and actual verification commands.
- Produces: consistent version `1.2.0` and end-user instructions.

- [ ] **Step 1: Add a failing version-consistency assertion**

In `tests/run-tests.sh`, replace the literal HOME-recovery assertion with the VERSION file and add package/common checks:

```bash
EXPECTED_VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
PACKAGE_VERSION="$($NODE -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version)' "$ROOT/package.json")"
[ "$EXPECTED_VERSION" = "$PACKAGE_VERSION" ]
/usr/bin/grep -q "SKIN_VERSION=\"$EXPECTED_VERSION\"" "$ROOT/scripts/common-macos.sh"
/usr/bin/env -u HOME EXPECTED_VERSION="$EXPECTED_VERSION" /bin/bash -c '. "$1/scripts/common-macos.sh"; [ -n "$HOME" ] && [ "$SKIN_VERSION" = "$EXPECTED_VERSION" ]' _ "$ROOT"
```

Temporarily set `macos/VERSION` to `1.2.0` only and run `cd macos && npm test`.

Expected: FAIL because package and runtime versions remain `1.1.2`.

- [ ] **Step 2: Update all release metadata to 1.2.0**

Set `VERSION`, `package.json`, `SKIN_VERSION`, customer ZIP copy, and any runtime version literal to `1.2.0`. Do not change unrelated historical changelog entries.

- [ ] **Step 3: Document the shipped workflow and security boundary**

Add a README quick start led by:

```bash
./Open\ Dream\ Skin\ Studio.command
```

Document browser installation, image drag/drop, advanced colors/text, saved-theme switching, restart confirmation, verification screenshot, pause, and full restore. State that the page and API bind only to `127.0.0.1`, use an ephemeral token, load no remote assets, and do not expose arbitrary commands.

Add a `1.2.0 — 2026-07-19` changelog section listing the local browser studio, one-click browser installation, theme library, job progress, explicit restart/restore confirmation, and loopback/token/Origin/Host hardening. Mark the browser control panel as macOS-only in `docs/platforms.md`.

- [ ] **Step 4: Run full tests and build both release formats**

Run: `cd macos && npm test`

Expected: full suite PASS with version `1.2.0`.

Run: `cd macos && ./scripts/build-release.sh`

Expected: creates `release/codex-dream-skin-studio-v1.2.0.zip` and updated SHA-256 file.

Run: `cd macos && ./scripts/build-client-release.sh /tmp/Codex-Dream-Skin-1.2.0-client.zip`

Expected: creates the customer ZIP successfully.

- [ ] **Step 5: Commit**

```bash
git add macos/README.md macos/CLIENT_DEPLOY_PROMPT.md docs/platforms.md macos/CHANGELOG.md macos/VERSION macos/package.json macos/scripts/common-macos.sh macos/scripts/build-client-release.sh macos/tests/run-tests.sh
git commit -m "docs(macos): release local web studio 1.2.0"
```

---

### Task 8: Live Browser and Codex Verification

**Files:**
- Modify only if verification reveals a tested defect; otherwise no source changes.
- Generated, untracked verification artifacts: `/tmp/codex-dream-web-verification/` and `~/Desktop/Codex Dream Skin Verification.png`.

**Interfaces:**
- Consumes: complete local web studio and existing Codex live verification.
- Produces: fresh evidence for the acceptance criteria.

- [ ] **Step 1: Run a clean full test pass**

Run: `cd macos && npm test`

Expected: exit 0 with no failed Node tests and the existing final PASS line.

- [ ] **Step 2: Start the page through the real launcher**

Run: `cd macos && ./Open\ Dream\ Skin\ Studio.command`

Expected: default browser opens an `http://127.0.0.1:<9460-9560>/` page; the visible URL has no token after initialization; `lsof` shows the service listening only on `127.0.0.1`.

Verify:

```bash
/usr/sbin/lsof -nP -iTCP -sTCP:LISTEN | /usr/bin/grep '127.0.0.1:94'
```

- [ ] **Step 3: Exercise the browser workflow**

In the page:

1. If the stable engine is absent, select `Install Dream Skin` and confirm installation completes without launching or restarting Codex.
2. Upload `macos/assets/portal-hero.png` with name `浏览器测试主题`, tagline `本地主题控制台`, quote `BUILD LOCALLY`, and colors `#7cff46`, `#36d7e8`, `#642a8c`.
3. Apply it. If prompted, explicitly authorize one Codex restart.
4. Confirm the job reaches `succeeded`, the saved theme appears exactly once, and the page remains usable after refresh in the same tab session.
5. Run verification and create the screenshot.
6. Pause, reapply, switch to the bundled demo, switch back to `浏览器测试主题`, and verify each state update.

Expected: no raw local paths, token, or unbounded command output appears in the page.

- [ ] **Step 4: Verify Codex home and task routes**

Run from the installed root:

```bash
~/.codex/codex-dream-skin-studio/scripts/verify-dream-skin-macos.sh \
  --screenshot "$HOME/Desktop/Codex Dream Skin Verification.png"
```

Expected JSON: `installed: true`, `stylePresent: true`, `chromePointerEvents: "none"`, native sidebar and composer visible, `documentOverflow.x: false`, and `pass: true` on the current route. Inspect the screenshot, then open a task route and rerun verification with the same expectations for task content and composer interaction.

- [ ] **Step 5: Verify rejection and recovery paths**

Using the browser and `curl`, confirm:

- Upload above 50 MB is rejected without changing the active theme.
- A request without the token returns `401`.
- A request with `Origin: https://example.com` returns `403`.
- `Host: example.com` returns `403`.
- Unknown route and method return bounded JSON errors.
- Full restore requires its confirmation dialog and returns Codex to the official appearance.
- Reopening the control panel after restore offers installation again or reports the retained engine accurately, according to whether uninstall was selected.

- [ ] **Step 6: Run final verification and inspect repository state**

Run:

```bash
cd macos && npm test
git status --short
git log --oneline -8
```

Expected: tests exit 0; only intentional release archives or user-owned pre-existing changes are present; implementation commits appear in task order.

- [ ] **Step 7: Commit any verification-only test correction**

If live verification reveals a defect, stop this task and return to the owning task: add a regression test in that task's named test file, verify the test fails, apply the minimal fix in that task's named source file, rerun the focused test and `npm test`, and use that task's commit command. If no correction is required, do not create an empty commit.
