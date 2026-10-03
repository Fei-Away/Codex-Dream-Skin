# Dream Skin Linux 版设计（v1）

- 日期：2026-08-15
- 分支：`feat/linux-support`
- 状态：设计已确认

## 背景与目标

项目目前只有 macOS（`.dmg` + 菜单栏）和 Windows（`.exe` + 托盘）两端；v1.5.14 Release 没有任何 Linux 资产。目标：让 Linux 用户（Ubuntu / Pop!_OS 等）也能安装和使用 Dream Skin，功能对齐双端。

可行性依据：官方 Codex 桌面端已有 Linux 预览版（`.deb` / `.rpm` / AppImage，支持 Ubuntu 24.04/26.04 LTS、Debian 13、Fedora 43/44），Dream Skin 的「拉起官方 Codex + 本机 CDP 注入」模型在 Linux 上成立。已知 Linux 显示问题（白屏、Wayland 模糊、NVIDIA 花屏、IME）在启动参数设计中一并处理。

## 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 产品形态 | 轻量脚本版（bash + Node），不依赖托盘 |
| 发布形式 | `.deb`（Debian/Ubuntu/Pop!_OS 系）+ `tar.gz`（任意发行版）都要 |
| 功能范围 | 对齐双端：启动注入、一键恢复、主题 .zip 导入/切换、换背景图、Gallery/Studio 入口、开机自启 |
| 交互方式 | 无参数 → 交互菜单；带参数 → 子命令 |
| 实现路线 | 路线 A：新建 `linux/` 目录，移植 macOS 脚本体系，复用 `runtime/` 共享源 |

## 1. 目录结构与安装布局

```
linux/
├── VERSION / README.md / README.en.md / CHANGELOG.md / SKILL.md
├── assets/                     # tools/sync-runtime-assets.mjs 生成（扩展支持 linux/）
├── presets/                    # 预设主题
├── scripts/
│   ├── common-linux.sh         # 状态根、日志、CDP 端点、双语文本（移植 common-macos.sh）
│   ├── dreamskin.sh            # 主入口：无参数=交互菜单；子命令分发
│   ├── start / restore / pause / status
│   ├── import-theme-zip / switch-theme / load-image-theme
│   ├── apply-community-theme   # 网站「一键换肤」协议入口
│   ├── injector.mjs            # 从 macOS 移植，只改启动/验签两处
│   ├── theme-config.mjs / write-theme.mjs / image-metadata.mjs / stage-theme.mjs
│   │   / validate-safe-css-file.mjs / publish-theme-import.mjs …  # 原样复用
│   ├── build-deb.sh / build-tarball.sh / check-update
├── installer/                  # .deb 打包素材：control、desktop entry、postinst/prerm
└── tests/                      # 移植平台无关测试 + Linux 特有测试
```

安装布局：

| | 安装位置 | 命令入口 | 状态/日志 |
|---|---|---|---|
| .deb | `/opt/codex-dream-skin/` | `/usr/bin/dreamskin`（软链包装） | `~/.local/share/codex-dream-skin/` |
| tar.gz | 解压即用，或 `./install.sh` 装到 `~/.local/share/codex-dream-skin/` | `~/.local/bin/dreamskin` | 同上 |

- `.deb` 依赖 `nodejs`、`xdg-utils`（Ubuntu 24.04 自带 node 18.x，injector 为纯 ESM，兼容）；postrm 清理桌面项与协议注册。
- Codex 配置仍走 `~/.codex/config.toml`（与 macOS 相同）。

## 2. 启动注入（Linux 特有部分）

复用 macOS 流程（端口 → 确认 CDP 端点 → 注入 → 可见性验证 → 失败回滚），替换「发现并启动 Codex」：

1. **检测 Codex**：`which codex-desktop`（官方 apt 源包）→ dpkg 查包 → 查 AppImage（`~/Applications/*.AppImage`）
2. **验签/溯源**（fail-closed）：
   - deb：`apt-cache policy codex-desktop` 确认 OpenAI 官方签名源 + `dpkg -V` 完整性
   - AppImage：无签名机制 → 默认拒绝，用户显式确认一次后放行（记录到状态文件）
