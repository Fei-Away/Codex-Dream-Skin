# Codex Dream Skin

<p align="center">
  <strong>中文</strong> · <a href="./README.en.md">English</a>
</p>

<p align="center">
  <strong>给 Codex 桌面端换一张会呼吸的脸。</strong><br>
  外部主题 / 换肤工具 · 本机 CDP 注入 · 不改官方安装包
</p>

<p align="center">
  一张图，一种心情 · 写代码，也要有氛围感
</p>

<p align="center">
  非 OpenAI 官方产品。不修改 <code>.app</code> / <code>app.asar</code> / WindowsApps。
</p>

## 栋哥三主题包

1.3.0 把三套完整方向装进同一个 Mac / Windows 包：

- **语言的用法**：维特根斯坦式书页、白板与批注
- **开源工作台**：dbskill 蓝图、索引与开源分身
- **心理问题举牌**：克制的中文独立杂志视觉

另保留经典白板主题用于兼容旧安装。所有人物图都是 2172×724 纯背景，
不包含假的 Codex 控件。

<p align="center">
  <img src="themes/dongge-light/background.png" alt="栋哥 dbskill 浅色主题" width="900">
</p>

主题清单与素材说明见 [`themes/`](./themes/)。

### 重新打开的正确方式

macOS 安装时会让用户选择默认栋哥图片，并生成 `栋哥 Codex.app`。日常从这个入口打开，皮肤调试端口和注入器会一起启动。
如果官方 Codex 已经开着，脚本会直接停止并提示你手动退出官方 Codex，不会自动关闭或重启宿主 app。

Windows 安装时也会让用户选择默认栋哥图片。安装后从桌面或开始菜单的 `栋哥 Codex` 快捷方式启动，快捷方式会一起
拉起调试端口和注入器。

## 赞助商

<p align="center">
  <a href="https://passion8.cc/register?aff=TuPe">
    <img src="docs/images/sponsor-passion8.png" alt="Passion8" height="72">
  </a>
</p>

<p align="center">
  <strong>更智能的连接 · 更热爱的创造</strong><br>
  <sub>热爱驱动 · 无限可能 · Connect AI · Power Creation</sub>
</p>

<p align="center">
  感谢 <a href="https://passion8.cc/register?aff=TuPe"><strong>passion8.cc</strong></a> 赞助本项目。<br>
  满血 AI 中转：官方模型直连，无降智、无套壳；一行配置接入 Codex / Claude Code / Grok。
</p>

<p align="center">
  <sub>
    换肤与 API 配置互相独立，本项目不会自动改写你的模型供应商设置。
  </sub>
</p>

## 效果预览

一张图，一种心情。下面都是可落地的主题示意效果：

<p align="center">
  <img src="docs/images/gallery/skin-01.jpg" alt="粉系定制" width="900"><br>
  <sub>粉系定制</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-02.jpg" alt="财神打工" width="900"><br>
  <sub>财神打工版</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-03.jpg" alt="红白科幻" width="900"><br>
  <sub>红白科幻</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-04.jpg" alt="清透定制" width="900"><br>
  <sub>清透定制</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-05.jpg" alt="灵感小宇宙" width="900"><br>
  <sub>灵感小宇宙</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-06.jpg" alt="紫夜限定" width="900"><br>
  <sub>紫夜限定</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-07.jpg" alt="初音未来" width="900"><br>
  <sub>初音未来</sub>
</p>

<p align="center">
  <img src="docs/images/gallery/skin-08.jpg" alt="舞台黑金" width="900"><br>
  <sub>舞台黑金</sub>
</p>

## 它能做什么

- **真·可交互**：侧栏、建议卡、项目选择、输入框都是原生控件，不是整窗假截图贴上去
- **可换图**：换一张喜欢的图，就能变成你的主题
- **可恢复**：一键还原官方外观
- **相对安全**：本机回环 CDP 注入，不改官方二进制与签名

## 快速开始

仓库内按平台放了现成脚本（实现细节不同，效果都是「主题化 Codex」）：

| 平台 | 目录 | 入口 |
|------|------|------|
| Apple Silicon / Intel Mac | [`macos/`](./macos/) | 双击 `Install Codex Dream Skin.command` |
| Windows | [`windows/`](./windows/) | `scripts/install-dream-skin.ps1` → `栋哥 Codex` 快捷方式 |

无人值守安装可直接指定主题：macOS 用 `--theme-id dongge-blueprint --no-launch`，
Windows 用 `-ThemeId dongge-blueprint`。可选值：
`dongge-marginalia`、`dongge-blueprint`、`dongge-placard`、`dongge-light`。

统一 ZIP：运行 [`Build Dongge Skin Pack.command`](./Build%20Dongge%20Skin%20Pack.command)，或执行
`scripts/build-unified-release.sh`。

更细的说明：

- Mac：[`macos/README.md`](./macos/README.md)
- Windows：[`windows/SKILL.md`](./windows/SKILL.md)
- 路径对照：[`docs/platforms.md`](./docs/platforms.md)
- 项目记录：[`docs/PROJECT.md`](./docs/PROJECT.md)

## 反馈与贡献

- **Issue：** 请用 [Issue 模板](./.github/ISSUE_TEMPLATE/)（Bug / 功能）；已关闭空白 Issue。提交前建议先跑 Verify / Restore 自检。
- **PR：** 请按 [PR 模板](./.github/pull_request_template.md) 写清改动，并勾选对应自测（如 `macos/tests/run-tests.sh`、verify / restore）。

## 安全边界

- CDP 只绑 `127.0.0.1`，主题运行期间勿跑来路不明的本机程序
- 不修改官方安装目录与代码签名
- **不会**自动改写 API Key / Base URL；中转与换肤分开

## 许可与声明

- 见 [`macos/LICENSE`](./macos/LICENSE)（MIT）与 [`macos/NOTICE.md`](./macos/NOTICE.md)
- 非 OpenAI 官方产品；Codex 及相关权利归其权利人
- 效果图中的人物 / IP 形象仅作主题示意；商用或公开再分发请自行确认肖像权与商标授权

---

Star 一下，然后挑一张图，把你的 Codex 变成今天想要的样子。
