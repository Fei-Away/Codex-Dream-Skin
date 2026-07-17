import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateThemeFit,
  renderHtmlReport,
  renderTextReport,
} from "./theme-fit-core.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptRoot = path.dirname(scriptPath);
const macosRoot = path.resolve(scriptRoot, "..");
const stageScript = path.join(scriptRoot, "stage-theme.mjs");
const injectorScript = path.join(scriptRoot, "injector.mjs");
const supportedFormats = new Set(["text", "json", "html"]);

function usage() {
  return `Usage: theme-fit-report.mjs --theme-dir <directory> [options]

Options:
  --format text|json|html  Report format (default: text)
  --output <file>         Write the report to a file
  --help                  Show this help
`;
}

export function parseArgs(argv) {
  const options = { format: "text", output: null, themeDir: null, help: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}`);
      seen.add(argument);
      options.help = true;
      continue;
    }
    if (!["--theme-dir", "--format", "--output"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}`);
    seen.add(argument);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    index += 1;
    if (argument === "--theme-dir") options.themeDir = path.resolve(value);
    else if (argument === "--format") options.format = value;
    else options.output = path.resolve(value);
  }

  if (options.help) return options;
  if (!options.themeDir) throw new Error("Missing required --theme-dir");
  if (!supportedFormats.has(options.format)) throw new Error(`Unsupported format: ${options.format}`);
  if (options.format === "html" && !options.output) {
    throw new Error("HTML format requires --output");
  }
  return options;
}

function runNode(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: macosRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error((stderr || stdout || `Command failed: ${script}`).trim()));
    });
  });
}

function imageMime(imageName) {
  const extension = path.extname(imageName).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

async function buildReport(themeDir) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-dream-skin-fit-"));
  const stageDir = path.join(temporaryRoot, "stage");
  try {
    await fs.mkdir(stageDir, { mode: 0o700 });
    await runNode(stageScript, [themeDir, stageDir]);
    const payload = JSON.parse(await runNode(injectorScript, [
      "--check-payload",
      "--theme-dir",
      stageDir,
    ]));
    const theme = JSON.parse(await fs.readFile(path.join(stageDir, "theme.json"), "utf8"));
    const imageBytes = await fs.readFile(path.join(stageDir, theme.image));
    const report = evaluateThemeFit({
      theme: {
        ...theme,
        id: payload.themeId,
        name: payload.themeName,
      },
      image: {
        ...payload.artMetadata,
        bytes: payload.imageBytes,
      },
    });
    const imageDataUrl = `data:${imageMime(theme.image)};base64,${imageBytes.toString("base64")}`;
    return { imageDataUrl, report };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function atomicWrite(outputPath, content) {
  const directory = await fs.realpath(path.dirname(outputPath));
  const target = path.join(directory, path.basename(outputPath));
  const temporary = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, target);
    await fs.chmod(target, 0o600);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function formatReport(format, report, imageDataUrl) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "html") return renderHtmlReport(report, imageDataUrl);
  return renderTextReport(report);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const { imageDataUrl, report } = await buildReport(options.themeDir);
  const output = formatReport(options.format, report, imageDataUrl);
  if (options.output) await atomicWrite(options.output, output);
  else process.stdout.write(output);
}

if (path.resolve(process.argv[1] || "") === path.resolve(scriptPath)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`[theme-fit] ${error.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
