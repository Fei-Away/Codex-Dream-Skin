# 平台对照

## 运行模型（两边相同）

```text
用户本机主题工具
    │  启动官方 Codex + 本机 CDP
    ▼
官方 Codex Desktop（不改 asar / 签名）
    │  注入 CSS + 装饰 DOM
    ▼
仍用原生侧栏 / 输入框 / 建议卡
```

## 路径速查

### macOS

| 用途 | 路径 |
|------|------|
| 源码（本整理包） | `Codex-Dream-Skin/macos/` |
| 安装后引擎 | `~/.codex/codex-dream-skin-studio` |
| 状态 / 日志 | `~/Library/Application Support/CodexDreamSkinStudio` |
| Codex 配置 | `~/.codex/config.toml`（仅外观相关项可能被改，可恢复） |

### Windows

| 用途 | 路径 |
|------|------|
| 源码（本整理包） | `Codex-Dream-Skin/windows/` |
| 状态 / 日志 | `%LOCALAPPDATA%\CodexDreamSkin` |
| Codex 配置 | `%USERPROFILE%\.codex\config.toml` |
| 默认 CDP 端口 | `9335`（Mac 包默认从 `9341` 起选空闲口） |

## 能力矩阵

| 功能 | macOS | Windows |
|------|:-----:|:-------:|
| 安装脚本 | ✅ | ✅ |
| 启动 + 注入 | ✅ | ✅ |
| 一键恢复 | ✅ | ✅ |
| 实机 verify / 截图 | ✅ | ✅ |
| 用户选图定制 | ✅ | ✅（`windows/scripts/set-dream-theme.ps1`） |
| 官方签名校验 | ✅ | 部分（Store 包发现） |
| 客户部署提示词 | ✅ | ❌（可用 Mac 文案改写） |
| 打客户 ZIP | ✅ `build-client-release.sh` | 手动压缩 `windows/` |

## 不要放进这个目录的东西

- API Key、`.codex/auth.json`
- 中转站密钥、服务器私钥
- 含客户隐私的实机截图（若要公开）
