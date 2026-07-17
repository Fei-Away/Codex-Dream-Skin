import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const args = process.argv.slice(2);

function valueFor(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
  return value;
}

const port = Number(valueFor("port", "9342"));
const projectRoot = path.resolve(valueFor("root", path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")));
const stateRoot = path.resolve(valueFor("state-root", path.join(process.env.HOME || ".", "Library/Application Support/CodexDreamSkinStudio")));
const themeDir = path.join(stateRoot, "theme");
const studioRoot = path.join(projectRoot, "studio");
const themeScript = path.join(projectRoot, "scripts", "write-theme.mjs");
const injectorScript = path.join(projectRoot, "scripts", "injector.mjs");
const autoloadScript = path.join(projectRoot, "scripts", "autoload-dream-skin-macos.sh");
const startScript = path.join(projectRoot, "scripts", "start-dream-skin-macos.sh");
const nodeBin = process.execPath;
const maxBodyBytes = 72 * 1024 * 1024;

if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`Invalid port: ${port}`);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendText(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "content-type": contentType, "content-length": Buffer.byteLength(body) });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readJsonFile(file, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function safeText(value, fallback, max) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function safeHex(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function safeAppearance(value) {
  return ["system", "dark", "light"].includes(value) ? value : "system";
}

async function activeTheme() {
  let sourceRoot = themeDir;
  let configPath = path.join(themeDir, "theme.json");
  if (!fsSync.existsSync(configPath)) {
    sourceRoot = path.join(projectRoot, "assets");
    configPath = path.join(sourceRoot, "theme.json");
  }
  const theme = await readJsonFile(configPath, {});
  const image = path.basename(typeof theme.image === "string" ? theme.image : "portal-hero.png");
  const imagePath = path.join(sourceRoot, image);
  let preview = "";
  try {
    const bytes = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    preview = `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {}
  return {
    id: theme.id || "custom",
    name: theme.name || "Dream Skin",
    tagline: theme.tagline || "把喜欢的画面变成可交互的 Codex 工作台。",
    quote: theme.quote || "MAKE SOMETHING WONDERFUL",
    appearance: safeAppearance(theme.appearance),
    image,
    preview,
    colors: {
      accent: safeHex(theme.colors?.accent, "#7cff46"),
      secondary: safeHex(theme.colors?.secondary, "#36d7e8"),
      highlight: safeHex(theme.colors?.highlight, "#642a8c"),
    },
  };
}

function autoLoadStatus() {
  try {
    const output = execFileSync(autoloadScript, ["status", "--json"], { encoding: "utf8", timeout: 3000 });
    return JSON.parse(output);
  } catch {
    return { enabled: false, paused: false, agentLoaded: false, codexRunning: false, cdpReady: false, injectorAlive: false, port: 9342 };
  }
}

function runScript(script, scriptArgs) {
  const result = spawnSync(script, scriptArgs, { encoding: "utf8", timeout: 45000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `Command failed: ${script}`).trim());
  return (result.stdout || "").trim();
}

function decodeImage(dataUrl) {
  const match = /^data:image\/(png|jpe?g|webp);base64,([a-z0-9+/=]+)$/i.exec(dataUrl || "");
  if (!match) throw new Error("Please choose a PNG, JPEG, or WebP image.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 1 || bytes.length > 50 * 1024 * 1024) throw new Error("Image must be between 1 byte and 50 MB.");
  return bytes;
}

async function applyTheme(input) {
  const current = await activeTheme();
  const themeName = safeText(input.name, current.name, 80);
  const tagline = safeText(input.tagline, current.tagline, 160);
  const quote = safeText(input.quote, current.quote, 80);
  const appearance = safeAppearance(input.appearance || current.appearance);
  const accent = safeHex(input.accent, current.colors.accent);
  const secondary = safeHex(input.secondary, current.colors.secondary);
  const highlight = safeHex(input.highlight, current.colors.highlight);

  await fs.mkdir(themeDir, { recursive: true, mode: 0o700 });
  let imageName = current.image;
  const currentImagePath = path.join(themeDir, imageName);
  if (input.imageDataUrl) {
    const source = path.join("/tmp", `codex-dream-skin-studio-${process.pid}-${crypto.randomUUID()}.upload`);
    const preparedName = `background-${Date.now()}.jpg`;
    const prepared = path.join(themeDir, preparedName);
    await fs.writeFile(source, decodeImage(input.imageDataUrl), { mode: 0o600 });
    try {
      const result = spawnSync("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "84", "-Z", "3200", source, "--out", prepared], { encoding: "utf8", timeout: 30000 });
      if (result.status !== 0) throw new Error((result.stderr || "macOS could not prepare the selected image.").trim());
    } finally {
      await fs.rm(source, { force: true });
    }
    const stat = await fs.stat(prepared);
    if (stat.size > 16 * 1024 * 1024) throw new Error("Prepared image is larger than 16 MB.");
    imageName = preparedName;
    for (const entry of await fs.readdir(themeDir)) {
      if (entry.startsWith("background-") && entry !== imageName) await fs.rm(path.join(themeDir, entry), { force: true });
    }
  } else if (!fsSync.existsSync(currentImagePath)) {
    imageName = "portal-hero.png";
    await fs.copyFile(path.join(projectRoot, "assets", imageName), path.join(themeDir, imageName));
  }

  runScript(nodeBin, [themeScript, "custom", "--output-dir", themeDir, "--image", imageName, "--name", themeName, "--tagline", tagline, "--quote", quote, "--appearance", appearance, "--accent", accent, "--secondary", secondary, "--highlight", highlight]);
  const status = autoLoadStatus();
  if (status.enabled) runScript(autoloadScript, ["enable"]);
  else runScript(startScript, []);
  return activeTheme();
}

async function resetTheme() {
  runScript(nodeBin, [themeScript, "reset-demo", "--output-dir", themeDir]);
  const status = autoLoadStatus();
  if (status.enabled) runScript(autoloadScript, ["enable"]);
  else runScript(startScript, []);
  return activeTheme();
}

async function applyAutoLoad(input) {
  return runScript(autoloadScript, input.enabled ? ["enable"] : ["disable"]);
}

async function apiState() {
  return { theme: await activeTheme(), autoload: autoLoadStatus(), version: "1.5.2" };
}

async function handleApi(request, response, pathname) {
  try {
    if (request.method === "GET" && pathname === "/api/state") return sendJson(response, 200, await apiState());
    if (request.method === "POST" && pathname === "/api/apply") return sendJson(response, 200, { theme: await applyTheme(await readJson(request)) });
    if (request.method === "POST" && pathname === "/api/reset") return sendJson(response, 200, { theme: await resetTheme() });
    if (request.method === "POST" && pathname === "/api/autoload") return sendJson(response, 200, { message: await applyAutoLoad(await readJson(request)), autoload: autoLoadStatus() });
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(response, 400, { error: error.message || String(error) });
  }
}

async function serveStatic(response, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const baseRoot = relative.startsWith("assets/") ? projectRoot : studioRoot;
  const file = path.resolve(baseRoot, relative);
  if (!file.startsWith(`${baseRoot}${path.sep}`)) return sendText(response, 403, "Forbidden");
  try {
    const body = await fs.readFile(file);
    const type = mimeTypes.get(path.extname(file).toLowerCase()) || "application/octet-stream";
    response.writeHead(200, { "content-type": type, "cache-control": "no-store", "content-length": body.length });
    response.end(body);
  } catch {
    sendText(response, 404, "Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith("/api/")) return handleApi(request, response, url.pathname);
  return serveStatic(response, decodeURIComponent(url.pathname));
});

server.listen(port, "127.0.0.1", () => {
  const address = `http://127.0.0.1:${port}/`;
  console.log(`Codex Dream Skin Theme Studio: ${address}`);
  if (args.includes("--open")) spawnSync("/usr/bin/open", [address]);
});
