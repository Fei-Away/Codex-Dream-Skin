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
