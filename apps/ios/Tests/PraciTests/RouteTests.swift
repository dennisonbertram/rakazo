import Foundation
import Testing

@testable import Praci

private func route(_ string: String) -> Route? { Route(url: URL(string: string)!) }

@Test
func openURLsMapToRoutes() {
  #expect(route("rakazo://open/bot/b1") == .thread(.bot("b1")))
  #expect(route("rakazo://open/group/g1") == .thread(.group("g1")))
  #expect(route("rakazo://open/inbox") == .inbox)
  #expect(route("rakazo://open/inbox/m1") == .inboxMessage(messageID: "m1"))
  #expect(route("rakazo://open/bot/b1/computer") == .computer(botID: "b1"))
  #expect(route("rakazo://open/bot/b1/artifacts") == .artifacts(botID: "b1"))
  #expect(route("rakazo://open/bot/b1/page") == .agentPage(botID: "b1"))
  #expect(route("rakazo://open/bot/b1/routines") == .routines(botID: "b1"))
  #expect(route("rakazo://open/bot/b1/settings") == .botSettings(botID: "b1"))
  #expect(route("rakazo://open/group/g1/settings") == .groupSettings(groupID: "g1"))
  #expect(route("rakazo://open/artifact/a1") == .artifact(artifactID: "a1"))
  #expect(route("rakazo://open/routine/r1") == .routine(routineID: "r1"))
  #expect(route("rakazo://open/finance") == .finance)
  #expect(route("rakazo://open/legal") == .legal)
  #expect(route("rakazo://open/cap-table") == .capTable)
  #expect(route("rakazo://open/data-room") == .dataRoom)
}

@Test
func otherURLsAreIgnored() {
  #expect(route("rakazo://sign-in?attempt=1") == nil)
  #expect(route("rakazo://other/inbox") == nil)
  #expect(route("https://open/inbox") == nil)
  #expect(route("rakazo://open") == nil)
  #expect(route("rakazo://open/unknown") == nil)
  #expect(route("rakazo://open/bot") == nil)
  #expect(route("rakazo://open/bot/b1/unknown") == nil)
  #expect(route("rakazo://open/inbox/m1/extra") == nil)
}
