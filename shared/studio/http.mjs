import fs from "node:fs/promises";
import path from "node:path";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function sendJson(response, status, value) {
  response.writeHead(status, jsonHeaders);
  response.end(JSON.stringify(value));
}

export function sendError(response, status, error, context = {}) {
  const message = error instanceof Error ? error.message : String(error);
  sendJson(response, status, {
    error: {
      code: context.code || "STUDIO_OPERATION_FAILED",
      message,
      platform: context.platform || process.platform,
      action: context.action || "request",
      exitCode: Number.isInteger(error?.exitCode) ? error.exitCode : null,
      suggestion: context.suggestion || "刷新状态后重试；如仍失败，请运行深度诊断。",
    },
  });
}

export async function readJsonBody(request, limit = 24 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("请求体过大");
    chunks.push(chunk);
  }
  const source = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(source);
}

export function contentType(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if ([".js", ".mjs"].includes(extension)) return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function serveFile(response, file, options = {}) {
  try {
    const content = await fs.readFile(file);
    response.writeHead(200, {
      "Content-Type": options.contentType || contentType(file),
      "Cache-Control": options.cache || "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  } catch (error) {
    sendError(response, 404, error, { code: "FILE_NOT_FOUND", action: "read-file" });
  }
}
