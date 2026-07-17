# `.dreamskin` v1 主题包契约

本契约让 Kimi、其他 AI Agent 和人工开发者以同一种离线文件交付主题。主题包只包含声明式数据和图片，不是插件；导入器不会执行包内内容、访问网络或修改官方 Codex 应用。

## 1. 最短作者流程

复制 `examples/theme-package/kimi-sakura-dawn/`，替换图片并修改两个 JSON 文件，然后运行：

```bash
node tools/theme-package.mjs validate examples/theme-package/kimi-sakura-dawn
node tools/theme-package.mjs pack examples/theme-package/kimi-sakura-dawn \
  --output kimi-sakura-dawn.dreamskin
node tools/theme-package.mjs inspect kimi-sakura-dawn.dreamskin
```

三个命令只在本机工作，不联网。成功和失败都向 stdout 输出一个 JSON 报告；失败退出码为 `1`，并带稳定 `code`。`pack` 拒绝覆盖已有输出，只通过同目录完整临时文件和原子、排他的文件发布生成新包。

如需同时验证运行环境兼容性，显式提供平台和 Dream Skin 版本；工具不会根据当前电脑偷偷推断：

```bash
node tools/theme-package.mjs inspect kimi-sakura-dawn.dreamskin \
  --platform macos --dream-skin-version 1.2.0
```

## 2. 作者源目录与包内结构

作者源目录：

```text
my-theme/
├── manifest.json
├── theme.json
├── assets/
│   ├── background.png|jpg|jpeg|webp
│   └── preview.png|jpg|jpeg|webp      # 可选
├── LICENSE.txt                         # 可选
└── NOTICE.txt                          # 可选
```

`.dreamskin` 是 ZIP v1 单文件，逻辑结构相同。区别是：作者源 `manifest.json` 只声明资源路径与媒体类型；`pack` 写入包时补充每个资源的 `bytes`、`sha256` 和顶层 `contentHash`。不要手工伪造这些完整性字段。

对应 Schema：

- 作者源：`schemas/dreamskin-source-manifest.schema.json`
- 包内 manifest：`schemas/dreamskin-manifest.schema.json`
- 便携主题：`schemas/dreamskin-theme.schema.json`

未知字段、未知文件和未声明资源一律拒绝。包中即使存在一个未被引用的 `.js`、`.css`、`.sh`、`.ps1`、可执行文件或动态库，也会拒绝整个包。

## 3. `manifest.json`

| 字段 | 规则 | 含义 |
| --- | --- | --- |
| `formatVersion` | 固定为 `1` | 容器与 manifest 契约版本 |
| `packageId` | 小写、至少两段反向域名风格，最长 128 字符 | 安装身份；显示名称不是身份 |
| `packageVersion` | SemVer，如 `1.0.0` | 作者声明的发布版本 |
| `name` | 单行，1–80 字符 | 必须与 `theme.name` 一致 |
| `author.name` | 单行，1–80 字符 | 确认页显示的作者 |
| `author.url` | 可选，无凭证的绝对 HTTP(S) URL | 作者主页，不会自动访问 |
| `targets` | `macos`、`windows` 的非空唯一数组 | 可导入的平台 |
| `minimumDreamSkinVersion` | SemVer | 低于该版本时兼容性拒绝 |
| `resources.background` | 必填 | 背景图片声明 |
| `resources.preview` | 可选 | 只用于确认页的预览图片 |
| `contentHash` | 仅包内，由 `pack` 生成 | 与 ZIP 时间戳和条目顺序无关的内容身份 |

资源路径只能是 `assets/<小写安全文件名>`。PNG 必须声明 `image/png`，JPG/JPEG 声明 `image/jpeg`，WebP 声明 `image/webp`。背景与预览不能指向同一路径。

## 4. `theme.json`

v1 只开放两端能够明确承接的字段：

