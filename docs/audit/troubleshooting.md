# 故障排查手册

## 一、常见问题速查

| 问题 | 原因 | 解决方法 |
|------|------|---------|
| "Node.js 22 或更高版本未找到" | Node 未安装或不在 PATH | 安装 Node.js 22+，重启 PowerShell |
| "官方 OpenAI.Codex Store 包未安装" | 未从 Store 安装 Codex | 从 Microsoft Store 安装 Codex |
| "安装前请关闭 Codex" | Codex 仍在运行 | 关闭所有 Codex 窗口（任务管理器确认） |
| "托盘已存在，请先退出" | 托盘进程仍在运行 | 运行恢复脚本或手动结束托盘进程 |
| "CDP 端点未在 45 秒内就绪" | Codex 启动异常 | 检查端口占用，重新运行 |
| "验证失败" | 注入未生效或 DOM 结构变化 | 检查截图，运行恢复后重新安装 |
| "Codex 更新后皮肤失效" | DOM 结构变化 | 重新运行安装脚本 |
| "端口 9335 已被占用" | 其他程序在使用该端口 | 自动扫描或手动指定 `-Port` |
| "无法停止注入器" | 进程身份不匹配 | 手动结束进程，清理 state.json |
| "配置恢复失败" | 备份文件损坏或编码不一致 | 使用 `-RecoverConfigBackup` 完整恢复 |

---

## 二、详细排查步骤

### 2.1 安装失败

#### 错误：Node.js 版本不满足要求

**检查：**
```powershell
node --version
# 需要输出 v22.x.x 或更高

# 如果 node 命令不可用：
where.exe node
# 应该返回 Node.js 安装路径
```

**解决：**
1. 从 https://nodejs.org/ 下载 Node.js 22.x LTS
2. 运行安装程序（勾选 "Add to PATH"）
3. 重新打开 PowerShell 窗口
4. 验证：`node --version`

#### 错误：Codex 包未找到

**检查：**
```powershell
Get-AppxPackage -Name OpenAI.Codex
# 如果有输出，说明已安装
# 如果没有输出，需要从 Store 安装

# 检查是否从 Store 安装（非开发版）：
(Get-AppxPackage -Name OpenAI.Codex).SignatureKind
# 应该输出 'Store'
```

**解决：**
1. 打开 Microsoft Store
2. 搜索 "Codex"
3. 点击安装
4. 安装后至少运行一次 Codex 完成初始化

#### 错误：安装脚本卡住或超时

**检查：**
```powershell
# 检查操作锁是否被占用
# 重启 PowerShell 或重启电脑可清除

# 检查临时文件残留
Get-ChildItem "$env:LOCALAPPDATA\CodexDreamSkin\.engine-*" -ErrorAction SilentlyContinue
# 如果有残留，手动删除
Remove-Item "$env:LOCALAPPDATA\CodexDreamSkin\.engine-*" -Recurse -Force -ErrorAction SilentlyContinue
```

### 2.2 启动失败

#### 错误：Codex 无法启动

**检查：**
```powershell
# 查看注入器日志
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\injector.log" -Tail 20
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\injector-error.log" -Tail 20

# 检查端口是否被占用
netstat -ano | findstr ":9335"
```

**解决：**
1. 关闭所有 Codex 进程
2. 检查端口占用：`netstat -ano | findstr ":9335"`
3. 如果端口被占用，使用 `-Port` 指定其他端口
4. 重新运行启动脚本

#### 错误：CDP 端点未就绪

**检查：**
```powershell
# 直接查询 CDP 端点
curl http://127.0.0.1:9335/json/version -UseBasicParsing -ErrorAction SilentlyContinue
# 如果有输出，说明 CDP 已就绪

# 检查端口监听
netstat -ano | findstr ":9335"
```

**解决：**
1. 等待 45 秒自动重试
2. 如果超时，检查 Codex 是否正常启动
3. 检查是否有安全软件阻止端口绑定
4. 尝试使用其他端口：`-Port 9444`

### 2.3 验证失败

#### 错误：皮肤未正确注入

**检查：**
```powershell
# 查看验证日志
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\verify.log" -Tail 20

# 查看截图
# 检查 $env:TEMP\codex-dream-skin.png 确认皮肤显示状态
```

**常见原因：**
1. Codex DOM 结构变化，选择器失效
2. 网络延迟导致注入时机不对
3. 主题文件损坏

**解决：**
1. 重新运行启动脚本（强制重新注入）
2. 如果持续失败，运行恢复脚本回到官方界面
3. 检查项目是否有更新

### 2.4 运行时异常

#### 问题：皮肤突然消失

**可能原因：**
1. Codex 页面导航/重载
2. 注入器守护进程崩溃
3. 主题文件被修改

**自动恢复：**
- 注入器 watch 模式会自动检测页面重载并重新注入
- 如果注入器崩溃，重新运行启动脚本

#### 问题：托盘图标不显示

**解决：**
1. 重启 Windows 资源管理器（任务管理器 → 重启 "Windows 资源管理器"）
2. 或重新运行托盘脚本

