import Foundation

private enum BoundedCommunityHTTPError: LocalizedError {
  case invalidResponse
  case responseTooLarge

  var errorDescription: String? {
    switch self {
    case .invalidResponse:
      return "DreamSkin.cc returned an unexpected response or redirect."
    case .responseTooLarge:
      return "DreamSkin.cc returned more data than the approved limit."
    }
  }
}

struct BoundedCommunityHTTPResponse {
  let response: HTTPURLResponse
  let body: Data
}

final class BoundedCommunityHTTPClient: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  private struct RequestState {
    let expectedURL: URL
    let maximumBytes: Int
    let completion: (Result<BoundedCommunityHTTPResponse, Error>) -> Void
    var body = Data()
    var failure: Error?
  }

  private let lock = NSLock()
  private let userAgent: String
  private var requests: [Int: RequestState] = [:]
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 20
    configuration.timeoutIntervalForResource = 60
    configuration.httpMaximumConnectionsPerHost = 1
    configuration.httpAdditionalHeaders = [
      "Accept-Encoding": "identity",
      "User-Agent": userAgent
    ]
    let queue = OperationQueue()
    queue.name = "cc.dreamskin.community-http"
    queue.maxConcurrentOperationCount = 1
    return URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
  }()

  init(userAgent: String) {
    self.userAgent = userAgent
    super.init()
  }

  @discardableResult
  func get(
    _ url: URL,
    accept: String,
    maximumBytes: Int,
    completion: @escaping (Result<BoundedCommunityHTTPResponse, Error>) -> Void
  ) -> URLSessionDataTask {
    precondition(maximumBytes > 0)
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue(accept, forHTTPHeaderField: "Accept")
    let task = session.dataTask(with: request)
    lock.lock()
    requests[task.taskIdentifier] = RequestState(
      expectedURL: url,
      maximumBytes: maximumBytes,
      completion: completion
    )
    lock.unlock()
    task.resume()
    return task
  }

  func invalidate() {
    session.invalidateAndCancel()
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    lock.lock()
    if var state = requests[task.taskIdentifier] {
      state.failure = BoundedCommunityHTTPError.invalidResponse
      requests[task.taskIdentifier] = state
    }
    lock.unlock()
    completionHandler(nil)
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    var disposition = URLSession.ResponseDisposition.allow
    lock.lock()
    if var state = requests[dataTask.taskIdentifier] {
      guard let http = response as? HTTPURLResponse,
            http.statusCode == 200,
            http.url == state.expectedURL else {
        state.failure = BoundedCommunityHTTPError.invalidResponse
        requests[dataTask.taskIdentifier] = state
        lock.unlock()
        completionHandler(.cancel)
        return
      }
      if response.expectedContentLength > Int64(state.maximumBytes) {
        state.failure = BoundedCommunityHTTPError.responseTooLarge
        disposition = .cancel
      } else if response.expectedContentLength > 0 {
        state.body.reserveCapacity(Int(response.expectedContentLength))
      }
      requests[dataTask.taskIdentifier] = state
    } else {
      disposition = .cancel
    }
    lock.unlock()
    completionHandler(disposition)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    var shouldCancel = false
    lock.lock()
    if var state = requests[dataTask.taskIdentifier], state.failure == nil {
      if data.count > state.maximumBytes - state.body.count {
        state.failure = BoundedCommunityHTTPError.responseTooLarge
        shouldCancel = true
      } else {
        state.body.append(data)
      }
      requests[dataTask.taskIdentifier] = state
    }
    lock.unlock()
    if shouldCancel {
      dataTask.cancel()
    }
  }

  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?
  ) {
    lock.lock()
    let state = requests.removeValue(forKey: task.taskIdentifier)
    lock.unlock()
    guard let state else { return }

    if let failure = state.failure {
      state.completion(.failure(failure))
      return
    }
    if let error {
      state.completion(.failure(error))
      return
    }
    guard let response = task.response as? HTTPURLResponse else {
      state.completion(.failure(BoundedCommunityHTTPError.invalidResponse))
      return
    }
    state.completion(.success(BoundedCommunityHTTPResponse(response: response, body: state.body)))
  }
}
