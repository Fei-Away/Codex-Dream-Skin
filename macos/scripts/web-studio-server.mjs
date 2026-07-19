import { randomBytes as cryptoRandomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createWebStudioExecutor } from "./web-studio-executor.mjs";
import {
  LIMITS,
  WebStudioError,
  assertRequestAuthority,
  tokenMatches,
  validateThemeFields,
} from "./web-studio-shared.mjs";

const CSP = [
  "default-src 'self'",
  "img-src 'self' blob:",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/studio.css", ["studio.css", "text/css; charset=utf-8"]],
  ["/studio-client.mjs", ["studio-client.mjs", "text/javascript; charset=utf-8"]],
  ["/studio.js", ["studio.js", "text/javascript; charset=utf-8"]],
]);

function baseHeaders() {
  return {
    "Content-Security-Policy": CSP,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
  };
}

function writeJson(response, status, value, extraHeaders = {}) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  response.writeHead(status, {
    ...baseHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    ...extraHeaders,
  });
  response.end(body);
}

function errorValue(error) {
  if (error instanceof WebStudioError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "operation_failed",
        message: "The local control service could not complete the request.",
        details: null,
      },
    },
  };
}

async function readBoundedBody(request, maximum) {
  const declared = request.headers["content-length"];
  if (declared !== undefined) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new WebStudioError("validation_error", "Invalid Content-Length header.");
    }
    if (length > maximum) {
      throw new WebStudioError("payload_too_large", "Request body is too large.", 413);
    }
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maximum) {
      throw new WebStudioError("payload_too_large", "Request body is too large.", 413);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

function assertContentType(request, expected) {
  const value = String(request.headers["content-type"] ?? "").toLowerCase();
  if (!value.startsWith(expected)) {
    throw new WebStudioError("unsupported_media_type", `Expected ${expected}.`, 415);
  }
  return value;
}

async function readJson(request, allowedFields) {
  assertContentType(request, "application/json");
  const body = await readBoundedBody(request, LIMITS.jsonBytes);
  let value;
  try {
    value = body.length ? JSON.parse(body.toString("utf8")) : {};
  } catch {
    throw new WebStudioError("validation_error", "Request JSON is invalid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WebStudioError("validation_error", "Request JSON must be an object.");
  }
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) {
      throw new WebStudioError("validation_error", `Unknown field: ${key}.`);
    }
  }
  return value;
}

function formBoolean(value, name, fallback) {
  if (value === null) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new WebStudioError("validation_error", `${name} must be true or false.`);
}

