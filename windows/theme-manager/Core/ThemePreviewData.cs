using System.Globalization;
using System.Text.Json.Nodes;

namespace DreamSkin.ThemeManager;

public readonly record struct PreviewColor(byte R, byte G, byte B, byte A = 255);

// This is an illustration model, not a CSS evaluator or a replacement for renderer verification.
public sealed record ThemePreviewData(PreviewColor Background, PreviewColor Panel, PreviewColor PanelAlt,
    PreviewColor Accent, PreviewColor Text, PreviewColor Muted, PreviewColor Line,
    double FocusX, double FocusY, double Transparency, bool IsDark)
{
    public static ThemePreviewData Read(SavedTheme theme, double? transparencyOverride, bool preferDark)
    {
        var data = SafeFiles.ReadObject(Path.Combine(theme.Directory, "theme.json"));
        // A selection can outlive an import or replacement of the same directory.
        var id = String(data["id"]);
        if (string.IsNullOrWhiteSpace(id) || id.Length > 256 || id != theme.Id) throw new StoreException("themeChanged");
        var dark = String(data["appearance"]) switch { "dark" => true, "light" => false, _ => preferDark };
        var declared = data["colors"] as JsonObject;
        var colors = declared is { Count: > 0 } ? declared : data["palette"] as JsonObject;
        var explicitKeys = data["explicitColorKeys"] as JsonArray;
        var colorMode = String(data["colorMode"]);
        bool Explicit(string key) => key == "accent" && String((data["palette"] as JsonObject)?["accent"]) != null ||
            (explicitKeys != null ? explicitKeys.Any(node => String(node) == key) :
                declared?.ContainsKey(key) == true && (colorMode is null or "explicit"));
        bool Allowed(string key) => Explicit(key) && !(!dark && (String(data["appearance"]) is null or "auto") &&
            colorMode != "explicit" && (key is "background" or "panel" or "panelAlt" or "text" or "muted"));
        // Match the renderer's explicit-color boundary; auto light mode must not inherit legacy dark surfaces.
        PreviewColor Pick(string key, PreviewColor fallback) =>
            Allowed(key) && Parse(String(colors?[key]), out var color, out _) ? color : fallback;
        var panel = Pick("panel", dark ? new(21, 22, 25) : new(251, 252, 253));
        var transparency = theme.AuthoredTransparency is >= 0 and <= 100
            ? theme.AuthoredTransparency : 30d;
        if (Allowed("panel") && Parse(String(colors?["panel"]), out _, out var alpha) && alpha.HasValue)
            transparency = (1 - alpha.Value) * 100;
        if (transparencyOverride is { } requested && double.IsFinite(requested) && requested is >= 0 and <= 100)
            transparency = requested;
        var surfaceAlpha = Byte(255 * (1 - transparency / 100));
        var art = data["art"] as JsonObject;
        // Wallpaper luminance must not override an explicitly chosen light/dark appearance.
        return new(Pick("background", dark ? new(13, 14, 16) : new(245, 247, 249)),
            panel with { A = surfaceAlpha },
            Pick("panelAlt", dark ? new(31, 33, 36) : new(235, 239, 243)) with { A = surfaceAlpha },
            Pick("accent", dark ? new(130, 178, 235) : new(43, 105, 178)),
            Pick("text", dark ? new(237, 239, 243) : new(29, 33, 39)),
            Pick("muted", dark ? new(169, 177, 189) : new(99, 109, 121)),
            Pick("line", dark ? new(130, 178, 235, 71) : new(43, 105, 178, 61)),
            Focus(art?["focusX"]), Focus(art?["focusY"]), transparency, dark);
    }

    private static string? String(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
    private static double Focus(JsonNode? node) => node is JsonValue value && value.TryGetValue<double>(out var number) && double.IsFinite(number)
        ? Math.Clamp(number, 0, 1) : .5;
    private static byte Byte(double value) => (byte)Math.Round(value, MidpointRounding.AwayFromZero);

    private static bool Parse(string? source, out PreviewColor color, out double? authoredAlpha)
    {
        color = default;
        authoredAlpha = null;
        // Bound untrusted color strings before parsing; unsupported CSS simply uses neutral colors.
        if (source == null || source.Length > 128) return false;
        var text = source.Trim();
        if (text.StartsWith('#'))
        {
            var hex = text[1..];
            if (hex.Length is not (3 or 4 or 6 or 8) || !hex.All(Uri.IsHexDigit)) return false;
            if (hex.Length is 3 or 4) hex = string.Concat(hex.Select(c => new string(c, 2)));
            byte Channel(int index) => byte.Parse(hex.AsSpan(index, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture);
            color = new(Channel(0), Channel(2), Channel(4), hex.Length == 8 ? Channel(6) : (byte)255);
            if (hex.Length == 8) authoredAlpha = color.A / 255d;
            return true;
        }
        var open = text.IndexOf('(');
        if (open < 0 || !text.EndsWith(')') ||
            !(text[..open].Equals("rgb", StringComparison.OrdinalIgnoreCase) || text[..open].Equals("rgba", StringComparison.OrdinalIgnoreCase))) return false;
        var body = text[(open + 1)..^1];
        string[] channels;
        string? alpha = null;
        if (body.Contains(','))
        {
            if (body.Contains('/')) return false;
            var parts = body.Split(',');
            if (parts.Length is not (3 or 4)) return false;
            channels = parts[..3];
            if (parts.Length == 4) alpha = parts[3];
        }
        else
        {
            var parts = body.Split('/');
            if (parts.Length > 2) return false;
            channels = parts[0].Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 2) alpha = parts[1];
        }
        if (channels.Length != 3) return false;
        var values = new byte[3];
        for (int i = 0; i < values.Length; i++)
        {
            if (!Number(channels[i], 255, out var number)) return false;
            values[i] = Byte(number);
        }
        double opacity = 1;
        if (alpha != null)
        {
            if (!Number(alpha, 1, out opacity)) return false;
            authoredAlpha = opacity;
        }
        color = new(values[0], values[1], values[2], Byte(opacity * 255));
        return true;
    }

    private static bool Number(string token, double maximum, out double value)
    {
        token = token.Trim();
        bool percent = token.EndsWith('%');
        if (percent) token = token[..^1];
        if (!double.TryParse(token, NumberStyles.AllowDecimalPoint | NumberStyles.AllowLeadingSign,
            CultureInfo.InvariantCulture, out value) || !double.IsFinite(value) || value < 0 || value > (percent ? 100 : maximum)) return false;
        if (percent) value = value / 100 * maximum;
        return true;
    }
}
