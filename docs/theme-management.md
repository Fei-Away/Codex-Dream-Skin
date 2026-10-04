# 本机主题管理 / Local theme management

## 使用入口

- macOS：菜单栏 → **主题**。背景透明度滑块和“跟随主题”作用于当前主题；**删除已保存主题…**列出本机主题。
- Windows：桌面／开始菜单 → **Codex Dream Skin**，或双击托盘图标。原生窗口提供当前主题透明度和已保存主题删除；切换、导入主题仍使用现有托盘。

透明度范围为 0–100%；0% 不透明，100% 全透明。只改变主题背景，文字和图标不随之变淡。优先级为用户按主题保存的设置 → 作者明确的 alpha → 默认 30%。点“跟随主题”清除当前主题的用户覆盖。主题包不会被改写。

删除需确认主题名称，之后将该主题的本机保存目录移到系统废纸篓／回收站。正在使用的主题需先切换；导入或切换进行中时暂不删除。原始 ZIP、当前主题快照、恢复备份和社区发布记录保留。透明度偏好也保留，以便重新导入或恢复主题时继续使用。

## English

On macOS, open the menu bar **Theme** menu for background transparency and
**Delete saved theme…**. On Windows, open **Codex Dream Skin** from the desktop or Start Menu, or double-click
the tray icon. The existing tray still handles imports and theme
switching.

Transparency ranges from 0% (opaque) to 100% (transparent). Per-theme local
settings take priority over authored alpha; otherwise the default is 30%.
**Follow theme** clears the current theme's override. Text, icons and source
packages remain unchanged.

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
2. With Codex visible, drag transparency to 0%, a middle value, and 100%; verify
   only backgrounds change. Switch away and back, restart the manager, and verify
   the per-theme setting remains. Use Follow theme on authored-alpha and legacy
   themes; expect the authored value or 30%, respectively.
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
