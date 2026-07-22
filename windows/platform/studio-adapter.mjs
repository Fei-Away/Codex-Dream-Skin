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
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const stateRoot = path.join(localAppData, "CodexDreamSkin");
const enqueueAction = createActionQueue();

function runPowerShell(script, args = [], action = script, timeoutMs = 60000) {
  return runActionProcess({
    action,
    platform: "Windows",
    command: process.env.DREAM_SKIN_POWERSHELL || "powershell.exe",
    args: [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptsRoot, script), ...args,
    ],
    cwd: projectRoot,
    timeoutMs,
  });
}

async function readLog(name) {
  try { return (await fs.readFile(path.join(stateRoot, name), "utf8")).split("\n").filter(Boolean).slice(-80).join("\n"); }
  catch { return ""; }
}

export async function createWindowsStudioAdapter() {
  let version = "unknown";
  try {
    const injector = await fs.readFile(path.join(projectRoot, "scripts", "injector.mjs"), "utf8");
    version = /const SKIN_VERSION = "([^"]+)";/.exec(injector)?.[1] || version;
  } catch {}
  return {
    platform: "win32",
    version,
    paths: {
      stateRoot,
      themeRoot: path.join(stateRoot, "themes"),
      currentThemeRoot: path.join(stateRoot, "active-theme"),
      imagesRoot: path.join(stateRoot, "images"),
      configPath: path.join(os.homedir(), ".codex", "config.toml"),
    },
    async status() {
      try { return JSON.parse((await runPowerShell("status-dream-skin.ps1", ["-Json"], "status", 15000)).stdout); }
      catch (error) { return { session: "error", error: error.message }; }
    },
    async runAction(action, input) {
      const actions = {
        "apply-theme": ["switch-theme.ps1", ["-Id", input.id]],
        start: ["start-dream-skin.ps1", ["-PromptRestart"]],
        reapply: ["start-dream-skin.ps1", ["-PromptRestart"]],
        pause: ["pause-dream-skin.ps1", []],
        restore: ["restore-dream-skin.ps1", ["-RestoreBaseTheme", "-PromptRestart"]],
        doctor: ["verify-dream-skin.ps1", []],
      };
      const entry = actions[action];
      if (!entry) throw new Error(`Unsupported Windows action: ${action}`);
      const timeoutMs = action === "doctor" ? 60000 : action === "pause" || action === "restore" ? 30000 : 90000;
      const result = await enqueueAction(() => runPowerShell(entry[0], entry[1], action, timeoutMs));
      const payload = { output: result.stdout || result.stderr };
      if (action === "doctor") {
        try { payload.doctor = JSON.parse(result.stdout); } catch {}
      }
      return payload;
    },
    async logs() {
      const [injector, injectorError] = await Promise.all([readLog("injector.log"), readLog("injector-error.log")]);
      return { injector, injectorError, startError: "", codexError: "" };
    },
  };
}
