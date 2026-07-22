import assert from "node:assert/strict";
import { createActionQueue, runActionProcess } from "../process/run-action.mjs";

const queue = createActionQueue();
const startedAt = Date.now();

await assert.rejects(
  queue(() => runActionProcess({
    action: "apply-theme",
    platform: "test",
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    timeoutMs: 180,
  })),
  (error) => {
    assert.equal(error.code, "ACTION_TIMEOUT");
    assert.equal(error.action, "apply-theme");
    assert.equal(error.platform, "test");
    assert.match(error.message, /180 ms/);
    return true;
  },
);

assert.ok(Date.now() - startedAt < 2000, "超时动作应快速结束");

const next = await queue(() => runActionProcess({
  action: "status",
  platform: "test",
  command: process.execPath,
  args: ["-e", "process.stdout.write('ready')"],
  timeoutMs: 1000,
}));

assert.equal(next.stdout, "ready");
console.log("PASS: timed-out actions release the serialized Studio queue.");
