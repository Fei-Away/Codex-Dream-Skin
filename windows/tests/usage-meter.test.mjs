import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readThreadUsageMetrics } from "../scripts/injector.mjs";

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dream-skin-usage-meter-"));
const threadId = "019f7045-cd99-7ca1-b610-32bf6b4e6f2b";

const tokenRecord = (timestamp, usedPercent, usedTokens) => JSON.stringify({
  timestamp,
  type: "event_msg",
  payload: {
    type: "token_count",
    info: {
      model_context_window: 258400,
      last_token_usage: { total_tokens: usedTokens },
    },
    rate_limits: {
      primary: { used_percent: usedPercent, window_minutes: 10080, resets_at: 1784908800 },
    },
  },
});

try {
  const sessionDirectory = path.join(temporaryRoot, "sessions", "2026", "07", "18");
  await fs.mkdir(sessionDirectory, { recursive: true });
  const sessionPath = path.join(sessionDirectory, `rollout-2026-07-18-${threadId}.jsonl`);
  await fs.writeFile(sessionPath, `${tokenRecord("2026-07-18T16:00:00.000Z", 36, 211500)}\n`, "utf8");

  const first = await readThreadUsageMetrics(threadId, { codexHome: temporaryRoot });
  assert.equal(first.available, true);
  assert.equal(first.context.usedTokens, 211500);
  assert.equal(first.context.windowTokens, 258400);
  assert.equal(first.context.remainingTokens, 46900);
  assert.equal(first.rateLimits.primary.usedPercent, 36);
  assert.equal(first.rateLimits.primary.remainingPercent, 64);

  const nextLine = tokenRecord("2026-07-18T16:03:00.000Z", 37, 215000);
  const splitAt = Math.floor(nextLine.length / 2);
  await fs.appendFile(sessionPath, nextLine.slice(0, splitAt), "utf8");
  const whilePartial = await readThreadUsageMetrics(threadId, { codexHome: temporaryRoot });
  assert.equal(whilePartial.context.usedTokens, 211500,
    "A partial JSONL record must not replace the last complete usage event.");

  await fs.appendFile(sessionPath, `${nextLine.slice(splitAt)}\n`, "utf8");
  const incremental = await readThreadUsageMetrics(threadId, { codexHome: temporaryRoot });
  assert.equal(incremental.context.usedTokens, 215000);
  assert.equal(incremental.rateLimits.primary.remainingPercent, 63);

  await assert.rejects(
    () => readThreadUsageMetrics("../../outside", { codexHome: temporaryRoot }),
    /Invalid task identity/,
  );
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log("PASS: privacy-safe incremental usage log reader");
