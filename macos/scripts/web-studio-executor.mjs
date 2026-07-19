import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { WebStudioError, validateThemeId } from "./web-studio-shared.mjs";
import { createThemeStore } from "./web-studio-theme-store.mjs";

const OUTPUT_LIMIT = 256 * 1024;
const PORT_MIN = 1024;
const PORT_MAX = 65535;

function appendBounded(current, chunk) {
  const next = current + chunk.toString("utf8");
  return next.length > OUTPUT_LIMIT ? next.slice(-OUTPUT_LIMIT) : next;
}

export function runFixedFile(file, args) {
  if (!path.isAbsolute(file) || !Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new TypeError("runFixedFile requires an absolute executable and string arguments");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.on("error", (error) => {
      reject(new WebStudioError(
        "operation_failed",
        `${path.basename(file)} could not be started.`,
        500,
        { cause: error.code ?? "spawn_error" },
      ));
    });
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new WebStudioError(
        "operation_failed",
        `${path.basename(file)} failed.`,
        500,
        { exitCode: code, signal: signal ?? null },
      ));
    });
  });
}

async function optionalLstat(file) {
  try {
    return await fs.lstat(file);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function validPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) {
    throw new WebStudioError("operation_failed", "Dream Skin reported an invalid CDP port.", 500);
  }
  return port;
}

async function readTail(file, maximumBytes = 64 * 1024) {
  const stat = await optionalLstat(file);
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size < 1) return [];
  const handle = await fs.open(file, "r");
  try {
    const length = Math.min(stat.size, maximumBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, stat.size - length);
    return buffer.toString("utf8").split(/\r?\n/).filter(Boolean);
  } finally {
    await handle.close();
  }
}

function boundedLine(value) {
  return [...String(value)].slice(0, 500).join("");
}

