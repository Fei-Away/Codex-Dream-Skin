import Foundation

public struct StatusSnapshot: Equatable, Sendable {
  public var session: String
  public var operation: String
  public var operationMessage: String
  public var port: Int
  public var injectorAlive: Bool
  public var cdpOK: Bool
  public var codexRunning: Bool
  public var themeID: String
  public var themeName: String
  public var appliedThemeID: String
  public var appliedThemeName: String

  public init(
    session: String = "unknown",
    operation: String = "",
    operationMessage: String = "",
    port: Int = 9341,
    injectorAlive: Bool = false,
    cdpOK: Bool = false,
    codexRunning: Bool = false,
    themeID: String = "",
    themeName: String = "",
    appliedThemeID: String = "",
    appliedThemeName: String = ""
  ) {
    self.session = session
    self.operation = operation
    self.operationMessage = operationMessage
    self.port = port
    self.injectorAlive = injectorAlive
    self.cdpOK = cdpOK
    self.codexRunning = codexRunning
    self.themeID = themeID
    self.themeName = themeName
    self.appliedThemeID = appliedThemeID
    self.appliedThemeName = appliedThemeName
  }

  public init?(jsonData: Data) {
    guard let object = try? JSONSerialization.jsonObject(with: jsonData),
          let value = object as? [String: Any] else {
      return nil
    }
    session = value["session"] as? String ?? "unknown"
    operation = value["operation"] as? String ?? ""
    operationMessage = value["operationMessage"] as? String ?? ""
    if let number = value["port"] as? NSNumber {
      port = number.intValue
    } else if let text = value["port"] as? String, let parsed = Int(text) {
      port = parsed
    } else {
      port = 9341
    }
    injectorAlive = value["injectorAlive"] as? Bool ?? false
    cdpOK = value["cdpOk"] as? Bool ?? false
    codexRunning = value["codexRunning"] as? Bool ?? false
    themeID = value["themeId"] as? String ?? ""
    themeName = value["themeName"] as? String ?? ""
    appliedThemeID = value["appliedThemeId"] as? String ?? ""
    appliedThemeName = value["appliedThemeName"] as? String ?? ""
  }

  public var busy: Bool {
    operation == "applying" || operation == "pausing"
  }

  public var isReadyForCommunityApply: Bool {
    session == "active"
      && operation.isEmpty
      && injectorAlive
      && cdpOK
      && codexRunning
      && !themeID.isEmpty
      && themeID == appliedThemeID
      && themeID.range(
        of: #"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$"#,
        options: .regularExpression
      ) != nil
  }

  public var title: String {
    if operation == "applying" { return "Skin 应用中" }
    if operation == "pausing" { return "Skin 暂停中" }
    switch session {
    case "active": return operation == "failed" ? "Skin ON · 操作失败" : "Skin ON"
    case "off", "paused": return operation == "failed" ? "Skin OFF · 操作失败" : "Skin OFF"
    default: return "Skin 异常"
    }
  }
}
