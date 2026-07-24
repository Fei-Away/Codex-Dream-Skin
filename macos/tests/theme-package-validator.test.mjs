import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadTheme as loadMacTheme } from "../scripts/injector.mjs";
import { loadTheme as loadWindowsTheme } from "../../windows/scripts/injector.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const macosRoot = path.resolve(here, "..");
const projectRoot = path.resolve(macosRoot, "..");
const validator = path.join(macosRoot, "assets", "theme-package-validator.mjs");
const macosInjector = path.join(macosRoot, "scripts", "injector.mjs");
const windowsInjector = path.join(projectRoot, "windows", "scripts", "injector.mjs");
const importer = path.join(macosRoot, "scripts", "import-theme-zip-macos.sh");
const fixtureImage = path.join(macosRoot, "assets", "portal-hero.png");
const tempRoot = await fs.mkdtemp(path.join("/tmp", "codex-dream-skin-package-contract-"));

const colors = {
  background: "#071116",
  panel: "#0b1a20",
  panelAlt: "#10272c",
  accent: "#7cff46",
  accentAlt: "#b8ff3d",
  secondary: "#36d7e8",
  highlight: "#642a8c",
  text: "#e9fff1",
  muted: "#9ebdb3",
  line: "rgba(124, 255, 70, .28)",
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      const result = { code, stdout, stderr };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(stderr || stdout || `${command} exited with ${code}`), result));
    });
  });
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileEntry(filePath, mediaType, bytes) {
  return { path: filePath, mediaType, bytes: bytes.length, sha256: digest(bytes) };
}

async function makeOfficial(name, options = {}) {
  const source = path.join(tempRoot, name);
  await fs.mkdir(source);
  const image = await fs.readFile(fixtureImage);
  const theme = {
    schemaVersion: 1,
    id: options.themeId ?? "studio.contract-theme",
    name: options.themeName ?? "Studio Contract Theme",
    image: options.themeImage ?? "background.png",
    appearance: "auto",
    art: { focusX: 0.7, focusY: 0.5, safeArea: "left", taskMode: "full" },
    colors,
  };
  if (options.mutateTheme) options.mutateTheme(theme);
  const themeData = jsonBytes(theme);
  const files = [
    fileEntry("theme.json", "application/json", themeData),
    fileEntry("background.png", "image/png", image),
  ];
  const capabilities = ["background", "tokens"];
  const extraFiles = new Map();
  if (options.css) {
    const css = Buffer.from(":root { --ds-theme-accent: #7cff46; }\n", "utf8");
    files.push(fileEntry("theme.css", "text/css", css));
    capabilities.push("safe-css");
    extraFiles.set("theme.css", css);
  }
  if (options.license) {
    const license = Buffer.from(options.licenseText ?? "CC0-1.0\n", "utf8");
    files.push(fileEntry("LICENSE.txt", "text/plain", license));
    extraFiles.set("LICENSE.txt", license);
  }
  if (options.signature) extraFiles.set("manifest.sig", Buffer.from("reserved-signature\n", "utf8"));
  const manifest = {
    packageVersion: 1,
    themeId: options.manifestThemeId ?? theme.id,
    version: "1.2.3",
    skinApiVersion: 1,
    minClientVersion: options.minClientVersion ?? "1.3.0",
    platforms: options.platforms ?? ["macos", "windows"],
    capabilities,
    publisher: { id: "dreamskin-studio", displayName: "DreamSkin Studio" },
    license: "CC0-1.0",
    provenance: { aiGenerated: false, summary: "Studio contract test package." },
    files,
    createdAt: "2026-07-24T00:00:00Z",
    ...(options.extraManifestField ? { unexpected: true } : {}),
  };
  if (options.mutateManifest) options.mutateManifest(manifest);
  await fs.writeFile(path.join(source, "manifest.json"), jsonBytes(manifest));
  await fs.writeFile(path.join(source, "theme.json"), themeData);
  await fs.writeFile(path.join(source, "background.png"), image);
  for (const [fileName, bytes] of extraFiles) await fs.writeFile(path.join(source, fileName), bytes);
  if (options.mutateImageAfterManifest) {
    const tampered = Buffer.from(image);
    tampered[tampered.length - 1] ^= 0x01;
    await fs.writeFile(path.join(source, "background.png"), tampered);
  }
  if (options.unknownFile) await fs.writeFile(path.join(source, "notes.txt"), "not registered\n");
  return { source, manifest, theme };
}

