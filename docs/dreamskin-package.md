# Portable `.dreamskin` packages

## English

`.dreamskin` Package v1 turns one portable Dream Skin theme into one file that can be inspected, backed up, and moved between macOS and Windows.

The format is deliberately small. A package carries:

- one explicit Theme v1 `theme.json`;
- exactly one PNG, JPEG, or WebP primary image;
- one optional PNG, JPEG, or WebP preview;
- the exact byte length and SHA-256 of every payload.

It never carries scripts, CSS, fonts, install hooks, remote resources, or executable content. Import does not contact the network, activate a theme, restart Codex, or modify the official Codex installation.

### Commands

The macOS and Windows entry points expose the same commands and produce the same JSON result:

```bash
node macos/scripts/dreamskin-package.mjs inspect rose.dreamskin
node macos/scripts/dreamskin-package.mjs export ./rose-theme ./rose.dreamskin
node macos/scripts/dreamskin-package.mjs export ./rose-theme ./rose.dreamskin \
  --preview ./rose-preview.webp
node macos/scripts/dreamskin-package.mjs import ./rose.dreamskin ./themes/rose
```

```powershell
node .\windows\scripts\dreamskin-package.mjs inspect .\rose.dreamskin
node .\windows\scripts\dreamskin-package.mjs export .\rose-theme .\rose.dreamskin
node .\windows\scripts\dreamskin-package.mjs export .\rose-theme .\rose.dreamskin `
  --preview .\rose-preview.webp
node .\windows\scripts\dreamskin-package.mjs import .\rose.dreamskin .\themes\rose
```

`inspect` is read-only and runs the complete importer validation. `export` refuses to overwrite an existing package. `import` publishes only to a new destination directory and never replaces an existing theme.

Import is intentionally save-only. Point the destination at the platform’s saved-theme library when desired, then activate it with the existing Dream Skin menu or theme-switching command:

- macOS saved themes: `~/Library/Application Support/CodexDreamSkinStudio/themes/<id>`
- Windows saved themes: `%LOCALAPPDATA%\CodexDreamSkin\themes\<id>`

The public module interface is also available to other local tools:

```js
import {
  inspectPackage,
  exportPackage,
  importPackage,
} from "./macos/scripts/dreamskin-package.mjs";

