import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(here, "../../.github/workflows/release.yml");
const workflow = await fs.readFile(workflowPath, "utf8");
const attributes = await fs.readFile(path.resolve(here, "../../.gitattributes"), "utf8");

assert.match(
  workflow,
  /^\s+ref: \$\{\{ github\.sha \}\}\s*$/m,
  "The release guard must check out the immutable event commit.",
);
assert.doesNotMatch(
  workflow,
  /^\s+ref: main\s*$/m,
  "The release guard must not check out moving main.",
);
assert.match(
  workflow,
  /^\s+event_sha="\$\(git rev-parse HEAD\)"\s*$/m,
  "The release candidate must derive from the checked-out event commit.",
);
assert.match(workflow, /^\s+release_sha="\$event_sha"\s*$/m);
assert.doesNotMatch(
  workflow,
  /main_sha="\$\(git rev-parse origin\/main\)"/,
  "The release candidate must not be rebound to a later origin/main tip.",
);

// Cross-platform version parity: the Linux packages published by release.yml
// must carry the same version as the macOS payload.
const macosVersion = (await fs.readFile(path.resolve(here, "../VERSION"), "utf8")).trim();
const linuxVersion = (await fs.readFile(path.resolve(here, "../../linux/VERSION"), "utf8")).trim();
assert.equal(linuxVersion, macosVersion, "linux/VERSION must match macos/VERSION");

for (const linuxGeneratedPath of [
  "linux/assets/** text eol=lf",
  "linux/scripts/image-metadata.mjs text eol=lf",
  "linux/scripts/validate-safe-css-file.mjs text eol=lf",
]) {
  assert.ok(
    attributes.includes(linuxGeneratedPath),
    `${linuxGeneratedPath} must stay LF so sync checks are stable on Windows`,
  );
}

assert.match(
  workflow,
  /REPOSITORY_URL="\$\{GITHUB_SERVER_URL\}\/\$\{GITHUB_REPOSITORY\}"/,
  "Generated release notes must link to the repository running the workflow.",
);
assert.match(workflow, /\$\{REPOSITORY_URL\}\/releases\/download/);
assert.doesNotMatch(
  workflow,
  /https:\/\/github\.com\/Fei-Away\/Codex-Dream-Skin\/(?:releases\/download|blob\/v\$\{VERSION\})/,
  "Generated release notes must not send fork releases to a hard-coded repository.",
);
assert.match(
  workflow,
  /if \[\[ "\$EVENT_NAME" == "workflow_dispatch" \]\]; then\s+release_sha="\$tag_commit"/,
  "A manual retry must resume the existing unpublished tag commit even after main advances.",
);

console.log("PASS: Release workflow binds assets and tag to the exact event commit.");
