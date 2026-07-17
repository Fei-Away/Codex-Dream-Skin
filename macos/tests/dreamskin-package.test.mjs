import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  DreamSkinPackageError,
  exportPackage,
  importPackage,
  inspectPackage,
} from "../scripts/dreamskin-package.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM_ROOT = path.dirname(TEST_DIR);
const REPO_ROOT = path.dirname(PLATFORM_ROOT);
const OTHER_PLATFORM = path.basename(PLATFORM_ROOT) === "macos" ? "windows" : "macos";
const OTHER_MODULE = path.join(
  REPO_ROOT,
  OTHER_PLATFORM,
  "scripts",
  "dreamskin-package.mjs",
);
const LOCAL_MODULE = path.join(PLATFORM_ROOT, "scripts", "dreamskin-package.mjs");
const execFileAsync = promisify(execFile);
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlX1ZkAAAAASUVORK5CYII=",
  "base64",
);

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function makeTheme(root, overrides = {}) {
  const themeDirectory = path.join(root, "source-theme");
  await mkdir(themeDirectory, { recursive: true });
  const theme = {
    schemaVersion: 1,
    id: "test-rose",
    name: "Test Rose",
    image: "background.png",
    appearance: "auto",
    art: {
      focusX: 0.5,
      focusY: null,
      safeArea: "auto",
      taskMode: "ambient",
    },
    extensionField: { preserved: true },
    ...overrides,
  };
  await writeFile(
    path.join(themeDirectory, "theme.json"),
    `${JSON.stringify(theme, null, 2)}\n`,
    "utf8",
  );
  if (
    typeof theme.image === "string" &&
    !theme.image.includes("..") &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(theme.image)
  ) {
    await writeFile(path.join(themeDirectory, theme.image), PNG_1X1);
  }
  return { themeDirectory, theme };
}

async function withTempDirectory(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dreamskin-package-test-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof DreamSkinPackageError);
    assert.equal(error.code, code);
    return true;
  });
}

test("macOS and Windows ship byte-identical package modules", async (t) => {
  try {
    const [localBytes, otherBytes] = await Promise.all([
      readFile(path.join(PLATFORM_ROOT, "scripts", "dreamskin-package.mjs")),
      readFile(OTHER_MODULE),
    ]);
    assert.equal(hash(localBytes), hash(otherBytes));
  } catch (error) {
    if (error?.code === "ENOENT") {
      t.skip("The sibling platform tree is not included in this standalone package.");
      return;
    }
    throw error;
  }
});

test(
  "standalone macOS archives include portable package documentation",
  {
    skip:
      process.platform === "win32" ||
      path.basename(PLATFORM_ROOT) !== "macos",
  },
  async () => {
    await withTempDirectory(async (root) => {
      const archiveRoot = path.join(root, "archive");
      await mkdir(archiveRoot);
      await copyFile(
        path.join(PLATFORM_ROOT, "NOTICE.md"),
        path.join(archiveRoot, "NOTICE.md"),
      );
      await execFileAsync("/bin/bash", [
        path.join(PLATFORM_ROOT, "scripts", "prepare-standalone-docs.sh"),
        archiveRoot,
        path.join(REPO_ROOT, "docs"),
      ]);

      const packageGuide = await readFile(
        path.join(archiveRoot, "docs", "dreamskin-package.md"),
        "utf8",
      );
      assert.match(
        packageGuide,
        /node scripts\/dreamskin-package\.mjs inspect rose\.dreamskin/,
      );
      assert.doesNotMatch(
        packageGuide,
        /node macos\/scripts\/dreamskin-package\.mjs/,
      );
      assert.match(
        packageGuide,
        /https:\/\/github\.com\/Fei-Away\/Codex-Dream-Skin\/blob\/main\/schemas\/dreamskin-package-v1\.schema\.json/,
      );
    });
  },
);

test("the CLI exposes the same export and inspect contract", async () => {
  await withTempDirectory(async (root) => {
    const { themeDirectory } = await makeTheme(root);
    const packageFile = path.join(root, "cli.dreamskin");
    const exported = await execFileAsync(process.execPath, [
      LOCAL_MODULE,
      "export",
      themeDirectory,
      packageFile,
    ]);
    const inspected = await execFileAsync(process.execPath, [
      LOCAL_MODULE,
      "inspect",
      packageFile,
    ]);
    const exportReceipt = JSON.parse(exported.stdout);
    const inspectReceipt = JSON.parse(inspected.stdout);
    assert.equal(exportReceipt.output, packageFile);
    assert.equal(exportReceipt.packageSha256, inspectReceipt.packageSha256);
    assert.equal(exportReceipt.contentId, inspectReceipt.contentId);
  });
});

