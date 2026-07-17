# Codex Dream Skin · 项目记录

> 本地归档说明。面向维护者，不是用户安装手册。  
> 仓库首页：[`../README.md`](../README.md)（中文）· [`../README.en.md`](../README.en.md)（English）  
> GitHub：https://github.com/Fei-Away/Codex-Dream-Skin

---

## 1. 它是什么

**Codex Dream Skin** 是给 **OpenAI Codex 桌面端** 用的**外部主题 / 换肤**方案：

- 本机 **CDP** 注入 CSS + 装饰 DOM
- **不修改**官方 `.app` / `app.asar` / WindowsApps / 代码签名
- 侧栏、建议卡、项目选择、输入框仍是**原生可点控件**（不是整窗假截图）
- 可换图、可一键恢复
- **不会**静默改写 API Key / Base URL（换肤与中转配置分开）

非 OpenAI 官方产品。

---

## 2. 来源与时间线（简）

| 阶段 | 说明 |
|------|------|
| 安全审 | 核对是否改 asar、是否静默劫持 API；结论：以本机 CDP 注入为主，开源时明确禁止静默中转劫持 |
| 整理开源 | 按平台拆成 `macos/`、`windows/`，补 README 图库与安装入口 |
| 本地美化 | Mac 本机引擎装在 `~/.codex/codex-dream-skin-studio`；CSS 走浅色壳 + 可选底部赞助 chip |
| 赞助 | Passion8（`aff=TuPe`）写在 README 顶部；强调满血中转卖点，且与换肤配置隔离 |
| 图库 | `docs/images/gallery/skin-01`～`08`；粉系定制 → 财神打工 → 红白科幻… |
| i18n | 默认中文 `README.md`，英文 `README.en.md`，顶部互链 |

本地曾用过 `8765` 静态预览与临时 injector；**发布后不要求**常驻这两个进程。桌面快捷方式指向已安装引擎，不依赖本仓库路径。

---

## 3. 架构（两边相同）

```text
用户本机主题工具（本仓库脚本 / 已安装引擎）
    │  启动官方 Codex + 本机 CDP（127.0.0.1）
    ▼
官方 Codex Desktop（不改 asar / 签名）
    │  注入 CSS + 装饰 DOM
    ▼
原生侧栏 / 输入框 / 建议卡 + 主题外观
```

更细的平台路径见 [`platforms.md`](./platforms.md)。

---

## 4. 仓库结构

```text
Codex-Dream-Skin/
├── README.md              # 默认中文
├── README.en.md           # English
├── docs/
│   ├── PROJECT.md         # 本文件（项目记录）
│   ├── platforms.md       # Win/Mac 路径与能力矩阵
│   ├── promo-copy.md      # 宣传文案（朋友圈等，注意肖像/IP）
│   └── images/
│       ├── gallery/       # README 效果图 skin-01…08
│       └── sponsor-passion8.png
├── macos/                 # Mac 脚本、资源、LICENSE、SKILL
└── windows/               # Windows PowerShell / 注入脚本
```

**安装后的运行位置（Mac，与仓库分离）：**

| 用途 | 路径 |
|------|------|
| 引擎 | `~/.codex/codex-dream-skin-studio` |
| 状态 / 主题 | `~/Library/Application Support/CodexDreamSkinStudio` |
| 桌面启动器 | `~/Desktop/Codex Dream Skin*.command` → 指向上面的引擎脚本 |

Windows 状态目录见 `platforms.md`（`%LOCALAPPDATA%\CodexDreamSkin`）。

---

## 5. Git / 移动目录说明

- **远程**：`origin` → `https://github.com/Fei-Away/Codex-Dream-Skin.git`
- **分支**：`main`
- **整夹移动本地路径**（例如从 `中转站/New-api` 挪到 `Personal_Developer`）：
  - **不影响** `.git` 历史、commit、remote
  - **不影响** GitHub 上的仓库
  - 只需用 `mv` 移动整个含 `.git` 的目录；之后在新路径里 `git status` 即可
  - 若 IDE / 终端仍开着旧路径工作区，需重新打开新路径

桌面 `.command` 与 `~/.codex/...` **不依赖**本仓库磁盘位置，移动开源目录后主题安装仍可用。

---

## 6. 安全与合规边界

1. CDP **仅** `127.0.0.1`，主题运行期勿跑来路不明的本机程序  
2. 不改官方安装目录与签名  
3. **禁止**安装脚本静默写入第三方 Base URL / Key  
4. 效果图含人物 / IP 时仅作主题示意；商用再分发需自行确认肖像与商标  
5. 宣传文案见 `promo-copy.md`（避免未授权商业化表述）

---

## 7. 赞助（Passion8）

- 注册链：`https://passion8.cc/register?aff=TuPe`
- README 调性：更智能的连接 / 满血 AI 中转 / 官方模型、无降智无套壳 / 一行接 Codex·Claude Code·Grok  
- 固定声明：换肤与 API 配置互相独立  

Logo 资源：`docs/images/sponsor-passion8.png`（及 svg）。

---

## 8. 常用维护动作

| 动作 | 说明 |
|------|------|
| 换图库图 | 替换 `docs/images/gallery/skin-XX.jpg`，同步改 README 两份 caption |
| 改赞助文案 | 同时改 `README.md` 与 `README.en.md` |
| 发版推送 | 在本仓库目录 `git add` → `commit` → `push origin main` |
| Mac 本机主题 | 改 `~/.codex/codex-dream-skin-studio` 的 CSS/inject；与 GitHub 源码可不同步，属本机实验位 |

---

## 9. 本地路径变迁

| 时间 | 路径 |
|------|------|
| 初开源整理 | `~/Desktop/中转站/New-api/Codex-Dream-Skin` |
| 归档位置 | `~/Desktop/Personal_Developer/Codex-Dream-Skin` |

（若再次移动，在本表追加一行即可。）

---

## 10. 相关但不在本仓

| 项 | 说明 |
|----|------|
| 本机已装引擎 | `~/.codex/codex-dream-skin-studio` |
| Passion8 主站 / NewAPI | 独立业务；本仓只做赞助致谢与配置隔离说明 |
| 中转站其它项目 | 勿与本仓混目录；本仓可独立于 New-api 工作区存在 |

---

*最后更新：随仓库提交维护。有架构变更时优先改本文件与 `platforms.md`。*
