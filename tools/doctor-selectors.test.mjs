import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { gradeDoctorResult, selectorMatchesScope } from "./doctor-selectors.mjs";

const contract = JSON.parse(await fs.readFile(new URL("./selectors.json", import.meta.url), "utf8"));
const selectorFor = (key) => contract.selectors.find((entry) => entry.key === key)?.selector;
assert.equal(
  selectorFor("shell-main"),
  "main:is(.main-surface, [data-app-shell-main-surface], [class*=\"_MainContentSurface_\"])",
  "The shell contract must support both legacy and Codex 26.727 main surfaces.",
);
assert.equal(
  selectorFor("header-tint"),
  "header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*=\"_Header_\"])",
  "The header contract must support both legacy and Codex 26.727 headers.",
);
assert.match(selectorFor("shell-main"), /\[class\*=\"_MainContentSurface_\"\]/);
assert.match(selectorFor("header-tint"), /\[class\*=\"_Header_\"\]/);
assert.doesNotMatch(selectorFor("shell-main"), /_[A-Za-z]+_[a-z0-9]{4,}/);
assert.doesNotMatch(selectorFor("header-tint"), /_[A-Za-z]+_[a-z0-9]{4,}/);
assert.equal(
  selectorFor("main-content-top-fade"),
  ':is(.app-shell-main-content-top-fade, [data-app-shell-main-content-top-fade], [class*="_MainContentTopFade_"])',
);
assert.equal(
  selectorFor("message"),
  ':is([data-message-author-role], [data-local-conversation-user-anchor], [data-local-conversation-final-assistant])',
  "The message contract must bridge both legacy and Codex 26.727 role boundaries.",
);
assert.equal(
  selectorFor("settings-panel"),
  '[data-settings-panel-slug="general-settings"]',
  "The Settings contract must use the stable Codex 26.727 general-settings panel marker.",
);
const resultFor = (baseState, hits, overlay = false) => gradeDoctorResult(contract, {
  baseState,
  overlay,
  appearance: "dark",
  probes: contract.selectors.map(({ key }) => ({ key, count: hits.includes(key) ? 1 : 0 })),
});

const home = resultFor("home", [
  "shell-main", "left-panel", "header-tint", "home-icon", "home-route", "home-route-css",
]);
assert.equal(home.pass, true);
assert.equal(home.exitCode, 0);
assert.equal(home.tiers.L1.length, 6);
assert.equal(home.tiers.L2.find(({ key }) => key === "project-selector").status, "miss(config)");

const brokenHome = resultFor("home", ["shell-main", "left-panel", "header-tint", "home-icon"]);
assert.equal(brokenHome.pass, false);
assert.equal(brokenHome.exitCode, 1);

const settings = resultFor("settings", ["settings-panel"]);
assert.equal(settings.pass, true);
assert.equal(settings.tiers.L1.length, 0, "Settings must not inherit home/all L1 requirements");
assert.deepEqual(settings.tiers.L2.map(({ key }) => key), ["settings-panel", "appearance-radio"]);
assert.equal(settings.tiers.L2.find(({ key }) => key === "settings-panel").status, "ok");
assert.equal(settings.tiers.L2.find(({ key }) => key === "appearance-radio").status, "miss");

assert.equal(selectorMatchesScope("home+thread", { baseState: "thread", overlay: false }), true);
assert.equal(selectorMatchesScope("home config", { baseState: "home", overlay: false }), true);
assert.equal(selectorMatchesScope("overlay", { baseState: "home", overlay: true }), true);

console.log("PASS: selector doctor applies state scopes and L1 grading.");
