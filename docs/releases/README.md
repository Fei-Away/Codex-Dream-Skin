# Release 更新说明规范

每次客户端发布维护两份完整说明，与版本升级一起提交和评审：

- `docs/releases/vX.Y.Z.md`：中文全文，作为 GitHub Release 正文。
- `docs/releases/vX.Y.Z-en.md`：完整英文版，与中文内容对应，不用摘要代替。

两份文件顶部互相链接。GitHub Release 展示中文正文和英文入口，再由工作流追加下载表、安装说明、校验文件和源码提交链接；英文文件末尾链接回该版本 Release 下载。平台 `CHANGELOG.md` 保留各自的详细历史。

本规范参考 [CC Switch v3.20.4](https://github.com/farion1231/cc-switch/releases/tag/v3.20.4) 的独立语言文档与内容组织方式；本仓库示例为 [v1.5.19 中文](v1.5.19.md) / [English](v1.5.19-en.md)。

## 内容顺序

1. **版本标题与语言入口**：标明当前语言，链接另一语言的完整说明。
2. **概述**：一两句话说明这次更新给用户带来的主要变化。
3. **新增功能 / New features**：说明用户现在能做什么、在哪里操作。没有新增时省略。
4. **修复与改进 / Fixes and improvements**：按用户可感知的行为归类，点明平台或触发条件。不要直接粘贴提交列表。
5. **升级与使用 / Upgrading and usage**：只写本次相关的操作变化、迁移要求、兼容限制或已知问题；没有变化时省略。影响安装、数据或使用决策的限制不得省略。
6. **贡献者 / Contributors**：按具体贡献致谢，并链接对应 PR；没有外部贡献时省略，不猜测或虚构署名。
7. **完整变更 / Full changelog**：链接上一个公开版本到本版本的 GitHub compare 页面。
8. **下载与安装 / Downloads and installation**：Release 下载表由工作流生成；英文文件提供该版本 Release 入口及安装指引，不重复维护资产表。

## 写作要求

- 中英文分别成文，功能、修复、默认值、限制与升级步骤保持一致；可自然翻译，不删减影响使用决策的信息。
- 粗体只包裹标题文字，冒号放在外面，写作 `**标题**：正文`。提交前用 GitHub Markdown 渲染检查，避免页面直接显示 `**` 标记。
- 使用短段落或平行条目，以及「新增」「修复」「改进」等具体表述，不写宣传口号、夸大承诺或无依据的性能百分比。
- 写用户遇到的现象和更新后的行为。平台独有变化必须标注 macOS 或 Windows；未经验证的兼容范围不写成全面支持。
- 功能名称、菜单入口、默认值、恢复方法以本版本代码和验收结果为准。已知问题写清影响和可行操作，不把内部验收流水放进发布文案。
- Issue / PR 使用完整链接。致谢必须可追溯到对应贡献；不自动宣称相关 Issue 全部关闭。
- 版本文件中的文档和语言切换链接使用本仓库 `blob/vX.Y.Z/...` 地址，避免 Release 中相对路径失效或后续 main 变化导致说明漂移。发布前在 PR 分支分别预览两份文件；tag 创建后再核对语言链接。
- 不复制其他项目的功能、系统要求、赞助内容或声明。短小的修复版本可以只保留概述、修复、完整变更和下载入口，但仍须提供两种语言。
- 发布说明描述实际交付内容。提交、合并、构建、公开发布是不同状态；本地测试通过不等于正式安装包已发布。

## 可复制模板

分别复制以下模板到两份文件，替换版本、上一版本和所有占位符，删除不适用的章节。

### 中文：`vX.Y.Z.md`

```markdown
# Codex Dream Skin vX.Y.Z

**中文** · [English](https://github.com/Fei-Away/Codex-Dream-Skin/blob/vX.Y.Z/docs/releases/vX.Y.Z-en.md)

<一两句话概括本次最重要的用户变化。>

## 新增功能

- **功能名称**：<用户能做什么，以及操作入口。>

## 修复与改进

- **平台或场景**：修复<具体问题>，现在<更新后的行为>。

## 升级与使用

<本次相关的操作变化、迁移步骤或影响使用的已知限制。>

## 贡献者

感谢 @<贡献者> 的<具体贡献>（[#<编号>](https://github.com/Fei-Away/Codex-Dream-Skin/pull/<编号>)）。

[完整变更：vPREVIOUS → vX.Y.Z](https://github.com/Fei-Away/Codex-Dream-Skin/compare/vPREVIOUS...vX.Y.Z)
```

### English: `vX.Y.Z-en.md`

```markdown
# Codex Dream Skin vX.Y.Z

[中文](https://github.com/Fei-Away/Codex-Dream-Skin/blob/vX.Y.Z/docs/releases/vX.Y.Z.md) · **English**

<One or two sentences describing the main user-facing changes.>

## New features

- **Feature name:** <What users can do and where to find it.>

## Fixes and improvements

- **Platform or scenario:** <The problem and the corrected behavior.>

## Upgrading and usage

<Changed controls, migration steps or known limitations that affect usage.>

## Contributors

Thanks to @<contributor> for <contribution> ([#<number>](https://github.com/Fei-Away/Codex-Dream-Skin/pull/<number>)).

[Full changelog: vPREVIOUS → vX.Y.Z](https://github.com/Fei-Away/Codex-Dream-Skin/compare/vPREVIOUS...vX.Y.Z)

## Downloads and installation

[Download vX.Y.Z](https://github.com/Fei-Away/Codex-Dream-Skin/releases/tag/vX.Y.Z) · [macOS installation](https://github.com/Fei-Away/Codex-Dream-Skin/blob/vX.Y.Z/docs/install-macos.md) · [Windows installation](https://github.com/Fei-Away/Codex-Dream-Skin/blob/vX.Y.Z/docs/install-windows.md)
```

## 发布时执行

- 版本 PR 同步六处版本源、当前版本断言、两个平台的 changelog，以及中英文两份版本说明。平台无行为变化时如实注明。
- 评审两份说明是否与最终合并范围一致，尤其是平台差异、贡献者和升级注意事项。不要把未合入或留待后续的功能写入本版。
- `release.yml` 在创建 tag 和构建之前检查两份版本说明文件非空；缺失任一语言会阻止发布。内容准确性及翻译一致性由版本 PR 评审负责。
- main 上的发布工作流从同一提交构建 DMG / Setup、生成 `SHA256SUMS.txt`，将中文版本说明置顶，再追加下载表和安装指引。不要手工上传工作目录中的安装包。
- 发布后确认 GitHub Release 已公开、语言链接可访问、说明顺序正确，两个安装包及校验文件可下载。已公开版本不由工作流覆盖；后续版本继续使用同一规范。
