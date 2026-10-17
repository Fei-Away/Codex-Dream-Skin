using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace DreamSkin.ThemeManager;

internal sealed record PreviewResult(Bitmap? Image, string Message);

// A local illustration has no CDP, browser or operation bridge. The fixed
// sample controls cannot capture conversations or apply a draft theme.
internal static class ImagePreview
{
    internal const int CanvasWidth = 960;
    internal const int CanvasHeight = 600;

    internal static PreviewResult Load(string path, ThemePreviewData theme, bool chinese)
    {
        var data = PreviewFiles.Read(path);
        using var stream = new MemoryStream(data.Bytes, writable: false);
        Image original;
        try { original = Image.FromStream(stream, useEmbeddedColorManagement: false, validateImageData: true); }
        catch (ArgumentException) when (data.Format == "WebP")
        {
            // A missing Windows decoder must not make an otherwise valid WebP
            // draft unselectable; the backend still validates it on save.
            return new(null, $"WebP · {data.Width} × {data.Height}");
        }
        using (original)
        {
            if (original.Width != data.Width || original.Height != data.Height) throw new StoreException("invalidImage");
            var canvas = new Bitmap(CanvasWidth, CanvasHeight);
            try
            {
                using var graphics = Graphics.FromImage(canvas);
                Render(graphics, original, theme, chinese);
                return new(canvas, $"{data.Format} · {data.Width} × {data.Height}");
            }
            catch { canvas.Dispose(); throw; }
        }
    }

    private static Color ColorOf(PreviewColor value) => Color.FromArgb(value.A, value.R, value.G, value.B);

