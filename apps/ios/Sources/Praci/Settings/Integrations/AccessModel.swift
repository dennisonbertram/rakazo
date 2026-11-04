import Foundation
import Observation
import RakazoAPI

private struct BotRef: Encodable, Sendable { let botId: String }
private struct ConnectionRef: Encodable, Sendable { let connectionId: String }
private struct SetAccessInput: Encodable, Sendable {
  let connectionId: String
  let allAgents: Bool
  let botIds: [String]
}
private struct SetExclusiveInput: Encodable, Sendable {
  let connectionId: String
  let exclusive: Bool
}
private struct ServerExclusiveInput: Encodable, Sendable {
  let serverId: String
  let exclusive: Bool
}
private struct ServerWritesInput: Encodable, Sendable {
  let id: String
  let enabled: Bool
}
private struct ReplaceInput: Encodable, Sendable {
  struct Entry: Encodable, Sendable {
    let serverId: String
    let allowAllTools: Bool
    let allowedTools: [String]
  }
  let botId: String
  let assignments: [Entry]
}

/// Procedure calls shared by the account, server and agent Access lists.
@MainActor
enum AccessClient {
  static func agents(_ app: AppModel) async throws -> [AccessAgent] {
    let all: [AccessAgent] = try await app.call("bots/list")
    return all.filter { $0.archivedAt == nil }
  }

  static func access(_ app: AppModel, connection: String) async throws -> ConnectionAccess {
    try await app.call("connections/access", input: ConnectionRef(connectionId: connection))
  }

  static func effective(_ app: AppModel) async throws -> [String: EffectiveAccess] {
    try await app.call("connections/effectiveAccess")
  }

  static func setAccess(_ app: AppModel, connection: String, _ grant: AccessGrant) async throws {
    let _: ConnectionAccess = try await app.call(
      "connections/setAccess",
      input: SetAccessInput(
        connectionId: connection, allAgents: grant.allAgents, botIds: grant.botIds))
  }

  /// Switches one agent on or off for one account.
  /// ponytail: reads the grant and writes it back, which can lose a concurrent change. The server
  /// is adding `connections.setAgentAccess({ connectionId, botId, on })`; swap this body for it.
  static func setAgentAccess(
    _ app: AppModel, connection: String, botID: String, on: Bool, allBotIDs: [String]
  ) async throws {
    let current = try await access(app, connection: connection)
    let next = AccessLogic.toggled(current.grant, allBotIDs: allBotIDs, botID: botID, on: on)
    try await setAccess(app, connection: connection, next)
  }

  static func servers(_ app: AppModel) async throws -> [McpServer] {
    try await app.call("mcp/servers/list")
  }

  /// Gives one agent a server or takes it away.
  /// ponytail: `replace` overwrites the agent's whole list, so this reads it first and can lose a
  /// concurrent change. The server is adding `mcp.servers.setAgentAssignment({ serverId, botId, on })`.
  static func assign(_ app: AppModel, botID: String, serverID: String, on: Bool) async throws {
    let current: [McpAssignment] = try await app.call(
      "mcp/assignments/list", input: BotRef(botId: botID))
    var entries = current.filter { $0.serverId != serverID }.map(entry)
    if on {
      let kept = current.first { $0.serverId == serverID }
      entries.append(kept.map(entry) ?? .init(serverId: serverID, allowAllTools: true, allowedTools: []))
    }
    let _: [McpAssignment] = try await app.call(
      "mcp/assignments/replace", input: ReplaceInput(botId: botID, assignments: entries))
  }

  private static func entry(_ item: McpAssignment) -> ReplaceInput.Entry {
    .init(serverId: item.serverId, allowAllTools: item.allowAllTools, allowedTools: item.allowedTools)
  }

  static func assigned(_ app: AppModel, botID: String) async throws -> Set<String> {
    let list: [McpAssignment] = try await app.call(
      "mcp/assignments/list", input: BotRef(botId: botID))
    return Set(list.map(\.serverId))
  }

  static func setShared(_ app: AppModel, connection: String, shared: Bool) async throws {
    let _: Connection = try await app.call(
      "connections/setExclusive",
      input: SetExclusiveInput(connectionId: connection, exclusive: !shared))
  }

  static func setServerShared(_ app: AppModel, server: McpServer, shared: Bool) async throws {
    let _: McpServer = try await app.call(
      "integrationAgents/setExclusive",
      input: ServerExclusiveInput(serverId: server.id, exclusive: !shared))
    // Other agents' rows stay on the server, so turning sharing back on restores them.
    if !shared, let owner = server.agentBotId,
      !(try await assigned(app, botID: owner)).contains(server.id)
    {
      try await assign(app, botID: owner, serverID: server.id, on: true)
    }
  }

  static func setServerWrites(_ app: AppModel, server: String, enabled: Bool) async throws {
    let _: McpServer = try await app.call(
      "mcp/servers/setWrites", input: ServerWritesInput(id: server, enabled: enabled))
  }
}

/// What one account or server lets agents do: the Access list on its detail screen.
@MainActor
@Observable
final class AccessModel {
  enum Subject: Equatable {
    case connection(id: String, ownerBotID: String?)
    case server(McpServer)

    var ownerBotID: String? {
      switch self {
      case .connection(_, let owner): owner
      case .server(let server): server.agentBotId
      }
    }
  }

  enum Phase: Equatable {
    case loading
    case loaded
    case failed(String)
  }

