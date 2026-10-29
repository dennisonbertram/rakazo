import Foundation
@testable import RakazoAPI
import Testing

@Test
func decodesRecordedBotThread() throws {
  let thread = try JSONDecoder().decode(
    RPCEnvelope<ThreadSnapshot>.self, from: loadFixture(named: "thread-get-bot")
  ).json
  #expect(thread.cursor == 1)
  #expect(thread.lastReadSeq == -1)
  #expect(thread.olderCursor == nil)
  #expect(thread.run == nil)
  #expect(thread.botId == "id-placeholder-4")
  #expect(thread.computer?.state == "running")
  #expect(thread.computer?.busyBotName == nil)
  #expect(thread.messages.count == 8)
  #expect(thread.messages[0].role == "user")
  #expect(thread.messages[1].botId == thread.botId)
  let kinds = thread.messages[1].blocks.map(\.kind)
  #expect(kinds == [.text, .steps])
  #expect(thread.messages.contains { $0.blocks.contains { $0.kind == .card } })
}

@Test
func decodesRecordedGroupThread() throws {
  let thread = try JSONDecoder().decode(
    RPCEnvelope<ThreadSnapshot>.self, from: loadFixture(named: "thread-get-group")
  ).json
  #expect(thread.cursor == -1)
  #expect(thread.groupName == "Group placeholder")
  #expect(thread.members?.map(\.status) == ["idle", "waiting_input"])
  #expect(thread.activeRuns == [])
  #expect(thread.messages.count == 8)
}

@Test
func decodesRecordedMessagePage() throws {
  let page = try JSONDecoder().decode(
    RPCEnvelope<ThreadMessagePage>.self, from: loadFixture(named: "thread-messages")
  ).json
  #expect(page.messages.count == 4)
  #expect(page.olderCursor == nil)
  #expect(page.coveredThroughSeq == nil)
}

@Test
func toleratesRunsReplyPreviewsAndUnknownValues() throws {
  let thread = try JSONDecoder().decode(
    RPCEnvelope<ThreadSnapshot>.self, from: loadFixture(named: "thread-get-running")
  ).json
  #expect(thread.run?.status == "running")
  #expect(thread.run?.trigger == "a-future-trigger")
  #expect(thread.run?.phase?.kind == "thinking")
  #expect(thread.delegatePendingAgents?.first?.name == "Helper")
  let message = try #require(thread.messages.first)
  #expect(message.blocks.first?.kind == .unknown("a_future_block"))
  #expect(message.replyPreview?.attachment?.artifactId == "artifact-placeholder")
  #expect(message.replyToMessageId == "message-two")
}

@Test
func messageWithMissingOptionalFieldsStillDecodes() throws {
  let data = Data(#"{"id":"m1","blocks":[{"kind":"text","text":"hi"}]}"#.utf8)
  let message = try JSONDecoder().decode(ThreadMessage.self, from: data)
  #expect(message.id == "m1")
  #expect(message.role == "bot")
  #expect(message.blocks.first?.text == "hi")
}
