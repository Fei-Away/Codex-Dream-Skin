import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { WebStudioError } from "../scripts/web-studio-shared.mjs";
import { createWebStudioServer } from "../scripts/web-studio-server.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((onResolve) => { resolve = onResolve; });
  return { promise, resolve };
}

function fakeExecutor({ themeImagePath, screenshotPath, control, calls }) {
  const terminal = async ({ progress = () => {} } = {}) => {
    for (let index = 0; index < 130; index += 1) progress(`line-${index}`);
    return { pass: true };
  };
  return {
    status: async () => ({
      installed: true,
      version: "1.1.2",
      codexRunning: false,
      cdpOk: false,
      injectorAlive: false,
      session: "off",
      port: 9341,
      themeName: "",
      recentLogs: [],
    }),
    themes: async () => [{ id: "demo", name: "Demo", bundled: true, active: true }],
    themeImage: async (id) => {
      calls.push({ operation: "themeImage", id });
      return { path: themeImagePath, contentType: "image/jpeg" };
    },
    verificationScreenshot: async () => ({ path: screenshotPath, contentType: "image/png" }),
    install: terminal,
    createTheme: async (input) => {
      calls.push({ operation: "createTheme", input });
      input.progress("主题已保存");
      return { theme: { id: "img-20260719153000-a1b2c3d4", name: input.fields.name } };
    },
    applyTheme: async (input) => {
      calls.push({ operation: "applyTheme", input });
      return { applied: true };
    },
    deleteTheme: terminal,
    applyDemo: terminal,
    reapply: terminal,
    pause: async (input) => {
      calls.push({ operation: "pause", input });
      if (control.pauseFailure) throw control.pauseFailure;
      if (control.pauseStarted) control.pauseStarted.resolve();
      if (control.pauseRelease) await control.pauseRelease.promise;
      return terminal(input);
    },
    verify: terminal,
    restore: terminal,
  };
}

async function serverFixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dream-web-server-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const assetRoot = path.join(root, "assets");
  await fs.mkdir(assetRoot);
  await Promise.all([
    fs.writeFile(path.join(assetRoot, "index.html"), "<!doctype html><title>Studio</title>"),
    fs.writeFile(path.join(assetRoot, "studio.css"), "body{color:black}"),
    fs.writeFile(path.join(assetRoot, "studio-client.mjs"), "export const ready=true;"),
    fs.writeFile(path.join(assetRoot, "studio.js"), "import './studio-client.mjs';"),
  ]);
  const themeImagePath = path.join(root, "theme.jpg");
  const screenshotPath = path.join(root, "verification.png");
  await fs.writeFile(themeImagePath, Buffer.from("ffd8ffe0", "hex"));
  await fs.writeFile(screenshotPath, Buffer.from("89504e470d0a1a0a", "hex"));
  const control = {};
  const calls = [];
  const executor = fakeExecutor({ themeImagePath, screenshotPath, control, calls });
  const server = createWebStudioServer({
    host: "127.0.0.1",
    port: 0,
    readyFifo: null,
    assetRoot,
    executor,
    idleMs: options.idleMs ?? 60_000,
    jobRetentionMs: options.jobRetentionMs ?? 60_000,
    randomBytes: () => Buffer.alloc(32, 7),
  });
  await server.listen();
  t.after(() => server.close());
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const token = Buffer.alloc(32, 7).toString("base64url");
  const apiHeaders = ({ withOrigin = false, withToken = true } = {}) => ({
    ...(withToken ? { "X-Dream-Skin-Token": token } : {}),
    ...(withOrigin ? { Origin: origin } : {}),
  });
  async function job(jobId) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await fetch(`${origin}/api/jobs/${jobId}`, { headers: apiHeaders() });
      const value = await response.json();
      if (value.state === "succeeded" || value.state === "failed") return value;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("job did not finish");
  }
  return { root, server, origin, token, apiHeaders, job, control, calls };
}

