using System.Diagnostics;

namespace DreamSkin.ThemeManager;

internal static class PanelOperations
{
    internal static ProcessStartInfo Request(string engineRoot, string action, string operationId,
        string? themeDirectory, string? backgroundPath)
    {
        if (action is not ("Save" or "Apply" or "Shortcut") ||
            !System.Text.RegularExpressions.Regex.IsMatch(operationId, "^[a-f0-9]{32}$")) throw new StoreException("invalidData");
        var script = Path.Combine(engineRoot, "scripts", "panel-operation.ps1");
        SafeFiles.CheckPath(script);
        if (!File.Exists(script)) throw new StoreException("missingBridge");
        // Pin the OS-provided host, rather than resolving a potentially shadowed PATH entry.
        var host = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
        var info = new ProcessStartInfo(host) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = engineRoot };
        foreach (var value in new[] { "-NoProfile", "-ExecutionPolicy", "RemoteSigned", "-File", script, "-Action", action, "-OperationId", operationId })
            info.ArgumentList.Add(value);
        if (themeDirectory != null) { info.ArgumentList.Add("-SavedThemeDirectory"); info.ArgumentList.Add(themeDirectory); }
        if (backgroundPath != null) { info.ArgumentList.Add("-BackgroundPath"); info.ArgumentList.Add(backgroundPath); }
        return info;
    }

    internal static async Task<PanelResult> Run(string root, string action, string? themeDirectory, string? backgroundPath)
    {
        var id = Guid.NewGuid().ToString("N");
        var engine = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", ".."));
        var info = Request(engine, action, id, themeDirectory, backgroundPath);
        using var process = Process.Start(info) ?? throw new StoreException("launchFailed");
        // The child can show the existing restart confirmation. Do not time out and kill a transaction
        // waiting for the user's answer; closing the panel is blocked while it is in flight.
        await process.WaitForExitAsync();
        var path = Path.Combine(root, ".panel-result-" + id + ".json");
        var result = PanelResult.Read(path, id, action);
        if (process.ExitCode != 0 && result.Outcome == "success") throw new StoreException("invalidResult");
        try
        {
            SafeFiles.CheckPath(path);
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or StoreException) { /* Preserve a valid outcome if housekeeping fails. */ }
        return result;
    }
}
