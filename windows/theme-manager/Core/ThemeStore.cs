using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace DreamSkin.ThemeManager;

public sealed class StoreException(string code) : Exception(code);
public sealed record SavedTheme(string Directory, string Id, string Name, int AuthoredTransparency);

public static class SafeFiles
{
    public static void CheckPath(string path)
    {
        for (string? current = Path.GetFullPath(path); current != null; current = Path.GetDirectoryName(current))
        {
            try
            {
                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new StoreException("unsafePath");
            }
            catch (FileNotFoundException) { }
            catch (DirectoryNotFoundException) { }
        }
    }

    public static JsonObject ReadObject(string path, int limit = 262144)
    {
        CheckPath(path);
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        if (stream.Length > limit) throw new StoreException("invalidData");
        var bytes = new byte[limit + 1];
        int length = 0;
        while (length < bytes.Length)
        {
            int count = stream.Read(bytes, length, bytes.Length - length);
            if (count == 0) break;
            length += count;
        }
        if (length > limit) throw new StoreException("invalidData");
        return JsonNode.Parse(bytes.AsSpan(0, length)) as JsonObject ?? throw new StoreException("invalidData");
    }

    public static void CheckTree(string directory)
    {
        CheckPath(directory);
        var pending = new Stack<string>();
        pending.Push(directory);
        int count = 0;
        while (pending.Count != 0)
            foreach (var entry in Directory.EnumerateFileSystemEntries(pending.Pop()))
            {
                if (++count > 4096) throw new StoreException("unsafePath");
                var attributes = File.GetAttributes(entry);
                if ((attributes & FileAttributes.ReparsePoint) != 0) throw new StoreException("unsafePath");
                if ((attributes & FileAttributes.Directory) != 0) pending.Push(entry);
            }
    }
}

public sealed class ThemeStore(string root)
{
    public string Root { get; } = Path.GetFullPath(root);
    public string SavedRoot => Path.Combine(Root, "themes");
    public string PreferencesPath => Path.Combine(Root, "theme-preferences.json");
    public SavedTheme? Active()
    {
        var directory = Path.Combine(Root, "active-theme");
        SafeFiles.CheckPath(Path.Combine(directory, "theme.json"));
        return File.Exists(Path.Combine(directory, "theme.json")) ? ReadTheme(directory) : null;
    }

