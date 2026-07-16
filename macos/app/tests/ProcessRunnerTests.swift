import Foundation
import Darwin

@main
struct ProcessRunnerTests {
    static func main() async {
        let inheritedStart = Date()
        let inherited = await runProcess(
            "/bin/bash",
            ["-c", "(sleep 3; printf child) & printf parent"],
            timeout: 5
        )
        let inheritedElapsed = Date().timeIntervalSince(inheritedStart)
        guard inherited.code == 0,
              inherited.output.contains("parent"),
              inheritedElapsed < 1.5 else {
            fputs("Inherited-output regression failed.\n", stderr)
            Darwin.exit(1)
        }

        let timeoutStart = Date()
        let timedOut = await runProcess("/bin/sleep", ["5"], timeout: 0.2)
        let timeoutElapsed = Date().timeIntervalSince(timeoutStart)
        guard timedOut.code == 124,
              timedOut.output.contains("操作超过"),
              timeoutElapsed < 2 else {
            fputs("Process timeout regression failed.\n", stderr)
            Darwin.exit(1)
        }
    }
}
