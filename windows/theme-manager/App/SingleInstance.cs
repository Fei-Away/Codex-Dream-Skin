using System.Security.Principal;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DreamSkin.ThemeManager;

internal sealed class SingleInstance : IDisposable
{
    private readonly Mutex mutex;
    private readonly EventWaitHandle activation;
    public bool IsPrimary { get; }

    public SingleInstance(string? testSuffix = null)
    {
        var sid = WindowsIdentity.GetCurrent().User?.Value ?? throw new InvalidOperationException("Current user is unavailable.");
        var name = $"Local\\CodexDreamSkin.{sid}.ThemeManager{testSuffix}";
        // Open the event first, so a second launch during startup is remembered.
        activation = new EventWaitHandle(false, EventResetMode.AutoReset, name + ".Activate");
        mutex = new Mutex(false, name);
        try { IsPrimary = mutex.WaitOne(0); }
        catch (AbandonedMutexException) { IsPrimary = true; }
        if (!IsPrimary)
        {
            AllowExistingWindowToActivate();
            activation.Set();
        }
    }

    private static void AllowExistingWindowToActivate()
    {
        var executable = Environment.ProcessPath;
        if (executable == null) return;
        foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(executable)))
        {
            using (process)
            {
                try
                {
                    if (process.Id != Environment.ProcessId && string.Equals(process.MainModule?.FileName, executable, StringComparison.OrdinalIgnoreCase))
                        AllowSetForegroundWindow((uint)process.Id);
                }
                catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException or NotSupportedException) { }
            }
        }
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AllowSetForegroundWindow(uint processId);

    public bool TakeActivationRequest() => activation.WaitOne(0);

    public void Dispose()
    {
        if (IsPrimary) mutex.ReleaseMutex();
        mutex.Dispose();
        activation.Dispose();
    }
}
