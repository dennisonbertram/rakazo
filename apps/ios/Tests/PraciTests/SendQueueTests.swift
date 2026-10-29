import Foundation
import RakazoAPI
import RakazoCore
import Testing
import UIKit
import UniformTypeIdentifiers

@testable import Praci

private final class MemoryStorage: SessionStorage, @unchecked Sendable {
  // Reason: tests touch it from one task at a time.
  var session: StoredSession?
  func load() throws -> StoredSession? { session }
  func save(_ session: StoredSession) throws { self.session = session }
  func clear() throws { session = nil }
}

/// Answers by procedure name; a handler may throw to look like an unreachable server.
private actor RoutedTransport: HTTPTransport {
  var handlers: [String: @Sendable () throws -> HTTPResponse] = [:]
  private(set) var sends: [Data] = []
  func set(_ name: String, _ handler: @escaping @Sendable () throws -> HTTPResponse) {
    handlers[name] = handler
  }
  func send(_ request: HTTPRequest, maximumResponseBytes: Int) async throws -> HTTPResponse {
    let name = request.url.path.replacingOccurrences(of: "/rpc/", with: "")
    if name == "threads/send", let body = request.body { sends.append(body) }
    if let handler = handlers[name] { return try handler() }
    if name.hasPrefix("rpc") || request.url.path.contains("session") {
      return HTTPResponse(statusCode: 200, body: Data(#"{"user":{"id":"u1"}}"#.utf8))
    }
    return HTTPResponse(statusCode: 500)
  }
}

private func json(_ text: String) -> HTTPResponse {
  HTTPResponse(statusCode: 200, body: Data(text.utf8))
}

private let consentOK = #"{"json":{"scope":"s","version":"1","recipients":[]}}"#

@MainActor
private func makeApp(_ transport: RoutedTransport) async throws -> AppModel {
  let endpoint = URL(string: "http://127.0.0.1:3301")!
  let storage = MemoryStorage()
  storage.session = StoredSession(endpoint: endpoint, token: "synthetic-token")
  let client = AuthClient(endpoint: endpoint, storage: storage, transport: transport)
  let auth = AuthenticationModel(client: client, defaults: UserDefaults(suiteName: UUID().uuidString)!)
  try await client.restore()
  await auth.sync()
  return AppModel(
    authentication: auth, transport: transport,
    defaults: UserDefaults(suiteName: UUID().uuidString)!)
}

@MainActor
private func settle(_ queue: SendQueue, until done: () -> Bool) async {
  for _ in 0..<200 where !done() { try? await Task.sleep(for: .milliseconds(10)) }
}

private func payload(_ text: String) -> SendPayload {
  SendPayload(originThreadKey: "bot:b1", displayText: text, botTarget: "b1")
}

@MainActor
struct SendQueueTests {
  private func queue() -> SendQueue {
    SendQueue(
      directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString),
      retryDelay: .milliseconds(20))
  }

  @Test func unreachableServerKeepsTheMessageQueuedThenSendsItWithTheSameNonce() async throws {
    let transport = RoutedTransport()
    await transport.set("aiConsent/status") { json(consentOK) }
    await transport.set("threads/send") { throw URLError(.notConnectedToInternet) }
    let app = try await makeApp(transport)
    let queue = queue()
    #expect(queue.enqueue(payload("hello"), app) == nil)
    await settle(queue) { queue.offline }
    #expect(queue.offline)
    #expect(queue.attempts.first?.state == .queued || queue.attempts.first?.state == .pending)
    await transport.set("threads/send") { json(#"{"json":{"taskId":"t","runId":"r","seq":9}}"#) }
    await settle(queue) { queue.attempts.isEmpty }
    #expect(queue.attempts.isEmpty)
    #expect(queue.accepted.first?.acceptedSeq == 9)
    let sends = await transport.sends
    let nonces = try sends.map {
      try #require(JSONSerialization.jsonObject(with: $0) as? [String: Any])
    }.compactMap { ($0["json"] as? [String: Any])?["clientNonce"] as? String }
    #expect(nonces.count >= 2 && Set(nonces).count == 1)
  }

  @Test func clientErrorIsRefusedWithTheServerMessageAndServerErrorFails() async throws {
    let transport = RoutedTransport()
    await transport.set("aiConsent/status") { json(consentOK) }
    await transport.set("threads/send") {
      HTTPResponse(
        statusCode: 400,
        body: Data(
          #"{"json":{"defined":true,"code":"BAD_REQUEST","status":400,"message":"No model connected"}}"#.utf8))
    }
    let app = try await makeApp(transport)
    let queue = queue()
    _ = queue.enqueue(payload("a"), app)
    await settle(queue) { queue.attempts.first?.state == .refused }
    #expect(queue.attempts.first?.state == .refused)
    #expect(queue.attempts.first?.error == "No model connected")
    await transport.set("threads/send") { HTTPResponse(statusCode: 500) }
    let nonce = try #require(queue.attempts.first?.clientNonce)
    queue.retry(nonce, app)
    await settle(queue) { queue.attempts.first?.state == .failed }
    #expect(queue.attempts.first?.state == .failed)
  }

  @Test func heicBecomesJpegAndUnsupportedTypesAreRejected() throws {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { _ in }
    let png = try #require(image.pngData())
    let converted = ComposerModel.prepare(data: png, name: "IMG_1.HEIC", type: .heic)
    #expect(converted?.mimeType == "image/jpeg")
    #expect(converted?.name == "IMG_1.jpg")
    #expect(ComposerModel.prepare(data: Data("x".utf8), name: "a.exe", type: .unixExecutable) == nil)
    #expect(ComposerModel.prepare(data: png, name: "a.png", type: .png)?.mimeType == "image/png")
  }

  @Test func fifthAttachmentAndOversizeFilesAreRefused() {
    let composer = ComposerModel(target: .bot("b1"))
    for index in 0..<5 { composer.add(data: Data("x".utf8), name: "f\(index).txt", type: .plainText) }
    #expect(composer.attachments.count == 4)
    #expect(composer.notice == "4 files is the maximum")
    let fresh = ComposerModel(target: .bot("b1"))
    fresh.add(data: Data(count: AttachmentLimits.maxBytes + 1), name: "big.pdf", type: .pdf)
    #expect(fresh.attachments.isEmpty)
  }
}