#### 问题：鼠标事件被拦截

**原因：** 装饰层 `pointer-events` 设置不正确

**解决：**
1. 暂停皮肤（托盘菜单 → "暂停皮肤"）
2. 检查是否有皮肤更新
3. 运行恢复脚本回到官方界面

---

## 三、日志位置

| 日志类型 | 路径 | 用途 |
|---------|------|------|
| 注入器标准输出 | `%LOCALAPPDATA%\CodexDreamSkin\injector.log` | 注入器运行日志 |
| 注入器错误输出 | `%LOCALAPPDATA%\CodexDreamSkin\injector-error.log` | 注入器错误日志 |
| 验证日志 | `%LOCALAPPDATA%\CodexDreamSkin\verify.log` | 验证脚本输出 |
| 会话状态 | `%LOCALAPPDATA%\CodexDreamSkin\state.json` | 当前会话记录 |
| 配置备份 | `%LOCALAPPDATA%\CodexDreamSkin\config.before-dream-skin.toml` | 安装前配置备份 |
| 安装日志 | `%LOCALAPPDATA%\CodexDreamSkin\engine\scripts\install-dream-skin.ps1` | 运行脚本输出到控制台 |

**查看日志：**
```powershell
# 查看最后 20 行日志
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\injector.log" -Tail 20

# 实时跟踪日志
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\injector.log" -Tail 5 -Wait

# 检查错误日志
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\injector-error.log" -Tail 20

# 查看会话状态
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\state.json" | ConvertFrom-Json | Format-List
```

---

## 四、紧急恢复流程

### 4.1 一键恢复

```powershell
# 从仓库目录运行
cd e:\Dev\Projects\Codex-Dream-Skin-main\windows
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-dream-skin.ps1 `
  -RestoreBaseTheme -PromptRestart
```

### 4.2 完整恢复（配置损坏）

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-dream-skin.ps1 `
  -RecoverConfigBackup -PromptRestart
```

### 4.3 完全卸载

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-dream-skin.ps1 `
  -RestoreBaseTheme -PromptRestart -Uninstall
```

### 4.4 手动恢复（脚本不可用时）

```powershell
# 1. 关闭所有 Codex 进程
Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. 关闭注入器进程
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -match 'injector.mjs'
} | Stop-Process -Force

# 3. 恢复配置备份
$backup = "$env:LOCALAPPDATA\CodexDreamSkin\config.before-dream-skin.toml"
$config = "$env:USERPROFILE\.codex\config.toml"
if (Test-Path $backup) {
  Copy-Item -Path $backup -Destination $config -Force
}

# 4. 清理状态文件
Remove-Item "$env:LOCALAPPDATA\CodexDreamSkin\state.json" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\CodexDreamSkin\paused" -Force -ErrorAction SilentlyContinue

# 5. 重新打开 Codex（正常模式）
Start-Process "$env:LOCALAPPDATA\Microsoft\WindowsApps\ChatGPT.exe"
```

### 4.5 卸载后清理

```powershell
# 删除状态目录
Remove-Item "$env:LOCALAPPDATA\CodexDreamSkin" -Recurse -Force -ErrorAction SilentlyContinue

# 删除快捷方式
$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
@(
  (Join-Path $desktop 'Codex Dream Skin.lnk'),
  (Join-Path $desktop 'Codex Dream Skin - Restore.lnk'),
  (Join-Path $desktop 'Codex Dream Skin - Tray.lnk'),
  (Join-Path $startMenu 'Codex Dream Skin.lnk'),
  (Join-Path $startMenu 'Codex Dream Skin - Tray.lnk')
) | ForEach-Object { Remove-Item -Path $_ -Force -ErrorAction SilentlyContinue }
```

---

## 五、诊断命令汇总

```powershell
# 1. 环境检查
node --version
$PSVersionTable.PSVersion
Get-AppxPackage -Name OpenAI.Codex | Select-Object Name, Version, SignatureKind

# 2. 状态检查
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\state.json" -ErrorAction SilentlyContinue | ConvertFrom-Json
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\injector.log" -Tail 10 -ErrorAction SilentlyContinue
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\injector-error.log" -Tail 10 -ErrorAction SilentlyContinue

# 3. 进程检查
Get-Process -Name ChatGPT, node -ErrorAction SilentlyContinue

# 4. 端口检查
netstat -ano | findstr ":9335"

# 5. CDP 端点检查
curl http://127.0.0.1:9335/json/version -UseBasicParsing -ErrorAction SilentlyContinue
curl http://127.0.0.1:9335/json/list -UseBasicParsing -ErrorAction SilentlyContinue
```

---

## 六、获取帮助

- **项目 README**：查看 `windows/README.md` 和 `windows/README.en.md`
- **运行时说明**：查看 `windows/references/runtime-notes.md`
- **QA 清单**：查看 `windows/references/qa-inventory.md`
- **GitHub Issues**：访问项目仓库的 Issues 页面
- **提交 Issue 前**：请先收集日志文件（`injector.log`、`injector-error.log`、`state.json`）
