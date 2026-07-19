# 源码安全审计报告

## 一、逐项安全检查

| 检查项 | 风险等级 | 发现与说明 | 证据 |
|--------|---------|-----------|------|
| **Token 获取或上传** | ✅ 无风险 | 未发现任何读取 API Key、Base URL、`auth.json` 或模型供应商配置的代码 | 全局搜索 `api_key`、`apikey`、`token`、`auth`、`bearer` 均无结果 |
| **ChatGPT 登录信息读取** | ✅ 无风险 | 未读取任何用户凭据文件或 Cookie | 无 `Get-Cookie`、`Read-Cookie` 或类似操作 |
| **网络请求** | ✅ 低风险 | 仅向 `http://127.0.0.1:{port}/json/...` 发送本地回环 HTTP 请求，端口由用户指定 | `injector.mjs` 中 `fetchCdpJson` 函数，`common-windows.ps1` 中 `Invoke-RestMethod` |
| **自动更新逻辑** | ✅ 无风险 | 无自动更新机制，需要用户手动 `git pull` | 无 `Invoke-WebRequest` 到外部域名，无 `winget`/`choco` 调用 |
| **Shell 命令执行** | ✅ 低风险 | 仅通过 `Start-Process` 启动已知路径的 PowerShell 脚本或 Codex 可执行文件 | `Start-Process` 仅用于 `powershell.exe` 和已知脚本路径 |
| **注册表修改** | ✅ 无风险 | 未发现任何注册表写入操作 | 无 `Set-ItemProperty -Path HKLM:` 或类似操作 |
| **WindowsApps 修改** | ✅ 无风险 | 代码明确拒绝修改 `WindowsApps` 目录和 `app.asar` | `install-dream-skin.ps1` 第18行校验 Store 包身份 |
| **文件覆盖** | ✅ 低风险 | 仅覆盖 `%LOCALAPPDATA%\CodexDreamSkin\*` 和 `%USERPROFILE%\.codex\config.toml`，且有原子写入和备份 | `config-utf8.ps1` 中的 `Write-DreamSkinUtf8FileAtomically` |
| **后台常驻进程** | ⚠️ 中风险 | 注入器守护进程（`injector.mjs --watch`）和托盘进程（`tray-dream-skin.ps1`）常驻后台；可通过恢复操作关闭 | `start-dream-skin.ps1` 第199行 `Start-Process -WindowStyle Hidden` |
| **权限提升（UAC）** | ✅ 无风险 | 不请求管理员权限，不修改系统级配置 | 无 `#Requires -RunAsAdministrator`，无 COM 提权调用 |
| **遥测/统计代码** | ✅ 无风险 | 未发现任何数据收集、统计或上报代码 | 无 `Invoke-RestMethod` 到外部，无 `Send-*` 函数 |
| **快捷方式创建** | ✅ 低风险 | 在桌面和开始菜单创建 2-3 个快捷方式，卸载时可删除 | `install-dream-skin.ps1` 第47-83行 |

## 二、风险评级总结

| 风险等级 | 数量 | 项目 |
|---------|------|------|
| **严重** | 0 | 无 |
| **高** | 0 | 无 |
| **中** | 1 | 后台常驻进程 |
| **低** | 3 | CDP 回环暴露、配置文件修改、快捷方式创建 |
| **无风险** | 7 | Token、登录信息、注册表、遥测、自动更新、WindowsApps、UAC |

## 三、详细信息补充

### 3.1 后台常驻进程（中风险）

- **注入器守护进程**：`injector.mjs --watch` 模式，监听主题文件变化并自动重新注入
  - 占用端口 9335+（回环）
  - 内存 ~20-30 MB
  - 可通过 `restore-dream-skin.ps1` 或手动结束进程关闭
- **托盘进程**：`tray-dream-skin.ps1`，Windows Forms 托盘菜单
  - 内存 ~10-15 MB
  - 可通过右键菜单 "退出托盘" 关闭

### 3.2 CDP 回环暴露（低风险）

- **风险**：Chromium CDP 没有同用户认证，同一 Windows 用户下的其他进程可以连接到调试端口
- **缓解**：
  - 仅绑定 `127.0.0.1`，不暴露到局域网
  - 每次操作都验证 BrowserId 一致性
  - 只接受来自官方 Store 包的消息
  - 文档提示运行期间不运行来路不明的本机程序

### 3.3 配置修改（低风险）

- **风险**：修改 `config.toml` 的外观设置
- **缓解**：
  - 安装前完整备份到 `config.before-dream-skin.toml`
  - 原子写入（临时文件 + 系统调用替换）
  - 写入前校验文件未被外部修改
  - 可完全恢复原始配置

## 四、安全设计亮点

### 4.1 多层身份验证

```
Get-AppxPackage OpenAI.Codex
  → 校验 Store 签名（SignatureKind = 'Store'）
  → 校验包家族名、完整名、可执行文件路径
  → Test-DreamSkinCodexPortOwner（端口进程 = Codex.exe）
  → Get-DreamSkinCdpBrowserIdentity（BrowserId 验证）
  → Test-DreamSkinCdpPageTarget（目标 URL = app://*）
  → probeSession（DOM 标记验证）
```

### 4.2 路径遍历防护

```powershell
function Test-DreamSkinPathWithin {
  # 校验路径是否在受管目录内
  # 拒绝符号链接、接合点、外部路径
  # 拒绝路径遍历攻击（../）
}
```

### 4.3 原子文件操作

```powershell
function Write-DreamSkinUtf8FileAtomically {
  # 1. 写入临时文件 .filename.tmp
  # 2. 校验原文件未被修改（ExpectedBytes）
  # 3. System.IO.File.Replace（原子替换）
  # 4. 清理临时文件和备份
}
```

### 4.4 操作锁

```powershell
function Enter-DreamSkinOperationLock {
  # 使用命名 Mutex 防止并发操作
  # 自动处理 AbandonedMutexException
  # 所有操作 finally 中释放
}
```

### 4.5 执行策略安全

- 安装命令：一次性的 `Bypass`（用户明确发起）
- 快捷方式：`RemoteSigned`（受 PowerShel 策略约束）
- 不修改用户的持久执行策略
- 不绕过组策略

### 4.6 联网请求白名单

| 请求 | 目标 | 用途 |
|------|------|------|
| `http://127.0.0.1:{port}/json/list` | 回环 | 列出 CDP 页面目标 |
| `http://127.0.0.1:{port}/json/version` | 回环 | 获取浏览器版本和身份 |
| `ws://127.0.0.1:{port}/devtools/page/{id}` | 回环 | CDP WebSocket 通信 |
| `ws://127.0.0.1:{port}/devtools/browser/{id}` | 回环 | 浏览器身份锚点 |

**所有请求均绑定到回环地址，无外部网络请求。**

## 五、安全审计结论

**Codex Dream Skin 在安全方面表现优秀。** 项目遵循了最小权限原则、防御性编程和安全开发最佳实践。

**唯一需要用户注意的方面：**
- CDP 端口暴露期间，不要运行来路不明的本机程序
- 这是 Chromium 调试协议的设计限制，非本项目的缺陷

**建议：**
- 可以在文档中添加更醒目的安全提示
- 可以考虑在托盘图标上显示 "CDP 活跃" 状态提醒
