import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  StudioApiError,
  createApiClient,
  isThemeId,
  normalizeColor,
  pollJob,
  readSessionToken,
  validateImageFile,
} from "../assets/web-studio/studio-client.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(here, "../assets/web-studio");

class MapStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

test("moves the fragment token into session storage and cleans the URL", () => {
  const storage = new MapStorage();
  const replaced = [];
  const token = readSessionToken(
    { hash: "#token=abc123", pathname: "/", search: "?view=home" },
    { replaceState: (...args) => replaced.push(args) },
    storage,
  );
  assert.equal(token, "abc123");
  assert.equal(storage.getItem("dreamSkinToken"), "abc123");
  assert.deepEqual(replaced[0], [{}, "", "/?view=home"]);
  assert.equal(readSessionToken(
    { hash: "", pathname: "/", search: "" },
    { replaceState() {} },
    storage,
  ), "abc123");
});

test("returns null for a missing or malformed fragment token", () => {
  const storage = new MapStorage();
  assert.equal(readSessionToken(
    { hash: "#token=contains%20space", pathname: "/", search: "" },
    { replaceState() {} },
    storage,
  ), null);
  assert.equal(storage.getItem("dreamSkinToken"), null);
});

test("adds the token header to authenticated same-origin requests", async () => {
  const calls = [];
  const api = createApiClient({
    origin: "http://127.0.0.1:9460",
    token: "secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ installed: true });
    },
  });
  await api.status();
  assert.equal(calls[0].url, "http://127.0.0.1:9460/api/status");
  assert.equal(calls[0].init.headers["X-Dream-Skin-Token"], "secret");
  assert.equal(calls[0].init.mode, "same-origin");
  assert.equal(calls[0].init.cache, "no-store");
});

test("sends JSON and multipart bodies through fixed API methods", async () => {
  const calls = [];
  const api = createApiClient({
    origin: "http://127.0.0.1:9460",
    token: "secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ jobId: "job-1" }, { status: 202 });
    },
  });
  await api.reapply({ allowRestart: true });
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { allowRestart: true });

  const form = new FormData();
  form.set("name", "主题");
  await api.createTheme(form);
  assert.equal(calls[1].init.body, form);
  assert.equal("Content-Type" in calls[1].init.headers, false);
});

test("surfaces structured and non-JSON API failures", async () => {
  const structured = createApiClient({
    origin: "http://127.0.0.1:9460",
    token: "secret",
    fetchImpl: async () => Response.json({
      error: { code: "restart_required", message: "需要重启", details: null },
    }, { status: 409 }),
  });
  await assert.rejects(structured.status(), (error) => (
    error instanceof StudioApiError && error.code === "restart_required" && error.status === 409
  ));

  const plain = createApiClient({
    origin: "http://127.0.0.1:9460",
    token: "secret",
    fetchImpl: async () => new Response("bad gateway", { status: 502 }),
  });
  await assert.rejects(plain.status(), (error) => error.code === "http_error" && error.status === 502);
});

test("polls jobs to success and throws the job error on failure", async () => {
  const states = [
    { state: "queued", progress: "等待" },
    { state: "running", progress: "处理中" },
    { state: "succeeded", result: { pass: true } },
  ];
  const updates = [];
  const result = await pollJob({
    api: { job: async () => states.shift() },
    jobId: "job-1",
    onUpdate: (job) => updates.push(job.state),
    intervalMs: 0,
  });
  assert.deepEqual(updates, ["queued", "running", "succeeded"]);
  assert.deepEqual(result, { pass: true });

  await assert.rejects(pollJob({
    api: { job: async () => ({
      state: "failed",
      error: { code: "conflict", message: "Busy", details: null },
    }) },
    jobId: "job-2",
    onUpdate() {},
    intervalMs: 0,
  }), (error) => error instanceof StudioApiError && error.code === "conflict");
});

test("validates browser image metadata and colors", () => {
  assert.equal(validateImageFile({ name: "主题.HEIC", size: 1024, type: "" }).name, "主题.HEIC");
  assert.throws(() => validateImageFile({ name: "empty.jpg", size: 0, type: "image/jpeg" }), /empty/i);
  assert.throws(() => validateImageFile({ name: "large.jpg", size: 50 * 1024 * 1024 + 1, type: "image/jpeg" }), /50 MB/i);
  assert.throws(() => validateImageFile({ name: "bad.svg", size: 100, type: "image/svg+xml" }), /supported image/i);
  assert.equal(normalizeColor("#AABBCC"), "#aabbcc");
  assert.throws(() => normalizeColor("red"), /six-digit/i);
  assert.equal(isThemeId("img-20260719153000-a1b2c3d4"), true);
  assert.equal(isThemeId("../theme"), false);
});

test("ships a local-only accessible page without unsafe DOM sinks", async () => {
  const [html, css, script] = await Promise.all([
    fs.readFile(path.join(assetRoot, "index.html"), "utf8"),
    fs.readFile(path.join(assetRoot, "studio.css"), "utf8"),
    fs.readFile(path.join(assetRoot, "studio.js"), "utf8"),
  ]);
  for (const id of [
    "studio", "connection-status", "install-panel", "install-button", "dashboard", "theme-form",
    "drop-zone", "theme-image", "image-preview", "theme-name", "advanced-settings", "apply-theme",
    "theme-list", "reapply-button", "pause-button", "verify-button", "demo-button", "restore-button",
    "diagnostic-log", "copy-log", "job-panel", "job-progress", "job-message", "job-log", "confirm-dialog",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.match(html, /type="module" src="\/studio\.js"/);
  assert.match(css, /background-position:\s*right center/);
  assert.match(css, /background-position:\s*58% center/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.match(script, /textContent/);
  assert.match(script, /restore-official/);
});
