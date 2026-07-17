import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { assertCompatibility } from "./compatibility.mjs";
import { fail } from "./errors.mjs";
import { readStableFile } from "./stable-file.mjs";
import { installPreparedTheme } from "./theme-store.mjs";
import {
  validatePackageDeclarations,
  validatePackageEntries,
} from "./validate-source.mjs";
import { openStrictZipFile } from "./zip-file.mjs";

const execFileAsync = promisify(execFile);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(moduleDirectory, "..", "..");
const MAX_JSON_BYTES = 256 * 1024;
const MAX_BACKGROUND_BYTES = 16 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;

const FIXED_TEXT = {
  brandSubtitle: "CODEX DREAM SKIN",
  projectPrefix: "选择项目 · ",
  projectLabel: "◉  选择项目",
  statusText: "DREAM SKIN ONLINE",
};

function platformWarnings(platform) {
  if (platform !== "windows") return [];
  return [
    {
      code: "WINDOWS_TEXT_FIELDS_NOT_RENDERED",
      message: "Windows installs tagline and quote for portability but does not render them in the current shell.",
      fields: ["text.tagline", "text.quote"],
    },
    {
      code: "WINDOWS_EXTENDED_PALETTE_NOT_RENDERED",
      message: "Windows currently renders palette.accent; the other portable palette fields are retained but not rendered.",
      fields: ["palette.accentAlt", "palette.secondary", "palette.highlight"],
    },
  ];
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function compilePortableTheme(manifest, portableTheme, platform) {
  if (!["macos", "windows"].includes(platform)) {
    fail("COMPAT_PLATFORM_INVALID", "Platform must be macos or windows.", "platform");
  }
  const image = `background${path.extname(manifest.resources.background.path).toLowerCase()}`;
  const common = {
    schemaVersion: 1,
    id: manifest.packageId,
    name: portableTheme.name,
    ...FIXED_TEXT,
    tagline: portableTheme.text.tagline,
    quote: portableTheme.text.quote,
    image,
    appearance: portableTheme.appearance,
    art: { ...portableTheme.art },
  };
  return platform === "macos"
    ? { ...common, colors: { ...portableTheme.palette } }
    : { ...common, palette: { ...portableTheme.palette } };
}

async function validateCompiledTheme(stagingDirectory, platform) {
  const candidates = [
    path.join(repositoryRoot, platform, "scripts", "injector.mjs"),
    path.join(repositoryRoot, "scripts", "injector.mjs"),
    path.join(repositoryRoot, "..", "scripts", "injector.mjs"),
  ];
  let injector = null;
  for (const candidate of candidates) {
    const entry = await fs.lstat(candidate).catch(() => null);
    if (entry?.isFile() && !entry.isSymbolicLink()) {
      injector = candidate;
      break;
    }
  }
  if (!injector) fail("PLATFORM_RUNTIME_MISSING", `The ${platform} runtime validator is unavailable.`);
  try {
    await execFileAsync(process.execPath, [injector, "--check-payload", "--theme-dir", stagingDirectory], {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
    });
  } catch {
    fail("PLATFORM_THEME_INVALID", `Compiled ${platform} theme failed runtime validation.`);
  }
}

export async function prepareThemePackage({
  packagePath,
  platform,
  dreamSkinVersion,
  stagingDirectory,
}) {
  const archive = await openStrictZipFile(path.resolve(packagePath));
  try {
    const entries = new Map(archive.entryNames.map((name) => [name, null]));
    for (const name of ["manifest.json", "theme.json"]) {
      const result = await archive.readEntry(name, { maximum: MAX_JSON_BYTES });
      entries.set(name, result.bytes);
    }
    const { manifest, theme } = validatePackageDeclarations(entries);
    assertCompatibility(manifest, { platform, dreamSkinVersion });

    for (const name of ["LICENSE.txt", "NOTICE.txt"]) {
      if (entries.has(name)) {
        const result = await archive.readEntry(name, { maximum: MAX_JSON_BYTES });
        entries.set(name, result.bytes);
      }
    }
    for (const [resourceName, declaration] of Object.entries(manifest.resources)) {
      const maximum = resourceName === "background" ? MAX_BACKGROUND_BYTES : MAX_PREVIEW_BYTES;
      const systemName = `${resourceName}${path.extname(declaration.path).toLowerCase()}`;
      await archive.readEntry(declaration.path, {
        maximum,
        destination: path.join(stagingDirectory, systemName),
      });
      entries.set(declaration.path, await readStableFile(path.join(stagingDirectory, systemName), {
        maximum,
        invalidCode: "ASSET_FILE_INVALID",
        missingCode: "ASSET_FILE_MISSING",
        label: declaration.path,
        field: declaration.path,
      }));
    }

    const report = await validatePackageEntries(entries);
    const compiledTheme = compilePortableTheme(manifest, theme, platform);
    await fs.writeFile(path.join(stagingDirectory, "theme.json"), jsonBytes(compiledTheme), {
      flag: "wx",
      mode: 0o600,
    });
    await validateCompiledTheme(stagingDirectory, platform);
    return { report, compiledTheme };
  } finally {
    await archive.close();
  }
}

export async function importThemePackage({
  packagePath,
  platform,
  dreamSkinVersion,
  mode,
  stateRoot = null,
  replace = false,
}) {
  if (!["dry-run", "install"].includes(mode)) {
    fail("CLI_USAGE", "Import mode must be dry-run or install.");
  }
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-import-"));
  await fs.chmod(temporaryRoot, 0o700).catch(() => {});
  try {
    const { report, compiledTheme } = await prepareThemePackage({
      packagePath,
      platform,
      dreamSkinVersion,
      stagingDirectory: temporaryRoot,
    });
    const install = mode === "install"
      ? await installPreparedTheme({
        stateRoot,
        preparedDirectory: temporaryRoot,
        report,
        compiledTheme,
        platform,
        replace,
      })
      : { status: "not-requested" };
    return {
      pass: true,
      command: "import",
      mode,
      formatVersion: report.formatVersion,
      packageId: report.packageId,
      packageVersion: report.packageVersion,
      contentHash: report.contentHash,
      platform,
      author: { ...report.manifest.author },
      targets: [...report.manifest.targets],
      preview: { available: Boolean(report.resources.preview) },
      runtimeTheme: {
        id: compiledTheme.id,
        name: compiledTheme.name,
        image: compiledTheme.image,
        appearance: compiledTheme.appearance,
      },
      install,
      warnings: [...report.warnings, ...platformWarnings(platform)],
    };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}
