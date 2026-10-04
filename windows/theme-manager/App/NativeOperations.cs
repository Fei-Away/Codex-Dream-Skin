using System.Runtime.InteropServices;
using System.Security.Principal;

namespace DreamSkin.ThemeManager;

internal sealed class OperationLease : IDisposable
{
    private readonly List<Mutex> held = [];
    public OperationLease()
    {
        var sid = WindowsIdentity.GetCurrent().User?.Value ?? throw new StoreException("busy");
        try
        {
            foreach (var suffix in new[] { "Operation", "ThemeImport" })
            {
                var mutex = new Mutex(false, $"Local\\CodexDreamSkin.{sid}.{suffix}");
                bool acquired;
                try { acquired = mutex.WaitOne(0); }
                catch (AbandonedMutexException) { acquired = true; }
                if (!acquired) { mutex.Dispose(); throw new StoreException("busy"); }
                held.Add(mutex);
            }
        }
        catch { Dispose(); throw; }
    }
    public void Dispose()
    {
        for (var i = held.Count - 1; i >= 0; i--) { held[i].ReleaseMutex(); held[i].Dispose(); }
        held.Clear();
    }
}

internal static class RecycleBin
{
    // RECYCLEONDELETE requires recycling; there is no permanent-delete fallback.
    public static void MoveDirectory(string path, IntPtr owner)
    {
        object? item = null;
        IFileOperation? operation = null;
        try
        {
            var iid = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
            Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item));
            operation = (IFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("3ad05575-8857-4850-9277-11b85bdb8e09"), true)!)!;
            operation.SetOwnerWindow(owner);
            operation.SetOperationFlags(0x0004 | 0x0010 | 0x0040 | 0x0400 | 0x00080000 | 0x00100000);
            operation.DeleteItem(item, IntPtr.Zero);
            operation.PerformOperations();
            operation.GetAnyOperationsAborted(out bool aborted);
            if (aborted || Directory.Exists(path)) throw new StoreException("recycleFailed");
        }
        finally
        {
            if (operation != null) Marshal.FinalReleaseComObject(operation);
            if (item != null) Marshal.FinalReleaseComObject(item);
        }
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    private static extern int SHCreateItemFromParsingName(string path, IntPtr bindContext, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object item);

    [ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOperation
    {
        void Advise(IntPtr sink, out uint cookie);
        void Unadvise(uint cookie);
        void SetOperationFlags(uint flags);
        void SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string message);
        void SetProgressDialog(IntPtr dialog);
        void SetProperties(IntPtr properties);
        void SetOwnerWindow(IntPtr owner);
        void ApplyPropertiesToItem([MarshalAs(UnmanagedType.Interface)] object item);
        void ApplyPropertiesToItems([MarshalAs(UnmanagedType.IUnknown)] object items);
        void RenameItem([MarshalAs(UnmanagedType.Interface)] object item, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
        void RenameItems([MarshalAs(UnmanagedType.IUnknown)] object items, [MarshalAs(UnmanagedType.LPWStr)] string name);
        void MoveItem([MarshalAs(UnmanagedType.Interface)] object item, [MarshalAs(UnmanagedType.Interface)] object destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
        void MoveItems([MarshalAs(UnmanagedType.IUnknown)] object items, [MarshalAs(UnmanagedType.Interface)] object destination);
        void CopyItem([MarshalAs(UnmanagedType.Interface)] object item, [MarshalAs(UnmanagedType.Interface)] object destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
        void CopyItems([MarshalAs(UnmanagedType.IUnknown)] object items, [MarshalAs(UnmanagedType.Interface)] object destination);
        void DeleteItem([MarshalAs(UnmanagedType.Interface)] object item, IntPtr sink);
        void DeleteItems([MarshalAs(UnmanagedType.IUnknown)] object items);
        void NewItem([MarshalAs(UnmanagedType.Interface)] object destination, uint attributes, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, IntPtr sink);
        void PerformOperations();
        void GetAnyOperationsAborted([MarshalAs(UnmanagedType.Bool)] out bool aborted);
    }
}