    private static void Render(Graphics graphics, Image background, ThemePreviewData theme, bool chinese)
    {
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        var panel = ColorOf(theme.Panel);
        var alternate = ColorOf(theme.PanelAlt);
        var accent = ColorOf(theme.Accent);
        var text = ColorOf(theme.Text);
        var muted = ColorOf(theme.Muted);
        var line = ColorOf(theme.Line);
        string Copy(string en, string zh) => chinese ? zh : en;

        // Draw the wallpaper once across the shell. Repeating it inside panels
        // would hide the continuous-background effect being illustrated.
        graphics.Clear(Color.FromArgb(theme.Background.R, theme.Background.G, theme.Background.B));
        var scale = Math.Max((double)CanvasWidth / background.Width, (double)CanvasHeight / background.Height);
        var width = (float)(background.Width * scale);
        var height = (float)(background.Height * scale);
        graphics.DrawImage(background, new RectangleF((CanvasWidth - width) * (float)theme.FocusX,
            (CanvasHeight - height) * (float)theme.FocusY, width, height));

        // Real CSS and native window layout remain the renderer's responsibility.
        // Here the selected theme's transparency controls the sample surfaces.
        using (var mainWash = new SolidBrush(Color.FromArgb(theme.Panel.A, theme.Background.R, theme.Background.G, theme.Background.B)))
            graphics.FillRectangle(mainWash, 222, 48, CanvasWidth - 222, CanvasHeight - 48);
        using (var panelBrush = new SolidBrush(panel))
        {
            graphics.FillRectangle(panelBrush, 0, 0, CanvasWidth, 48);
            graphics.FillRectangle(panelBrush, 0, 48, 222, CanvasHeight - 48);
        }
        using (var separator = new Pen(line, 1.2f))
        {
            graphics.DrawLine(separator, 0, 48, CanvasWidth, 48);
            graphics.DrawLine(separator, 222, 48, 222, CanvasHeight);
        }
        Panel(graphics, new RectangleF(18, 15, 18, 18), accent, Color.Transparent, 5);
        Text(graphics, "Codex", new RectangleF(46, 10, 150, 30), 20, text, bold: true);
        Text(graphics, Copy("Theme preview", "主题预览"), new RectangleF(245, 13, 360, 26), 15, muted);
        using (var chrome = new Pen(muted, 1.5f))
        {
            graphics.DrawLine(chrome, 860, 24, 872, 24);
            graphics.DrawRectangle(chrome, 894, 18, 11, 11);
            graphics.DrawLine(chrome, 927, 18, 938, 29);
            graphics.DrawLine(chrome, 938, 18, 927, 29);
        }

        Text(graphics, Copy("WORKSPACE", "工作区"), new RectangleF(20, 66, 180, 22), 13, muted, bold: true);
        Panel(graphics, new RectangleF(14, 98, 194, 38), alternate, line, 9);
        Text(graphics, Copy("+  New task", "+  新建任务"), new RectangleF(28, 106, 165, 24), 16, text);
        Text(graphics, Copy("Example project", "示例项目"), new RectangleF(24, 158, 180, 25), 16, text, bold: true);
        Text(graphics, Copy("Recent tasks", "最近任务"), new RectangleF(24, 200, 175, 23), 13, muted);
        foreach (var (label, y) in new[] {
            (Copy("Plan a project", "整理项目计划"), 240),
            (Copy("Explore an idea", "探索一个想法"), 282),
            (Copy("Review changes", "检查改动"), 324) })
        {
            using var dot = new SolidBrush(muted);
            graphics.FillEllipse(dot, 26, y + 7, 6, 6);
            Text(graphics, label, new RectangleF(43, y, 155, 26), 15, text);
        }
        Text(graphics, Copy("Preview workspace", "预览工作区"), new RectangleF(24, 556, 180, 24), 13, muted);

        Text(graphics, Copy("Let's get started", "一起开始吧"), new RectangleF(260, 76, 650, 38), 26, text, bold: true);
        Text(graphics, Copy("An illustration of your theme and background", "当前主题与背景的大致效果"),
            new RectangleF(261, 117, 650, 26), 15, muted);
        Panel(graphics, new RectangleF(518, 164, 400, 70), alternate, line, 14);
        Text(graphics, Copy("Help me plan my next project.", "帮我整理下一个项目的计划。"),
            new RectangleF(538, 185, 358, 42), 17, text);
        Panel(graphics, new RectangleF(260, 258, 560, 112), panel, line, 14);
        Text(graphics, Copy("Start with a goal, then break it into small steps.", "先明确目标，再把任务拆成几个小步骤。"),
            new RectangleF(280, 279, 518, 49), 17, text);
        Text(graphics, Copy("Choose a small first step and keep moving.", "从一个小步骤开始，逐步完善。"),
            new RectangleF(280, 333, 518, 23), 13, muted);
        foreach (var (label, x) in new[] {
            (Copy("Plan tasks", "梳理任务"), 260),
            (Copy("Review code", "检查代码"), 450),
            (Copy("Explore ideas", "探索想法"), 640) })
        {
            Panel(graphics, new RectangleF(x, 401, 174, 38), alternate, line, 10);
            Text(graphics, label, new RectangleF(x + 17, 411, 145, 22), 14, text);
        }

        Panel(graphics, new RectangleF(260, 477, 658, 98), alternate, line, 16);
        Text(graphics, Copy("Describe a task…", "描述你的任务…"), new RectangleF(281, 494, 590, 28), 17, muted);
        Text(graphics, "+", new RectangleF(279, 537, 28, 26), 22, muted);
        Text(graphics, Copy("Example project", "示例项目"), new RectangleF(318, 542, 360, 23), 13, muted);
        Panel(graphics, new RectangleF(866, 531, 34, 30), accent, Color.Transparent, 8);
        var accentInk = theme.Accent.R * .299 + theme.Accent.G * .587 + theme.Accent.B * .114 > 150
            ? Color.FromArgb(25, 28, 32) : Color.White;
        Text(graphics, "↑", new RectangleF(875, 533, 22, 26), 21, accentInk, bold: true);
    }

    private static void Text(Graphics graphics, string value, RectangleF bounds, float size, Color color, bool bold = false)
    {
        using var font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel);
        using var brush = new SolidBrush(color);
        using var format = new StringFormat { Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.LineLimit };
        graphics.DrawString(value, font, brush, bounds, format);
    }

    private static void Panel(Graphics graphics, RectangleF bounds, Color fill, Color border, float radius)
    {
        var diameter = radius * 2;
        using var outline = new GraphicsPath();
        outline.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
        outline.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
        outline.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        outline.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        outline.CloseFigure();
        using var brush = new SolidBrush(fill);
        graphics.FillPath(brush, outline);
        if (border.A != 0)
        {
            using var pen = new Pen(border, 1.2f);
            graphics.DrawPath(pen, outline);
        }
    }
}