    public IReadOnlyList<SavedTheme> List()
    {
        SafeFiles.CheckPath(SavedRoot);
        if (!Directory.Exists(SavedRoot)) return [];
        var result = new List<SavedTheme>();
        foreach (var directory in Directory.EnumerateDirectories(SavedRoot))
        {
            if (Path.GetFileName(directory).StartsWith('.')) continue;
            try { result.Add(ReadTheme(directory)); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Text.Json.JsonException or InvalidOperationException or StoreException) { }
        }
        return result.OrderBy(t => t.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
    }

    public static SavedTheme ReadTheme(string directory)
    {
        var data = SafeFiles.ReadObject(Path.Combine(directory, "theme.json"));
        var id = data["id"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(id) || id.Length > 256) throw new StoreException("invalidData");
        var name = data["name"]?.GetValue<string>();
        return new(directory, id, string.IsNullOrWhiteSpace(name) ? Path.GetFileName(directory) : name,
            AuthoredTransparency(data["colors"]?["panel"]?.GetValue<string>()));
    }

    public JsonObject ReadPreferences()
    {
        SafeFiles.CheckPath(PreferencesPath);
        if (!File.Exists(PreferencesPath)) return new JsonObject { ["schemaVersion"] = 1, ["themes"] = new JsonObject() };
        var data = SafeFiles.ReadObject(PreferencesPath);
        if (data["schemaVersion"]?.GetValue<int>() != 1 || data["themes"] is not JsonObject themes)
            throw new StoreException("invalidData");
        foreach (var entry in themes)
            if (entry.Value is not JsonObject value || value["transparency"] is not JsonValue number ||
                !number.TryGetValue<double>(out var transparency) || !double.IsFinite(transparency) || transparency < 0 || transparency > 100)
                throw new StoreException("invalidData");
        return data;
    }

    public double? Override(string id) => ReadPreferences()["themes"]?[id]?["transparency"]?.GetValue<double>();

    // Caller holds the existing per-user Operation and ThemeImport mutexes.
    public void SetTransparency(string expectedActiveId, int? value)
    {
        if (value is < 0 or > 100) throw new StoreException("invalidData");
        if (Active()?.Id != expectedActiveId) throw new StoreException("activeChanged");
        var preferences = ReadPreferences();
        var themes = (JsonObject)preferences["themes"]!;
        if (value == null) themes.Remove(expectedActiveId);
        else
        {
            var entry = themes[expectedActiveId] as JsonObject ?? new JsonObject();
            entry["transparency"] = value;
            if (entry.Parent == null) themes[expectedActiveId] = entry;
        }
        var bytes = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(preferences);
        if (bytes.Length > 262144) throw new StoreException("invalidData");
        SafeFiles.CheckPath(Root);
        Directory.CreateDirectory(Root);
        var temporary = Path.Combine(Root, ".theme-preferences-" + Guid.NewGuid().ToString("N") + ".tmp");
        try
        {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                stream.Write(bytes);
                stream.Flush(true);
            }
            SafeFiles.CheckPath(PreferencesPath);
            File.Move(temporary, PreferencesPath, overwrite: true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    public void ValidateDeletion(SavedTheme selected)
    {
        var full = Path.GetFullPath(selected.Directory);
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (!string.Equals(Path.GetDirectoryName(full), SavedRoot, comparison) || Path.GetFileName(full).StartsWith('.'))
            throw new StoreException("unsafePath");
        SafeFiles.CheckPath(SavedRoot);
        if (Directory.EnumerateFileSystemEntries(SavedRoot).Any(path =>
            Regex.IsMatch(Path.GetFileName(path), @"^\.theme-replace-[a-f0-9]{32}\.json$")))
            throw new StoreException("recoveryPending");
        SafeFiles.CheckTree(full);
        var current = ReadTheme(full);
        if (current.Id != selected.Id) throw new StoreException("themeChanged");
        var active = Active();
        if (active != null && SameThemeId(active.Id, current.Id)) throw new StoreException("activeTheme");
    }

    public static bool SameThemeId(string first, string second)
    {
        static string Canonical(string id) => id.Equals("preset-gothic-void-crusade", StringComparison.OrdinalIgnoreCase) ? "gothic-void-crusade" : id;
        return string.Equals(Canonical(first), Canonical(second), StringComparison.OrdinalIgnoreCase);
    }

    public static int AuthoredTransparency(string? panel)
    {
        if (panel == null) return 30;
        var value = panel.Trim().ToLowerInvariant();
        double alpha;
        if (Regex.IsMatch(value, "^#(?:[0-9a-f]{4}|[0-9a-f]{8})$", RegexOptions.CultureInvariant))
        {
            var hex = value.Length == 5 ? new string(value[^1], 2) : value[^2..];
            alpha = int.Parse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture) / 255d;
        }
        else
        {
            var match = Regex.Match(value, @"^rgba?\([^()]*[,/]\s*([0-9]*\.?[0-9]+%?)\s*\)$", RegexOptions.CultureInvariant);
            if (!match.Success) return 30;
            // A comma rgb() without a fourth component has no authored alpha.
            if (!value.Contains('/') && value.Count(c => c == ',') != 3) return 30;
            var token = match.Groups[1].Value;
            if (!double.TryParse(token.TrimEnd('%'), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out alpha)) return 30;
            if (token.EndsWith('%')) alpha /= 100;
        }
        return alpha is >= 0 and <= 1 ? (int)Math.Round((1 - alpha) * 100, MidpointRounding.AwayFromZero) : 30;
    }
}