export function createWebStudioExecutor({
  sourceRoot,
  installRoot,
  stateRoot,
  nodePath,
  runFile = runFixedFile,
  inspectLockOwner,
  processStartedAt,
  themeStore,
}) {
  const webStateRoot = path.join(stateRoot, "web-studio");
  const lockPath = path.join(webStateRoot, "mutation.lock");
  const screenshotPath = path.join(webStateRoot, "verification.png");
  const serverPath = path.join(sourceRoot, "scripts", "web-studio-server.mjs");

  const run = (file, args) => runFile(file, args, { shell: false });
  const store = themeStore ?? createThemeStore({
    stateRoot,
    projectRoot: sourceRoot,
    nodePath,
    runFile: run,
    now: () => new Date(),
    randomHex: (bytes) => randomBytes(bytes).toString("hex"),
  });

  async function isInstalled() {
    const stat = await optionalLstat(path.join(installRoot, "VERSION"));
    return Boolean(stat?.isFile() && !stat.isSymbolicLink());
  }

  async function runScript(root, name, args = []) {
    return run(path.join(root, "scripts", name), args);
  }

  async function requireInstalled() {
    if (!(await isInstalled())) {
      throw new WebStudioError("not_installed", "Dream Skin is not installed.", 409);
    }
  }

  async function defaultStartedAt(pid = process.pid) {
    const { stdout } = await runFixedFile("/bin/ps", ["-p", String(pid), "-o", "lstart="]);
    return stdout.trim();
  }

  async function defaultInspect(record) {
    if (!Number.isInteger(record?.pid) || record.pid < 2 || typeof record.startedAt !== "string") {
      return { alive: false, matches: false };
    }
    try {
      const { stdout } = await runFixedFile("/bin/ps", [
        "-p", String(record.pid), "-o", "lstart=", "-o", "command=",
      ]);
      return {
        alive: Boolean(stdout.trim()),
        matches: stdout.includes(record.startedAt) && stdout.includes(serverPath),
      };
    } catch {
      return { alive: false, matches: false };
    }
  }

  const startedAt = processStartedAt ?? defaultStartedAt;
  const inspectOwner = inspectLockOwner ?? defaultInspect;

  async function acquireLock(operation) {
    await fs.mkdir(webStateRoot, { recursive: true, mode: 0o700 });
    await fs.chmod(webStateRoot, 0o700);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await fs.open(lockPath, "wx", 0o600);
        const record = {
          pid: process.pid,
          startedAt: await startedAt(process.pid),
          operation,
        };
        await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
        await handle.close();
        return async () => {
          const stat = await optionalLstat(lockPath);
          if (stat?.isFile() && !stat.isSymbolicLink()) await fs.rm(lockPath, { force: true });
        };
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const stat = await optionalLstat(lockPath);
        if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
          throw new WebStudioError("conflict", "Dream Skin is busy with another operation.", 409);
        }
        let record;
        try {
          record = JSON.parse(await fs.readFile(lockPath, "utf8"));
        } catch {
          throw new WebStudioError("conflict", "Dream Skin has an unreadable operation lock.", 409);
        }
        const owner = await inspectOwner(record);
        if (owner?.alive && owner?.matches) {
          throw new WebStudioError("conflict", "Dream Skin is busy with another operation.", 409);
        }
        await fs.rm(lockPath, { force: true });
      }
    }
    throw new WebStudioError("conflict", "Dream Skin is busy with another operation.", 409);
  }

  async function withMutation(operation, task) {
    const release = await acquireLock(operation);
    try {
      return await task();
    } finally {
      await release();
    }
  }

  async function diagnostics() {
    const known = [
      "injector-error.log",
      "start-error.log",
      "web-studio-server-error.log",
    ];
    const lines = [];
    for (const name of known) lines.push(...await readTail(path.join(stateRoot, name)));
    return lines.map((line) => boundedLine(line)
      .replaceAll(stateRoot, "[STATE]")
      .replace(/#token=[A-Za-z0-9_-]+/g, "#token=[REDACTED]")
      .replace(/(?:\/private)?\/tmp\/[^\s]+/g, "[TEMP]"))
      .slice(-40);
  }

  async function status() {
    const installed = await isInstalled();
    const root = installed ? installRoot : sourceRoot;
    let parsed = {};
    try {
      const { stdout } = await runScript(root, "status-dream-skin-macos.sh", ["--json", "--deep"]);
      parsed = JSON.parse(stdout);
    } catch (error) {
      if (error instanceof WebStudioError) throw error;
      throw new WebStudioError("operation_failed", "Dream Skin status is invalid.", 500);
    }
    const version = (await fs.readFile(path.join(sourceRoot, "VERSION"), "utf8")).trim();
    const installedVersion = installed
      ? (await fs.readFile(path.join(installRoot, "VERSION"), "utf8")).trim()
      : null;
    return {
      installed,
      version,
      installedVersion,
      updateAvailable: installed && installedVersion !== version,
      codexRunning: parsed.codexRunning === true,
      cdpOk: parsed.cdpOk === true,
      injectorAlive: parsed.injectorAlive === true,
      session: typeof parsed.session === "string" ? parsed.session : "unknown",
      port: validPort(parsed.port ?? 9341),
      themeName: typeof parsed.themeName === "string" ? parsed.themeName : "",
      recentLogs: await diagnostics(),
    };
  }

  async function applyActive({ allowRestart, progress }) {
    await requireInstalled();
    progress("检查 Codex 运行状态…");
    const current = await status();
    if (current.codexRunning && !current.cdpOk && !allowRestart) {
      throw new WebStudioError(
        "restart_required",
        "Codex 需要重启一次才能应用主题。",
        409,
      );
    }
    const args = ["--port", String(current.port)];
    if (current.codexRunning && !current.cdpOk && allowRestart) args.push("--restart-existing");
    progress(current.cdpOk ? "正在热更新主题…" : "正在启动 Codex 并应用主题…");
    await runScript(installRoot, "start-dream-skin-macos.sh", args);
    return { applied: true, restarted: args.includes("--restart-existing"), port: current.port };
  }

  async function install({ progress }) {
    return withMutation("install", async () => {
      progress("正在安装 Dream Skin…");
      await runScript(sourceRoot, "install-dream-skin-macos.sh", ["--no-launch"]);
      progress("安装完成。");
      return { installed: true, version: (await fs.readFile(path.join(installRoot, "VERSION"), "utf8")).trim() };
    });
  }

  async function createTheme({ bytes, fields, progress }) {
    return withMutation("create-theme", async () => {
      await requireInstalled();
      progress("正在处理图片…");
      const theme = await store.saveTheme({ bytes, fields });
      if (!fields.apply) return { theme, application: null };
      progress("正在激活主题…");
      await store.activateTheme(theme.id);
      const application = await applyActive({ allowRestart: fields.allowRestart, progress });
      return { theme: { ...theme, active: true }, application };
    });
  }

  async function applyTheme({ id, allowRestart, progress }) {
    return withMutation("apply-theme", async () => {
      await requireInstalled();
      const valid = validateThemeId(id);
      progress("正在切换主题…");
      const theme = await store.activateTheme(valid);
      const application = await applyActive({ allowRestart, progress });
      return { theme, application };
    });
  }

  async function deleteTheme({ id, progress }) {
    return withMutation("delete-theme", async () => {
      await requireInstalled();
      progress("正在删除主题…");
      await store.deleteTheme(validateThemeId(id));
      return { deleted: true, id };
    });
  }

  async function applyDemo({ allowRestart, progress }) {
    return withMutation("apply-demo", async () => {
      await requireInstalled();
      progress("正在恢复演示主题…");
      const theme = await store.applyDemo();
      const application = await applyActive({ allowRestart, progress });
      return { theme, application };
    });
  }

  async function reapply({ allowRestart, progress }) {
    return withMutation("reapply", () => applyActive({ allowRestart, progress }));
  }

  async function pause({ progress }) {
    return withMutation("pause", async () => {
      await requireInstalled();
      progress("正在暂停皮肤…");
      await runScript(installRoot, "pause-dream-skin-macos.sh", []);
      return { paused: true };
    });
  }

  async function verify({ progress }) {
    return withMutation("verify", async () => {
      await requireInstalled();
      await fs.mkdir(webStateRoot, { recursive: true, mode: 0o700 });
      await fs.rm(screenshotPath, { force: true });
      progress("正在验证 Codex 页面…");
      const { stdout } = await runScript(installRoot, "verify-dream-skin-macos.sh", [
        "--screenshot", screenshotPath,
      ]);
      let result;
      try {
        result = JSON.parse(stdout);
      } catch {
        throw new WebStudioError("verification_failed", "Verification returned invalid data.", 500);
      }
      if (result.pass !== true && !result.targets?.some((target) => target.result?.pass === true)) {
        throw new WebStudioError("verification_failed", "Dream Skin verification failed.", 409);
      }
      return { ...result, pass: true, screenshotUrl: "/api/verification/screenshot" };
    });
  }

  async function restore({ confirmation, allowRestart, progress }) {
    if (confirmation !== "restore-official" || allowRestart !== true) {
      throw new WebStudioError(
        "validation_error",
        "Restoring the official appearance requires explicit confirmation and restart authorization.",
      );
    }
    return withMutation("restore", async () => {
      await requireInstalled();
      progress("正在恢复官方界面…");
      await runScript(installRoot, "restore-dream-skin-macos.sh", [
        "--restore-base-theme", "--restart-codex",
      ]);
      return { restored: true };
    });
  }

  async function verificationScreenshot() {
    const stat = await optionalLstat(screenshotPath);
    if (!stat || stat.isSymbolicLink() || !stat.isFile() || stat.size < 1) {
      throw new WebStudioError("not_found", "Verification screenshot was not found.", 404);
    }
    return { path: screenshotPath, contentType: "image/png" };
  }

  return {
    status,
    themes: () => store.listThemes(),
    themeImage: (id) => store.resolveThemeImage(validateThemeId(id)),
    verificationScreenshot,
    install,
    createTheme,
    applyTheme,
    deleteTheme,
    applyDemo,
    reapply,
    pause,
    verify,
    restore,
  };
}
