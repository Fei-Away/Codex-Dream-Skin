import Foundation

public struct ThemeTransparencyPreferences: Codable, Equatable {
  public struct Entry: Codable, Equatable {
    public var transparency: Double
    public init(transparency: Double) { self.transparency = transparency }
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
    guard result.schemaVersion == 1,
          result.themes.values.allSatisfy({ $0.transparency.isFinite && (0...100).contains($0.transparency) }) else {
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
  guard let panel else { return 30 }
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
  guard let alpha, alpha.isFinite, (0...1).contains(alpha) else { return 30 }
  return Int(((1 - alpha) * 100).rounded())
}
