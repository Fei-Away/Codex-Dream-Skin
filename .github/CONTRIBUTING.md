# 贡献指南

<p align="center">
  <strong>中文</strong> · <a href="./CONTRIBUTING.en.md">English</a>
</p>

感谢你为 Codex Dream Skin 提交改进。这个项目通过本机回环 CDP 给官方 Codex 桌面应用加载外部主题。macOS 和 Windows 有独立的安装、注入与恢复路径，请先确定改动属于哪个平台，再缩小范围。

## 开始之前

1. 阅读[项目 README](../README.md)和[平台对照](../docs/platforms.md)。macOS 的使用说明在 [`macos/README.md`](../macos/README.md)，Windows 的实现约束在 [`windows/SKILL.md`](../windows/SKILL.md)。
2. 搜索[现有 Issue](https://github.com/Fei-Away/Codex-Dream-Skin/issues)和[开放 PR](https://github.com/Fei-Away/Codex-Dream-Skin/pulls)。相同文件已有活跃改动时，优先补充原讨论，或把新方案拆成不重叠的小改动。
3. 从最新的上游 `main` 创建分支。一个 PR 只解决一个问题，不要把新主题、运行时修复和无关整理混在一起。

## 提交 Issue

请使用仓库的 [Bug 或功能建议表单](./ISSUE_TEMPLATE/)。提交前先搜索重复项。

Bug 报告应包含：

- 目标平台、系统版本和 Codex 安装来源。
- 能稳定复现的步骤，以及期望结果和实际结果。
- 相关日志或截图。请先删除密钥、`auth.json`、中转 token、用户名路径和私人对话。
- 最近一次已知正常的版本或提交，如果能够确认。

功能建议应说明要解决的使用场景、期望行为、考虑过的替代方案，以及 macOS、Windows 或双平台范围。

## 开发与验证

请先 fork 仓库，并让分支基于最新的上游 `main`。尽量复用现有脚本和平台 helper，不要为小改动增加新依赖。

### macOS

运行完整测试：

```bash
(cd macos && npm test)
```

环境与安装诊断：

```bash
macos/scripts/doctor-macos.sh
```

改动注入、CSS、启动或恢复流程时，还要运行 `macos/scripts/verify-dream-skin-macos.sh`，并检查首页与普通任务页。

### Windows

运行 Windows 回归测试：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\tests\run-tests.ps1
```

改动安装、启动、注入或恢复流程时，请运行对应脚本和 `windows/scripts/verify-dream-skin.ps1`，并在 PR 中注明 Windows 版本与 Codex 来源。

### 仅文档或仓库元数据

检查所有新增或修改的链接与命令，并运行：

```bash
git diff --check
```

## 改动约束

- Shell、PowerShell、JavaScript、JSON 和 CSS 使用两个空格缩进。Shell 入口沿用 `set -euo pipefail`，Node 文件使用 ESM，脚本名称使用 kebab-case。
- 为受影响的安装、启动、注入、验证、暂停或恢复行为补充测试。配置变更要覆盖中文或其他非 ASCII 项目名，并保留无关 TOML 内容。
- `config.toml` 必须按严格 UTF-8 读取，原子写入，并保留可恢复备份。不要使用依赖系统默认编码的 API 重写它。
- CDP 只能绑定本机回环地址。不要修改官方 `.app`、WindowsApps、`app.asar`、代码签名、API Key 或 Base URL。
- 只提交这次改动需要的文件。不要带入日志、临时目录、构建产物、私人截图或本机配置。

## 提交 PR

1. 使用 `type(scope): summary` 标题，例如 `fix(windows): preserve UTF-8 config on restore`。
2. 填完整 [PR 模板](./pull_request_template.md)，只勾选实际完成的检查。平台检查受环境限制时，在 Notes 写清具体限制，并提供能完成的静态检查或夹具测试结果。
3. 用 `Closes #123` 关联对应 Issue。视觉改动要附首页和任务页截图，截图中不能包含私人对话或凭证。
4. 用户可见的 macOS 改动应更新 [`macos/CHANGELOG.md`](../macos/CHANGELOG.md)；需要发布的新版本再更新 `macos/VERSION`。Windows 用户可见改动应更新 [`windows/CHANGELOG.md`](../windows/CHANGELOG.md)。
5. 提交前重新检查 diff、测试结果和分支与上游 `main` 的差异，确认 PR 中没有无关提交。

维护者可能要求缩小范围、补充验证或解决与其他开放 PR 的重叠。请继续在原 PR 更新，不要为同一改动重复开多个 PR。
