import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  calculateCoverCrop,
  contrastRatio,
  DEFAULT_SCENARIOS,
  evaluateThemeFit,
  renderHtmlReport,
  renderTextReport,
} from "../scripts/theme-fit-core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const cliScript = path.join(macosRoot, "scripts", "theme-fit-report.mjs");
const fixtureTheme = path.join(macosRoot, "presets", "preset-midnight-aurora");

function runCli(args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliScript, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...environment },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const landscape = calculateCoverCrop(
  { width: 2560, height: 1440 },
  { width: 1440, height: 900 },
  { x: 0.5, y: 0.5 },
);
assert.equal(landscape.scale, 0.625);
assert.deepEqual(landscape.visibleSource, {
  x: 128,
  y: 0,
  width: 2304,
  height: 1440,
});

const portrait = calculateCoverCrop(
  { width: 1200, height: 1800 },
  { width: 1440, height: 900 },
  { x: 0.5, y: 0.5 },
);
assert.equal(portrait.scale, 1.2);
assert.deepEqual(portrait.visibleSource, {
  x: 0,
  y: 525,
  width: 1200,
  height: 750,
});

assert.equal(contrastRatio("#000000", "#ffffff"), 21);

const warningReport = evaluateThemeFit({
  theme: {
    id: "fixture",
    name: "Fixture",
    image: "background.jpg",
    appearance: "auto",
    art: { focusX: 0.3, focusY: 0.5, safeArea: "left", taskMode: "auto" },
    colors: { text: "#777777", panel: "#888888" },
  },
  image: {
    width: 1200,
    height: 1800,
    ratio: 1200 / 1800,
    aspect: "portrait",
    taskMode: "ambient",
    bytes: 1000,
  },
});
assert.equal(warningReport.composition.taskMode, "ambient");
assert(warningReport.warnings.some(({ code }) => code === "safe-area-conflict"));
assert(warningReport.warnings.some(({ code }) => code === "low-contrast"));
assert(warningReport.scenarios.some(({ warnings }) =>
  warnings.some(({ code }) => code === "heavy-crop")));
const unusedBanner = warningReport.scenarios.find(({ id }) => id === "task-banner");
assert.equal(unusedBanner.status, "not-applicable");
assert.deepEqual(unusedBanner.warnings, []);
assert.equal(warningReport.summary.status, "warning");

const adaptiveReport = evaluateThemeFit({
  theme: {
    id: "adaptive",
    name: "Adaptive",
    image: "background.png",
    appearance: "auto",
    art: { safeArea: "auto", taskMode: "auto" },
  },
  image: {
    width: 1000,
    height: 1000,
    ratio: 1,
    aspect: "square",
    taskMode: "ambient",
    bytes: 1000,
  },
  scenarios: [
    { id: "square", label: "Square", width: 1000, height: 1000, kind: "home" },
  ],
});
assert(adaptiveReport.notices.some(({ code }) => code === "runtime-adaptive"));
assert.equal(adaptiveReport.summary.status, "pass");

const unsupportedColorReport = evaluateThemeFit({
  theme: {
    id: "unsupported-color",
    name: "Unsupported color",
    image: "background.png",
    colors: { heroText: "#000000", background: "#000000" },
  },
  image: {
    width: 1000,
    height: 1000,
    ratio: 1,
    aspect: "square",
    taskMode: "ambient",
    bytes: 1000,
  },
  scenarios: [
    { id: "square", label: "Square", width: 1000, height: 1000, kind: "home" },
  ],
});
assert(!unsupportedColorReport.contrasts.some(({ foreground }) => foreground === "heroText"));
assert(!unsupportedColorReport.warnings.some(({ pair }) => pair === "heroText-on-background"));

const text = renderTextReport(warningReport);
assert(text.includes("Theme: Fixture (fixture)"));
assert(text.includes("Image: 1200 x 1800"));
assert(text.includes("safe left"));
assert(text.includes("safe-area-conflict"));
for (const scenario of DEFAULT_SCENARIOS) assert(text.includes(scenario.label));
assert(text.endsWith("\n"));

