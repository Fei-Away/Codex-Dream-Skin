import XCTest
@testable import DreamSkinCore

final class CoreTests: XCTestCase {
  func testSemanticVersionParsingAndComparison() throws {
    XCTAssertEqual(SemanticVersion("v1.3")?.description, "1.3.0")
    XCTAssertEqual(SemanticVersion(" 2.0.1\n")?.description, "2.0.1")
    XCTAssertTrue(try XCTUnwrap(SemanticVersion("1.3.1")) > SemanticVersion("1.3.0")!)
    XCTAssertTrue(try XCTUnwrap(SemanticVersion("2.0.0")) > SemanticVersion("1.99.99")!)
    XCTAssertNil(SemanticVersion("1.3.0-beta"))
    XCTAssertNil(SemanticVersion("1..3"))
    XCTAssertNil(SemanticVersion("1.2.3.4"))
  }

  func testStatusSnapshotParsesChineseTheme() throws {
    let data = Data(#"{"session":"active","operation":"","operationMessage":"","port":9341,"injectorAlive":true,"cdpOk":true,"codexRunning":true,"themeId":"theme-cn","themeName":"中文主题","appliedThemeId":"theme-cn","appliedThemeName":"中文主题"}"#.utf8)
    let snapshot = try XCTUnwrap(StatusSnapshot(jsonData: data))
    XCTAssertEqual(snapshot.session, "active")
    XCTAssertEqual(snapshot.themeID, "theme-cn")
    XCTAssertEqual(snapshot.themeName, "中文主题")
    XCTAssertEqual(snapshot.appliedThemeID, "theme-cn")
    XCTAssertTrue(snapshot.isReadyForCommunityApply)
    XCTAssertEqual(snapshot.title, "Skin ON")
    XCTAssertFalse(snapshot.busy)
  }

  func testSavedThemesCollapseOnlyBundledAliasAndKeepCurrentSelection() {
    let themes = [
      SavedThemeOption(id: "gothic-void-crusade", name: "Gothic Void Crusade"),
      SavedThemeOption(id: "preset-gothic-void-crusade", name: "Gothic Void Crusade"),
      SavedThemeOption(id: "forest", name: "Forest"),
      SavedThemeOption(id: "preset-forest", name: "Forest")
    ]

    XCTAssertEqual(
      Set(deduplicatedSavedThemes(themes, currentThemeID: "preset-gothic-void-crusade").map(\.id)),
      Set(["preset-gothic-void-crusade", "forest", "preset-forest"])
    )
    XCTAssertEqual(
      Set(deduplicatedSavedThemes(themes, currentThemeID: "gothic-void-crusade").map(\.id)),
      Set(["gothic-void-crusade", "forest", "preset-forest"])
    )
  }

  func testBusyAndFailureLabels() {
    var snapshot = StatusSnapshot(session: "active", operation: "applying")
    XCTAssertTrue(snapshot.busy)
    XCTAssertEqual(snapshot.title, "Skin 应用中")
    snapshot.operation = "failed"
    XCTAssertEqual(snapshot.title, "Skin ON · 操作失败")
  }

  func testCommunityApplyRequiresAnExactVisibleBaseline() {
    let ready = StatusSnapshot(
      session: "active",
      port: 9341,
      injectorAlive: true,
      cdpOK: true,
      codexRunning: true,
      themeID: "old-theme",
      themeName: "Old",
      appliedThemeID: "old-theme",
      appliedThemeName: "Old"
    )
    XCTAssertTrue(ready.isReadyForCommunityApply)

    var changed = ready
    changed.appliedThemeID = "other-theme"
    XCTAssertFalse(changed.isReadyForCommunityApply)
    changed = ready
    changed.session = "paused"
    XCTAssertFalse(changed.isReadyForCommunityApply)
    changed = ready
    changed.cdpOK = false
    XCTAssertFalse(changed.isReadyForCommunityApply)
    changed = ready
    changed.operation = "applying"
    XCTAssertFalse(changed.isReadyForCommunityApply)
  }

  func testCommunityThemeLinkAcceptsOnlyCanonicalVersionLink() throws {
    let valid = try XCTUnwrap(URL(string: "dreamskin://apply?version=ver_1234abcd"))
    XCTAssertEqual(CommunityThemeContract.versionID(from: valid), "ver_1234abcd")
    XCTAssertEqual(
      CommunityThemeContract.metadataURL(for: "ver_1234abcd")?.absoluteString,
      "https://api.dreamskin.cc/v1/themes/ver_1234abcd"
    )
    XCTAssertEqual(
      CommunityThemeContract.downloadURL(for: "ver_1234abcd")?.absoluteString,
      "https://api.dreamskin.cc/v1/themes/ver_1234abcd/download"
    )

    for source in [
      "https://dreamskin.cc/apply?version=ver_1234abcd",
      "dreamskin://apply?url=https://example.com/theme.zip",
      "dreamskin://apply?version=ver_short",
      "dreamskin://apply?version=ver_1234abcd&extra=1",
      "dreamskin://apply/path?version=ver_1234abcd",
      "dreamskin://apply?version=ver_1234abcd#fragment",
      "dreamskin://user@apply?version=ver_1234abcd",
      "dreamskin://apply:443?version=ver_1234abcd",
      "DREAMSKIN://apply?version=ver_1234abcd",
      "dreamskin://apply?version=ver_1234ABCD"
    ] {
      let url = try XCTUnwrap(URL(string: source), source)
      XCTAssertNil(CommunityThemeContract.versionID(from: url), source)
    }
  }

  func testCommunityThemeMetadataValidatesIdentityAndBounds() throws {
    let json = #"{"id":"ver_1234abcd","themeId":"theme-one","name":"Paper","version":"1.2.3","authorDisplayName":"Author","license":"MIT","packageSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","packageBytes":2048,"applyCompatible":true}"#
    let metadata = try JSONDecoder().decode(CommunityThemeMetadata.self, from: Data(json.utf8))
    XCTAssertEqual(try metadata.validated(expectedVersionID: "ver_1234abcd"), metadata)
    XCTAssertThrowsError(try metadata.validated(expectedVersionID: "ver_deadbeef"))

    let oversized = CommunityThemeMetadata(
      id: metadata.id,
      themeId: metadata.themeId,
      name: metadata.name,
      version: metadata.version,
      authorDisplayName: metadata.authorDisplayName,
      license: metadata.license,
      packageSha256: metadata.packageSha256,
      packageBytes: CommunityThemeContract.maximumPackageBytes + 1,
      applyCompatible: true
    )
    XCTAssertThrowsError(try oversized.validated(expectedVersionID: metadata.id))

    let legacy = CommunityThemeMetadata(
      id: metadata.id,
      themeId: metadata.themeId,
      name: metadata.name,
      version: metadata.version,
      authorDisplayName: metadata.authorDisplayName,
      license: metadata.license,
      packageSha256: metadata.packageSha256,
      packageBytes: metadata.packageBytes,
      applyCompatible: false
    )
    XCTAssertThrowsError(try legacy.validated(expectedVersionID: metadata.id)) { error in
      XCTAssertEqual(error as? CommunityThemeContractError, .incompatiblePackage)
    }

    let missingCompatibility = json.replacingOccurrences(of: #","applyCompatible":true"#, with: "")
    XCTAssertThrowsError(
      try JSONDecoder().decode(CommunityThemeMetadata.self, from: Data(missingCompatibility.utf8))
    )
    let oversizedVersion = json.replacingOccurrences(
      of: #""version":"1.2.3""#,
      with: #""version":"111111111111111111111111111111111.2.3""#
    )
    let oversizedVersionMetadata = try JSONDecoder().decode(
      CommunityThemeMetadata.self,
      from: Data(oversizedVersion.utf8)
    )
    XCTAssertThrowsError(
      try oversizedVersionMetadata.validated(expectedVersionID: oversizedVersionMetadata.id)
    )

    for unsafeName in [
      "Paper\u{061C}txt",
      "Paper\u{202E}txt",
      "Paper\u{2028}SHA-256: forged",
      "Paper\u{2066}txt\u{2069}"
    ] {
      let unsafe = CommunityThemeMetadata(
        id: metadata.id,
        themeId: metadata.themeId,
        name: unsafeName,
        version: metadata.version,
        authorDisplayName: metadata.authorDisplayName,
        license: metadata.license,
        packageSha256: metadata.packageSha256,
        packageBytes: metadata.packageBytes,
        applyCompatible: true
      )
      XCTAssertThrowsError(try unsafe.validated(expectedVersionID: metadata.id), unsafeName)
    }
  }

  func testCommunityRecoveryPreservesOnlyTheRollbackSnapshot() throws {
    let fileManager = FileManager.default
    let root = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? fileManager.removeItem(at: root) }
    try fileManager.createDirectory(at: root, withIntermediateDirectories: false)
    let operation = root.appendingPathComponent(".community-apply-fixture", isDirectory: true)
    let snapshot = operation.appendingPathComponent("active-before", isDirectory: true)
    try fileManager.createDirectory(at: snapshot, withIntermediateDirectories: true)
    try Data("old-theme".utf8).write(to: snapshot.appendingPathComponent("theme.json"))
    try Data("download".utf8).write(to: operation.appendingPathComponent("theme.zip"))
    let identifier = try XCTUnwrap(UUID(uuidString: "11111111-2222-3333-4444-555555555555"))

    let retained = try CommunityRecovery.preserveRollbackSnapshot(
      operationRoot: operation,
      stateRoot: root,
      identifier: identifier,
      fileManager: fileManager
    )

    XCTAssertEqual(
      retained,
      root.appendingPathComponent(
        "recovery/community-11111111-2222-3333-4444-555555555555/active-before",
        isDirectory: true
      )
    )
    XCTAssertEqual(try Data(contentsOf: retained.appendingPathComponent("theme.json")), Data("old-theme".utf8))
    XCTAssertTrue(fileManager.fileExists(atPath: operation.appendingPathComponent("theme.zip").path))
    XCTAssertFalse(fileManager.fileExists(atPath: snapshot.path))
  }

  func testCommunityRecoveryRejectsMissingAndLinkedRoots() throws {
    let fileManager = FileManager.default
    let root = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? fileManager.removeItem(at: root) }
    try fileManager.createDirectory(at: root, withIntermediateDirectories: false)
    let missing = root.appendingPathComponent(".community-apply-missing", isDirectory: true)
    try fileManager.createDirectory(at: missing, withIntermediateDirectories: false)
    XCTAssertThrowsError(
      try CommunityRecovery.preserveRollbackSnapshot(operationRoot: missing, stateRoot: root)
    ) { error in
      XCTAssertEqual(error as? CommunityRecoveryError, .missingRollbackSnapshot)
    }

    let outside = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? fileManager.removeItem(at: outside) }
    try fileManager.createDirectory(at: outside, withIntermediateDirectories: false)
    let linked = root.appendingPathComponent(".community-apply-linked", isDirectory: true)
    try fileManager.createSymbolicLink(at: linked, withDestinationURL: outside)
    XCTAssertThrowsError(
      try CommunityRecovery.preserveRollbackSnapshot(operationRoot: linked, stateRoot: root)
    ) { error in
      XCTAssertEqual(error as? CommunityRecoveryError, .invalidOperationRoot)
    }
  }

  func testCommunityRecoveryLeavesValidatedSnapshotInPlaceWhenPromotionIsUnavailable() throws {
    let fileManager = FileManager.default
    let root = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? fileManager.removeItem(at: root) }
    try fileManager.createDirectory(at: root, withIntermediateDirectories: false)
    let operation = root.appendingPathComponent(".community-apply-fixture", isDirectory: true)
    let snapshot = operation.appendingPathComponent("active-before", isDirectory: true)
    try fileManager.createDirectory(at: snapshot, withIntermediateDirectories: true)
    try Data("old-theme".utf8).write(to: snapshot.appendingPathComponent("theme.json"))

    let outside = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? fileManager.removeItem(at: outside) }
    try fileManager.createDirectory(at: outside, withIntermediateDirectories: false)
    try fileManager.createSymbolicLink(
      at: root.appendingPathComponent("recovery", isDirectory: true),
      withDestinationURL: outside
    )

    XCTAssertThrowsError(
      try CommunityRecovery.preserveRollbackSnapshot(operationRoot: operation, stateRoot: root)
    ) { error in
      XCTAssertEqual(error as? CommunityRecoveryError, .invalidRecoveryRoot)
    }
    XCTAssertEqual(
      try CommunityRecovery.validatedRollbackSnapshot(operationRoot: operation, stateRoot: root),
      snapshot
    )
    XCTAssertEqual(try Data(contentsOf: snapshot.appendingPathComponent("theme.json")), Data("old-theme".utf8))
  }
}
