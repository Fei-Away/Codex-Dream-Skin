#!/usr/bin/env node
// Guards the provenance of the shared selector contract.
//
// Every Codex Desktop release since 26.715 has moved DOM that the contract
// binds to, and each fix extended `selectors[].selector` in place. The
// `verifiedAgainst` block is how doctor output, release notes, and the next
// person triaging "the skin broke again" know which Codex builds the contract
// has actually been observed against — and by 26.818 it still claimed 26.727,
// because nothing forced it to move. A contract whose provenance is a year
// stale is worse than no provenance: it reads as verified when it is not.
//
// The rule is mechanical on purpose: touching the selector source in a commit
// requires restating what it was checked against in the same commit.
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SELECTOR_PATH = "tools/selectors.json";

export class SelectorProvenanceError extends Error {}

/** Parse the contract far enough to reason about its provenance. */
export function readProvenance(source, label = SELECTOR_PATH) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new SelectorProvenanceError(`${label} is not valid JSON: ${error.message}`);
  }
  const verified = parsed?.verifiedAgainst;
  if (!verified || typeof verified !== "object") {
    throw new SelectorProvenanceError(`${label} is missing verifiedAgainst`);
  }
  if (typeof verified.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(verified.date)) {
    throw new SelectorProvenanceError(
      `${label}: verifiedAgainst.date must be an ISO calendar date`,
    );
  }
  if (!Array.isArray(verified.codexVersions) || verified.codexVersions.length === 0) {
    throw new SelectorProvenanceError(
      `${label}: verifiedAgainst.codexVersions must list every Codex build this contract ` +
        "has been observed against, newest first",
    );
  }
  for (const entry of verified.codexVersions) {
    for (const field of ["version", "platform", "evidence"]) {
      if (typeof entry?.[field] !== "string" || entry[field].trim() === "") {
        throw new SelectorProvenanceError(
          `${label}: every verifiedAgainst.codexVersions entry needs a non-empty ${field}`,
        );
      }
    }
    // "Verified" has to mean something. A reporter's live-renderer capture and a
    // maintainer's own run are both acceptable evidence; guessing is not.
    if (!/^(maintainer|reporter|fixture)\b/.test(entry.evidence)) {
      throw new SelectorProvenanceError(
        `${label}: ${entry.version} evidence must start with maintainer, reporter, or ` +
          `fixture so its strength is legible (got ${JSON.stringify(entry.evidence)})`,
      );
    }
  }
  return { verified, selectors: parsed.selectors ?? [] };
}

/**
 * The contract and its provenance must move together. `baseSource` is the
 * committed contract this change is measured against; `null` means the file is
 * new, which only has to satisfy the shape rules above.
 *
 * Only the head is held to the shape rules. The base may predate them — the
 * first change that introduces the block would otherwise be unable to pass its
 * own gate — so it is read loosely and used purely for comparison.
 */
export function assertProvenanceMovedWithContract(headSource, baseSource) {
  const head = readProvenance(headSource);
  if (baseSource === null || baseSource === undefined) return head;

  let base;
  try {
    base = JSON.parse(baseSource);
  } catch (error) {
    throw new SelectorProvenanceError(
      `${SELECTOR_PATH} (base) is not valid JSON: ${error.message}`,
    );
  }
  const baseVerified = base?.verifiedAgainst ?? {};

  const selectorsChanged =
    JSON.stringify(head.selectors) !== JSON.stringify(base?.selectors ?? []);
  if (!selectorsChanged) return head;

  const dateMoved = head.verified.date !== baseVerified.date;
  const versionsMoved =
    JSON.stringify(head.verified.codexVersions) !==
    JSON.stringify(baseVerified.codexVersions);
  if (!dateMoved && !versionsMoved) {
    throw new SelectorProvenanceError(
      `${SELECTOR_PATH}: selectors changed but verifiedAgainst did not. Record the Codex ` +
        "build and evidence this change was checked against (verifiedAgainst.date and " +
        "verifiedAgainst.codexVersions), or say explicitly that it is unverified.",
    );
  }
  return head;
}

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const [, , baseFile] = process.argv;
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const headSource = await readFile(path.join(repoRoot, SELECTOR_PATH), "utf8");
  const baseSource = baseFile ? await readOptional(baseFile) : null;
  const { verified } = assertProvenanceMovedWithContract(headSource, baseSource);
  const newest = verified.codexVersions[0];
  process.stdout.write(
    `selector contract provenance ok: ${verified.date}, newest ${newest.platform} ` +
      `Codex ${newest.version} (${newest.evidence})\n`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
