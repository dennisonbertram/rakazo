import Foundation
import Testing

@testable import Praci

@MainActor
@Test
func groupNeedsANameAndTwoToSixMembers() {
  #expect(!ManageClient.canCreateGroup(name: "Team", members: 1))
  #expect(ManageClient.canCreateGroup(name: "Team", members: 2))
  #expect(ManageClient.canCreateGroup(name: " Team ", members: 6))
  #expect(!ManageClient.canCreateGroup(name: "Team", members: 7))
  #expect(!ManageClient.canCreateGroup(name: "   ", members: 3))
}

@Test
func updateSendsNullOnlyWhenClearingTheSection() throws {
  var input = BotUpdateInput(botId: "b")
  input.pinned = true
  #expect(!String(decoding: try JSONEncoder().encode(input), as: UTF8.self).contains("sectionId"))
  input.clearSection = true
  #expect(String(decoding: try JSONEncoder().encode(input), as: UTF8.self).contains(#""sectionId":null"#))
}
