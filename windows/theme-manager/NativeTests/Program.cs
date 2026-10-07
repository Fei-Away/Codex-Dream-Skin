using DreamSkin.ThemeManager;
using System.Runtime.InteropServices;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        var english = System.Globalization.CultureInfo.GetCultureInfo("en-US");
        var chinese = System.Globalization.CultureInfo.GetCultureInfo("zh-CN");
        if (!ManagerForm.UsesChinese("zh", english) || ManagerForm.UsesChinese("en", chinese) ||
            !ManagerForm.UsesChinese("zh-CN", english) || ManagerForm.UsesChinese("en-US", chinese) ||
            !ManagerForm.UsesChinese(null, chinese) || ManagerForm.UsesChinese("system", english))
            throw new Exception("Launcher language override or system fallback failed.");
        Console.WriteLine("PASS tray language override and system fallback");

        var instanceSuffix = ".Test-" + Guid.NewGuid().ToString("N");
        using (var primary = new SingleInstance(instanceSuffix))
        {
            if (!primary.IsPrimary || primary.TakeActivationRequest()) throw new Exception("First instance did not own its window.");
            for (var launch = 0; launch < 2; launch++)
            {
                var duplicate = Task.Run(() =>
                {
                    using var secondary = new SingleInstance(instanceSuffix);
                    return !secondary.IsPrimary;
                }).GetAwaiter().GetResult();
                if (!duplicate || !primary.TakeActivationRequest() || primary.TakeActivationRequest())
                    throw new Exception("Repeated launch did not signal exactly one activation.");
            }
        }
        using (var reopened = new SingleInstance(instanceSuffix))
            if (!reopened.IsPrimary) throw new Exception("Closed manager could not reopen.");
        Console.WriteLine("PASS repeated launches activate existing instance; closed manager reopens");

        using (var lease = new OperationLease())
        {
            var rejected = Task.Run(() =>
            {
                try { using var second = new OperationLease(); return false; }
                catch (StoreException ex) when (ex.Message == "busy") { return true; }
            }).GetAwaiter().GetResult();
            if (!rejected) throw new Exception("Concurrent native operation was not rejected.");
        }
        using (var lease = new OperationLease()) { }
        Console.WriteLine("PASS per-user operation mutex contention and release");

        var uiRoot = Path.Combine(Directory.GetCurrentDirectory(), ".local-evidence", "panel-ui-fixture-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(uiRoot);
        try
        {
            var active = Path.Combine(uiRoot, "active-theme"); Directory.CreateDirectory(active);
            using (var image = new System.Drawing.Bitmap(800, 450))
            {
                using var graphics = System.Drawing.Graphics.FromImage(image);
                graphics.Clear(System.Drawing.Color.FromArgb(55, 77, 115));
                graphics.FillEllipse(System.Drawing.Brushes.CornflowerBlue, 340, 60, 220, 220);
                image.Save(Path.Combine(active, "background.png"), System.Drawing.Imaging.ImageFormat.Png);
            }
            File.WriteAllText(Path.Combine(active, "theme.json"), "{\"id\":\"fixture-active\",\"name\":\"夏日站台 · 深色透明测试主题\",\"image\":\"background.png\"}");
            var saved = Path.Combine(uiRoot, "themes", "second"); Directory.CreateDirectory(saved);
            File.Copy(Path.Combine(active, "background.png"), Path.Combine(saved, "background.png"));
            File.WriteAllText(Path.Combine(saved, "theme.json"), "{\"id\":\"fixture-second\",\"name\":\"另一个保存的中文主题\",\"image\":\"background.png\"}");
            Directory.CreateDirectory(Path.Combine(uiRoot, "logs"));
            File.WriteAllText(Path.Combine(uiRoot, "logs", "operations.jsonl"),
                "{\"schemaVersion\":1,\"timestamp\":\"2026-10-08T08:00:00Z\",\"operationId\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"source\":\"shortcut\",\"action\":\"Apply\",\"stage\":\"verify\",\"outcome\":\"failure\",\"category\":\"verify-failed\",\"message\":\"测试加载失败：原启动设置已恢复\"}\n");
            var scriptRoot = Path.Combine(uiRoot, "engine"); Directory.CreateDirectory(Path.Combine(scriptRoot, "scripts"));
            File.WriteAllText(Path.Combine(scriptRoot, "scripts", "panel-operation.ps1"), "# fixture, never executed");
            var specialPath = Path.Combine(uiRoot, "中文 ' ; $value background.png");
            var request = PanelOperations.Request(scriptRoot, "Apply", new string('a', 32), saved, specialPath);
            if (request.UseShellExecute || request.ArgumentList.Contains("-Command") || !request.ArgumentList.Contains("RemoteSigned") ||
                request.ArgumentList.Last() != specialPath || request.ArgumentList[request.ArgumentList.IndexOf("-SavedThemeDirectory") + 1] != saved)
                throw new Exception("Panel request did not preserve independent literal arguments.");
            Console.WriteLine("PASS native bridge request preserves literal special/Unicode paths without command expressions");
            Environment.SetEnvironmentVariable("DREAMSKIN_LANG", "zh");
            using var form = new ManagerForm(uiRoot);
            form.ShowInTaskbar = false;
            form.StartPosition = FormStartPosition.Manual;
            form.Location = new System.Drawing.Point(-2000, -2000);
            form.Show();
            var prepare = form.PrepareInspectionAsync();
            var deadline = DateTime.UtcNow.AddSeconds(10);
            while (!prepare.IsCompleted && DateTime.UtcNow < deadline) { Application.DoEvents(); Thread.Sleep(10); }
            if (!prepare.IsCompleted) throw new Exception("Isolated UI preparation did not complete.");
            prepare.GetAwaiter().GetResult();
            var evidence = Path.Combine(Directory.GetCurrentDirectory(), ".local-evidence");
            Directory.CreateDirectory(evidence);
            foreach (var size in new[] { new System.Drawing.Size(980, 740), new System.Drawing.Size(640, 560) })
            {
                form.ClientSize = size;
                for (int page = 0; page < 2; page++)
                {
                    form.SelectInspectionPage(page); form.PerformLayout(); Application.DoEvents();
                    if (page == 1)
                    {
                        var logDeadline = DateTime.UtcNow.AddSeconds(5);
                        // ListView realizes its items when the tab becomes visible; await the tab's async refresh.
                        while (DateTime.UtcNow < logDeadline && (!form.LogInspectionStatus.Contains("reading=False") ||
                            !form.Controls.OfType<TabControl>().Single().TabPages[1].Controls.OfType<TableLayoutPanel>()
                                .Single().Controls.OfType<ListView>().Any(c => c.Items.Count == 1)))
                        { Application.DoEvents(); Thread.Sleep(10); }
                    }
                    static IEnumerable<Control> Descendants(Control parent)
                    {
                        foreach (Control child in parent.Controls) { yield return child; foreach (var nested in Descendants(child)) yield return nested; }
                    }
                    var controls = Descendants(form).ToArray();
                    if (page == 0 && (!controls.OfType<ListBox>().Any(c => c.Visible && c.Items.Count == 2) ||
                        !controls.OfType<Button>().Any(c => c.Visible && c.Text == "保存为启动设置") ||
                        !controls.OfType<PictureBox>().Any(c => c.Visible && c.Image != null)))
                        throw new Exception("Theme page controls or preview are missing from native rendering.");
                    if (page == 1 && !controls.OfType<ListView>().Any(c => c.Visible && c.Items.Count == 1))
                    {
                        var details = string.Join(";", controls.OfType<ListView>().Select(c => $"visible={c.Visible},count={c.Items.Count}"));
                        throw new Exception($"Log page did not render its isolated event: {details}; reader={new OperationLogStore(uiRoot).Read().Events.Count}; selected={form.Controls.OfType<TabControl>().Single().SelectedIndex}; {form.LogInspectionStatus}");
                    }
                    using var rendered = new System.Drawing.Bitmap(form.Width, form.Height);
                    form.DrawToBitmap(rendered, new System.Drawing.Rectangle(0, 0, form.Width, form.Height));
                    rendered.Save(Path.Combine(evidence, $"panel-{(page == 0 ? "theme" : "logs")}-{size.Width}.png"), System.Drawing.Imaging.ImageFormat.Png);
                }
            }
            if (Directory.EnumerateFiles(uiRoot, ".panel-result-*.json").Any() || File.Exists(Path.Combine(uiRoot, "theme-preferences.json")))
                throw new Exception("UI inspection unexpectedly mutated settings.");
            Console.WriteLine("PASS isolated Chinese theme and log pages rendered at normal/minimum sizes without starting an operation");
        }
        finally
        {
            Environment.SetEnvironmentVariable("DREAMSKIN_LANG", null);
            Directory.Delete(uiRoot, recursive: true);
        }

        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DreamSkin.NativeTest-" + Guid.NewGuid().ToString("N"));
        var name = "recycle-probe-主题 " + Guid.NewGuid().ToString("N");
        var directory = Path.Combine(root, name);
        Directory.CreateDirectory(directory);
        const string contents = "DreamSkin native Recycle Bin verification fixture.";
        File.WriteAllText(Path.Combine(directory, "probe.txt"), contents);
        var nested = Path.Combine("子目录", "背景.bin");
        Directory.CreateDirectory(Path.GetDirectoryName(Path.Combine(directory, nested))!);
        byte[] nestedContents = [0, 1, 127, 128, 255];
        File.WriteAllBytes(Path.Combine(directory, nested), nestedContents);
        try
        {
            var missingRejected = false;
            try { RecycleBin.MoveDirectory(Path.Combine(root, "missing"), IntPtr.Zero); }
            catch (Exception ex) when (ex is COMException or FileNotFoundException or DirectoryNotFoundException)
            { missingRejected = true; }
            if (!missingRejected || File.ReadAllText(Path.Combine(directory, "probe.txt")) != contents)
                throw new Exception("Missing recycle target was not rejected without changing its sibling.");
            Console.WriteLine("PASS missing recycle target fails without changing sibling fixture");

            RecycleBin.MoveDirectory(directory, IntPtr.Zero);
            if (Directory.Exists(directory)) throw new Exception("Recycled test directory still exists.");
            dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application", true)!)!;
            object? folder = null;
            object? items = null;
            bool found = false;
            try
            {
                folder = shell.NameSpace(10);
                items = ((dynamic)folder).Items();
                int count = ((dynamic)items).Count;
                for (var index = 0; index < count; index++)
                {
                    object item = ((dynamic)items).Item(index);
                    try
                    {
                        string itemName = ((dynamic)item).Name;
                        string original = Convert.ToString(((dynamic)item).ExtendedProperty("System.Recycle.DeletedFrom")) ?? "";
                        if (itemName == name && string.Equals(original.TrimEnd('\\'), root, StringComparison.OrdinalIgnoreCase))
                        {
                            string recycledPath = ((dynamic)item).Path;
                            if (File.ReadAllText(Path.Combine(recycledPath, "probe.txt")) != contents ||
                                !File.ReadAllBytes(Path.Combine(recycledPath, nested)).SequenceEqual(nestedContents))
                                throw new Exception("Recycled directory contents were not preserved.");
                            found = true;
                            break;
                        }
                    }
                    finally { Marshal.FinalReleaseComObject(item); }
                }
            }
            finally
            {
                if (items != null) Marshal.FinalReleaseComObject(items);
                if (folder != null) Marshal.FinalReleaseComObject(folder);
                Marshal.FinalReleaseComObject((object)shell);
            }
            if (!found) throw new Exception("The removed fixture was not found in the Windows Recycle Bin.");
            Console.WriteLine("PASS Unicode directory appears in Windows Recycle Bin with original location and intact nested contents");
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, recursive: true); }
    }
}