test("export, inspect, and import form a deterministic cross-platform round trip", async () => {
  await withTempDirectory(async (root) => {
    const { themeDirectory, theme } = await makeTheme(root);
    const firstPackage = path.join(root, "first.dreamskin");
    const secondPackage = path.join(root, "second.dreamskin");
    const imported = path.join(root, "imported-theme");

    const first = await exportPackage(themeDirectory, firstPackage);
    const second = await exportPackage(themeDirectory, secondPackage);
    assert.deepEqual(await readFile(firstPackage), await readFile(secondPackage));
    assert.equal(first.packageSha256, second.packageSha256);
    assert.equal(first.image.width, 1);
    assert.equal(first.image.height, 1);
    assert.equal(first.preview, null);

    const inspected = await inspectPackage(firstPackage);
    const { output: _output, ...expectedInspection } = first;
    assert.deepEqual(inspected, expectedInspection);

    const receipt = await importPackage(firstPackage, imported);
    assert.equal(receipt.contentId, first.contentId);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(imported, "theme.json"), "utf8")),
      theme,
    );
    assert.deepEqual(await readFile(path.join(imported, "background.png")), PNG_1X1);
  });
});

test("optional previews are validated but are not installed as theme payloads", async () => {
  await withTempDirectory(async (root) => {
    const { themeDirectory } = await makeTheme(root);
    const preview = path.join(root, "card.PNG");
    const packageFile = path.join(root, "preview.dreamskin");
    const imported = path.join(root, "imported");
    await writeFile(preview, PNG_1X1);

    const receipt = await exportPackage(themeDirectory, packageFile, {
      previewPath: preview,
    });
    assert.equal(receipt.preview.path, "preview.png");
    assert.equal(receipt.preview.width, 1);
    await importPackage(packageFile, imported);
    await assert.rejects(readFile(path.join(imported, "preview.png")), {
      code: "ENOENT",
    });
  });
});

test("inspect rejects duplicate JSON keys and unsupported package versions", async () => {
  await withTempDirectory(async (root) => {
    const { themeDirectory } = await makeTheme(root);
    const validPackage = path.join(root, "valid.dreamskin");
    await exportPackage(themeDirectory, validPackage);
    const validText = await readFile(validPackage, "utf8");

    const duplicate = path.join(root, "duplicate.dreamskin");
    await writeFile(
      duplicate,
      validText.replace(
        '"packageVersion": 1,',
        '"packageVersion": 1,\n  "packageVersion": 1,',
      ),
      "utf8",
    );
    await expectCode(inspectPackage(duplicate), "PACKAGE_INVALID_JSON");

    const prototypeField = path.join(root, "prototype-field.dreamskin");
    await writeFile(
      prototypeField,
      validText.replace(
        "{\n",
        '{\n  "__proto__": { "polluted": true },\n',
      ),
      "utf8",
    );
    await expectCode(inspectPackage(prototypeField), "PACKAGE_SHAPE_INVALID");
    assert.equal(Object.prototype.polluted, undefined);

    const future = path.join(root, "future.dreamskin");
    const futureEnvelope = JSON.parse(validText);
    futureEnvelope.packageVersion = 2;
    await writeFile(future, `${JSON.stringify(futureEnvelope, null, 2)}\n`, "utf8");
    await expectCode(inspectPackage(future), "PACKAGE_VERSION_UNSUPPORTED");
  });
});

test("integrity, media, and canonical base64 failures have stable errors", async () => {
  await withTempDirectory(async (root) => {
    const { themeDirectory } = await makeTheme(root);
    const validPackage = path.join(root, "valid.dreamskin");
    await exportPackage(themeDirectory, validPackage);
    const envelope = JSON.parse(await readFile(validPackage, "utf8"));

    const corrupted = path.join(root, "corrupted.dreamskin");
    const corruptedEnvelope = structuredClone(envelope);
    corruptedEnvelope.image.sha256 = "0".repeat(64);
    await writeFile(
      corrupted,
      `${JSON.stringify(corruptedEnvelope, null, 2)}\n`,
      "utf8",
    );
    await expectCode(inspectPackage(corrupted), "CONTENT_HASH_MISMATCH");

    const mediaMismatch = path.join(root, "media-mismatch.dreamskin");
    const mediaEnvelope = structuredClone(envelope);
    mediaEnvelope.image.mediaType = "image/jpeg";
    await writeFile(
      mediaMismatch,
      `${JSON.stringify(mediaEnvelope, null, 2)}\n`,
      "utf8",
    );
    await expectCode(inspectPackage(mediaMismatch), "IMAGE_INVALID");

    const nonCanonical = path.join(root, "noncanonical.dreamskin");
    const base64Envelope = structuredClone(envelope);
    base64Envelope.image.data = `${base64Envelope.image.data}\n`;
    await writeFile(
      nonCanonical,
      `${JSON.stringify(base64Envelope, null, 2)}\n`,
      "utf8",
    );
    await expectCode(inspectPackage(nonCanonical), "CONTENT_ENCODING_INVALID");

    const sizeMismatch = path.join(root, "size-mismatch.dreamskin");
    const sizeEnvelope = structuredClone(envelope);
    sizeEnvelope.image.bytes += 1;
    await writeFile(
      sizeMismatch,
      `${JSON.stringify(sizeEnvelope, null, 2)}\n`,
      "utf8",
    );
    await expectCode(inspectPackage(sizeMismatch), "CONTENT_SIZE_MISMATCH");
  });
});

