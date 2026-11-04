import Foundation

/// One agent as listed by `rpc_bots_list`, as far as access screens need it.
public struct AccessAgent: Sendable, Hashable, Decodable, Identifiable {
  public let id: String
  public let name: String
  public let color: String?
  public let spawnKey: String?
  public let archivedAt: String?

  /// The agent made for one email conversation.
  public var isMailChat: Bool { spawnKey?.hasPrefix("mail-thread:") ?? false }
  public var isInboxAgent: Bool { spawnKey?.hasPrefix("inbox-agent:") ?? false }

  public init(
    id: String, name: String, color: String? = nil, spawnKey: String? = nil,
    archivedAt: String? = nil
  ) {
    self.id = id
    self.name = name
    self.color = color
    self.spawnKey = spawnKey
    self.archivedAt = archivedAt
  }
}

/// `rpc_connections_access` output (and `_setAccess`): the stored grant of one connection.
public struct ConnectionAccess: Sendable, Hashable, Decodable {
  public let allAgents: Bool
  public let botIds: [String]
  /// The "Let other agents use it" switch of an agent-linked connection.
  public let agentShared: Bool

  public init(allAgents: Bool, botIds: [String], agentShared: Bool) {
    self.allAgents = allAgents
    self.botIds = botIds
    self.agentShared = agentShared
  }

  public var grant: AccessGrant { AccessGrant(allAgents: allAgents, botIds: botIds) }
}

/// One entry of `rpc_connections_effectiveAccess`: who can really use a connection.
public struct EffectiveAccess: Sendable, Hashable, Decodable {
  public let shared: String
  public let botIds: [String]
}

/// The `allAgents` and `botIds` pair that `rpc_connections_setAccess` takes.
public struct AccessGrant: Sendable, Hashable, Codable {
  public var allAgents: Bool
  public var botIds: [String]

  public init(allAgents: Bool, botIds: [String]) {
    self.allAgents = allAgents
    self.botIds = botIds
  }
}

/// `rpc_mcp_servers_list` item, as far as access screens need it.
public struct McpServer: Sendable, Hashable, Decodable, Identifiable {
  public let id: String
  public let name: String
  public let enabled: Bool
  public let writesEnabled: Bool
  public let oauthStatus: String
  public let agentBotId: String?
  /// While true, only the agent may use the server.
  public let agentExclusive: Bool

  public init(
    id: String, name: String, enabled: Bool = true, writesEnabled: Bool = false,
    oauthStatus: String = "none", agentBotId: String? = nil, agentExclusive: Bool = false
  ) {
    self.id = id
    self.name = name
    self.enabled = enabled
    self.writesEnabled = writesEnabled
    self.oauthStatus = oauthStatus
    self.agentBotId = agentBotId
    self.agentExclusive = agentExclusive
  }

  private enum CodingKeys: String, CodingKey {
    case id, name, enabled, writesEnabled, oauthStatus, agentBotId, agentExclusive
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    name = try c.decode(String.self, forKey: .name)
    enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
    writesEnabled = try c.decodeIfPresent(Bool.self, forKey: .writesEnabled) ?? false
    oauthStatus = try c.decodeIfPresent(String.self, forKey: .oauthStatus) ?? "none"
    agentBotId = try c.decodeIfPresent(String.self, forKey: .agentBotId)
    agentExclusive = try c.decodeIfPresent(Bool.self, forKey: .agentExclusive) ?? false
  }
}

/// `rpc_mcp_assignments_list` and `_all` item: one agent's use of one server.
public struct McpAssignment: Sendable, Hashable, Decodable {
  public let botId: String
  public let serverId: String
  public let allowAllTools: Bool
  public let allowedTools: [String]

  public init(botId: String, serverId: String, allowAllTools: Bool = true, allowedTools: [String] = []) {
    self.botId = botId
    self.serverId = serverId
    self.allowAllTools = allowAllTools
    self.allowedTools = allowedTools
  }
}
