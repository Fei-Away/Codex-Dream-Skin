import Foundation
import Darwin

public enum SavedThemeDeletionError: Error {
  case invalidTheme, activeTheme, busy
}

/// Shares the existing switch lock so a theme cannot become active during deletion.
public enum SavedThemeDeletion {
  public static func moveToTrash(
    id: String,
    stateRoot: URL,
    recycle: (URL) throws -> Void
  ) throws {
    let fm = FileManager.default
    guard id.range(of: #"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$"#, options: .regularExpression) != nil else {
      throw SavedThemeDeletionError.invalidTheme
    }
    let rootValues = try stateRoot.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
    guard rootValues.isDirectory == true, rootValues.isSymbolicLink != true else {
      throw SavedThemeDeletionError.invalidTheme
    }
    let lock = stateRoot.appendingPathComponent(".theme-switch.lock", isDirectory: true)
    guard mkdir(lock.path, 0o700) == 0 else { throw SavedThemeDeletionError.busy }
    defer { try? fm.removeItem(at: lock) }
    try Data("\(ProcessInfo.processInfo.processIdentifier)\n".utf8)
      .write(to: lock.appendingPathComponent("owner"))
    try Data(UUID().uuidString.utf8).write(to: lock.appendingPathComponent("token"))

    let library = stateRoot.appendingPathComponent("themes", isDirectory: true)
    let candidate = library.appendingPathComponent(id, isDirectory: true)
    for directory in [stateRoot, library, candidate] {
      let values = try directory.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
      guard values.isDirectory == true, values.isSymbolicLink != true else {
        throw SavedThemeDeletionError.invalidTheme
      }
    }
    let importLock = library.appendingPathComponent(".theme-import.lock", isDirectory: true)
    guard mkdir(importLock.path, 0o700) == 0 else { throw SavedThemeDeletionError.busy }
    defer { try? fm.removeItem(at: importLock) }
    let owner: [String: Any] = [
      "pid": ProcessInfo.processInfo.processIdentifier,
      "token": UUID().uuidString.lowercased(),
      "createdAt": ISO8601DateFormatter().string(from: Date())
    ]
    try JSONSerialization.data(withJSONObject: owner)
      .write(to: importLock.appendingPathComponent("owner.json"))
    // A pending import may restore its previous directory on the next launch.
    guard try !fm.contentsOfDirectory(atPath: library.path).contains(where: {
      $0.hasPrefix(".theme-replace-")
    }) else { throw SavedThemeDeletionError.busy }
    guard candidate.resolvingSymlinksInPath().deletingLastPathComponent()
      == library.resolvingSymlinksInPath() else { throw SavedThemeDeletionError.invalidTheme }
    let selected = try readObject(candidate.appendingPathComponent("theme.json"))
    guard let selectedID = selected["id"] as? String, !selectedID.isEmpty else {
      throw SavedThemeDeletionError.invalidTheme
    }
    let activeURL = stateRoot.appendingPathComponent("theme/theme.json")
    if fm.fileExists(atPath: activeURL.path) {
      let active = try readObject(activeURL)
      guard let activeID = active["id"] as? String, !activeID.isEmpty else {
        throw SavedThemeDeletionError.invalidTheme
      }
      if matches(activeID, id) || matches(activeID, selectedID) {
        throw SavedThemeDeletionError.activeTheme
      }
    }
    // The selected source can differ from the JSON ID after an import collision.
    let stateURL = stateRoot.appendingPathComponent("state.json")
    if fm.fileExists(atPath: stateURL.path),
       let stateID = try readObject(stateURL)["themeId"] as? String,
       matches(stateID, id) || matches(stateID, selectedID) {
      throw SavedThemeDeletionError.activeTheme
    }
    try recycle(candidate)
  }

  private static func matches(_ left: String, _ right: String) -> Bool {
    let aliases = ["preset-gothic-void-crusade", "gothic-void-crusade"]
    let a = left.lowercased(), b = right.lowercased()
    return a == b || (aliases.contains(a) && aliases.contains(b))
  }

  private static func readObject(_ url: URL) throws -> [String: Any] {
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true else {
      throw SavedThemeDeletionError.invalidTheme
    }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    let data = try handle.read(upToCount: 1_048_577) ?? Data()
    guard data.count <= 1_048_576,
          let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw SavedThemeDeletionError.invalidTheme
    }
    return object
  }
}
