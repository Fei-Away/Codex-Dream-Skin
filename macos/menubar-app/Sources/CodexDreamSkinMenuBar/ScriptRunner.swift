import Foundation

struct ScriptResult {
  let exitCode: Int32
  let output: String

  var succeeded: Bool { exitCode == 0 }
}

enum ScriptRunner {
  static func run(
    script: URL,
    arguments: [String] = [],
    completion: @escaping (ScriptResult) -> Void
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      let process = Process()
      let pipe = Pipe()
      process.executableURL = URL(fileURLWithPath: "/bin/bash")
      process.arguments = [script.path] + arguments
      process.currentDirectoryURL = script.deletingLastPathComponent()
      var environment = ProcessInfo.processInfo.environment
      environment["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin"
      environment["LC_ALL"] = "en_US.UTF-8"
      process.environment = environment
      process.standardOutput = pipe
      process.standardError = pipe

      let result: ScriptResult
      do {
        try process.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        result = ScriptResult(
          exitCode: process.terminationStatus,
          output: String(decoding: data, as: UTF8.self)
        )
      } catch {
        result = ScriptResult(exitCode: 127, output: error.localizedDescription)
      }
      DispatchQueue.main.async {
        completion(result)
      }
    }
  }
}
