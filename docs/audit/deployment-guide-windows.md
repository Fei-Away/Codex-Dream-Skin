# Windows 10 部署指南（中文版）

## 一、前置条件检查

### 1.1 系统要求

| 组件 | 要求 | 验证命令 |
|------|------|---------|
| 操作系统 | Windows 10 21H2+ 或 Windows 11 | `winver` |
| PowerShell | 5.1+ | `$PSVersionTable.PSVersion` |
| Node.js | 22+ | `node --version` |
| Codex | Microsoft Store 官方安装 | `Get-AppxPackage -Name OpenAI.Codex` |

### 1.2 检查清单

```powershell
# 1. 检查 Node.js 版本
node --version
# 输出示例：v22.0.0

# 2. 检查 Codex 是否已安装且为 Store 版本
Get-AppxPackage -Name OpenAI.Codex | Select-Object Name, Version, SignatureKind, InstallLocation

# 3. 检查 PowerShell 版本
$PSVersionTable.PSVersion

# 4. 确认 Codex 未运行
Get-Process -Name ChatGPT -ErrorAction SilentlyContinue
# 如果返回进程，请先关闭 Codex
```

### 1.3 如果缺少依赖

**安装 Node.js：**
1. 访问 https://nodejs.org/ 下载 LTS 22.x 版本
2. 运行安装程序（默认选项即可）
3. 重新打开 PowerShell 窗口
4. 验证：`node --version`

**安装 Codex：**
1. 打开 Microsoft Store
2. 搜索 "Codex" 或访问 https://apps.microsoft.com/detail/OpenAI.Codex
3. 点击安装
4. 安装完成后至少运行一次 Codex，完成初始化

---

## 二、安装步骤

### 2.1 标准安装

```powershell
# 1. 打开 PowerShell（建议以管理员身份运行，但不是必须）
# 2. 进入仓库目录
cd e:\Dev\Projects\Codex-Dream-Skin-main\windows

# 3. 运行安装脚本
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dream-skin.ps1
```

安装过程：
- ✅ 校验 Codex 包身份
- ✅ 校验 Node.js 版本
- ✅ 复制运行时文件到 `%LOCALAPPDATA%\CodexDreamSkin\engine\`
- ✅ 备份 `config.toml`
- ✅ 初始化主题仓库
- ✅ 创建桌面快捷方式
- ✅ 创建开始菜单快捷方式
- ✅ 启动系统托盘（后台）

### 2.2 自定义端口安装

如果默认端口 9335 被占用：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dream-skin.ps1 -Port 9444
```

端口范围：1024-65535

### 2.3 不创建快捷方式安装

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dream-skin.ps1 -NoShortcuts
```

---

## 三、启动与使用

### 3.1 启动皮肤

**推荐方式：桌面快捷方式**
- 双击桌面 `Codex Dream Skin` 快捷方式
- 如果 Codex 正在运行，会询问是否重启
- 如果 Codex 未运行，会自动启动并注入皮肤

**命令行方式：**
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "%LOCALAPPDATA%\CodexDreamSkin\engine\scripts\start-dream-skin.ps1" `
  -PromptRestart
```

### 3.2 验证注入状态

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "%LOCALAPPDATA%\CodexDreamSkin\engine\scripts\verify-dream-skin.ps1" `
  -ScreenshotPath "$env:TEMP\codex-dream-skin.png"
