# 平台对照

## Windows：Miku Stage 2.0.5

| 用途 | 路径 / 状态 |
| --- | --- |
| 源码 | windows/ |
| 安装后引擎 | %LOCALAPPDATA%\CodexMikuSkin\engine |
| 状态与日志 | %LOCALAPPDATA%\CodexMikuSkin |
| Codex 配置 | %USERPROFILE%\.codex\config.toml |
| Codex 配置 | 安装器不修改；文件存在时可保存一次只读备份到 %LOCALAPPDATA%\CodexMikuSkin\config.before-miku-stage.toml |
| 默认 CDP | 127.0.0.1:9347 |
| Auto Hook | 当前用户 Limited 计划任务，AtLogOn |
| 设计/静态契约 | 14 项；不代表 14 路由已验收 |
| Dark 路由基线 | 2.0.3 组件 01–13 已通过 live contract + 截图视觉复核 |
| Codex 更新兼容性 | `26.715.2305.0` Home 与当前任务壳/输出面板已复核：4 张原生建议卡真实可见，sidebar/composer/修改摘要/thread summary output/插画正常，无横向溢出；其他路由未外推 |
| 全状态矩阵 | 组件 14 仍为 Partial |
| Light | home + settings-general 视觉 smoke 通过；未做全路由签收 |
| 静态门禁 | windows/tests/test-windows-skin.ps1 |
| 实机验证 | verify-miku-skin.ps1 + qa-inventory.md |

Windows 实现不修改官方安装目录、app.asar 或签名。启动器每次通过 Get-AppxPackage 和当前 manifest 动态发现 Store AUMID，再使用 Windows 应用激活 API 传入 loopback CDP 参数；Dark 路由视觉基线仍为 2.0.3。

## macOS：上游遗留

macos/ 保留 Codex Dream Skin 上游实现。本次没有修改、迁移或验证 macOS 路径，因此不能把 Windows 的 14 项设计/静态契约或任何路由验收状态外推到 macOS。

## 能力矩阵

| 功能 | Windows Miku Stage | macOS inherited |
| --- | :---: | :---: |
| 14 项设计契约 + manifest/CSS 静态映射 | 已实现 | 未迁移 |
| 运行时路由覆盖 | Dark 组件 01–13 基线 Verified；14 Partial | 未验证 |
| 独立 Miku hero | 已实现 | 未迁移 |
| Dark/Light token | 已实现；Light 仅两路由 smoke | 未迁移 |
| loopback CDP | 已实现 | 上游实现 |
| 安装后独立引擎 | 已实现 | 上游实现 |
| 安全默认快捷方式 | 已实现 | 未验证 |
| live verify / screenshot | 已实现 | 上游实现 |
| 自动整站路由截图 | 未实现 | 未实现 |

实机 QA 截图保存在被 Git 忽略的 `runtime/qa/`，只在 `windows/references/qa-inventory.md` 登记本地证据名称，不将含真实任务或账户内容的截图提交到仓库。

## 禁止进入仓库或日志的内容

- .codex/auth.json、API Key、Base URL、服务器私钥。
- 含真实账户、usage、项目名、任务名或分支名的公开截图。
- 未经权利审核的公开商业角色素材包。