const unsafeReport = {
  ...warningReport,
  theme: {
    ...warningReport.theme,
    name: "<script>alert(1)</script>",
  },
};
const html = renderHtmlReport(unsafeReport, "data:image/png;base64,AAAA");
assert(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
assert(!html.includes("<script>alert(1)</script>"));
assert(html.includes("default-src 'none'"));
assert(html.includes("data:image/png;base64,AAAA"));
assert(html.includes("align-items: start;"));
for (const scenario of DEFAULT_SCENARIOS) {
  assert(html.includes(`data-scenario="${scenario.id}"`));
}

const help = await runCli(["--help"]);
assert.equal(help.code, 0);
assert(help.stdout.includes("Usage: theme-fit-report.mjs"));

const invalidFormat = await runCli([
  "--theme-dir", fixtureTheme,
  "--format", "yaml",
]);
assert.equal(invalidFormat.code, 1);
assert(invalidFormat.stderr.includes("Unsupported format: yaml"));

const missingHtmlOutput = await runCli([
  "--theme-dir", fixtureTheme,
  "--format", "html",
]);
assert.equal(missingHtmlOutput.code, 1);
assert(missingHtmlOutput.stderr.includes("HTML format requires --output"));

const cliTemp = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-fit-cli-test-"));
try {
  const textResult = await runCli([
    "--theme-dir", fixtureTheme,
    "--format", "text",
  ], { TMPDIR: cliTemp });
  assert.equal(textResult.code, 0, textResult.stderr);
  assert(textResult.stdout.includes("Dream Skin Theme Fit"));
  assert(textResult.stdout.includes("午夜极光"));

  const jsonResult = await runCli([
    "--theme-dir", fixtureTheme,
    "--format", "json",
  ], { TMPDIR: cliTemp });
  assert.equal(jsonResult.code, 0, jsonResult.stderr);
  const jsonReport = JSON.parse(jsonResult.stdout);
  assert.equal(jsonReport.schemaVersion, 1);
  assert.equal(jsonReport.theme.id, "preset-midnight-aurora");
  assert.equal(jsonReport.scenarios.length, 4);

  const htmlOutput = path.join(cliTemp, "theme-fit.html");
  const htmlResult = await runCli([
    "--theme-dir", fixtureTheme,
    "--format", "html",
    "--output", htmlOutput,
  ], { TMPDIR: cliTemp });
  assert.equal(htmlResult.code, 0, htmlResult.stderr);
  const savedHtml = await fs.readFile(htmlOutput, "utf8");
  assert(savedHtml.includes("data:image/jpeg;base64,"));
  assert(savedHtml.includes('data-scenario="home-narrow"'));
  assert.deepEqual((await fs.readdir(cliTemp)).sort(), ["theme-fit.html"]);

  const normalizedTheme = path.join(cliTemp, "normalized-theme");
  await fs.mkdir(normalizedTheme);
  await fs.copyFile(
    path.join(fixtureTheme, "background.jpg"),
    path.join(normalizedTheme, "background.jpg"),
  );
  await fs.writeFile(
    path.join(normalizedTheme, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: " ", name: " ", image: "background.jpg" })}\n`,
  );
  const normalizedResult = await runCli([
    "--theme-dir", normalizedTheme,
    "--format", "json",
  ], { TMPDIR: cliTemp });
  assert.equal(normalizedResult.code, 0, normalizedResult.stderr);
  const normalizedReport = JSON.parse(normalizedResult.stdout);
  assert.equal(normalizedReport.theme.id, "custom");
  assert.equal(normalizedReport.theme.name, "Codex Dream Skin");

  const invalidTheme = path.join(cliTemp, "invalid-theme");
  const outsideImage = path.join(cliTemp, "outside.png");
  const invalidOutput = path.join(cliTemp, "invalid-report.json");
  await fs.mkdir(invalidTheme);
  await fs.writeFile(outsideImage, Buffer.from("not-an-image"));
  await fs.writeFile(
    path.join(invalidTheme, "theme.json"),
    `${JSON.stringify({ schemaVersion: 1, id: "invalid", image: "../outside.png" })}\n`,
  );
  const invalidResult = await runCli([
    "--theme-dir", invalidTheme,
    "--format", "json",
    "--output", invalidOutput,
  ], { TMPDIR: cliTemp });
  assert.equal(invalidResult.code, 1);
  assert(invalidResult.stderr.includes("inside its theme directory"));
  await assert.rejects(fs.access(invalidOutput));
} finally {
  await fs.rm(cliTemp, { recursive: true, force: true });
}

console.log("PASS: theme fit calculations and renderers are deterministic.");
