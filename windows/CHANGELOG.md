# Windows Changelog

## Unreleased

### 修复

- 安装基础主题时不再把 `appearanceLightChromeTheme` 同时写成内联值和分表，避免 Codex 因重复 TOML 键而忽略整份配置并重新提示 Windows 权限设置。
- 重复安装现在保持配置结构稳定；一键恢复可以正确还原用户原有的内联或分表主题，同时保留其他后续配置改动。
