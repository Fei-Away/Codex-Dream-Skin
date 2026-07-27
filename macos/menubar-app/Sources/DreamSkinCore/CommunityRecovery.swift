import Foundation

public enum CommunityRecoveryError: Error, Equatable {
  case invalidOperationRoot
  case missingRollbackSnapshot
  case invalidRecoveryRoot
}

public enum CommunityRecovery {
  /// Returns the structurally contained rollback snapshot without claiming that
  /// its renderer can still be restored.
  public static func validatedRollbackSnapshot(
    operationRoot: URL,
    stateRoot: URL,
    fileManager: FileManager = .default
  ) throws -> URL {
    let state = stateRoot.standardizedFileURL
    let operation = operationRoot.standardizedFileURL
    guard operation.deletingLastPathComponent() == state,
          operation.lastPathComponent.hasPrefix(".community-apply-") else {
      throw CommunityRecoveryError.invalidOperationRoot
    }
    let stateResolved = state.resolvingSymlinksInPath()
    let operationValues = try? operation.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
    guard operationValues?.isDirectory == true,
          operationValues?.isSymbolicLink != true,
          operation.resolvingSymlinksInPath().deletingLastPathComponent() == stateResolved else {
      throw CommunityRecoveryError.invalidOperationRoot
    }

    let source = operation.appendingPathComponent("active-before", isDirectory: true)
    let sourceValues = try? source.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
    guard sourceValues?.isDirectory == true,
          sourceValues?.isSymbolicLink != true,
          source.resolvingSymlinksInPath().deletingLastPathComponent()
            == operation.resolvingSymlinksInPath() else {
      throw CommunityRecoveryError.missingRollbackSnapshot
    }
    return source
  }

  /// Moves the only rollback snapshot out of a disposable apply directory.
  /// The downloaded ZIP stays behind and can still be removed by the caller.
  public static func preserveRollbackSnapshot(
    operationRoot: URL,
    stateRoot: URL,
    identifier: UUID = UUID(),
    fileManager: FileManager = .default
  ) throws -> URL {
    let state = stateRoot.standardizedFileURL
    let source = try validatedRollbackSnapshot(
      operationRoot: operationRoot,
      stateRoot: stateRoot,
      fileManager: fileManager
    )
    let stateResolved = state.resolvingSymlinksInPath()

    let recoveryRoot = state.appendingPathComponent("recovery", isDirectory: true)
    var isDirectory = ObjCBool(false)
    if fileManager.fileExists(atPath: recoveryRoot.path, isDirectory: &isDirectory) {
      let values = try? recoveryRoot.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
      guard isDirectory.boolValue,
            values?.isDirectory == true,
            values?.isSymbolicLink != true,
            recoveryRoot.resolvingSymlinksInPath().deletingLastPathComponent() == stateResolved else {
        throw CommunityRecoveryError.invalidRecoveryRoot
      }
    } else {
      try fileManager.createDirectory(
        at: recoveryRoot,
        withIntermediateDirectories: false,
        attributes: [.posixPermissions: 0o700]
      )
    }
    try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: recoveryRoot.path)

    let container = recoveryRoot.appendingPathComponent(
      "community-\(identifier.uuidString.lowercased())",
      isDirectory: true
    )
    guard !fileManager.fileExists(atPath: container.path) else {
      throw CommunityRecoveryError.invalidRecoveryRoot
    }
    try fileManager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: source.path)
    try fileManager.createDirectory(
      at: container,
      withIntermediateDirectories: false,
      attributes: [.posixPermissions: 0o700]
    )
    let destination = container.appendingPathComponent("active-before", isDirectory: true)
    do {
      try fileManager.moveItem(at: source, to: destination)
      return destination
    } catch {
      // A failed move normally leaves the source untouched. If Foundation
      // reports an error after completing the rename, retain that destination.
      let destinationValues = try? destination.resourceValues(
        forKeys: [.isDirectoryKey, .isSymbolicLinkKey]
      )
      if destinationValues?.isDirectory == true,
         destinationValues?.isSymbolicLink != true,
         !fileManager.fileExists(atPath: source.path) {
        return destination
      }
      if !fileManager.fileExists(atPath: destination.path) {
        try? fileManager.removeItem(at: container)
      }
      throw error
    }
  }
}
