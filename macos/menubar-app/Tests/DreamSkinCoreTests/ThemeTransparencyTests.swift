import Foundation
import XCTest
@testable import DreamSkinCore

final class ThemeTransparencyTests: XCTestCase {
  func testAuthoredAlphaAndLegacyFallback() {
    XCTAssertEqual(authoredThemeTransparency(panel: nil), 37)
    XCTAssertEqual(authoredThemeTransparency(panel: "#112233"), 37)
    XCTAssertEqual(authoredThemeTransparency(panel: "#1e1e1e55"), 67)
    XCTAssertEqual(authoredThemeTransparency(panel: "#1230"), 100)
    XCTAssertEqual(authoredThemeTransparency(panel: "#123f"), 0)
    XCTAssertEqual(authoredThemeTransparency(panel: "rgba(1, 2, 3, 0.25)"), 75)
    XCTAssertEqual(authoredThemeTransparency(panel: "rgba(1 2 3 / 40%)"), 60)
    XCTAssertEqual(authoredThemeTransparency(panel: "rgba(1, 2, 3, 2)"), 37)
  }

  func testThemeOverridesPersistIndependentlyAndReset() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("theme-preferences.json")
    var preferences = try ThemeTransparencyPreferences.read(from: url)
    XCTAssertTrue(preferences.themes.isEmpty)
    preferences.themes["room"] = .init(transparency: 0)
    preferences.themes["mist"] = .init(transparency: 66.7)
    try preferences.write(to: url)
    XCTAssertEqual(try ThemeTransparencyPreferences.read(from: url), preferences)
    preferences.themes["room"]?.surfaceTransparency = .init(
      composer: 45, composerFocused: 51, sidebar: 10, message: 0, messageFocused: 37
    )
    preferences.themes["room"]?.transparency = nil
    try preferences.write(to: url)
    let reset = try ThemeTransparencyPreferences.read(from: url)
    XCTAssertNil(reset.themes["room"]?.transparency)
    XCTAssertEqual(reset.themes["room"]?.surfaceTransparency?.composer, 45)
    XCTAssertEqual(reset.themes["room"]?.surfaceTransparency?.composerFocused, 51)
    XCTAssertEqual(reset.themes["room"]?.surfaceTransparency?.messageFocused, 37)
    XCTAssertEqual(reset.themes["mist"]?.transparency, 66.7)
    preferences.themes["room"]?.surfaceTransparency?.composer = nil
    try preferences.write(to: url)
    XCTAssertNil(try ThemeTransparencyPreferences.read(from: url).themes["room"]?.surfaceTransparency?.composer)
    preferences.themes["room"]?.transparencyEnabled = false
    preferences.themes["room"]?.followTheme = true
    try preferences.write(to: url)
    let mode = try ThemeTransparencyPreferences.read(from: url).themes["room"]
    XCTAssertEqual(mode?.transparencyEnabled, false)
    XCTAssertEqual(mode?.followTheme, true)
    XCTAssertEqual(mode?.surfaceTransparency?.sidebar, 10)
    for invalid in [
      #"{"schemaVersion":2,"themes":{}}"#,
      #"{"schemaVersion":1,"themes":{"room":{"transparency":101}}}"#,
      #"{"schemaVersion":1,"themes":{"room":{"surfaceTransparency":{"sidebar":101}}}}"#,
      #"{"schemaVersion":1,"themes":{"room":{"surfaceTransparency":{"composerFocused":-1}}}}"#,
      #"{"schemaVersion":1,"themes":{"room":{"surfaceTransparency":{}}}}"#,
      #"{"schemaVersion":1,"themes":{"room":{"surfaceTransparency":{"composer":20,"toolbar":30}}}}"#,
      #"{"schemaVersion":1,"themes":{"room":{}}}"#,
      #"{"schemaVersion":1,"themes":{"room":{"transparencyEnabled":0}}}"#,
      #"{"schemaVersion":1,"themes":{"room":{"transparency":10,"transparencyEnabled":null}}}"#,
      #"{"schemaVersion":1,"themes":{"room":{"followTheme":"true"}}}"#,
    ] {
      try Data(invalid.utf8).write(to: url)
      XCTAssertThrowsError(try ThemeTransparencyPreferences.read(from: url))
    }
  }
}
