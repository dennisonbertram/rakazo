import Foundation

/// `rpc_models_list` item: one model in the provider catalog.
public struct ModelOption: Sendable, Hashable, Decodable, Identifiable {
  public let provider: String
  public let providerName: String
  public let id: String
  public let label: String
  public let auth: String
  public let oauthLabel: String?
  public let signIn: String?
  public let thinkingLevels: [String]
  public let placeholder: Bool

  public var key: String { "\(provider)/\(id)" }
  public var supportsSignIn: Bool { oauthLabel != nil && auth != "api-key" }
  public var supportsKey: Bool { auth != "oauth" }

  private enum CodingKeys: String, CodingKey {
    case provider, providerName, id, label, auth, oauthLabel, signIn, thinkingLevels, placeholder
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    provider = try c.decode(String.self, forKey: .provider)
    providerName = try c.decodeIfPresent(String.self, forKey: .providerName) ?? provider
    id = try c.decode(String.self, forKey: .id)
    label = try c.decodeIfPresent(String.self, forKey: .label) ?? id
    auth = try c.decodeIfPresent(String.self, forKey: .auth) ?? "api-key"
    oauthLabel = try c.decodeIfPresent(String.self, forKey: .oauthLabel)
    signIn = try c.decodeIfPresent(String.self, forKey: .signIn)
    thinkingLevels = try c.decodeIfPresent([String].self, forKey: .thinkingLevels) ?? []
    placeholder = try c.decodeIfPresent(Bool.self, forKey: .placeholder) ?? false
  }
}

/// `rpc_models_credentials` item (also the output of `rpc_models_connect`): a connected provider.
public struct ModelCredential: Sendable, Hashable, Decodable, Identifiable {
  public let id: String
  public let provider: String
  public let label: String
  public let hasKey: Bool
  public let isDefault: Bool
  public let modelId: String?
  public let thinkingLevel: String?
  public let baseUrl: String?

  private enum CodingKeys: String, CodingKey {
    case id, provider, label, hasKey, isDefault, modelId, thinkingLevel, baseUrl
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    provider = try c.decode(String.self, forKey: .provider)
    label = try c.decodeIfPresent(String.self, forKey: .label) ?? provider
    hasKey = try c.decodeIfPresent(Bool.self, forKey: .hasKey) ?? false
    isDefault = try c.decodeIfPresent(Bool.self, forKey: .isDefault) ?? false
    modelId = try c.decodeIfPresent(String.self, forKey: .modelId)
    thinkingLevel = try c.decodeIfPresent(String.self, forKey: .thinkingLevel)
    baseUrl = try c.decodeIfPresent(String.self, forKey: .baseUrl)
  }
}

/// `rpc_models_beginOAuth` output. `userCode` is set for the device-code mode only.
public struct ModelOAuthBegin: Sendable, Decodable {
  public let loginId: String
  public let verificationUri: String
  public let expiresInSeconds: Int
  public let mode: String
  public let userCode: String?

  public var needsPastedCode: Bool { mode == "auth-url" }
}

/// `rpc_models_completeOAuth` output.
public struct ModelOAuthStatus: Sendable, Decodable {
  public let status: String
  public let error: String?
}

/// `{ ok: true }` outputs of the disconnect, revoke and remove procedures.
public struct OKResult: Sendable, Decodable {
  public let ok: Bool
}

/// `rpc_models_probeOpenAiCompatible` output.
public struct ProbedModels: Sendable, Decodable {
  public let models: [String]
}

/// `rpc_connections_catalog` item.
public struct ConnectorEntry: Sendable, Hashable, Decodable, Identifiable {
  public let connectorId: String
  public let slug: String
  public let name: String
  public let connected: Bool
  public let description: String?
  public let category: String

  public var id: String { "\(connectorId)/\(slug)" }

  private enum CodingKeys: String, CodingKey {
    case connectorId, slug, name, connected, description, category
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    connectorId = try c.decode(String.self, forKey: .connectorId)
    slug = try c.decode(String.self, forKey: .slug)
    name = try c.decodeIfPresent(String.self, forKey: .name) ?? slug
    connected = try c.decodeIfPresent(Bool.self, forKey: .connected) ?? false
    description = try c.decodeIfPresent(String.self, forKey: .description)
    category = try c.decodeIfPresent(String.self, forKey: .category) ?? "other"
  }
}

