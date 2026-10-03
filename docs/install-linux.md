# Linux 安装与更新

本页面向只想使用主题的普通用户。Release 安装包只包含换肤引擎，不修改官方 Codex 的安装
目录或签名；不需要 clone 仓库，也不需要手动运行仓库脚本。

Linux 包为新增构建目标；正式 Release 尚未发布 Linux 资产时，请使用该分支 Linux CI 的
构建产物，或由开发者运行 `bash linux/scripts/build-release-linux.sh` 生成安装包。

## 前置：官方 Codex 桌面应用

Dream Skin 在 Linux 上直接启动官方 Codex / ChatGPT 桌面应用并通过本机回环 CDP 注入主题。
请先安装官方应用，至少启动一次并退出，让它生成 `~/.codex/config.toml` 与登录信息。

请沿用 Codex 桌面应用提供的安装说明；Dream Skin 安装包不包含 Codex，也不会新增或修改
系统的软件源。对于 apt 安装，Dream Skin 会在每次启动换肤前校验包的仓库来源与完整性。

如果已有可信来源的 AppImage，`chmod +x` 加上执行权限后放到 `~/Applications/`
（或设置环境变量 `CODEX_APP_IMAGE` 指向该文件）。AppImage 的额外要求见下方
「AppImage 与二进制安装」。

## 首次安装

### 方式一：`.deb`（推荐，需要 sudo）

