import Foundation

public struct SavedThemeOption: Equatable, Sendable {
  public let id: String
  public let name: String

  public init(id: String, name: String) {
    self.id = id
    self.name = name
  }
}

public func deduplicatedSavedThemes(
  _ themes: [SavedThemeOption],
  currentThemeID: String
) -> [SavedThemeOption] {
  let currentID = currentThemeID.lowercased()
  var selected: [String: SavedThemeOption] = [:]

  for theme in themes {
    let key = logicalThemeID(theme.id)
    guard let existing = selected[key] else {
      selected[key] = theme
      continue
    }
    if themePriority(theme, currentID: currentID) < themePriority(existing, currentID: currentID) {
      selected[key] = theme
    }
  }
  return Array(selected.values)
}

private let bundledGothicAliases = Set([
  "gothic-void-crusade",
  "preset-gothic-void-crusade"
])

private func logicalThemeID(_ id: String) -> String {
  let normalized = id.lowercased()
  return bundledGothicAliases.contains(normalized) ? "gothic-void-crusade" : normalized
}

private func themePriority(_ theme: SavedThemeOption, currentID: String) -> Int {
  let id = theme.id.lowercased()
  if !currentID.isEmpty && id == currentID { return 0 }
  if id == "preset-gothic-void-crusade" { return 1 }
  return 2
}
