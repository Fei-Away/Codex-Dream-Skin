import { spawn } from "node:child_process";

const OUTPUT_LIMIT = 1024 * 1024;

export class ActionProcessError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ActionProcessError";
    Object.assign(this, details);
  }
}

function appendOutput(current, chunk) {
  if (current.length >= OUTPUT_LIMIT) return current;
  return `${current}${String(chunk)}`.slice(0, OUTPUT_LIMIT);
}

function terminateProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); }
  catch { try { child.kill("SIGTERM"); } catch {} }
  const forceTimer = setTimeout(() => {
    try { process.kill(-child.pid, "SIGKILL"); }
    catch { try { child.kill("SIGKILL"); } catch {} }
  }, 750);
  forceTimer.unref();
}

export function runActionProcess({
  action,
  platform,
  command,
  args = [],
  cwd,
  env = process.env,
  timeoutMs = 60000,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout = appendOutput(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = appendOutput(stderr, chunk); });
    child.on("error", (cause) => finish(() => reject(new ActionProcessError(
      `${platform} ${action} 启动失败：${cause.message}`,
      { code: "ACTION_SPAWN_FAILED", action, platform, cause },
    ))));
    child.on("close", (exitCode, signal) => finish(() => {
      const output = { stdout: stdout.trim(), stderr: stderr.trim(), exitCode, signal };
      if (timedOut) {
        reject(new ActionProcessError(
          `${platform} ${action} 超过 ${timeoutMs} ms，已终止卡住的子进程`,
          { ...output, code: "ACTION_TIMEOUT", action, platform, timeoutMs },
        ));
      } else if (exitCode !== 0) {
        reject(new ActionProcessError(
          (stderr || stdout || `${platform} ${action} 失败，退出码 ${exitCode}`).trim(),
          { ...output, code: "ACTION_FAILED", action, platform },
        ));
      } else {
        resolve(output);
      }
    }));
  });
}

export function createActionQueue() {
  let pending = Promise.resolve();
  return (task) => {
    const next = pending.then(task, task);
    pending = next.catch(() => {});
    return next;
  };
}
