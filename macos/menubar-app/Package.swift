// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "CodexDreamSkinMenuBar",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(
      name: "CodexDreamSkinMenuBar",
      targets: ["CodexDreamSkinMenuBar"]
    )
  ],
  targets: [
    .target(
      name: "DreamSkinCore",
      path: "Sources/DreamSkinCore"
    ),
    .executableTarget(
      name: "CodexDreamSkinMenuBar",
      dependencies: ["DreamSkinCore"],
      path: "Sources/CodexDreamSkinMenuBar"
    ),
    .testTarget(
      name: "DreamSkinCoreTests",
      dependencies: ["DreamSkinCore"],
      path: "Tests/DreamSkinCoreTests"
    )
  ]
)