async function readThemeForm(request, expectedHost) {
  const contentType = assertContentType(request, "multipart/form-data");
  const body = await readBoundedBody(request, LIMITS.multipartBytes);
  let form;
  try {
    const webRequest = new Request(`http://${expectedHost}/api/themes`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
    form = await webRequest.formData();
  } catch {
    throw new WebStudioError("validation_error", "Theme upload form is invalid.");
  }
  const allowed = new Set([
    "image", "name", "tagline", "quote", "accent", "secondary", "highlight", "apply", "allowRestart",
  ]);
  for (const key of form.keys()) {
    if (!allowed.has(key)) throw new WebStudioError("validation_error", `Unknown field: ${key}.`);
    if (form.getAll(key).length !== 1) throw new WebStudioError("validation_error", `Field ${key} must appear once.`);
  }
  const image = form.get("image");
  if (!image || typeof image.arrayBuffer !== "function") {
    throw new WebStudioError("validation_error", "Exactly one image file is required.");
  }
  const raw = {};
  for (const name of ["name", "tagline", "quote", "accent", "secondary", "highlight"]) {
    const value = form.get(name);
    if (value !== null) {
      if (typeof value !== "string") throw new WebStudioError("validation_error", `${name} must be text.`);
      raw[name] = value;
    }
  }
  raw.apply = formBoolean(form.get("apply"), "apply", true);
  raw.allowRestart = formBoolean(form.get("allowRestart"), "allowRestart", false);
  return {
    bytes: Buffer.from(await image.arrayBuffer()),
    fields: validateThemeFields(raw),
  };
}

function cleanProgress(value) {
  return [...String(value)].slice(0, 500).join("");
}

function publicJob(job) {
  return {
    id: job.id,
    operation: job.operation,
    state: job.state,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    progress: job.progress,
    logs: [...job.logs],
    result: job.result,
    error: job.error,
  };
}

async function writeReadyFifo(readyFifo, url) {
  if (!path.isAbsolute(readyFifo) ||
      !(readyFifo.startsWith("/tmp/") || readyFifo.startsWith("/private/tmp/"))) {
    throw new WebStudioError("validation_error", "Ready FIFO must be an absolute temporary path.");
  }
  const stat = await fs.lstat(readyFifo);
  if (!stat.isFIFO() || stat.uid !== process.getuid()) {
    throw new WebStudioError("validation_error", "Ready path is not a private FIFO.");
  }
  const handle = await fs.open(readyFifo, "w");
  try {
    await handle.writeFile(`${url}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

export function createWebStudioServer({
  host = "127.0.0.1",
  port,
  readyFifo = null,
  assetRoot,
  executor,
  idleMs = 30 * 60 * 1000,
  jobRetentionMs = 5 * 60 * 1000,
  randomBytes = cryptoRandomBytes,
}) {
  if (host !== "127.0.0.1") throw new TypeError("Web Studio host must be 127.0.0.1");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError("Invalid server port");
  if (!path.isAbsolute(assetRoot)) throw new TypeError("assetRoot must be absolute");
  if (!executor || typeof executor.status !== "function") throw new TypeError("executor is required");
  if (!Number.isFinite(idleMs) || idleMs < 1) throw new TypeError("idleMs must be positive");

  const token = randomBytes(32).toString("base64url");
  const jobs = new Map();
  let jobSequence = 0;
  let activeJobs = 0;
  let lastActivity = Date.now();
  let listening = false;
  let closing = null;

  function touch() {
    lastActivity = Date.now();
  }

  function queueJob(operation, task) {
    const id = `job-${Date.now()}-${jobSequence += 1}-${randomBytes(6).toString("hex")}`;
    const job = {
      id,
      operation,
      state: "queued",
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      progress: "等待执行…",
      logs: [],
      result: null,
      error: null,
    };
    jobs.set(id, job);
    queueMicrotask(async () => {
      activeJobs += 1;
      job.state = "running";
      job.startedAt = new Date().toISOString();
      touch();
      const progress = (message) => {
        const clean = cleanProgress(message);
        job.progress = clean;
        job.logs.push(clean);
        if (job.logs.length > LIMITS.jobLogLines) job.logs.splice(0, job.logs.length - LIMITS.jobLogLines);
        touch();
      };
      try {
        job.result = await task(progress);
        job.state = "succeeded";
      } catch (error) {
        const normalized = errorValue(error);
        job.error = normalized.body.error;
        job.state = "failed";
      } finally {
        job.finishedAt = new Date().toISOString();
        activeJobs -= 1;
        touch();
        const timer = setTimeout(() => jobs.delete(id), jobRetentionMs);
        timer.unref?.();
      }
    });
    return id;
  }

  async function sendManagedFile(response, managed) {
    const stat = await fs.lstat(managed.path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1) {
      throw new WebStudioError("not_found", "Managed file was not found.", 404);
    }
    const body = await fs.readFile(managed.path);
    response.writeHead(200, {
      ...baseHeaders(),
      "Content-Type": managed.contentType,
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store",
    });
    response.end(body);
  }

  async function routeApi(request, response, pathname, expectedHost) {
    if (request.method === "OPTIONS") {
      throw new WebStudioError("method_not_allowed", "CORS preflight is not supported.", 405);
    }
    if (!tokenMatches(request.headers["x-dream-skin-token"], token)) {
      throw new WebStudioError("unauthorized", "A valid local session token is required.", 401);
    }
    const mutating = request.method === "POST" || request.method === "DELETE";
    assertRequestAuthority({
      host: request.headers.host,
      origin: request.headers.origin,
      expectedHost,
      mutating,
    });

    if (request.method === "GET" && pathname === "/api/status") {
      writeJson(response, 200, await executor.status());
      return;
    }
    if (request.method === "GET" && pathname === "/api/themes") {
      writeJson(response, 200, await executor.themes());
      return;
    }
    const themeImage = pathname.match(/^\/api\/themes\/([^/]+)\/image$/);
    if (request.method === "GET" && themeImage) {
      await sendManagedFile(response, await executor.themeImage(themeImage[1]));
      return;
    }
    if (request.method === "GET" && pathname === "/api/verification/screenshot") {
      await sendManagedFile(response, await executor.verificationScreenshot());
      return;
    }
    const jobMatch = pathname.match(/^\/api\/jobs\/(job-[A-Za-z0-9-]+)$/);
    if (request.method === "GET" && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) throw new WebStudioError("not_found", "Job was not found.", 404);
      writeJson(response, 200, publicJob(job));
      return;
    }

    let operation;
    let task;
    if (request.method === "POST" && pathname === "/api/install") {
      await readJson(request, new Set());
      operation = "install";
      task = (progress) => executor.install({ progress });
    } else if (request.method === "POST" && pathname === "/api/themes") {
      const form = await readThemeForm(request, expectedHost);
      operation = "create-theme";
      task = (progress) => executor.createTheme({ ...form, progress });
    } else {
      const applyMatch = pathname.match(/^\/api\/themes\/([^/]+)\/apply$/);
      const deleteMatch = pathname.match(/^\/api\/themes\/([^/]+)$/);
      if (request.method === "POST" && applyMatch) {
        const input = await readJson(request, new Set(["allowRestart"]));
        if (input.allowRestart !== undefined && typeof input.allowRestart !== "boolean") {
          throw new WebStudioError("validation_error", "allowRestart must be a boolean.");
        }
        operation = "apply-theme";
        task = (progress) => executor.applyTheme({
          id: applyMatch[1],
          allowRestart: input.allowRestart ?? false,
          progress,
        });
      } else if (request.method === "DELETE" && deleteMatch) {
        const input = await readJson(request, new Set());
        operation = "delete-theme";
        task = (progress) => executor.deleteTheme({ id: deleteMatch[1], ...input, progress });
      } else if (request.method === "POST" && pathname === "/api/demo/apply") {
        const input = await readJson(request, new Set(["allowRestart"]));
        if (input.allowRestart !== undefined && typeof input.allowRestart !== "boolean") {
          throw new WebStudioError("validation_error", "allowRestart must be a boolean.");
        }
        operation = "apply-demo";
        task = (progress) => executor.applyDemo({ allowRestart: input.allowRestart ?? false, progress });
      } else if (request.method === "POST" && pathname === "/api/session/reapply") {
        const input = await readJson(request, new Set(["allowRestart"]));
        if (input.allowRestart !== undefined && typeof input.allowRestart !== "boolean") {
          throw new WebStudioError("validation_error", "allowRestart must be a boolean.");
        }
        operation = "reapply";
        task = (progress) => executor.reapply({ allowRestart: input.allowRestart ?? false, progress });
      } else if (request.method === "POST" && pathname === "/api/session/pause") {
        await readJson(request, new Set());
        operation = "pause";
        task = (progress) => executor.pause({ progress });
      } else if (request.method === "POST" && pathname === "/api/verify") {
        await readJson(request, new Set());
        operation = "verify";
        task = (progress) => executor.verify({ progress });
      } else if (request.method === "POST" && pathname === "/api/restore") {
        const input = await readJson(request, new Set(["confirmation", "allowRestart"]));
        if (typeof input.confirmation !== "string" || typeof input.allowRestart !== "boolean") {
          throw new WebStudioError("validation_error", "Restore confirmation is invalid.");
        }
        operation = "restore";
        task = (progress) => executor.restore({ ...input, progress });
      }
    }

    if (!operation || !task) throw new WebStudioError("not_found", "API route was not found.", 404);
    const jobId = queueJob(operation, task);
    writeJson(response, 202, { jobId });
  }

  async function handle(request, response) {
    touch();
    const address = server.address();
    const expectedHost = `127.0.0.1:${address.port}`;
    assertRequestAuthority({
      host: request.headers.host,
      origin: request.headers.origin,
      expectedHost,
      mutating: false,
    });
    const url = new URL(request.url ?? "/", `http://${expectedHost}`);
    const pathname = url.pathname;
    if (pathname.startsWith("/api/")) {
      await routeApi(request, response, pathname, expectedHost);
      return;
    }
    if (request.method !== "GET") {
      throw new WebStudioError("method_not_allowed", "Only GET is allowed for local assets.", 405);
    }
    const asset = STATIC_FILES.get(pathname);
    if (!asset) throw new WebStudioError("not_found", "Page was not found.", 404);
    const [filename, contentType] = asset;
    const body = await fs.readFile(path.join(assetRoot, filename));
    response.writeHead(200, {
      ...baseHeaders(),
      "Content-Type": contentType,
      "Content-Length": String(body.length),
    });
    response.end(body);
  }

  const server = http.createServer((request, response) => {
    handle(request, response).catch((error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const normalized = errorValue(error);
      writeJson(response, normalized.status, normalized.body);
    });
  });

  const idleInterval = setInterval(() => {
    if (listening && activeJobs === 0 && Date.now() - lastActivity >= idleMs) void close();
  }, Math.max(20, Math.min(1000, Math.floor(idleMs / 2))));
  idleInterval.unref?.();

  async function listen() {
    if (listening) return;
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });
    listening = true;
    touch();
    if (readyFifo) {
      const address = server.address();
      await writeReadyFifo(readyFifo, `http://127.0.0.1:${address.port}/#token=${token}`);
    }
  }

  async function close() {
    if (closing) return closing;
    clearInterval(idleInterval);
    if (!listening) return;
    closing = new Promise((resolve, reject) => {
      server.close((error) => {
        listening = false;
        if (error) reject(error);
        else resolve();
      });
    });
    return closing;
  }

  return {
    listen,
    close,
    address: () => server.address(),
  };
}

