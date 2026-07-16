# Runtime notes

- The skin launches the Store-installed `ChatGPT.exe` with `--remote-debugging-address=127.0.0.1 --remote-debugging-port=<port>` and injects through CDP.
- The default production port is `9335`; test instances may use another port plus an isolated `--user-data-dir`.
- CDP is bound to `127.0.0.1`, and the injector refuses WebSocket targets that are not loopback or do not match the selected port. Do not expose it on a LAN interface.
- User theme state lives under `%LOCALAPPDATA%\CodexDreamSkin\theme\theme.json` plus the selected image. If that file is absent, the bundled `assets/theme.json` and `dream-reference.png` are used.
- Customize Windows themes with `scripts/set-dream-theme.ps1 -ImagePath <image> -Name <name> -Accent <#hex> -Apply`; use `-Interactive` for a guided local prompt.
- The injector polls page targets and reinjects after document loads. In-page route changes use a debounced observer plus a low-frequency safety check to avoid CPU churn during streamed tasks.
- `%LOCALAPPDATA%\CodexDreamSkin\state.json` records the port and daemon PID. Logs stay in the same directory.
- If Codex is already running without the chosen debugging port, close it first or explicitly use `-RestartExisting`.
- Store updates are supported because the launcher queries `Get-AppxPackage OpenAI.Codex` on every launch.
