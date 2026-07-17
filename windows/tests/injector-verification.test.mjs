import assert from "node:assert/strict";
import { assessVerificationResult } from "../scripts/injector.mjs";

function verificationResult(overrides = {}) {
  return {
    installed: true,
    version: "1.2.0",
    expectedVersion: "1.2.0",
    stylePresent: true,
    chromePresent: true,
    chromePointerEvents: "none",
    mainPresent: true,
    homePresent: true,
    suggestionsPresent: true,
    hero: { width: 800, height: 400 },
    cards: [{}, {}, {}],
    composer: { width: 600, height: 80 },
    sidebar: { width: 260, height: 800 },
    ...overrides,
  };
}

assert.deepEqual(assessVerificationResult(verificationResult()), {
  mainVerification: "pass",
  homeVerification: "pass",
  pass: true,
});

assert.deepEqual(assessVerificationResult(verificationResult({
  homePresent: false,
  suggestionsPresent: false,
  hero: null,
  cards: [],
})), {
  mainVerification: "pass",
  homeVerification: "skipped",
  pass: true,
});

assert.deepEqual(assessVerificationResult(verificationResult({
  mainPresent: false,
  homePresent: false,
  suggestionsPresent: false,
  hero: null,
  cards: [],
})), {
  mainVerification: "fail",
  homeVerification: "skipped",
  pass: false,
});

assert.deepEqual(assessVerificationResult(verificationResult({ hero: null })), {
  mainVerification: "pass",
  homeVerification: "fail",
  pass: false,
});

assert.equal(assessVerificationResult(verificationResult({ cards: [{}] })).pass, false);
assert.equal(assessVerificationResult(verificationResult({ cards: [{}, {}, {}, {}, {}] })).pass, false);

console.log("PASS: Windows verification distinguishes verified, skipped, and failed route layers.");
