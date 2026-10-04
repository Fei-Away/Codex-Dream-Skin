import Foundation
import XCTest
@testable import DreamSkinCore

final class ThemeTransparencyTests: XCTestCase {
  func testAuthoredAlphaAndLegacyFallback() {
    XCTAssertEqual(authoredThemeTransparency(panel: nil), 30)
    XCTAssertEqual(authoredThemeTransparency(panel: "#112233"), 30)
    XCTAssertEqual(authoredThemeTransparency(panel: "#1e1e1e55"), 67)
    XCTAssertEqual(authoredThemeTransparency(panel: "#1230"), 100)
    XCTAssertEqual(authoredThemeTransparency(panel: "#123f"), 0)
    XCTAssertEqual(authoredThemeTransparency(panel: "rgba(1, 2, 3, 0.25)"), 75)
    XCTAssertEqual(authoredThemeTransparency(panel: "rgba(1 2 3 / 40%)"), 60)
    XCTAssertEqual(authoredThemeTransparency(panel: "rgba(1, 2, 3, 2)"), 30)
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
    preferences.themes["room"] = nil
    try preferences.write(to: url)
    let reset = try ThemeTransparencyPreferences.read(from: url)
    XCTAssertNil(reset.themes["room"])
    XCTAssertEqual(reset.themes["mist"]?.transparency, 66.7)
    for invalid in [
      #"{"schemaVersion":2,"themes":{}}"#,
      #"{"schemaVersion":1,"themes":{"room":{"transparency":101}}}"#,
    ] {
      try Data(invalid.utf8).write(to: url)
      XCTAssertThrowsError(try ThemeTransparencyPreferences.read(from: url))
    }
  }
}