const report = await inspectPackage("rose.dreamskin");
await exportPackage("rose-theme", "rose.dreamskin", {
  previewPath: "rose-preview.webp",
});
await importPackage("rose.dreamskin", "themes/rose");
```

### Package shape

Package v1 is a bounded UTF-8 JSON envelope:

```json
{
  "format": "codex-dream-skin",
  "packageVersion": 1,
  "theme": {
    "path": "theme.json",
    "mediaType": "application/json",
    "encoding": "base64",
    "bytes": 412,
    "sha256": "<64 lowercase hexadecimal characters>",
    "data": "<canonical RFC 4648 base64>"
  },
  "image": {
    "path": "background.webp",
    "mediaType": "image/webp",
    "encoding": "base64",
    "bytes": 1234567,
    "sha256": "<64 lowercase hexadecimal characters>",
    "data": "<canonical RFC 4648 base64>"
  },
  "preview": {
    "path": "preview.webp",
    "mediaType": "image/webp",
    "encoding": "base64",
    "bytes": 123456,
    "sha256": "<64 lowercase hexadecimal characters>",
    "data": "<canonical RFC 4648 base64>"
  }
}
```

`preview` is optional. Other top-level fields and other fields inside payload records are rejected in v1. Theme v1 may retain unknown declarative extension fields because platform loaders can validate the extensions they understand.

The machine-readable envelope schema is [`schemas/dreamskin-package-v1.schema.json`](../schemas/dreamskin-package-v1.schema.json). Runtime validation also checks relationships and file content that JSON Schema alone cannot prove.

### Validation and limits

Validation is identical on macOS and Windows:

1. Open a stable regular `.dreamskin` file without following a symbolic link or reparse point.
2. Enforce the outer size limit before parsing.
3. Decode strict UTF-8 JSON without a BOM, duplicate keys, or trailing data.
4. Require `format: "codex-dream-skin"` and integer `packageVersion: 1`.
5. Decode canonical base64 and verify each declared byte length and SHA-256.
6. Require an explicit Theme `schemaVersion: 1` and a portable primary-image basename.
7. Require `theme.image` to equal `image.path` exactly.
8. Match each image extension, media type, magic bytes, and dimensions.
9. Reject case-insensitive path collisions.

The fixed v1 limits are:

| Item | Limit |
| --- | ---: |
| `.dreamskin` file | 30 MiB |
| Total decoded payload | 20 MiB |
| `theme.json` | 1 MiB |
| Primary image | 16 MiB, 16,384 px per side, 50 MP |
| Optional preview | 3 MiB, 4,096 px per side, 16 MP |

Image paths are Unicode NFC basenames only. They reject path separators, controls, trailing spaces or dots, Windows reserved device names, and characters that are unsafe on Windows. Supported image extensions are `.png`, `.jpg`, `.jpeg`, and `.webp`.

### Publication behavior

Export writes an exclusive sibling temporary file, flushes it, reopens it, runs the full package validator, and publishes it through an exclusive same-directory link. A concurrent file at the output path wins; Dream Skin does not overwrite it.

The export volume must support hard links. APFS and NTFS do. If a removable or network volume does not, export to a local folder first and copy the finished `.dreamskin` file afterward. The command fails without creating the requested output rather than weakening the no-overwrite guarantee.

Import validates before creating its destination. It writes into a private sibling staging directory, reads the staged theme and image back, then creates the destination exclusively. The image is published first and `theme.json` last as the commit marker. Any failure removes only the new staging or destination created by that import; an older theme and the active theme remain untouched.

The optional preview is inspection metadata. It is validated but is not written into the imported runtime theme directory.

### Integrity and identity

SHA-256 detects accidental corruption and gives the exact theme/image pair a stable content ID. It does not prove who created the package. Do not present a digest as an author signature. Publisher signing and Gallery metadata require a separate future design.

### Stable errors

The CLI writes `CODE: message` to stderr. Library callers receive `DreamSkinPackageError` with the same `code`.

Common codes include:

- `PACKAGE_NOT_FOUND`
- `PACKAGE_TOO_LARGE`
- `PACKAGE_INVALID_JSON`
- `PACKAGE_VERSION_UNSUPPORTED`
- `PACKAGE_SHAPE_INVALID`
- `PACKAGE_PATH_INVALID`
- `CONTENT_ENCODING_INVALID`
- `CONTENT_SIZE_MISMATCH`
- `CONTENT_HASH_MISMATCH`
- `THEME_VERSION_UNSUPPORTED`
- `THEME_INVALID`
- `IMAGE_INVALID`
- `PREVIEW_INVALID`
- `OUTPUT_EXISTS`
- `SOURCE_CHANGED`
- `STAGING_FAILED`
- `PUBLISH_FAILED`

---

## 中文

`.dreamskin` Package v1 可以把一个可移植的 Dream Skin 主题打包成单个文件，方便检查、备份，以及在 macOS 和 Windows 之间迁移。

第一版刻意保持简单。一个包只包含：

- 一份显式声明 Theme v1 的 `theme.json`；
- 恰好一张 PNG、JPEG 或 WebP 主图片；
- 一张可选的 PNG、JPEG 或 WebP 预览图；
- 每个载荷的准确字节数和 SHA-256。

包里不能携带脚本、CSS、字体、安装钩子、远程资源或任何可执行内容。导入过程不会访问网络，不会自动激活主题或重启 Codex，也不会修改官方 Codex 安装。

### 命令

macOS 与 Windows 使用相同的命令结构，并输出相同格式的 JSON 结果：

```bash
node macos/scripts/dreamskin-package.mjs inspect rose.dreamskin
node macos/scripts/dreamskin-package.mjs export ./rose-theme ./rose.dreamskin
node macos/scripts/dreamskin-package.mjs export ./rose-theme ./rose.dreamskin \
  --preview ./rose-preview.webp
node macos/scripts/dreamskin-package.mjs import ./rose.dreamskin ./themes/rose
```

```powershell
node .\windows\scripts\dreamskin-package.mjs inspect .\rose.dreamskin
node .\windows\scripts\dreamskin-package.mjs export .\rose-theme .\rose.dreamskin
node .\windows\scripts\dreamskin-package.mjs export .\rose-theme .\rose.dreamskin `
  --preview .\rose-preview.webp
node .\windows\scripts\dreamskin-package.mjs import .\rose.dreamskin .\themes\rose
```

`inspect` 是完全只读的，但会执行与导入相同的完整校验。`export` 默认拒绝覆盖已有包。`import` 只发布到一个全新的目标目录，不会替换已有主题。

导入被有意设计为“只保存、不激活”。需要时，可以把目标指向平台的已保存主题库，再通过现有 Dream Skin 菜单或主题切换命令激活：

- macOS：`~/Library/Application Support/CodexDreamSkinStudio/themes/<id>`
- Windows：`%LOCALAPPDATA%\CodexDreamSkin\themes\<id>`

其他本地工具也可以直接使用模块接口：

```js
import {
  inspectPackage,
  exportPackage,
  importPackage,
} from "./macos/scripts/dreamskin-package.mjs";

const report = await inspectPackage("rose.dreamskin");
await exportPackage("rose-theme", "rose.dreamskin", {
  previewPath: "rose-preview.webp",
});
await importPackage("rose.dreamskin", "themes/rose");
```

### 包结构

Package v1 是一个有明确体积上限的 UTF-8 JSON envelope：

