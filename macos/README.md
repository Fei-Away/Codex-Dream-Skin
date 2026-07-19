# Codex Dream Skin Studio

Unofficial macOS theme studio for the **official Codex Desktop** app.

Turn an image you like into a Codex theme: a dedicated home banner, a low-noise task background, and frosted content layers — while **keeping native sidebar, suggestion cards, project picker, task content, menus, and composer** fully interactive.

This project injects through **local loopback CDP**. It does **not** modify the official `.app`, `app.asar`, or code signature.

> Not affiliated with OpenAI. Codex is a trademark of its respective owners.

## Requirements

- macOS
- Official Codex Desktop installed and launched at least once (`~/.codex/config.toml` exists)
- No global Node.js install required (uses Codex’s signed bundled Node after validation)

## 网页控制台快速开始

```bash
./Open\ Dream\ Skin\ Studio.command
```

浏览器会打开本机主题控制台。首次使用点击“安装到本机”，之后桌面会生成
`Codex Dream Skin Studio.command`，以后双击它即可再次打开。

网页中可以完成：

- 拖放或选择 PNG、JPEG、HEIC、TIFF、WebP 图片，并预览首页与任务页裁切效果；
- 自定义主题名称、标语、引文和三组颜色；
- 保存多套主题并一键切换，或恢复内置演示主题；
- 应用、重新应用、暂停皮肤，查看任务进度与诊断结果；
- 生成真实 Codex 验证截图；
- 完全恢复官方外观。重启正在运行的 Codex 和完全恢复都需要二次确认。

安装后路径：

| Item | Path |
| --- | --- |
| Engine | `~/.codex/codex-dream-skin-studio` |
| State / logs / user images | `~/Library/Application Support/CodexDreamSkinStudio` |
| Theme backup | under Application Support (`theme-backup.json`) |

原有命令行脚本和 SwiftBar 菜单仍可使用；网页控制台是默认推荐入口。

## 客户 ZIP（可选）

To build the “double-click install” folder layout for non-git users:

```bash
./scripts/build-client-release.sh "$HOME/Desktop/Codex 主题编辑器.zip"
```

ZIP 中可见入口是 `打开 Codex 主题控制台.command`，完整引擎位于隐藏目录
`.codex-dream-skin-studio`。不要只分发 CSS 或图片。

## 工作原理与安全边界

1. 发现 `com.openai.codex`，校验官方应用与内置 Node 的签名、Team ID 和架构。
2. 控制台 HTTP 服务与 Codex CDP 都仅绑定 IPv4 `127.0.0.1`，不监听局域网。
3. 每次打开控制台生成临时随机令牌；令牌从 URL fragment 转入当前标签页会话，不写日志。
4. 页面不加载 CDN、远程字体、分析脚本或其他公网资源；服务同时校验 Host、Origin 与令牌。
5. API 只暴露固定的安装、主题、应用、暂停、验证和恢复动作，不接受任意命令或文件路径。
6. 只向预期的 `app://` Codex renderer 注入，并验证 CDP 端口归属；不修改 `.app`、`app.asar` 或签名。
7. 无活动 30 分钟后控制服务自动退出；关闭标签页后也可等待它自行退出。

CDP 本身是强能力的本机调试接口。无需继续使用皮肤时，请在网页中选择“完全恢复官方外观”。

## Image guidelines

- PNG / JPEG / HEIC / TIFF / WebP (macOS readable)
- Source ≤ 50 MB; prepared file ≤ 16 MB
- Wide images work best (width ≥ 2000 px recommended)
- Keep the left side relatively calm for native home titles
- Image is banner + background only — never a full-window fake UI overlay

CLI example:

```bash
~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh \
  --image "/path/to/image.png" \
  --name "My theme" \
  --accent "#7cff46" \
  --secondary "#36d7e8" \
  --highlight "#642a8c"
```

Reset to the bundled abstract demo:

```bash
~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh --reset-demo
```

## License

MIT — see `LICENSE`. Additional notices in `NOTICE.md` (trademarks, demo asset, runtime Node).

## Sponsors

Thanks to **[passion8.cc](https://passion8.cc/register?aff=TuPe)** for sponsoring this project.

<p align="center">
  <a href="https://passion8.cc/register?aff=TuPe">
    <img src="../docs/images/sponsor-passion8.png" alt="Passion8" height="96">
  </a>
</p>

<p align="center">
  <a href="https://passion8.cc/register?aff=TuPe"><strong>Passion8｜感谢 passion8.cc 赞助本项目</strong></a><br>
  AI API 中转站，支持 Codex / Claude Code / Grok 等工具接入。主题与 API 配置互相独立。
</p>

## What this is not

- Not an OpenAI product and not a fork of Codex source
- Not a way to patch or rebrand the official binary
- Not a Windows build (see `../windows/`)
- Not an API proxy: theming does not change model providers or API keys

If you use a third-party API relay, configure it separately — keep theme install and API config as two explicit steps.
