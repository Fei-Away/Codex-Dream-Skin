import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedRoot = await (async () => {
  const candidates = [
    process.env.DREAM_SKIN_SHARED_ROOT,
    path.join(projectRoot, "shared"),
    path.resolve(projectRoot, "..", "shared"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await fs.access(path.join(candidate, "process", "run-action.mjs")); return candidate; } catch {}
  }
  throw new Error("Shared Dream Skin action runner is missing.");
})();
const { createActionQueue, runActionProcess } = await import(
  pathToFileURL(path.join(sharedRoot, "process", "run-action.mjs"))
);
const scriptsRoot = path.join(projectRoot, "scripts");
const stateRoot = path.join(os.homedir(), "Library", "Application Support", "CodexDreamSkinStudio");
const enqueueAction = createActionQueue();

function runScript(script, args = [], action = script, timeoutMs = 60000) {
  const scriptPath = path.join(scriptsRoot, script);
  const command = script.endsWith(".mjs") ? process.execPath : "/bin/bash";
  return runActionProcess({
    action,
    platform: "macOS",
    command,
    args: [scriptPath, ...args],
    cwd: projectRoot,
    env: { ...process.env, PATH: "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin" },
    timeoutMs,
  });
}

async function readLog(name) {
  try { return (await fs.readFile(path.join(stateRoot, name), "utf8")).split("\n").filter(Boolean).slice(-80).join("\n"); }
  catch { return ""; }
}

export async function createMacosStudioAdapter() {
  let version = "unknown";
  try { version = (await fs.readFile(path.join(projectRoot, "VERSION"), "utf8")).trim(); } catch {}
  const adapter = {
    platform: "darwin",
    version,
    paths: {
      stateRoot,
      themeRoot: path.join(stateRoot, "themes"),
      currentThemeRoot: path.join(stateRoot, "theme"),
      imagesRoot: path.join(stateRoot, "images"),
      configPath: path.join(os.homedir(), ".codex", "config.toml"),
    },
    async status() {
      try { return JSON.parse((await runScript("status-dream-skin-macos.sh", ["--json"], "status", 15000)).stdout); }
      catch (error) { return { session: "error", error: error.message }; }
    },
    async runAction(action, input) {
      const actions = {
        "apply-theme": ["switch-theme-macos.sh", ["--id", input.id]],
        start: ["start-dream-skin-macos.sh", ["--port", "9341", "--prompt-restart"]],
        reapply: ["start-dream-skin-macos.sh", ["--port", "9341", "--prompt-restart"]],
        pause: ["pause-dream-skin-macos.sh", []],
        restore: ["restore-dream-skin-macos.sh", ["--restore-base-theme", "--prompt-restart"]],
        doctor: ["doctor-macos.sh", []],
      };
      const entry = actions[action];
      if (!entry) throw new Error(`不支持的 macOS 操作：${action}`);
      const timeoutMs = action === "doctor" ? 60000 : action === "pause" || action === "restore" ? 30000 : 90000;
      const result = await enqueueAction(() => runScript(entry[0], entry[1], action, timeoutMs));
      const payload = { output: result.stdout || result.stderr };
      if (action === "doctor") {
        try { payload.doctor = JSON.parse(result.stdout); } catch {}
      }
      return payload;
    },
    async logs() {
      const [injector, injectorError, startError, codexError] = await Promise.all([
        readLog("injector.log"), readLog("injector-error.log"), readLog("start-error.log"), readLog("codex-launch-error.log"),
      ]);
      return { injector, injectorError, startError, codexError };
    },
  };
  return adapter;
}
