import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const helper = fileURLToPath(new URL("../scripts/confirm-community-linux.sh", import.meta.url));

test("browser theme requests require local consent and fail closed without a dialog", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-consent-"));
  const run = () => spawnSync("/bin/bash", ["-c",
    '. "$1"; confirm_community_theme "$2" "$3"', "_", helper, "中文 <b>theme</b>", "1.0.0"], {
    env: { ...process.env, PATH: root }, encoding: "utf8", input: "",
  });
  try {
    const missing = run();
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /not applied/);
    const dialog = path.join(root, "zenity");
    await fs.writeFile(dialog, '#!/bin/bash\nprintf "%s\\n" "$@"\nexit 1\n', { mode: 0o700 });
    const rejected = run();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stdout, /--default-cancel/);
    assert.match(rejected.stdout, /--no-markup/);
    await fs.writeFile(dialog, '#!/bin/bash\nexit 0\n', { mode: 0o700 });
    assert.equal(run().status, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
