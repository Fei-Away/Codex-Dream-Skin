# Codex 主题编辑器｜客户部署提示词

使用方法：把完整的 `Codex 主题编辑器.zip`、客户喜欢的主题图片（可选）和下面整段提示词，一起发送给客户自己的 macOS Codex。不要提前删除 ZIP 内的隐藏目录。

```text
你是我这台 Mac 上的 Codex 主题部署工程师。请直接完成部署、自检和实机验收，不要只给教程，也不要在没有验证证据时声称完成。

我随消息上传了“Codex 主题编辑器.zip”。如果还有图片附件，请把图片作为我的主题素材；如果没有图片，使用项目自带的示例主题。

最终目标：
- 为官方 macOS Codex Desktop 应用一套可持续使用、可更换素材、可验证、可一键恢复的主题；
- 使用同一张连续的 16:9 纯背景铺满首页、侧栏与任务页；任务页由注入层自动降低素材干扰，不再拼接独立首页横幅；
- 原生侧栏、建议卡、项目选择器、任务内容、菜单和输入框必须保留真实 DOM 与交互；
- 不得用整张界面截图覆盖原生 UI；
- 不得修改官方 `.app`、`app.asar`、代码签名或系统安全设置；
- 不得把客户密钥、会话内容或本机绝对路径以外的隐私数据上传公网；不要安装来源不明的依赖。部署本身使用客户已有的本机 ZIP 即可，无需为部署新建公开仓库。

请按以下顺序执行：

1. 找到我上传的 ZIP 和图片附件的本机绝对路径，解压完整 ZIP 到一个不会被中途清理的工作目录。所有包含空格或中文的路径都要正确引用。

2. 解压后的客户目录根部应能看到：
   - `安装 Codex 主题编辑器.command`
   - `使用说明.txt`
   - `给 Codex 的部署提示词.md`
   完整引擎位于隐藏目录 `.codex-dream-skin-studio`。这是正常结构，不要删除、改名或只复制其中的 CSS/图片。Finder 默认看不到隐藏目录时，直接从终端使用其绝对路径。

3. 将隐藏引擎记为 `<ENGINE>`，先完整阅读：
   - `<ENGINE>/README.md`
   - `<ENGINE>/SKILL.md`
   - `<ENGINE>/references/qa-inventory.md`
   然后运行 `<ENGINE>/tests/run-tests.sh`。测试失败时先定位并修复，禁止跳过。

4. 确认官方 Codex 至少运行过一次，且 `~/.codex/config.toml` 已存在。运行：
   `<ENGINE>/scripts/install-dream-skin-macos.sh --no-launch`
   完整项目应被安装到 `~/.codex/codex-dream-skin-studio`，并生成桌面启动、定制、验证和恢复入口。

5. 如果我上传了主题图片，使用安装后的脚本处理素材：
   `~/.codex/codex-dream-skin-studio/scripts/customize-theme-macos.sh --image "<图片绝对路径>" --name "我的 Codex Dream Skin" --no-apply`
   如果我在消息中另写了主题名称、口号或配色，则优先使用我提供的内容。必须让脚本完成图片转换与压缩，不要手工覆盖项目源文件。若没有图片，保留项目内置示例主题。

6. 我明确授权你在本次部署中关闭并重启官方 Codex 一次，以启用本机回环 CDP。只允许处理官方 Codex 及本项目可核验身份的注入守护进程，不得关闭其他应用。使用安装后的启动脚本执行真实重启，不要让我自行猜测是否生效。

7. 启动后必须运行：
   - `~/.codex/codex-dream-skin-studio/scripts/doctor-macos.sh --require-live`
   - `~/.codex/codex-dream-skin-studio/scripts/verify-dream-skin-macos.sh --reload --screenshot "<首页验收截图绝对路径>"`
   验证器必须真实返回 `pass: true`。随后还要检查一个正常任务页面，确认背景存在且正文、菜单、侧栏和输入框仍清晰可用，并保存任务页截图。

8. 检查桌面已存在以下四个入口：
   - `Codex Dream Skin.command`
   - `Codex Dream Skin - Customize.command`
   - `Codex Dream Skin - Verify.command`
   - `Codex Dream Skin - Restore.command`

9. 如果失败，读取 `~/Library/Application Support/CodexDreamSkinStudio/` 下的日志并继续修复。不得降低代码签名、回环端口归属、PID 身份、原生结构或截图验证标准；不得用“预计重启后生效”“应该完成”等措辞代替验收。

最终向我汇报：
- Codex 主题编辑器版本与官方 Codex 版本；
- 实际使用的主题名和素材文件；
- tests、doctor、verify 的真实结果，其中 verify 必须注明是否 `pass: true`；
- 首页与任务页实机截图绝对路径；
- 安装目录；
- 桌面四个入口是否齐全；
- 一键恢复入口；
- 官方应用代码签名是否仍有效；
- 明确说明官方 `.app` 和 `app.asar` 均未被修改。

如果尚未取得 `pass: true` 或实机界面不符合要求，请明确报告当前失败原因并继续修复，不要提前结束任务。
```
