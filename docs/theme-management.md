# 本机主题管理 / Local theme management

## 使用入口

- macOS：菜单栏 → **透明度**。二级选择区域，三级调节滑块、直接输入数值或单独“跟随主题”；点击“跟随主题”会留在当前子菜单。**主题 → 删除已保存主题…**列出本机主题。
- Windows：桌面／开始菜单 → **Codex Dream Skin**，或双击托盘图标。原生窗口提供四项透明度和已保存主题删除；切换、导入主题仍使用现有托盘。

透明度范围为 0–100%；0% 不透明，100% 全透明。四个区域依次为完整左侧栏（图标栏与目录）、会话消息卡片、输入框和其他背景。会话与输入框各有未选中、选中两项独立数值：会话卡片悬停或内部获得焦点时算选中，输入框获得焦点时算选中。关闭“启用区域透明度”会暂时使四处背景不透明；开启“全部跟随主题”会暂时使用主题设定，两种模式都保留自定义值。直接调节任一项会启用透明度并退出全部跟随。每项只改变对应背景，文字和图标不随之变淡；可单独点“跟随主题”清除该项用户覆盖。优先级为用户按主题保存的该项设置 → 作者在 `theme.json.surfaceTransparency` 中明确设置的值 → 默认 37%。选中项在主题未单独指定时沿用作者的未选中值；其他背景对应 `general`，不再从 `colors.panel` 的颜色透明通道推算。主题包不会被改写。

删除需确认主题名称，之后将该主题的本机保存目录移到系统废纸篓／回收站。正在使用的主题需先切换；导入或切换进行中时暂不删除。原始 ZIP、当前主题快照、恢复备份和社区发布记录保留。透明度偏好也保留，以便重新导入或恢复主题时继续使用。

## English

On macOS, open the menu bar **Transparency** menu for area controls; each area opens a slider submenu. Use **Themes → Delete saved theme…** for local theme deletion. On Windows, open **Codex Dream Skin** from the desktop or Start Menu, or double-click
the tray icon. The existing tray still handles imports and theme
switching.

Transparency ranges from 0% (opaque) to 100% (transparent). The four per-theme
areas are the complete left sidebar (icon rail and directory), conversation
message cards, input box, and other backgrounds. Conversation cards and the input
box each have independent unselected and selected values. Hover or focus within
a card selects it; focus within the input box selects it. Sliders and direct
0–100 number entry are available, and each **Follow theme** control clears only
that state's local override. Local settings take priority over the author's value.
Absent author and user values default to 37%; a selected state inherits the
author's unselected value when no separate author value exists. Other backgrounds
use `surfaceTransparency.general` when provided; the `colors.panel` alpha no longer
sets that control. Text, icons and source packages remain unchanged.
Turning off **Enable area transparency** temporarily makes all four backgrounds opaque.
**Follow theme for all areas** temporarily uses the theme's values. Both modes
preserve custom slider values; moving a slider restores custom mode.

Deleting requires confirmation and moves only the selected saved theme directory
to Trash or Recycle Bin. Switch away from the current theme before deleting it.
Source ZIPs, active snapshots, recovery backups, community publications and
per-theme preferences are retained. Restore the directory from Trash or Recycle
Bin to undo deletion.

## Candidate acceptance / 候选版本验收

Use the candidate commit's CI Setup/DMG artifacts. Confirm the installed app and
engine come from the same candidate; a matching version number alone is not enough.

1. Launch the Windows desktop and Start Menu shortcuts, then double-click the tray.
   All must open the same native manager; repeated clicks restore its existing window.
   Confirm no PowerShell theme-selection window appears. Verify it opens without an installed
   .NET runtime. Check Chinese/English, keyboard focus and 100%/150% display scaling.
2. With Codex visible, move each of the four sliders to 0%, a middle value, and
   100%; verify only its named background changes. The sidebar test must include
   the icon rail and directory. Focus the input box and verify it is opaque.
   Switch themes and restart the manager; each area's setting must persist.
   Reset one area with Follow theme and verify the other three stay unchanged.
3. Import a disposable test theme. Cancel deletion: files and list entry remain.
   Confirm deletion: it disappears from saved themes and appears in the OS Trash
   or Recycle Bin. Restore it and reopen the menu/window: it is available again.
4. Try deleting the current theme, including when it becomes current while the
   confirmation is open. It must remain. Check concurrent import/switch handling
   and that a failed recycle operation does not report success.
5. Verify the original ZIP, active theme, recovery files and unrelated saved
   themes remain. On Windows, verify the installed shortcut after an upgrade and
   that normal uninstall still retains saved themes.

Windows core and native integration commands are in
[the native manager README](../windows/theme-manager/README.md). The normal macOS
Swift test target includes deletion cases; CI also builds both platform artifacts.