```json
{
  "format": "codex-dream-skin",
  "packageVersion": 1,
  "theme": {
    "path": "theme.json",
    "mediaType": "application/json",
    "encoding": "base64",
    "bytes": 412,
    "sha256": "<64 位小写十六进制字符>",
    "data": "<规范 RFC 4648 base64>"
  },
  "image": {
    "path": "background.webp",
    "mediaType": "image/webp",
    "encoding": "base64",
    "bytes": 1234567,
    "sha256": "<64 位小写十六进制字符>",
    "data": "<规范 RFC 4648 base64>"
  },
  "preview": {
    "path": "preview.webp",
    "mediaType": "image/webp",
    "encoding": "base64",
    "bytes": 123456,
    "sha256": "<64 位小写十六进制字符>",
    "data": "<规范 RFC 4648 base64>"
  }
}
```

`preview` 是可选字段。v1 会拒绝其他顶层字段，也会拒绝载荷记录中的其他字段。Theme v1 仍可以保留未知的声明式扩展字段，由各平台加载器校验自己认识的扩展。

可供机器读取的 envelope schema 位于 [`schemas/dreamskin-package-v1.schema.json`](../schemas/dreamskin-package-v1.schema.json)。运行时还会校验 JSON Schema 无法单独证明的跨字段关系和真实文件内容。

### 校验与限制

macOS 与 Windows 执行完全一致的校验：

1. 稳定打开普通 `.dreamskin` 文件，不跟随符号链接或 reparse point。
2. 在解析前先执行外层文件体积限制。
3. 按严格 UTF-8 解析 JSON，拒绝 BOM、重复键和尾随数据。
4. 要求 `format: "codex-dream-skin"` 和整数 `packageVersion: 1`。
5. 解码规范 base64，并校验每个载荷的字节数和 SHA-256。
6. 要求 Theme 显式声明 `schemaVersion: 1`，主图片必须使用可移植 basename。
7. `theme.image` 必须与 `image.path` 完全一致。
8. 图片扩展名、媒体类型、magic bytes 和尺寸必须互相匹配。
9. 拒绝大小写不敏感比较下发生冲突的路径。

v1 固定限制如下：

| 内容 | 上限 |
| --- | ---: |
| `.dreamskin` 文件 | 30 MiB |
| 全部解码后载荷 | 20 MiB |
| `theme.json` | 1 MiB |
| 主图片 | 16 MiB、单边 16,384 px、50 MP |
| 可选预览图 | 3 MiB、单边 4,096 px、16 MP |

图片路径只能是 Unicode NFC basename。路径不能包含分隔符、控制字符、尾随空格或点、Windows 保留设备名，以及 Windows 不安全字符。支持的扩展名为 `.png`、`.jpg`、`.jpeg` 和 `.webp`。

### 发布行为

导出会先写入同目录下的排他临时文件，刷新到磁盘后重新打开，并再次执行完整 package 校验。校验通过后，再通过同目录排他链接发布。若另一个进程已经占用了输出路径，Dream Skin 会保留对方文件并停止，不会覆盖。

导出所在卷需要支持硬链接，APFS 与 NTFS 都支持。如果移动硬盘或网络卷不支持，请先导出到本地目录，再复制已经完成的 `.dreamskin` 文件。命令会停止且不创建目标文件，不会为了兼容性削弱“禁止覆盖”的保证。

导入会在创建目标目录前完成全部校验。它先写入同级私有 staging 目录并回读主题与图片，然后排他创建目标目录。发布时先放入图片，最后放入作为 commit marker 的 `theme.json`。如果中途失败，只会清理本次导入创建的 staging 或新目标目录；已有主题和当前活动主题都不会被改动。

可选预览图只用于检查和展示。它会接受完整校验，但不会写入导入后的运行时主题目录。

### 完整性与内容身份

SHA-256 用于发现意外损坏，并为准确的主题与主图片组合生成稳定 content ID。它不能证明包的作者是谁，也不应被描述为作者签名。发布者签名和 Gallery 元数据应当在未来单独设计。

### 稳定错误码

CLI 会向 stderr 输出 `CODE: message`。模块调用者会收到带有相同 `code` 的 `DreamSkinPackageError`。

常见错误码包括：

- `PACKAGE_NOT_FOUND`
- `PACKAGE_TOO_LARGE`
- `PACKAGE_INVALID_JSON`
- `PACKAGE_VERSION_UNSUPPORTED`
- `PACKAGE_SHAPE_INVALID`
- `PACKAGE_PATH_INVALID`
- `CONTENT_ENCODING_INVALID`
- `CONTENT_SIZE_MISMATCH`
- `CONTENT_HASH_MISMATCH`
- `THEME_VERSION_UNSUPPORTED`
- `THEME_INVALID`
- `IMAGE_INVALID`
- `PREVIEW_INVALID`
- `OUTPUT_EXISTS`
- `SOURCE_CHANGED`
- `STAGING_FAILED`
- `PUBLISH_FAILED`
