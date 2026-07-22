import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createWindowsStudioAdapter } from "../platform/studio-adapter.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function resolveSharedRoot() {
  const candidates = [process.env.DREAM_SKIN_SHARED_ROOT, path.join(projectRoot, "shared"), path.resolve(projectRoot, "..", "shared")].filter(Boolean);
  for (const candidate of candidates) {
    try { await fs.access(path.join(candidate, "studio", "server.mjs")); return candidate; } catch {}
  }
  throw new Error("Shared Dream Skin Studio is missing; reinstall the complete package.");
}

const sharedRoot = await resolveSharedRoot();
const { createStudioServer } = await import(pathToFileURL(path.join(sharedRoot, "studio", "server.mjs")));
const studio = await createStudioServer({
  adapter: await createWindowsStudioAdapter(),
  sharedRoot,
  port: Number(process.env.DREAM_SKIN_STUDIO_PORT || 8765),
});
await studio.listen();
console.log(`Dream Skin Studio running at http://127.0.0.1:${studio.port}`);
