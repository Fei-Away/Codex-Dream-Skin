# 素材来源记录

## 人物参考图

- 来源：用户在当前 Codex 任务中提供的 7 张栋哥截图。
- 用途：仅用于人物身份、脸型、眼镜、发型、姿态与气质参考。
- 处理：候选壁纸由 imagegen 重新生成；原始低分辨率截图暂不复制进仓库。
- 公开范围：用户已说明项目可以上传 GitHub。正式发布前仍需复核最终候选图及人物素材授权范围。

## 生成原则

- 使用真实摄影方向，不做明显 AI 化或卡通化。
- 生成图不得包含第三方商标、Codex 假界面、未授权人物或水印。
- 每张候选的最终提示词、生成日期与文件校验值均已落盘记录。

## 生成记录

- 生成工具：Codex 内置 imagegen。
- 生成日期：2026-07-16。
- 统一用途：浅色 Codex 主界面超宽背景，人物位于右侧，左侧保留原生 UI 安全区。

| 文件 | 方向 | SHA-256 |
| --- | --- | --- |
| `candidates/dongge-light-hero-01.png` | 心理问题白板（已选） | `16c3c80d2b0dd1b4e2cd1f3a146dc5f608593b37e3a9a58a5c0e8682aa208735` |
| `candidates/dongge-light-hero-02.png` | 心理问题举牌 | `4ffa3ade7c179958c4782af7c1bab96e83d729acad65ac16ece12667b8fa8e21` |
| `candidates/dongge-light-hero-03.png` | 维特根斯坦案头 | `2d210f1b82e98171f612255c38765fd372cff212dc97a84a88b7dc580698c9e6` |
| `candidates/dongge-light-hero-04.png` | dbskill 开源分身工作台 | `916f98c0f6dc7d046b6ccf279f090e24281657fea60f8c894123f8d2f213c232` |
| `candidates/dongge-light-hero-05.png` | 试试就知道 | `4fa3842a24cf9934ab4b8b33f3ce44042761dc80cb1e074fb76348cff5f62500` |
| `background.png` | 正式母版（候选 01 副本） | `16c3c80d2b0dd1b4e2cd1f3a146dc5f608593b37e3a9a58a5c0e8682aa208735` |

## 发布边界

- `background.png`、`macos/assets/dongge-light.png` 与 `windows/assets/dongge-light.png` 字节一致。
- 生成图不随仓库的软件 MIT 许可自动授权；公开 GitHub 前仍需确认栋哥肖像及发布许可。
