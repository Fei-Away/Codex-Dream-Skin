import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const FIXTURE_PATH = new URL("../runtime/fixtures/cdp-discovery-cases.json", import.meta.url);

function repeated(prefix, length) {
  if (length <= prefix.length) return prefix.slice(0, length);
  return prefix + "x".repeat(length - prefix.length);
}

export function bodyForCase(testCase, port) {
  const websocket = `ws://127.0.0.1:${port}/devtools/page/page-fixture`;
  const target = {
    id: "page-fixture",
    type: "page",
    url: "app://codex/",
    webSocketDebuggerUrl: websocket,
  };
  switch (testCase.body) {
    case "valid-list": return Buffer.from(JSON.stringify([target]));
    case "list-count": return Buffer.from(JSON.stringify(Array.from({ length: testCase.count }, (_, index) => ({
      ...target,
      id: `page-${index}`,
      webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/page-${index}`,
    }))));
    case "list-boundary": return Buffer.from(JSON.stringify([{
      id: repeated("i", testCase.idLength ?? 12),
      type: "page",
      url: repeated("u", testCase.urlLength ?? 12),
      webSocketDebuggerUrl: repeated("w", testCase.webSocketUrlLength ?? 12),
    }]));
    case "root-object": return Buffer.from(JSON.stringify({ targets: [] }));
    case "missing-id": {
      const { id, ...withoutId } = target;
      return Buffer.from(JSON.stringify([withoutId]));
    }
    case "wrong-id": return Buffer.from(JSON.stringify([{ ...target, id: 123 }]));
    case "missing-websocket": {
      const { webSocketDebuggerUrl, ...withoutWebSocket } = target;
      return Buffer.from(JSON.stringify([withoutWebSocket]));
    }
    case "wrong-websocket": return Buffer.from(JSON.stringify([{ ...target, webSocketDebuggerUrl: 123 }]));
    case "exact-byte-limit": {
      const json = JSON.stringify([target]);
      const padding = " ".repeat(262144 - Buffer.byteLength(json));
      return Buffer.from(json + padding);
    }
    case "valid-version": return Buffer.from(JSON.stringify({
      Browser: "Fixture/1.0",
      webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/browser-fixture`,
    }));
    case "version-escaped-text": return Buffer.from(JSON.stringify({
      Browser: "Fixture/\"quoted\"",
      webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/browser-fixture`,
    }));
    case "version-boundary": return Buffer.from(JSON.stringify({
      webSocketDebuggerUrl: repeated("w", testCase.webSocketUrlLength),
    }));
    case "version-array": return Buffer.from(JSON.stringify([{ webSocketDebuggerUrl: websocket }]));
    case "version-comment-array": return Buffer.from(`// JSON 注释不属于规范\n${JSON.stringify([{ webSocketDebuggerUrl: websocket }])}`);
    case "version-missing-websocket": return Buffer.from(JSON.stringify({ Browser: "Fixture/1.0" }));
    case "version-wrong-websocket": return Buffer.from(JSON.stringify({ webSocketDebuggerUrl: 123 }));
    case "malformed": return Buffer.from("{not-json");
    case "invalid-utf8": return Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x80, 0x7d]);
    case "stream-over-limit": return null;
    default: throw new Error(`Unknown CDP fixture body: ${testCase.body}`);
  }
}

export async function startFixtureServers(fixture) {
  const servers = new Map();
  const ports = {};
  for (const testCase of fixture.cases) {
    let port = 0;
    const stats = { requests: 0, followedRedirect: 0 };
    const server = http.createServer((request, response) => {
      stats.requests += 1;
      if (request.url === "/redirect-target") stats.followedRedirect += 1;
      if (testCase.status === 302) {
        response.statusCode = 302;
        response.setHeader("Location", "/redirect-target");
      } else response.statusCode = testCase.status ?? 200;
      response.setHeader("Content-Type", "application/json");
      if (testCase.contentLength === "over-limit") {
        response.setHeader("Content-Length", String(fixture.maxBytes + 1));
        response.end("{not-json");
        return;
      }
      if (testCase.body === "stream-over-limit") {
        const chunk = Buffer.alloc(8192, 0x78);
        let remaining = fixture.maxBytes + 1;
        while (remaining > 0) {
          const size = Math.min(remaining, chunk.length);
          response.write(chunk.subarray(0, size));
          remaining -= size;
        }
        response.end();
        return;
      }
      if (testCase.body === "slow-body" || testCase.body === "stalled-body") {
        let interval;
        let finish;
        const start = setTimeout(() => {
          response.write("[");
          if (testCase.body === "slow-body") {
            interval = setInterval(() => response.write(" "), 100);
          }
          finish = setTimeout(() => response.end("]"), fixture.timeoutMs * 2);
        }, testCase.headerDelayMs ?? 0);
        response.once("close", () => {
          clearTimeout(start);
          clearInterval(interval);
          clearTimeout(finish);
        });
        return;
      }
      const body = bodyForCase(testCase, port);
      response.setHeader("Content-Length", String(body.length));
      response.end(body);
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        port = server.address().port;
        resolve();
      });
    });
    ports[testCase.name] = port;
    servers.set(testCase.name, { server, stats });
  }
  return {
    ports,
    stats: Object.fromEntries([...servers].map(([name, value]) => [name, value.stats])),
    async close() {
      for (const { server } of servers.values()) server.closeAllConnections();
      await Promise.all([...servers.values()].map(({ server }) => new Promise((resolve) => server.close(resolve))));
    },
  };
}

async function main() {
  const fixtureIndex = process.argv.indexOf("--fixture");
  const fixturePath = fixtureIndex === -1
    ? FIXTURE_PATH
    : pathToFileURL(path.resolve(process.argv[fixtureIndex + 1]));
  const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  const running = await startFixtureServers(fixture);
  process.stdout.write(`${JSON.stringify({ ports: running.ports })}\n`);
  process.stdin.resume();
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
