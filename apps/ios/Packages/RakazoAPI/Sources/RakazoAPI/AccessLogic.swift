import Foundation

/// The pure rules behind the Access lists, kept apart from the screens so they can be tested.
public enum AccessLogic {
  public static let accountNameLimit = 60
  public static let serverNameLimit = 120
  /// Search and the On/Off filter appear once a list is longer than this.
  public static let controlsMinimum = 8

  /// The trimmed name when it is 1 to `limit` characters long, otherwise nil.
  public static func validName(_ text: String, limit: Int = accountNameLimit) -> String? {
    let name = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return (1...limit).contains(name.count) ? name : nil
  }

  /// The grant after switching one agent on or off. Everyone collapses back to `allAgents`.
  public static func toggled(
    _ current: AccessGrant, allBotIDs: [String], botID: String, on: Bool
  ) -> AccessGrant {
    var ids = Set(current.allAgents ? allBotIDs : current.botIds)
    if on { ids.insert(botID) } else { ids.remove(botID) }
    return collapse(ids, allBotIDs)
  }

  /// All or None for the agents outside `keep`. The kept agents stay exactly as they are.
  public static func setOthers(
    _ current: AccessGrant, allBotIDs: [String], keep: [String], on: Bool
  ) -> AccessGrant {
    let kept = Set(keep)
    var ids = Set((current.allAgents ? allBotIDs : current.botIds).filter(kept.contains))
    if on { ids.formUnion(allBotIDs.filter { !kept.contains($0) }) }
    return collapse(ids, allBotIDs)
  }

  private static func collapse(_ ids: Set<String>, _ allBotIDs: [String]) -> AccessGrant {
    let all = allBotIDs.allSatisfy(ids.contains)
    // Sorted so the same grant always encodes the same way.
    return AccessGrant(allAgents: all, botIds: all ? [] : ids.sorted())
  }

  /// The agents All and None leave alone: the owner and, on a mail account, its email chats.
  public static func keptIDs(agents: [AccessAgent], ownerID: String?) -> [String] {
    guard let ownerID else { return [] }
    let owner = agents.first { $0.id == ownerID }
    let chats = owner?.isInboxAgent == true ? agents.filter(\.isMailChat).map(\.id) : []
    return [ownerID] + chats
  }

  public enum Filter: String, Sendable, CaseIterable { case all, on, off }

  /// What one Access list shows, top to bottom.
  public struct Layout: Sendable, Equatable {
    /// The connection's own agent, pinned first.
    public var owner: AccessAgent?
    /// Email chats are one row; only on a mail account.
    public var chats: [AccessAgent]
    public var others: [AccessAgent]

    public init(owner: AccessAgent?, chats: [AccessAgent], others: [AccessAgent]) {
      self.owner = owner
      self.chats = chats
      self.others = others
    }
    /// On a mail account the Inbox agent and email chats sit apart, above "Other agents".
    public var mail: Bool { owner?.isInboxAgent == true }
  }

  /// Splits the agents into the pinned group and the rest. `others` are searched by name, filtered
  /// and ordered on-first then by name from `on` as it is when this is called; the caller keeps
  /// the result while switches flip, so a row never jumps under the finger.
  public static func layout(
    agents: [AccessAgent], ownerID: String?, on: Set<String>, query: String = "",
    filter: Filter = .all
  ) -> Layout {
    let owner = agents.first { $0.id == ownerID }
    let chats = agents.filter(\.isMailChat)
    let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
    let others = agents
      .filter { !$0.isMailChat && $0.id != ownerID }
      .filter { needle.isEmpty || $0.name.lowercased().contains(needle) }
      .filter {
        switch filter {
        case .all: true
        case .on: on.contains($0.id)
        case .off: !on.contains($0.id)
        }
      }
      .sorted {
        let (a, b) = (on.contains($0.id), on.contains($1.id))
        return a != b ? a : $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
      }
    return Layout(owner: owner, chats: chats, others: others)
  }

  /// One account or server in an agent's own Access list.
  public struct Row: Sendable, Hashable, Identifiable {
    public enum Kind: Sendable, Hashable { case connection, server }
    public let id: String
    public let kind: Kind
    public let refID: String
    public let name: String
    public let address: String?
    public var on: Bool
    /// The agent cannot change it: it is the account's own agent, an email chat that follows the
    /// Inbox agent, or the account is not shared with other agents.
    public let locked: Bool

    public init(
      id: String, kind: Kind, refID: String, name: String, address: String?, on: Bool,
      locked: Bool
    ) {
      self.id = id
      self.kind = kind
      self.refID = refID
      self.name = name
      self.address = address
      self.on = on
      self.locked = locked
    }
  }

  /// The accounts and servers one agent can reach, ordered by name then address.
  public static func rows(
    for agent: AccessAgent, agents: [AccessAgent], connections: [Connection],
    servers: [McpServer], effective: [String: EffectiveAccess],
    accesses: [String: ConnectionAccess], assigned: Set<String>
  ) -> [Row] {
    let accounts = connections.filter { $0.isConnected && !$0.needsReconnect }.map { connection in
      let ownerKey = agents.first { $0.id == connection.agentBotId }
      let own = connection.agentBotId == agent.id
      let mailChat = agent.isMailChat && ownerKey?.isInboxAgent == true
      let privateToOwner =
        connection.agentBotId != nil && !own && !(accesses[connection.id]?.agentShared ?? true)
      return Row(
        id: "connection:\(connection.id)", kind: .connection, refID: connection.id,
        name: connection.displayName, address: connection.account,
        on: effective[connection.id]?.botIds.contains(agent.id) ?? false,
        locked: own || mailChat || privateToOwner)
    }
    let mcp = servers.filter(\.enabled).map { server in
      let own = server.agentBotId == agent.id
      return Row(
        id: "server:\(server.id)", kind: .server, refID: server.id, name: server.name,
        address: nil, on: own || assigned.contains(server.id),
        locked: own || (server.agentBotId != nil && server.agentExclusive))
    }
    return (accounts + mcp).sorted {
      let byName = $0.name.localizedCaseInsensitiveCompare($1.name)
      if byName != .orderedSame { return byName == .orderedAscending }
      return ($0.address ?? "").localizedCaseInsensitiveCompare($1.address ?? "") == .orderedAscending
    }
  }
}
