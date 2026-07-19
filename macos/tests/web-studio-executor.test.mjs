import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createWebStudioExecutor, runFixedFile } from "../scripts/web-studio-executor.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function executorFixture(t, initial = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dream-web-executor-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const installRoot = path.join(root, "installed");
  const stateRoot = path.join(root, "state");
  await Promise.all([
    fs.mkdir(path.join(sourceRoot, "scripts"), { recursive: true }),
    fs.mkdir(stateRoot, { recursive: true }),
  ]);
  await fs.writeFile(path.join(sourceRoot, "VERSION"), "1.1.2\n");

  const status = {
    codexRunning: false,
    cdpOk: false,
    port: 9341,
    injectorAlive: false,
    session: "off",
    themeName: "",
    ...initial.status,
  };
  const commands = [];
  const control = { blockScript: null, blocker: null, createInstall: false };
  const runFile = async (file, args, options) => {
    commands.push({ file, args, options });
    if (file.endsWith("status-dream-skin-macos.sh")) {
      return { stdout: `${JSON.stringify(status)}\n`, stderr: "" };
    }
    if (control.blockScript && file.endsWith(control.blockScript)) {
      control.blocker.resolve();
      await control.blocker.release.promise;
    }
    if (file.endsWith("install-dream-skin-macos.sh") && control.createInstall) {
      await fs.mkdir(path.join(installRoot, "scripts"), { recursive: true });
      await fs.writeFile(path.join(installRoot, "VERSION"), "1.1.2\n");
    }
    if (file.endsWith("verify-dream-skin-macos.sh")) {
      const screenshot = args[args.indexOf("--screenshot") + 1];
      await fs.mkdir(path.dirname(screenshot), { recursive: true });
      await fs.writeFile(screenshot, Buffer.from("89504e470d0a1a0a", "hex"), { mode: 0o600 });
      return { stdout: `${JSON.stringify({ pass: true, installed: true })}\n`, stderr: "" };
    }
    return { stdout: "{}\n", stderr: "" };
  };

  const themeState = { active: { id: "demo", name: "Demo" }, saved: [] };
  const themeStore = {
    listThemes: async () => themeState.saved,
    saveTheme: async ({ fields }) => {
      const saved = { id: "img-20260719153000-a1b2c3d4", name: fields.name, active: false };
      themeState.saved.push(saved);
      return saved;
    },
    activateTheme: async (id) => {
      themeState.active = { id, name: "Active" };
      return themeState.active;
    },
    deleteTheme: async (id) => {
      themeState.saved = themeState.saved.filter((theme) => theme.id !== id);
    },
    applyDemo: async () => {
      themeState.active = { id: "demo", name: "Demo" };
      return themeState.active;
    },
    activeTheme: async () => themeState.active,
    resolveThemeImage: async () => ({ path: path.join(stateRoot, "themes", "image.jpg"), contentType: "image/jpeg" }),
  };
  const inspectResult = initial.inspectResult ?? { alive: false, matches: false };
  const executor = createWebStudioExecutor({
    sourceRoot,
    installRoot,
    stateRoot,
    nodePath: "/signed/node",
    runFile,
    inspectLockOwner: async () => inspectResult,
    processStartedAt: async () => "Sun Jul 19 15:30:00 2026",
    themeStore,
  });
  return {
    root,
    sourceRoot,
    installRoot,
    stateRoot,
    executor,
    commands,
    control,
    status,
    themeState,
    lastCommand: () => commands.at(-1),
    script: (name, installed = true) => path.join(installed ? installRoot : sourceRoot, "scripts", name),
  };
}

test("runFixedFile passes arguments literally without a shell", async () => {
  const result = await runFixedFile("/usr/bin/printf", ["%s", "$(touch /tmp/never-run); hello"]);
  assert.equal(result.stdout, "$(touch /tmp/never-run); hello");
  assert.equal(result.stderr, "");
});

test("reports source status before install and switches to installed scripts", async (t) => {
  const fixture = await executorFixture(t);
  const before = await fixture.executor.status();
  assert.equal(before.installed, false);
  assert.equal(before.version, "1.1.2");
  assert.equal(fixture.lastCommand().file, fixture.script("status-dream-skin-macos.sh", false));
  assert.deepEqual(fixture.lastCommand().options, { shell: false });

  fixture.control.createInstall = true;
  await fixture.executor.install({ progress() {} });
  assert.deepEqual(fixture.lastCommand(), {
    file: fixture.script("install-dream-skin-macos.sh", false),
    args: ["--no-launch"],
    options: { shell: false },
  });
  await fixture.executor.pause({ progress() {} });
  assert.equal(fixture.lastCommand().file, fixture.script("pause-dream-skin-macos.sh"));
});

test("requires restart authorization without verified CDP", async (t) => {
  const fixture = await executorFixture(t, { status: { codexRunning: true, cdpOk: false } });
  await fs.mkdir(path.join(fixture.installRoot, "scripts"), { recursive: true });
  await fs.writeFile(path.join(fixture.installRoot, "VERSION"), "1.1.2\n");
  await assert.rejects(
    fixture.executor.reapply({ allowRestart: false, progress() {} }),
    (error) => error.code === "restart_required",
  );
  await fixture.executor.reapply({ allowRestart: true, progress() {} });
  assert.deepEqual(fixture.lastCommand(), {
    file: fixture.script("start-dream-skin-macos.sh"),
    args: ["--port", "9341", "--restart-existing"],
    options: { shell: false },
  });
});

