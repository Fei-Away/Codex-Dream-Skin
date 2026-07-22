import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { gradeDoctorResult, selectorMatchesScope } from "./doctor-selectors.mjs";

const contract = JSON.parse(await fs.readFile(new URL("./selectors.json", import.meta.url), "utf8"));
const resultFor = (baseState, hits, overlay = false) => gradeDoctorResult(contract, {
  baseState,
  overlay,
  appearance: "dark",
  probes: contract.selectors.map(({ key }) => ({ key, count: hits.includes(key) ? 1 : 0 })),
});

const home = resultFor("home", [
  "shell-main", "left-panel", "header-tint", "home-icon", "home-route",
]);
assert.equal(home.pass, true);
assert.equal(home.exitCode, 0);
assert.equal(home.tiers.L1.length, 5);
assert.equal(home.tiers.L2.find(({ key }) => key === "project-selector").status, "miss(config)");

const brokenHome = resultFor("home", ["shell-main", "left-panel", "header-tint", "home-icon"]);
assert.equal(brokenHome.pass, false);
assert.equal(brokenHome.exitCode, 1);

const settings = resultFor("settings", ["appearance-radio"]);
assert.equal(settings.pass, true);
assert.equal(settings.tiers.L1.length, 0, "Settings must not inherit home/all L1 requirements");
assert.deepEqual(settings.tiers.L2.map(({ key }) => key), ["appearance-radio"]);

assert.equal(selectorMatchesScope("home+thread", { baseState: "thread", overlay: false }), true);
assert.equal(selectorMatchesScope("home config", { baseState: "home", overlay: false }), true);
assert.equal(selectorMatchesScope("overlay", { baseState: "home", overlay: true }), true);

console.log("PASS: selector doctor applies state scopes and L1 grading.");
