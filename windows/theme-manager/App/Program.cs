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
    private string Copy(string en, string zh) => chinese ? zh : en;
    private sealed record ThemeRow(SavedTheme Theme, string Title);

    public ManagerForm()
    {
        Text = Copy("DreamSkin · Theme Manager", "DreamSkin · 主题管理");
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(600, 520);
        MinimumSize = new Size(460, 440);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), ColumnCount = 1, RowCount = 8 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.Resize += (_, _) =>
        {
            var width = Math.Max(200, layout.ClientSize.Width - layout.Padding.Horizontal - 12);
            activeLabel.MaximumSize = status.MaximumSize = new Size(width, 0);
        };
        for (int i = 0; i < 8; i++) layout.RowStyles.Add(new RowStyle(i == 5 ? SizeType.Percent : SizeType.AutoSize, i == 5 ? 100 : 0));
        layout.Controls.Add(activeLabel, 0, 0);
        layout.Controls.Add(valueLabel, 0, 1);
        layout.Controls.Add(slider, 0, 2);
        follow.Text = Copy("Follow theme", "跟随主题");
        follow.Margin = new Padding(0, 0, 0, 20);
        layout.Controls.Add(follow, 0, 3);
        layout.Controls.Add(new Label { AutoSize = true, Text = Copy("Saved themes", "已保存主题") }, 0, 4);
        themes.AccessibleName = Copy("Saved themes", "已保存主题");
        layout.Controls.Add(themes, 0, 5);
        delete.Text = Copy("Move to Recycle Bin…", "移到回收站…");
        delete.Margin = new Padding(0, 10, 0, 10);
        layout.Controls.Add(delete, 0, 6);
        layout.Controls.Add(status, 0, 7);
        Controls.Add(layout);
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
            activeLabel.Text = active == null ? Copy("No active theme", "暂无当前主题") : Copy($"Current theme: {active.Name}", $"当前主题：{active.Name}");
            slider.Enabled = follow.Enabled = active != null;
            slider.Value = (int)Math.Round(value ?? active?.AuthoredTransparency ?? 30, MidpointRounding.AwayFromZero);
            valueLabel.Text = Copy($"Transparency: {slider.Value}%", $"透明度：{slider.Value}%") + (value == null ? Copy(" · Following theme", " · 跟随主题") : "");
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
        catch (Exception ex) { slider.Enabled = follow.Enabled = delete.Enabled = false; status.Text = ErrorText(ex); }
        finally { refreshing = false; }
    }

    private void UpdateDelete() => delete.Enabled = themes.SelectedItem is ThemeRow row && (active == null || !ThemeStore.SameThemeId(row.Theme.Id, active.Id));

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
        _ => Copy("Theme data could not be read or saved. Check the theme files and try again.", "无法读取或保存主题数据，请检查主题文件后重试。")
    };
}
