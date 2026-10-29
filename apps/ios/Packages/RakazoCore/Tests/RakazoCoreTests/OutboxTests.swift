import Foundation
@testable import RakazoCore
import Testing

private let scope = OutboxScope(
  apiBase: "https://api.example.test", userID: "user-a", cacheSession: "namespace-a",
  spaceID: "space-a"
)

private func tempDisk() -> OutboxDisk {
  OutboxDisk(
    directory: FileManager.default.temporaryDirectory
      .appendingPathComponent("outbox-\(UUID().uuidString)", isDirectory: true)
  )
}

private func attempt(_ nonce: String = "nonce-a", scope: OutboxScope = scope) -> SendAttempt {
  SendAttempt(
    clientNonce: nonce, state: .pending,
    payload: SendPayload(
      originThreadKey: "bot-a", displayText: "Hello", botTarget: "bot-a",
      attachments: [
        OutboxAttachment(
          id: "attachment-a", name: "photo.png", mimeType: "image/png",
          data: Data("hello".utf8), previewURL: URL(string: "file:///fake-preview")
        ),
      ]
    ),
    scope: scope, session: 1, artifactIDs: ["attachment-a": "artifact-a"]
  )
}

private func file(_ disk: OutboxDisk, _ path: String) -> URL {
  disk.root.appendingPathComponent(path)
}

@Test("restores payload, uploaded ids and nonce for an idempotent retry")
func restoresForIdempotentRetry() throws {
  let disk = tempDisk()
  defer { disk.clear() }
  var original = attempt()
  #expect(try disk.admit(&original))
  disk.save([original])
  try Data("orphan".utf8).write(to: file(disk, "delivered-0"))
  var restored = try #require(disk.load(session: 2, scope: scope).first)
  #expect(restored.state == .queued)
  #expect(restored.session == 2)
  #expect(restored.clientNonce == original.clientNonce)
  #expect(!FileManager.default.fileExists(atPath: file(disk, "delivered-0").path))
  #expect(restored.artifactIDs == original.artifactIDs)
  #expect(restored.payload.attachments[0].data.isEmpty)
  restored.artifactIDs = [:]
  try disk.hydrate(&restored)
  #expect(restored.payload.attachments[0].data == Data("hello".utf8))
  let text = try String(contentsOf: file(disk, "sends-v4.json"), encoding: .utf8)
  #expect(!text.contains("aGVsbG8="))
  #expect(!text.contains("file:"))
}

@Test(
  "rejects a different owner or session",
  arguments: [
    OutboxScope(apiBase: scope.apiBase, userID: "user-b", cacheSession: "namespace-a", spaceID: "space-a"),
    OutboxScope(apiBase: "https://other.example.test", userID: "user-a", cacheSession: "namespace-a", spaceID: "space-a"),
    OutboxScope(apiBase: scope.apiBase, userID: "user-a", cacheSession: "namespace-b", spaceID: "space-a"),
  ]
)
func rejectsDifferentOwner(other: OutboxScope) {
  let disk = tempDisk()
  defer { disk.clear() }
  disk.save([attempt()])
  #expect(disk.load(session: 2, scope: other).isEmpty)
}

@Test("caps the persisted count and wipes every entry")
func capsCountAndWipes() {
  let disk = tempDisk()
  disk.save((0 ..< (OutboxLimits.maxEntries + 5)).map { attempt("nonce-\($0)") })
  #expect(disk.load(session: 2, scope: scope).count == OutboxLimits.maxEntries)
  disk.clear()
  #expect(!FileManager.default.fileExists(atPath: disk.root.path))
}

@Test("treats corrupt storage as an empty outbox")
func corruptStorageIsEmpty() throws {
  let disk = tempDisk()
  defer { disk.clear() }
  try FileManager.default.createDirectory(at: disk.root, withIntermediateDirectories: true)
  try Data("{".utf8).write(to: file(disk, "sends-v4.json"))
  #expect(disk.load(session: 2, scope: scope).isEmpty)
}

@Test("rejects a full attachment budget without rewriting existing bytes")
func fullBudgetKeepsExistingBytes() throws {
  let disk = tempDisk()
  defer { disk.clear() }
  try FileManager.default.createDirectory(at: file(disk, "old"), withIntermediateDirectories: true)
  try Data("x".utf8).write(to: file(disk, "old/0"))
  var large = attempt()
  large.payload.attachments[0].data = Data(count: OutboxLimits.maxBytes)
  #expect(try disk.admit(&large) == false)
  #expect(try Data(contentsOf: file(disk, "old/0")) == Data("x".utf8))
}

@Test("does not reuse leftover bytes for a repeated nonce in another session")
func repeatedNonceIsRejected() throws {
  let disk = tempDisk()
  defer { disk.clear() }
  try FileManager.default.createDirectory(at: file(disk, "nonce-a"), withIntermediateDirectories: true)
  try Data("old-private-placeholder".utf8).write(to: file(disk, "nonce-a/0"))
  var next = attempt(
    scope: OutboxScope(
      apiBase: scope.apiBase, userID: "user-b", cacheSession: "namespace-b", spaceID: "space-a"
    )
  )
  #expect(try disk.admit(&next) == false)
  #expect(next.payload.attachments[0].data == Data("hello".utf8))
}

@Test("hydrate fails when the stored attachment is gone")
func hydrateMissingAttachment() throws {
  let disk = tempDisk()
  defer { disk.clear() }
  var item = attempt()
  item.artifactIDs = [:]
  #expect(try disk.admit(&item))
  disk.forget(item)
  #expect(throws: OutboxError.attachmentUnavailable) { try disk.hydrate(&item) }
}

@Test("does not persist a pending state")
func pendingStoredAsQueued() throws {
  let disk = tempDisk()
  defer { disk.clear() }
  disk.save([attempt()])
  let text = try String(contentsOf: file(disk, "sends-v4.json"), encoding: .utf8)
  #expect(text.contains("\"queued\""))
  #expect(!text.contains("pending"))
}

@Test(
  "classifies a failed send",
  arguments: [
    (nil as Int?, true, SendState.queued, true),
    (429, false, .queued, true),
    (408, false, .queued, true),
    (425, false, .queued, true),
    (400, false, .refused, false),
    (409, false, .refused, false),
    (503, false, .failed, false),
    (nil, false, .failed, false),
  ]
)
func classifiesFailures(status: Int?, unreachable: Bool, state: SendState, pauses: Bool) {
  #expect(
    SendOutcome.classify(status: status, unreachable: unreachable)
      == SendOutcome(state: state, pausesQueue: pauses)
  )
}
