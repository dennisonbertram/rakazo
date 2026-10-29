import Foundation

/// One agent as returned by `rpc_bots_get` and `rpc_bots_create`. The fields the settings screen edits.
public struct BotDetail: Sendable, Identifiable, Hashable, Decodable {
  public let id: String
  public let name: String
  public let title: String
  /// `#RRGGBB`.
  public let color: String?
  public let pinned: Bool
  public let sectionId: String?
  public let autoSpeak: Bool
  public let archivedAt: String?
  public let threadId: String?

  private enum CodingKeys: String, CodingKey {
    case id, name, title, color, pinned, sectionId, autoSpeak, archivedAt, threadId
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    name = try c.decode(String.self, forKey: .name)
    title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
    color = try c.decodeIfPresent(String.self, forKey: .color)
    pinned = try c.decodeIfPresent(Bool.self, forKey: .pinned) ?? false
    sectionId = try c.decodeIfPresent(String.self, forKey: .sectionId)
    autoSpeak = try c.decodeIfPresent(Bool.self, forKey: .autoSpeak) ?? false
    archivedAt = try c.decodeIfPresent(String.self, forKey: .archivedAt)
    threadId = try c.decodeIfPresent(String.self, forKey: .threadId)
  }
}

/// The bot colours the web app offers for a new agent.
public enum BotPalette {
  public static let colors = [
    "#3B82F6", "#3EC5A8", "#6A6BF5", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6",
  ]
}
