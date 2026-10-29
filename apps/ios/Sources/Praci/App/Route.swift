import Foundation

enum ThreadTarget: Hashable, Sendable {
  case bot(String)
  case group(String)
}

enum Route: Hashable, Sendable {
  case thread(ThreadTarget)
  case inbox
  case inboxMessage(messageID: String)
  case computer(botID: String)
  case artifacts(botID: String)
  case artifact(artifactID: String)
  case agentPage(botID: String)
  case routines(botID: String)
  case routine(routineID: String)
  case botSettings(botID: String)
  case groupSettings(groupID: String)
  case finance
  case legal
  case capTable
  case dataRoom

  /// Accepts only `rakazo://open/...`; any other URL (including `rakazo://sign-in`) is ignored.
  init?(url: URL) {
    guard url.scheme == "rakazo", url.host() == "open" else { return nil }
    let parts = Array(url.pathComponents.dropFirst().filter { $0 != "/" })
    guard parts.count <= 3 else { return nil }
    switch (parts.first, parts.dropFirst().first, parts.dropFirst(2).first) {
    case ("inbox", nil, nil): self = .inbox
    case ("finance", nil, nil): self = .finance
    case ("legal", nil, nil): self = .legal
    case ("cap-table", nil, nil): self = .capTable
    case ("data-room", nil, nil): self = .dataRoom
    case ("inbox", let id?, nil): self = .inboxMessage(messageID: id)
    case ("bot", let id?, nil): self = .thread(.bot(id))
    case ("group", let id?, nil): self = .thread(.group(id))
    case ("artifact", let id?, nil): self = .artifact(artifactID: id)
    case ("routine", let id?, nil): self = .routine(routineID: id)
    case ("bot", let id?, "computer"): self = .computer(botID: id)
    case ("bot", let id?, "artifacts"): self = .artifacts(botID: id)
    case ("bot", let id?, "page"): self = .agentPage(botID: id)
    case ("bot", let id?, "routines"): self = .routines(botID: id)
    case ("bot", let id?, "settings"): self = .botSettings(botID: id)
    case ("group", let id?, "settings"): self = .groupSettings(groupID: id)
    default: return nil
    }
  }
}
