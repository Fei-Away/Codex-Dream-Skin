# 维护指南

## 一、升级流程

### 1.1 标准升级

```powershell
# 1. 退出托盘（右键 → 退出托盘）
# 2. 关闭 Codex
# 3. 更新仓库代码
git pull
# 4. 重新运行安装脚本
cd e:\Dev\Projects\Codex-Dream-Skin-main\windows
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dream-skin.ps1
```

### 1.2 升级说明

| 项目 | 说明 |
|------|------|
| 引擎文件 | 原子替换，SHA-256 校验，旧引擎备份后自动清理 |
| 主题和图片 | 保留（active-theme、themes、images 目录不被删除） |
| 快捷方式 | 自动更新指向新引擎路径 |
| 配置文件 | 保留（config.before-dream-skin.toml 不被删除） |
| 已保存状态 | 保留（state.json 在下次启动时自动更新 schema） |

### 1.3 升级前检查

```powershell
# 检查是否有未提交的更改
git status

# 如果有冲突，先解决冲突
git stash
git pull
git stash pop
```

---

## 二、主题管理

### 2.1 主题文件结构

```
%LOCALAPPDATA%\CodexDreamSkin\
├── active-theme\           # 当前激活的主题
│   ├── theme.json          # 主题元数据
│   └── background.jpg      # 背景图片
├── themes\                 # 已保存的主题
│   ├── 桥本有菜\
│   │   ├── theme.json
│   │   └── background.jpg
│   └── 自定义主题名称\
│       ├── theme.json
│       └── background.jpg
└── images\                 # 导入的图片归档
    ├── original-image-1.jpg
    └── original-image-2.png
```

### 2.2 手动添加主题

1. 创建主题目录：`%LOCALAPPDATA%\CodexDreamSkin\themes\主题名称\`
2. 放入背景图片（PNG/JPG/WebP，≤16MB，≤16384px，≤50MP）
3. 创建 `theme.json`：

```json
{
  "schemaVersion": 1,
  "id": "custom-theme",
  "name": "自定义主题名称",
  "image": "background.jpg",
  "appearance": "auto",
  "art": {
    "focusX": 0.5,
    "focusY": 0.5,
    "safeArea": "left",
    "taskMode": "ambient"
  },
  "palette": {
    "accent": "#ff6b9d"
  }
}
```

4. 从托盘菜单 "已保存主题" 中选择即可应用

### 2.3 主题参数说明

| 参数 | 类型 | 说明 | 建议值 |
|------|------|------|--------|
| `appearance` | string | 外观模式 | `auto`（跟随系统）、`light`、`dark` |
| `art.focusX` | float | 焦点 X 坐标（0-1） | 0.5 (居中) |
| `art.focusY` | float | 焦点 Y 坐标（0-1） | 0.5 (居中) |
| `art.safeArea` | string | 安全区域方向 | `left`、`right` |
| `art.taskMode` | string | 任务模式 | `banner`（超宽图）、`ambient`（普通图） |
| `palette.accent` | string | 强调色 | 自动从图片生成，可手动指定 |

### 2.4 主题备份

```powershell
# 备份所有主题和图片
$backupDir = "$env:USERPROFILE\Desktop\CodexDreamSkin-Backup"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item "$env:LOCALAPPDATA\CodexDreamSkin\themes" -Destination $backupDir -Recurse
Copy-Item "$env:LOCALAPPDATA\CodexDreamSkin\images" -Destination $backupDir -Recurse
Write-Host "主题已备份到: $backupDir"
```

---

## 三、Codex 版本适配

### 3.1 检测适配问题

```powershell
# 运行验证脚本
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "%LOCALAPPDATA%\CodexDreamSkin\engine\scripts\verify-dream-skin.ps1" `
  -ScreenshotPath "$env:TEMP\codex-dream-skin.png"

# 检查日志
Get-Content "$env:LOCALAPPDATA\CodexDreamSkin\verify.log" -Tail 20
```

### 3.2 常见适配问题

| 问题 | 原因 | 修复方法 |
|------|------|---------|
| 选择器失效 | Codex DOM 结构变化 | 更新 `renderer-inject.js` 中的 CSS 选择器 |
| 注入时机不对 | Codex 加载流程变化 | 更新 `injector.mjs` 中的注入等待逻辑 |
| 样式冲突 | Codex 新增 CSS 类 | 更新 `dream-skin.css` 中的样式覆盖 |

### 3.3 适配流程

1. 确认 Codex 更新了 DOM 结构
2. 使用浏览器 DevTools 检查新的 DOM 结构
3. 更新 `renderer-inject.js` 中的选择器
4. 更新 `dream-skin.css` 中的样式
5. 运行测试套件验证
6. 提交 PR 到项目仓库

---

## 四、长期维护策略

### 4.1 定期检查

