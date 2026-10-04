using DreamSkin.ThemeManager;
using System.Runtime.InteropServices;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
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