function parseCli(argv) {
  const options = { idleMs: 30 * 60 * 1000 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (["--port", "--ready-fifo", "--source-root", "--idle-ms"].includes(flag) && value) {
      options[flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else {
      throw new WebStudioError("validation_error", `Unknown or incomplete server argument: ${flag}.`);
    }
  }
  options.port = Number(options.port);
  options.idleMs = Number(options.idleMs);
  if (!Number.isInteger(options.port) || options.port < 9460 || options.port > 9560) {
    throw new WebStudioError("validation_error", "Web Studio port must be between 9460 and 9560.");
  }
  if (!path.isAbsolute(options.readyFifo ?? "") || !path.isAbsolute(options.sourceRoot ?? "")) {
    throw new WebStudioError("validation_error", "Server paths must be absolute.");
  }
  if (!Number.isInteger(options.idleMs) || options.idleMs < 1) {
    throw new WebStudioError("validation_error", "Idle timeout must be a positive integer.");
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const home = process.env.HOME;
  if (!home) throw new WebStudioError("operation_failed", "HOME is required.", 500);
  const stateRoot = path.join(home, "Library/Application Support/CodexDreamSkinStudio");
  const executor = createWebStudioExecutor({
    sourceRoot: options.sourceRoot,
    installRoot: path.join(home, ".codex/codex-dream-skin-studio"),
    stateRoot,
    nodePath: process.execPath,
  });
  const studio = createWebStudioServer({
    host: "127.0.0.1",
    port: options.port,
    readyFifo: options.readyFifo,
    assetRoot: path.join(options.sourceRoot, "assets/web-studio"),
    executor,
    idleMs: options.idleMs,
  });
  process.once("SIGTERM", () => void studio.close());
  process.once("SIGINT", () => void studio.close());
  await studio.listen();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const normalized = errorValue(error);
    process.stderr.write(`${normalized.body.error.message}\n`);
    process.exitCode = 1;
  });
}
