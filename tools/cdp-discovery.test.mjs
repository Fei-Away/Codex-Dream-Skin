import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFixtureServers } from "./cdp-discovery-fixture-server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(await fs.readFile(
  path.join(here, "..", "runtime", "fixtures", "cdp-discovery-cases.json"),
  "utf8",
));
const modules = [
  path.join(here, "..", "runtime", "cdp-discovery.mjs"),
  path.join(here, "..", "macos", "scripts", "cdp-discovery.mjs"),
  path.join(here, "..", "windows", "scripts", "cdp-discovery.mjs"),
];

function expectedCode(expectation) {
  return {
    "root-type": "CDP_DISCOVERY_ROOT_TYPE",
    "missing-field": "CDP_DISCOVERY_FIELD",
    "invalid-field": "CDP_DISCOVERY_FIELD",
    "too-many-targets": "CDP_DISCOVERY_TOO_MANY_TARGETS",
    "too-large": "CDP_DISCOVERY_RESPONSE_TOO_LARGE",
    redirect: "CDP_DISCOVERY_REDIRECT",
    "http-status": "CDP_DISCOVERY_HTTP_STATUS",
    "invalid-utf8": "CDP_DISCOVERY_INVALID_UTF8",
    "malformed-json": "CDP_DISCOVERY_MALFORMED_JSON",
  }[expectation];
}

for (const modulePath of modules) {
  const discovery = await import(pathToFileURL(modulePath).href);
  const running = await startFixtureServers(fixture);
  try {
    for (const testCase of fixture.cases) {
      const port = running.ports[testCase.name];
      const isPreParseCase = testCase.expect === "too-large";
      let parseCalls = 0;
      const parseJson = (...args) => {
        parseCalls += 1;
        return JSON.parse(...args);
      };
      try {
        const value = await discovery.fetchBoundedCdpJson(port, testCase.resource, { parseJson });
        assert.equal(testCase.expect, "ok", `${modulePath}: ${testCase.name} unexpectedly passed`);
        if (testCase.resource === "/json/list") assert.ok(Array.isArray(value));
        else assert.equal(typeof value, "object");
        if (testCase.name === "list-count-128") assert.equal(value.length, 128);
        if (testCase.name === "list-exact-byte-limit") assert.equal(value.length, 1);
      } catch (error) {
        assert.notEqual(testCase.expect, "ok", `${modulePath}: ${testCase.name} failed: ${error.message}`);
        assert.equal(error.code, expectedCode(testCase.expect), `${modulePath}: ${testCase.name}`);
      }
      if (isPreParseCase) assert.equal(parseCalls, 0, `${modulePath}: ${testCase.name} parsed before rejecting the size limit`);
      if (testCase.expect === "redirect") {
        assert.equal(running.stats[testCase.name].followedRedirect, 0, `${modulePath}: redirect was followed`);
      }
    }
  } finally {
    await running.close();
  }
}

console.log("PASS: CDP discovery contract covers bounded bytes, UTF-8, HTTP status, roots, fields, and target limits.");
