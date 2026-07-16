# 栋哥的 dbskill · 浅色主题

团队内部使用的 Codex Dream Skin 主题，以栋哥的三个辨识点为核心：

- `心理问题`
- `试试就知道`
- `dbskill`，栋哥开源的个人分身 Skill

视觉上以真实白板讲解现场承载这些信息，并用克制的暖白、炭色和砖红替代微商、成功学与廉价科技风格。

![栋哥浅色主题背景](./background.png)

## 主题文案

| 字段 | 内容 |
| --- | --- |
| 名称 | 栋哥的 dbskill |
| 副标题 | 一个开源分身 |
| 主句 | 心理问题 · 试试就知道 |
| 状态 | 先看看是什么问题 |
| 金句 | 试试就知道 |
| 项目区 | 原生项目名，去除额外前缀与装饰标签 |

## 文件

- `background.png`：已选正式母版，2172×724 PNG。
- `theme.json`：跨平台主题源配置；macOS 已使用等价配置。
- `candidates/`：本轮生成并供选择的 5 张浅色候选。
- `brief.md`：人物与视觉边界。
- `prompts.md`：imagegen 提示词记录。
- `provenance.md`：参考素材、生成工具与文件校验值。

## 平台接入

- macOS：`macos/assets/theme.json` + `macos/assets/dongge-light.png`
- Windows：`windows/assets/dongge-light.png` + Windows 注入 CSS/文案

两端均保留 Codex 原生控件，不把整张界面烘焙进壁纸，不修改官方安装包或签名。
