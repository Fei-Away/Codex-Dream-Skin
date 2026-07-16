# Changelog

## Unreleased

### 修复

- `scripts/start-dream-skin.ps1` 改用 `shell:AppsFolder\<AUMID>` 激活 Codex，而不是直接运行 `app\ChatGPT.exe`：当前 Win11 + Store 版的 `ChatGPT.exe` 需要包身份，外部进程一律"拒绝访问"；走 AppsFolder 激活能正常启动，并把 `--remote-debugging-port`（及 `--user-data-dir`）透传给进程