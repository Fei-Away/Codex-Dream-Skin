import Foundation
import Darwin

struct ProcessResult {
    let code: Int32
    let output: String
}

func runProcess(_ executable: String, _ arguments: [String], timeout: TimeInterval = 75) async -> ProcessResult {
    await withCheckedContinuation { continuation in
        DispatchQueue.global(qos: .userInitiated).async {
            let process = Process()
            let fileManager = FileManager.default
            let outputURL = fileManager.temporaryDirectory
                .appendingPathComponent("codex-dream-skin-\(UUID().uuidString).log")
            fileManager.createFile(atPath: outputURL.path, contents: nil)
            var outputHandle: FileHandle?
            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = arguments
            do {
                outputHandle = try FileHandle(forWritingTo: outputURL)
                process.standardOutput = outputHandle
                process.standardError = outputHandle
                try process.run()

                let deadline = Date().addingTimeInterval(timeout)
                while process.isRunning && Date() < deadline {
                    Thread.sleep(forTimeInterval: 0.1)
                }

                let timedOut = process.isRunning
                if timedOut {
                    process.terminate()
                    Thread.sleep(forTimeInterval: 0.5)
                    if process.isRunning {
                        Darwin.kill(process.processIdentifier, SIGKILL)
                    }
                }
                process.waitUntilExit()
                try? outputHandle?.synchronize()
                try? outputHandle?.close()
                outputHandle = nil

                let data = (try? Data(contentsOf: outputURL)) ?? Data()
                let output = String(data: data, encoding: .utf8) ?? ""
                let timeoutMessage = timedOut
                    ? "\n操作超过 \(Int(timeout)) 秒，已停止等待。请检查 Codex 是否能够正常启动。\n"
                    : ""
                continuation.resume(returning: ProcessResult(
                    code: timedOut ? 124 : process.terminationStatus,
                    output: output + timeoutMessage
                ))
            } catch {
                continuation.resume(returning: ProcessResult(code: 127, output: error.localizedDescription))
            }
            try? outputHandle?.close()
            try? fileManager.removeItem(at: outputURL)
        }
    }
}
