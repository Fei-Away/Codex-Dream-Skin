using System.Globalization;

namespace DreamSkin.ThemeManager;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        using var instance = new SingleInstance();
        if (!instance.IsPrimary) return;
        ApplicationConfiguration.Initialize();
        using var form = new ManagerForm();
        using var activationTimer = new System.Windows.Forms.Timer { Interval = 150 };
        activationTimer.Tick += (_, _) =>
        {
            if (!instance.TakeActivationRequest()) return;
            if (form.WindowState == FormWindowState.Minimized) form.WindowState = FormWindowState.Normal;
            form.Show();
            form.Activate();
        };
        form.Shown += (_, _) => activationTimer.Start();
        Application.Run(form);
    }
}

internal sealed class ManagerForm : Form
{
    internal static bool UsesChinese(string? language, CultureInfo culture) => language?.Trim().ToLowerInvariant() switch
    {
        "zh" or "zh-cn" => true,
        "en" or "en-us" => false,
        _ => culture.TwoLetterISOLanguageName == "zh"
    };
    private readonly bool chinese = UsesChinese(Environment.GetEnvironmentVariable("DREAMSKIN_LANG"), CultureInfo.CurrentUICulture);
    private readonly ThemeStore store;
    private readonly OperationLogStore logStore;
    private readonly Label activeLabel = new() { AutoSize = true, MaximumSize = new Size(560, 0) };
    private readonly Label valueLabel = new() { AutoSize = true };
    private readonly Label status = new() { AutoSize = true, MaximumSize = new Size(560, 0) };
    private readonly TrackBar slider = new() { Minimum = 0, Maximum = 100, TickFrequency = 10, LargeChange = 10, Dock = DockStyle.Fill, AutoSize = false, Height = 44 };
    private readonly Button follow = new() { AutoSize = true };
    private readonly Button delete = new() { AutoSize = true };
    private readonly ListBox themes = new() { Dock = DockStyle.Fill, IntegralHeight = false, HorizontalScrollbar = true, DisplayMember = nameof(ThemeRow.Title) };
    private readonly System.Windows.Forms.Timer refreshTimer = new() { Interval = 1500 };
    private readonly System.Windows.Forms.Timer saveTimer = new() { Interval = 250 };
    private SavedTheme? active;
    private string? pendingId;
    private int? pendingValue;
    private bool refreshing;
    private bool dialogOpen;
    private bool editing;
    private bool operationRunning;
    private bool logsReading;
    private int previewVersion;
    private string? backgroundDraft;
    private readonly TabControl tabs = new() { Dock = DockStyle.Fill };
    private readonly PictureBox preview = new() { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.FromArgb(32, 34, 40), MinimumSize = new Size(160, 50) };
    private readonly Label previewInfo = new() { AutoSize = false, Dock = DockStyle.Fill, AutoEllipsis = true, MaximumSize = new Size(440, 0) };
    private readonly Label draftStatus = new() { AutoSize = true, MaximumSize = new Size(800, 0) };
    private readonly Button chooseImage = new() { AutoSize = true };
    private readonly Button resetImage = new() { AutoSize = true };
    private readonly Button saveDefault = new() { AutoSize = true };
    private readonly Button apply = new() { AutoSize = true };
    private readonly Button shortcut = new() { AutoSize = true };
    private readonly ListView logList = new() { Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true, HideSelection = false, MultiSelect = false };
    private readonly TextBox logDetails = new() { Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Both, Dock = DockStyle.Fill, WordWrap = false };
    private readonly ComboBox logFilter = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 150 };
    private readonly Label logStatus = new() { AutoSize = true, MaximumSize = new Size(780, 0) };
    private IReadOnlyList<OperationEvent> logEvents = [];
    private Exception? lastLogReadError;
    private string Copy(string en, string zh) => chinese ? zh : en;
    private string RecoveryText(string value) => chinese ? value switch
    {
        "restored" => "已恢复", "verified" => "已验证", "unverified" => "未验证", "blocked" => "未完成",
        "superseded" => "被新操作替代", "not-needed" => "无需恢复", _ => value
    } : value;
    private string EventText(string value) => chinese ? value.ToLowerInvariant() switch
    {
        "panel" => "管理面板", "shortcut" => "启动图标", "launcher" => "启动入口", "startup" => "启动流程", "tray" => "托盘", "cli" => "命令行", "watcher" => "后台监视",
        "apply" => "应用并启动", "save" => "保存设置", "shortcut-create" => "创建启动图标", "default-launch" => "默认主题启动", "launch" => "启动", "start" => "启动",
        "request" => "请求", "validation" or "validate" => "校验", "commit" => "保存", "verify" => "验证", "recovery" or "rollback" => "恢复",
        "begin" or "started" => "开始", "complete" or "completed" => "完成", "result" => "结果", "success" => "成功", "failure" => "失败",
        "cancelled" => "已取消", "pending" => "进行中", "rejected" => "已拒绝", "duplicate" => "重复请求", "busy" => "忙碌",
        "ready" => "已就绪", "reuse" => "复用会话", "cleanup" => "清理", "restart" => "重启", "injection" or "inject" => "加载外观",
        "confirmation" => "确认", "verification" => "外观验证", "foreground-exit" => "前台结束", "failed" => "失败", "warning" => "提示",
        _ => RecoveryText(value)
    } : value;
    private sealed record ThemeRow(SavedTheme Theme, string Title);

    public ManagerForm() : this(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexDreamSkin")) { }

    internal ManagerForm(string stateRoot)
    {
        store = new ThemeStore(stateRoot);
        logStore = new OperationLogStore(stateRoot);
        Text = Copy("DreamSkin · Theme Manager", "DreamSkin · 主题管理");
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(980, 740);
        MinimumSize = new Size(640, 560);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10);
        var themePage = new TabPage(Copy("Theme and startup", "主题与启动")) { AutoScroll = true };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(16), ColumnCount = 1, RowCount = 8 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.Resize += (_, _) =>
        {
            var width = Math.Max(200, layout.ClientSize.Width - layout.Padding.Horizontal - 12);
            activeLabel.MaximumSize = status.MaximumSize = new Size(width, 0);
        };
        for (int i = 0; i < 8; i++) layout.RowStyles.Add(new RowStyle(i == 2 ? SizeType.Percent : SizeType.AutoSize, i == 2 ? 100 : 0));
        layout.Controls.Add(activeLabel, 0, 0);
        layout.Controls.Add(new Label { AutoSize = true, Text = Copy("Choose a theme and background; selections are a draft until saved or applied.", "选择主题与背景；点击保存或应用前，选择仅为草稿。") }, 0, 1);
        var selection = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, MinimumSize = new Size(400, 130) };
        selection.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 34));
        selection.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 66));
        selection.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        themes.AccessibleName = Copy("Theme draft", "草稿主题");
        selection.Controls.Add(themes, 0, 0);
        var previewLayout = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1 };
        previewLayout.Resize += (_, _) => previewInfo.MaximumSize = new Size(Math.Max(100, previewLayout.ClientSize.Width - 8), 0);
        previewLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        previewLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        previewLayout.Controls.Add(preview, 0, 0);
        previewLayout.Controls.Add(previewInfo, 0, 1);
        selection.Controls.Add(previewLayout, 1, 0);
        layout.Controls.Add(selection, 0, 2);
        chooseImage.Text = Copy("Choose background…", "选择背景图片…");
        resetImage.Text = Copy("Use theme background", "使用主题原背景");
        delete.Text = Copy("Move to Recycle Bin…", "移到回收站…");
        var imageButtons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, WrapContents = true };
        imageButtons.Controls.AddRange([chooseImage, resetImage, delete]);
        layout.Controls.Add(imageButtons, 0, 3);
        layout.Controls.Add(draftStatus, 0, 4);
        saveDefault.Text = Copy("Save startup settings", "保存为启动设置");
        apply.Text = Copy("Apply / reapply and launch Codex", "应用 / 重新应用并启动 Codex");
        shortcut.Text = Copy("Create / repair launch shortcut", "创建 / 修复默认启动快捷方式");
        var actionButtons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, WrapContents = true };
        actionButtons.Controls.AddRange([saveDefault, apply, shortcut]);
        layout.Controls.Add(actionButtons, 0, 5);
        var transparency = new GroupBox { Text = Copy("Current active theme transparency (saved immediately)", "当前活动主题透明度（即时保存）"), Dock = DockStyle.Fill, AutoSize = true };
        var transparencyLayout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, AutoSize = true };
        transparencyLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        transparencyLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        transparencyLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        transparencyLayout.Controls.Add(valueLabel, 0, 0);
        transparencyLayout.Controls.Add(slider, 1, 0);
        follow.Text = Copy("Follow theme", "跟随主题");
        transparencyLayout.Controls.Add(follow, 2, 0);
        transparency.Controls.Add(transparencyLayout);
        layout.Controls.Add(transparency, 0, 6);
        layout.Controls.Add(status, 0, 7);
        themePage.Controls.Add(layout);
        tabs.TabPages.Add(themePage);
        tabs.TabPages.Add(BuildLogPage());
        Controls.Add(tabs);
        slider.AccessibleName = Copy("Transparency", "透明度");
        slider.MouseDown += (_, _) => editing = true;
        slider.MouseUp += (_, _) => { editing = false; if (pendingId != null) SavePending(); };
        slider.ValueChanged += (_, _) =>
        {
            if (refreshing || active == null) return;
            valueLabel.Text = Copy($"Transparency: {slider.Value}%", $"透明度：{slider.Value}%");
            pendingId = active.Id;
            pendingValue = slider.Value;
            saveTimer.Stop(); saveTimer.Start();
        };
        follow.Click += (_, _) => { if (active != null) { pendingId = active.Id; pendingValue = null; SavePending(); } };
        saveTimer.Tick += (_, _) => SavePending();
        themes.SelectedIndexChanged += async (_, _) =>
        {
            UpdateDelete();
            if (refreshing) return;
            backgroundDraft = null;
            DraftChanged();
            await RefreshPreview();
        };
        chooseImage.Click += async (_, _) => await ChooseBackground();
        resetImage.Click += async (_, _) => { backgroundDraft = null; DraftChanged(); await RefreshPreview(); };
        saveDefault.Click += async (_, _) => await RunOperation("Save");
        apply.Click += async (_, _) => await RunOperation("Apply");
        shortcut.Click += async (_, _) => await RunOperation("Shortcut");
        delete.Click += (_, _) => DeleteSelected();
        refreshTimer.Tick += (_, _) => { if (!editing && !dialogOpen && !operationRunning && pendingId == null) RefreshStore(); };
        Shown += async (_, _) => { RefreshStore(); await RefreshPreview(); await RefreshLogs(); refreshTimer.Start(); };
        FormClosing += (_, e) =>
        {
            if (operationRunning) { e.Cancel = true; status.Text = Copy("Wait for the operation and any restart confirmation to finish before closing.", "请等待操作和重启确认完成后关闭面板。"); return; }
            if (pendingId != null) SavePending();
        };
        FormClosed += (_, _) => { previewVersion++; preview.Image?.Dispose(); refreshTimer.Dispose(); saveTimer.Dispose(); };
    }

    private void RefreshStore()
    {
        refreshing = true;
        try
        {
            using var lease = new OperationLease();
            var selected = (themes.SelectedItem as ThemeRow)?.Theme.Directory;
            active = store.Active();
            var saved = store.List();
            var value = active == null ? null : store.Override(active.Id);
            activeLabel.Text = active == null ? Copy("No active theme", "暂无当前主题") : Copy($"Current theme: {active.Name}", $"当前主题：{active.Name}");
            slider.Enabled = follow.Enabled = active != null;
            slider.Value = (int)Math.Round(value ?? active?.AuthoredTransparency ?? 30, MidpointRounding.AwayFromZero);
            valueLabel.Text = Copy($"Transparency: {slider.Value}%", $"透明度：{slider.Value}%") + (value == null ? Copy(" · Following theme", " · 跟随主题") : "");
            var rows = (active == null ? saved : new[] { active }.Concat(saved)).Select(t => new ThemeRow(t, t.Name +
                (t.Directory == active?.Directory ? Copy(" (Startup settings)", "（已保存的启动设置）") : ""))).ToArray();
            if (!themes.Items.Cast<ThemeRow>().SequenceEqual(rows))
            {
                themes.BeginUpdate();
                try
                {
                    themes.Items.Clear(); themes.Items.AddRange(rows);
                    themes.SelectedItem = rows.FirstOrDefault(r => r.Theme.Directory == selected) ?? rows.FirstOrDefault();
                }
                finally { themes.EndUpdate(); }
            }
            if (string.IsNullOrEmpty(status.Text)) status.Text = Copy("Saving may also update an already running skin session. Preview is an illustration, not a Codex render verification.", "保存可能同时更新正在运行的皮肤。预览为背景示意，不代表已在 Codex 验证生效。");
            if (string.IsNullOrEmpty(draftStatus.Text)) draftStatus.Text = Copy("Saved startup settings. Choose a theme or image to prepare a draft.", "已保存的启动设置。选择主题或图片可创建草稿。");
            UpdateDelete();
        }
        catch (Exception ex) { slider.Enabled = follow.Enabled = delete.Enabled = false; status.Text = ErrorText(ex); }
        finally { refreshing = false; }
    }

    private void UpdateDelete()
    {
        delete.Enabled = !operationRunning && themes.SelectedItem is ThemeRow row &&
            row.Theme.Directory != active?.Directory && (active == null || !ThemeStore.SameThemeId(row.Theme.Id, active.Id));
        chooseImage.Enabled = resetImage.Enabled = saveDefault.Enabled = apply.Enabled = !operationRunning && !dialogOpen && themes.SelectedItem != null;
        shortcut.Enabled = !operationRunning && !dialogOpen;
    }

    private void DraftChanged() => draftStatus.Text = Copy("Unsaved draft · startup settings have not changed.", "尚未保存的草稿 · 启动设置未改变。");

    private async Task ChooseBackground()
    {
        if (operationRunning) return;
        dialogOpen = true;
        UpdateDelete();
        try
        {
            using var dialog = new OpenFileDialog { Title = Copy("Choose a background", "选择背景图片"),
                Filter = "Images (*.png;*.jpg;*.jpeg;*.webp)|*.png;*.jpg;*.jpeg;*.webp", CheckFileExists = true, Multiselect = false };
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            var path = dialog.FileName;
            await Task.Run(() => PreviewFiles.Read(path));
            backgroundDraft = path;
            DraftChanged();
            await RefreshPreview();
        }
        catch (Exception ex) { ShowError(ex); }
        finally { dialogOpen = false; UpdateDelete(); }
    }

    private async Task RefreshPreview()
    {
        int version = ++previewVersion;
        if (themes.SelectedItem is not ThemeRow row) return;
        var customBackground = backgroundDraft;
        previewInfo.Text = Copy("Loading preview…", "正在读取预览…");
        try
        {
            var result = await Task.Run(() => ImagePreview.Load(customBackground ?? PreviewFiles.Background(row.Theme)));
            if (version != previewVersion || IsDisposed) { result.Image?.Dispose(); return; }
            var old = preview.Image;
            preview.Image = result.Image;
            old?.Dispose();
            previewInfo.Text = result.Message + (customBackground != null ? Copy(" · Custom background draft", " · 自选背景草稿") : Copy(" · Theme background", " · 主题背景"));
            if (result.Image == null) previewInfo.Text += Copy("\nNo system preview; still selectable for save-time validation.", "\n无系统预览；仍可选择，保存时会完整校验。");
        }
        catch (Exception ex)
        {
            if (version != previewVersion || IsDisposed) return;
            var old = preview.Image; preview.Image = null; old?.Dispose();
            previewInfo.Text = ErrorText(ex);
        }
    }

    private async Task RunOperation(string action)
    {
        if (operationRunning || dialogOpen) return;
        var selected = themes.SelectedItem as ThemeRow;
        if (action != "Shortcut" && selected == null) return;
        if (pendingId != null) SavePending();
        operationRunning = true;
        themes.Enabled = slider.Enabled = follow.Enabled = false;
        UpdateDelete();
        status.Text = action == "Apply" ? Copy("Applying… If a restart confirmation appears, answer it to continue.", "正在应用…如弹出重启确认，请作出选择以继续。") : Copy("Working…", "正在处理…");
        try
        {
            // null selects the active snapshot; only saved-library paths are sent to the bridge.
            var source = action == "Shortcut" || selected?.Theme.Directory == active?.Directory ? null : selected?.Theme.Directory;
            var result = await PanelOperations.Run(store.Root, action, source, action == "Shortcut" ? null : backgroundDraft);
            status.Text = result.Message + (result.Outcome == "failure" ? Copy($"\nDisk recovery: {RecoveryText(result.DiskRecovery)}\nVisible recovery: {RecoveryText(result.VisibleRecovery)}", $"\n配置恢复：{RecoveryText(result.DiskRecovery)}\n可见外观恢复：{RecoveryText(result.VisibleRecovery)}") : "");
            if (result.Outcome == "success" && action != "Shortcut")
            {
                backgroundDraft = null;
                draftStatus.Text = action == "Apply" ? Copy("Verified in Codex · saved as startup settings.", "已在 Codex 验证生效 · 已保存为启动设置。") : Copy("Saved as startup settings · Codex appearance has not been verified.", "已保存为启动设置 · 尚未验证 Codex 外观。");
                RefreshStore();
                refreshing = true;
                try { themes.SelectedItem = themes.Items.Cast<ThemeRow>().FirstOrDefault(r => r.Theme.Directory == active?.Directory); }
                finally { refreshing = false; }
                await RefreshPreview();
            }
        }
        catch (Exception ex) { status.Text = ErrorText(ex); }
        finally
        {
            operationRunning = false;
            themes.Enabled = true;
            RefreshStore();
            UpdateDelete();
            await RefreshLogs();
        }
    }

    private TabPage BuildLogPage()
    {
        var page = new TabPage(Copy("Logs", "日志")) { AutoScroll = true };
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(12), ColumnCount = 1, RowCount = 4 };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 65));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 35));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        var tools = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, WrapContents = true };
        logFilter.Items.AddRange([Copy("All events", "全部事件"), Copy("Failures", "失败"), Copy("Cancelled", "已取消"), Copy("Repeated / busy", "重复 / 忙碌")]);
        logFilter.SelectedIndex = 0;
        logFilter.SelectedIndexChanged += (_, _) => DisplayLogs();
        var refresh = new Button { AutoSize = true, Text = Copy("Refresh", "刷新") };
        refresh.Click += async (_, _) => await RefreshLogs();
        var open = new Button { AutoSize = true, Text = Copy("Open logs folder", "打开日志目录") };
        open.Click += (_, _) => OpenLocation(logStore.DirectoryPath);
        var copy = new Button { AutoSize = true, Text = Copy("Copy redacted details", "复制脱敏详情") };
        copy.Click += (_, _) => { try { if (logDetails.Text.Length != 0) Clipboard.SetText(OperationLogStore.Redact(logDetails.Text)); } catch (Exception ex) { ShowError(ex); } };
        var export = new Button { AutoSize = true, Text = Copy("Export diagnostics…", "导出诊断…") };
        export.Click += (_, _) => ExportLogs();
        var underlying = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 150 };
        underlying.Items.AddRange(["injector.log", "injector-error.log", "verify.log"]); underlying.SelectedIndex = 0;
        var openUnderlying = new Button { AutoSize = true, Text = Copy("Open engine log", "查看底层日志") };
        openUnderlying.Click += (_, _) => OpenLocation(Path.Combine(store.Root, (string)underlying.SelectedItem!));
        tools.Controls.AddRange([logFilter, refresh, open, copy, export, underlying, openUnderlying]);
        layout.Controls.Add(tools, 0, 0);
        foreach (var column in new[] { (Copy("Time", "时间"), 150), (Copy("Source", "入口"), 80), (Copy("Action", "动作"), 80),
            (Copy("Stage", "阶段"), 110), (Copy("Outcome", "结果"), 95), (Copy("Message", "说明"), 420) }) logList.Columns.Add(column.Item1, column.Item2);
        logList.SelectedIndexChanged += (_, _) => logDetails.Text = logList.SelectedItems.Count == 0 ? "" : ((OperationEvent)logList.SelectedItems[0].Tag!).Details;
        layout.Controls.Add(logList, 0, 1);
        layout.Controls.Add(logDetails, 0, 2);
        layout.Controls.Add(logStatus, 0, 3);
        page.Controls.Add(layout);
        tabs.SelectedIndexChanged += async (_, _) => { if (tabs.SelectedTab == page) await RefreshLogs(); };
        return page;
    }

    private async Task RefreshLogs()
    {
        if (logsReading) return;
        logsReading = true;
        try
        {
            var result = await Task.Run(() => logStore.Read());
            if (IsDisposed) return;
            logEvents = result.Events;
            lastLogReadError = null;
            DisplayLogs();
            logStatus.Text = Copy($"{result.Events.Count} recent events · {result.Skipped} unreadable records skipped", $"最近 {result.Events.Count} 条事件 · 跳过 {result.Skipped} 条无效记录") +
                (result.Truncated ? Copy(" · Earlier events remain in the logs folder.", " · 更早的事件可在日志目录查看。") : "");
        }
        catch (Exception ex) { lastLogReadError = ex; if (!IsDisposed) logStatus.Text = Copy("Logs are unavailable. The last operation result is unchanged.", "日志暂不可用；这不改变上次操作结果。"); }
        finally { logsReading = false; }
    }

    internal async Task PrepareInspectionAsync()
    {
        RefreshStore();
        await RefreshPreview();
        await RefreshLogs();
    }

    internal void SelectInspectionPage(int index) => tabs.SelectedIndex = index;
    internal string LogInspectionStatus => $"events={logEvents.Count}; reading={logsReading}; status={logStatus.Text}; error={lastLogReadError}";

    private void DisplayLogs()
    {
        var filter = logFilter.SelectedIndex;
        logList.BeginUpdate();
        try
        {
            logList.Items.Clear(); logDetails.Clear();
            foreach (var entry in logEvents.Where(e => filter switch
            {
                1 => e.Outcome.Equals("failure", StringComparison.OrdinalIgnoreCase),
                2 => e.Outcome.Equals("cancelled", StringComparison.OrdinalIgnoreCase),
                3 => e.Category.Contains("busy", StringComparison.OrdinalIgnoreCase) || e.Category.Contains("repeat", StringComparison.OrdinalIgnoreCase) || e.Category.Contains("duplicate", StringComparison.OrdinalIgnoreCase),
                _ => true
            }))
            {
                var item = new ListViewItem([entry.Timestamp.ToLocalTime().ToString("MM-dd HH:mm:ss"), EventText(entry.Source), EventText(entry.Action), EventText(entry.Stage), EventText(entry.Outcome), entry.Message]) { Tag = entry };
                if (entry.Outcome == "failure") item.ForeColor = Color.Firebrick;
                logList.Items.Add(item);
            }
        }
        finally { logList.EndUpdate(); }
    }

    private void OpenLocation(string path)
    {
        try
        {
            SafeFiles.CheckPath(path);
            if (!File.Exists(path) && !Directory.Exists(path)) throw new StoreException("missingLog");
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex) { ShowError(ex); }
    }

    private void ExportLogs()
    {
        try
        {
            using var dialog = new SaveFileDialog { Filter = "JSON Lines (*.jsonl)|*.jsonl", FileName = "dreamskin-diagnostics.jsonl", OverwritePrompt = true };
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            SafeFiles.CheckPath(dialog.FileName);
            File.WriteAllText(dialog.FileName, OperationLogStore.Redact(string.Join("\n", logEvents.Select(e => e.Details))) + "\n", new System.Text.UTF8Encoding(false));
        }
        catch (Exception ex) { ShowError(ex); }
    }

    private void SavePending()
    {
        saveTimer.Stop();
        var id = pendingId;
        if (id == null) return;
        pendingId = null;
        try { using var lease = new OperationLease(); store.SetTransparency(id, pendingValue); RefreshStore(); }
        catch (Exception ex) { RefreshStore(); ShowError(ex); }
    }

    private void DeleteSelected()
    {
        if (themes.SelectedItem is not ThemeRow row) return;
        dialogOpen = true;
        try
        {
            var prompt = Copy($"Move “{row.Theme.Name}” to the Recycle Bin?\n\nYou can restore it from the Recycle Bin. Your source ZIP is kept.", $"将“{row.Theme.Name}”移到回收站？\n\n可从回收站恢复，原始 ZIP 文件会保留。");
            if (MessageBox.Show(this, prompt, Text, MessageBoxButtons.OKCancel, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.OK) return;
            using var lease = new OperationLease();
            store.ValidateDeletion(row.Theme);
            RecycleBin.MoveDirectory(row.Theme.Directory, Handle);
            RefreshStore();
        }
        catch (Exception ex) { RefreshStore(); ShowError(ex); }
        finally { dialogOpen = false; }
    }

    private void ShowError(Exception ex) => MessageBox.Show(this, ErrorText(ex), Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
    private string ErrorText(Exception ex) => ex.Message switch
    {
        "busy" => Copy("Another DreamSkin operation is running. Try again when it finishes.", "DreamSkin 正在执行其他操作，请完成后重试。"),
        "activeChanged" or "themeChanged" => Copy("The theme changed. Select it again and retry.", "主题已发生变化，请重新选择后重试。"),
        "activeTheme" => Copy("Switch to another theme before deleting this one.", "请先切换到其他主题再删除。"),
        "unsafePath" => Copy("The theme location contains a link or is outside the saved theme library.", "主题路径包含链接或不在已保存主题库中。"),
        "recoveryPending" => Copy("A theme import needs recovery. Open the saved themes menu in the tray, then retry.", "主题导入尚需恢复，请先打开托盘中的已保存主题菜单，再重试。"),
        "recycleFailed" => Copy("The theme could not be moved to the Recycle Bin.", "未能将主题移到回收站。"),
        "invalidImage" => Copy("The background is not a supported valid image, exceeds 10 MiB / 16384px / 50MP, or could not be decoded.", "背景图片格式或内容无效、超过 10 MiB / 16384 像素 / 5000 万像素限制，或无法解码。"),
        "invalidResult" or "invalidData" when operationRunning => Copy("No matching trustworthy operation result was received. Check logs and retry; success has not been confirmed.", "未收到匹配且可信的操作结果，请查看日志后重试；尚未确认成功。"),
        "missingBridge" => Copy("The installed operation script is missing. Reinstall the complete updated engine.", "安装的操作脚本缺失，请更新完整运行引擎。"),
        "missingLog" => Copy("This log has not been created yet.", "此日志尚未生成。"),
        _ when operationRunning => Copy("The operation could not be confirmed. Check logs before retrying; success has not been verified.", "未能确认操作结果，请先查看日志再重试；尚未验证成功。"),
        _ => Copy("Theme data could not be read or saved. Check the theme files and try again.", "无法读取或保存主题数据，请检查主题文件后重试。")
    };
}
