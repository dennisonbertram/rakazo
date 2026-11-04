import Foundation
import RakazoAPI
import Testing

private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
  try JSONDecoder().decode(RPCEnvelope<T>.self, from: loadFixture(named: name)).json
}

private let everyone = ["inbox", "chat", "b", "c", "d"]
private func agent(_ id: String, _ name: String, key: String? = nil) -> AccessAgent {
  AccessAgent(id: id, name: name, spawnKey: key)
}
private let roster = [
  agent("inbox", "Inbox agent", key: "inbox-agent:u1"),
  agent("chat", "Re: Lunch", key: "mail-thread:c1:t1"),
  agent("b", "Beta"), agent("c", "alpha"), agent("d", "Delta"),
]

@Test
func decodesAccountAddressAndSharing() throws {
  let list = try decode([Connection].self, "connections-list")
  #expect(list[0].account == "founder@example.com" && list[0].agentBotId == "bot-inbox")
  #expect(list[1].account == nil && list[1].agentBotId == nil && !list[1].writesEnabled)
  let access = try decode(ConnectionAccess.self, "connections-access")
  #expect(!access.allAgents && access.botIds == ["bot-inbox", "bot-b"] && access.agentShared)
  let effective = try decode([String: EffectiveAccess].self, "connections-effective-access")
  #expect(effective["conn-second"]?.shared == "all" && effective["conn-placeholder"]?.botIds.count == 2)
}

@Test
func decodesAgentsServersAndAssignments() throws {
  let agents = try decode([AccessAgent].self, "bots-list-access")
  #expect(agents[0].isInboxAgent && agents[1].isMailChat && !agents[2].isMailChat)
  #expect(agents[3].archivedAt == nil)
  let servers = try decode([McpServer].self, "mcp-servers-list")
  #expect(servers[0].agentBotId == "bot-b" && servers[0].agentExclusive)
  #expect(servers[1].agentBotId == nil && !servers[1].enabled && !servers[1].agentExclusive)
  let all = try decode([McpAssignment].self, "mcp-assignments-all")
  #expect(all[0].botId == "bot-c" && !all[0].allowAllTools && all[0].allowedTools == ["read"])
}

@Test
func namesAreOneToSixtyCharactersAfterTrimming() {
  #expect(AccessLogic.validName("  Work  ") == "Work")
  #expect(AccessLogic.validName("   ") == nil)
  #expect(AccessLogic.validName("") == nil)
  #expect(AccessLogic.validName(String(repeating: "a", count: 60)) != nil)
  #expect(AccessLogic.validName(String(repeating: "a", count: 61)) == nil)
  #expect(AccessLogic.validName(String(repeating: "a", count: 61), limit: 120) != nil)
}

@Test
func switchingOneAgentBuildsOnWhatItHas() {
  let some = AccessGrant(allAgents: false, botIds: ["inbox"])
  let on = AccessLogic.toggled(some, allBotIDs: everyone, botID: "b", on: true)
  #expect(!on.allAgents && Set(on.botIds) == ["inbox", "b"])
  #expect(AccessLogic.toggled(on, allBotIDs: everyone, botID: "b", on: false) == some)
  // Everyone minus one is a list; the last one back collapses to "all agents".
  let all = AccessGrant(allAgents: true, botIds: [])
  let minusB = AccessLogic.toggled(all, allBotIDs: everyone, botID: "b", on: false)
  #expect(!minusB.allAgents && Set(minusB.botIds) == ["inbox", "chat", "c", "d"])
  #expect(AccessLogic.toggled(minusB, allBotIDs: everyone, botID: "b", on: true) == all)
}

@Test
func allAndNoneActOnTheOtherAgentsOnly() {
  let keep = AccessLogic.keptIDs(agents: roster, ownerID: "inbox")
  #expect(keep == ["inbox", "chat"])
  let none = AccessLogic.setOthers(
    AccessGrant(allAgents: true, botIds: []), allBotIDs: everyone, keep: keep, on: false)
  #expect(!none.allAgents && Set(none.botIds) == ["inbox", "chat"])
  let all = AccessLogic.setOthers(none, allBotIDs: everyone, keep: keep, on: true)
  #expect(all == AccessGrant(allAgents: true, botIds: []))
  // A kept agent that was off stays off.
  let owned = AccessLogic.setOthers(
    AccessGrant(allAgents: false, botIds: ["b"]), allBotIDs: everyone, keep: ["inbox"], on: false)
  #expect(owned.botIds.isEmpty && !owned.allAgents)
  // Only a mail account keeps the email chats; other owners keep themselves.
  #expect(AccessLogic.keptIDs(agents: roster, ownerID: "b") == ["b"])
  #expect(AccessLogic.keptIDs(agents: roster, ownerID: nil).isEmpty)
}

@Test
func listPinsTheMailGroupAndSortsOnFirstThenByName() {
  let layout = AccessLogic.layout(agents: roster, ownerID: "inbox", on: ["d", "inbox"])
  #expect(layout.mail && layout.owner?.id == "inbox" && layout.chats.map(\.id) == ["chat"])
  #expect(layout.others.map(\.id) == ["d", "c", "b"])
}

@Test
func listSearchesAndFiltersTheOthers() {
  let on: Set = ["d", "c"]
  func ids(_ query: String, _ filter: AccessLogic.Filter) -> [String] {
    AccessLogic.layout(agents: roster, ownerID: nil, on: on, query: query, filter: filter)
      .others.map(\.id)
  }
  #expect(ids("", .on) == ["c", "d"])
  #expect(ids("", .off) == ["b", "inbox"])
  #expect(ids(" BET ", .all) == ["b"])
  #expect(ids("zzz", .all).isEmpty)
  #expect(AccessLogic.layout(agents: roster, ownerID: nil, on: on).chats.count == 1)
}

@Test
func anAgentSeesItsAccountsAndServers() throws {
  let connections = try decode([Connection].self, "connections-list")
  let servers = try decode([McpServer].self, "mcp-servers-list")
  let effective = try decode([String: EffectiveAccess].self, "connections-effective-access")
  let agents = [
    AccessAgent(id: "bot-inbox", name: "Inbox agent", spawnKey: "inbox-agent:u1"),
    AccessAgent(id: "bot-b", name: "Beta"),
  ]
  func rows(_ agent: AccessAgent, shared: Bool = true, assigned: Set<String> = []) -> [AccessLogic.Row] {
    let access = ConnectionAccess(allAgents: false, botIds: [], agentShared: shared)
    return AccessLogic.rows(
      for: agent, agents: agents, connections: connections, servers: servers,
      effective: effective, accesses: ["conn-placeholder": access], assigned: assigned)
  }
  let beta = rows(agents[1])
  #expect(beta.map(\.name) == ["Example MCP", "Founder mail", "Support mail"])
  #expect(beta[0].on && beta[0].locked)  // Beta is that server's own agent
  #expect(beta[1].on && !beta[1].locked && beta[1].address == "founder@example.com")
  #expect(rows(agents[1], shared: false)[1].locked)  // not shared with other agents
  #expect(rows(agents[0])[1].locked)  // its own account
  #expect(servers.filter(\.enabled).count == 1)  // the disabled server is not listed
  let chat = AccessAgent(id: "bot-chat", name: "Re: Lunch", spawnKey: "mail-thread:c:t")
  #expect(rows(chat)[1].locked)  // an email chat follows the Inbox agent
}
