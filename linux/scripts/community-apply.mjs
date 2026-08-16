#!/usr/bin/env node
// One-click apply downloader: parse the dreamskin:// link, fetch metadata and
// package from the fixed official API only, verify size and SHA-256, and
// leave package.zip + community-package.json in the transaction root.

import fs from "node:fs/promises";
import crypto from "node:crypto";
import process from "node:process";
import path from "node:path";
import {
  COMMUNITY_API_ORIGIN,
  boundedFetchBuffer,
  boundedFetchJson,
  parseCommunityLink,
  validateCommunityMetadata,
} from "./community-http.mjs";

const [link, transactionRoot] = process.argv.slice(2);
if (!link || !transactionRoot) {
  console.error("Usage: community-apply.mjs <dreamskin-url> <transaction-root>");
  process.exit(2);
}
const versionID = parseCommunityLink(link);
if (!versionID) {
  console.error("这个一键换肤链接无效。");
  process.exit(1);
}
const metadataURL = `${COMMUNITY_API_ORIGIN}/v1/themes/${versionID}`;
const downloadURL = `${COMMUNITY_API_ORIGIN}/v1/themes/${versionID}/download`;
try {
  const metadata = validateCommunityMetadata(await boundedFetchJson(metadataURL), versionID);
  const body = await boundedFetchBuffer(downloadURL, { maximumBytes: metadata.packageBytes });
  if (body.length !== metadata.packageBytes) throw new Error("这个一键换肤链接无效。");
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  if (digest !== metadata.packageSha256) throw new Error("这个一键换肤链接无效。");
  await fs.mkdir(transactionRoot, { recursive: true });
  await fs.writeFile(path.join(transactionRoot, "package.zip"), body, { mode: 0o600 });
  await fs.writeFile(
    path.join(transactionRoot, "community-package.json"),
    `${JSON.stringify({
      themeId: metadata.themeId,
      name: metadata.name,
      version: metadata.version,
      packageSha256: metadata.packageSha256,
      packageBytes: metadata.packageBytes,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "这个一键换肤链接无效。");
  process.exit(1);
}
