import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  SelectorProvenanceError,
  assertProvenanceMovedWithContract,
  readProvenance,
} from "./check-selector-provenance.mjs";

const BASE = {
  schema: "codex-dream-skin-selectors/1",
  verifiedAgainst: {
    date: "2026-07-31",
    codexVersions: [
      {
        version: "26.727.40816",
        platform: "macos",
        evidence: "maintainer: live app:// renderer",
      },
    ],
  },
  selectors: [{ key: "shell-main", selector: "main.main-surface", tier: "L1" }],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stringify(value) {
  return JSON.stringify(value, null, 2);
}

test("the committed contract satisfies its own provenance rules", async () => {
  const source = await readFile(new URL("./selectors.json", import.meta.url), "utf8");
  const { verified } = readProvenance(source);
  assert.ok(verified.codexVersions.length >= 1);
  // The oldest maintainer-verified build must still be listed: dropping it
  // would quietly upgrade reporter evidence into first-party verification.
  assert.ok(
    verified.codexVersions.some((entry) => entry.evidence.startsWith("maintainer")),
    "at least one maintainer-verified build must remain on record",
  );
});

test("a selector change without a provenance update is rejected", () => {
  const head = clone(BASE);
  head.selectors[0].selector = 'main:is(.main-surface, [class*="_MainContentSurface_"])';
  assert.throws(
    () => assertProvenanceMovedWithContract(stringify(head), stringify(BASE)),
    (error) =>
      error instanceof SelectorProvenanceError && /verifiedAgainst did not/.test(error.message),
  );
});

test("a selector change accompanied by new evidence passes", () => {
  const head = clone(BASE);
  head.selectors[0].selector = 'main:is(.main-surface, [class*="_MainContentSurface_"])';
  head.verifiedAgainst.date = "2026-08-27";
  head.verifiedAgainst.codexVersions.unshift({
    version: "26.818",
    platform: "windows",
    evidence: "reporter: #378 field-verified patch",
  });
  const result = assertProvenanceMovedWithContract(stringify(head), stringify(BASE));
  assert.equal(result.verified.codexVersions[0].version, "26.818");
});

test("provenance-only edits are always allowed", () => {
  const head = clone(BASE);
  head.verifiedAgainst.gaps = ["Windows has no maintainer re-verify"];
  assert.doesNotThrow(() =>
    assertProvenanceMovedWithContract(stringify(head), stringify(BASE)),
  );
});

test("a brand new contract only has to satisfy the shape rules", () => {
  assert.doesNotThrow(() => assertProvenanceMovedWithContract(stringify(BASE), null));
});

// The commit that introduces the provenance block has to be able to pass its
// own gate, so a pre-rule base is compared but never validated.
test("a base predating the provenance rules is compared, not validated", () => {
  const legacyBase = {
    schema: BASE.schema,
    verifiedAgainst: { date: "2026-07-31", codexVersionMac: "26.727.40816" },
    selectors: clone(BASE.selectors),
  };
  const head = clone(BASE);
  head.selectors[0].selector = 'main:is(.main-surface, [class*="_MainContentSurface_"])';
  head.verifiedAgainst.date = "2026-08-27";
  assert.doesNotThrow(() =>
    assertProvenanceMovedWithContract(stringify(head), stringify(legacyBase)),
  );

  const frozen = clone(head);
  frozen.verifiedAgainst = clone(legacyBase.verifiedAgainst);
  assert.throws(
    () => assertProvenanceMovedWithContract(stringify(frozen), stringify(legacyBase)),
    (error) => error instanceof SelectorProvenanceError,
    "a legacy-shaped head must still be rejected, just not for the base's sake",
  );
});

test("evidence has to declare its own strength", () => {
  const head = clone(BASE);
  head.verifiedAgainst.codexVersions[0].evidence = "it works on my machine";
  assert.throws(
    () => readProvenance(stringify(head)),
    (error) => error instanceof SelectorProvenanceError && /maintainer, reporter, or/.test(error.message),
  );
});

test("missing or malformed provenance fails closed", () => {
  const cases = [
    [{ ...clone(BASE), verifiedAgainst: undefined }, /missing verifiedAgainst/],
    [
      { ...clone(BASE), verifiedAgainst: { date: "2026-8-27", codexVersions: [] } },
      /ISO calendar date/,
    ],
    [
      { ...clone(BASE), verifiedAgainst: { date: "2026-08-27", codexVersions: [] } },
      /must list every Codex build/,
    ],
    [
      {
        ...clone(BASE),
        verifiedAgainst: {
          date: "2026-08-27",
          codexVersions: [{ version: "26.818", platform: "windows" }],
        },
      },
      /non-empty evidence/,
    ],
  ];
  for (const [value, pattern] of cases) {
    assert.throws(() => readProvenance(stringify(value)), pattern, stringify(value).slice(0, 60));
  }
  assert.throws(() => readProvenance("{not json"), /not valid JSON/);
});
