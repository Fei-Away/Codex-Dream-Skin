const fs = require("node:fs/promises");
const path = require("node:path");

const originalRename = fs.rename;

fs.rename = async function dreamSkinCrashRename(source, destination, ...rest) {
  const result = await originalRename.call(this, source, destination, ...rest);
  const phase = process.env.DREAM_SKIN_TEST_KILL_AFTER_RENAME;
  const sourceName = path.basename(String(source));
  const destinationName = path.basename(String(destination));
  const matched = phase === "backup"
    ? destinationName === "backup"
    : phase === "candidate"
      ? sourceName === "candidate"
      : phase === "committed"
        ? sourceName === "commit.tmp" && destinationName === "committed"
        : false;
  if (matched) process.kill(process.pid, "SIGKILL");
  return result;
};
