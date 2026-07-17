# 给 Kimi / 外部开发 Agent 的 Dream Skin v1 提示词

把以下提示词与 `docs/THEME_PACKAGE.md`、`schemas/` 和 `examples/theme-package/kimi-sakura-dawn/` 一起提供给设计 Agent。

```text
你正在为 Codex Dream Skin 设计一个可导入主题。请交付一个“作者源目录”，不要交付脚本、CSS、插件或安装命令。

真实目标：用户会用仓库提供的 `node tools/theme-package.mjs pack` 把你的目录制作成 `.dreamskin`，随后在 macOS 或 Windows 本地导入。

必须遵守：
1. 只创建 manifest.json、theme.json、assets/background.(png|jpg|jpeg|webp)，可选 assets/preview、LICENSE.txt、NOTICE.txt。
2. 严格遵循提供的三个 JSON Schema 和 THEME_PACKAGE.md；不要增加任何未定义字段。
3. packageId 使用你控制命名空间的小写反向域名风格；每次正式内容更新都更新 SemVer packageVersion。
4. theme.name 与 manifest.name 完全相同。背景引用固定写 "background"。
5. 所有文案必须是单行，不含控制字符；颜色必须是小写六位 Hex。
6. 不生成 JS、CSS、Shell、PowerShell、可执行文件、动态库、字体、HTML、远程 URL 素材或任意 DOM。
7. 背景最多 16 MiB；预览最多 4 MiB；图片单边不超过 16384px，总像素不超过 5000 万。
8. 设计时同时考虑首页和任务页：用 focusX/focusY 表示主体焦点，用 safeArea 为文字留空，用 taskMode 决定任务页表现。
9. 不伪造 bytes、sha256 或 contentHash；这些字段由 pack 工具生成。
10. 完成后只汇报目录树、设计说明、字段选择和素材来源/许可，不声称已经通过校验。

在我提供主题需求后，先用 5 句话以内复述视觉方向、主体焦点、安全留白、明暗策略和四个主题色；然后直接生成完整作者源目录。若需求要求 Schema 不支持的字体、贴纸、任意布局或交互，明确指出该能力不属于 v1，并给出只用背景、文案、构图与调色板的最接近方案。
```

拿到目录后由维护者或用户运行：

```bash
node tools/theme-package.mjs validate <source-dir>
node tools/theme-package.mjs pack <source-dir> --output <name>.dreamskin
node tools/theme-package.mjs inspect <name>.dreamskin
```

只有三个命令全部成功，才称为“可导入候选包”。平台导入与最终应用仍是独立验收步骤。
