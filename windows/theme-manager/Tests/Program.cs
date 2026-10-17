using DreamSkin.ThemeManager;
using System.Text.Json.Nodes;

int passed = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); passed++; Console.WriteLine($"PASS {name}"); }
void Refuses(Action action, string name)
{
    try { action(); }
    catch (Exception ex) when (ex is StoreException or System.Text.Json.JsonException or InvalidOperationException or IOException) { passed++; Console.WriteLine($"PASS {name}"); return; }
    throw new Exception($"Did not reject: {name}");
}
string root = Path.Combine(Directory.GetCurrentDirectory(), "windows", "theme-manager", ".test-data-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
void Theme(string directory, string id, string name = "Theme")
{
    Directory.CreateDirectory(directory);
    File.WriteAllText(Path.Combine(directory, "theme.json"), new JsonObject { ["id"] = id, ["name"] = name, ["colors"] = new JsonObject { ["panel"] = "rgba(10,20,30,0.65)" } }.ToJsonString());
}
try
{
    var store = new ThemeStore(root);
    string active = Path.Combine(root, "active-theme"), saved = Path.Combine(store.SavedRoot, "saved");
    Theme(active, "active"); Theme(saved, "saved", "中文主题");
    Check(store.Active()?.AuthoredTransparency == 35, "authored alpha is inverse transparency");
    Check(store.Override("active") == null, "missing preference follows theme");
    Check(ThemeStore.AuthoredTransparency("#fff8") == 47 && ThemeStore.AuthoredTransparency("#ffffff00") == 100, "hex alpha");
    Check(ThemeStore.AuthoredTransparency("rgba(1 2 3 / 70%)") == 30 && ThemeStore.AuthoredTransparency("rgb(1 2 3 / .4)") == 60, "slash and percentage alpha");
    Check(ThemeStore.AuthoredTransparency("rgb(1, 2, 3)") == 30 && ThemeStore.AuthoredTransparency(null) == 30, "opaque or absent authored color defaults to 30");
    File.WriteAllText(store.PreferencesPath, "{\"schemaVersion\":1,\"custom\":true,\"themes\":{\"other\":{\"transparency\":24.5,\"extra\":\"keep\"}}}");
    store.SetTransparency("active", 0);
    Check(store.Override("active") == 0 && store.Override("other") == 24.5, "zero override and other themes preserved");
    Check(store.ReadPreferences()["custom"]!.GetValue<bool>() && store.ReadPreferences()["themes"]!["other"]!["extra"]!.GetValue<string>() == "keep", "unknown fields preserved");
    store.SetTransparency("active", 100); Check(store.Override("active") == 100, "full transparency override");
    store.SetTransparency("active", null); Check(store.Override("active") == null && store.Override("other") == 24.5, "follow removes only selected override");
    Refuses(() => store.SetTransparency("active", 101), "out of range override");
    Refuses(() => store.SetTransparency("old-active", 50), "changed active theme is not written");
    File.WriteAllText(store.PreferencesPath, "{\"schemaVersion\":2,\"themes\":{}}");
    var before = File.ReadAllText(store.PreferencesPath);
    Refuses(() => store.SetTransparency("active", 40), "unknown schema refused");
    Check(File.ReadAllText(store.PreferencesPath) == before, "invalid preferences not overwritten");
    File.WriteAllText(store.PreferencesPath, "{\"schemaVersion\":1,\"themes\":{\"bad\":{\"transparency\":-1}}}");
    Refuses(() => store.SetTransparency("active", 40), "invalid other theme preference refused");
    File.WriteAllText(store.PreferencesPath, new string(' ', 262145));
    Refuses(() => store.ReadPreferences(), "oversized preference file");
    File.Delete(store.PreferencesPath);
    var selection = store.List().Single();
    Check(selection.Name == "中文主题", "saved theme unicode name");
    store.ValidateDeletion(selection); Check(Directory.Exists(saved), "inactive deletion validates without mutation");
    Refuses(() => store.ValidateDeletion(selection with { Directory = active }), "outside library deletion");
    Refuses(() => store.ValidateDeletion(selection with { Directory = Path.Combine(saved, "..", "..", "active-theme") }), "path traversal deletion");
    Theme(saved, "active"); Refuses(() => store.ValidateDeletion(ThemeStore.ReadTheme(saved)), "active theme deletion");
    Theme(saved, "ACTIVE"); Refuses(() => store.ValidateDeletion(ThemeStore.ReadTheme(saved)), "active theme ID ignores case");
    Theme(active, "preset-gothic-void-crusade"); Theme(saved, "GOTHIC-VOID-CRUSADE");
    Refuses(() => store.ValidateDeletion(ThemeStore.ReadTheme(saved)), "active Gothic preset alias");
    Theme(active, "active");
    Theme(saved, "replacement"); Refuses(() => store.ValidateDeletion(selection), "replaced selected theme");
    Theme(saved, "saved");
    File.WriteAllText(Path.Combine(active, "theme.json"), "{"); Refuses(() => store.ValidateDeletion(selection), "invalid active state deletion");
    File.Delete(Path.Combine(active, "theme.json")); store.ValidateDeletion(selection); Check(Directory.Exists(saved), "never-applied saved theme may be deleted");
    Theme(active, "active");
    var hidden = Path.Combine(store.SavedRoot, ".backup"); Theme(hidden, "backup");
    Refuses(() => store.ValidateDeletion(ThemeStore.ReadTheme(hidden)), "transaction backup deletion");
    Check(store.List().Count == 1, "hidden transaction directories not listed");
    var journal = Path.Combine(store.SavedRoot, ".theme-replace-" + new string('a', 32) + ".json");
    File.WriteAllText(journal, "{}");
    Refuses(() => store.ValidateDeletion(selection), "unfinished import recovery blocks deletion");
    File.Delete(journal);
    // Symlink creation on Windows requires Developer Mode or elevation; junction tests run separately on Windows.
    if (!OperatingSystem.IsWindows())
    {
        string link = Path.Combine(saved, "redirect");
        Directory.CreateSymbolicLink(link, active);
        Refuses(() => store.ValidateDeletion(selection), "nested redirected deletion");
        Directory.Delete(link);
        string alias = Path.Combine(store.SavedRoot, "alias");
        Directory.CreateSymbolicLink(alias, active);
        Refuses(() => store.ValidateDeletion(selection with { Directory = alias }), "saved directory symlink");
        Directory.Delete(alias);
        File.CreateSymbolicLink(store.PreferencesPath, Path.Combine(active, "theme.json"));
        Refuses(() => store.SetTransparency("active", 40), "redirected preferences write");
        File.Delete(store.PreferencesPath);
    }
    Check(!Directory.EnumerateFiles(root, ".theme-preferences-*.tmp").Any(), "atomic write leaves no temporary files");
    var resultPath = Path.Combine(root, ".panel-result-test.json");
    var operationId = new string('a', 32);
    var result = new JsonObject { ["schemaVersion"] = 1, ["operationId"] = operationId, ["action"] = "Apply", ["outcome"] = "success",
        ["category"] = "none", ["message"] = "Loaded", ["diskRecovery"] = "not-needed", ["visibleRecovery"] = "not-needed" };
    File.WriteAllText(resultPath, result.ToJsonString());
    Check(PanelResult.Read(resultPath, operationId, "Apply").Outcome == "success", "matched versioned result accepted");
    Refuses(() => PanelResult.Read(resultPath, new string('b', 32), "Apply"), "stale operation result refused");
    Refuses(() => PanelResult.Read(resultPath, operationId, "Save"), "result action mismatch refused");
    result["outcome"] = "started"; File.WriteAllText(resultPath, result.ToJsonString());
    Refuses(() => PanelResult.Read(resultPath, operationId, "Apply"), "process-started result cannot claim apply success");
    result["outcome"] = "success"; result["schemaVersion"] = 2; File.WriteAllText(resultPath, result.ToJsonString());
    Refuses(() => PanelResult.Read(resultPath, operationId, "Apply"), "unknown result schema refused");
    result["schemaVersion"] = 1; result["diskRecovery"] = "pretend-restored"; File.WriteAllText(resultPath, result.ToJsonString());
    Refuses(() => PanelResult.Read(resultPath, operationId, "Apply"), "unknown recovery state refused");
    result["diskRecovery"] = "not-needed"; result["category"] = "verify-failed"; File.WriteAllText(resultPath, result.ToJsonString());
    Refuses(() => PanelResult.Read(resultPath, operationId, "Apply"), "contradictory success category refused");
    var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCekAAAAASUVORK5CYII=");
    var imagePath = Path.Combine(root, "背景 ' $test;.png"); File.WriteAllBytes(imagePath, png);
    Check(PreviewFiles.Read(imagePath).Width == 1, "bounded PNG dimensions with special path");
    var themeData = SafeFiles.ReadObject(Path.Combine(active, "theme.json"));
    themeData["image"] = "../outside.png"; File.WriteAllText(Path.Combine(active, "theme.json"), themeData.ToJsonString());
    Refuses(() => PreviewFiles.Background(ThemeStore.ReadTheme(active)), "preview theme image traversal refused");
    var huge = png.ToArray(); huge[16] = 0; huge[17] = 1; huge[18] = 0; huge[19] = 0; File.WriteAllBytes(imagePath, huge);
    Refuses(() => PreviewFiles.Read(imagePath), "preview rejects large dimensions before decode");
    File.WriteAllBytes(imagePath, new byte[PreviewFiles.MaxBytes + 1]);
    Refuses(() => PreviewFiles.Read(imagePath), "preview image byte limit");
    File.WriteAllBytes(imagePath, [1, 2, 3]); Refuses(() => PreviewFiles.Read(imagePath), "fake PNG image refused");
    var previewDirectory = Path.Combine(root, "preview-theme");
    Directory.CreateDirectory(previewDirectory);
    ThemePreviewData Preview(string fields, double? transparency = null, bool preferDark = true, int authored = 30)
    {
        File.WriteAllText(Path.Combine(previewDirectory, "theme.json"), "{\"id\":\"preview\"," + fields + "}");
        return ThemePreviewData.Read(new(previewDirectory, "preview", "Preview", authored), transparency, preferDark);
    }
    var illustrated = Preview("\"appearance\":\"dark\",\"colors\":{\"background\":\"#123\",\"panel\":\"rgba(10, 20, 30, .25)\",\"panelAlt\":\"#456\",\"text\":\"#abcd\",\"muted\":\"#12345678\",\"line\":\"rgba(1 2 3 / 20%)\"}");
    Check(illustrated.Background == new PreviewColor(17, 34, 51), "illustration parses short RGB hex");
    Check(illustrated.Panel == new PreviewColor(10, 20, 30, 64) && illustrated.Transparency == 75,
        "illustration authored panel alpha supplies inverse transparency");
    Check(illustrated.PanelAlt == new PreviewColor(68, 85, 102, 64), "illustration panels share effective transparency");
    Check(illustrated.Text == new PreviewColor(170, 187, 204, 221) && illustrated.Muted == new PreviewColor(18, 52, 86, 120),
        "illustration keeps text alpha independent from surfaces");
    Check(illustrated.Line == new PreviewColor(1, 2, 3, 51), "illustration parses space slash alpha");
    Check(Preview("\"colors\":{\"panel\":\"#0008\"}").Panel.A == 136,
        "illustration short hex authored alpha retained");
    Check(Preview("\"colors\":{\"panel\":\"#ffffff80\"}").Panel.A == 128,
        "illustration long hex authored alpha retained");
    Check(Preview("\"colors\":{\"accent\":\"rgb(100%, 0%, 50%)\"}").Accent == new PreviewColor(255, 0, 128),
        "illustration percentage RGB channels");
    Check(Preview("\"colors\":{\"accent\":\"rgb(1 2 3 / .4)\"}").Accent == new PreviewColor(1, 2, 3, 102),
        "illustration modern RGB decimal alpha");
    var opaque = Preview("\"colors\":{\"panel\":\"rgba(4,5,6,.25)\"}", 0);
    var transparent = Preview("\"colors\":{\"panel\":\"rgba(4,5,6,.25)\"}", 100);
    Check(opaque.Panel.A == 255 && opaque.Transparency == 0 && transparent.Panel.A == 0 && transparent.Transparency == 100,
        "illustration honors zero and full transparency overrides");
    Check(Preview("\"colors\":{}", double.NaN).Transparency == 30 && Preview("\"colors\":{}", 101).Transparency == 30,
        "illustration invalid transparency override falls back");
    Check(Preview("\"colors\":{}", authored: 45).Transparency == 45 && Preview("\"colors\":{}", authored: -1).Transparency == 30,
        "illustration authored fallback bounded with neutral default");
    Check(Preview("\"appearance\":\"dark\"", preferDark: false).IsDark && !Preview("\"appearance\":\"light\"").IsDark,
        "illustration explicit appearance takes precedence over host preference");
    Check(Preview("\"appearance\":\"auto\"").IsDark && !Preview("\"appearance\":\"auto\"", preferDark: false).IsDark,
        "illustration auto appearance follows host preference without sampling wallpaper");
    var neutralDark = Preview("\"colors\":{}");
    var neutralLight = Preview("\"appearance\":\"light\",\"colors\":{}");
    Check(neutralDark.Panel.R < neutralLight.Panel.R && neutralDark.Text.R > neutralLight.Text.R,
        "illustration neutral palettes preserve dark and light contrast");
    Check(Preview("\"colors\":{},\"palette\":{\"accent\":\"#abcdef\"}").Accent == new PreviewColor(171, 205, 239),
        "illustration empty colors accepts legacy palette accent");
    Check(Preview("\"colors\":{\"accent\":\"#123456\"},\"palette\":{\"accent\":\"#abcdef\"}").Accent == new PreviewColor(18, 52, 86),
        "illustration nonempty colors takes precedence over legacy palette");
    Check(Preview("\"colors\":{\"accent\":\"#abcdef\",\"panel\":\"#123456\"},\"explicitColorKeys\":[\"accent\"]").Panel.R == neutralDark.Panel.R,
        "illustration explicit key list excludes undeclared surface overrides");
    Check(Preview("\"colorMode\":\"adaptive\",\"colors\":{\"accent\":\"#abcdef\"}").Accent == neutralDark.Accent,
        "illustration adaptive mode avoids treating sampled colors as explicit");
    Check(Preview("\"appearance\":\"auto\",\"colors\":{\"panel\":\"#000\"}", preferDark: false).Panel.R == neutralLight.Panel.R,
        "illustration auto light does not inherit legacy dark surfaces");
    Check(Preview("\"appearance\":\"auto\",\"colorMode\":\"explicit\",\"colors\":{\"panel\":\"#123456\"}", preferDark: false).Panel.R == 18,
        "illustration explicit mode retains authored light appearance surfaces");
    var focus = Preview("\"art\":{\"focusX\":-2,\"focusY\":4}");
    Check(focus.FocusX == 0 && focus.FocusY == 1 && Preview("\"art\":{\"focusX\":0.72,\"focusY\":0.45}").FocusX == .72,
        "illustration focus positions clamp numeric bounds");
    Check(Preview("\"art\":{\"focusX\":\"0.9\",\"focusY\":{}}").FocusX == .5 && Preview("\"art\":[]").FocusY == .5,
        "illustration malformed focus uses center");
    foreach (var invalid in new[] { "var(--private-color)", "url(file:///private)", "#ggg", "rgb(256,0,0)", "rgba(1,2,3,2)", "rgb(NaN 0 0)", new string('x', 10000) })
    {
        var fields = new JsonObject { ["colors"] = new JsonObject { ["accent"] = invalid } }.ToJsonString();
        Check(Preview(fields[1..^1]).Accent == neutralDark.Accent, "illustration rejects unsupported or oversized color: " + invalid[..Math.Min(invalid.Length, 24)]);
    }
    Check(Preview("\"colors\":{\"accent\":[],\"panel\":{}},\"appearance\":true").Accent == neutralDark.Accent,
        "illustration malformed optional values use safe defaults");
    File.WriteAllText(Path.Combine(previewDirectory, "theme.json"), "{\"id\":\"replacement\"}");
    Refuses(() => ThemePreviewData.Read(new(previewDirectory, "preview", "Preview", 30), null, true),
        "illustration refuses a replaced theme identity");
    File.WriteAllText(Path.Combine(previewDirectory, "theme.json"), "{\"id\":true}");
    Refuses(() => ThemePreviewData.Read(new(previewDirectory, "preview", "Preview", 30), null, true),
        "illustration refuses an invalid theme identity type");
    File.WriteAllText(Path.Combine(previewDirectory, "theme.json"), new string(' ', 262145));
    Refuses(() => ThemePreviewData.Read(new(previewDirectory, "preview", "Preview", 30), null, true),
        "illustration theme JSON read remains bounded");
    var logs = new OperationLogStore(root); Directory.CreateDirectory(logs.DirectoryPath);
    var log = new JsonObject { ["schemaVersion"] = 1, ["timestamp"] = "2026-10-08T08:00:00Z", ["operationId"] = operationId,
        ["source"] = "shortcut", ["action"] = "Apply", ["stage"] = "verify", ["outcome"] = "failure", ["category"] = "verify-failed", ["message"] = "中文加载失败" };
    var logPath = Path.Combine(logs.DirectoryPath, "operations.jsonl");
    File.WriteAllText(logPath, log.ToJsonString() + "\n{broken}\n{\"timestamp\":");
    var read = logs.Read(); Check(read.Events.Count == 1 && read.Skipped == 1 && read.Events[0].Message == "中文加载失败", "malformed and unfinished logs preserve valid events");
    log["timestamp"] = "2026-10-07T08:00:00Z";
    File.WriteAllText(Path.Combine(logs.DirectoryPath, "operations.1.jsonl"), log.ToJsonString() + "\n");
    Check(logs.Read().Events[0].Timestamp.Day == 8 && logs.Read(1).Truncated, "rotated events ordered and bounded");
    File.WriteAllText(logPath, new string('中', 400000) + "\n" + log.ToJsonString() + "\n");
    Check(logs.Read().Events.Count == 2 && logs.Read().Truncated, "tail read skips partial UTF-8 without losing recent logs");
    var user = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    Check(!OperationLogStore.Redact(user + "\\private token=secret").Contains(user) &&
        !OperationLogStore.Redact("token=secret").Contains("secret"), "diagnostic copy redacts user path and secrets");
    Check(!OperationLogStore.Redact("{\"token\":\"private-value\",\"message\":\"Bearer private-value sk-private-value\"}").Contains("private-value"), "JSON credentials bearer and API key redacted");
    Console.WriteLine($"{passed} checks passed.");
}
finally { Directory.Delete(root, recursive: true); }
