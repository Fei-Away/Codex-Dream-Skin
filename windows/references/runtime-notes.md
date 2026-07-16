# Runtime notes

- The skin launches the Store-installed `ChatGPT.exe` with `--remote-debugging-port=<port>` and injects through CDP.
- The default production port is `9335`; test instances may use another port plus an isolated `--user-data-dir`.
- CDP is bound to loopback. Do not expose it on a LAN interface.
- The injector polls page targets and reinjects after document loads. In-page route changes use a debounced observer plus a low-frequency safety check to avoid CPU churn during streamed tasks.
- `%LOCALAPPDATA%\CodexDreamSkin\state.json` records the port and daemon PID. Logs stay in the same directory.
- If Codex is already running without the chosen debugging port, close it manually and reopen through the Dongge Codex shortcut.
- Store updates are supported because the launcher queries `Get-AppxPackage OpenAI.Codex` on every launch.
