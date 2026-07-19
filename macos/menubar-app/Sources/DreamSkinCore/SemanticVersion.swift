import Foundation

public struct SemanticVersion: Comparable, CustomStringConvertible, Sendable {
  public let major: Int
  public let minor: Int
  public let patch: Int

  public init?(_ source: String) {
    var value = source.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.first == "v" || value.first == "V" {
      value.removeFirst()
    }
    let parts = value.split(separator: ".", omittingEmptySubsequences: false)
    guard (1...3).contains(parts.count) else { return nil }
    var numbers: [Int] = []
    for part in parts {
      guard !part.isEmpty,
            part.allSatisfy({ $0.isASCII && $0.isNumber }),
            let number = Int(part),
            number >= 0 else {
        return nil
      }
      numbers.append(number)
    }
    while numbers.count < 3 {
      numbers.append(0)
    }
    major = numbers[0]
    minor = numbers[1]
    patch = numbers[2]
  }

  public var description: String {
    "\(major).\(minor).\(patch)"
  }

  public static func < (lhs: SemanticVersion, rhs: SemanticVersion) -> Bool {
    if lhs.major != rhs.major { return lhs.major < rhs.major }
    if lhs.minor != rhs.minor { return lhs.minor < rhs.minor }
    return lhs.patch < rhs.patch
  }
}
