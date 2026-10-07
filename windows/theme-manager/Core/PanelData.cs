using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace DreamSkin.ThemeManager;

public sealed record PanelResult(string OperationId, string Action, string Outcome, string Category,
    string Message, string DiskRecovery, string VisibleRecovery)
{
    public static PanelResult Read(string path, string expectedId, string expectedAction)
    {
        if (!Regex.IsMatch(expectedId, "^[a-f0-9]{32}$") || expectedAction is not ("Save" or "Apply" or "Shortcut"))
            throw new StoreException("invalidResult");
        var data = SafeFiles.ReadObject(path, 32768);
        if (data["schemaVersion"]?.GetValue<int>() != 1 || Text(data, "operationId", 32) != expectedId ||
            Text(data, "action", 16) != expectedAction) throw new StoreException("invalidResult");
        var outcome = Text(data, "outcome", 16);
        if (outcome is not ("success" or "failure" or "cancelled")) throw new StoreException("invalidResult");
        var category = Text(data, "category", 128);
        if (!Regex.IsMatch(category, "^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$") || (outcome == "success" && category != "none") ||
            (outcome == "cancelled" && category != "cancelled")) throw new StoreException("invalidResult");
        return new(expectedId, expectedAction, outcome, category, Text(data, "message", 4096),
            Recovery(data, "diskRecovery"), Recovery(data, "visibleRecovery"));
    }

    private static string Recovery(JsonObject data, string key)
    {
        var text = Text(data, key, 32);
        if (text is not ("not-needed" or "restored" or "blocked" or "superseded" or "verified" or "unverified"))
            throw new StoreException("invalidResult");
        return text;
    }

    internal static string Text(JsonObject data, string key, int limit)
    {
        var value = data[key]?.GetValue<string>() ?? throw new StoreException("invalidData");
        if (value.Length > limit) throw new StoreException("invalidData");
        return value;
    }
}

public sealed record OperationEvent(DateTimeOffset Timestamp, string OperationId, string Source, string Action,
    string Stage, string Outcome, string Category, string Message, string Details);
public sealed record LogReadResult(IReadOnlyList<OperationEvent> Events, int Skipped, bool Truncated);

public sealed class OperationLogStore(string root)
{
    public string DirectoryPath { get; } = Path.Combine(Path.GetFullPath(root), "logs");
    public LogReadResult Read(int maxEvents = 1000)
    {
        if (maxEvents is < 1 or > 5000) throw new ArgumentOutOfRangeException(nameof(maxEvents));
        SafeFiles.CheckPath(DirectoryPath);
        var result = new List<OperationEvent>();
        int skipped = 0;
        bool truncated = false;
        // Read the newest file first. Each tail is bounded even if the writer failed to rotate.
        foreach (var name in new[] { "operations.jsonl", "operations.1.jsonl", "operations.2.jsonl", "operations.3.jsonl", "operations.4.jsonl" })
        {
            var path = Path.Combine(DirectoryPath, name);
            SafeFiles.CheckPath(path);
            if (!File.Exists(path)) continue;
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            const int maxBytes = 1048576;
            var start = Math.Max(0, stream.Length - maxBytes);
            stream.Position = start;
            var bytes = new byte[maxBytes];
            int count = 0;
            while (count < bytes.Length)
            {
                int next = stream.Read(bytes, count, bytes.Length - count);
                if (next == 0) break;
                count += next;
            }
            int offset = 0;
            if (start != 0) { truncated = true; var newline = Array.IndexOf(bytes, (byte)'\n', 0, count); offset = newline < 0 ? count : newline + 1; }
            var text = new UTF8Encoding(false, false).GetString(bytes, offset, count - offset);
            var lines = text.Split('\n');
            // Skip an unfinished trailing record while a concurrent writer is appending it.
            for (int i = lines.Length - 2; i >= 0; i--)
            {
                var line = lines[i].Trim();
                if (line.Length == 0) continue;
                if (line.Length > 16384) { skipped++; continue; }
                try
                {
                    var data = JsonNode.Parse(line) as JsonObject ?? throw new StoreException("invalidData");
                    if (data["schemaVersion"]?.GetValue<int>() != 1 || !Regex.IsMatch(PanelResult.Text(data, "operationId", 32), "^[a-f0-9]{32}$")) throw new StoreException("invalidData");
                    foreach (var field in new[] { "source", "action", "stage", "outcome", "category" })
                        if (!Regex.IsMatch(PanelResult.Text(data, field, 80), "^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$")) throw new StoreException("invalidData");
                    if (!DateTimeOffset.TryParse(PanelResult.Text(data, "timestamp", 64), out var timestamp)) throw new StoreException("invalidData");
                    result.Add(new(timestamp, PanelResult.Text(data, "operationId", 128), PanelResult.Text(data, "source", 64),
                        PanelResult.Text(data, "action", 64), PanelResult.Text(data, "stage", 128), PanelResult.Text(data, "outcome", 64),
                        PanelResult.Text(data, "category", 128), PanelResult.Text(data, "message", 4096), line));
                }
                catch (Exception ex) when (ex is JsonException or InvalidOperationException or StoreException) { skipped++; }
                if (result.Count >= maxEvents) return new(result.OrderByDescending(e => e.Timestamp).ToArray(), skipped, true);
            }
        }
        return new(result.OrderByDescending(e => e.Timestamp).ToArray(), skipped, truncated);
    }