  let subject: Subject
  private(set) var phase = Phase.loading
  private(set) var agents: [AccessAgent] = []
  private(set) var on: Set<String> = []
  private(set) var grant = AccessGrant(allAgents: true, botIds: [])
  /// "Let other agents use it": only meaningful when the subject has its own agent.
  private(set) var shared = true
  private(set) var saving = false
  private(set) var layout = AccessLogic.Layout(owner: nil, chats: [], others: [])
  var error: String?
  var query = "" { didSet { arrange() } }
  var filter = AccessLogic.Filter.all { didSet { arrange() } }

  init(subject: Subject) { self.subject = subject }

  /// For previews and tests: a loaded model without a server.
  init(
    subject: Subject, agents: [AccessAgent], on: Set<String>, grant: AccessGrant, shared: Bool
  ) {
    self.subject = subject
    self.agents = agents
    self.on = on
    self.grant = grant
    self.shared = shared
    phase = .loaded
    arrange()
  }

  var hasOwner: Bool { subject.ownerBotID != nil }
  /// With its own agent an account lists agents only while it is shared.
  var showsList: Bool { !hasOwner || shared }
  var showsControls: Bool { agents.count > AccessLogic.controlsMinimum }
  private var allBotIDs: [String] { agents.map(\.id) }
  private var keptIDs: [String] {
    AccessLogic.keptIDs(agents: agents, ownerID: subject.ownerBotID)
  }

  var everyone: Bool { grant.allAgents }
  var noneOn: Bool {
    agents.allSatisfy { keptIDs.contains($0.id) || !on.contains($0.id) }
  }

  func isOn(_ agent: AccessAgent) -> Bool { on.contains(agent.id) }

  func load(_ app: AppModel) async {
    phase = .loading
    do {
      agents = try await AccessClient.agents(app)
      try await fetch(app)
      phase = .loaded
      arrange()
    } catch {
      phase = .failed(settingsErrorText(error))
    }
  }

  /// Reads the stored state again without moving any row.
  private func fetch(_ app: AppModel) async throws {
    switch subject {
    case .connection(let id, _):
      async let access = AccessClient.access(app, connection: id)
      async let effective = AccessClient.effective(app)
      let stored = try await access
      grant = stored.grant
      shared = stored.agentShared
      on = Set(try await effective[id]?.botIds ?? agents.map(\.id))
    case .server(let server):
      let all: [McpAssignment] = try await app.call("mcp/assignments/all")
      var next = Set(all.filter { $0.serverId == server.id }.map(\.botId))
      if let owner = server.agentBotId { next.insert(owner) }
      on = next
      if let fresh = try await AccessClient.servers(app).first(where: { $0.id == server.id }) {
        shared = !fresh.agentExclusive
      }
    }
  }

  private func arrange() {
    layout = AccessLogic.layout(
      agents: agents, ownerID: subject.ownerBotID, on: on,
      query: showsControls ? query : "", filter: showsControls ? filter : .all)
  }

  func toggle(_ app: AppModel, _ agent: AccessAgent, on next: Bool) async {
    guard agent.id != subject.ownerBotID else { return }
    await save(app) {
      self.setLocal([agent.id], next)
      try await self.write(app, agents: [agent.id], on: next)
    }
  }

  func toggleChats(_ app: AppModel, on next: Bool) async {
    let ids = layout.chats.map(\.id)
    await save(app) {
      self.setLocal(ids, next)
      try await self.write(app, agents: ids, on: next)
    }
  }

  func setAll(_ app: AppModel, on next: Bool) async {
    let keep = Set(keptIDs)
    let ids = agents.map(\.id).filter { !keep.contains($0) }
    let changing = ids.filter { on.contains($0) != next }
    await save(app) {
      self.setLocal(ids, next)
      switch self.subject {
      case .connection(let id, _):
        let value = AccessLogic.setOthers(
          self.grant, allBotIDs: self.allBotIDs, keep: self.keptIDs, on: next)
        try await AccessClient.setAccess(app, connection: id, value)
      case .server:
        for id in changing { try await self.write(app, agents: [id], on: next) }
      }
    }
  }

  func setShared(_ app: AppModel, _ value: Bool) async {
    await save(app) {
      self.shared = value
      switch self.subject {
      case .connection(let id, _): try await AccessClient.setShared(app, connection: id, shared: value)
      case .server(let server): try await AccessClient.setServerShared(app, server: server, shared: value)
      }
    }
  }

  private func setLocal(_ ids: [String], _ next: Bool) {
    if next { on.formUnion(ids) } else { on.subtract(ids) }
  }

  private func write(_ app: AppModel, agents ids: [String], on next: Bool) async throws {
    switch subject {
    case .connection(let id, _):
      for botID in ids {
        try await AccessClient.setAgentAccess(
          app, connection: id, botID: botID, on: next, allBotIDs: allBotIDs)
      }
    case .server(let server):
      for botID in ids { try await AccessClient.assign(app, botID: botID, serverID: server.id, on: next) }
    }
  }

  /// Shows the change at once. If the save fails, the switch goes back and the error shows.
  private func save(_ app: AppModel, _ work: @escaping () async throws -> Void) async {
    guard !saving else { return }
    saving = true
    error = nil
    let (before, sharedBefore) = (on, shared)
    do {
      try await work()
    } catch {
      (on, shared) = (before, sharedBefore)
      self.error = settingsErrorText(error)
    }
    // Rows stay where they are; only the switches follow the server.
    try? await fetch(app)
    saving = false
  }
}