test("hot reapplies without restart when verified CDP is available", async (t) => {
  const fixture = await executorFixture(t, { status: { codexRunning: true, cdpOk: true, port: 9444 } });
  await fs.mkdir(path.join(fixture.installRoot, "scripts"), { recursive: true });
  await fs.writeFile(path.join(fixture.installRoot, "VERSION"), "1.1.2\n");
  await fixture.executor.reapply({ allowRestart: false, progress() {} });
  assert.deepEqual(fixture.lastCommand().args, ["--port", "9444"]);
});

test("create and apply activate only validated theme data", async (t) => {
  const fixture = await executorFixture(t, { status: { codexRunning: false, cdpOk: false } });
  await fs.mkdir(path.join(fixture.installRoot, "scripts"), { recursive: true });
  await fs.writeFile(path.join(fixture.installRoot, "VERSION"), "1.1.2\n");
  const result = await fixture.executor.createTheme({
    bytes: Buffer.from("ffd8ffe0", "hex"),
    fields: {
      name: "网页主题",
      tagline: "tagline",
      quote: "BUILD",
      accent: "#7cff46",
      secondary: "#36d7e8",
      highlight: "#642a8c",
      apply: true,
      allowRestart: false,
    },
    progress() {},
  });
  assert.equal(result.theme.id, "img-20260719153000-a1b2c3d4");
  assert.equal(fixture.themeState.active.id, result.theme.id);
  assert.equal(fixture.lastCommand().file, fixture.script("start-dream-skin-macos.sh"));
});

test("restore requires exact confirmation and restart authorization", async (t) => {
  const fixture = await executorFixture(t);
  await fs.mkdir(path.join(fixture.installRoot, "scripts"), { recursive: true });
  await fs.writeFile(path.join(fixture.installRoot, "VERSION"), "1.1.2\n");
  await assert.rejects(
    fixture.executor.restore({ confirmation: "yes", allowRestart: true, progress() {} }),
    (error) => error.code === "validation_error",
  );
  await assert.rejects(
    fixture.executor.restore({ confirmation: "restore-official", allowRestart: false, progress() {} }),
    (error) => error.code === "validation_error",
  );
  await fixture.executor.restore({ confirmation: "restore-official", allowRestart: true, progress() {} });
  assert.deepEqual(fixture.lastCommand().args, ["--restore-base-theme", "--restart-codex"]);
});

test("serializes mutations and rejects a live lock owner", async (t) => {
  const fixture = await executorFixture(t, { inspectResult: { alive: true, matches: true } });
  await fs.mkdir(path.join(fixture.installRoot, "scripts"), { recursive: true });
  await fs.writeFile(path.join(fixture.installRoot, "VERSION"), "1.1.2\n");
  fixture.control.blockScript = "pause-dream-skin-macos.sh";
  fixture.control.blocker = { ...deferred(), release: deferred() };
  const first = fixture.executor.pause({ progress() {} });
  await fixture.control.blocker.promise;
  await assert.rejects(
    fixture.executor.reapply({ allowRestart: false, progress() {} }),
    (error) => error.code === "conflict",
  );
  fixture.control.blocker.release.resolve();
  await first;
});

test("recovers a proven stale mutation lock", async (t) => {
  const fixture = await executorFixture(t, { inspectResult: { alive: false, matches: false } });
  await fs.mkdir(path.join(fixture.installRoot, "scripts"), { recursive: true });
  await fs.writeFile(path.join(fixture.installRoot, "VERSION"), "1.1.2\n");
  const lockRoot = path.join(fixture.stateRoot, "web-studio");
  await fs.mkdir(lockRoot, { recursive: true });
  await fs.writeFile(path.join(lockRoot, "mutation.lock"), JSON.stringify({
    pid: 99999,
    startedAt: "old",
    operation: "pause",
  }));
  await fixture.executor.pause({ progress() {} });
  await assert.rejects(fs.access(path.join(lockRoot, "mutation.lock")));
});

test("verifies to a managed screenshot and resolves only that regular file", async (t) => {
  const fixture = await executorFixture(t);
  await fs.mkdir(path.join(fixture.installRoot, "scripts"), { recursive: true });
  await fs.writeFile(path.join(fixture.installRoot, "VERSION"), "1.1.2\n");
  const result = await fixture.executor.verify({ progress() {} });
  assert.equal(result.pass, true);
  assert.equal(result.screenshotUrl, "/api/verification/screenshot");
  const screenshot = await fixture.executor.verificationScreenshot();
  assert.equal(screenshot.contentType, "image/png");
  assert.equal(path.dirname(screenshot.path), path.join(fixture.stateRoot, "web-studio"));
});

test("bounds and redacts diagnostic log output", async (t) => {
  const fixture = await executorFixture(t);
  const lines = Array.from({ length: 45 }, (_, index) => `${index} ${fixture.stateRoot} /tmp/private-${index} #token=secret`);
  await fs.writeFile(path.join(fixture.stateRoot, "injector-error.log"), `${lines.join("\n")}\n`);
  const status = await fixture.executor.status();
  assert.equal(status.recentLogs.length, 40);
  assert.equal(status.recentLogs.some((line) => line.includes(fixture.stateRoot)), false);
  assert.equal(status.recentLogs.some((line) => line.includes("/tmp/private")), false);
  assert.equal(status.recentLogs.some((line) => line.includes("secret")), false);
});
