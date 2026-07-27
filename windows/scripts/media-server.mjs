import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const TRUSTED_MEDIA_SCHEME = "codex-dream-skin";
const VIDEO_EXTENSION = ".mp4";
const VIDEO_MIME = "video/mp4";
const TRUSTED_ORIGINS = new Set(["app://-", "app://", "null"]);

export function isMp4Container(bytes, totalSize = bytes?.byteLength ?? 0) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 16) return false;
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstBoxSize = view.readUInt32BE(0);
  return firstBoxSize >= 16
    && firstBoxSize <= totalSize
    && view.subarray(4, 8).toString("ascii") === "ftyp";
}

function parseRange(value, size) {
  if (typeof value !== "string" || !value.startsWith("bytes=")) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (match[1]) {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  } else {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) return null;
  if (start >= size) return { unsatisfiable: true };
  return { start, end: Math.min(end, size - 1) };
}

async function validateVideoFile(filePath) {
  const resolved = path.resolve(filePath);
  if (path.extname(resolved).toLowerCase() !== VIDEO_EXTENSION) {
    throw new Error("Video backgrounds must use an MP4 file.");
  }
  const lstat = await fs.lstat(resolved);
  if (lstat.isSymbolicLink()) throw new Error("Video background must not be a symbolic link.");
  const realPath = await fs.realpath(resolved);
  const stat = await fs.stat(realPath);
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_VIDEO_BYTES) {
    throw new Error(`Video background must be a non-empty MP4 no larger than ${MAX_VIDEO_BYTES} bytes.`);
  }
  const bytes = await fs.readFile(realPath);
  if (!isMp4Container(bytes)) {
    throw new Error("Video background is not a valid MP4 container.");
  }
  const hash = createHash("sha256");
  hash.update(bytes);
  return { filePath: realPath, size: stat.size, identity: hash.digest("hex") };
}

export async function createMediaServer(filePath) {
  const validated = await validateVideoFile(filePath);
  const token = randomUUID().replaceAll("-", "");
  const route = `/media/${token}`;
  const protocolUrl = `${TRUSTED_MEDIA_SCHEME}://${route.slice(1)}`;
  const sockets = new Set();
  let closed = false;

  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    const trustedOrigin = origin && TRUSTED_ORIGINS.has(origin) ? origin : null;
    const corsHeaders = {
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, X-Codex-Dream-Skin-Token",
      "Access-Control-Allow-Private-Network": "true",
      "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
      "Vary": "Origin",
    };
    if (trustedOrigin) corsHeaders["Access-Control-Allow-Origin"] = trustedOrigin;
    if (request.url === route && request.method === "OPTIONS") {
      if (origin && !trustedOrigin) {
        response.writeHead(403, { "Cache-Control": "no-store" });
        response.end();
        return;
      }
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }
    if (closed || !["GET", "HEAD"].includes(request.method) || request.url !== route) {
      response.writeHead(closed ? 503 : 404, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    if ((origin && !trustedOrigin) || request.headers["x-codex-dream-skin-token"] !== token) {
      response.writeHead(403, { "Cache-Control": "no-store" });
      response.end();
      return;
    }

    try {
      const lstat = await fs.lstat(validated.filePath);
      if (lstat.isSymbolicLink()) throw new Error("Video path became a symbolic link");
      const stat = await fs.stat(validated.filePath);
      if (!stat.isFile() || stat.size !== validated.size || stat.size > MAX_VIDEO_BYTES) {
        throw new Error("Video file changed or exceeded the safety limit");
      }

      const currentHash = createHash("sha256");
      currentHash.update(await fs.readFile(validated.filePath));
      if (currentHash.digest("hex") !== validated.identity) {
        throw new Error("Video file content changed after staging");
      }

      const rangeHeader = request.headers.range;
      const range = parseRange(rangeHeader, stat.size);
      const headers = {
        ...corsHeaders,
        "Content-Type": VIDEO_MIME,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      };
      if (rangeHeader !== undefined && !range) {
        headers["Content-Range"] = `bytes */${stat.size}`;
        response.writeHead(416, headers);
        response.end();
        return;
      }
      if (!range) {
        headers["Content-Length"] = stat.size;
        response.writeHead(200, headers);
        if (request.method === "HEAD") { response.end(); return; }
        createReadStream(validated.filePath).on("error", () => response.destroy()).pipe(response);
        return;
      }

      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${stat.size}`;
      headers["Content-Length"] = range.end - range.start + 1;
      response.writeHead(206, headers);
      if (request.method === "HEAD") { response.end(); return; }
      createReadStream(validated.filePath, { start: range.start, end: range.end })
        .on("error", () => response.destroy())
        .pipe(response);
    } catch {
      response.writeHead(404, { "Cache-Control": "no-store" });
      response.end();
    }
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => server.close(resolve));
    throw new Error("Local media server did not expose a TCP port.");
  }

  return {
    filePath: validated.filePath,
    size: validated.size,
    identity: validated.identity,
    token,
    route,
    protocolUrl,
    url: `http://127.0.0.1:${address.port}${route}`,
    async close() {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export class MediaServerController {
  #active = null;

  async stage(filePath) {
    if (!filePath) return null;
    const validated = await validateVideoFile(filePath);
    if (this.#active?.filePath === validated.filePath &&
      this.#active.size === validated.size && this.#active.identity === validated.identity) return this.#active;
    return createMediaServer(validated.filePath);
  }

  async commit(next) {
    if (next === this.#active) return;
    const previous = this.#active;
    this.#active = next;
    await previous?.close();
  }

  async abort(staged) {
    if (staged && staged !== this.#active) await staged.close();
  }

  async close() {
    const active = this.#active;
    this.#active = null;
    await active?.close();
  }
}