| 频率 | 检查项 | 命令 |
|------|--------|------|
| 每周 | 检查项目更新 | `git remote update && git status` |
| 每月 | 验证皮肤状态 | 运行验证脚本 |
| 每月 | 清理日志文件 | `Remove-Item "$env:LOCALAPPDATA\CodexDreamSkin\*.log" -Force` |
| 每季度 | 清理旧图片 | 检查 `images\` 目录，删除不需要的图片 |
| Codex 更新后 | 重新安装皮肤 | 重新运行安装脚本 |

### 4.2 磁盘空间管理

```powershell
# 查看状态目录大小
$dir = "$env:LOCALAPPDATA\CodexDreamSkin"
$size = (Get-ChildItem -Path $dir -Recurse -Force | Measure-Object -Property Length -Sum).Sum
Write-Host "状态目录大小: $([math]::Round($size / 1MB, 2)) MB"

# 查看图片目录大小
$imgDir = Join-Path $dir 'images'
if (Test-Path $imgDir) {
  $imgSize = (Get-ChildItem -Path $imgDir -Recurse -Force | Measure-Object -Property Length -Sum).Sum
  Write-Host "图片目录大小: $([math]::Round($imgSize / 1MB, 2)) MB"
}
```

### 4.3 日志轮转

```powershell
# 清理超过 30 天的日志
$logs = @(
  "$env:LOCALAPPDATA\CodexDreamSkin\injector.log",
  "$env:LOCALAPPDATA\CodexDreamSkin\injector-error.log",
  "$env:LOCALAPPDATA\CodexDreamSkin\verify.log"
)
foreach ($log in $logs) {
  if (Test-Path $log) {
    $file = Get-Item $log
    if ($file.LastWriteTime -lt (Get-Date).AddDays(-30)) {
      Remove-Item $log -Force
      Write-Host "已清理旧日志: $log"
    }
  }
}
```

### 4.4 备份与恢复

**备份配置：**
```powershell
# 一键备份所有皮肤数据
$timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$backupDir = "$env:USERPROFILE\CodexDreamSkin-Backup-$timestamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item "$env:LOCALAPPDATA\CodexDreamSkin\*" -Destination $backupDir -Recurse -Exclude @('*.log', 'state.json')
Write-Host "备份完成: $backupDir"
```

**恢复备份：**
```powershell
# 从备份恢复
$backupDir = "$env:USERPROFILE\CodexDreamSkin-Backup-20260719-120000"
Copy-Item "$backupDir\*" -Destination "$env:LOCALAPPDATA\CodexDreamSkin" -Recurse -Force
Write-Host "恢复完成"
```

---

## 五、故障自愈能力

### 5.1 自动恢复机制

| 场景 | 自动行为 |
|------|---------|
| Codex 页面重载 | 注入器自动重新注入（早期注册脚本） |
| 主题文件变化 | Watch 模式检测变化并重新注入 |
| 注入器崩溃 | 记录错误日志，下次启动时自动清理 stale state |
| 导航到新页面 | 自动注入新页面 |

### 5.2 手动恢复时机

| 场景 | 操作 |
|------|------|
| 皮肤显示异常 | 托盘菜单 → 应用或重新应用 |
| 换图后未生效 | 托盘菜单 → 应用或重新应用 |
| 暂停后恢复 | 托盘菜单 → 继续显示皮肤 |
| 完全不要皮肤 | 托盘菜单 → 完全恢复 Codex |

---

## 六、安全建议

### 6.1 使用期间

- 运行皮肤期间不要运行来路不明的本机程序
- 皮肤使用后建议运行恢复脚本关闭 CDP 会话
- 不要将调试端口暴露到公网

### 6.2 长期使用

- 定期检查项目更新，确保兼容最新版 Codex
- 定期备份主题和配置
- 关注 GitHub Issues 了解已知问题和修复

### 6.3 停止使用

如果决定不再使用：
1. 运行恢复脚本恢复官方界面
2. 运行卸载选项删除快捷方式
3. 手动删除 `%LOCALAPPDATA%\CodexDreamSkin` 目录
4. 删除桌面快捷方式

---

## 七、与 Codex 官方更新的兼容性

### 7.1 更新类型分析

| 更新类型 | 影响 | 处理方式 |
|---------|------|---------|
| Codex 小版本更新（补丁） | 通常无影响 | 无需操作 |
| Codex 大版本更新 | 可能 DOM 结构变化 | 重新运行安装脚本 |
| Node.js 版本更新 | 无影响 | 无需操作 |
| 操作系统更新 | 无影响 | 无需操作 |

### 7.2 失效检测

- 验证脚本提供自动化检测
- 建议每周运行一次验证
- Codex 更新后立即运行验证

### 7.3 失效后的处理

1. 运行恢复脚本回到官方界面
2. 检查项目是否有更新
3. 如果项目未更新，提交 Issue 或等待修复
4. 在此期间可以使用官方 Codex