test("export requires explicit Theme v1 and portable image paths", async () => {
  await withTempDirectory(async (root) => {
    const legacy = await makeTheme(path.join(root, "legacy"), {
      schemaVersion: undefined,
    });
    await expectCode(
      exportPackage(legacy.themeDirectory, path.join(root, "legacy.dreamskin")),
      "THEME_VERSION_UNSUPPORTED",
    );

    const escaping = await makeTheme(path.join(root, "escaping"), {
      image: "../outside.png",
    });
    await expectCode(
      exportPackage(escaping.themeDirectory, path.join(root, "escape.dreamskin")),
      "THEME_INVALID",
    );

    const reserved = await makeTheme(path.join(root, "reserved"), {
      image: "CON.png",
    });
    await expectCode(
      exportPackage(reserved.themeDirectory, path.join(root, "reserved.dreamskin")),
      "THEME_INVALID",
    );
  });
});

test("payload paths cannot collide under portable case folding", async () => {
  await withTempDirectory(async (root) => {
    const { themeDirectory } = await makeTheme(root, {
      image: "Preview.png",
    });
    const preview = path.join(root, "preview.PNG");
    await writeFile(preview, PNG_1X1);
    await expectCode(
      exportPackage(themeDirectory, path.join(root, "collision.dreamskin"), {
        previewPath: preview,
      }),
      "PACKAGE_PATH_INVALID",
    );
  });
});

test(
  "export rejects a linked theme image",
  { skip: process.platform === "win32" },
  async () => {
    await withTempDirectory(async (root) => {
      const { themeDirectory } = await makeTheme(root);
      const linkedImage = path.join(themeDirectory, "background.png");
      const outsideImage = path.join(root, "outside.png");
      await writeFile(outsideImage, PNG_1X1);
      await unlink(linkedImage);
      await symlink(outsideImage, linkedImage);
      await expectCode(
        exportPackage(themeDirectory, path.join(root, "linked.dreamskin")),
        "PACKAGE_PATH_INVALID",
      );
    });
  },
);

test("export and import never overwrite existing paths", async () => {
  await withTempDirectory(async (root) => {
    const { themeDirectory } = await makeTheme(root);
    const packageFile = path.join(root, "theme.dreamskin");
    await exportPackage(themeDirectory, packageFile);
    const beforePackage = await readFile(packageFile);
    await expectCode(
      exportPackage(themeDirectory, packageFile),
      "OUTPUT_EXISTS",
    );
    assert.deepEqual(await readFile(packageFile), beforePackage);

    const destination = path.join(root, "existing-theme");
    await mkdir(destination);
    const sentinel = path.join(destination, "keep.txt");
    await writeFile(sentinel, "keep", "utf8");
    await expectCode(importPackage(packageFile, destination), "OUTPUT_EXISTS");
    assert.equal(await readFile(sentinel, "utf8"), "keep");
  });
});

test("a failed import leaves no destination or partial commit marker", async () => {
  await withTempDirectory(async (root) => {
    const { themeDirectory } = await makeTheme(root);
    const packageFile = path.join(root, "invalid.dreamskin");
    await exportPackage(themeDirectory, packageFile);
    const envelope = JSON.parse(await readFile(packageFile, "utf8"));
    envelope.theme.sha256 = "f".repeat(64);
    await writeFile(packageFile, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

    const destination = path.join(root, "must-not-exist");
    await expectCode(
      importPackage(packageFile, destination),
      "CONTENT_HASH_MISMATCH",
    );
    await assert.rejects(lstatCompat(destination), { code: "ENOENT" });
  });
});

async function lstatCompat(filePath) {
  const { lstat } = await import("node:fs/promises");
  return lstat(filePath);
}
