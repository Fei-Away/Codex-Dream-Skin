using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("Codex Dream Skin control panel launcher")]
[assembly: AssemblyDescription("Codex Dream Skin control panel launcher")]
[assembly: AssemblyCompany("Codex Dream Skin")]
[assembly: AssemblyProduct("Codex Dream Skin")]
[assembly: AssemblyCopyright("Copyright (c) 2026")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

internal static class CodexDreamSkinLauncher
{
    private const int MinimumPort = 1024;
    private const int MaximumPort = 65535;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint SearchPath(
        string path,
        string fileName,
        string extension,
        int bufferLength,
        StringBuilder buffer,
        out IntPtr filePart);

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            int? port = ParsePort(args);
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (String.IsNullOrWhiteSpace(localAppData))
            {
                return ShowError("无法确定当前用户的本地应用数据目录。");
            }

            string engineRoot = Path.GetFullPath(Path.Combine(localAppData, "CodexDreamSkin", "engine"));
            string consoleScript = Path.GetFullPath(Path.Combine(engineRoot, "scripts", "console-dream-skin.ps1"));
            if (!File.Exists(consoleScript))
            {
                return ShowError("Dream Skin 运行时不完整，请重新运行安装程序。\r\n\r\n缺少：" + consoleScript);
            }

            string powerShell = FindPowerShell7(engineRoot);
            if (powerShell == null)
            {
                return ShowError("未找到 PowerShell 7（pwsh.exe）。请先安装 PowerShell 7。 ");
            }

            StringBuilder arguments = new StringBuilder();
            arguments.Append("-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File ");
            arguments.Append(QuoteArgument(consoleScript));
            if (port.HasValue)
            {
                arguments.Append(" -Port ");
                arguments.Append(port.Value.ToString(System.Globalization.CultureInfo.InvariantCulture));
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = powerShell;
            startInfo.Arguments = arguments.ToString();
            startInfo.WorkingDirectory = engineRoot;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;

            Process process = Process.Start(startInfo);
            if (process == null)
            {
                return ShowError("无法启动 Codex Dream Skin 控制面板。");
            }
            process.Dispose();
            return 0;
        }
        catch (ArgumentException error)
        {
            return ShowError(error.Message);
        }
        catch (Exception error)
        {
            return ShowError("启动 Codex Dream Skin 控制面板失败。\r\n\r\n" + error.Message);
        }
    }

    private static int? ParsePort(string[] args)
    {
        if (args == null || args.Length == 0)
        {
            return null;
        }
        if (args.Length != 2 || !String.Equals(args[0], "-Port", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("仅支持可选参数：-Port <1024-65535>。");
        }

        int port;
        if (!Int32.TryParse(args[1], out port) || port < MinimumPort || port > MaximumPort)
        {
            throw new ArgumentException("端口必须是 1024 到 65535 之间的整数。");
        }
        return port;
    }

    private static string FindPowerShell7(string engineRoot)
    {
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string[] candidates = new string[]
        {
            Path.Combine(programFiles, "PowerShell", "7", "pwsh.exe"),
            Path.Combine(localAppData, "Microsoft", "WindowsApps", "pwsh.exe")
        };
        foreach (string candidate in candidates)
        {
            string resolved = ResolvePowerShellCandidate(candidate, engineRoot);
            if (resolved != null)
            {
                return resolved;
            }
        }

        StringBuilder buffer = new StringBuilder(32768);
        IntPtr filePart;
        uint length = SearchPath(null, "pwsh.exe", null, buffer.Capacity, buffer, out filePart);
        if (length > 0 && length < buffer.Capacity)
        {
            return ResolvePowerShellCandidate(buffer.ToString(), engineRoot);
        }
        return null;
    }

    private static string ResolvePowerShellCandidate(string candidate, string engineRoot)
    {
        if (String.IsNullOrWhiteSpace(candidate) || !File.Exists(candidate))
        {
            return null;
        }

        string resolved = Path.GetFullPath(candidate);
        if (IsPathWithin(resolved, engineRoot))
        {
            return null;
        }
        return resolved;
    }

    private static bool IsPathWithin(string candidate, string root)
    {
        string normalizedRoot = Path.GetFullPath(root).TrimEnd(
            Path.DirectorySeparatorChar,
            Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        string normalizedCandidate = Path.GetFullPath(candidate);
        return normalizedCandidate.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase);
    }

    private static string QuoteArgument(string value)
    {
        if (value == null)
        {
            return "\"\"";
        }

        StringBuilder result = new StringBuilder();
        result.Append('"');
        int backslashes = 0;
        foreach (char character in value)
        {
            if (character == '\\')
            {
                backslashes += 1;
                continue;
            }
            if (character == '"')
            {
                result.Append('\\', (backslashes * 2) + 1);
                result.Append('"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes);
            backslashes = 0;
            result.Append(character);
        }
        result.Append('\\', backslashes * 2);
        result.Append('"');
        return result.ToString();
    }

    private static int ShowError(string message)
    {
        MessageBox.Show(
            message,
            "Codex Dream Skin",
            MessageBoxButtons.OK,
            MessageBoxIcon.Error);
        return 2;
    }
}
