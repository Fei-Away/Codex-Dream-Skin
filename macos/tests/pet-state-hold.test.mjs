import assert from "node:assert/strict";
import vm from "node:vm";
import {
  isAvatarOverlayTargetUrl,
  petNativeRestorePayloadFor,
} from "../scripts/injector.mjs";

function createFixture() {
  const nodes = new Map();
  const legacyStyle = {
    id: "codex-dream-skin-pet-state-hold",
    textContent: 'background-position: 0% 30% !important;',
    isConnected: true,
    remove() {
      this.isConnected = false;
      nodes.delete(this.id);
    },
  };
  nodes.set(legacyStyle.id, legacyStyle);
  const document = {
    getElementById(id) {
      return nodes.get(id) ?? null;
    },
  };
  const window = {
    __CODEX_DREAM_SKIN_PET_STATE_HOLD__: {
      cleanup() {
        legacyStyle.remove();
        delete window.__CODEX_DREAM_SKIN_PET_STATE_HOLD__;
        return true;
      },
    },
  };
  return { context: { document, window }, nodes, window };
}

assert.equal(
  isAvatarOverlayTargetUrl("app://-/index.html?initialRoute=%2Favatar-overlay"),
  true,
);
assert.equal(isAvatarOverlayTargetUrl("app://-/index.html"), false);
assert.equal(
  isAvatarOverlayTargetUrl("app://-/avatar-overlay-composition-surface.html?surfaceId=test"),
  false,
);

const fixture = createFixture();
const payload = petNativeRestorePayloadFor("天空花园双姝");
const first = vm.runInNewContext(payload, fixture.context);
assert.equal(first.applied, true);
assert.equal(first.nativeControl, true);
assert.equal(first.displayName, "天空花园双姝");
assert.equal(first.removedLegacyStyle, true);
assert.equal(fixture.nodes.has("codex-dream-skin-pet-state-hold"), false);
assert.equal(fixture.window.__CODEX_DREAM_SKIN_PET_STATE_HOLD__, undefined);
assert.doesNotMatch(payload, /background-position|data-avatar-state|@keyframes/);

const second = vm.runInNewContext(payload, fixture.context);
assert.equal(second.applied, true);
assert.equal(second.nativeControl, true);
assert.equal(second.removedLegacyStyle, false);

console.log("PASS: legacy pet overrides are removed and native Codex control is preserved.");
