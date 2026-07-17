import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stageTheme } from "./stage-theme.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const INJECTOR = path.join(SCRIPT_DIR, "injector.mjs");
const TRANSACTION_NAME = "theme-preview";

function parseArgs(argv) {
  const [action, ...rest] = argv;
  if (!["begin", "commit", "cancel", "status"].includes(action)) {
    throw new Error("Usage: theme-preview.mjs <begin|commit|cancel|status> --state-root <path>");
  }
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument: ${key ?? ""}`);
    }
    options[key.slice(2)] = value;
  }
  if (!options["state-root"]) throw new Error("--state-root is required");
  return { action, options };
}

function assertContained(rootPath, candidatePath, label, allowRoot = false) {
  const relative = path.relative(rootPath, candidatePath);
  if (
    (allowRoot && relative === "")
    || (relative !== "" && !path.isAbsolute(relative)
      && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  ) return;
  throw new Error(`${label} must stay inside ${rootPath}`);
}

async function pathExists(target) {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function assertDirectoryWithoutSymlink(target, label) {
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a real directory`);
  }
}

function validatePayload(themeDirectory) {
  const result = spawnSync(
    process.execPath,
    [INJECTOR, "--check-payload", "--theme-dir", themeDirectory],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || "Theme payload validation failed").trim(),
    );
  }
}

async function readTheme(themeDirectory) {
  const configPath = path.join(themeDirectory, "theme.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  if (config?.schemaVersion !== 1 || typeof config.image !== "string" || !config.image) {
    throw new Error("Theme config has an unsupported schema or image field");
  }
  if (path.basename(config.image) !== config.image || config.image === "theme.json") {
    throw new Error("Theme image must be a file inside its theme directory");
  }
  return config;
}

async function writeJsonExclusive(target, value) {
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}

