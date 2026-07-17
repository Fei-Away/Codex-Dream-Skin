import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [injector, macCommon, macStart, windowsCommon] = await Promise.all([
  fs.readFile(new URL("../runtime/injector.mjs", import.meta.url), "utf8"),
  fs.readFile(new URL("../../macos/scripts/common-macos.sh", import.meta.url), "utf8"),
  fs.readFile(new URL("../../macos/scripts/start-dream-skin-macos.sh", import.meta.url), "utf8"),
  fs.readFile(new URL("../../windows/scripts/common-windows.ps1", import.meta.url), "utf8"),
]);

assert.match(macCommon, /shared\/runtime\/injector\.mjs/);
assert.match(macCommon, /LAUNCHED_INJECTOR_PID/);
assert.ok(macCommon.indexOf("launchctl submit") < macCommon.indexOf("/usr/bin/nohup"),
  "macOS 应优先使用可脱离调用进程的 launchctl 注入守护");
assert.doesNotMatch(`${macCommon}\n${macStart}`, /\$\(launch_injector_daemon/,
  "macOS 注入守护不能在命令替换子 Shell 中启动");
assert.match(windowsCommon, /shared[\\/]runtime[\\/]injector\.mjs/);
assert.match(injector, /async function applyLatestTheme/);
assert.match(injector, /Page\.loadEventFired/);
assert.match(injector, /dream-skin-scene-action-button/);
assert.match(injector, /visibleCardCount === 4/);
assert.match(injector, /process\.exit\(/, "one-shot 模式必须确定性退出，不能等待 WebSocket close handshake");

console.log("PASS: shared injector reloads current themes and exits one-shot commands deterministically.");
