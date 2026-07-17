import assert from "node:assert/strict";
import { isPetOverlayUrl } from "../scripts/injector.mjs";

assert.equal(isPetOverlayUrl("app://codex/avatar-overlay"), true);
assert.equal(isPetOverlayUrl("app://codex/avatar-overlay?mode=test"), false);
assert.equal(isPetOverlayUrl("app://codex/avatar-overlay#fragment"), false);
assert.equal(isPetOverlayUrl("app://codex/avatar-overlay/child"), false);
assert.equal(isPetOverlayUrl("app://other/avatar-overlay"), false);
assert.equal(isPetOverlayUrl("https://codex/avatar-overlay"), false);
assert.equal(isPetOverlayUrl("not a URL"), false);

console.log("PASS: injector recognizes only the exact Codex pet overlay URL.");