```

验证脚本会检查：
- CDP 端点只绑定 `127.0.0.1`
- CDP 端点属于当前官方 Codex 包
- 页面已加载皮肤
- 原生侧栏和输入框仍然存在
- 装饰层不拦截鼠标事件
- 首页主题结构已正确加载

### 3.3 系统托盘使用

双击桌面 `Codex Dream Skin - Tray` 打开系统托盘：

| 菜单项 | 功能 |
|--------|------|
| 状态：运行中 / 已暂停 / 未运行 | 显示当前状态 |
| 应用或重新应用 | 应用或重新应用皮肤 |
| 暂停皮肤 / 继续显示皮肤 | 暂停或恢复皮肤显示 |
| 更换背景图 | 选择新的背景图片 |
| 保存当前主题 | 保存当前主题到已保存主题列表 |
| 已保存主题 | 切换已保存的不同主题 |
| 打开图片文件夹 | 打开已导入图片的文件夹 |
| 完全恢复 Codex | 恢复官方外观并关闭 CDP 会话 |
| 退出托盘 | 仅退出托盘程序 |

### 3.4 更换背景图

1. 从托盘菜单选择 "更换背景图"
2. 选择 PNG、JPG 或 WebP 格式的图片
3. 图片要求：
   - 必须是纯背景（不含 UI 元素）
   - 上限 16 MB
   - 宽高不超过 16384 像素
   - 总像素不超过 5000 万
   - 推荐分辨率：2560 × 1440 (16:9)

---

## 四、主题管理

### 4.1 保存当前主题

1. 调整好背景图后
2. 从托盘菜单选择 "保存当前主题"
3. 输入主题名称
4. 主题保存在 `%LOCALAPPDATA%\CodexDreamSkin\themes\`

### 4.2 切换已保存主题

1. 从托盘菜单选择 "已保存主题"
2. 选择要应用的主题
3. 主题会立即应用

### 4.3 删除已保存主题

手动删除 `%LOCALAPPDATA%\CodexDreamSkin\themes\` 下的对应目录

### 4.4 预设主题

安装时默认包含：
- **桥本有菜**（Arina Hashimoto）：预设主题，已预置在已保存主题中

---

## 五、恢复与卸载

### 5.1 恢复官方外观（保留安装）

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "%LOCALAPPDATA%\CodexDreamSkin\engine\scripts\restore-dream-skin.ps1" `
  -RestoreBaseTheme -PromptRestart
```

### 5.2 完全卸载

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "%LOCALAPPDATA%\CodexDreamSkin\engine\scripts\restore-dream-skin.ps1" `
  -RestoreBaseTheme -PromptRestart -Uninstall
```

这会：
1. 恢复官方外观
2. 关闭 CDP 会话
3. 删除所有快捷方式
4. 保留 `%LOCALAPPDATA%\CodexDreamSkin\` 目录（主题和图片）

### 5.3 完整恢复配置（配置损坏时）

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "%LOCALAPPDATA%\CodexDreamSkin\engine\scripts\restore-dream-skin.ps1" `
  -RecoverConfigBackup -PromptRestart
```

### 5.4 手动清理残余文件

如果手动删除后仍有残留：

```powershell
# 删除状态文件
Remove-Item -Path "$env:LOCALAPPDATA\CodexDreamSkin" -Recurse -Force -ErrorAction SilentlyContinue

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

## 六、升级

### 6.1 升级步骤

```powershell
# 1. 退出托盘（右键 → 退出托盘）
# 2. 关闭 Codex
# 3. 更新仓库代码
git pull
# 4. 重新运行安装脚本
cd e:\Dev\Projects\Codex-Dream-Skin-main\windows
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dream-skin.ps1
```

### 6.2 升级说明

- 安装器会原子替换 `engine` 目录
- 当前主题、已保存主题、导入图片不会被删除
- 旧引擎备份到 `.engine-backup-*` 后自动清理
- 快捷方式会自动更新指向新引擎路径

---

## 七、优化版一键安装脚本

仓库提供了优化版的一键脚本 `setup-dream-skin.ps1`，位于仓库根目录的 `scripts/` 目录下。

### 7.1 一键安装

```powershell
# 从仓库根目录运行
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\setup-dream-skin.ps1
```

### 7.2 一键卸载

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall-dream-skin.ps1
```

### 7.3 PowerShell Profile 辅助

```powershell
# 将以下内容添加到你的 PowerShell Profile 中
# 或直接运行：
. scripts\dream-skin-profile.ps1
```

---

## 八、文件位置汇总

| 用途 | 路径 |
|------|------|
| 状态根目录 | `%LOCALAPPDATA%\CodexDreamSkin` |
| 运行时引擎 | `%LOCALAPPDATA%\CodexDreamSkin\engine` |
| 当前主题 | `%LOCALAPPDATA%\CodexDreamSkin\active-theme` |
| 已保存主题 | `%LOCALAPPDATA%\CodexDreamSkin\themes` |
| 导入图片归档 | `%LOCALAPPDATA%\CodexDreamSkin\images` |
| 会话状态 | `%LOCALAPPDATA%\CodexDreamSkin\state.json` |
| 暂停标记 | `%LOCALAPPDATA%\CodexDreamSkin\paused` |
| 注入器日志 | `%LOCALAPPDATA%\CodexDreamSkin\injector.log` |
| 注入器错误日志 | `%LOCALAPPDATA%\CodexDreamSkin\injector-error.log` |
| 验证日志 | `%LOCALAPPDATA%\CodexDreamSkin\verify.log` |
| 配置备份 | `%LOCALAPPDATA%\CodexDreamSkin\config.before-dream-skin.toml` |
| Codex 配置 | `%USERPROFILE%\.codex\config.toml` |
