import Foundation
import CoreFoundation

public struct ThemeTransparencyPreferences: Codable, Equatable {
  public struct Surfaces: Codable, Equatable {
    public var composer: Double?
    public var composerFocused: Double?
    public var sidebar: Double?
    public var message: Double?
    public var messageFocused: Double?

    public init(composer: Double? = nil, composerFocused: Double? = nil,
                sidebar: Double? = nil, message: Double? = nil, messageFocused: Double? = nil) {
      self.composer = composer
      self.composerFocused = composerFocused
      self.sidebar = sidebar
      self.message = message
      self.messageFocused = messageFocused
    }

    public var isEmpty: Bool {
      composer == nil && composerFocused == nil && sidebar == nil
        && message == nil && messageFocused == nil
    }
    public var isValid: Bool {
      !isEmpty && [composer, composerFocused, sidebar, message, messageFocused].compactMap { $0 }
        .allSatisfy { $0.isFinite && (0...100).contains($0) }
    }
  }

  public struct Entry: Codable, Equatable {
    public var transparency: Double?
    public var surfaceTransparency: Surfaces?
    public var transparencyEnabled: Bool?
    public var followTheme: Bool?

    public init(transparency: Double? = nil, surfaceTransparency: Surfaces? = nil,
                transparencyEnabled: Bool? = nil, followTheme: Bool? = nil) {
      self.transparency = transparency
      self.surfaceTransparency = surfaceTransparency
      self.transparencyEnabled = transparencyEnabled
      self.followTheme = followTheme
    }

    public var isEmpty: Bool {
      transparency == nil && surfaceTransparency?.isEmpty != false
        && transparencyEnabled == nil && followTheme == nil
    }
    public var isValid: Bool {
      !isEmpty && transparency.map { $0.isFinite && (0...100).contains($0) } != false
        && surfaceTransparency.map(\.isValid) != false
    }
  }
  public var schemaVersion = 1
  public var themes: [String: Entry] = [:]
  public init() {}

  public static func read(from url: URL) throws -> Self {
    guard FileManager.default.fileExists(atPath: url.path) else { return Self() }
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    let data = try handle.read(upToCount: 262_145) ?? Data()
    guard data.count <= 262_144 else { throw CocoaError(.fileReadTooLarge) }
    let result = try JSONDecoder().decode(Self.self, from: data)
    let raw = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let rawThemes = raw?["themes"] as? [String: [String: Any]]
    let allowedSurfaces: Set<String> = ["composer", "composerFocused", "sidebar", "message", "messageFocused"]
    guard result.schemaVersion == 1,
          let rawThemes,
          rawThemes.values.allSatisfy({ entry in
            for key in ["transparencyEnabled", "followTheme"] where entry.keys.contains(key) {
              guard let value = entry[key] as? NSNumber,
                    CFGetTypeID(value) == CFBooleanGetTypeID() else { return false }
            }
            guard let surfaces = entry["surfaceTransparency"] as? [String: Any] else { return true }
            return Set(surfaces.keys).isSubset(of: allowedSurfaces)
          }),
          result.themes.values.allSatisfy(\.isValid) else {
      throw CocoaError(.fileReadCorruptFile)
    }
    return result
  }

  public func write(to url: URL) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try encoder.encode(self).write(to: url, options: .atomic)
  }
}

/// Transparency is the inverse of the author's background alpha.
public func authoredThemeTransparency(panel: String?) -> Int {
  guard let panel else { return 37 }
  let value = panel.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  var alpha: Double?
  if value.hasPrefix("#"), value.count == 5 || value.count == 9 {
    let digits = String(value.dropFirst())
    if digits.allSatisfy({ $0.isHexDigit }) {
      let suffix = digits.count == 4 ? String(repeating: String(digits.suffix(1)), count: 2) : String(digits.suffix(2))
      alpha = UInt8(suffix, radix: 16).map { Double($0) / 255 }
    }
  } else if value.hasPrefix("rgba("), value.hasSuffix(")") {
    let body = value.dropFirst(5).dropLast()
    let components = body.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
    let token = components.count == 4 ? components.last : body.split(separator: "/").count == 2 ? body.split(separator: "/").last.map { $0.trimmingCharacters(in: .whitespaces) } : nil
    if let token {
      alpha = token.hasSuffix("%") ? Double(token.dropLast()).map { $0 / 100 } : Double(token)
    }
  }
  guard let alpha, alpha.isFinite, (0...1).contains(alpha) else { return 37 }
  return Int(((1 - alpha) * 100).rounded())
}
