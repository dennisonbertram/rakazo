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
  let withoutSection = try String(bytes: JSONEncoder().encode(input), encoding: .utf8)
  #expect(withoutSection?.contains("sectionId") == false)
  input.clearSection = true
  let clearing = try String(bytes: JSONEncoder().encode(input), encoding: .utf8)
  #expect(clearing?.contains(#""sectionId":null"#) == true)
}
