import Foundation
import RakazoAPI
import RakazoCore

enum DataRoomTransferError: LocalizedError {
  case badResponse(Int, String?)
  case invalidResponse

  var errorDescription: String? {
    switch self {
    case .badResponse(_, let message?): message
    case .badResponse(let status, nil): "The server answered \(status)."
    case .invalidResponse: "The server returned an invalid response."
    }
  }
}

/// Reports upload progress from the URL loading system. Immutable, so it is safe to share.
private final class UploadProgress: NSObject, URLSessionTaskDelegate, Sendable {
  let report: @Sendable (Double) -> Void
  init(_ report: @escaping @Sendable (Double) -> Void) { self.report = report }

  func urlSession(
    _ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64, totalBytesExpectedToSend: Int64
  ) {
    guard totalBytesExpectedToSend > 0 else { return }
    report(Double(totalBytesSent) / Double(totalBytesExpectedToSend))
  }
}

/// Streams a file to `/api/data-room/upload` and downloads stored bytes, both with the session's
/// credentials from `AuthClient`. A body is read from disk by the system, never held in memory.
@MainActor
struct DataRoomTransfer {
  let app: AppModel

  private static func session() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    configuration.httpCookieStorage = nil
    return URLSession(configuration: configuration)
  }

  /// Returns the parsed result for 200 (duplicate), 201 (new) and 202 (zip import).
  func upload(
    file: URL, name: String, mimeType: String, folderID: String?,
    progress: @escaping @Sendable (Double) -> Void
  ) async throws -> DataRoomUploadResult {
    var request = try await authorized(
      path: "/api/data-room/upload", method: "POST", contentType: mimeType,
      query: [URLQueryItem(name: "name", value: name)]
        + (folderID.map { [URLQueryItem(name: "folderId", value: $0)] } ?? []))
    request.request.timeoutInterval = 120
    let session = Self.session()
    defer { session.finishTasksAndInvalidate() }
    let (data, response) = try await session.upload(
      for: request.request, fromFile: file, delegate: UploadProgress(progress))
    guard let http = response as? HTTPURLResponse else { throw DataRoomTransferError.invalidResponse }
    switch http.statusCode {
    case 200, 201, 202:
      return try JSONDecoder().decode(DataRoomUploadResult.self, from: data)
    default:
      throw await failure(http.statusCode, data, request)
    }
  }

  /// Saves the file's bytes under a temporary folder and returns the file URL for Quick Look.
  func download(_ item: DataRoomItem) async throws -> URL {
    let request = try await authorized(
      path: "/api/data-room/items/\(item.id)/content", method: "GET", contentType: nil, query: [])
    let session = Self.session()
    defer { session.finishTasksAndInvalidate() }
    let (temporary, response) = try await session.download(for: request.request)
    guard let http = response as? HTTPURLResponse else { throw DataRoomTransferError.invalidResponse }
    guard http.statusCode == 200 else {
      throw await failure(http.statusCode, (try? Data(contentsOf: temporary)) ?? Data(), request)
    }
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(
      "dataroom-\(item.id)", isDirectory: true)
    try? FileManager.default.removeItem(at: folder)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let destination = folder.appendingPathComponent(item.name)
    try FileManager.default.moveItem(at: temporary, to: destination)
    return destination
  }

  func thumbnail(for id: String) async throws -> Data {
    let url = app.authentication.endpoint.appending(path: "/api/data-room/items/\(id)/thumbnail")
    return try await app.data(url: url)
  }

  private struct Sent {
    var request: URLRequest
    let generation: UInt64
    let hadSpace: Bool
  }

  private func authorized(
    path: String, method: String, contentType: String?, query: [URLQueryItem]
  ) async throws -> Sent {
    let sent: AuthorizedRequest
    do {
      sent = try await app.authentication.client.authorized(
        path: path, method: method, body: nil, contentType: contentType, spaceID: app.spaceID)
    } catch AuthClientError.unauthorized {
      await endSession()
      throw RPCError.unauthorized
    }
    var components = URLComponents(url: sent.request.url, resolvingAgainstBaseURL: false)
    if !query.isEmpty { components?.queryItems = query }
    guard let url = components?.url else { throw DataRoomTransferError.invalidResponse }
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
    request.httpMethod = method
    for (name, value) in sent.request.headers { request.setValue(value, forHTTPHeaderField: name) }
    return Sent(request: request, generation: sent.generation, hadSpace: sent.hadSpace)
  }

  private func failure(_ status: Int, _ body: Data, _ sent: Sent) async -> any Error {
    if status == 401 {
      let error = await app.authentication.client.handleUnauthorized(
        generation: sent.generation, hadSpace: sent.hadSpace)
      if error == .unauthorized { await endSession() }
      if error == .spaceRejected { app.spaceID = nil }
      return error
    }
    struct Body: Decodable { let error: String? }
    return DataRoomTransferError.badResponse(
      status, (try? JSONDecoder().decode(Body.self, from: body))?.error)
  }

  private func endSession() async {
    app.reset()
    await app.authentication.sync()
  }
}
