import Foundation

private struct CompletedRequest {
  let result: Result<BoundedCommunityHTTPResponse, Error>
  let completionCount: Int
}

@main
private enum BoundedCommunityHTTPTest {
  static func main() throws {
    guard CommandLine.arguments.count == 2,
          let baseURL = URL(string: CommandLine.arguments[1]) else {
      throw TestFailure("Usage: bounded-community-http.test <base-url>")
    }
    let client = BoundedCommunityHTTPClient(userAgent: "DreamSkinHTTPTest/1")
    defer { client.invalidate() }

    let ok = try request(client, baseURL: baseURL, path: "ok", maximumBytes: 8)
    guard case let .success(response) = ok.result,
          String(decoding: response.body, as: UTF8.self) == "ok",
          ok.completionCount == 1 else {
      throw TestFailure("bounded success response did not complete exactly once")
    }

    for path in ["redirect", "oversize-header", "chunked-oversize"] {
      let rejected = try request(client, baseURL: baseURL, path: path, maximumBytes: 8)
      guard case .failure = rejected.result, rejected.completionCount == 1 else {
        throw TestFailure("\(path) was not rejected exactly once")
      }
    }

    let cancelled = try request(
      client,
      baseURL: baseURL,
      path: "slow",
      maximumBytes: 8,
      cancelAfter: 0.05
    )
    guard case .failure = cancelled.result, cancelled.completionCount == 1 else {
      throw TestFailure("cancelled request did not fail exactly once")
    }

    print("PASS: bounded community HTTP rejects redirects and oversized bodies, cancels, and completes exactly once.")
  }

  private static func request(
    _ client: BoundedCommunityHTTPClient,
    baseURL: URL,
    path: String,
    maximumBytes: Int,
    cancelAfter: TimeInterval? = nil
  ) throws -> CompletedRequest {
    let semaphore = DispatchSemaphore(value: 0)
    let lock = NSLock()
    var captured: Result<BoundedCommunityHTTPResponse, Error>?
    var count = 0
    let url = baseURL.appendingPathComponent(path)
    let task = client.get(url, accept: "application/octet-stream", maximumBytes: maximumBytes) { result in
      lock.lock()
      count += 1
      captured = result
      lock.unlock()
      semaphore.signal()
    }
    if let cancelAfter {
      DispatchQueue.global().asyncAfter(deadline: .now() + cancelAfter) {
        task.cancel()
      }
    }
    guard semaphore.wait(timeout: .now() + 5) == .success else {
      throw TestFailure("request timed out: \(path)")
    }
    Thread.sleep(forTimeInterval: 0.2)
    lock.lock()
    defer { lock.unlock() }
    guard let captured else { throw TestFailure("request produced no result: \(path)") }
    return CompletedRequest(result: captured, completionCount: count)
  }
}

private struct TestFailure: Error, CustomStringConvertible {
  let description: String
  init(_ description: String) { self.description = description }
}
