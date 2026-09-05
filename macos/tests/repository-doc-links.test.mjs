import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "..", "..");

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(entryPath));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files;
}

function hrefsFrom(markdown) {
  const source = markdown.replace(/```[\s\S]*?```/g, "");
  const hrefs = new Set();
  const markdownLink = /!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g;
  const referenceLink = /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm;
  const htmlLink = /\b(?:href|src)=["']([^"']+)["']/gi;

  for (const pattern of [markdownLink, referenceLink, htmlLink]) {
    for (const match of source.matchAll(pattern)) {
      hrefs.add(match[1] ?? match[2]);
    }
  }
  return hrefs;
}

function localTarget(fromFile, href) {
  const value = href.trim();
  if (!value || value.startsWith("#") || value.startsWith("/") ||
      /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) {
    return null;
  }

  const pathname = value.split(/[?#]/, 1)[0];
  if (!pathname) return null;
  try {
    return path.resolve(path.dirname(fromFile), decodeURIComponent(pathname));
  } catch {
    return path.resolve(path.dirname(fromFile), pathname);
  }
}

const failures = [];
for (const file of await markdownFiles(repositoryRoot)) {
  const source = await fs.readFile(file, "utf8");
  for (const href of hrefsFrom(source)) {
    const target = localTarget(file, href);
    if (!target) continue;
    const relativeTarget = path.relative(repositoryRoot, target);
    const isInsideRepository = relativeTarget === "" ||
      (!relativeTarget.startsWith(`..${path.sep}`) && relativeTarget !== "..");
    if (!isInsideRepository || !(await fs.stat(target).then(() => true, () => false))) {
      failures.push(`${path.relative(repositoryRoot, file)} -> ${href}`);
    }
  }
}

assert.deepEqual(
  failures,
  [],
  `Local documentation references must resolve inside the repository:\n${failures.join("\n")}`,
);
