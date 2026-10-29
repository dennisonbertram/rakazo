// swiftlint:disable identifier_name line_length
import Foundation
import RakazoAPI
import RakazoCore
import Testing

@testable import Praci

@MainActor
private final class FakeCompose {
  var outcomes: [Result<ComposeOutcome, Error>] = []
  var sends: [ComposeDraft] = []
  var discards: [String] = []

  func client() -> ComposeClient {
    ComposeClient(
      prefill: { _ in
        try JSONDecoder().decode(
          ComposePrefill.self,
          from: Data(#"{"connectionId":"c1","account":{"connectionId":"c1","label":"Mail","address":"me@example.test"},"to":"Ana <ana@example.test>","cc":"","subject":"Re: Hi","body":"\n\n> Hi","replyToMessageId":"m1","attachments":[]}"#.utf8))
      },
      accounts: { [] },
      save: { _ in .saved },
      send: { draft in
        self.sends.append(draft)
        return try self.outcomes.removeFirst().get()
      },
      discard: { self.discards.append($0) })
  }
}

@MainActor
private func model(_ fake: FakeCompose) async -> ComposeModel {
  let model = ComposeModel(mode: .reply("m1"), client: fake.client(), clientID: "client-0001")
  await model.load()
  return model
}

@Test @MainActor
func replyPrefillsTheFieldsAndTracksChanges() async {
  let m = await model(FakeCompose())
  #expect(m.to == "Ana <ana@example.test>" && m.subject == "Re: Hi" && m.connectionID == "c1")
  #expect(!m.hasChanges)
  m.body = "Thanks" + m.body
  #expect(m.hasChanges)
}

@Test @MainActor
func sendNeedsAValidRecipient() async {
  let m = await model(FakeCompose())
  #expect(m.canSend)
  m.to = ""
  #expect(!m.canSend)
  m.to = "ana@@example"
  #expect(!m.canSend && m.toError)
}

@Test @MainActor
func aSentMessageClosesAndCarriesTheReplyIdAndClientID() async {
  let fake = FakeCompose()
  fake.outcomes = [.success(.sent)]
  let m = await model(fake)
  #expect(await m.send())
  #expect(fake.sends.first?.replyToMessageId == "m1" && fake.sends.first?.clientId == "client-0001")
}

@Test @MainActor
func aFailedSendShowsTheServerOutcomeAndCanBeRetriedByTheUser() async {
  let fake = FakeCompose()
  fake.outcomes = [.success(.failed(reason: "rejected")), .success(.sent)]
  let m = await model(fake)
  #expect(await m.send() == false)
  if case .notSent(let text)? = m.banner { #expect(text.contains("rejected")) } else { Issue.record("no banner") }
  #expect(m.canSend)
  #expect(await m.send())
  #expect(fake.sends.count == 2)
}

@Test @MainActor
func anUnknownResultIsNeverRetried() async {
  let fake = FakeCompose()
  fake.outcomes = [.success(.unknown)]
  let m = await model(fake)
  #expect(await m.send() == false)
  #expect(m.banner == .unknown && !m.canSend)
  #expect(await m.send() == false)
  #expect(fake.sends.count == 1)
}

@Test @MainActor
func aDroppedConnectionCountsAsUnknownButAServerErrorDoesNot() async {
  let lost = FakeCompose()
  lost.outcomes = [.failure(URLError(.timedOut))]
  let a = await model(lost)
  _ = await a.send()
  #expect(a.banner == .unknown && !a.canSend)

  let refused = FakeCompose()
  refused.outcomes = [.failure(RPCError.server(code: "BAD_REQUEST", status: 400, message: "Bad address"))]
  let b = await model(refused)
  _ = await b.send()
  #expect(b.banner == .notSent("Bad address") && b.canSend)
}

@Test @MainActor
func savingThenDiscardingCallsTheServerOnce() async {
  let fake = FakeCompose()
  let m = await model(fake)
  await m.discard()
  #expect(fake.discards.isEmpty)
  #expect(await m.saveDraft())
  await m.discard()
  await m.discard()
  #expect(fake.discards == ["client-0001"])
}

@Test @MainActor
func todosRevertWhenSavingFails() async throws {
  struct Boom: LocalizedError { var errorDescription: String? { "No connection." } }
  let list = try JSONDecoder().decode(
    RPCEnvelope<MailTodoList>.self,
    from: Data(#"{"json":{"enabled":true,"todos":[{"id":"a","text":"One"},{"id":"b","text":"Two"}]}}"#.utf8)).json
  var fail = false
  let model = TodosModel(client: TodosClient(list: { list }, setDone: { _, _ in if fail { throw Boom() } }))
  await model.load()
  #expect(model.isVisible && model.todos.count == 2)
  await model.complete(model.todos[0])
  #expect(model.todos.map(\.id) == ["b"])
  fail = true
  await model.complete(model.todos[0])
  #expect(model.todos.map(\.id) == ["b"] && model.actionError == "No connection.")
}

@Test
func dueLabels() {
  let cal = Calendar(identifier: .gregorian)
  let now = cal.date(from: DateComponents(year: 2026, month: 10, day: 29, hour: 9))!
  #expect(TodoDue.label("2026-10-29", now: now, calendar: cal) == "Today")
  #expect(TodoDue.label("2026-10-30", now: now, calendar: cal) == "Tomorrow")
  #expect(TodoDue.label("garbage", now: now, calendar: cal) == nil)
}

@Test
func safeHTMLAddsThePolicyFirstAndDropsBaseAndMeta() {
  let doc = SafeHTML.document(
    for: #"<base href="https://evil.test/"><meta http-equiv="Content-Security-Policy" content="default-src *"><p>Hi</p>"#)
  #expect(doc.contains("default-src 'none'; img-src data: https:; style-src 'unsafe-inline'"))
  #expect(!doc.contains("evil.test") && !doc.contains("default-src *"))
  let proxied = SafeHTML.document(
    for: #"<img src="/api/inbox/image?u=x">"#, server: URL(string: "http://127.0.0.1:3301")!)
  #expect(proxied.contains(#"src="http://127.0.0.1:3301/api/inbox/image?u=x""#))
  #expect(proxied.contains("img-src data: https: http://127.0.0.1:3301;"))
  #expect(SafeHTML.openableURL(URL(string: "javascript:alert(1)")) == nil)
  #expect(SafeHTML.openableURL(URL(string: "https://example.test")) != nil)
}