    public static string Redact(string contents)
    {
        foreach (var folder in new[] { Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData) }
            .Where(p => !string.IsNullOrEmpty(p)).OrderByDescending(p => p.Length))
        {
            contents = contents.Replace(folder, "<user>", StringComparison.OrdinalIgnoreCase)
                .Replace(folder.Replace('\\', '/'), "<user>", StringComparison.OrdinalIgnoreCase)
                .Replace(folder.Replace("\\", "\\\\"), "<user>", StringComparison.OrdinalIgnoreCase);
        }
        contents = Regex.Replace(contents, "(?i)(\"(?:authorization|api[_-]?key|token|secret|password|accessToken|refreshToken)\"\\s*:\\s*)\"(?:\\\\.|[^\"\\\\])*\"", "$1\"<redacted>\"");
        contents = Regex.Replace(contents, @"(?i)(authorization|api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;]+", "$1=<redacted>");
        contents = Regex.Replace(contents, @"(?i)\bbearer\s+[^\s,;""\\]+", "Bearer <redacted>");
        contents = Regex.Replace(contents, @"(?i)\bsk-[a-z0-9_-]+", "<redacted>");
        return Regex.Replace(contents, @"(?i)[a-z]:[\\/][^\r\n""<>|]*|\\\\[^\s""<>|]+", "<local-path>");
    }
}

public static class PreviewFiles
{
    public const int MaxBytes = 10 * 1024 * 1024;
    public static string Background(SavedTheme theme)
    {
        var data = SafeFiles.ReadObject(Path.Combine(theme.Directory, "theme.json"));
        var image = data["image"]?.GetValue<string>() ?? throw new StoreException("invalidData");
        if (image.Length > 256 || image is "." or ".." || image.IndexOfAny(['/', '\\', ':']) >= 0 || Path.IsPathRooted(image))
            throw new StoreException("unsafePath");
        var path = Path.Combine(theme.Directory, image);
        SafeFiles.CheckPath(path);
        return path;
    }

    public static (byte[] Bytes, int Width, int Height, string Format) Read(string path)
    {
        SafeFiles.CheckPath(path);
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (stream.Length is <= 0 or > MaxBytes) throw new StoreException("invalidImage");
        var bytes = new byte[(int)stream.Length];
        stream.ReadExactly(bytes);
        var metadata = Dimensions(bytes);
        if (metadata.Width is <= 0 or > 16384 || metadata.Height is <= 0 or > 16384 ||
            (long)metadata.Width * metadata.Height > 50000000) throw new StoreException("invalidImage");
        return (bytes, metadata.Width, metadata.Height, metadata.Format);
    }

    public static (int Width, int Height, string Format) Dimensions(byte[] b)
    {
        static int Be(byte[] b, int i) => checked((int)((uint)b[i] << 24 | (uint)b[i + 1] << 16 | (uint)b[i + 2] << 8 | b[i + 3]));
        static int Le24(byte[] b, int i) => b[i] | b[i + 1] << 8 | b[i + 2] << 16;
        try
        {
            if (b.Length >= 24 && b.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) &&
                Be(b, 8) == 13 && Encoding.ASCII.GetString(b, 12, 4) == "IHDR") return (Be(b, 16), Be(b, 20), "PNG");
            if (b.Length >= 12 && b[0] == 255 && b[1] == 216)
            {
                for (int i = 2; i + 4 < b.Length;)
                {
                    if (b[i++] != 255) continue;
                    while (i < b.Length && b[i] == 255) i++;
                    if (i >= b.Length) break;
                    var marker = b[i++];
                    if (marker is 217 or 218) break;
                    if (marker is 1 or >= 208 and <= 216) continue;
                    if (i + 2 > b.Length) break;
                    var length = b[i] << 8 | b[i + 1];
                    if (length < 2 || i + length > b.Length) break;
                    if (marker is 192 or 193 or 194 or 195 or 197 or 198 or 199 or 201 or 202 or 203 or 205 or 206 or 207 && length >= 7)
                        return (b[i + 5] << 8 | b[i + 6], b[i + 3] << 8 | b[i + 4], "JPEG");
                    i += length;
                }
            }
            if (b.Length >= 20 && Encoding.ASCII.GetString(b, 0, 4) == "RIFF" && Encoding.ASCII.GetString(b, 8, 4) == "WEBP")
            {
                for (int i = 12; i + 8 <= b.Length;)
                {
                    var type = Encoding.ASCII.GetString(b, i, 4);
                    uint size = (uint)(b[i + 4] | b[i + 5] << 8 | b[i + 6] << 16 | b[i + 7] << 24);
                    int d = i + 8;
                    if (size > b.Length - d) break;
                    if (type == "VP8X" && size >= 10) return (Le24(b, d + 4) + 1, Le24(b, d + 7) + 1, "WebP");
                    if (type == "VP8L" && size >= 5 && b[d] == 47)
                        return (1 + b[d + 1] + ((b[d + 2] & 63) << 8), 1 + (b[d + 2] >> 6) + (b[d + 3] << 2) + ((b[d + 4] & 15) << 10), "WebP");
                    if (type == "VP8 " && size >= 10 && b[d + 3] == 157 && b[d + 4] == 1 && b[d + 5] == 42)
                        return ((b[d + 6] | b[d + 7] << 8) & 16383, (b[d + 8] | b[d + 9] << 8) & 16383, "WebP");
                    i = checked(d + (int)size + (int)(size % 2));
                }
            }
        }
        catch (OverflowException) { throw new StoreException("invalidImage"); }
        throw new StoreException("invalidImage");
    }
}
