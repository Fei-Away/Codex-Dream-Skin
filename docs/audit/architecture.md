# 项目架构分析

## 一、技术栈

| 层 | 技术 | 版本要求 | 说明 |
|----|------|---------|------|
| 运行时 | Node.js | 22+ | 注入器核心，CDP 通信，图像元数据解析 |
| 编排层 | Windows PowerShell | 5.1+ | 安装、启动、恢复、托盘、主题管理 |
| 注入协议 | Chrome DevTools Protocol (CDP) | — | 通过 `127.0.0.1` 回环 WebSocket 注入 CSS/JS |
| 前端 | CSS + JavaScript | — | `dream-skin.css` 视觉层 + `renderer-inject.js` DOM 操作 |
| 配置格式 | TOML | — | `%USERPROFILE%\.codex\config.toml`（仅修改外观键） |
| 托盘 | Windows Forms | — | 系统托盘菜单（应用/暂停/换图/保存/切换/恢复） |

## 二、模块依赖关系

```
install-dream-skin.ps1
  ├── common-windows.ps1  包发现、Node 验证、运行时安装、端口所有权、进程安全
  └── theme-windows.ps1   主题存储、安全导入、暂停状态、预设种子

start-dream-skin.ps1
  ├── common-windows.ps1
  ├── theme-windows.ps1
  └── injector.mjs        CDP 连接、注入、验证、截图、移除
       ├── dream-skin.css
       ├── renderer-inject.js
       └── theme.json

restore-dream-skin.ps1
  ├── common-windows.ps1
  ├── theme-windows.ps1
  └── config-utf8.ps1     原子 TOML 读写、备份、恢复

tray-dream-skin.ps1
  ├── common-windows.ps1
  ├── theme-windows.ps1
  └── System.Windows.Forms

verify-dream-skin.ps1
  ├── common-windows.ps1
  └── injector.mjs

image-metadata.mjs        独立 CLI 图像解析（PNG/JPEG/WebP 尺寸校验）
```

## 三、启动流程

### 3.1 安装流程

```
用户运行 install-dream-skin.ps1
  │
  ▼
校验 Codex 包身份（Get-AppxPackage OpenAI.Codex → Store 签名）
  │
  ├─ 失败 → 抛出错误，提示从 Store 安装
  │
  ▼
校验 Node.js 版本（>= 22）
  │
  ├─ 失败 → 抛出错误，提示安装 Node.js
  │
  ▼
确认 Codex 已关闭
  │
  ├─ 未关闭 → 抛出错误，要求关闭
  │
  ▼
确认托盘未运行
  │
  ├─ 运行中 → 抛出错误，要求退出
  │
  ▼
复制 assets/ + scripts/ → %LOCALAPPDATA%\CodexDreamSkin\engine\（SHA-256 逐文件校验）
  │
  ├─ 校验失败 → 回滚，清理临时文件
  │
  ▼
Unblock-File 受管副本（仅 .ps1）
  │
  ▼
备份 config.toml → config.before-dream-skin.toml（原子 UTF-8 写入）
  │
  ▼
初始化主题仓库（active-theme / themes / images）
  │
  ▼
创建快捷方式（桌面 + 开始菜单，使用 RemoteSigned）
  │
  ▼
启动托盘进程（后台）
  │
  ▼
完成
```

### 3.2 启动流程

```
start-dream-skin.ps1（或桌面快捷方式）
  │
  ▼
检查 Codex 是否运行 + 是否有已存在的 CDP 会话
  │
  ├─ 运行中 + 无 CDP → 询问是否重启
  │   ├─ 取消 → 退出
  │   └─ 确认 → 关闭 Codex
  │
  ├─ 运行中 + 有 CDP → 验证身份后继续
  │
  └─ 未运行 → 继续
  │
  ▼
以 --remote-debugging-address=127.0.0.1 --remote-debugging-port=9335 启动 Codex
  │
  ▼
等待 CDP WebSocket 就绪（最多 45 秒，每 400ms 轮询）
  │
  ├─ 超时 → 回滚（关闭 Codex + 重新打开原生版本）
  │
  ▼
验证浏览器身份（BrowserId 一致性）
  │
  ▼
通过 injector.mjs 注入 CSS + renderer-inject.js
  │
  ├─ 注册 Page.addScriptToEvaluateOnNewDocument（导航/重载后自动恢复）
  │
  ▼
启动后台守护进程（--watch 模式，监听主题变化）
  │
  ▼
验证注入结果（截图 + DOM 结构检查）
  │
  ▼
完成
```

