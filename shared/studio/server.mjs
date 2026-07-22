import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { readJsonBody, sendError, sendJson, serveFile } from "./http.mjs";
import { ThemeService } from "./theme-service.mjs";

function safeSegments(pathname) {
  return pathname.split("/").filter(Boolean).map(decodeURIComponent);
}

export async function createStudioServer({ adapter, sharedRoot, port = 8765 }) {
  const service = new ThemeService({ adapter, sharedRoot });
  await service.init();
  const webRoot = path.join(sharedRoot, "studio", "web");
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const parts = safeSegments(url.pathname);
    try {
      if (request.method === "GET" && url.pathname === "/") {
        const file = path.join(webRoot, "index.html");
        const html = (await fs.readFile(file, "utf8")).replace("__DREAM_STUDIO_TOKEN__", service.token);
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
        });
        return response.end(html);
      }
      if (request.method === "GET" && parts.length === 1 && /^[\w.-]+$/.test(parts[0])) {
        return serveFile(response, path.join(webRoot, parts[0]));
      }
      if (request.method === "GET" && parts[0] === "runtime" && /^[\w.-]+$/.test(parts[1] || "")) {
        return serveFile(response, path.join(sharedRoot, "runtime", parts[1]));
      }
      if (request.method === "GET" && parts[0] === "theme-core" && /^[\w.-]+$/.test(parts[1] || "")) {
        return serveFile(response, path.join(sharedRoot, "theme-core", parts[1]));
      }
      if (request.method === "GET" && parts[0] === "assets" && parts[1] === "gallery" && /^skin-0[1-8]\.jpg$/.test(parts[2] || "")) {
        return serveFile(response, path.join(sharedRoot, "studio", "assets", "gallery", parts[2]));
      }
      const authenticated = request.headers["x-dream-studio-token"] === service.token || url.searchParams.get("token") === service.token;
      if (!authenticated) return sendError(response, 403, "本地控制台令牌无效", { code: "INVALID_TOKEN", platform: adapter.platform, action: "authenticate" });

      if (request.method === "GET" && url.pathname === "/api/status") return sendJson(response, 200, await adapter.status());
      if (request.method === "GET" && url.pathname === "/api/themes") return sendJson(response, 200, await service.catalog());
      if (request.method === "GET" && url.pathname === "/api/details") return sendJson(response, 200, await service.details(studio.port));
      if (request.method === "GET" && url.pathname === "/api/library-images") return sendJson(response, 200, { images: await service.listImages() });
      if (request.method === "GET" && parts[0] === "api" && parts[1] === "themes" && parts[3] === "image") {
        return serveFile(response, await service.imagePath(parts[2]));
      }
      if (request.method === "GET" && parts[0] === "api" && parts[1] === "library-images" && parts[3] === "image") {
        const name = parts[2];
        if (path.basename(name) !== name) throw new Error("图片名称无效");
        return serveFile(response, path.join(adapter.paths.imagesRoot, name));
      }
      if (request.method === "POST" && url.pathname === "/api/themes") {
        return sendJson(response, 201, { theme: await service.create(await readJsonBody(request)) });
      }
      if (request.method === "PUT" && parts[0] === "api" && parts[1] === "themes" && parts.length === 3) {
        return sendJson(response, 200, { theme: await service.update(parts[2], await readJsonBody(request)) });
      }
      if (request.method === "POST" && parts[0] === "api" && parts[1] === "themes" && parts[3] === "duplicate") {
        return sendJson(response, 201, { theme: await service.duplicate(parts[2], await readJsonBody(request)) });
      }
      if (request.method === "DELETE" && parts[0] === "api" && parts[1] === "themes" && parts.length === 3) {
        await service.remove(parts[2]);
        return sendJson(response, 200, { ok: true });
      }
      if (request.method === "POST" && parts[0] === "api" && parts[1] === "themes" && parts[3] === "apply") {
        return sendJson(response, 200, await service.apply(parts[2]));
      }
      if (request.method === "POST" && parts[0] === "api" && parts[1] === "library-images" && parts[3] === "import") {
        return sendJson(response, 201, { theme: await service.importImage(parts[2]) });
      }
      if (request.method === "POST" && parts[0] === "api" && parts[1] === "actions" && parts[2]) {
        const result = await adapter.runAction(parts[2], {});
        return sendJson(response, 200, { ok: true, ...result });
      }
      return sendError(response, 404, "接口不存在", { code: "NOT_FOUND", platform: adapter.platform, action: "route" });
    } catch (error) {
      return sendError(response, 400, error, { platform: adapter.platform, action: `${request.method} ${url.pathname}` });
    }
  });

  const studio = {
    port,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
      studio.port = server.address().port;
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
  return studio;
}
