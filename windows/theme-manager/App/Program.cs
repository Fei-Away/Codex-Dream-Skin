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
    private readonly ThemeStore store = new(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexDreamSkin"));
    private readonly Label activeLabel = new() { AutoSize = true, MaximumSize = new Size(560, 0) };
    private readonly Label valueLabel = new() { AutoSize = true };
    private readonly Label status = new() { AutoSize = true, MaximumSize = new Size(560, 0) };
    private readonly CheckBox transparencyEnabled = new() { AutoSize = true };
    private readonly CheckBox followThemeAll = new() { AutoSize = true };
    private readonly TrackBar slider = new() { Minimum = 0, Maximum = 100, TickFrequency = 10, LargeChange = 10, Dock = DockStyle.Fill, AutoSize = false, Height = 44 };
    private readonly Button follow = new() { AutoSize = true };
    private readonly NumericUpDown numeric = new() { Minimum = 0, Maximum = 100, Width = 72, DecimalPlaces = 0 };
    private sealed record SurfaceControl(Label Label, TrackBar Slider, NumericUpDown Numeric, Button Follow);
    private readonly Dictionary<string, SurfaceControl> surfaceControls = new();
    private readonly Button delete = new() { AutoSize = true };
    private readonly ListBox themes = new() { Dock = DockStyle.Fill, IntegralHeight = false, HorizontalScrollbar = true, DisplayMember = nameof(ThemeRow.Title) };
    private readonly System.Windows.Forms.Timer refreshTimer = new() { Interval = 1500 };
    private readonly System.Windows.Forms.Timer saveTimer = new() { Interval = 250 };
    private SavedTheme? active;
    private string? pendingId;
    private string? pendingSurface;
    private int? pendingValue;
    private bool refreshing;
    private bool dialogOpen;
    private bool editing;
    private bool dragging;
    private string Copy(string en, string zh) => chinese ? zh : en;
    private sealed record ThemeRow(SavedTheme Theme, string Title);

    public ManagerForm()
    {
        Text = Copy("DreamSkin · Theme Manager", "DreamSkin · 主题管理");
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(620, 850);
        MinimumSize = new Size(490, 710);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10);
        var viewport = new Panel { Dock = DockStyle.Fill, AutoScroll = true };
        var layout = new TableLayoutPanel { AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Top, Padding = new Padding(20), ColumnCount = 2, RowCount = 25 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layout.Resize += (_, _) =>
        {
            var width = Math.Max(200, layout.ClientSize.Width - layout.Padding.Horizontal - 12);
            activeLabel.MaximumSize = status.MaximumSize = new Size(width, 0);
        };
        for (int i = 0; i < 25; i++) layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.Controls.Add(activeLabel, 0, 0);
        transparencyEnabled.Text = Copy("Enable area transparency", "启用区域透明度");
        followThemeAll.Text = Copy("Follow theme for all areas", "全部跟随主题");
        layout.Controls.Add(transparencyEnabled, 0, 1);
        layout.Controls.Add(followThemeAll, 0, 2);
        var names = new[] { (Key: "sidebar", En: "Left sidebar", Zh: "左侧栏（图标栏和目录）"),
                            (Key: "message", En: "Conversation · not selected", Zh: "会话信息卡片 · 未选中"),
                            (Key: "messageFocused", En: "Conversation · selected", Zh: "会话信息卡片 · 选中"),
                            (Key: "composer", En: "Input box · not selected", Zh: "输入框 · 未选中"),
                            (Key: "composerFocused", En: "Input box · selected", Zh: "输入框 · 选中") };
        for (var index = 0; index < names.Length; index++)
        {
            var (key, en, zh) = names[index];
            var label = new Label { AutoSize = true };
            var bar = new TrackBar { Minimum = 0, Maximum = 100, TickFrequency = 10, LargeChange = 10,
                Dock = DockStyle.Fill, AutoSize = false, Height = 44, AccessibleName = Copy(en + " transparency", zh + "透明度") };
            var number = new NumericUpDown { Minimum = 0, Maximum = 100, Width = 72,
                AccessibleName = Copy(en + " transparency value", zh + "透明度数值") };
            var reset = new Button { AutoSize = true, Text = Copy("Follow theme", "跟随主题"), Margin = new Padding(0, 0, 0, 8) };
            var row = 3 + index * 3;
            layout.Controls.Add(label, 0, row);
            layout.Controls.Add(number, 1, row);
            layout.Controls.Add(bar, 0, row + 1);
            layout.Controls.Add(reset, 0, row + 2);
            surfaceControls.Add(key, new SurfaceControl(label, bar, number, reset));
            bar.MouseDown += (_, _) => editing = dragging = true;
            bar.MouseUp += (_, _) => { editing = dragging = false; if (pendingId != null) SavePending(); };
            bar.ValueChanged += (_, _) =>
            {
                if (refreshing || active == null) return;
                if (number.Value != bar.Value) number.Value = bar.Value;
                label.Text = Copy($"{en}: {bar.Value}%", $"{zh}：{bar.Value}%");
                QueuePending(key, bar.Value);
            };
            number.ValueChanged += (_, _) => { if (!refreshing && bar.Value != number.Value) bar.Value = (int)number.Value; };
            number.Enter += (_, _) => editing = true;
            number.Leave += (_, _) => { editing = false; if (pendingId != null) SavePending(); };
            reset.Click += (_, _) => {
                if (pendingId != null) SavePending();
                if (active != null) { pendingId = active.Id; pendingSurface = key; pendingValue = null; SavePending(); }
            };
        }
        layout.Controls.Add(valueLabel, 0, 18);
        layout.Controls.Add(numeric, 1, 18);
        layout.Controls.Add(slider, 0, 19);
        follow.Text = Copy("Follow theme", "跟随主题");
        follow.Margin = new Padding(0, 0, 0, 8);
        layout.Controls.Add(follow, 0, 20);
        layout.Controls.Add(new Label { AutoSize = true, Text = Copy("Saved themes", "已保存主题") }, 0, 21);
        themes.AccessibleName = Copy("Saved themes", "已保存主题");
        themes.Height = 140;
        layout.Controls.Add(themes, 0, 22);
        delete.Text = Copy("Move to Recycle Bin…", "移到回收站…");
        delete.Margin = new Padding(0, 10, 0, 10);
        layout.Controls.Add(delete, 0, 23);
        layout.Controls.Add(status, 0, 24);
        viewport.Controls.Add(layout);
        Controls.Add(viewport);
        slider.AccessibleName = Copy("Other backgrounds transparency", "其他背景透明度");
        numeric.AccessibleName = Copy("Other backgrounds transparency value", "其他背景透明度数值");
        slider.MouseDown += (_, _) => editing = dragging = true;
        slider.MouseUp += (_, _) => { editing = dragging = false; if (pendingId != null) SavePending(); };
        slider.ValueChanged += (_, _) =>
        {
            if (refreshing || active == null) return;
            if (numeric.Value != slider.Value) numeric.Value = slider.Value;
            valueLabel.Text = Copy($"Other backgrounds: {slider.Value}%", $"其他背景：{slider.Value}%");
            QueuePending(null, slider.Value);
        };
        numeric.ValueChanged += (_, _) => { if (!refreshing && slider.Value != numeric.Value) slider.Value = (int)numeric.Value; };
        numeric.Enter += (_, _) => editing = true;
        numeric.Leave += (_, _) => { editing = false; if (pendingId != null) SavePending(); };
        follow.Click += (_, _) => {
            if (pendingId != null) SavePending();
            if (active != null) { pendingId = active.Id; pendingSurface = null; pendingValue = null; SavePending(); }
        };
        transparencyEnabled.CheckedChanged += (_, _) => SetMode(() => store.SetTransparencyEnabled(active!.Id, transparencyEnabled.Checked));
        followThemeAll.CheckedChanged += (_, _) => SetMode(() => store.SetFollowTheme(active!.Id, followThemeAll.Checked));
        saveTimer.Tick += (_, _) => { if (!dragging) SavePending(); };
        themes.SelectedIndexChanged += (_, _) => UpdateDelete();
        delete.Click += (_, _) => DeleteSelected();
        refreshTimer.Tick += (_, _) => { if (!editing && !dialogOpen && pendingId == null) RefreshStore(); };
        Shown += (_, _) => { RefreshStore(); refreshTimer.Start(); };
        FormClosing += (_, _) => { if (pendingId != null) SavePending(); };
        FormClosed += (_, _) => { refreshTimer.Dispose(); saveTimer.Dispose(); };
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
            var followingAll = active != null && store.FollowTheme(active.Id);
            activeLabel.Text = active == null ? Copy("No active theme", "暂无当前主题") : Copy($"Current theme: {active.Name}", $"当前主题：{active.Name}");
            transparencyEnabled.Enabled = followThemeAll.Enabled = active != null;
            transparencyEnabled.Checked = active != null && store.TransparencyEnabled(active.Id);
            followThemeAll.Checked = followingAll;
            slider.Enabled = numeric.Enabled = follow.Enabled = active != null;
            slider.Value = (int)Math.Round((followingAll ? null : value) ?? active?.AuthoredTransparency ?? 37, MidpointRounding.AwayFromZero);
            numeric.Value = slider.Value;
            valueLabel.Text = Copy($"Other backgrounds: {slider.Value}%", $"其他背景：{slider.Value}%") + (followingAll || value == null ? Copy(" · Following theme", " · 跟随主题") : "");
            foreach (var (key, control) in surfaceControls)
            {
                var authored = active?.AuthoredSurfaces[key] ?? ThemeStore.SurfaceDefaults[key];
                var surfaceValue = active == null ? null : store.SurfaceOverride(active.Id, key);
                control.Slider.Enabled = control.Numeric.Enabled = control.Follow.Enabled = active != null;
                control.Slider.Value = (int)Math.Round((followingAll ? null : surfaceValue) ?? authored, MidpointRounding.AwayFromZero);
                control.Numeric.Value = control.Slider.Value;
                var name = key switch
                {
                    "sidebar" => Copy("Left sidebar", "左侧栏（图标栏和目录）"),
                    "message" => Copy("Conversation · not selected", "会话信息卡片 · 未选中"),
                    "messageFocused" => Copy("Conversation · selected", "会话信息卡片 · 选中"),
                    "composer" => Copy("Input box · not selected", "输入框 · 未选中"),
                    _ => Copy("Input box · selected", "输入框 · 选中")
                };
                control.Label.Text = $"{name}: {control.Slider.Value}%" +
                    (followingAll || surfaceValue == null ? Copy(" · Following theme", " · 跟随主题") : "");
            }
            var rows = saved.Select(t => new ThemeRow(t, t.Name + ((active != null && ThemeStore.SameThemeId(t.Id, active.Id)) ? Copy(" (Current)", "（当前）") : ""))).ToArray();
            if (!themes.Items.Cast<ThemeRow>().SequenceEqual(rows))
            {
                themes.BeginUpdate();
                try
                {
                    themes.Items.Clear(); themes.Items.AddRange(rows);
                    if (selected != null) themes.SelectedItem = rows.FirstOrDefault(r => r.Theme.Directory == selected);
                }
                finally { themes.EndUpdate(); }
            }
            status.Text = saved.Count == 0 ? Copy("Import a theme from the DreamSkin tray to get started.", "从 DreamSkin 托盘导入主题后即可管理。") : Copy("Choose another theme in the tray before deleting the current theme.", "如需删除当前主题，请先在托盘切换到其他主题。");
            UpdateDelete();
        }
        catch (Exception ex) {
            slider.Enabled = numeric.Enabled = follow.Enabled = delete.Enabled = false;
            transparencyEnabled.Enabled = followThemeAll.Enabled = false;
            foreach (var control in surfaceControls.Values) control.Slider.Enabled = control.Numeric.Enabled = control.Follow.Enabled = false;
            status.Text = ErrorText(ex);
        }
        finally { refreshing = false; }
    }

    private void UpdateDelete() => delete.Enabled = themes.SelectedItem is ThemeRow row && (active == null || !ThemeStore.SameThemeId(row.Theme.Id, active.Id));

    private void SetMode(Action save)
    {
        if (refreshing || active == null) return;
        if (pendingId != null) SavePending();
        try { using (var lease = new OperationLease()) save(); RefreshStore(); }
        catch (Exception ex) { RefreshStore(); ShowError(ex); }
    }

    private void QueuePending(string? surface, int value)
    {
        if (active == null) return;
        if (pendingId != null && (pendingId != active.Id || pendingSurface != surface)) SavePending();
        if (active == null) return;
        pendingId = active.Id;
        pendingSurface = surface;
        pendingValue = value;
        saveTimer.Stop(); saveTimer.Start();
    }

    private void SavePending()
    {
        saveTimer.Stop();
        var id = pendingId;
        if (id == null) return;
        var surface = pendingSurface;
        pendingId = null;
        pendingSurface = null;
        try {
            using (var lease = new OperationLease())
            {
                if (surface == null) store.SetTransparency(id, pendingValue);
                else store.SetSurfaceTransparency(id, surface, pendingValue);
            }
            RefreshStore();
        }
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
        _ => Copy("Theme data could not be read or saved. Check the theme files and try again.", "无法读取或保存主题数据，请检查主题文件后重试。")
    };
}