1. 在 GitHub 的 [Releases](https://github.com/Fei-Away/Codex-Dream-Skin/releases) 下载最新的
   `codex-dream-skin_<version>_amd64.deb`。`SHA256SUMS.txt` 是可选的完整性校验文件。
2. 安装（推荐，apt 会自动解析依赖）：
   `sudo apt install ./codex-dream-skin_<version>_amd64.deb`。
   备选：`sudo dpkg -i codex-dream-skin_<version>_amd64.deb`，若提示依赖缺失再运行
   `sudo apt install -f` 补齐。依赖（`bash`、`coreutils`、`curl`、`file`、`iproute2`、
   `libnotify-bin`、`nodejs`（>= 22）、`procps`、`unzip`、`xdg-utils`）会由包管理器解析。
   若发行版软件源不提供 Node.js 22 或更新版本，需先按 Node.js 官方安装说明安装受支持版本。
3. 从桌面应用菜单打开 Dream Skin，或在终端运行 `dreamskin`，出现交互菜单。

包会安装到 `/opt/codex-dream-skin`，并提供 `/usr/bin/dreamskin` 命令。首次以桌面用户运行
`dreamskin` 时会注册 `x-scheme-handler/dreamskin` 协议（网站一键换肤用）；deb 维护脚本
不会以 root 身份改写用户的 MIME 默认项。`ffmpeg` 是可选推荐依赖
（Recommends）：只有更换背景图时源图不是 JPEG 才需要它做转换，JPEG 直通不受影响；
缺少它时换背景图会明确报错，`sudo apt install ffmpeg` 即可补齐。
网站一键换肤还需要 `zenity` 显示本地确认对话框（同样列为推荐依赖）；缺少图形确认程序
且没有交互终端时会取消应用，不会静默切换主题。

deb 安装时不预置主题库。第一次启动 `dreamskin` 时会自动播种内置预设主题并预选
Gothic Void Crusade，无需手动准备；想要其他主题时再手动导入（菜单 4）。之后日常用
菜单 1 一键启动。

### 方式二：`tar.gz`（不需要 root）

1. 下载最新的 `CodexDreamSkin-v<version>-linux-amd64.tar.gz`。
2. 解压并安装：

   ```bash
   tar xzf CodexDreamSkin-v<version>-linux-amd64.tar.gz
   cd codex-dream-skin
   ./install.sh
   ```

   不需要 root：引擎安装到 `~/.local/share/codex-dream-skin`，并创建
   `~/.local/bin/dreamskin` 命令、应用菜单入口和 `x-scheme-handler/dreamskin` 协议注册。
   安装器还会把内置预设主题放进你的主题库并预选 Gothic Void Crusade。解压出来的目录
   在安装完成后可以删除。
3. 在终端运行 `dreamskin` 打开菜单。如果提示找不到命令，把
   `export PATH="$HOME/.local/bin:$PATH"` 加入 `~/.profile`、`~/.bashrc` 或 `~/.zshrc`
   （或重新登录一次）。

tar.gz 用户需要自装依赖：`nodejs`（>= 22）与 `curl`（启动探测与检查更新需要）；`unzip`
（导入主题 ZIP 需要）；`libnotify-bin`（网站一键换肤的结果桌面通知需要）；`rsync`
（安装脚本用）一般已随系统预装。
从浏览器一键换肤还需要 `zenity`，用于确认具体主题后才应用。

## 日常使用

终端运行 `dreamskin` 打开交互菜单：

| 键 | 功能 |
|----|------|
| `1` | 启动 Codex 并应用换肤 |
| `2` | 暂停换肤（移除皮肤并停止注入器，不重启 Codex，不还原外观备份） |
| `3` | 更换背景图…（选一张纯背景，保存为新主题并立即应用） |
| `4` | 导入主题 ZIP… |
| `5` | 已保存主题（列出 / 应用） |
| `6` | 打开主题文件夹 |
| `7` | 一键恢复官方外观 |
| `8` / `9` | 打开主题库 Gallery / 在线 Studio |
| `M` | 动画背景（极光 / 星空、开关、节能模式） |
| `A` | 开机自启（开 / 关，再按一次即切换） |
| `D` | 诊断信息 |
| `U` | 检查更新 |
| `0` | 退出 |

常用子命令：

| 命令 | 作用 |
|------|------|
| `dreamskin start` | 启动 Codex 并应用当前主题；可用 `--renderer wayland` 或 `--renderer x11` 强制渲染后端，`--restart-existing` 重启已运行的 Codex，`--allow-unsigned` 一次性信任 AppImage/二进制 Codex（见下方「AppImage 与二进制安装」） |
| `dreamskin pause` | 暂停换肤 |
| `dreamskin restore` | 恢复官方外观并正常重启 Codex（同菜单 7） |
| `dreamskin import` | 导入主题 ZIP（交互式输入路径） |
| `dreamskin bg` | 更换背景图（交互式输入路径） |
| `dreamskin animation` | 打开动画背景设置菜单 |
| `dreamskin animation preset aurora` / `preset starfield` | 选择并开启内置极光 / 星空背景 |
| `dreamskin animation on` / `off` | 开启 / 关闭动画，保留已选预设和原有壁纸 |
| `dreamskin animation power low` / `power auto` | 节能静止 / 自动判断资源与动态效果偏好 |
| `dreamskin animation status` / `reset` | 查看设置 / 恢复默认关闭状态 |
| `dreamskin theme list` | 列出已保存主题 |
| `dreamskin theme apply <id>` | 应用某个已保存主题 |
| `dreamskin autostart` | 切换开机自启（无参数；运行一次开启，再运行一次关闭） |
| `dreamskin status` / `doctor` | 状态 / 诊断信息 |
| `dreamskin update` | 检查 GitHub Releases 更新 |
| `dreamskin folder` / `gallery` / `studio` | 打开主题文件夹 / Gallery / 在线 Studio |

主题、图片和运行状态保存在 `~/.local/state/codex-dream-skin`；更新或重装引擎不会删除它们。

应用菜单里的“Dream Skin”入口会打开终端交互菜单；网站的一键换肤使用单独隐藏的
`dreamskin://` 协议处理器。当前 Linux 版未提供常驻图形托盘或原生文件选择器。

### 动画背景

默认仍显示静态壁纸。菜单 `M` 可开启本地内置的极光或星空，营造 Astro 风格网页模板的
缓慢动态氛围。它们只是一层本地 CSS 渐变，不导入 Astro 页面、HTML、JavaScript、视频
或远程资源；原有壁纸、主题配色和原生控件继续保留。关闭后恢复原有静态效果。

设置独立保存在状态目录的 `animation.json`，对当前及之后切换的主题生效；更新引擎、
切换主题、暂停和恢复换肤均保留设置，不修改主题 ZIP 合同或 Safe CSS 策略。正在使用
本版本注入器时会自动热更新；暂停状态下只保存，下次启动换肤时生效，不会自动启动
或重启 Codex。旧版已安装的注入器需要更新到包含此功能的版本才会读取这些设置。

动画使用单层缓慢变换，没有逐帧 JavaScript、模糊滤镜、画布或视频。窗口隐藏/最小化
以及页面挂起时暂停；系统设置“减少动态效果”时显示静止画面。`power low` 强制静止，
自动模式在浏览器报告不超过 4 个 CPU 线程、不超过 4 GB 内存或启用节省流量时也保持
静止。网页无法可靠检测所有桌面电源策略，可手动选择节能模式。任务背景设为 `off` 时
保留任务页的背景关闭行为。减少动态效果和低资源模式仍可显示所选预设的静态氛围。

本机设置损坏或不符合固定 schema 时，注入器回退到静态壁纸；运行
`dreamskin animation reset` 可恢复默认设置。动画与系统 GPU、Wayland/X11 的配合仍需
真实 Codex 窗口验证；隔离浏览器预览不能替代桌面实测。

### 主题导入与手动目录

下载到 `.zip` 主题包后，用菜单 4「导入主题 ZIP…」。只接受普通 `.zip`，不接受 `.dreamskin`。
正式 Studio 包包含 `manifest.json`、非空 `theme.json`、非空 `theme.css`、恰好一张
`background.webp|jpg|png`，并可选带 `LICENSE.txt`、`manifest.sig`；这些文件可直接位于根
目录或只包一层主题目录。导入器会核对平台、最低客户端版本以及清单中每个负载文件的大小和
SHA-256。`theme.css` 会在本机导入和应用时复验，通过后只作用于注册部件；预留签名当前不
验证。本地简化包也必须恰好包含 `theme.json`、`theme.css` 与引用图片。导入只加入主题库，
不会自动应用。ZIP 最大 32 MiB、最多 32 个条目、解压后最多 64 MiB；路径穿越、链接、
嵌套压缩包及不符合主题/图片约束的内容会在写入前被拒绝。

手动方式：菜单 6「打开主题文件夹」，把已经解压且直接包含 `theme.json`、`theme.css` 与
背景图的完整目录放入 `~/.local/state/codex-dream-skin/themes/`，再重新打开菜单。不要只
移动图片，也不要让目录里再套一层主题目录。手动目录不经过 ZIP 导入器的归档校验，请只
移动可信内容。

### 从网站一键换肤

网站主题包必须在 manifest 的 `platforms` 中明确声明 `linux`，否则客户端会拒绝导入。
仅有 macOS/Windows 声明的现有包不能自动视为 Linux 兼容，需由主题发布方重新导出。
安装客户端后，DreamSkin.cc 上已通过审核并支持一键换肤的主题会显示“一键应用到客户端”。
点击后，Linux 会把 `dreamskin://apply?version=...` 请求通过 `x-scheme-handler/dreamskin`
交给 Dream Skin（deb 在用户首次运行 `dreamskin` 时注册；tar.gz 由 `install.sh` 注册）。浏览器确认后会显示
本地主题确认对话框；同意后换肤在后台完成，结果以桌面通知呈现（成功显示主题名；失败提示并给出日志路径
`~/.local/state/codex-dream-skin/community-apply.log`）。在终端里跑 `dreamskin community
<链接>` 则照常在终端里显示过程输出。

客户端不会使用网页提供的下载地址。它只连接固定的 DreamSkin.cc 官方 API，拒绝重定向，
核对审核状态、一键兼容标记、下载字节数和 SHA-256，然后复用与手动导入完全相同的 ZIP、
manifest、图片与 Safe CSS 校验。换肤开始前，当前皮肤必须已处于可验证的 Skin ON 状态；
客户端会先保存精确的回滚快照，只有真实 Codex 界面确认新主题已经渲染才报告成功。启动或
渲染失败时自动恢复换肤前的主题（恢复同样经可见性验证）；无法确认时会如实报告状态未
确认，而不是假装已恢复。

## 手动更新

更新是覆盖安装，不是重新配置：

1. 从 Releases 下载新的 `codex-dream-skin_<version>_amd64.deb`（deb 用户）或
   `CodexDreamSkin-v<version>-linux-amd64.tar.gz`（tar.gz 用户）。
2. 退出 Dream Skin 换肤（菜单 2 暂停）并关闭 Codex。
3. deb：`sudo dpkg -i` 新包覆盖安装；tar.gz：重新解压后运行 `./install.sh`。
4. 重新运行 `dreamskin`；活动主题、已保存主题、图片和配置备份会保留。

`dreamskin update`（菜单 U）只在用户点击时访问 GitHub Releases；不会后台轮询、自动下载
或静默替换安装包。

## AppImage 与二进制安装

Dream Skin 优先使用官方 apt 源安装的 Codex：启动前会校验包的仓库来源
（`platform.openai.com/codex` 或 `*.oaistatic.com/codex-app-prod`）并用 `dpkg -V` 检查
包文件完整性；来源不是官方仓库的安装会被拒绝换肤。AppImage（放在 `~/Applications/`，
或通过 `CODEX_APP_IMAGE` 指定）也能被发现，但下载文件没有仓库签名可溯源。出于安全，
换肤前需要一次性确认该文件是官方下载：核对来源后运行一次
`dreamskin start --allow-unsigned`，工具会记录该文件的 SHA-256 审批（模式 0600，存于
状态根目录），之后启动无需再带该参数。审批只对当时确认的文件有效，更新 AppImage 后需
再确认一次；deb 安装走 dpkg 完整性 + 官方源校验，该参数会被忽略。

## 卸载与恢复

1. 若开启过开机自启（菜单 A），先运行 `dreamskin autostart` 关闭它（该命令是开 / 关
   切换），或手动删除 `~/.config/autostart/codex-dream-skin.desktop`。
2. 运行 `dreamskin restore`（菜单 7），恢复 Codex 官方外观并以普通方式重启 Codex。
3. deb：`sudo dpkg -r codex-dream-skin` 卸载；`sudo dpkg -P codex-dream-skin`（purge）
   会一并删除 `/opt/codex-dream-skin`。
4. tar.gz：删除 `~/.local/share/codex-dream-skin`（引擎）、`~/.local/bin/dreamskin`、
   `~/.local/share/applications/codex-dream-skin.desktop` 和
   `~/.local/share/applications/codex-dream-skin-url.desktop`。
   如安装了 `update-desktop-database`，运行
   `update-desktop-database ~/.local/share/applications` 更新桌面注册缓存。
   若用户的 `mimeapps.list` 仍将 `x-scheme-handler/dreamskin` 指向已删除的处理器，
   仅移除该协议对应的 Dream Skin 条目，保留其他默认程序设置。
5. `~/.local/state/codex-dream-skin` 中的主题、图片与状态默认保留，方便重装；确认不再
   需要时手动删除该目录。

## 常见问题

### 白屏 / 卡在 logo

先运行 `dreamskin pause`，退出 Codex 后从其原始桌面入口重新打开，判断是否仅在换肤
时发生。保留 `dreamskin doctor` 的诊断结果并检查日志；报告问题前移除私密路径和会话
信息。不要为排查换肤问题直接清空 Codex 的配置、登录凭据或会话目录。

### Wayland 下界面模糊

强制使用 X11 渲染：`dreamskin start --renderer x11`。`--renderer` 只接受 `wayland` 或
`x11` 两种值；重新启动 Codex 后生效。

### NVIDIA 花屏 / 渲染错误

Wayland 会话检测到 NVIDIA 驱动时，工具会自动改用 X11 渲染。X11 下仍花屏时，在
`~/.local/state/codex-dream-skin/electron-flags.conf` 中加一行：

```text
--disable-gpu-compositing
```

该文件每行一个 Electron 参数，`#` 开头为注释、空行忽略；保存后 `dreamskin start` 重启
Codex 生效。

### 输入法候选框不显示

Wayland 会话下工具会自动附加 `--enable-wayland-ime`。如果候选框仍不显示（例如你强制了
`--renderer x11`），可在 `~/.local/state/codex-dream-skin/electron-flags.conf` 中加一行
`--enable-wayland-ime` 后重新启动。X11 会话的输入法走系统 XIM，不需要该参数。

### 提示找不到 Node.js

需要 `nodejs` >= 22，并启用内建 `WebSocket`。Node.js 18/20 即使能通过部分离线测试，
也不能直接运行这里的 CDP 连接代码。deb 声明相同的版本依赖；若发行版默认源版本过低，
请按 [Node.js 官方说明](https://nodejs.org/en/download) 安装受支持版本。
tar.gz 用户也请确认已安装 `curl`。

### Codex 更新后主题失效

官方 Codex 升级后重新运行 `dreamskin`（菜单 1）即可；Dream Skin 会在每次启动时重新校验
官方包来源与完整性。仍异常时先菜单 7 恢复官方外观，再菜单 1 启动。

### 提示「ChatGPT is already running … pass --restart-existing」

先自行打开的 Codex 没有换肤所需的调试端口，菜单 1 会停下来并给出上述提示。先完全退出
Codex 再按菜单 1；或直接运行 `dreamskin start --restart-existing` 让工具重启 Codex。

开发者和高级用户可直接运行 [`linux/scripts/`](../linux/scripts/) 下的脚本（菜单入口为
`dreamskin.sh`，安装入口为 `install-dream-skin-linux.sh`）；普通用户应优先使用 Release
安装包。
