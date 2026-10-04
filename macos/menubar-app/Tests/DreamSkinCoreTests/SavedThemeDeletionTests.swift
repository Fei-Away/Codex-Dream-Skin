import Foundation
import XCTest
@testable import DreamSkinCore

final class SavedThemeDeletionTests: XCTestCase {
  private func fixture(_ test: (URL) throws -> Void) throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root.appendingPathComponent("themes/saved"), withIntermediateDirectories: true)
    try Data(#"{"id":"saved","name":"Saved"}"#.utf8)
      .write(to: root.appendingPathComponent("themes/saved/theme.json"))
    defer { try? FileManager.default.removeItem(at: root) }
    try test(root)
  }

  func testMovesOnlySelectedLibraryEntryAndPreservesPreferencesAndBackups() throws {
    try fixture { root in
      let fm = FileManager.default
      for name in ["theme-preferences.json", "original.zip", "rollback.json"] {
        try Data("preserve".utf8).write(to: root.appendingPathComponent(name))
      }
      let trash = root.appendingPathComponent("recycled")
      try SavedThemeDeletion.moveToTrash(id: "saved", stateRoot: root) { url in
        XCTAssertEqual(url.lastPathComponent, "saved")
        XCTAssertTrue(fm.fileExists(atPath: root.appendingPathComponent(".theme-switch.lock/owner").path))
        try fm.moveItem(at: url, to: trash)
      }
      XCTAssertTrue(fm.fileExists(atPath: trash.appendingPathComponent("theme.json").path))
      XCTAssertFalse(fm.fileExists(atPath: root.appendingPathComponent("themes/saved").path))
      XCTAssertFalse(fm.fileExists(atPath: root.appendingPathComponent(".theme-switch.lock").path))
      for name in ["theme-preferences.json", "original.zip", "rollback.json"] {
        XCTAssertEqual(try String(contentsOf: root.appendingPathComponent(name)), "preserve")
      }
    }
  }

  func testActiveThemeAndStateSelectedSourceAreProtected() throws {
    try fixture { root in
      let fm = FileManager.default
      try fm.createDirectory(at: root.appendingPathComponent("theme"), withIntermediateDirectories: true)
      try Data(#"{"id":"SAVED"}"#.utf8).write(to: root.appendingPathComponent("theme/theme.json"))
      XCTAssertThrowsError(try SavedThemeDeletion.moveToTrash(id: "saved", stateRoot: root) { _ in XCTFail("active theme recycled") })
      try Data(#"{"id":"different"}"#.utf8).write(to: root.appendingPathComponent("theme/theme.json"))
      try Data(#"{"themeId":"saved"}"#.utf8).write(to: root.appendingPathComponent("state.json"))
      XCTAssertThrowsError(try SavedThemeDeletion.moveToTrash(id: "saved", stateRoot: root) { _ in XCTFail("selected source recycled") })
    }
  }

  func testInvalidPathsSymlinksAndCorruptActiveMetadataAreRejected() throws {
    try fixture { root in
      for id in ["../saved", ".", "", "nested/saved"] {
        XCTAssertThrowsError(try SavedThemeDeletion.moveToTrash(id: id, stateRoot: root) { _ in XCTFail("invalid path recycled") })
      }
      let fm = FileManager.default
      try fm.createSymbolicLink(at: root.appendingPathComponent("themes/link"), withDestinationURL: root.appendingPathComponent("themes/saved"))
      XCTAssertThrowsError(try SavedThemeDeletion.moveToTrash(id: "link", stateRoot: root) { _ in XCTFail("link recycled") })
      try fm.createDirectory(at: root.appendingPathComponent("theme"), withIntermediateDirectories: true)
      try Data("broken".utf8).write(to: root.appendingPathComponent("theme/theme.json"))
      XCTAssertThrowsError(try SavedThemeDeletion.moveToTrash(id: "saved", stateRoot: root) { _ in XCTFail("unknown active theme recycled") })
      XCTAssertTrue(fm.fileExists(atPath: root.appendingPathComponent("themes/saved").path))
    }
  }

  func testBusyLockAndRecycleFailurePreserveTheme() throws {
    try fixture { root in
      let fm = FileManager.default
      let lock = root.appendingPathComponent(".theme-switch.lock")
      try fm.createDirectory(at: lock, withIntermediateDirectories: false)
      XCTAssertThrowsError(try SavedThemeDeletion.moveToTrash(id: "saved", stateRoot: root) { _ in XCTFail("busy operation recycled") })
      XCTAssertTrue(fm.fileExists(atPath: lock.path))
      try fm.removeItem(at: lock)
      XCTAssertThrowsError(try SavedThemeDeletion.moveToTrash(id: "saved", stateRoot: root) { _ in throw CocoaError(.fileWriteNoPermission) })
      XCTAssertFalse(fm.fileExists(atPath: lock.path))
      XCTAssertTrue(fm.fileExists(atPath: root.appendingPathComponent("themes/saved").path))
    }
  }

  func testImportAndRecoveryBlockDeletion() throws {
    try fixture { root in
      let fm = FileManager.default
      let lock = root.appendingPathComponent("themes/.theme-import.lock")
      try fm.createDirectory(at: lock, withIntermediateDirectories: false)
      XCTAssertThrowsError(try SavedThemeDeletion.moveToTrash(id: "saved", stateRoot: root) { _ in XCTFail("import in progress") })
      XCTAssertTrue(fm.fileExists(atPath: lock.path))
      try fm.removeItem(at: lock)
      try fm.createDirectory(at: root.appendingPathComponent("themes/.theme-replace-pending"), withIntermediateDirectories: false)
      XCTAssertThrowsError(try SavedThemeDeletion.moveToTrash(id: "saved", stateRoot: root) { _ in XCTFail("recovery pending") })
      XCTAssertFalse(fm.fileExists(atPath: lock.path))
      XCTAssertTrue(fm.fileExists(atPath: root.appendingPathComponent("themes/saved").path))
    }
  }
}
