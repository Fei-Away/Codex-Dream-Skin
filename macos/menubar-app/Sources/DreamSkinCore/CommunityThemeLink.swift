import Foundation

public enum CommunityThemeContract {
  public static let apiOrigin = "https://api.dreamskin.cc"
  public static let maximumPackageBytes: Int64 = 32 * 1024 * 1024

  private static let linkPattern = #"^dreamskin://apply\?version=(ver_[a-z0-9]{8,64})$"#
  private static let versionPattern = #"^ver_[a-z0-9]{8,64}$"#
  private static let sha256Pattern = #"^[a-f0-9]{64}$"#
  private static let semanticVersionPattern = #"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$"#

  public static func versionID(from url: URL) -> String? {
    let source = url.absoluteString
    guard let match = source.range(of: linkPattern, options: .regularExpression) else {
      return nil
    }
    let matched = String(source[match])
    guard let separator = matched.range(of: "?version=") else { return nil }
    let versionID = String(matched[separator.upperBound...])
    return isVersionID(versionID) ? versionID : nil
  }

  public static func metadataURL(for versionID: String) -> URL? {
    guard isVersionID(versionID) else { return nil }
    return URL(string: "\(apiOrigin)/v1/themes/\(versionID)")
  }

  public static func downloadURL(for versionID: String) -> URL? {
    guard isVersionID(versionID) else { return nil }
    return URL(string: "\(apiOrigin)/v1/themes/\(versionID)/download")
  }

  public static func isVersionID(_ value: String) -> Bool {
    value.range(of: versionPattern, options: .regularExpression) != nil
  }

  fileprivate static func isSHA256(_ value: String) -> Bool {
    value.range(of: sha256Pattern, options: .regularExpression) != nil
  }

  fileprivate static func isSemanticVersion(_ value: String) -> Bool {
    value.range(of: semanticVersionPattern, options: .regularExpression) != nil
  }

  fileprivate static func isSafeDisplayText(_ value: String, maximum: Int) -> Bool {
    let count = value.unicodeScalars.count
    return count > 0
      && count <= maximum
      && value == value.trimmingCharacters(in: .whitespacesAndNewlines)
      && value.rangeOfCharacter(from: .controlCharacters) == nil
      && !value.unicodeScalars.contains(where: isUnsafeDisplayScalar)
  }

  private static func isUnsafeDisplayScalar(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.value {
    case 0x061C, 0x200E, 0x200F, 0x2028...0x202E, 0x2066...0x2069:
      return true
    default:
      return false
    }
  }
}

public struct CommunityThemeMetadata: Decodable, Equatable {
  public let id: String
  public let themeId: String
  public let name: String
  public let version: String
  public let authorDisplayName: String
  public let license: String
  public let packageSha256: String
  public let packageBytes: Int64
  public let applyCompatible: Bool

  public func validated(expectedVersionID: String) throws -> CommunityThemeMetadata {
    guard CommunityThemeContract.isVersionID(expectedVersionID), id == expectedVersionID else {
      throw CommunityThemeContractError.metadataMismatch
    }
    guard CommunityThemeContract.isSafeDisplayText(themeId, maximum: 80),
          CommunityThemeContract.isSafeDisplayText(name, maximum: 120),
          CommunityThemeContract.isSafeDisplayText(authorDisplayName, maximum: 120),
          CommunityThemeContract.isSafeDisplayText(license, maximum: 80),
          version.count <= 32,
          CommunityThemeContract.isSemanticVersion(version) else {
      throw CommunityThemeContractError.invalidMetadata
    }
    guard CommunityThemeContract.isSHA256(packageSha256),
          packageBytes > 0,
          packageBytes <= CommunityThemeContract.maximumPackageBytes else {
      throw CommunityThemeContractError.invalidPackageIdentity
    }
    guard applyCompatible else {
      throw CommunityThemeContractError.incompatiblePackage
    }
    return self
  }
}

public enum CommunityThemeContractError: LocalizedError, Equatable {
  case invalidLink
  case metadataMismatch
  case invalidMetadata
  case invalidPackageIdentity
  case incompatiblePackage

  public var errorDescription: String? {
    switch self {
    case .invalidLink:
      return "这个一键换肤链接无效。"
    case .metadataMismatch:
      return "服务端返回的主题版本与链接不一致。"
    case .invalidMetadata:
      return "主题元数据不符合客户端安全规则。"
    case .invalidPackageIdentity:
      return "主题包大小或 SHA-256 标识无效。"
    case .incompatiblePackage:
      return "这个已审核主题是旧格式，只能在线预览或下载，不能一键换肤。"
    }
  }
}