3. **启动参数**（写入 `electron-flags.conf`，一行一个，可编辑）：
   - `--remote-debugging-port=9335`（冲突自动换空闲口，对齐 Windows）
   - 自动检测 `$XDG_SESSION_TYPE` + 显卡：
     - X11 → `--ozone-platform=x11`
     - Wayland + NVIDIA → `--ozone-platform=x11`（避开已知花屏）
     - Wayland + 其他 → 交给应用默认 + `--enable-wayland-ime`
   - `dreamskin start --renderer=wayland|x11` 手动覆盖
4. **复用已运行 Codex**：检测已开 CDP 端口直接注入（对齐 macOS saved port 机制）

## 3. 菜单与子命令

主入口 `dreamskin`，无参数 → 交互菜单（双语跟随 `LANG`）：

```
 1 启动 Codex 并应用换肤    2 暂停换肤    3 更换背景图…
 4 导入主题 ZIP…            5 已保存主题  6 打开主题文件夹
 7 一键恢复官方外观         8 Gallery ↗   9 Studio ↗
 A 开机自启（开/关）        D 诊断        U 检查更新    0 退出
```

子命令：`start [--renderer=]` / `pause` / `restore` / `import <zip>` / `theme list|apply <name>` / `bg <image>` / `gallery` / `studio` / `autostart on|off` / `status` / `doctor` / `update`。

「一键换肤」：注册 `x-scheme-handler/dreamskin` 到 .deb 与 tar.gz 的 desktop entry，复用 `publish-theme-import.mjs` 校验管线。

复用策略：菜单项均为现有 macOS 脚本的薄包装，Linux 端不重写业务规则。

## 4. 打包发布、CI、版本同步

- `build-release-linux.sh`：sync 资产 → 校验 payload → 测试 + `bash -n` → 产出 `tar.gz` + `.deb`（原生 `dpkg-deb` 构建）+ `SHA256SUMS.txt`，版本号取 `linux/VERSION`
- CI：新增 `.github/workflows/release-linux.yml`，ubuntu-24.04 runner 跑测试 + 构建，Release 时随 .exe/.dmg 上传资产
- 版本同步：发布流水线校验三端 `VERSION` 一致才允许出包（AGENTS.md 要求）
- 文档：`docs/install-linux.md`（含白屏/Wayland/NVIDIA 排查）、`docs/platforms.md` 能力矩阵加 Linux 列、README 双语更新

## 5. 测试与验收标准

**自动化**：
1. 移植双端平台无关测试：ZIP 导入全攻击面（合法/缺件/空文件/边界/哈希/路径穿越/链接/嵌套/压缩炸弹/重复导入/ID 冲突）、Safe CSS、theme-config、payload 完整性
2. Linux 特有：会话/显卡检测、electron-flags 生成、子命令分发、.deb 内容清单断言
3. 全部 shell 脚本 `bash -n` + shellcheck
4. 改共享源后 `sync-runtime-assets.mjs --check` 必须通过

**实机验收**（发布门槛）：
- Pop!_OS：官方源装 `codex-desktop` → `dpkg -i` 装 deb → 启动 → Codex 真实可见换肤（CDP 截图验证）
- 主题导入/切换、换背景图、一键恢复（外观 + `~/.codex/config.toml`）逐一实机确认
- 注入失败自动回滚并如实报告
- Ubuntu 24.04 deb 安装卸载干净；tar.gz 无 root 解压即用；自启项生效
- 三端 VERSION 一致、CI 全绿、Release 资产可下载

## 调研来源（存档）

- 官方 Linux 预览：OpenAI 论坛 [preview 帖](https://community.openai.com/t/codex-in-chatgpt-desktop-app-for-linux-is-now-in-preview/1390027)
- 白屏/卡 logo：[社区 bug 帖](https://community.openai.com/t/bug-codex-desktop-app-doesn-t-load-stuck-on-logo-screen/1379694/39)、[CSDN 中文案例](https://deepseek.csdn.net/6a05a139662f9a54cb74758d.html)
- Wayland/ozone/NVIDIA 参数与 `electron-flags.conf`：[ilysenko/codex-desktop-linux](https://github.com/ilysenko/codex-desktop-linux/blob/main/docs/troubleshooting.md)
- Pop!_OS COSMIC GPU 问题：[cosmic-comp #1113](https://github.com/pop-os/cosmic-comp/issues/1113)、[cosmic-epoch #3389](https://github.com/pop-os/cosmic-epoch/issues/3389)
