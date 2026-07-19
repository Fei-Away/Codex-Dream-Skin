# Windows 安装与更新

本页面向只想使用主题的普通用户。Release 安装器包含所需运行时，不需要 clone 仓库、安装全局
Node.js 或执行 PowerShell 脚本。

## 首次安装

1. 在 GitHub 的 [Releases](https://github.com/Fei-Away/Codex-Dream-Skin/releases) 下载最新的
   `CodexDreamSkin-Setup-vX.Y.Z.exe`。`SHA256SUMS.txt` 是可选的完整性校验文件。
2. 双击安装器，按向导完成安装。默认安装到当前用户的 LocalAppData，不需要管理员权限；安装前
   请先退出 Codex。
3. 安装完成后，开始菜单或桌面快捷方式可启动 Codex Dream Skin，系统托盘会显示主题图标。

### 为什么有时会看到“Windows 已保护你的电脑”

公开发行包目前没有购买代码签名证书。Windows SmartScreen 会综合下载来源、文件的
“来自互联网”标记（Mark of the Web）和 Microsoft 的信誉数据作判断，因此同一个版本在不同电脑、
浏览器或下载时间可能表现不同。你很少遇到提示是正常的：文件已有信誉、来自组织分发，或浏览器
没有保留该标记时，SmartScreen 可能直接放行。

如果 SmartScreen 显示蓝色警告：

1. 点击 **更多信息**。
2. 核对发布者/文件名和你刚从项目 Releases 下载的文件一致。
3. 确认来源无误后点击 **仍要运行**。

不要为了安装而关闭 Defender、SmartScreen 或系统的 Smart App Control。如果组织策略没有“仍要运行”，
请联系管理员或使用受组织批准的分发方式；不要下载来路不明的替代安装器。

安装器本身不应要求提升到管理员权限。若出现意外的管理员密码提示，取消并核对下载地址、版本和
文件属性后再报告问题。

## 日常使用

使用“Codex Dream Skin”快捷方式启动，使用托盘菜单换图、保存主题、暂停或恢复。主题和运行状态
保存在 `%LOCALAPPDATA%\CodexDreamSkin`，安装目录可以更新而不会删除这些数据。

安装后的快捷方式使用受限的 `RemoteSigned` 策略；普通用户不需要打开 PowerShell，也不需要手动
运行 `.ps1` 文件。

## 手动更新

更新是覆盖安装，不是重新配置：

1. 从 Releases 下载新的 `CodexDreamSkin-Setup-vX.Y.Z.exe`。
2. 退出 Dream Skin 托盘，并关闭 Codex。
3. 运行新的安装器，按向导覆盖现有安装。
4. 重新启动快捷方式；活动主题、已保存主题、图片和配置备份会保留。

SmartScreen 的决定针对下载到本机的具体文件。你对某个安装器点击“仍要运行”后，通常不会在每次
启动已安装快捷方式时再弹一次；但每次下载新的未签名 Setup.exe 都可能重新出现一次警告，不能把
“只安装一次”理解为所有未来版本都自动获得信任。更新不需要再次运行 PowerShell 放行命令。

托盘中的“检查更新”（如果当前版本提供）只在用户点击时访问 GitHub Releases；不会后台轮询、自动
下载或静默替换安装包。

## 卸载与恢复

从开始菜单打开恢复/卸载入口，先恢复 Codex 官方外观并关闭 CDP，再移除程序。默认保留
`%LOCALAPPDATA%\CodexDreamSkin` 中的主题和图片，方便重新安装；确认不再需要时再从“设置 → 系统 →
存储 → 已安装的应用”或“应用和功能”删除残留数据。

## 常见问题

### 没有“仍要运行”

这通常是企业策略或 Windows 11 Smart App Control 在阻止未签名程序。不要关闭安全策略；改用组织
批准的机器/分发渠道，或把完整的 SmartScreen 画面、Windows 版本和安装器 SHA-256 提交 Issue。

### 安装后仍提示找不到 Node.js

确认使用的是 Release Setup.exe，而不是仓库脚本安装方式。Release 安装器会带上固定的 Node 运行时；
若问题持续，请保留安装日志并报告版本，不要随意从第三方网站下载 `node.exe` 覆盖安装目录。

### Codex 更新后主题失效

退出托盘后重新运行最新 Setup.exe，再使用 Dream Skin 快捷方式启动。安装器会重新发现当前注册的
官方 Store 包，用户主题和图片不会被删除。

开发者和高级用户仍可参阅 [`windows/README.md`](../windows/README.md) 的仓库安装章节；普通用户应
优先使用 Release Setup.exe。
