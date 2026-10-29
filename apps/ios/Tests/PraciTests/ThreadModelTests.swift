import Foundation
import RakazoAPI
import Testing

@testable import Praci

@MainActor
struct ThreadModelTests {
  private func event(_ json: String) throws -> ProductEvent {
    try JSONDecoder().decode(ProductEvent.self, from: Data(json.utf8))
  }

  private func prefix(_ seq: Int, _ type: String) -> String {
    """
    {"id":"e\(seq)","spaceId":"space-1","threadId":"thread-1","botId":"bot-1","seq":\(seq),\
    "type":"\(type)","runId":"run-1","createdAt":"2026-10-29T04:33:15.158Z",
    """
  }

  /// Events recorded from the demo server for one send that stops at a pending ask.
  @Test func sendThenAskKeepsTheUserMessage() throws {
    let model = ThreadModel(target: .bot("bot-1"))
    model.state = .loaded(ThreadSnapshot(threadId: "thread-1", cursor: 0))
    let user = prefix(1, "thread.message.created")
      + #""payload":{"role":"user","blocks":[{"kind":"text","text":"probe"}],"messageId":"m-user"}}"#
    let started = prefix(2, "run.started") + #""payload":{"trigger":"user","routineId":null}}"#
    let ask = prefix(7, "thread.message.created")
      + #""payload":{"role":"bot","blocks":[{"kind":"ask","text":"Share?","status":"pending"}],"messageId":"m-ask"}}"#
    let waiting = prefix(8, "run.waiting_input") + #""payload":{}}"#
    for json in [user, started, ask, waiting] { model.apply(try event(json)) }
    #expect(model.storedMessages.map(\.id) == ["m-user", "m-ask"])
  }

  /// A message folded from an event has the event's seq; a refresh must not list it twice.
  @Test func refreshDoesNotDuplicateEventMessages() {
    let live = ThreadMessage(id: "m-user", seq: 1, role: "user")
    let old = ThreadSnapshot(threadId: "thread-1", cursor: 1, messages: [live])
    let fresh = ThreadSnapshot(
      threadId: "thread-1", cursor: 4,
      messages: [ThreadMessage(id: "m-prev", seq: 12), ThreadMessage(id: "m-user", seq: 14, role: "user")])
    #expect(ThreadModel.merged(fresh, keeping: old).messages.map(\.id) == ["m-prev", "m-user"])
  }
}