async function validate(source, platform, label) {
  const stage = path.join(tempRoot, `stage-${label}`);
  await fs.mkdir(stage);
  const result = await run(process.execPath, [
    validator,
    "--source", source,
    "--stage", stage,
    "--platform", platform,
    "--client-version", "1.3.3",
  ]);
  return { stage, output: JSON.parse(result.stdout) };
}

async function expectRejected(source, platform, pattern, label) {
  const stage = path.join(tempRoot, `rejected-${label}`);
  await fs.mkdir(stage);
  await assert.rejects(
    run(process.execPath, [
      validator,
      "--source", source,
      "--stage", stage,
      "--platform", platform,
      "--client-version", "1.3.3",
    ]),
    pattern,
  );
  assert.deepEqual(await fs.readdir(stage), []);
}

try {
  const base = await makeOfficial("official-base");
  const macos = await validate(base.source, "macos", "official-macos");
  const windows = await validate(base.source, "windows", "official-windows");
  assert.deepEqual(macos.output, {
    format: "official",
    image: "background.png",
    cssIgnored: false,
    signatureIgnored: false,
  });
  assert.deepEqual(windows.output, macos.output);
  assert.deepEqual((await fs.readdir(macos.stage)).sort(), [
    "background.png",
    "manifest.json",
    "theme.json",
  ]);

  for (const [injector, stage] of [[macosInjector, macos.stage], [windowsInjector, windows.stage]]) {
    const checked = await run(process.execPath, [injector, "--check-payload", "--theme-dir", stage]);
    assert.equal(JSON.parse(checked.stdout).pass, true, "Studio taskMode=full must pass both payload validators");
  }

  const boundaryColors = {
    background: "#abc",
    panel: "#abcd",
    panelAlt: "#11223344",
    accent: "#123456",
    accentAlt: "rgb(1, 2, 3)",
    secondary: "rgb(999, 0, 255)",
    highlight: "rgba(4, 5, 6, .5)",
    text: "#fff",
    muted: "#ffff",
    line: "rgba(124, 255, 70, .28)",
  };
  const longName = "😀".repeat(80);
  const longCopy = "✨".repeat(120);
  const boundaries = await makeOfficial("official-runtime-boundaries", {
    mutateTheme: (theme) => {
      theme.name = longName;
      theme.brandSubtitle = longCopy;
      theme.tagline = longCopy;
      theme.projectPrefix = longCopy;
      theme.projectLabel = longCopy;
      theme.statusText = longCopy;
      theme.quote = longCopy;
      theme.promoTitle = "ignored promo title";
      theme.promoSub = "ignored promo subtitle";
      theme.promoUrl = "https://example.invalid/ignored";
      theme.colors = boundaryColors;
    },
  });
  const macosBoundaries = await validate(boundaries.source, "macos", "runtime-boundaries-macos");
  const windowsBoundaries = await validate(boundaries.source, "windows", "runtime-boundaries-windows");
  const [loadedMac, loadedWindows] = await Promise.all([
    loadMacTheme(macosBoundaries.stage),
    loadWindowsTheme(windowsBoundaries.stage),
  ]);
  for (const loaded of [loadedMac, loadedWindows]) {
    assert.equal(loaded.theme.name, longName);
    for (const key of ["brandSubtitle", "tagline", "projectPrefix", "projectLabel", "statusText", "quote"]) {
      assert.equal(loaded.theme[key], longCopy, `${key} must retain 120 Unicode code points`);
    }
    assert.deepEqual(loaded.theme.colors, boundaryColors);
    assert.equal(Object.hasOwn(loaded.theme, "promoTitle"), false);
    assert.equal(Object.hasOwn(loaded.theme, "promoSub"), false);
    assert.equal(Object.hasOwn(loaded.theme, "promoUrl"), false);
  }

  const overlongCopy = await makeOfficial("official-overlong-copy", {
    mutateTheme: (theme) => { theme.brandSubtitle = "界".repeat(121); },
  });
  await expectRejected(overlongCopy.source, "macos", /invalid length/, "overlong-copy");
  await assert.rejects(loadMacTheme(overlongCopy.source), /invalid brandSubtitle field/);
  await assert.rejects(loadWindowsTheme(overlongCopy.source), /invalid brandSubtitle field/);

  const controlCopy = await makeOfficial("official-control-copy", {
    mutateTheme: (theme) => { theme.quote = "unsafe\u0007quote"; },
  });
  await expectRejected(controlCopy.source, "windows", /control characters/, "control-copy");
  await assert.rejects(loadMacTheme(controlCopy.source), /invalid quote field/);
  await assert.rejects(loadWindowsTheme(controlCopy.source), /invalid quote field/);

  const optional = await makeOfficial("official-optional", { css: true, license: true, signature: true });
  const optionalResult = await validate(optional.source, "macos", "official-optional");
  assert.equal(optionalResult.output.cssIgnored, true);
  assert.equal(optionalResult.output.signatureIgnored, true);
  assert.deepEqual((await fs.readdir(optionalResult.stage)).sort(), [
    "LICENSE.txt",
    "background.png",
    "manifest.json",
    "manifest.sig",
    "theme.css",
    "theme.json",
  ]);

  const simpleSource = path.join(tempRoot, "simple-source");
  await fs.mkdir(simpleSource);
  await fs.copyFile(fixtureImage, path.join(simpleSource, "custom-background.png"));
  await fs.writeFile(path.join(simpleSource, "theme.json"), jsonBytes({
    schemaVersion: 1,
    id: "local_simple",
    name: "Local Simplified Theme",
    image: "custom-background.png",
    art: { safeArea: "auto", taskMode: "auto" },
  }));
  const simple = await validate(simpleSource, "macos", "simple");
  assert.equal(simple.output.format, "simple");

  const tampered = await makeOfficial("tampered", { mutateImageAfterManifest: true });
  await expectRejected(tampered.source, "macos", /SHA-256/, "tampered");
  const bytesMismatch = await makeOfficial("bytes-mismatch", {
    mutateManifest: (manifest) => { manifest.files[0].bytes += 1; },
  });
  await expectRejected(bytesMismatch.source, "macos", /byte length/, "bytes-mismatch");
  const future = await makeOfficial("future-client", { minClientVersion: "9.9.9" });
  await expectRejected(future.source, "macos", /requires Dream Skin 9\.9\.9/, "future-client");
  const wrongPlatform = await makeOfficial("wrong-platform", { platforms: ["macos"] });
  await expectRejected(wrongPlatform.source, "windows", /does not support windows/, "wrong-platform");
  const wrongId = await makeOfficial("wrong-id", { manifestThemeId: "different.theme" });
  await expectRejected(wrongId.source, "macos", /themeId does not match/, "wrong-id");
  const wrongImage = await makeOfficial("wrong-image", { themeImage: "background.jpg" });
  await expectRejected(wrongImage.source, "macos", /image does not match/, "wrong-image");
  const unknown = await makeOfficial("unknown-file", { unknownFile: true });
  await expectRejected(unknown.source, "macos", /unregistered file notes\.txt/, "unknown-file");
  const extraField = await makeOfficial("extra-field", { extraManifestField: true });
  await expectRejected(extraField.source, "macos", /unsupported field unexpected/, "extra-field");

  if (process.platform === "darwin" &&
    process.env.CODEX_DREAM_SKIN_SKIP_SIGNED_RUNTIME_TESTS !== "1") {
    const importHome = path.join(tempRoot, "import-home");
    const active = path.join(importHome, "Library", "Application Support", "CodexDreamSkinStudio", "theme");
    await fs.mkdir(active, { recursive: true });
    await fs.copyFile(path.join(base.source, "theme.json"), path.join(active, "theme.json"));
    await fs.copyFile(path.join(base.source, "background.png"), path.join(active, "background.png"));
    const activeBefore = await Promise.all([
      fs.readFile(path.join(active, "theme.json")),
      fs.readFile(path.join(active, "background.png")),
    ]);
    const oversizedArchive = path.join(tempRoot, "oversized-source.zip");
    const oversizedHandle = await fs.open(oversizedArchive, "wx");
    try {
      await oversizedHandle.truncate((32 * 1024 * 1024) + 1);
    } finally {
      await oversizedHandle.close();
    }
    await assert.rejects(run(importer, ["--file", oversizedArchive], {
      env: { ...process.env, HOME: importHome, LC_ALL: "C", LANG: "C" },
    }), /32 MB archive limit/);
    const savedThemesRoot = path.join(
      importHome,
      "Library",
      "Application Support",
      "CodexDreamSkinStudio",
      "themes",
    );
    assert.equal(await fs.access(savedThemesRoot).then(() => true, () => false), false);

    const archive = path.join(tempRoot, "studio-export.zip");
    await run("/usr/bin/zip", ["-q", archive, ...await fs.readdir(optional.source)], { cwd: optional.source });
    const firstImport = await run(importer, ["--file", archive], {
      env: { ...process.env, HOME: importHome, LC_ALL: "C", LANG: "C" },
    });
    const firstResult = JSON.parse(firstImport.stdout);
    assert.equal(firstResult.status, "imported");
    assert.equal(firstResult.packageFormat, "official");
    assert.equal(firstResult.cssIgnored, true);
    assert.equal(firstResult.signatureIgnored, true);
    const saved = path.join(savedThemesRoot, firstResult.id);
    assert.deepEqual((await fs.readdir(saved)).sort(), ["LICENSE.txt", "background.png", "theme.css", "theme.json"]);
    const secondImport = JSON.parse((await run(importer, ["--file", archive], {
      env: { ...process.env, HOME: importHome, LC_ALL: "C", LANG: "C" },
    })).stdout);
    assert.equal(secondImport.status, "duplicate");

    const licenseVariant = await makeOfficial("official-license-variant", {
      css: true,
      license: true,
      licenseText: "MIT\n",
      signature: true,
    });
    const licenseArchive = path.join(tempRoot, "studio-license-variant.zip");
    await run("/usr/bin/zip", ["-q", licenseArchive, ...await fs.readdir(licenseVariant.source)], {
      cwd: licenseVariant.source,
    });
    const licenseImport = JSON.parse((await run(importer, ["--file", licenseArchive], {
      env: { ...process.env, HOME: importHome, LC_ALL: "C", LANG: "C" },
    })).stdout);
    assert.equal(licenseImport.status, "imported");
    assert.equal(licenseImport.id, "studio.contract-theme-2");
    assert.equal(await fs.readFile(path.join(
      importHome,
      "Library",
      "Application Support",
      "CodexDreamSkinStudio",
      "themes",
      licenseImport.id,
      "LICENSE.txt",
    ), "utf8"), "MIT\n");
    assert.deepEqual(await fs.readFile(path.join(active, "theme.json")), activeBefore[0]);
    assert.deepEqual(await fs.readFile(path.join(active, "background.png")), activeBefore[1]);

    console.log("PASS: Studio manifest ZIPs validate on macOS/Windows and import without changing active theme.");
  } else if (process.platform === "darwin") {
    console.log("PASS: Studio manifest packages validate on both client platforms.");
    console.log("SKIP: macOS shell importer integration requires an installed, signed Codex app.");
  } else {
    console.log("PASS: Studio manifest packages validate on both client platforms.");
    console.log("SKIP: macOS shell importer integration requires macOS.");
  }
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