test("serves only mapped local assets with strict response headers", async (t) => {
  const fixture = await serverFixture(t);
  const response = await fetch(`${fixture.origin}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>Studio<\/title>/);
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), null);

  const missing = await fetch(`${fixture.origin}/../package.json`);
  assert.equal(missing.status, 404);
});

test("rejects invalid Host before serving static or API content", async (t) => {
  const fixture = await serverFixture(t);
  const target = new URL(fixture.origin);
  const response = await new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: "/",
      method: "GET",
      headers: { Host: "evil.example" },
    }, (incoming) => {
      const chunks = [];
      incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => resolve({
        status: incoming.statusCode,
        value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      }));
    });
    request.on("error", reject);
    request.end();
  });
  assert.equal(response.status, 403);
  assert.equal(response.value.error.code, "forbidden");
});

test("requires the session token for every API request", async (t) => {
  const fixture = await serverFixture(t);
  const response = await fetch(`${fixture.origin}/api/status`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "unauthorized");
});

test("requires exact same origin for mutations and rejects preflight", async (t) => {
  const fixture = await serverFixture(t);
  const response = await fetch(`${fixture.origin}/api/session/pause`, {
    method: "POST",
    headers: {
      ...fixture.apiHeaders(),
      "Content-Type": "application/json",
      Origin: "https://evil.example",
    },
    body: "{}",
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "forbidden");

  const preflight = await fetch(`${fixture.origin}/api/status`, {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(preflight.status, 405);
  assert.equal(preflight.headers.get("access-control-allow-origin"), null);
});

test("returns status and themes as authenticated JSON", async (t) => {
  const fixture = await serverFixture(t);
  const status = await fetch(`${fixture.origin}/api/status`, { headers: fixture.apiHeaders() });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).installed, true);
  const themes = await fetch(`${fixture.origin}/api/themes`, { headers: fixture.apiHeaders() });
  assert.equal((await themes.json())[0].id, "demo");
});

test("queues a mutation, bounds progress logs, and returns its result", async (t) => {
  const fixture = await serverFixture(t);
  const response = await fetch(`${fixture.origin}/api/session/pause`, {
    method: "POST",
    headers: { ...fixture.apiHeaders({ withOrigin: true }), "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const { jobId } = await response.json();
  const job = await fixture.job(jobId);
  assert.equal(job.state, "succeeded");
  assert.equal(job.result.pass, true);
  assert.equal(job.logs.length, 120);
  assert.equal(job.logs[0], "line-10");
  assert.equal(job.logs.at(-1), "line-129");
});

test("returns sanitized structured job failures", async (t) => {
  const fixture = await serverFixture(t);
  fixture.control.pauseFailure = new WebStudioError("conflict", "Busy.", 409);
  const response = await fetch(`${fixture.origin}/api/session/pause`, {
    method: "POST",
    headers: { ...fixture.apiHeaders({ withOrigin: true }), "Content-Type": "application/json" },
    body: "{}",
  });
  const job = await fixture.job((await response.json()).jobId);
  assert.equal(job.state, "failed");
  assert.deepEqual(job.error, { code: "conflict", message: "Busy.", details: null });
  assert.equal("stack" in job, false);
});

test("parses a bounded multipart theme upload and rejects unknown fields", async (t) => {
  const fixture = await serverFixture(t);
  const form = new FormData();
  form.set("image", new Blob([Buffer.from("ffd8ffe0", "hex")], { type: "image/jpeg" }), "theme.jpg");
  form.set("name", "网页主题");
  form.set("tagline", "本地控制台");
  form.set("quote", "BUILD");
  form.set("accent", "#7cff46");
  form.set("secondary", "#36d7e8");
  form.set("highlight", "#642a8c");
  form.set("apply", "true");
  form.set("allowRestart", "false");
  const response = await fetch(`${fixture.origin}/api/themes`, {
    method: "POST",
    headers: fixture.apiHeaders({ withOrigin: true }),
    body: form,
  });
  assert.equal(response.status, 202);
  const job = await fixture.job((await response.json()).jobId);
  assert.equal(job.state, "succeeded");
  const call = fixture.calls.find((entry) => entry.operation === "createTheme");
  assert.equal(call.input.fields.name, "网页主题");
  assert.equal(call.input.fields.apply, true);
  assert.equal(call.input.fields.allowRestart, false);
  assert.equal(call.input.bytes.toString("hex"), "ffd8ffe0");

  const invalid = new FormData();
  invalid.set("image", new Blob([Buffer.from("ffd8ffe0", "hex")]), "theme.jpg");
  invalid.set("name", "bad");
  invalid.set("command", "rm");
  const invalidResponse = await fetch(`${fixture.origin}/api/themes`, {
    method: "POST",
    headers: fixture.apiHeaders({ withOrigin: true }),
    body: invalid,
  });
  assert.equal(invalidResponse.status, 400);
  assert.equal((await invalidResponse.json()).error.code, "validation_error");
});

test("preserves a mixed-case Chrome multipart boundary", async (t) => {
  const fixture = await serverFixture(t);
  const boundary = "----WebKitFormBoundaryAbC123xYz";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="theme.jpg"\r\n` +
      "Content-Type: image/jpeg\r\n\r\n",
      "utf8",
    ),
    Buffer.from("ffd8ffe0", "hex"),
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n` +
      `Chrome 主题\r\n--${boundary}--\r\n`,
      "utf8",
    ),
  ]);
  const response = await fetch(`${fixture.origin}/api/themes`, {
    method: "POST",
    headers: {
      ...fixture.apiHeaders({ withOrigin: true }),
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  assert.equal(response.status, 202);
  const job = await fixture.job((await response.json()).jobId);
  assert.equal(job.state, "succeeded");
  const call = fixture.calls.find((entry) => entry.operation === "createTheme");
  assert.equal(call.input.fields.name, "Chrome 主题");
  assert.equal(call.input.bytes.toString("hex"), "ffd8ffe0");
});

test("rejects oversized and unexpected request bodies before execution", async (t) => {
  const fixture = await serverFixture(t);
  const oversized = await fetch(`${fixture.origin}/api/session/pause`, {
    method: "POST",
    headers: {
      ...fixture.apiHeaders({ withOrigin: true }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ padding: "x".repeat(65 * 1024) }),
  });
  assert.equal(oversized.status, 413);

  const unknown = await fetch(`${fixture.origin}/api/session/pause`, {
    method: "POST",
    headers: { ...fixture.apiHeaders({ withOrigin: true }), "Content-Type": "application/json" },
    body: JSON.stringify({ command: "rm" }),
  });
  assert.equal(unknown.status, 400);
  assert.equal(fixture.calls.some((entry) => entry.operation === "pause"), false);
});

test("maps fixed theme actions and serves managed images privately", async (t) => {
  const fixture = await serverFixture(t);
  const id = "img-20260719153000-a1b2c3d4";
  const apply = await fetch(`${fixture.origin}/api/themes/${id}/apply`, {
    method: "POST",
    headers: { ...fixture.apiHeaders({ withOrigin: true }), "Content-Type": "application/json" },
    body: JSON.stringify({ allowRestart: false }),
  });
  assert.equal((await fixture.job((await apply.json()).jobId)).state, "succeeded");
  const applyCall = fixture.calls.find((entry) => entry.operation === "applyTheme");
  assert.equal(applyCall.input.id, id);
  assert.equal(applyCall.input.allowRestart, false);

  const image = await fetch(`${fixture.origin}/api/themes/${id}/image`, { headers: fixture.apiHeaders() });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.equal(image.headers.get("cache-control"), "private, no-store");
  assert.equal(Buffer.from(await image.arrayBuffer()).toString("hex"), "ffd8ffe0");

  const screenshot = await fetch(`${fixture.origin}/api/verification/screenshot`, { headers: fixture.apiHeaders() });
  assert.equal(screenshot.status, 200);
  assert.equal(screenshot.headers.get("content-type"), "image/png");
});

test("idle shutdown waits for a running job", async (t) => {
  const fixture = await serverFixture(t, { idleMs: 40 });
  fixture.control.pauseStarted = deferred();
  fixture.control.pauseRelease = deferred();
  const response = await fetch(`${fixture.origin}/api/session/pause`, {
    method: "POST",
    headers: { ...fixture.apiHeaders({ withOrigin: true }), "Content-Type": "application/json" },
    body: "{}",
  });
  await fixture.control.pauseStarted.promise;
  await new Promise((resolve) => setTimeout(resolve, 70));
  const statusWhileRunning = await fetch(`${fixture.origin}/api/status`, { headers: fixture.apiHeaders() });
  assert.equal(statusWhileRunning.status, 200);
  fixture.control.pauseRelease.resolve();
  await fixture.job((await response.json()).jobId);
  await new Promise((resolve) => setTimeout(resolve, 70));
  await assert.rejects(fetch(`${fixture.origin}/`));
});
