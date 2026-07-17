# 开放式主题包制作 / Portable theme authoring

Dream Skin v1 主题包是一个自包含目录。它可以从 macOS 复制到 Windows，也可以由第三方工具生成，不需要修改仓库源码或官方 Codex 安装。

```text
my-theme/
├── theme.json
├── images/
│   └── background.jpg
└── components.json       # 可选，由扩展工具解释
```

`theme.json` 的机器可读规范是 [`schemas/theme-v1.schema.json`](../schemas/theme-v1.schema.json)。建议发布的主题显式写入 `schemaVersion: 1`；两端加载器仍把缺少版本号的本地旧主题按 v1 读取，但会拒绝显式的未知版本。

## 完整便携示例

```json
{
  "schemaVersion": 1,
  "id": "org-example-rose",
  "name": "Example Rose",
  "image": "images/background.jpg",
  "appearance": "auto",
  "art": {
    "focusX": 0.72,
    "focusY": 0.45,
    "safeArea": "left",
    "taskMode": "ambient"
  },
  "palette": {
    "accent": "#E25563",
    "background": "#171316",
    "surface": "#211A1E",
    "surfaceAlt": "#2B2227",
    "text": "#FFF7F9",
    "muted": "#C7AFB6",
    "line": "#6E4B55"
  },
  "extensions": {
    "org.example.theme": {
      "density": "compact",
      "componentManifest": "components.json"
    }
  }
}
```

## 跨平台核心

| 字段 | 作用 | 兼容策略 |
|---|---|---|
| `schemaVersion` | 契约版本 | 发布包必填 `1`；缺省只用于兼容旧本地主题 |
| `image` | 包内相对图片路径 | 支持 `images/background.jpg`；解析后不得逃逸主题目录 |
| `id`, `name` | 稳定标识和显示名称 | 可选；控制字符会被拒绝 |
| `appearance` | `auto`, `light`, `dark` | 缺省或 `null` 使用 `auto` |
| `art.focusX/Y` | `0..1` 的焦点 | 数字或 `null`；字符串数字不属于 v1 |
| `art.safeArea` | 内容安全区 | `auto`, `left`, `right`, `center`, `none` |
| `art.taskMode` | 任务页呈现 | `auto`, `ambient`, `banner`, `off` |
| `palette` | 便携颜色令牌 | 两端映射到各自 CSS 变量；原有平台颜色字段优先 |
| `extensions` | 第三方数据命名空间 | 反向域名键、总计不超过 32 KB、只作为 JSON 数据暴露 |

便携调色板使用 `accent`、`background`、`surface`、`surfaceAlt`、`text`、`muted` 和 `line`。macOS 会把它们映射到既有 `colors` 模型；若同一主题同时提供 `colors`，显式的 macOS 字段优先。Windows 会把相同令牌映射到 `--dream-*` 变量。为了获得一致的颜色派生与对比度，社区主题优先使用六位十六进制颜色。

## 安全扩展，而不是任意脚本

`extensions` 允许未来的主题工作室、组件清单或第三方本地工具携带额外配置，但不允许注入可执行代码：

- 命名空间采用 `org.example.theme` 形式，避免多个作者占用同一个字段。
- 整个对象序列化后最多 32 KB。
- 数据可从 `window.__CODEX_DREAM_SKIN_STATE__.extensions` 读取。
- Dream Skin 不把扩展值当作 HTML、CSS 或 JavaScript 执行。
- 不理解某个命名空间的旧版加载器可以安全忽略它。

未知顶层字段也会被接受并忽略，这让新工具能够增加元数据而不立即破坏旧加载器。真正改变便携语义的字段应先进入 schema、共享夹具和两个加载器，再考虑升级 `schemaVersion`。

## 平台扩展

- macOS 可继续使用 `colors`、`brandSubtitle`、`tagline`、`projectPrefix`、`projectLabel`、`statusText` 和 `quote`。
- Windows 或第三方工具可以增加自己的顶层字段或命名空间；它们不能成为另一个平台加载主题的必需条件。
- 图片、JSON 和可选清单应留在主题包目录中。不要引用绝对路径、用户凭据、网络脚本或官方 Codex 安装文件。

## 本地验证

在仓库根目录运行共享契约矩阵：

```bash
node tests/theme-contract.test.mjs
```

验证一个真实主题包：

```bash
node macos/scripts/injector.mjs --check-payload --theme-dir /path/to/my-theme
node windows/scripts/injector.mjs --check-payload --theme-dir /path/to/my-theme
```

两个平台测试套件都会运行同一组 [`schemas/fixtures/theme-v1`](../schemas/fixtures/theme-v1) 有效与无效夹具，并验证所有内置主题仍可加载。

---

## English summary

A portable v1 theme is a self-contained directory with `theme.json` and one image stored anywhere below that directory. Published packs should declare `schemaVersion: 1`; missing versions are accepted only as a compatibility path for existing local themes.

Use `palette` for shared color tokens and keep richer platform-only options in their existing fields. Put third-party, data-only configuration under a reverse-DNS `extensions` namespace. Extension data is capped at 32 KB, exposed as JSON through the renderer state, and never executed as code. Unknown top-level fields remain forward-compatible.

Run `node tests/theme-contract.test.mjs` before publishing a pack. The same fixture matrix is executed by both platform test suites.
