# Portable theme contract / 可移植主题契约

[`theme-v1.schema.json`](./theme-v1.schema.json) is the machine-readable source of truth for fields that a Dream Skin theme can carry between macOS and Windows.

`theme.json` authored for distribution should include `schemaVersion: 1`. Both loaders also treat a missing version as legacy v1 so existing local Windows themes keep working; an explicitly unsupported or non-numeric version is rejected.

## Open extension model / 开放扩展模型

- Unknown top-level fields are accepted and ignored by loaders that do not understand them. This lets a newer authoring tool add metadata without breaking older Dream Skin releases.
- `palette` provides portable color aliases. macOS maps them to its richer `colors` model, with explicit legacy `colors` values taking precedence. Windows maps the same tokens to its native Dream Skin CSS variables.
- `extensions` carries data-only, reverse-DNS namespaces such as `org.example.theme`. The combined serialized object is limited to 32 KB, is exposed at `window.__CODEX_DREAM_SKIN_STATE__.extensions`, and is never evaluated as HTML or JavaScript.
- Platform-specific fields remain valid. macOS `colors` and copy fields are supported extensions; Windows-specific fields can evolve without becoming mandatory portable core fields.
- Nested image assets such as `images/background.jpg` are supported. The resolved file must remain inside the theme directory, including after symlink or junction resolution.

发布主题应写入 `schemaVersion: 1`。为兼容已有本地主题，两端加载器会把缺少版本号的描述符视为旧版 v1；但显式的未来版本或字符串版本会被拒绝。

未知顶层字段允许存在；跨平台颜色使用 `palette`；第三方工具的数据放在反向域名形式的 `extensions` 命名空间中。扩展数据只作为 JSON 暴露，不会当作 HTML 或脚本执行。图片可以放在主题包内的子目录，但规范化后的路径和链接目标都不得逃逸主题目录。

Shared fixtures live in [`fixtures/theme-v1`](./fixtures/theme-v1). Both platform test suites run the same matrix through both real payload builders.
