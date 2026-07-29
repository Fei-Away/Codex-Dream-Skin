#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const maxBytes = 2 * 1024 * 1024;
const binaryExtensions = new Set([
  ".avif", ".dmg", ".exe", ".gif", ".ico", ".jpeg", ".jpg", ".pdf", ".png", ".webp", ".zip",
]);
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ["openai-style-key", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["github-token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["google-api-key", /\bAIza[A-Za-z0-9_-]{30,}\b/g],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["slack-webhook", /https:\/\/hooks\.slack\.com\/services\/[^\s"'<>]+/g],
  ["wechat-webhook", /https:\/\/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send[^\s"'<>]*/g],
  ["feishu-webhook", /https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\/[^\s"'<>]+/g],
  ["generic-secret-assignment", /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password)\b\s*[:=]\s*["'][^"'\r\n]{12,}["']/gi],
];
const placeholder = /(?:your[_ -]?(?:api[_ -]?)?key|replace[_ -]?me|changeme|example|placeholder|dummy|test[_ -]?key|<[^>]+>|你的密钥)/i;

function git(args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

function repositoryFiles() {
  return git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean);
}

function lineAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

const findings = [];
const files = repositoryFiles();
for (const relative of files) {
  if (binaryExtensions.has(path.extname(relative).toLowerCase())) continue;
  const file = path.join(root, relative);
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > maxBytes) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const [type, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const lineEnd = text.indexOf("\n", match.index);
      const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
      if (placeholder.test(lineText)) continue;
      findings.push({ path: relative, line: lineAt(text, match.index), type });
    }
  }
}

if (findings.length) {
  for (const finding of findings) {
    console.error(`${finding.path}:${finding.line}: possible ${finding.type}`);
  }
  console.error("Secret scan failed. Move real credentials to an ignored local .env and rotate exposed values.");
  process.exit(1);
}

console.log(`PASS: ${files.length} tracked or committable files contain no recognized secret patterns.`);
