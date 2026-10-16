import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scripts = fileURLToPath(new URL("../scripts/", import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const locales = [
  { LANG: "en_US.UTF-8", LC_ALL: "", LC_TIME: "" },
  { LANG: "zh_CN.UTF-8", LC_ALL: "", LC_TIME: "" },
  { LANG: "en_US.UTF-8", LC_ALL: "zh_CN.UTF-8", LC_TIME: "" },
  { LANG: "en_US.UTF-8", LC_ALL: "", LC_TIME: "zh_CN.UTF-8" },
];

test("injector timestamps and identity remain stable across macOS locales", {
  skip: process.platform !== "darwin" ? "macOS ps locale formatting" : false,
}, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-identity-locale-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fixtureHome = path.join(root, "home");
  const stateRoot = path.join(fixtureHome, "Library/Application Support/CodexDreamSkinStudio");
  await fs.mkdir(stateRoot, { recursive: true });
  const injector = path.join(root, "inert-injector.mjs");
  // Only this owned inert process is inspected. No CDP connection or app launch.
  await fs.writeFile(injector, 'setInterval(() => {}, 60000); process.stdout.write("ready\\n");\n');
  const node = await fs.realpath(process.execPath);
  const child = spawn(node, [injector, "--watch", "--port", "9341", "--theme-dir", root], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  });
  await once(child.stdout, "data");
  const common = `source ${quote(path.join(scripts, "common-macos.sh"))}\n`;
  const envFor = (locale) => ({ ...process.env, ...locale, HOME: fixtureHome });
  const bash = (source, locale, args = []) => {
    const result = spawnSync("/bin/bash", ["-c", source, "fixture", ...args], {
      env: envFor(locale), encoding: "utf8", timeout: 5000,
    });
    assert.ifError(result.error);
    return result;
  };
  const startTimes = locales.map((locale) => {
    const result = bash(`${common}process_started_at "$1"`, locale, [String(child.pid)]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/);
    return result.stdout.trim();
  });
  assert.equal(new Set(startTimes).size, 1);
  const state = {
    schemaVersion: 4, session: "active", port: 9341, injectorPid: child.pid,
    injectorStartedAt: startTimes[0], nodePath: node, injectorPath: injector,
  };
  async function assertIdentity(record, locale, expected) {
    const result = bash(`${common}recorded_injector_process_matches "$@"`, locale, [
      String(record.injectorPid), record.injectorStartedAt, record.nodePath,
      record.injectorPath, String(record.port),
    ]);
    assert.equal(result.status, expected ? 0 : 1, result.stderr);
    await fs.writeFile(path.join(stateRoot, "state.json"), JSON.stringify(record, null, 2));
    const status = spawnSync("/bin/bash", [path.join(scripts, "status-dream-skin-macos.sh"), "--json"], {
      env: envFor(locale), encoding: "utf8", timeout: 5000,
    });
    assert.ifError(status.error);
    assert.equal(status.status, 0, status.stderr);
    const value = JSON.parse(status.stdout);
    assert.equal(value.injectorAlive, expected);
    assert.equal(value.session, expected ? "active" : "stale");
  }
  // Each locale records and checks every other locale, including LC_ALL/LC_TIME.
  for (const startedAt of startTimes) {
    for (const locale of locales) {
      await assertIdentity({ ...state, injectorStartedAt: startedAt }, locale, true);
    }
  }
  // Locale pinning must not relax any saved identity component.
  for (const changed of [
    { injectorStartedAt: startTimes[0].replace(/\d{4}$/, "1999") },
    { injectorStartedAt: "" }, { nodePath: "/tmp/wrong-node" },
    { injectorPath: "/tmp/wrong-injector.mjs" }, { port: 934 },
  ]) await assertIdentity({ ...state, ...changed }, locales[1], false);

  // Old localized timestamps lack their original locale. Do not guess a match
  // or waive start-time equality when a previous version recorded such state.
  const legacyStart = "四 10/ 8 17:24:26 2026";
  await assertIdentity({ ...state, injectorStartedAt: legacyStart }, locales[1], false);
});

test("all lstart readers pin locale, including shell harness identity fixtures", async () => {
  // Some macOS versions emit English even with zh_CN selected; this fixture
  // reproduces the locale-sensitive ps behavior reported on macOS 15.6.1.
  for (const name of ["common-macos.sh", "status-dream-skin-macos.sh", "../tests/run-tests.sh"]) {
    const source = await fs.readFile(path.join(scripts, name), "utf8");
    const readers = source.split("\n").filter((line) => line.includes("-o lstart="));
    assert.ok(readers.length > 0, name);
    for (const reader of readers) {
      const command = reader.match(/(?:LC_ALL=C )?\/bin\/ps -p "[^"\n]+" -o lstart=/)?.[0];
      assert.ok(command, reader);
      const stub = `ps_fixture() {
        if [ "\${LC_ALL:-}" = C ]; then printf 'Thu Oct 8 17:24:26 2026';
        else printf '四 10/ 8 17:24:26 2026'; fi
      }\n`;
      const result = spawnSync("/bin/bash", ["-c", stub + command.replace("/bin/ps", "ps_fixture")], {
        env: { ...process.env, ...locales[1] }, encoding: "utf8", timeout: 5000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "Thu Oct 8 17:24:26 2026", `${name}: ${reader}`);
    }
  }
});