### 3.3 恢复流程

```
restore-dream-skin.ps1
  │
  ▼
验证 Codex 进程和端口所有者
  │
  ├─ 冲突 → 要求手动关闭
  │
  ▼
询问用户确认（如 -PromptRestart）
  │
  ├─ 取消 → 退出，无副作用
  │
  ▼
关闭托盘
  │
  ▼
关闭 Codex（先优雅关闭，超时 15 秒后强制关闭）
  │
  ▼
停止注入器守护进程（验证 PID + 命令行 + 端口 + BrowserId）
  │
  ▼
恢复 config.toml（还原备份，或恢复基础主题）
  │
  ▼
清理 state.json + paused 标记
  │
  ├─ 如 -Uninstall → 删除快捷方式
  │
  ▼
重新打开 Codex（无调试端口）
  │
  ▼
完成
```

## 四、配置文件设计

### 4.1 theme.json

```json
{
  "schemaVersion": 1,
  "id": "preset-arina-hashimoto",
  "name": "桥本有菜",
  "image": "dream-reference.jpg",
  "appearance": "auto",
  "art": {
    "focusX": 0.72,
    "focusY": 0.45,
    "safeArea": "left",
    "taskMode": "ambient"
  },
  "palette": {
    "accent": "#ff6b9d"
  }
}
```

### 4.2 state.json

```json
{
  "schemaVersion": 3,
  "platform": "windows",
  "port": 9335,
  "injectorPid": 12345,
  "injectorStartedAt": "2026-07-19T03:00:00.000Z",
  "injectorPath": "C:\\...\\injector.mjs",
  "nodePath": "C:\\Program Files\\nodejs\\node.exe",
  "nodeVersion": "22.0.0",
  "codexExe": "C:\\Program Files\\WindowsApps\\...\\ChatGPT.exe",
  "codexPackageRoot": "C:\\Program Files\\WindowsApps\\...",
  "codexPackageFullName": "OpenAI.Codex_1.0.0.0_x64__...",
  "codexPackageFamilyName": "OpenAI.Codex_...",
  "codexVersion": "1.0.0.0",
  "browserId": "ABC123...",
  "profilePath": null,
  "themeDir": "C:\\Users\\...\\CodexDreamSkin\\active-theme",
  "pauseFile": "C:\\Users\\...\\CodexDreamSkin\\paused",
  "createdAt": "2026-07-19T03:00:00.000Z"
}
```

### 4.3 文件路径

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

## 五、更新机制

**无自动更新。** 升级流程：

1. 关闭托盘（右键 → 退出托盘）
2. 关闭 Codex
3. `git pull` 拉取最新代码
4. 重新运行 `install-dream-skin.ps1`
5. 安装器原子替换 `engine` 目录，保留主题和图片

**特点：**
- 安装器不删除 `active-theme/`、`themes/`、`images/` 目录
- 旧引擎备份到 `.engine-backup-*` 后自动清理
- 并发安装被 Mutex 阻止

## 六、核心设计模式

### 6.1 原子写入

```
临时文件 .filename.tmp → System.IO.File.Replace → 目标文件 + .replace-backup
```

确保：
- 写入过程中崩溃不会留下半截文件
- 写入前校验文件未被外部修改（ExpectedBytes）
- 替换是操作系统级的原子操作

### 6.2 身份验证链

```
Codex Store 包身份 → CDP 端口所有者 → BrowserId → 目标页面标记
```

每个环节都验证后才允许注入

### 6.3 路径安全

所有文件操作前的安全检查：
- 无符号链接/接合点（`ReparsePoint`）
- 路径在受管目录内（`Test-DreamSkinPathWithin`）
- 路径不是根目录或系统目录

### 6.4 回滚机制

启动失败时自动执行：
1. 停止注入器
2. 关闭 Codex（强制）
3. 重新打开原生 Codex
4. 恢复暂停状态
