import Foundation
import Testing

@testable import RakazoAPI

private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
  try JSONDecoder().decode(RPCEnvelope<T>.self, from: loadFixture(named: name)).json
}

@Test
func decodesNotificationPreferencesAndTreatsMissingChannelsAsOn() throws {
  let p = try decode(NotificationPreferences.self, "settings-notification-preferences")
  #expect(p.finish && !p.help && p.takeover)
  #expect(!p.push)
  #expect(p.imessage)
  #expect(p.hasPhone && !p.hasImessage)
}

@Test
func encodesOnlyTheChangedNotificationFields() throws {
  let data = try JSONEncoder().encode(
    RPCRequest(json: NotificationPreferencesUpdate(channels: .init(push: false))))
  #expect(String(decoding: data, as: UTF8.self) == #"{"json":{"channels":{"push":false}}}"#)
}

@Test
func decodesUsageIncludingNullCounts() throws {
  let u = try decode(UsageSummary.self, "settings-usage-summary")
  #expect(u.inputTokens == 39 && u.outputTokens == 3038 && u.totalTokens == 129_449)
  #expect(u.runs == 9)
  let empty = try decode(UsageSummary.self, "settings-usage-empty")
  #expect(empty.inputTokens == nil && empty.runs == 0)
}

@Test
func archivedListsDecodeAsRosterSummaries() throws {
  let bots = try decode([BotSummary].self, "settings-archived-bots")
  #expect(bots.first?.archivedAt == "2026-10-03T03:26:53.690Z")
  let groups = try decode([GroupSummary].self, "settings-archived-groups")
  #expect(groups.first?.name == "Planning group")
  #expect(try decode(OKResult.self, "settings-restore").ok)
}
