# Custom desktop pets on Windows / Windows 自定义桌宠

Codex already owns the desktop-pet window, drag behavior, always-on-top state, and animation runtime. Dream Skin only needs to keep that auxiliary window transparent and place a validated custom pet package in Codex's per-user pet directory. It does not patch `app.asar`, `WindowsApps`, signatures, authentication, or `config.toml`.

Codex 已经负责桌宠窗口、拖动、置顶与动画运行时。Dream Skin 只需保证辅助窗口透明，并把通过校验的自定义桌宠包安装到 Codex 的用户级目录；不修改 `app.asar`、`WindowsApps`、签名、账号或 `config.toml`。

## Package contract / 包格式

Create one directory with exactly these runtime files:

```text
my-pet/
  pet.json
  spritesheet.webp
```

`pet.json` uses the v2 contract:

```json
{
  "id": "my-pet",
  "displayName": "My Pet",
  "description": "A short description.",
  "spriteVersionNumber": 2,
  "spritesheetPath": "spritesheet.webp"
}
```

The spritesheet must be a transparent WebP atlas that is exactly `1536 x 2288`: eight `192 x 208` cells across and eleven rows down. Rows 0-8 contain the standard Codex animation states; rows 9-10 contain the 16 clockwise look directions required by v2. Use Codex's Hatch Pet workflow to generate and visually validate the atlas instead of assembling unreviewed frames by hand.

精灵图必须是带透明通道的 WebP，尺寸严格为 `1536 x 2288`：横向 8 个 `192 x 208` 单元格、纵向 11 行。第 0-8 行是 Codex 标准动画状态，第 9-10 行是 v2 所需的 16 个顺时针注视方向。建议用 Codex 的 Hatch Pet 流程生成并完成视觉校验，不要直接拼接未经检查的单帧。

Only package artwork and characters that you are allowed to use and redistribute. This repository intentionally does not bundle third-party anime, game, celebrity, customer, or private-person pet art.

仅打包你有权使用和再分发的角色素材。本仓库不会随附第三方动漫、游戏、名人、客户或私人形象桌宠。

## Validate and install / 校验与安装

Node.js 22 or newer is required, matching the Windows Dream Skin runtime requirement.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\manage-pet-package.ps1 `
  -PackagePath C:\absolute\path\to\my-pet
```

The installer checks strict UTF-8 JSON, a safe lowercase pet ID, the exact v2 manifest, regular files with no link escape, the 16 MB limit, the `1536 x 2288` atlas geometry, and a declared WebP alpha channel. It copies only `pet.json` and `spritesheet.webp`, validates the staged copy again, and publishes it by same-volume directory rename under `%CODEX_HOME%\pets` or `%USERPROFILE%\.codex\pets`.

安装器会检查严格 UTF-8 JSON、安全的小写 ID、精确 v2 manifest、无链接逃逸的普通文件、16 MB 上限、`1536 x 2288` 图集尺寸以及 WebP 透明通道。它只复制 `pet.json` 与 `spritesheet.webp`，再次校验暂存副本，然后通过同卷目录重命名发布到 `%CODEX_HOME%\pets` 或 `%USERPROFILE%\.codex\pets`。

To update an existing pet with the same ID:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\manage-pet-package.ps1 `
  -PackagePath C:\absolute\path\to\my-pet -Replace
```

After installation, open **Codex Settings > Pets**, choose **Refresh**, then select the custom pet. The script does not silently change the active pet.

安装后打开 **Codex 设置 > Pets**，点击 **Refresh**，再选择自定义桌宠。脚本不会静默切换当前桌宠。

## Remove / 移除

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\manage-pet-package.ps1 `
  -Remove my-pet
```

Removal accepts only a validated pet ID, moves the exact package to a managed tombstone, deletes it, and rolls back the rename if deletion fails. Select another pet in Codex first if the package is currently active.

移除仅接受通过格式校验的桌宠 ID；脚本会先把精确目标移动到受管临时目录，删除失败时恢复原目录。如果该桌宠正在使用，请先在 Codex 中选择另一个桌宠。

## Skin compatibility / 皮肤兼容

Dream Skin's renderer guard applies the theme only when both `main.main-surface` and `aside.app-shell-left-panel` exist. The `/avatar-overlay` auxiliary document has neither full-shell marker, so stale theme classes, background variables, styles, and decoration nodes are removed while the pet window remains transparent.

Dream Skin 渲染保护只会在同时出现 `main.main-surface` 和 `aside.app-shell-left-panel` 时启用主题。`/avatar-overlay` 辅助 document 不具备完整主界面标记，因此会清理残留主题 class、背景变量、样式和装饰节点，让桌宠窗口继续保持透明。