async function publishSnapshot(stateRoot, sourceDirectory) {
  const activeDirectory = path.join(stateRoot, "theme");
  await fs.mkdir(activeDirectory, { recursive: true, mode: 0o700 });
  await assertDirectoryWithoutSymlink(activeDirectory, "Active theme directory");

  const stage = await fs.mkdtemp(path.join(stateRoot, ".theme-preview.publish."));
  await fs.chmod(stage, 0o700);
  try {
    const sourceImageName = await stageTheme(sourceDirectory, stage);
    validatePayload(stage);
    const theme = await readTheme(stage);
    const imageBytes = await fs.readFile(path.join(stage, sourceImageName));
    const extension = path.extname(sourceImageName).toLowerCase();
    const imageName = `preview-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
    const targetImage = path.join(activeDirectory, imageName);
    assertContained(activeDirectory, targetImage, "Published theme image");
    await fs.writeFile(targetImage, imageBytes, { flag: "wx", mode: 0o600 });

    let oldImage = "";
    try {
      const oldTheme = await readTheme(activeDirectory);
      oldImage = oldTheme.image;
    } catch {}

    theme.image = imageName;
    const configPath = path.join(activeDirectory, "theme.json");
    const temporaryConfig = path.join(
      activeDirectory,
      `.theme.json.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      await fs.writeFile(temporaryConfig, `${JSON.stringify(theme, null, 2)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
      await fs.rename(temporaryConfig, configPath);
    } finally {
      await fs.rm(temporaryConfig, { force: true }).catch(() => {});
    }

    validatePayload(activeDirectory);
    if (oldImage && oldImage !== imageName && path.basename(oldImage) === oldImage) {
      const oldImagePath = path.join(activeDirectory, oldImage);
      assertContained(activeDirectory, oldImagePath, "Previous theme image");
      await fs.rm(oldImagePath, { force: true }).catch(() => {});
    }
    return theme;
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}

async function readTransaction(stateRoot) {
  const transaction = path.join(stateRoot, TRANSACTION_NAME);
  await assertDirectoryWithoutSymlink(transaction, "Theme preview transaction");
  const transactionReal = await fs.realpath(transaction);
  assertContained(stateRoot, transactionReal, "Theme preview transaction");
  const statePath = path.join(transaction, "preview.json");
  const stateStat = await fs.lstat(statePath);
  if (stateStat.isSymbolicLink() || !stateStat.isFile()) {
    throw new Error("Theme preview state must be a regular file");
  }
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  if (
    state?.schemaVersion !== 1
    || !Number.isInteger(state.ownerPid)
    || state.ownerPid < 1
    || typeof state.ownerStartedAt !== "string"
    || !state.ownerStartedAt
  ) {
    throw new Error("Theme preview state has an unsupported schema");
  }
  const backup = path.join(transaction, "backup");
  const candidate = path.join(transaction, "candidate");
  await assertDirectoryWithoutSymlink(backup, "Theme preview backup");
  await assertDirectoryWithoutSymlink(candidate, "Theme preview candidate");
  assertContained(transactionReal, await fs.realpath(backup), "Theme preview backup");
  assertContained(transactionReal, await fs.realpath(candidate), "Theme preview candidate");
  return {
    transaction,
    backup,
    candidate,
    state,
  };
}

async function closeTransaction(stateRoot, transaction) {
  const cleanup = path.join(
    stateRoot,
    `.theme-preview.cleanup.${process.pid}.${randomUUID()}`,
  );
  await fs.rename(transaction, cleanup);
  await fs.rm(cleanup, { recursive: true, force: true }).catch(() => {});
}

async function begin(stateRoot, options) {
  const source = options.source;
  const ownerPid = Number(options["owner-pid"]);
  const ownerStartedAt = options["owner-started-at"];
  if (!source || !Number.isInteger(ownerPid) || ownerPid < 1 || !ownerStartedAt) {
    throw new Error("begin requires --source, --owner-pid, and --owner-started-at");
  }

  const transaction = path.join(stateRoot, TRANSACTION_NAME);
  if (await pathExists(transaction)) {
    throw new Error("Another theme preview is already in progress");
  }
  const themesDirectory = path.join(stateRoot, "themes");
  await assertDirectoryWithoutSymlink(themesDirectory, "Saved themes directory");
  const themesRoot = await fs.realpath(themesDirectory);
  assertContained(stateRoot, themesRoot, "Saved themes directory");
  const sourceRoot = await fs.realpath(source);
  assertContained(themesRoot, sourceRoot, "Preview theme");
  const activeRoot = await fs.realpath(path.join(stateRoot, "theme"));
  assertContained(stateRoot, activeRoot, "Active theme", true);

  const preparation = await fs.mkdtemp(path.join(stateRoot, ".theme-preview.prepare."));
  await fs.chmod(preparation, 0o700);
  let published = false;
  try {
    const backup = path.join(preparation, "backup");
    const candidate = path.join(preparation, "candidate");
    await fs.mkdir(backup, { mode: 0o700 });
    await fs.mkdir(candidate, { mode: 0o700 });
    await stageTheme(activeRoot, backup);
    await stageTheme(sourceRoot, candidate);
    validatePayload(backup);
    validatePayload(candidate);
    await writeJsonExclusive(path.join(preparation, "preview.json"), {
      schemaVersion: 1,
      ownerPid,
      ownerStartedAt,
      createdAt: new Date().toISOString(),
    });
    await fs.rename(preparation, transaction);
    published = true;
    try {
      return await publishSnapshot(stateRoot, path.join(transaction, "candidate"));
    } catch (error) {
      try {
        await publishSnapshot(stateRoot, path.join(transaction, "backup"));
        await closeTransaction(stateRoot, transaction);
      } catch {
        // Preserve the transaction and its complete backup for a later recovery.
      }
      throw error;
    }
  } finally {
    if (!published) {
      await fs.rm(preparation, { recursive: true, force: true });
    }
  }
}

async function commit(stateRoot) {
  const preview = await readTransaction(stateRoot);
  const theme = await readTheme(path.join(stateRoot, "theme"));
  await closeTransaction(stateRoot, preview.transaction);
  return theme;
}

async function cancel(stateRoot) {
  const preview = await readTransaction(stateRoot);
  const restored = await publishSnapshot(stateRoot, preview.backup);
  await closeTransaction(stateRoot, preview.transaction);
  return restored;
}

async function main() {
  const { action, options } = parseArgs(process.argv.slice(2));
  const stateRoot = path.resolve(options["state-root"]);
  await fs.mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await assertDirectoryWithoutSymlink(stateRoot, "Theme state root");
  const stateRootReal = await fs.realpath(stateRoot);

  let result;
  if (action === "begin") result = await begin(stateRootReal, options);
  if (action === "commit") result = await commit(stateRootReal);
  if (action === "cancel") result = await cancel(stateRootReal);
  if (action === "status") result = (await readTransaction(stateRootReal)).state;
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

await main();