/// `rpc_connections_list` item; also the output of `rpc_connections_complete` and `_setWrites`.
public struct Connection: Sendable, Hashable, Decodable, Identifiable {
  public let id: String
  public let connectorId: String
  public let provider: String
  public let displayName: String
  public let status: String
  public let error: String?
  public let needsReconnect: Bool
  public let writesEnabled: Bool

  public var isConnected: Bool { status == "connected" }
  public var isPending: Bool { status == "pending" }

  private enum CodingKeys: String, CodingKey {
    case id, connectorId, provider, displayName, status, error, needsReconnect, writesEnabled
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    connectorId = try c.decodeIfPresent(String.self, forKey: .connectorId) ?? ""
    provider = try c.decodeIfPresent(String.self, forKey: .provider) ?? ""
    displayName = try c.decodeIfPresent(String.self, forKey: .displayName) ?? provider
    status = try c.decodeIfPresent(String.self, forKey: .status) ?? "error"
    error = try c.decodeIfPresent(String.self, forKey: .error)
    needsReconnect = try c.decodeIfPresent(Bool.self, forKey: .needsReconnect) ?? false
    writesEnabled = try c.decodeIfPresent(Bool.self, forKey: .writesEnabled) ?? false
  }
}

/// `rpc_connections_begin` output. `authorizationUrl` is nil when no sign-in page is needed.
public struct ConnectionBegin: Sendable, Decodable {
  public let connectionId: String
  public let authorizationUrl: String?
}

/// `rpc_approvalRules_list` item; also the output of `rpc_approvalRules_set`.
public struct ApprovalRule: Sendable, Hashable, Decodable, Identifiable {
  public let id: String
  public let effect: String
  public let matchKind: String
  public let matchValue: String
  public let botId: String?

  private enum CodingKeys: String, CodingKey { case id, effect, matchKind, matchValue, botId }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    effect = try c.decodeIfPresent(String.self, forKey: .effect) ?? "require_approval"
    matchKind = try c.decodeIfPresent(String.self, forKey: .matchKind) ?? "tool"
    matchValue = try c.decodeIfPresent(String.self, forKey: .matchValue) ?? ""
    botId = try c.decodeIfPresent(String.self, forKey: .botId)
  }
}

/// `rpc_autoReview_get` and `_set` output.
public struct AutoReview: Sendable, Decodable {
  public let enabled: Bool
  public let checkerAvailable: Bool
}

/// One provider in the catalog with its models, in the order the server lists them.
public struct ModelProvider: Sendable, Hashable, Identifiable {
  public let id: String
  public let name: String
  public let models: [ModelOption]

  public init(id: String, name: String, models: [ModelOption]) {
    self.id = id
    self.name = name
    self.models = models
  }

  public var supportsSignIn: Bool { models.first?.supportsSignIn ?? false }
  public var supportsKey: Bool { models.first?.supportsKey ?? true }
  public var signInLabel: String { models.first?.oauthLabel ?? name }
  /// Local servers are connected through their own form, not the provider list.
  public var isLocalServer: Bool { models.first?.placeholder ?? false }
}

extension [ModelOption] {
  public var providers: [ModelProvider] {
    var order: [String] = []
    var grouped: [String: [ModelOption]] = [:]
    for option in self {
      if grouped[option.provider] == nil { order.append(option.provider) }
      grouped[option.provider, default: []].append(option)
    }
    return order.map { id in
      let models = grouped[id] ?? []
      return ModelProvider(id: id, name: models.first?.providerName ?? id, models: models)
    }
  }
}

extension [ModelProvider] {
  /// The sign-in providers, most common subscription first, then the rest in catalog order.
  public var signInProviders: [ModelProvider] {
    let preferred = ["openai-codex", "anthropic", "github-copilot", "xai"]
    let all = filter(\.supportsSignIn)
    let lead = preferred.compactMap { id in all.first { $0.id == id } }
    return lead + all.filter { !preferred.contains($0.id) }
  }
}
