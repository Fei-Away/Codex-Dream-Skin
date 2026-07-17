import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(process.argv[2]);
const node = process.execPath;
const sockets = new Set();

function websocketFrame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function readFrames(socket) {
  let buffered = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 2) {
      const opcode = buffered[0] & 0x0f;
      const masked = Boolean(buffered[1] & 0x80);
      let length = buffered[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffered.length < 4) return;
        length = buffered.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffered.length < 10) return;
        length = Number(buffered.readBigUInt64BE(2));
        offset = 10;
      }
      const maskBytes = masked ? 4 : 0;
      if (buffered.length < offset + maskBytes + length) return;
      const mask = masked ? buffered.subarray(offset, offset + 4) : null;
      offset += maskBytes;
      const payload = Buffer.from(buffered.subarray(offset, offset + length));
      buffered = buffered.subarray(offset + length);
      if (mask) {
        for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
      }
      if (opcode === 0x8) continue;
      if (opcode !== 0x1) continue;
      const request = JSON.parse(payload.toString("utf8"));
      const probe = {
        title: "Codex",
        href: "app://-/index.html",
        markers: { shell: true, sidebar: true, composer: true, main: true },
        codex: true,
        installed: true,
        pass: true,
      };
      const result = request.method === "Runtime.evaluate"
        ? { result: { value: probe } }
        : {};
      socket.write(websocketFrame({ id: request.id, result }));
    }
  });
}

const server = http.createServer((request, response) => {
  if (request.url !== "/json/list") {
    response.writeHead(404).end();
    return;
  }
  const { port } = server.address();
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify([{
    id: "fake-codex",
    type: "page",
    title: "Codex",
    url: "app://-/index.html",
    webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/fake-codex`,
  }]));
});

server.on("upgrade", (request, socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  const accept = crypto
    .createHash("sha1")
    .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n"));
  readFrames(socket);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const child = spawn(node, [
  path.join(root, "scripts/injector.mjs"),
  "--verify",
  "--port", String(port),
  "--timeout-ms", "1000",
], { stdio: ["ignore", "pipe", "pipe"] });
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });

const outcome = await Promise.race([
  new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal }))),
  new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 4000)),
]);

if (outcome.timeout) child.kill("SIGKILL");
for (const socket of sockets) socket.destroy();
await new Promise((resolve) => server.close(resolve));

if (outcome.timeout) {
  throw new Error(`One-shot injector did not exit after producing its result. stdout=${stdout.trim()} stderr=${stderr.trim()}`);
}
if (outcome.code !== 0) {
  throw new Error(`One-shot injector exited with ${outcome.code ?? outcome.signal}. stderr=${stderr.trim()}`);
}
