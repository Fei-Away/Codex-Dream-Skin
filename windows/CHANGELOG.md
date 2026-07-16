# Windows Changelog

## Unreleased

### 新增

- 新增用户主题配置，Windows 版现在可以通过 `scripts/set-dream-theme.ps1` 自定义图片、标题、标语、签名和主题色。
- 新增 `windows/assets/theme.json` 作为默认主题，注入器会优先读取 `%LOCALAPPDATA%\CodexDreamSkin\theme\theme.json`。

### 改进

- 启动快捷方式不再默认强制重启已经打开的 Codex；需要重启时显式使用 `-RestartExisting`。
- 还原快捷方式会同时传入 `-RestoreBaseTheme`，更接近完整恢复。
- Windows 注入器加强了 CDP WebSocket 端口和本机地址校验。