| 字段 | 取值 | macOS | Windows |
| --- | --- | --- | --- |
| `name` | 单行 1–80 字符 | 支持 | 支持 |
| `background` | 固定为 `background` | 支持 | 支持 |
| `appearance` | `auto` / `light` / `dark` | 支持 | 支持 |
| `text.tagline` | 单行 1–160 字符 | 支持 | 支持 |
| `text.quote` | 单行 1–80 字符 | 支持 | 支持 |
| `art.focusX/Y` | `0..1` | 支持 | 支持 |
| `art.safeArea` | `auto/left/right/center/none` | 支持 | 支持 |
| `art.taskMode` | `auto/ambient/banner/off` | 支持 | 支持 |
| `palette.accent` | 小写六位 Hex | 支持 | 支持 |
| `palette.accentAlt` | 小写六位 Hex | 支持 | 支持 |
| `palette.secondary` | 小写六位 Hex | 支持 | 支持 |
| `palette.highlight` | 小写六位 Hex | 支持 | 支持 |

`brandSubtitle`、项目按钮文案、状态文案和赞助链接不开放给 v1 外部包。平台编译器会使用项目维护的安全默认值，避免第三方主题伪装系统或植入任意链接。

## 5. 容器与资源限制

- 包文件最多 32 MiB；普通文件最多 8 个；总展开内容最多 24 MiB。
- `manifest.json`、`theme.json`、`LICENSE.txt`、`NOTICE.txt` 各最多 256 KiB。
- 背景最多 16 MiB；预览最多 4 MiB。
- 图片单边最多 16384 像素，总像素最多 5000 万；只接受真实 PNG/JPEG/WebP 头。
- ZIP 只接受 Store 或 Deflate；拒绝加密、多卷、ZIP64、data descriptor、额外字段、归档/条目注释、数据区空洞和未知压缩算法。
- 文件名必须是严格 UTF-8/ASCII 安全路径；拒绝绝对路径、`..`、反斜杠、控制字符、大小写碰撞、重复条目、目录、符号链接和其他特殊文件。
- `inspect` 是作者工具，可以在 32 MiB 上限内读取整包；平台 importer 必须按 `docs/TECHNICAL.md` 的要求有界流式写入系统命名的暂存文件，不能整包解压。

作者工具使用项目内纯 Node ZIP 实现，不依赖系统 `zip/unzip`，也没有第三方运行时依赖。这样 macOS、Windows 与 CI 使用同一条容器规则；安全结论仍由恶意夹具测试证明，而不是由“系统有 ZIP 工具”推断。

## 6. 身份、重复与更新

- 安装身份是 `packageId`。
- 同 `packageId + packageVersion + contentHash` 是同一内容，重复导入返回幂等结果。
- 同 `packageId` 但版本或内容不同是冲突，必须由用户确认替换或取消；不自动按版本号升级/降级。
- `contentHash` 覆盖去除生成完整性字段后的 manifest、完整 theme、资源路径/类型/字节数/SHA-256；不依赖 ZIP 时间戳、压缩率或条目顺序。

## 7. 稳定错误码

| 前缀 | 阶段 | 示例 |
| --- | --- | --- |
| `CLI_*` / `OUTPUT_*` | 命令与输出 | 参数错误、拒绝覆盖 |
| `SOURCE_*` | 作者源目录 | 未知文件、非 UTF-8、读取时变化 |
| `CONTAINER_*` / `PACKAGE_*` | ZIP 与包文件 | 路径穿越、重复、加密、链接、CRC、限额 |
| `MANIFEST_*` | 身份与资源声明 | 缺字段、未知字段、内容哈希不一致 |
| `THEME_*` | 便携主题 | 未知字段、不支持值、名称不一致 |
| `ASSET_*` | 图片 | 类型、尺寸、字节数或 SHA-256 不一致 |
| `COMPAT_*` | 平台与版本 | 目标平台或最低版本不兼容 |
| `CONFLICT_*` / `INSTALL_*` / `APPLY_*` | 后续导入阶段 | 身份冲突、事务失败、应用失败 |

失败报告中的 `persistentChanges: false` 表示该作者工具没有写用户主题库。平台 importer 的安装/应用报告会分别说明持久状态。

## 8. 给 AI 作者的边界

把 `docs/KIMI_THEME_AUTHORING_PROMPT.md` 与本文件、三个 Schema 和示例目录一起交给 Kimi 或其他 Agent。Agent 只需要产出源目录；最终 `.dreamskin` 必须由本仓库的 `pack` 命令生成并由 `inspect` 复核。不要让 Agent 生成或要求用户运行包内脚本。
